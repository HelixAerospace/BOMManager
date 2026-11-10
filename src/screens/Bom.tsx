import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ListTree, Plus, ShoppingCart, Trash2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived } from '../lib/derived'
import { availability, buildCheck, createsCycle, fmtMoney, fmtNum, nextPoNumber } from '../lib/calc'
import { type ID, type Part, uid } from '../lib/types'
import { AvailabilityChip, Empty, FilterTabs, MakeBuyChip, NumInput, PageHeader, PartPicker } from '../components/ui'
import { newPart } from './Parts'

export default function BomScreen() {
  const { data, update, notify } = useStore()
  const nav = useNav()
  const { idx, costs, actual, topAssemblies } = useDerived()
  const assemblies = data.parts.filter((p) => idx.children.has(p.id) || p.category === 'ASM')
  const [sel, setSel] = useState<ID | undefined>(data.settings.topAssemblyId ?? topAssemblies[0]?.id)
  const topId = sel && idx.partById.has(sel) ? sel : topAssemblies[0]?.id ?? assemblies[0]?.id
  const [view, setView] = useState<'tree' | 'build'>('tree')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addingTo, setAddingTo] = useState<ID | null>(null)
  const [units, setUnits] = useState(data.settings.buildQty || 1)
  const [spares, setSpares] = useState(false)

  const bc = useMemo(() => (topId ? buildCheck(data, idx, topId, units, spares) : null), [data, idx, topId, units, spares])
  const availByPart = useMemo(() => new Map(bc?.rows.map((r) => [r.part.id, r]) ?? []), [bc])

  const newAssembly = () => {
    const p = newPart(data, 'ASM', 'make')
    p.name = 'New assembly'
    update((d) => void d.parts.push(p))
    setSel(p.id)
    nav.openPart(p.id)
  }

  const addChild = (parentId: ID, child: Part) => {
    if (createsCycle(idx, parentId, child.id)) return notify('That would put an assembly inside itself')
    const existing = data.bom.find((l) => l.parentId === parentId && l.childId === child.id)
    update((d) => {
      if (existing) d.bom.find((l) => l.id === existing.id)!.qty += 1
      else d.bom.push({ id: uid(), parentId, childId: child.id, qty: 1, notes: '', manual: true })
    })
  }

  const createShortageOrders = () => {
    if (!bc) return
    // Quantities already sitting in draft orders count as "planned", so we don't order twice.
    const inDrafts = new Map<ID, number>()
    for (const o of data.orders) if (o.status === 'draft') for (const l of o.lines) inDrafts.set(l.partId, (inDrafts.get(l.partId) ?? 0) + l.qty)
    const short = bc.rows
      .map((r) => ({ part: r.part, qty: Math.ceil(r.shortAfterOrders - (inDrafts.get(r.part.id) ?? 0)) }))
      .filter((r) => r.qty > 0)
    if (!short.length) return notify('Everything short is already in draft orders')
    const groups = new Map<string, typeof short>()
    for (const r of short) {
      const k = r.part.supplierId ?? ''
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }
    const extended = [...groups.keys()].filter((k) => data.orders.some((x) => x.status === 'draft' && (x.supplierId ?? '') === k)).length
    const created = groups.size - extended
    update((d) => {
      for (const [supplierId, rows] of groups) {
        let o = d.orders.find((x) => x.status === 'draft' && (x.supplierId ?? '') === supplierId)
        if (!o) {
          const sup = d.suppliers.find((s) => s.id === supplierId)
          const currency = sup?.currency ?? rows[0].part.currency
          d.orders.push({
            id: uid(), number: nextPoNumber(d as never), supplierId: supplierId || null, status: 'draft', currency,
            fxToIls: d.settings.fx[currency] ?? 1, orderDate: '', expectedDate: '', receivedDate: '', shipping: 0,
            invoiceNumber: '', invoiceTotal: null, notes: `Created from build check: ${units} units`, files: [], lines: [],
          })
          o = d.orders[d.orders.length - 1]
        }
        for (const r of rows) {
          const existing = o.lines.find((l) => l.partId === r.part.id)
          if (existing) existing.qty += r.qty
          else {
            const price = r.part.currency === o.currency ? r.part.plannedCost : (r.part.plannedCost * (d.settings.fx[r.part.currency] ?? 1)) / (d.settings.fx[o.currency] ?? 1)
            o.lines.push({ id: uid(), partId: r.part.id, qty: r.qty, unitPrice: Math.round(price * 100) / 100, qtyReceived: 0 })
          }
        }
      }
    })
    notify([created && `Created ${created} draft order${created > 1 ? 's' : ''}`, extended && `added to ${extended} existing draft${extended > 1 ? 's' : ''}`].filter(Boolean).join(', '))
    nav.go('orders')
  }

  if (assemblies.length === 0)
    return (
      <>
        <PageHeader title="BOM" />
        <Empty icon={<ListTree className="h-5 w-5" />} title="No assemblies yet" text="Create a top-level assembly (e.g. the drone), then add parts and sub-assemblies under it." action={<button className="btn-primary" onClick={newAssembly}><Plus className="h-4 w-4" /> New assembly</button>} />
      </>
    )

  const top = idx.partById.get(topId!)!
  const topCost = costs.get(top.id)

  // Flatten the tree for rendering.
  type Row = { key: string; part: Part; lineId: ID | null; parentId: ID | null; qty: number; extQty: number; depth: number; hasKids: boolean }
  const rows: Row[] = []
  const walk = (id: ID, parentId: ID | null, lineId: ID | null, qty: number, ext: number, depth: number, path: string) => {
    const p = idx.partById.get(id)
    if (!p || depth > 30) return
    const kids = idx.children.get(id) ?? []
    rows.push({ key: path, part: p, lineId, parentId, qty, extQty: ext, depth, hasKids: kids.length > 0 })
    if (collapsed.has(path)) return
    const sorted = [...kids].sort((a, b) => (idx.partById.get(a.childId)?.pn ?? '').localeCompare(idx.partById.get(b.childId)?.pn ?? ''))
    for (const k of sorted) walk(k.childId, id, k.lineId, k.qty, ext * k.qty, depth + 1, `${path}/${k.lineId}`)
  }
  walk(top.id, null, null, 1, 1, 0, top.id)

  const allPaths = () => {
    const s = new Set<string>()
    const w = (id: ID, path: string) => {
      const kids = idx.children.get(id) ?? []
      if (kids.length) s.add(path)
      kids.forEach((k) => w(k.childId, `${path}/${k.lineId}`))
    }
    w(top.id, top.id)
    s.delete(top.id)
    return s
  }

  return (
    <>
      <PageHeader
        title="BOM"
        subtitle={<>{top.pn} · rev {top.rev} · planned {fmtMoney(topCost?.planned)} per unit{topCost && topCost.actualCoverage > 0 && <> · actual {fmtMoney(topCost.actual)} ({Math.round(topCost.actualCoverage * 100)}% known)</>}</>}
        actions={
          <>
            <select className="input w-auto" value={top.id} onChange={(e) => setSel(e.target.value)}>
              {assemblies.map((a) => <option key={a.id} value={a.id}>{a.pn} {a.name}</option>)}
            </select>
            <button className="btn" onClick={newAssembly}><Plus className="h-4 w-4" /> New assembly</button>
          </>
        }
      />
      <div className="flex items-center justify-between gap-3 px-6 pt-4">
        <FilterTabs value={view} onChange={setView} options={[{ value: 'tree', label: 'Structure & cost' }, { value: 'build', label: 'Build check' }]} />
        {view === 'tree' ? (
          <div className="flex gap-1">
            <button className="btn-ghost" onClick={() => setCollapsed(new Set())}><ChevronsUpDown className="h-4 w-4" /> Expand all</button>
            <button className="btn-ghost" onClick={() => setCollapsed(allPaths())}><ChevronsDownUp className="h-4 w-4" /> Collapse</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-zinc-600">
            Units to build <NumInput className="input num w-20" value={units} min={1} onChange={(v) => setUnits(Math.round(v))} />
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={spares} onChange={(e) => setSpares(e.target.checked)} /> include spares targets</label>
          </div>
        )}
      </div>

      {view === 'tree' ? (
        <div className="p-6 pt-3">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Type</th>
                  <th className="num">Qty</th>
                  <th className="num">Total qty</th>
                  <th className="num">Unit cost (₪)</th>
                  <th className="num">Ext. cost (₪)</th>
                  <th className="num">Actual unit (₪)</th>
                  <th className="num">On hand</th>
                  <th>For {units} units</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = costs.get(r.part.id)
                  const a = actual.get(r.part.id)
                  const av = availByPart.get(r.part.id)
                  const isTop = r.depth === 0
                  return (
                    <Fragment key={r.key}>
                      <tr className={`group ${r.hasKids ? 'bg-zinc-50/60' : ''}`}>
                        <td>
                          <div className="flex items-center gap-1" style={{ paddingLeft: r.depth * 18 }}>
                            {r.hasKids ? (
                              <button className="text-zinc-400 hover:text-zinc-800" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(r.key) ? n.delete(r.key) : n.add(r.key); return n })}>
                                {collapsed.has(r.key) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            ) : <span className="w-4" />}
                            <button className="flex min-w-0 items-baseline gap-2 text-left hover:underline" onClick={() => nav.openPart(r.part.id)}>
                              <span className="font-mono text-xs text-zinc-500">{r.part.pn}</span>
                              <span className={`truncate ${r.hasKids ? 'font-medium' : ''}`}>{r.part.name}</span>
                              {r.part.rev && <span className="whitespace-nowrap text-xs text-zinc-400">rev {r.part.rev}</span>}
                            </button>
                          </div>
                        </td>
                        <td>{r.hasKids ? <span className="text-xs text-zinc-500">Assembly</span> : <MakeBuyChip v={r.part.makeBuy} />}</td>
                        <td className="num w-20">
                          {r.lineId ? (
                            <NumInput className="cell-input num" value={r.qty} min={0} onChange={(v) => update((d) => void (d.bom.find((l) => l.id === r.lineId)!.qty = v))} />
                          ) : '—'}
                        </td>
                        <td className="num text-zinc-500">{isTop ? '' : fmtNum(r.extQty)}</td>
                        <td className="num">{fmtMoney(c?.planned)}</td>
                        <td className="num font-medium">{isTop ? fmtMoney(c?.planned) : fmtMoney((c?.planned ?? 0) * r.qty)}</td>
                        <td className="num text-zinc-500">{r.hasKids ? (c && c.actualCoverage > 0 ? fmtMoney(c.actual) : '') : a ? <span title={`from ${a.orderNumber}`}>{fmtMoney(a.unitIls)}</span> : ''}</td>
                        <td className="num">{r.hasKids ? '' : fmtNum(r.part.onHand)}</td>
                        <td>{!r.hasKids && av && <AvailabilityChip a={availability(av)} />}</td>
                        <td>
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                            {(r.hasKids || r.part.category === 'ASM') && (
                              <button className="btn-ghost px-1" title="Add part under this" onClick={() => setAddingTo(addingTo === r.key ? null : r.key)}><Plus className="h-4 w-4" /></button>
                            )}
                            {r.lineId && (
                              <button className="btn-ghost px-1 hover:text-red-600" title="Remove from this assembly" onClick={() => update((d) => void (d.bom = d.bom.filter((l) => l.id !== r.lineId)))}><Trash2 className="h-4 w-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {(addingTo === r.key || (isTop && !r.hasKids)) && (
                        <tr>
                          <td colSpan={10} className="bg-zinc-50">
                            <div className="flex items-center gap-2" style={{ paddingLeft: r.depth * 18 + 24 }}>
                              <div className="w-96"><PartPicker parts={data.parts.filter((p) => p.id !== r.part.id)} onPick={(p) => addChild(r.part.id, p)} placeholder={`Add part to ${r.part.name}…`} /></div>
                              <button className="btn" onClick={() => {
                                const p = newPart(data, 'PUR', 'buy')
                                p.name = 'New part'
                                update((d) => {
                                  d.parts.push(p)
                                  d.bom.push({ id: uid(), parentId: r.part.id, childId: p.id, qty: 1, notes: '', manual: true })
                                })
                                nav.openPart(p.id)
                              }}><Plus className="h-4 w-4" /> New part</button>
                              {!isTop && <button className="btn-ghost" onClick={() => setAddingTo(null)}>Done</button>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-400">Hover a row to add or remove parts. Costs are converted to ₪ with the rates in Settings; “Actual” comes from received orders including shipping.</p>
        </div>
      ) : (
        <div className="p-6 pt-3">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
            <div>
              Can build <b className="text-lg">{bc?.canBuild ?? 0}</b> now from stock ·{' '}
              <b className={bc?.rows.some((r) => r.shortAfterOrders > 0) ? 'text-red-600' : 'text-emerald-600'}>{bc?.rows.filter((r) => r.shortAfterOrders > 0).length ?? 0}</b> parts still short for {units} after open orders arrive
            </div>
            <button className="btn-primary" disabled={!bc?.rows.some((r) => r.shortAfterOrders > 0)} onClick={createShortageOrders}><ShoppingCart className="h-4 w-4" /> Create draft orders for shortages</button>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Part</th><th>Supplier</th><th className="num">Per unit</th><th className="num">Required</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Short now</th><th className="num">Still to order</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bc?.rows.map((r) => (
                  <tr key={r.part.id} className="clickable" onClick={() => nav.openPart(r.part.id)}>
                    <td><span className="font-mono text-xs text-zinc-500">{r.part.pn}</span> {r.part.name}</td>
                    <td className="text-zinc-500">{idx.supplierById.get(r.part.supplierId ?? '')?.name ?? '—'}</td>
                    <td className="num">{fmtNum(r.perUnit)}</td>
                    <td className="num">{fmtNum(r.required)}</td>
                    <td className="num">{fmtNum(r.onHand)}</td>
                    <td className="num">{r.onOrder ? fmtNum(r.onOrder) : ''}</td>
                    <td className="num">{r.shortNow ? fmtNum(r.shortNow) : ''}</td>
                    <td className={`num font-medium ${r.shortAfterOrders ? 'text-red-600' : ''}`}>{r.shortAfterOrders ? fmtNum(r.shortAfterOrders) : ''}</td>
                    <td><AvailabilityChip a={availability(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

