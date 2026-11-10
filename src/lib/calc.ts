import type { BomData, ID, Order, Part } from './types'
import { today } from './types'

export function toIls(data: BomData, amount: number, currency: string, rate?: number) {
  if (!amount) return 0
  const r = rate ?? data.settings.fx[currency] ?? 1
  return amount * r
}

export const fmtMoney = (v: number | null | undefined, cur = 'ILS') => {
  if (v == null || Number.isNaN(v)) return '—'
  try {
    const a = Math.abs(v)
    const digits = v === 0 || a >= 10 ? 0 : a < 1 ? 4 : 2 // small per-piece prices (e.g. screws) keep their precision
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: digits ? 2 : 0, maximumFractionDigits: digits }).format(v)
  } catch {
    return `${v.toFixed(2)} ${cur}`
  }
}
export const fmtNum = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(v)

export function indexes(data: BomData) {
  const partById = new Map(data.parts.map((p) => [p.id, p]))
  const children = new Map<ID, { lineId: ID; childId: ID; qty: number }[]>()
  const parents = new Map<ID, { lineId: ID; parentId: ID; qty: number }[]>()
  for (const l of data.bom) {
    if (!children.has(l.parentId)) children.set(l.parentId, [])
    children.get(l.parentId)!.push({ lineId: l.id, childId: l.childId, qty: l.qty })
    if (!parents.has(l.childId)) parents.set(l.childId, [])
    parents.get(l.childId)!.push({ lineId: l.id, parentId: l.parentId, qty: l.qty })
  }
  const supplierById = new Map(data.suppliers.map((s) => [s.id, s]))
  return { partById, children, parents, supplierById }
}
export type Idx = ReturnType<typeof indexes>

/** Would adding child under parent create a loop? */
export function createsCycle(idx: Idx, parentId: ID, childId: ID): boolean {
  if (parentId === childId) return true
  const stack = [childId]
  const seen = new Set<ID>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === parentId) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const c of idx.children.get(id) ?? []) stack.push(c.childId)
  }
  return false
}

/** Actual landed unit cost (ILS) per part, from the most recently received order line.
 *  Shipping/fees are allocated across the order's lines by value. */
export function actualCosts(data: BomData) {
  const result = new Map<ID, { unitIls: number; date: string; orderNumber: string }>()
  const orders = data.orders
    .filter((o) => o.lines.some((l) => l.qtyReceived > 0))
    .sort((a, b) => (a.receivedDate || a.orderDate).localeCompare(b.receivedDate || b.orderDate))
  for (const o of orders) {
    const goods = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
    const shipFactor = goods > 0 ? 1 + (o.shipping || 0) / goods : 1
    for (const l of o.lines) {
      if (l.qtyReceived <= 0) continue
      result.set(l.partId, {
        unitIls: l.unitPrice * shipFactor * (o.fxToIls || data.settings.fx[o.currency] || 1),
        date: o.receivedDate || o.orderDate,
        orderNumber: o.number,
      })
    }
  }
  return result
}

export interface CostInfo {
  planned: number // ILS per unit (rolled up for assemblies)
  actual: number // ILS per unit, actual where known, planned as fallback
  actualCoverage: number // 0..1 share of planned value that has actual cost data
}

export function rollupCosts(data: BomData, idx: Idx, actual: ReturnType<typeof actualCosts>) {
  const memo = new Map<ID, CostInfo>()
  const visit = (id: ID, depth = 0): CostInfo => {
    if (memo.has(id)) return memo.get(id)!
    const p = idx.partById.get(id)
    if (!p || depth > 50) return { planned: 0, actual: 0, actualCoverage: 0 }
    const kids = idx.children.get(id) ?? []
    const own = toIls(data, p.plannedCost, p.currency)
    let info: CostInfo
    if (kids.length === 0) {
      const a = actual.get(id)
      info = { planned: own, actual: a ? a.unitIls : own, actualCoverage: a ? 1 : 0 }
    } else {
      // assembly: children + own cost (e.g. labour/processing)
      let planned = own
      let act = own
      let covered = 0
      for (const k of kids) {
        const c = visit(k.childId, depth + 1)
        planned += c.planned * k.qty
        act += c.actual * k.qty
        covered += c.planned * k.qty * c.actualCoverage
      }
      info = { planned, actual: act, actualCoverage: planned > 0 ? covered / planned : 0 }
    }
    memo.set(id, info)
    return info
  }
  for (const p of data.parts) visit(p.id)
  return memo
}

export const OPEN_STATUSES = ['ordered', 'shipped', 'partial'] as const

export function isOpen(o: Order) {
  return (OPEN_STATUSES as readonly string[]).includes(o.status)
}
export function isLate(o: Order) {
  return isOpen(o) && !!o.expectedDate && o.expectedDate < today()
}

export function onOrderQty(data: BomData) {
  const m = new Map<ID, number>()
  for (const o of data.orders) {
    if (!isOpen(o)) continue
    for (const l of o.lines) m.set(l.partId, (m.get(l.partId) ?? 0) + Math.max(0, l.qty - l.qtyReceived))
  }
  return m
}

export function orderValueIls(data: BomData, o: Order) {
  const goods = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  return (goods + (o.shipping || 0)) * (o.fxToIls || data.settings.fx[o.currency] || 1)
}

/** Explode an assembly down to leaf parts: total qty of each leaf per one top-level unit. */
export function explode(idx: Idx, topId: ID) {
  const need = new Map<ID, number>()
  const walk = (id: ID, mult: number, depth: number) => {
    const kids = idx.children.get(id) ?? []
    if (kids.length === 0 || depth > 50) {
      if (id !== topId) need.set(id, (need.get(id) ?? 0) + mult)
      return
    }
    for (const k of kids) walk(k.childId, mult * k.qty, depth + 1)
  }
  walk(topId, 1, 0)
  return need
}

export interface ShortageRow {
  part: Part
  perUnit: number
  required: number
  onHand: number
  onOrder: number
  shortNow: number // required - onHand
  shortAfterOrders: number // required - onHand - onOrder
}

export function buildCheck(data: BomData, idx: Idx, topId: ID, units: number, includeSpares: boolean) {
  const per = explode(idx, topId)
  const ordered = onOrderQty(data)
  const rows: ShortageRow[] = []
  let canBuild = Infinity
  for (const [id, perUnit] of per) {
    const part = idx.partById.get(id)
    if (!part) continue
    const required = perUnit * units + (includeSpares ? part.sparesTarget : 0)
    const onHand = part.onHand
    const onOrder = ordered.get(id) ?? 0
    if (perUnit > 0) canBuild = Math.min(canBuild, Math.floor(onHand / perUnit))
    rows.push({
      part,
      perUnit,
      required,
      onHand,
      onOrder,
      shortNow: Math.max(0, required - onHand),
      shortAfterOrders: Math.max(0, required - onHand - onOrder),
    })
  }
  rows.sort((a, b) => b.shortAfterOrders - a.shortAfterOrders || b.shortNow - a.shortNow || a.part.pn.localeCompare(b.part.pn))
  return { rows, canBuild: per.size === 0 ? 0 : canBuild === Infinity ? 0 : canBuild }
}

export type Availability = 'in-stock' | 'expected' | 'short'
export function availability(r: Pick<ShortageRow, 'shortNow' | 'shortAfterOrders'>): Availability {
  if (r.shortNow === 0) return 'in-stock'
  if (r.shortAfterOrders === 0) return 'expected'
  return 'short'
}

export type StockState = 'ok' | 'low' | 'out'
export function stockState(p: Part): StockState {
  if (p.onHand <= 0 && (p.minStock > 0 || p.sparesTarget > 0)) return 'out'
  if (p.onHand < Math.max(p.minStock, p.sparesTarget)) return 'low'
  return 'ok'
}

export function nextPn(data: BomData, prefix: string) {
  let max = 0
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  for (const p of data.parts) {
    const m = p.pn.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(5, '0')}`
}

export function nextPoNumber(data: BomData) {
  let max = 0
  for (const o of data.orders) {
    const m = o.number.match(/(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `PO-${String(max + 1).padStart(4, '0')}`
}

export function isAssembly(idx: Idx, id: ID) {
  return (idx.children.get(id)?.length ?? 0) > 0
}

// ---------- weight ----------
export interface WeightInfo {
  grams: number // per one unit (rolled up for assemblies)
  missing: number // number of leaf BOM lines below this with no weight entered
}

/** Rolled-up weight per part. Leaf parts use their own weight; assemblies add their children
 *  (× qty) plus any extra weight entered on the assembly itself. */
export function rollupWeights(data: BomData, idx: Idx) {
  const memo = new Map<ID, WeightInfo>()
  const visit = (id: ID, depth = 0): WeightInfo => {
    if (memo.has(id)) return memo.get(id)!
    const p = idx.partById.get(id)
    if (!p || depth > 50) return { grams: 0, missing: 0 }
    const kids = idx.children.get(id) ?? []
    const own = p.weight ?? 0
    let info: WeightInfo
    if (kids.length === 0) info = { grams: own, missing: p.weight == null ? 1 : 0 }
    else {
      let grams = own
      let missing = 0
      for (const k of kids) {
        const c = visit(k.childId, depth + 1)
        grams += c.grams * k.qty
        missing += c.missing
      }
      info = { grams, missing }
    }
    memo.set(id, info)
    return info
  }
  for (const p of data.parts) visit(p.id)
  return memo
}

export function fmtWeight(g: number | null | undefined) {
  if (g == null || Number.isNaN(g)) return '—'
  if (Math.abs(g) >= 1000) return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(g / 1000)} kg`
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: Math.abs(g) < 10 ? 2 : 1 }).format(g)} g`
}

// ---------- packs ----------
export const isPacked = (p: Part) => !!p.packQty && p.packQty > 1
/** Round a quantity of pieces up to whole packs. */
export const roundToPacks = (p: Part, pieces: number) => (isPacked(p) ? Math.ceil(pieces / p.packQty!) * p.packQty! : Math.ceil(pieces))
