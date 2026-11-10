import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { fmtMoney, isLate } from '../lib/calc'
import type { Supplier } from '../lib/types'
import { Field, OrderStatusChip, SidePanel } from '../components/ui'
import { CURRENCIES, Section } from './PartPanel'
import { newOrder } from './Orders'

export default function SupplierPanel({ id }: { id: string }) {
  const { data, update } = useStore()
  const nav = useNav()
  const s = data.suppliers.find((x) => x.id === id)
  if (!s) return null
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K]) => update((d) => void (d.suppliers.find((x) => x.id === id)![k] = v))
  const parts = data.parts.filter((p) => p.supplierId === id)
  const orders = data.orders.filter((o) => o.supplierId === id).sort((a, b) => b.number.localeCompare(a.number))
  const remove = () => {
    if (orders.length) return alert('This supplier has orders. Delete or reassign them first.')
    if (!confirm(`Delete ${s.name}?`)) return
    update((d) => {
      d.suppliers = d.suppliers.filter((x) => x.id !== id)
      d.parts.forEach((p) => { if (p.supplierId === id) p.supplierId = null })
    })
    nav.openSupplier(null)
  }
  return (
    <SidePanel
      title={s.name}
      onClose={() => nav.openSupplier(null)}
      footer={
        <>
          <button className="btn-ghost text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</button>
          <button className="btn-primary" onClick={() => {
            const o = newOrder(data, id)
            update((d) => void d.orders.push(o))
            nav.openSupplier(null)
            nav.openOrder(o.id)
          }}><Plus className="h-4 w-4" /> New order</button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-3">
        <Field label="Name" className="col-span-3"><input autoFocus={s.name === 'New supplier'} className="input" value={s.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Currency">
          <select className="input" value={s.currency} onChange={(e) => set('currency', e.target.value)}>
            {[...new Set([...CURRENCIES, ...Object.keys(data.settings.fx)])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Website" className="col-span-4"><input className="input" value={s.website} onChange={(e) => set('website', e.target.value)} /></Field>
        <Field label="Email" className="col-span-2"><input className="input" value={s.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone" className="col-span-2"><input className="input" value={s.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      <Section title="Notes"><textarea className="input min-h-16" value={s.notes} placeholder="Payment terms, contact person, shipping notes…" onChange={(e) => set('notes', e.target.value)} /></Section>
      <Section title={`Parts (${parts.length})`}>
        <ul className="space-y-1 text-sm">
          {parts.map((p) => <li key={p.id}><button className="hover:underline" onClick={() => { nav.openSupplier(null); nav.openPart(p.id) }}><span className="font-mono text-xs text-zinc-500">{p.pn}</span> {p.name}</button> <span className="text-zinc-400">{p.supplierPn}</span></li>)}
          {parts.length === 0 && <li className="text-zinc-400">No parts linked yet</li>}
        </ul>
      </Section>
      <Section title={`Orders (${orders.length})`}>
        <ul className="space-y-1 text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between">
              <button className="hover:underline" onClick={() => { nav.openSupplier(null); nav.openOrder(o.id) }}><span className="font-mono text-xs">{o.number}</span> <span className="text-zinc-500">{o.orderDate}</span></button>
              <span className="flex items-center gap-2"><span className="num text-zinc-500">{fmtMoney(o.lines.reduce((t, l) => t + l.qty * l.unitPrice, 0) + o.shipping, o.currency)}</span><OrderStatusChip status={o.status} late={isLate(o)} /></span>
            </li>
          ))}
        </ul>
      </Section>
    </SidePanel>
  )
}
