// Lightweight quality system: configuration control, build traceability, approved suppliers, nonconformances.
import type { Draft } from 'immer'
import type { BomData, Build, BuildItem, ID, Ncr, Part, Release, Supplier } from './types'
import { today, uid } from './types'
import { explode, type Idx } from './calc'

// ---------- configuration control ----------

/** Next revision letter or number: A→B, Z→AA, 1→2, 09→10. */
export function nextRev(rev: string) {
  const r = (rev || '').trim()
  if (!r) return 'A'
  if (/^\d+$/.test(r)) return String(parseInt(r, 10) + 1).padStart(r.length, '0')
  if (/^[A-Z]+$/i.test(r)) {
    const up = r.toUpperCase().split('')
    let i = up.length - 1
    while (i >= 0) {
      if (up[i] !== 'Z') {
        up[i] = String.fromCharCode(up[i].charCodeAt(0) + 1)
        return up.join('')
      }
      up[i] = 'A'
      i--
    }
    return 'A' + up.join('')
  }
  return r + '.1'
}

/** Changes a part's revision and records why in its revision log. */
export function revisePart(p: Draft<Part> | Part, toRev: string, change: string, reason: string, source: 'manual' | 'inventor' = 'manual') {
  if (!p.revisions) p.revisions = []
  p.revisions.push({ id: uid(), date: today(), fromRev: p.rev, toRev, change, reason, source })
  p.rev = toRev
}

/** Freezes an assembly's current structure (every level) with each part's revision. */
export function snapshotLines(idx: Idx, assemblyId: ID): Release['lines'] {
  const out: Release['lines'] = []
  const walk = (id: ID, depth: number) => {
    const parent = idx.partById.get(id)
    if (!parent || depth > 50) return
    const kids = [...(idx.children.get(id) ?? [])].sort((a, b) => (idx.partById.get(a.childId)?.pn ?? '').localeCompare(idx.partById.get(b.childId)?.pn ?? ''))
    for (const k of kids) {
      const c = idx.partById.get(k.childId)
      if (!c) continue
      out.push({ parentPn: parent.pn, pn: c.pn, name: c.name, rev: c.rev, qty: k.qty })
      walk(k.childId, depth + 1)
    }
  }
  walk(assemblyId, 0)
  return out
}

export interface ConfigDiff {
  added: Release['lines']
  removed: Release['lines']
  qtyChanged: { parentPn: string; pn: string; name: string; from: number; to: number }[]
  revChanged: { pn: string; name: string; from: string; to: string }[]
}

/** What changed between a released configuration and another set of lines (usually the current BOM). */
export function diffConfig(released: Release['lines'], current: Release['lines']): ConfigDiff {
  const key = (l: Release['lines'][number]) => `${l.parentPn}>${l.pn}`
  const a = new Map(released.map((l) => [key(l), l]))
  const b = new Map(current.map((l) => [key(l), l]))
  const added = current.filter((l) => !a.has(key(l)))
  const removed = released.filter((l) => !b.has(key(l)))
  const qtyChanged = current
    .filter((l) => a.has(key(l)) && a.get(key(l))!.qty !== l.qty)
    .map((l) => ({ parentPn: l.parentPn, pn: l.pn, name: l.name, from: a.get(key(l))!.qty, to: l.qty }))
  const revA = new Map(released.map((l) => [l.pn, l]))
  const seen = new Set<string>()
  const revChanged: ConfigDiff['revChanged'] = []
  for (const l of current) {
    const r = revA.get(l.pn)
    if (r && r.rev !== l.rev && !seen.has(l.pn)) {
      seen.add(l.pn)
      revChanged.push({ pn: l.pn, name: l.name, from: r.rev, to: l.rev })
    }
  }
  return { added, removed, qtyChanged, revChanged }
}
export const diffCount = (d: ConfigDiff) => d.added.length + d.removed.length + d.qtyChanged.length + d.revChanged.length

export function latestRelease(data: BomData, assemblyId: ID) {
  const list = data.releases.filter((r) => r.assemblyId === assemblyId)
  return list.length ? list[list.length - 1] : null
}

// ---------- builds and traceability ----------

export function nextBuildSerial(data: BomData, prefix = 'SN') {
  let max = 0
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  for (const b of data.builds) {
    const m = b.serial.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

/** The most recent received order (lot) a part came from, as a sensible default for a build. */
export function defaultLot(data: BomData, partId: ID): ID | null {
  const received = data.orders
    .filter((o) => o.lines.some((l) => l.partId === partId && l.qtyReceived > 0))
    .sort((a, b) => (b.receivedDate || b.orderDate || '').localeCompare(a.receivedDate || a.orderDate || ''))
  return received[0]?.id ?? null
}

/** Orders a part has been received from (candidate lots), newest first. */
export function lotsFor(data: BomData, partId: ID) {
  return data.orders
    .filter((o) => o.lines.some((l) => l.partId === partId && l.qtyReceived > 0))
    .sort((a, b) => (b.receivedDate || b.orderDate || '').localeCompare(a.receivedDate || a.orderDate || ''))
}

/** One traceability line per part needed for one unit of the assembly. */
export function buildItemsFor(data: BomData, idx: Idx, assemblyId: ID): BuildItem[] {
  return [...explode(idx, assemblyId).entries()]
    .map(([partId, qty]) => ({ partId, qty, part: idx.partById.get(partId)! }))
    .filter((x) => x.part)
    .sort((a, b) => a.part.pn.localeCompare(b.part.pn))
    .map(({ partId, qty, part }) => ({
      id: uid(),
      partId,
      qty,
      lotOrderId: defaultLot(data, partId),
      serials: part.serialized ? Array.from({ length: Math.max(1, Math.round(qty)) }, () => '') : [],
    }))
}

/** Which built units contain a part, and from which lot (for recalls and diligence questions). */
export function buildsUsingPart(data: BomData, partId: ID) {
  return data.builds.flatMap((b) => b.items.filter((i) => i.partId === partId).map((item) => ({ build: b, item })))
}
export function buildsUsingOrder(data: BomData, orderId: ID) {
  return data.builds.flatMap((b) => b.items.filter((i) => i.lotOrderId === orderId).map((item) => ({ build: b, item })))
}

/** Missing traceability on a build: unknown lots and empty serial numbers. */
export function buildGaps(data: BomData, b: Build) {
  const partById = new Map(data.parts.map((p) => [p.id, p]))
  let noLot = 0
  let noSerial = 0
  for (const i of b.items) {
    if (!i.lotOrderId) noLot++
    if (partById.get(i.partId)?.serialized && (i.serials.length === 0 || i.serials.some((s) => !s.trim()))) noSerial++
  }
  return { noLot, noSerial }
}

// ---------- nonconformances ----------

export function nextNcrNumber(data: BomData) {
  let max = 0
  for (const n of data.ncrs) {
    const m = n.number.match(/(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `NCR-${String(max + 1).padStart(4, '0')}`
}

export function newNcr(data: BomData, links: Partial<Pick<Ncr, 'partId' | 'orderId' | 'supplierId' | 'buildId'>> = {}): Ncr {
  // Fill in the supplier from the order when possible.
  const order = links.orderId ? data.orders.find((o) => o.id === links.orderId) : undefined
  return {
    id: uid(), number: nextNcrNumber(data), date: today(), title: '', description: '', severity: 'minor',
    partId: links.partId ?? null, orderId: links.orderId ?? null, supplierId: links.supplierId ?? order?.supplierId ?? null, buildId: links.buildId ?? null,
    qtyAffected: null, disposition: 'pending', rootCause: '', correctiveAction: '', status: 'open', closedOn: '', files: [],
  }
}

export const ncrsFor = (data: BomData, f: (n: Ncr) => boolean) => data.ncrs.filter(f)

// ---------- approved supplier list ----------

export const isApproved = (s: Supplier | undefined) => s?.aslStatus === 'approved'
export const reviewOverdue = (s: Supplier) => !!s.reviewDue && s.reviewDue < today()
