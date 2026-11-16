import { Fragment, useMemo, useState } from 'react'
import { Stamp, ChevronDown, ChevronRight, ListTree, Plus, ShoppingCart, Trash2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived, useMoney } from '../lib/derived'
import { arrivalsText, availability, buildCheck, createsCycle, fmtMoney, fmtNum, fmtWeight, nextPoNumber, roundToPacks, weightBySource } from '../lib/calc'
import { WeightSourceChip, WeightSourceStats } from '../components/weight'
import { diffConfig, diffCount, latestRelease, snapshotLines } from '../lib/quality'
import { ReleaseDialog } from './Releases'
import { type ID, type Part, uid } from '../lib/types'
import { AvailabilityChip, Empty, FilterTabs, MakeBuyChip, NumInput, PageHeader, PartPicker } from '../components/ui'
import { newPart } from './Parts'

export default function BomScreen() {
  const { fmt: money, sym, cur: dispCur } = useMoney()
  const { data, update, updateAndSave, notify } = useStore()
  const supName = (id: string | null) => idx.supplierById.get(id ?? '')?.name ?? 'no supplier'
  const nav = useNav()
  const { idx, costs, actual, weights, onOrder, arrivals, topAssemblies } = useDerived()
  const assemblies = data.parts.filter((p) => idx.children.has(p.id) || p.category === 'ASM')
  const [sel, setSel] = useState<ID | undefined>(data.settings.topAssemblyId ?? topAssemblies[0]?.id)
  const topId = sel && idx.partById.has(sel) ? sel : topAssemblies[0]?.id ?? assemblies[0]?.id
  const [view, setView] = useState<'tree' | 'weight' | 'build'>('tree')
  const [releasing, setReleasing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addingTo, setAddingTo] = useState<ID | null>(null)
  const units = data.settings.buildQty || 1
  const setUnits = (v: number) => updateAndSave((d) => void (d.settings.buildQty = Math.max(1, v)))
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
      .map((r) => ({ part: r.part, qty: roundToPacks(r.part, r.shortAfterOrders - (inDrafts.get(r.part.id) ?? 0)) }))
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
            o.lines.push({ id: uid(), partId: r.part.id, qty: r.qty, unitPrice: Math.round(price * 10000) / 10000, qtyReceived: 0 })
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
  const lastRel = latestRelease(data, top.id)
  const relChanges = lastRel ? diffCount(diffConfig(lastRel.lines, snapshotLines(idx, top.id))) : 0
  const topWeight = weights.get(top.id)
  const totalGrams = topWeight?.grams || 0
  const srcBreakdown = weightBySource(idx, top.id)

  // Flatten the tree for rendering.
  type Row = { key: string; part: Part; lineId: ID | null; parentId: ID | null; qty: number; extQty: number; depth: number; hasKids: boolean; trail: boolean[]; expanded: boolean }
  const rows: Row[] = []
  // trail[k] = is the node at depth k+1 on this path the last child of its parent? (drives the tree guide lines)
  const walk = (id: ID, parentId: ID | null, lineId: ID | null, qty: number, ext: number, depth: number, path: string, trail: boolean[]) => {
    const p = idx.partById.get(id)
    if (!p || depth > 30) return
    const kids = idx.children.get(id) ?? []
    rows.push({ key: path, part: p, lineId, parentId, qty, extQty: ext, depth, hasKids: kids.length > 0, trail, expanded: kids.length > 0 && !collapsed.has(path) })
    if (collapsed.has(path)) return
    const sorted = [...kids].sort((a, b) => (idx.partById.get(a.childId)?.pn ?? '').localeCompare(idx.partById.get(b.childId)?.pn ?? ''))
    sorted.forEach((k, i) => walk(k.childId, id, k.lineId, k.qty, ext * k.qty, depth + 1, `${path}/${k.lineId}`, [...trail, i === sorted.length - 1]))
  }
  walk(top.id, null, null, 1, 1, 0, top.id, [])

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
        subtitle={<>{top.pn} · rev {top.rev} · planned {money(topCost?.planned)} per unit{topCost && topCost.actualCoverage > 0 && <> · actual {money(topCost.actual)} ({Math.round(topCost.actualCoverage * 100)}% known)</>} · {fmtWeight(topWeight?.grams)}{topWeight && topWeight.missing > 0 && <span className="text-caution"> ({topWeight.missing} without weight)</span>}</>}
        actions={
          <>
            <select className="input w-auto" value={top.id} onChange={(e) => setSel(e.target.value)}>
              {assemblies.map((a) => <option key={a.id} value={a.id}>{a.pn} {a.name}</option>)}
            </select>
            <button className="btn" onClick={() => setReleasing(true)}><Stamp className="h-4 w-4" /> Release configuration…</button>
            <button className="btn" onClick={newAssembly}><Plus className="h-4 w-4" /> New assembly</button>
          </>
        }
      />
      <div className="flex items-center justify-between gap-3 px-6 pt-4">
        <div className="flex items-center gap-4">
          <FilterTabs value={view} onChange={setView} options={[{ value: 'tree', label: 'Structure & cost' }, { value: 'weight', label: 'Weight' }, { value: 'build', label: 'Build check' }]} />
          <span className="text-sm text-ink-muted">
            {lastRel ? (
              <>Configuration <button className="font-medium text-accent hover:underline" onClick={() => nav.openRelease(lastRel.id)}>{lastRel.name}</button> · released {lastRel.date}{relChanges > 0 ? <span className="text-caution"> · {relChanges} change{relChanges > 1 ? 's' : ''} since</span> : <span> · unchanged</span>}</>
            ) : <span className="text-ink-subtle">No released configuration yet</span>}
          </span>
        </div>
        {view !== 'build' ? (
          <div className="flex gap-1">
            <button className="btn-ghost" onClick={() => setCollapsed(new Set())}><ChevronsUpDown className="h-4 w-4" /> Expand all</button>
            <button className="btn-ghost" onClick={() => setCollapsed(allPaths())}><ChevronsDownUp className="h-4 w-4" /> Collapse</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            Units to build <NumInput className="input num w-20" value={units} min={1} onChange={(v) => setUnits(Math.round(v))} />
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={spares} onChange={(e) => setSpares(e.target.checked)} /> include spares targets</label>
          </div>
        )}
      </div>

      {view !== 'build' ? (
        <div className="p-6 pt-3">
          {view === 'weight' && (
            <div className="mb-3 rounded-lg border border-hairline bg-surface p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[15px] font-semibold leading-6">Where the weight figures come from</span>
                <span className="text-sm text-ink-muted">total <b className="text-ink">{fmtWeight(srcBreakdown.total)}</b> per {top.name}</span>
              </div>
              <WeightSourceStats b={srcBreakdown} />
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
            <table className="grid-table dense">
              <thead>
                {view === 'tree' ? (
                  <tr>
                    <th>Part</th>
                    <th>Type</th>
                    <th className="num">Qty</th>
                    <th className="num">Total qty</th>
                    <th className="num">Unit cost ({sym})</th>
                    <th className="num">Ext. cost ({sym})</th>
                    <th className="num">Actual ({sym})</th>
                    <th className="num">On hand</th>
                    <th className="num" title="Ordered but not yet received (open orders)">Ordered</th>
                    <th>{units} units</th>
                    <th className="w-16"></th>
                  </tr>
                ) : (
                  <tr>
                    <th>Part</th>
                    <th className="num">Qty</th>
                    <th className="num">Total qty</th>
                    <th className="num">Unit weight</th>
                    <th className="num">Weight in 1 {top.name}</th>
                    <th className="num">Share</th>
                    <th className="w-48"></th>
                    <th className="w-16"></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = costs.get(r.part.id)
                  const a = actual.get(r.part.id)
                  const av = availByPart.get(r.part.id)
                  const isTop = r.depth === 0
                  const wt = weights.get(r.part.id)
                  return (
                    <Fragment key={r.key}>
                      <tr className={`group ${r.hasKids ? 'bg-alt' : ''}`}>
                        <td className="relative">
                          <TreeGuides trail={r.trail} expanded={r.expanded} />
                          <div className="relative flex items-center gap-1" style={{ paddingLeft: r.depth * INDENT }}>
                            {r.hasKids ? (
                              <button className="text-ink-subtle hover:text-ink" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(r.key) ? n.delete(r.key) : n.add(r.key); return n })}>
                                {collapsed.has(r.key) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            ) : <span className="w-4" />}
                            <button className="flex min-w-0 items-baseline gap-2 text-left hover:underline" onClick={() => nav.openPart(r.part.id)}>
                              <span className="font-mono text-xs text-ink-subtle">{r.part.pn}</span>
                              <span className={`truncate ${r.hasKids ? 'font-medium' : ''}`}>{r.part.name}</span>
                              {r.part.rev && <span className="whitespace-nowrap text-xs text-ink-subtle">rev {r.part.rev}</span>}
                            </button>
                          </div>
                        </td>
{view === 'tree' ? (<>
                        <td>{r.hasKids ? <span className="text-xs text-ink-subtle">Assembly</span> : <MakeBuyChip v={r.part.makeBuy} />}</td>
                        <td className="num w-20">
                          {r.lineId ? (
                            <NumInput className="cell-input num w-14" value={r.qty} min={0} onChange={(v) => update((d) => void (d.bom.find((l) => l.id === r.lineId)!.qty = v))} />
                          ) : '—'}
                        </td>
                        <td className="num text-ink-subtle">{isTop ? '' : fmtNum(r.extQty)}</td>
                        <td className="num">{money(c?.planned)}</td>
                        <td className="num font-medium">{isTop ? money(c?.planned) : money((c?.planned ?? 0) * r.qty)}</td>
                        <td className="num text-ink-subtle">{r.hasKids ? (c && c.actualCoverage > 0 ? money(c.actual) : '') : a ? <span title={`from ${a.orderNumber}`}>{money(a.unitIls)}</span> : ''}</td>
                        <td className="num">{r.hasKids ? '' : fmtNum(r.part.onHand)}</td>
                        <td className="num text-ink-muted" title={arrivalsText(arrivals.get(r.part.id), supName) || undefined}>{r.hasKids ? '' : onOrder.get(r.part.id) ? fmtNum(onOrder.get(r.part.id)!) : ''}</td>
                        <td>{!r.hasKids && av && <AvailabilityChip a={availability(av)} title={arrivalsText(arrivals.get(r.part.id), supName) || undefined} />}</td>
</>) : (<>
                        <td className="num w-20">
                          {r.lineId ? (
                            <NumInput className="cell-input num w-14" value={r.qty} min={0} onChange={(v) => update((d) => void (d.bom.find((l) => l.id === r.lineId)!.qty = v))} />
                          ) : '—'}
                        </td>
                        <td className="num text-ink-subtle">{isTop ? '' : fmtNum(r.extQty)}</td>
                        <td className="num">
                          {r.hasKids ? fmtWeight(wt?.grams) : r.part.weight == null ? <span className="text-caution">not set</span> : <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><WeightSourceChip s={r.part.weightSource} />{fmtWeight(r.part.weight)}</span>}
                          {r.hasKids && wt && wt.missing > 0 && <div className="text-xs text-caution">{wt.missing} not set</div>}
                        </td>
                        <td className="num font-medium">{fmtWeight((wt?.grams ?? 0) * r.extQty)}</td>
                        <td className="num text-ink-muted">{totalGrams ? `${Math.round((((wt?.grams ?? 0) * r.extQty) / totalGrams) * 1000) / 10}%` : ''}</td>
                        <td>
                          {!isTop && totalGrams > 0 && (
                            <div className="h-2 rounded-full bg-hairline" aria-hidden>
                              <div className={`h-2 rounded-full ${r.hasKids ? 'bg-ink' : 'bg-ink-muted'}`} style={{ width: `${Math.min(100, (((wt?.grams ?? 0) * r.extQty) / totalGrams) * 100)}%` }} />
                            </div>
                          )}
                        </td>
</>)}
                        <td>
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                            {(r.hasKids || r.part.category === 'ASM') && (
                              <button className="btn-icon" title="Add part under this" aria-label="Add part under this" onClick={() => setAddingTo(addingTo === r.key ? null : r.key)}><Plus className="h-4 w-4" /></button>
                            )}
                            {r.lineId && (
                              <button className="btn-icon hover:text-warning" title="Remove from this assembly" aria-label="Remove from this assembly" onClick={() => update((d) => void (d.bom = d.bom.filter((l) => l.id !== r.lineId)))}><Trash2 className="h-4 w-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {(addingTo === r.key || (isTop && !r.hasKids)) && (
                        <tr>
                          <td colSpan={view === 'tree' ? 11 : 8} className="relative bg-alt">
                            <TreeGuides trail={[...r.trail, !r.expanded]} expanded={false} />
                            <div className="relative flex items-center gap-2" style={{ paddingLeft: (r.depth + 1) * INDENT + 4 }}>
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
          <p className="mt-2 text-xs text-ink-subtle">{view === 'tree' ? `Hover a row to add or remove parts. Costs are shown in ${dispCur}, converted with the rates in Settings; “Actual” comes from received orders including shipping.` : 'Weights come from each part (grams per unit). Assemblies add up their parts plus any extra weight entered on the assembly. Click a part to enter its weight.'}</p>
        </div>
      ) : (
        <div className="p-6 pt-3">
          <div className="mb-3 flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 text-sm">
            <div>
              Can build <b className="text-lg">{bc?.canBuild ?? 0}</b> now from stock ·{' '}
              <b className={bc?.rows.some((r) => r.shortAfterOrders > 0) ? 'text-warning' : 'text-tip'}>{bc?.rows.filter((r) => r.shortAfterOrders > 0).length ?? 0}</b> parts still short for {units} after open orders arrive
            </div>
            <button className="btn-primary" disabled={!bc?.rows.some((r) => r.shortAfterOrders > 0)} onClick={createShortageOrders}><ShoppingCart className="h-4 w-4" /> Create draft orders for shortages</button>
          </div>
          <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Part</th><th>Supplier</th><th className="num">Per unit</th><th className="num">Required</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Short now</th><th className="num">Still to order</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bc?.rows.map((r) => (
                  <tr key={r.part.id} className="clickable" onClick={() => nav.openPart(r.part.id)}>
                    <td><span className="font-mono text-xs text-ink-subtle">{r.part.pn}</span> {r.part.name}</td>
                    <td className="text-ink-subtle">{idx.supplierById.get(r.part.supplierId ?? '')?.name ?? '—'}</td>
                    <td className="num">{fmtNum(r.perUnit)}</td>
                    <td className="num">{fmtNum(r.required)}</td>
                    <td className="num">{fmtNum(r.onHand)}</td>
                    <td className="num">{r.onOrder ? fmtNum(r.onOrder) : ''}</td>
                    <td className="num">{r.shortNow ? fmtNum(r.shortNow) : ''}</td>
                    <td className={`num font-medium ${r.shortAfterOrders ? 'text-warning' : ''}`}>{r.shortAfterOrders ? fmtNum(r.shortAfterOrders) : ''}</td>
                    <td><AvailabilityChip a={availability(r)} title={arrivalsText(arrivals.get(r.part.id), supName) || undefined} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {releasing && <ReleaseDialog assemblyId={top.id} onClose={() => setReleasing(false)} />}
    </>
  )
}


// ---------- tree guide lines ----------
const INDENT = 22 // px per level
const PAD = 12 // td left padding (px-3)
const lineX = (level: number) => PAD + (level - 1) * INDENT + 8 // centre of the parent's chevron

/** Draws ├ / └ connectors and the vertical lines of open assemblies, so it's clear which rows belong to which assembly. */
function TreeGuides({ trail, expanded }: { trail: boolean[]; expanded: boolean }) {
  const depth = trail.length
  const line = 'absolute bg-control'
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* ancestors that still have siblings below: line runs the full row height */}
      {trail.slice(0, -1).map((isLast, i) => !isLast && <div key={i} className={`${line} top-0 bottom-0 w-px`} style={{ left: lineX(i + 1) }} />)}
      {depth > 0 && (
        <>
          {/* own connector: down from the top to the middle (├ continues to the bottom if more siblings follow) */}
          <div className={`${line} top-0 w-px`} style={{ left: lineX(depth), bottom: trail[depth - 1] ? '50%' : 0 }} />
          <div className={`${line} h-px`} style={{ left: lineX(depth), top: '50%', width: INDENT - 8 }} />
        </>
      )}
      {/* an open assembly starts a new line down to its first child */}
      {expanded && <div className={`${line} bottom-0 w-px`} style={{ left: lineX(depth + 1), top: '50%' }} />}
    </div>
  )
}
