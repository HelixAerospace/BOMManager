import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { buildCheck, fmtNum, fmtPrice, isPacked, lastPriceFrom, partHasSupplier, roundToPacks } from '../lib/calc'
import { type Order, type Part, uid } from '../lib/types'
import { FilterTabs, MakeBuyChip, Modal, NumInput, SearchBox } from '../components/ui'

type F = 'supplier' | 'short' | 'all'

/** Browse the parts catalogue and add several parts to an order at once. */
export default function AddPartsDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { data, update, notify } = useStore()
  const { idx, topAssemblies } = useDerived()
  const supplier = idx.supplierById.get(order.supplierId ?? '')
  const parts = useMemo(() => data.parts.filter((p) => !idx.children.has(p.id)), [data.parts, idx])
  const fromSupplier = supplier ? parts.filter((p) => partHasSupplier(p, supplier.id)) : []

  // What is still short for the dashboard's build target (after open orders arrive).
  const topId = data.settings.topAssemblyId && idx.partById.has(data.settings.topAssemblyId) ? data.settings.topAssemblyId : topAssemblies[0]?.id
  const units = data.settings.buildQty || 1
  const shortBy = useMemo(() => {
    const m = new Map<string, number>()
    if (topId) for (const r of buildCheck(data, idx, topId, units, false).rows) if (r.shortAfterOrders > 0) m.set(r.part.id, r.shortAfterOrders)
    return m
  }, [data, idx, topId, units])

  const [f, setF] = useState<F>(fromSupplier.length ? 'supplier' : 'all')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Map<string, number>>(new Map()) // part id -> qty in pieces
  const inOrder = new Set(order.lines.map((l) => l.partId))

  const list = useMemo(() => {
    const s = q.toLowerCase()
    const base = f === 'supplier' ? fromSupplier : f === 'short' ? parts.filter((p) => shortBy.has(p.id)) : parts
    return base
      .filter((p) => !s || [p.pn, p.name, p.supplierPn].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => a.pn.localeCompare(b.pn))
  }, [f, q, parts, fromSupplier, shortBy])

  const defaultQty = (p: Part) => roundToPacks(p, shortBy.get(p.id) ?? (isPacked(p) ? p.packQty! : 1))
  const toggle = (p: Part) =>
    setPicked((m) => {
      const n = new Map(m)
      if (n.has(p.id)) n.delete(p.id)
      else n.set(p.id, defaultQty(p))
      return n
    })

  const priceFor = (p: Part) => {
    const last = lastPriceFrom(data, p.id, order.supplierId)
    if (last && last.currency === order.currency) return { value: last.unitPrice, note: `last paid ${last.date}` }
    const v = p.currency === order.currency ? p.plannedCost : (p.plannedCost * (data.settings.fx[p.currency] ?? 1)) / (data.settings.fx[order.currency] ?? 1)
    return { value: v, note: 'planned' }
  }

  const add = () => {
    const rows = [...picked.entries()]
    update((d) => {
      const o = d.orders.find((x) => x.id === order.id)!
      for (const [partId, qty] of rows) {
        const p = d.parts.find((x) => x.id === partId)!
        const existing = o.lines.find((l) => l.partId === partId)
        if (existing) existing.qty += qty
        else o.lines.push({ id: uid(), partId, qty, unitPrice: Math.round(priceFor(p).value * 10000) / 10000, qtyReceived: 0 })
      }
    })
    notify(`Added ${rows.length} part${rows.length > 1 ? 's' : ''} to ${order.number}`)
    onClose()
  }

  return (
    <Modal
      wide
      title={`Add parts to ${order.number}`}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-sm text-ink-muted">{picked.size ? `${picked.size} selected` : 'Tick the parts to add'}</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!picked.size} onClick={add}>Add {picked.size || ''} part{picked.size === 1 ? '' : 's'}</button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <FilterTabs
          value={f}
          onChange={setF}
          options={[
            ...(supplier ? [{ value: 'supplier' as F, label: `From ${supplier.name}`, count: fromSupplier.length }] : []),
            { value: 'short' as F, label: `Short for ${units} units`, count: shortBy.size },
            { value: 'all' as F, label: 'All parts', count: parts.length },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search PN, name, supplier PN…" />
      </div>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-subtle">
          {f === 'supplier' ? `No parts list ${supplier?.name} as a supplier yet. Try “All parts”.` : f === 'short' ? 'Nothing is short for the build target.' : 'No parts match.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="grid-table">
            <thead>
              <tr><th className="w-8"></th><th>Part</th><th>Type</th><th className="num">On hand</th><th className="num">Short</th><th className="num">Price ({order.currency})</th><th className="num">Qty to order</th></tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const on = picked.has(p.id)
                const pr = priceFor(p)
                const f2 = isPacked(p) ? p.packQty! : 1
                return (
                  <tr key={p.id} className={`clickable ${on ? 'bg-accent-tint' : ''}`} onClick={() => toggle(p)}>
                    <td><input type="checkbox" checked={on} onChange={() => toggle(p)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${p.pn}`} /></td>
                    <td>
                      <span className="font-mono text-xs text-ink-subtle">{p.pn}</span> {p.name}
                      {inOrder.has(p.id) && <span className="ml-2 text-xs text-ink-subtle">(already in this order)</span>}
                    </td>
                    <td><MakeBuyChip v={p.makeBuy} /></td>
                    <td className="num">{fmtNum(p.onHand)}</td>
                    <td className="num">{shortBy.has(p.id) ? <span className="font-medium text-warning">{fmtNum(shortBy.get(p.id)!)}</span> : ''}</td>
                    <td className="num whitespace-nowrap">{fmtPrice(pr.value * f2, order.currency)}{f2 > 1 ? '/pack' : ''}<div className="text-xs text-ink-subtle">{pr.note}</div></td>
                    <td className="num w-36" onClick={(e) => e.stopPropagation()}>
                      {on ? (
                        <div className="flex items-center justify-end gap-1">
                          <NumInput className="input num h-8 w-20" value={picked.get(p.id)!} min={0} onChange={(v) => setPicked((m) => new Map(m).set(p.id, v))} />
                          <span className="w-9 text-left text-xs text-ink-subtle">pcs</span>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
