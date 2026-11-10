import { useMemo, useState } from 'react'
import { Boxes, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived } from '../lib/derived'
import { fmtMoney, fmtNum, nextPn, stockState, toIls } from '../lib/calc'
import { type BomData, type MakeBuy, type Part, uid } from '../lib/types'
import { Empty, FilterTabs, MakeBuyChip, PageHeader, SearchBox, StockChip } from '../components/ui'

export function newPart(data: BomData, prefix: string, makeBuy: MakeBuy): Part {
  return {
    id: uid(), pn: nextPn(data, prefix), name: '', category: prefix, makeBuy, rev: 'A', unit: 'pcs', plannedCost: 0,
    currency: data.settings.baseCurrency, supplierId: null, supplierPn: '', url: '', leadTimeDays: null, onHand: 0, location: '',
    minStock: 0, sparesTarget: 0, notes: '', files: [], createdAt: new Date().toISOString(),
  }
}

export default function PartsScreen() {
  const { data, update } = useStore()
  const nav = useNav()
  const { idx, actual } = useDerived()
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
          <div className="rounded-xl border border-zinc-200 bg-white">
            <Empty icon={<Boxes className="h-5 w-5" />} title="No parts yet" text="Add parts one by one, or import a BOM exported from Inventor in Settings." action={<button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> New part</button>} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Part number</th><th>Name</th><th>Rev</th><th>Type</th><th>Supplier</th><th className="num">Planned unit</th><th className="num">Planned (₪)</th><th className="num">Actual (₪)</th><th className="num">On hand</th><th>Stock</th><th className="num">Used in</th>
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
                      <td className="max-w-xs truncate">{p.name || <span className="text-zinc-400">Unnamed</span>}</td>
                      <td className="text-zinc-500">{p.rev}</td>
                      <td>{isAsm ? <span className="text-xs text-zinc-500">Assembly</span> : <MakeBuyChip v={p.makeBuy} />}</td>
                      <td className="whitespace-nowrap text-zinc-500">{idx.supplierById.get(p.supplierId ?? '')?.name ?? ''}</td>
                      <td className="num text-zinc-500">{p.plannedCost ? fmtMoney(p.plannedCost, p.currency) : ''}</td>
                      <td className="num">{planned ? fmtMoney(planned) : ''}</td>
                      <td className="num">
                        {a ? (
                          <span title={`from ${a.orderNumber}`}>
                            {fmtMoney(a.unitIls)}
                            {Math.abs(diff) >= 0.05 && <span className={`ml-1 text-xs ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{diff > 0 ? '+' : ''}{Math.round(diff * 100)}%</span>}
                          </span>
                        ) : ''}
                      </td>
                      <td className="num">{isAsm ? '' : fmtNum(p.onHand)}</td>
                      <td>{!isAsm && <StockChip s={stockState(p)} />}</td>
                      <td className="num text-zinc-500">{idx.parents.get(p.id)?.length || ''}</td>
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
