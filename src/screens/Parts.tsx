import { useMemo, useState } from 'react'
import { Boxes, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { displayCurrencyOf, useDerived, useMoney } from '../lib/derived'
import { fmtMoney, fmtNum, fmtWeight, isPacked, nextPn, sourcesOf, stockState, toIls } from '../lib/calc'
import { type BomData, type MakeBuy, type Part, uid } from '../lib/types'
import { Empty, FilterTabs, MakeBuyChip, PageHeader, SearchBox, StockChip } from '../components/ui'

export function newPart(data: BomData, prefix: string, makeBuy: MakeBuy): Part {
  return {
    id: uid(), pn: nextPn(data, prefix), name: '', category: prefix, makeBuy, rev: 'A', unit: 'pcs', plannedCost: 0,
    currency: displayCurrencyOf(data.settings), supplierId: null, supplierPn: '', url: '', leadTimeDays: null, onHand: 0, location: '',
    minStock: 0, sparesTarget: 0, notes: '', files: [], createdAt: new Date().toISOString(),
  }
}

export default function PartsScreen() {
  const { fmt: money, sym, cur: dispCur } = useMoney()
  const { data, update } = useStore()
  const nav = useNav()
  const { idx, actual, weights } = useDerived()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [newCat, setNewCat] = useState(data.settings.categories.find((c) => c.prefix !== 'ASM')?.prefix ?? 'PUR')

  const list = useMemo(() => {
    const s = q.toLowerCase()
    return data.parts
      .filter((p) => cat === 'all' || p.category === cat)
      .filter((p) => !s || [p.pn, p.name, p.supplierPn, p.notes].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => a.pn.localeCompare(b.pn))
  }, [data.parts, q, cat])

  const add = () => {
    const p = newPart(data, newCat, newCat === 'MEC' || newCat === 'ASM' ? 'make' : 'buy')
    update((d) => void d.parts.push(p))
    nav.openPart(p.id)
  }

  const counts = (prefix: string) => data.parts.filter((p) => p.category === prefix).length

  return (
    <>
      <PageHeader
        title="Parts"
        subtitle={`${data.parts.length} parts`}
        actions={
          <>
            <select className="input w-auto" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              {data.settings.categories.map((c) => <option key={c.prefix} value={c.prefix}>{c.prefix} · {c.name}</option>)}
            </select>
            <button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> New part</button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search PN, name, supplier PN…" />
        <FilterTabs value={cat} onChange={setCat} options={[{ value: 'all', label: 'All', count: data.parts.length }, ...data.settings.categories.filter((c) => counts(c.prefix)).map((c) => ({ value: c.prefix, label: c.prefix, count: counts(c.prefix) }))]} />
      </div>
      <div className="p-6 pt-3">
        {data.parts.length === 0 ? (
          <div className="rounded-lg border border-hairline bg-surface">
            <Empty icon={<Boxes className="h-5 w-5" />} title="No parts yet" text="Add parts one by one, or import a BOM exported from Inventor in Settings." action={<button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> New part</button>} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Part number</th><th>Name</th><th>Rev</th><th>Type</th><th>Supplier</th><th className="num">Price</th><th className="num">Planned ({sym})</th><th className="num">Actual ({sym})</th><th className="num">Weight</th><th className="num">On hand</th><th>Stock</th><th className="num">Used in</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const a = actual.get(p.id)
                  const planned = toIls(data, p.plannedCost, p.currency)
                  const diff = a && planned ? (a.unitIls - planned) / planned : 0
                  const isAsm = idx.children.has(p.id)
                  return (
                    <tr key={p.id} className="clickable" onClick={() => nav.openPart(p.id)}>
                      <td className="font-mono text-xs">{p.pn}</td>
                      <td className="max-w-xs truncate">{p.name || <span className="text-ink-subtle">Unnamed</span>}</td>
                      <td className="text-ink-subtle">{p.rev}</td>
                      <td>{isAsm ? <span className="text-xs text-ink-subtle">Assembly</span> : <MakeBuyChip v={p.makeBuy} />}</td>
                      <td className="whitespace-nowrap text-ink-subtle">{idx.supplierById.get(p.supplierId ?? '')?.name ?? ''}{sourcesOf(p).length > 1 && <span className="ml-1 text-xs" title={sourcesOf(p).map((x) => idx.supplierById.get(x.supplierId ?? '')?.name).filter(Boolean).join(', ')}>+{sourcesOf(p).length - 1}</span>}</td>
                      <td className="num text-ink-subtle">{isPacked(p) && p.packPrice != null ? <span title={`${fmtMoney(p.plannedCost, p.currency)} per piece`}>{fmtMoney(p.packPrice, p.currency)} / {fmtNum(p.packQty!)}</span> : p.plannedCost ? fmtMoney(p.plannedCost, p.currency) : ''}</td>
                      <td className="num">{planned ? money(planned) : ''}</td>
                      <td className="num">
                        {a ? (
                          <span title={`from ${a.orderNumber}`}>
                            {money(a.unitIls)}
                            {Math.abs(diff) >= 0.05 && <span className={`ml-1 text-xs ${diff > 0 ? 'text-warning' : 'text-tip'}`}>{diff > 0 ? '+' : ''}{Math.round(diff * 100)}%</span>}
                          </span>
                        ) : ''}
                      </td>
                      <td className="num">{isAsm ? <span className="text-ink-muted">{fmtWeight(weights.get(p.id)?.grams)}</span> : p.weight != null ? fmtWeight(p.weight) : <span className="text-ink-subtle">—</span>}</td>
                      <td className="num">{isAsm ? '' : fmtNum(p.onHand)}</td>
                      <td>{!isAsm && <StockChip s={stockState(p)} />}</td>
                      <td className="num text-ink-subtle">{idx.parents.get(p.id)?.length || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
