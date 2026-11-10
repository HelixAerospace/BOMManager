import { PackageCheck, Send, Trash2, Truck, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived } from '../lib/derived'
import { fmtMoney, fmtNum, isLate, isPacked } from '../lib/calc'
import { type Order, type OrderStatus, today, uid } from '../lib/types'
import type { Draft } from 'immer'
import { Attachments, Field, NumInput, ORDER_STATUS, OrderStatusChip, PartPicker, SidePanel } from '../components/ui'
import { Section, CURRENCIES } from './PartPanel'

/** Sets qtyReceived on a line, books the stock difference and updates the order status. */
function receiveLine(d: Draft<import('../lib/types').BomData>, orderId: string, lineId: string, qtyReceived: number) {
  const o = d.orders.find((x) => x.id === orderId)!
  const l = o.lines.find((x) => x.id === lineId)!
  const delta = qtyReceived - l.qtyReceived
  if (!delta) return
  l.qtyReceived = qtyReceived
  const part = d.parts.find((p) => p.id === l.partId)
  if (part) part.onHand += delta
  d.stockMoves.push({ id: uid(), partId: l.partId, delta, reason: 'receive', ref: o.number, date: new Date().toISOString() })
  const all = o.lines.every((x) => x.qtyReceived >= x.qty)
  const any = o.lines.some((x) => x.qtyReceived > 0)
  if (all) {
    o.status = 'received'
    o.receivedDate ||= today()
  } else if (any) o.status = 'partial'
  else if (o.status === 'partial' || o.status === 'received') o.status = 'ordered'
}

export default function OrderPanel({ id }: { id: string }) {
  const { data, update } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const o = data.orders.find((x) => x.id === id)
  if (!o) return null
  const set = <K extends keyof Order>(k: K, v: Order[K]) => update((d) => void (d.orders.find((x) => x.id === id)![k] = v))
  const goods = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const total = goods + (o.shipping || 0)
  const rate = o.fxToIls || 1
  const inv = o.invoiceTotal
  const invDiff = inv != null && total ? inv - total : null

  const setStatus = (s: OrderStatus) =>
    update((d) => {
      const x = d.orders.find((y) => y.id === id)!
      x.status = s
      if (s === 'ordered' && !x.orderDate) {
        x.orderDate = today()
        x.fxToIls = d.settings.fx[x.currency] ?? x.fxToIls
      }
    })

  const receiveAll = () => update((d) => {
    const x = d.orders.find((y) => y.id === id)!
    for (const l of x.lines) receiveLine(d, id, l.id, l.qty)
    x.receivedDate = today()
  })

  const remove = () => {
    if (o.lines.some((l) => l.qtyReceived > 0)) return alert('This order has received items. Set received quantities back to 0 first (that also takes them out of stock), or mark it Cancelled instead.')
    if (!confirm(`Delete ${o.number}?`)) return
    update((d) => void (d.orders = d.orders.filter((x) => x.id !== id)))
    nav.openOrder(null)
  }

  const supplier = idx.supplierById.get(o.supplierId ?? '')

  return (
    <SidePanel
      wide
      onClose={() => nav.openOrder(null)}
      title={<span className="flex items-center gap-3">{o.number} <OrderStatusChip status={o.status} late={isLate(o)} /></span>}
      subtitle={supplier?.name ?? 'No supplier yet'}
      footer={
        <>
          <button className="btn-ghost text-warning" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</button>
          <div className="flex gap-2">
            {o.status === 'draft' && <button className="btn-primary" disabled={!o.lines.length} onClick={() => setStatus('ordered')}><Send className="h-4 w-4" /> Mark as ordered</button>}
            {o.status === 'ordered' && <button className="btn" onClick={() => setStatus('shipped')}><Truck className="h-4 w-4" /> Mark shipped</button>}
            {['ordered', 'shipped', 'partial'].includes(o.status) && <button className="btn-primary" onClick={receiveAll}><PackageCheck className="h-4 w-4" /> Receive everything</button>}
          </div>
        </>
      }
    >
      <div className="grid grid-cols-6 gap-3">
        <Field label="Supplier" className="col-span-3">
          <select className="input" value={o.supplierId ?? ''} onChange={(e) => update((d) => {
            const x = d.orders.find((y) => y.id === id)!
            x.supplierId = e.target.value || null
            const s = d.suppliers.find((y) => y.id === x.supplierId)
            if (s && x.status === 'draft' && !x.lines.length) {
              x.currency = s.currency
              x.fxToIls = d.settings.fx[s.currency] ?? 1
            }
          })}>
            <option value="">—</option>
            {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Status" className="col-span-3">
          <select className="input" value={o.status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
          </select>
        </Field>
        <Field label="Order date" className="col-span-2"><input type="date" className="input" value={o.orderDate} onChange={(e) => set('orderDate', e.target.value)} /></Field>
        <Field label="Expected" className="col-span-2"><input type="date" className="input" value={o.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} /></Field>
        <Field label="Received" className="col-span-2"><input type="date" className="input" value={o.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} /></Field>
        <Field label="Currency" className="col-span-2">
          <select className="input" value={o.currency} onChange={(e) => update((d) => {
            const x = d.orders.find((y) => y.id === id)!
            x.currency = e.target.value
            x.fxToIls = d.settings.fx[e.target.value] ?? 1
          })}>
            {[...new Set([...CURRENCIES, ...Object.keys(data.settings.fx)])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        {o.currency !== 'ILS' && <Field label={`Rate (₪ per 1 ${o.currency})`} className="col-span-2"><NumInput value={o.fxToIls} min={0} onChange={(v) => set('fxToIls', v)} /></Field>}
      </div>

      <Section title="Items">
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="grid-table">
            <thead>
              <tr><th>Part</th><th className="num">Qty</th><th className="num">Price ({o.currency})</th><th className="num">Line total</th><th className="num">Received</th><th></th></tr>
            </thead>
            <tbody>
              {o.lines.map((l) => {
                const p = idx.partById.get(l.partId)
                // Parts bought in packs are entered in packs here; stock and costs stay in pieces.
                const f = p && isPacked(p) ? p.packQty! : 1
                const setLine = (fn: (x: { qty: number; unitPrice: number }) => void) =>
                  update((d) => fn(d.orders.find((y) => y.id === id)!.lines.find((y) => y.id === l.id)!))
                return (
                  <tr key={l.id} className="group">
                    <td>
                      <button className="text-left hover:underline" onClick={() => { nav.openOrder(null); nav.openPart(l.partId) }}><span className="font-mono text-xs text-ink-subtle">{p?.pn}</span> {p?.name}</button>
                      {f > 1 && <div className="text-xs text-ink-subtle">in packs of {fmtNum(f)} · {fmtNum(l.qty)} pcs{l.qty % f ? <span className="text-caution"> (not whole packs)</span> : null}</div>}
                    </td>
                    <td className="num w-24">
                      <div className="flex items-center justify-end gap-1">
                        <NumInput className="cell-input num" value={l.qty / f} min={0} onChange={(v) => setLine((x) => void (x.qty = v * f))} />
                        <span className="w-9 text-left text-xs text-ink-subtle">{f > 1 ? 'packs' : 'pcs'}</span>
                      </div>
                    </td>
                    <td className="num w-32">
                      <div className="flex items-center justify-end gap-1">
                        <NumInput className="cell-input num" value={Math.round(l.unitPrice * f * 10000) / 10000} min={0} onChange={(v) => setLine((x) => void (x.unitPrice = v / f))} />
                        <span className="w-9 text-left text-xs text-ink-subtle">{f > 1 ? '/pack' : '/pc'}</span>
                      </div>
                    </td>
                    <td className="num">{fmtMoney(l.qty * l.unitPrice, o.currency)}</td>
                    <td className="num w-24">
                      <NumInput className={`cell-input num ${l.qtyReceived >= l.qty && l.qty > 0 ? 'text-tip' : ''}`} value={l.qtyReceived / f} min={0} onChange={(v) => update((d) => receiveLine(d, id, l.id, v * f))} />
                    </td>
                    <td className="w-8">
                      {l.qtyReceived === 0 && <button className="text-ink-subtle opacity-0 hover:text-warning group-hover:opacity-100" onClick={() => update((d) => { const x = d.orders.find((y) => y.id === id)!; x.lines = x.lines.filter((y) => y.id !== l.id) })}><X className="h-4 w-4" /></button>}
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td colSpan={6} className="bg-alt">
                  <PartPicker
                    parts={data.parts.filter((p) => !idx.children.has(p.id) || p.makeBuy === 'buy')}
                    exclude={new Set(o.lines.map((l) => l.partId))}
                    onPick={(p) => update((d) => {
                      const x = d.orders.find((y) => y.id === id)!
                      const price = p.currency === x.currency ? p.plannedCost : (p.plannedCost * (d.settings.fx[p.currency] ?? 1)) / (d.settings.fx[x.currency] ?? 1)
                      x.lines.push({ id: uid(), partId: p.id, qty: isPacked(p) ? p.packQty! : 1, unitPrice: Math.round(price * 10000) / 10000, qtyReceived: 0 })
                    })}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-ink-subtle">Typing a received quantity adds it to stock straight away. Parts bought in packs are ordered and received in packs; stock is counted in pieces.</p>

        <div className="mt-4 ml-auto w-80 space-y-1.5 text-sm">
          <Line label="Items">{fmtMoney(goods, o.currency)}</Line>
          <Line label="Shipping, customs & fees"><NumInput className="input num w-32 py-1" value={o.shipping} min={0} onChange={(v) => set('shipping', v)} /></Line>
          <Line label="Total (excl. VAT)"><b>{fmtMoney(total, o.currency)}</b></Line>
          {o.currency !== 'ILS' && <Line label="Total in ₪">{fmtMoney(total * rate)}</Line>}
        </div>
      </Section>

      <Section title="Invoice">
        <div className="grid grid-cols-6 gap-3">
          <Field label="Invoice number" className="col-span-2"><input className="input" value={o.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} /></Field>
          <Field label={`Invoice total excl. VAT (${o.currency})`} className="col-span-2"><NumInput value={o.invoiceTotal} min={0} placeholder="from invoice" onChange={(v) => set('invoiceTotal', v)} /></Field>
          <div className="col-span-2 self-end pb-2 text-xs">
            {invDiff != null && (Math.abs(invDiff) < 0.01 ? <span className="text-tip">✓ matches order total</span> : <span className="text-caution">{invDiff > 0 ? '+' : ''}{fmtMoney(invDiff, o.currency)} vs order total</span>)}
          </div>
        </div>
        <div className="mt-3"><Attachments files={o.files} group={o.number} onChange={(f) => set('files', f)} /></div>
      </Section>

      <Section title="Notes">
        <textarea className="input min-h-16" value={o.notes} placeholder="Tracking numbers, drawing revisions sent, contacts…" onChange={(e) => set('notes', e.target.value)} />
      </Section>
    </SidePanel>
  )
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-subtle">{label}</span>
      <span className="num">{children}</span>
    </div>
  )
}
