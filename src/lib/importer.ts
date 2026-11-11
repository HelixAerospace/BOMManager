// Import a BOM exported from Autodesk Inventor (BOM › Export Bill of Materials › .csv).
// Works with the Structured (all levels) view, where Item numbers like 1, 1.2, 1.2.3 give the hierarchy,
// and with the Parts Only view (flat list).
import Papa from 'papaparse'
import type { Draft } from 'immer'
import type { BomData, ID, Part } from './types'
import { uid } from './types'

export interface ImportRow {
  item: string
  pn: string
  desc: string
  qty: number
  rev: string
  cost: number | null
  vendor: string
  mass: number | null // grams
}

const COLS: Record<keyof ImportRow, string[]> = {
  item: ['item', 'item no', 'item number', 'pos'],
  pn: ['part number', 'partnumber', 'part no', 'pn', 'p/n'],
  desc: ['description', 'desc', 'name', 'title'],
  qty: ['qty', 'quantity', 'item qty', 'unit qty'],
  rev: ['rev', 'revision', 'revision number', 'rev.'],
  cost: ['estimated cost', 'cost', 'unit cost', 'price'],
  vendor: ['vendor', 'supplier', 'manufacturer'],
  mass: ['mass', 'weight', 'unit mass'],
}

/** Inventor writes mass with its unit, e.g. "0.125 kg", "125.000 g", "0.276 lbmass". Returns grams. */
export function parseMass(v: string | undefined): number | null {
  if (!v) return null
  const m = String(v).trim().replace(',', '.').match(/^(-?[\d.]+)\s*([a-zA-Z]*)/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return null
  const u = m[2].toLowerCase()
  const f = u.startsWith('kg') ? 1000 : u.startsWith('lb') ? 453.59237 : u.startsWith('oz') ? 28.349523 : u === 'mg' ? 0.001 : 1 // g or no unit
  return Math.round(n * f * 1000) / 1000
}

export function parseInventorCsv(text: string): { rows: ImportRow[]; columns: string[]; error?: string } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() })
  const headers = res.meta.fields ?? []
  const find = (k: keyof ImportRow) => headers.find((h) => COLS[k].includes(h.toLowerCase().trim()))
  const col = Object.fromEntries((Object.keys(COLS) as (keyof ImportRow)[]).map((k) => [k, find(k)])) as Record<keyof ImportRow, string | undefined>
  if (!col.pn) return { rows: [], columns: headers, error: `Couldn't find a "Part Number" column. Columns found: ${headers.join(', ')}` }
  const num = (v: string | undefined) => {
    if (v == null) return null
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
    return Number.isNaN(n) ? null : n
  }
  const rows: ImportRow[] = res.data
    .map((r, i) => ({
      item: (col.item ? r[col.item] : '')?.trim() || String(i + 1),
      pn: (r[col.pn!] ?? '').trim(),
      desc: (col.desc ? r[col.desc] : '')?.trim() ?? '',
      qty: (col.qty ? num(r[col.qty]) : 1) ?? 1,
      rev: (col.rev ? r[col.rev] : '')?.trim() ?? '',
      cost: col.cost ? num(r[col.cost]) : null,
      vendor: (col.vendor ? r[col.vendor] : '')?.trim() ?? '',
      mass: col.mass ? parseMass(r[col.mass]) : null,
    }))
    .filter((r) => r.pn)
  return { rows, columns: headers }
}

export interface ImportPlan {
  newParts: Part[]
  updates: { part: Part; field: 'name' | 'rev' | 'weight'; from: string; to: string; value?: number }[]
  added: { parent: string; child: string; qty: number }[]
  changed: { parent: string; child: string; from: number; to: number }[]
  removed: { parent: string; child: string; qty: number }[]
  apply: (d: Draft<BomData>) => void
}

export function planImport(data: BomData, rows: ImportRow[], targetId: ID, defaultCategory: string): ImportPlan {
  const byPn = new Map(data.parts.map((p) => [p.pn.toLowerCase(), p]))
  const itemToPn = new Map(rows.map((r) => [r.item, r.pn]))
  const parentItem = (item: string) => (item.includes('.') ? item.slice(0, item.lastIndexOf('.')) : null)
  const hasKids = new Set(rows.map((r) => parentItem(r.item)).filter(Boolean) as string[])

  const newParts: Part[] = []
  const updates: ImportPlan['updates'] = []
  const resolve = (r: ImportRow): Part => {
    const existing = byPn.get(r.pn.toLowerCase())
    if (existing) return existing
    const isAsm = hasKids.has(r.item)
    // If the part number starts with a known prefix (e.g. MEC-), use that category.
    const prefix = r.pn.split(/[-_ ]/)[0].toUpperCase()
    const known = data.settings.categories.some((c) => c.prefix === prefix)
    const category = isAsm ? 'ASM' : known ? prefix : defaultCategory
    const p: Part = {
      id: uid(), pn: r.pn, name: r.desc || r.pn, category, makeBuy: isAsm || category === 'MEC' ? 'make' : 'buy', rev: r.rev || 'A', unit: 'pcs',
      plannedCost: r.cost ?? 0, currency: data.settings.displayCurrency || 'USD', supplierId: null, supplierPn: '', url: '', leadTimeDays: null,
      onHand: 0, location: '', minStock: 0, sparesTarget: 0, notes: r.vendor ? `Vendor (from Inventor): ${r.vendor}` : '', files: [], createdAt: new Date().toISOString(),
      weight: isAsm ? null : r.mass,
      weightSource: !isAsm && r.mass != null ? 'cad' : null,
    }
    byPn.set(r.pn.toLowerCase(), p)
    newParts.push(p)
    return p
  }

  const seenUpdate = new Set<string>()
  const desired = new Map<ID, Map<ID, number>>() // parent -> child -> qty
  desired.set(targetId, new Map())
  for (const r of rows) {
    const child = resolve(r)
    if (!newParts.includes(child) && !seenUpdate.has(child.id)) {
      seenUpdate.add(child.id)
      if (r.rev && r.rev !== child.rev) updates.push({ part: child, field: 'rev', from: child.rev, to: r.rev })
      if (r.desc && r.desc !== child.name) updates.push({ part: child, field: 'name', from: child.name, to: r.desc })
      // Mass from Inventor only updates parts (not assemblies, whose weight is rolled up from their children).
      // A weight you measured or took from the supplier is never overwritten by the CAD mass.
      if (r.mass != null && !hasKids.has(r.item) && r.mass !== child.weight && (child.weightSource ?? 'cad') === 'cad')
        updates.push({ part: child, field: 'weight', from: child.weight == null ? 'none' : `${child.weight} g`, to: `${r.mass} g`, value: r.mass })
    }
    const pItem = parentItem(r.item)
    const parentPn = pItem ? itemToPn.get(pItem) : null
    const parentId = parentPn ? byPn.get(parentPn.toLowerCase())!.id : targetId
    if (!desired.has(parentId)) desired.set(parentId, new Map())
    const m = desired.get(parentId)!
    m.set(child.id, (m.get(child.id) ?? 0) + r.qty)
    if (hasKids.has(r.item) && !desired.has(child.id)) desired.set(child.id, new Map())
  }

  const pnById = new Map([...byPn.values()].map((p) => [p.id, p.pn]))
  const name = (id: ID) => pnById.get(id) ?? id
  const added: ImportPlan['added'] = []
  const changed: ImportPlan['changed'] = []
  const removed: ImportPlan['removed'] = []
  for (const [parentId, want] of desired) {
    const current = data.bom.filter((l) => l.parentId === parentId && !l.manual)
    for (const [childId, qty] of want) {
      const cur = current.find((l) => l.childId === childId)
      if (!cur) added.push({ parent: name(parentId), child: name(childId), qty })
      else if (cur.qty !== qty) changed.push({ parent: name(parentId), child: name(childId), from: cur.qty, to: qty })
    }
    for (const l of current) if (!want.has(l.childId)) removed.push({ parent: name(parentId), child: name(l.childId), qty: l.qty })
  }

  const apply = (d: Draft<BomData>) => {
    for (const p of newParts) d.parts.push(p)
    for (const u of updates) {
      const p = d.parts.find((x) => x.id === u.part.id)
      if (!p) continue
      if (u.field === 'weight') {
        p.weight = u.value ?? null
        p.weightSource = 'cad'
      }
      else p[u.field] = u.to
    }
    for (const [parentId, want] of desired) {
      const manualChildren = new Set(d.bom.filter((l) => l.parentId === parentId && l.manual).map((l) => l.childId))
      d.bom = d.bom.filter((l) => l.parentId !== parentId || l.manual)
      for (const [childId, qty] of want) {
        if (manualChildren.has(childId)) {
          // the part was added by hand earlier and now comes from Inventor too: let Inventor own it
          d.bom = d.bom.filter((l) => !(l.parentId === parentId && l.childId === childId))
        }
        d.bom.push({ id: uid(), parentId, childId, qty, notes: '' })
      }
    }
  }
  return { newParts, updates, added, changed, removed, apply }
}
