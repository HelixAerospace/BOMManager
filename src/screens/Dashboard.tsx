import { useMemo } from 'react'
import { AlertTriangle, ListTree, Truck, Warehouse } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived, useMoney } from '../lib/derived'
import { buildCheck, fmtMoney, fmtWeight, isLate, isOpen, orderValueIls, stockState } from '../lib/calc'
import { Card, Empty, Kpi, OrderStatusChip, PageHeader, StepBar } from '../components/ui'

export default function Dashboard() {
  const { fmt: money, sym, cur: dispCur } = useMoney()
  const { data, update } = useStore()
  const nav = useNav()
  const { idx, costs, weights, topAssemblies } = useDerived()
  const topId = data.settings.topAssemblyId && idx.partById.has(data.settings.topAssemblyId) ? data.settings.topAssemblyId : topAssemblies[0]?.id
  const top = topId ? idx.partById.get(topId) : undefined
  const units = data.settings.buildQty || 1

  const bc = useMemo(() => (topId ? buildCheck(data, idx, topId, units, false) : null), [data, idx, topId, units])
  const open = data.orders.filter(isOpen)
  const late = open.filter(isLate)
  const openValue = open.reduce((s, o) => s + orderValueIls(data, o), 0)
  const lowStock = data.parts.filter((p) => stockState(p) !== 'ok')
  const shortParts = bc?.rows.filter((r) => r.shortAfterOrders > 0) ?? []
  const cost = topId ? costs.get(topId) : undefined

  const subsystems = useMemo(() => {
    if (!topId) return []
    const rows = (idx.children.get(topId) ?? []).map((k) => {
      const p = idx.partById.get(k.childId)!
      return { id: p.id, name: p.name, pn: p.pn, value: (costs.get(p.id)?.planned ?? 0) * k.qty }
    })
    return rows.sort((a, b) => b.value - a.value)
  }, [topId, idx, costs])
  const maxSub = Math.max(1, ...subsystems.map((s) => s.value))
  const weightRows = useMemo(() => {
    if (!topId) return []
    const rows = (idx.children.get(topId) ?? []).map((k) => {
      const p = idx.partById.get(k.childId)!
      const w = weights.get(p.id)
      return { id: p.id, name: p.name, grams: (w?.grams ?? 0) * k.qty, missing: w?.missing ?? 0 }
    })
    return rows.sort((a, b) => b.grams - a.grams)
  }, [topId, idx, weights])
  const topWeight = topId ? weights.get(topId) : undefined
  const totalGrams = topWeight?.grams ?? 0

  if (data.parts.length === 0)
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty icon={<ListTree className="h-5 w-5" />} title="No parts yet" text="Start by adding parts, or import a BOM exported from Inventor (Settings › Import)." action={<button className="btn-primary" onClick={() => nav.go('parts')}>Add parts</button>} />
      </>
    )

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={top ? <>Planning for <b className="text-ink">{units} × {top.name}</b></> : 'Create an assembly to see build planning'}
        actions={
          topAssemblies.length > 0 && (
            <>
              <select className="input w-auto" value={topId} onChange={(e) => update((d) => void (d.settings.topAssemblyId = e.target.value))}>
                {topAssemblies.map((a) => <option key={a.id} value={a.id}>{a.pn} {a.name}</option>)}
              </select>
              <div className="flex items-center gap-1 text-sm text-ink-subtle">
                Build
                <input type="number" min={1} className="input w-16 num" value={units} onChange={(e) => update((d) => void (d.settings.buildQty = Math.max(1, parseInt(e.target.value) || 1)))} />
                units
              </div>
            </>
          )
        }
      />
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Cost per unit (planned)" value={money(cost?.planned)} sub={cost && cost.actualCoverage > 0 ? <>Actual so far {money(cost.actual)} · {Math.round(cost.actualCoverage * 100)}% known</> : 'No received orders yet'} onClick={() => nav.go('bom')} />
          <Kpi label="Can build now" value={bc ? bc.canBuild : '—'} sub={`from stock on hand, target ${units}`} tone={bc && bc.canBuild >= units ? 'green' : 'amber'} onClick={() => nav.go('bom')} />
          <Kpi label={`Parts short for ${units} units`} value={shortParts.length} sub="after open orders arrive" tone={shortParts.length ? 'red' : 'green'} onClick={() => nav.go('bom')} />
          <Kpi label="Open orders" value={open.length} sub={`${money(openValue)} on order`} onClick={() => nav.go('orders')} />
          <Kpi label="Weight per unit" value={fmtWeight(totalGrams)} sub={topWeight && topWeight.missing > 0 ? `${topWeight.missing} part${topWeight.missing > 1 ? 's' : ''} without weight` : 'all parts weighed'} tone={topWeight && topWeight.missing > 0 ? 'amber' : undefined} onClick={() => nav.go('bom')} />
          <Kpi label="Overdue orders" value={late.length} sub={late.length ? 'past expected date' : 'all on time'} tone={late.length ? 'red' : 'green'} onClick={() => nav.go('orders')} />
        </div>

        <div className="grid gap-5 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <div className="border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">Needs attention</div>
            <ul className="divide-y divide-hairline">
              {late.map((o) => (
                <Row key={o.id} icon={<Truck className="h-4 w-4 text-warning" />} onClick={() => nav.openOrder(o.id)}
                  title={<>{o.number} from {idx.supplierById.get(o.supplierId ?? '')?.name ?? '—'} is late</>} meta={`expected ${o.expectedDate}`} />
              ))}
              {shortParts.slice(0, 8).map((r) => (
                <Row key={r.part.id} icon={<AlertTriangle className="h-4 w-4 text-warning" />} onClick={() => nav.openPart(r.part.id)}
                  title={<><span className="font-mono text-xs text-ink-subtle">{r.part.pn}</span> {r.part.name}</>} meta={`short ${r.shortAfterOrders} for ${units} units`} />
              ))}
              {lowStock.filter((p) => !shortParts.some((r) => r.part.id === p.id)).slice(0, 6).map((p) => (
                <Row key={p.id} icon={<Warehouse className="h-4 w-4 text-caution" />} onClick={() => nav.openPart(p.id)}
                  title={<><span className="font-mono text-xs text-ink-subtle">{p.pn}</span> {p.name}</>} meta={`${p.onHand} on hand, keep ${Math.max(p.minStock, p.sparesTarget)}`} />
              ))}
              {late.length + shortParts.length + lowStock.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-subtle">Nothing needs attention</li>}
            </ul>
          </Card>

<div className="space-y-5 lg:col-span-2">
                      <Card>
            <div className="border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">Planned cost by subsystem</div>
            <div className="space-y-3 p-4">
              {subsystems.map((s) => (
                <button key={s.id} className="block w-full text-left" onClick={() => nav.openPart(s.id)}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate text-ink-muted">{s.name}</span>
                    <span className="num text-ink">{money(s.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-alt">
                    <div className="h-2 rounded-full bg-ink" style={{ width: `${(s.value / maxSub) * 100}%` }} />
                  </div>
                </button>
              ))}
              {subsystems.length === 0 && <div className="text-sm text-ink-subtle">No assembly selected</div>}
            </div>
          </Card>
            <Card>
              <div className="flex items-baseline justify-between border-b border-hairline px-4 py-3">
                <span className="text-[15px] font-semibold leading-6">Weight by subsystem</span>
                <span className="text-sm text-ink-muted">total <b className="text-ink">{fmtWeight(totalGrams)}</b></span>
              </div>
              <div className="space-y-3 p-4">
                {weightRows.map((s) => (
                  <button key={s.id} className="block w-full text-left" onClick={() => nav.openPart(s.id)}>
                    <div className="mb-1 flex justify-between gap-2 text-xs">
                      <span className="truncate text-ink-muted">{s.name}{s.missing > 0 && <span className="text-caution"> · {s.missing} without weight</span>}</span>
                      <span className="num whitespace-nowrap text-ink">{fmtWeight(s.grams)}{totalGrams > 0 && <span className="text-ink-subtle"> · {Math.round((s.grams / totalGrams) * 100)}%</span>}</span>
                    </div>
                    <div className="h-2 rounded-full bg-alt">
                      <div className="h-2 rounded-full bg-ink" style={{ width: `${totalGrams ? (s.grams / Math.max(...weightRows.map((x) => x.grams), 1)) * 100 : 0}%` }} />
                    </div>
                  </button>
                ))}
                {weightRows.length === 0 && <div className="text-sm text-ink-subtle">No assembly selected</div>}
                {topWeight && topWeight.missing > 0 && <button className="btn-ghost h-auto px-0" onClick={() => nav.go('bom')}>{topWeight.missing === 1 ? '1 part has' : `${topWeight.missing} parts have`} no weight yet</button>}
              </div>
            </Card>
          </div>
        </div>

        <Card>
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">
            Open orders
            <button className="btn-ghost h-auto" onClick={() => nav.go('orders')}>All orders</button>
          </div>
          <table className="grid-table">
            <tbody>
              {open.length === 0 && <tr><td className="py-6 text-center text-ink-subtle">No open orders</td></tr>}
              {open.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => nav.openOrder(o.id)}>
                  <td className="w-24 font-mono text-xs">{o.number}</td>
                  <td>{idx.supplierById.get(o.supplierId ?? '')?.name ?? '—'}</td>
                  <td><StepBar status={o.status} /></td>
                  <td><OrderStatusChip status={o.status} late={isLate(o)} /></td>
                  <td className="text-ink-subtle">{o.expectedDate ? `due ${o.expectedDate}` : ''}</td>
                  <td className="num">{money(orderValueIls(data, o))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}

function Row({ icon, title, meta, onClick }: { icon: React.ReactNode; title: React.ReactNode; meta: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-alt">
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="text-xs text-ink-subtle">{meta}</span>
      </button>
    </li>
  )
}
