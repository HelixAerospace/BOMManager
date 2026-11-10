import { useMemo, useState } from 'react'
import { Warehouse } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived, useMoney } from '../lib/derived'
import { fmtMoney, fmtNum, stockState, toIls } from '../lib/calc'
import { uid } from '../lib/types'
import { Card, Empty, FilterTabs, NumInput, PageHeader, SearchBox, StockChip } from '../components/ui'

type F = 'all' | 'attention' | 'spares'

export default function InventoryScreen() {
  const { fmt: money, sym, cur: dispCur } = useMoney()
  const { data, update } = useStore()
  const nav = useNav()
  const { idx, onOrder, actual } = useDerived()
  const [f, setF] = useState<F>('all')
  const [q, setQ] = useState('')
  const items = data.parts.filter((p) => !idx.children.has(p.id))

  const list = useMemo(() => {
    const s = q.toLowerCase()
    return items
      .filter((p) => f === 'all' || (f === 'attention' ? stockState(p) !== 'ok' : p.sparesTarget > 0))
      .filter((p) => !s || [p.pn, p.name, p.location].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => a.pn.localeCompare(b.pn))
  }, [items, f, q])

  const value = items.reduce((s, p) => s + p.onHand * (actual.get(p.id)?.unitIls ?? toIls(data, p.plannedCost, p.currency)), 0)
  const attention = items.filter((p) => stockState(p) !== 'ok').length

  const adjust = (id: string, v: number) =>
    update((d) => {
      const p = d.parts.find((x) => x.id === id)!
      const delta = v - p.onHand
      if (!delta) return
      p.onHand = v
      d.stockMoves.push({ id: uid(), partId: id, delta, reason: 'adjust', ref: 'Stock count', date: new Date().toISOString() })
    })

  const moves = [...data.stockMoves].reverse().slice(0, 12)

  return (
    <>
      <PageHeader title="Inventory" subtitle={`${items.length} stocked parts · ${money(value)} on hand · ${attention} need attention`} />
      <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
        <FilterTabs value={f} onChange={setF} options={[{ value: 'all', label: 'All', count: items.length }, { value: 'attention', label: 'Low / out', count: attention }, { value: 'spares', label: 'Spares tracked', count: items.filter((p) => p.sparesTarget > 0).length }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search PN, name, location…" />
      </div>
      <div className="grid gap-5 p-6 pt-3 xl:grid-cols-4">
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface xl:col-span-3">
          {list.length === 0 ? (
            <Empty icon={<Warehouse className="h-5 w-5" />} title="Nothing here" text="Stock appears when you receive orders, or type counts straight into the On hand column." />
          ) : (
            <table className="grid-table">
              <thead>
                <tr><th>Part</th><th>Location</th><th className="num">On hand</th><th className="num">Min</th><th className="num">Spares</th><th className="num">On order</th><th>Status</th></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td><button className="text-left hover:underline" onClick={() => nav.openPart(p.id)}><span className="font-mono text-xs text-ink-subtle">{p.pn}</span> {p.name}</button></td>
                    <td className="text-ink-subtle">{p.location}</td>
                    <td className="num w-24"><NumInput className="cell-input num font-medium" value={p.onHand} onChange={(v) => adjust(p.id, v)} /></td>
                    <td className="num w-20"><NumInput className="cell-input num text-ink-subtle" value={p.minStock} min={0} onChange={(v) => update((d) => void (d.parts.find((x) => x.id === p.id)!.minStock = v))} /></td>
                    <td className="num w-20"><NumInput className="cell-input num text-ink-subtle" value={p.sparesTarget} min={0} onChange={(v) => update((d) => void (d.parts.find((x) => x.id === p.id)!.sparesTarget = v))} /></td>
                    <td className="num text-ink-subtle">{onOrder.get(p.id) ? fmtNum(onOrder.get(p.id)!) : ''}</td>
                    <td><StockChip s={stockState(p)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Card className="h-fit">
          <div className="border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">Recent stock movements</div>
          <ul className="divide-y divide-hairline text-sm">
            {moves.length === 0 && <li className="px-4 py-6 text-center text-ink-subtle">None yet</li>}
            {moves.map((m) => {
              const p = idx.partById.get(m.partId)
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <div className="min-w-0">
                    <div className="truncate"><span className="font-mono text-xs text-ink-subtle">{p?.pn}</span> {p?.name}</div>
                    <div className="text-xs text-ink-subtle">{new Date(m.date).toLocaleDateString()} · {m.ref}</div>
                  </div>
                  <span className={`num font-medium ${m.delta > 0 ? 'text-tip' : 'text-warning'}`}>{m.delta > 0 ? '+' : ''}{fmtNum(m.delta)}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </>
  )
}
