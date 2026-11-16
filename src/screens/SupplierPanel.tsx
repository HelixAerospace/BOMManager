import { ClipboardX, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { fmtMoney, isLate, partHasSupplier, syncPreferred } from '../lib/calc'
import { newNcr, reviewOverdue } from '../lib/quality'
import { AslChip, CountryInput } from '../components/quality'
import { ASL_STATUSES, type AslStatus, type Supplier, today } from '../lib/types'
import { Field, OrderStatusChip, SidePanel } from '../components/ui'
import { CURRENCIES, Section } from './PartPanel'
import { newOrder } from './Orders'

export default function SupplierPanel({ id }: { id: string }) {
  const { data, update, saveIfDirty } = useStore()
  const nav = useNav()
  const s = data.suppliers.find((x) => x.id === id)
  if (!s) return null
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K]) => update((d) => void (d.suppliers.find((x) => x.id === id)![k] = v))
  const parts = data.parts.filter((p) => partHasSupplier(p, id))
  const ncrs = data.ncrs.filter((n) => n.supplierId === id)
  const orders = data.orders.filter((o) => o.supplierId === id).sort((a, b) => b.number.localeCompare(a.number))
  const remove = () => {
    if (orders.length) return alert('This supplier has orders. Delete or reassign them first.')
    if (!confirm(`Delete ${s.name}?`)) return
    update((d) => {
      d.suppliers = d.suppliers.filter((x) => x.id !== id)
      d.parts.forEach((p) => {
        if (p.sources) p.sources = p.sources.filter((x) => x.supplierId !== id)
        if (p.supplierId === id) p.supplierId = p.sources?.[0]?.supplierId ?? null
        syncPreferred(p)
      })
    })
    nav.openSupplier(null)
    void saveIfDirty()
  }
  return (
    <SidePanel
      title={s.name}
      onClose={() => nav.openSupplier(null)}
      footerLeft={<button className="btn-ghost text-warning" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</button>}
      footerRight={
        <>
          <button className="btn" onClick={() => { const n = newNcr(data, { supplierId: id }); update((d) => void d.ncrs.push(n)); nav.openSupplier(null); nav.openNcr(n.id) }}><ClipboardX className="h-4 w-4" /> NCR</button>
          <button className="btn" onClick={() => {
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
        <Field label="Country" className="col-span-2"><CountryInput value={s.country ?? ''} onChange={(v) => set('country', v)} /></Field>
      </div>

      <Section title="Approved supplier list">
        <div className="grid grid-cols-4 gap-3">
          <Field label="Status" className="col-span-2">
            <select className="input" value={s.aslStatus ?? ''} onChange={(e) => update((d) => {
              const x = d.suppliers.find((y) => y.id === id)!
              x.aslStatus = (e.target.value || undefined) as AslStatus | undefined
              if (x.aslStatus === 'approved' && !x.approvedOn) x.approvedOn = today()
              if (x.aslStatus === 'approved' && !x.reviewDue) { const t = new Date(); t.setFullYear(t.getFullYear() + 1); x.reviewDue = t.toISOString().slice(0, 10) }
            })}>
              <option value="">Not reviewed</option>
              {ASL_STATUSES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Field>
          <div className="col-span-2 self-end pb-2"><AslChip s={s.aslStatus} />{reviewOverdue(s) && <span className="ml-2 text-xs text-caution">review overdue</span>}</div>
          <Field label="Approved for (scope)" className="col-span-4"><input className="input" value={s.approvedFor ?? ''} placeholder="e.g. COTS motors and ESCs; CNC machining to drawing" onChange={(e) => set('approvedFor', e.target.value)} /></Field>
          <Field label="Approved on" className="col-span-2"><input type="date" className="input" value={s.approvedOn ?? ''} onChange={(e) => set('approvedOn', e.target.value)} /></Field>
          <Field label="Next review" className="col-span-2"><input type="date" className="input" value={s.reviewDue ?? ''} onChange={(e) => set('reviewDue', e.target.value)} /></Field>
          <Field label="Basis of approval" className="col-span-4"><textarea className="input min-h-14" value={s.aslNotes ?? ''} placeholder="Sample parts inspected, first-article results, order history, certificates (ISO 9001)…" onChange={(e) => set('aslNotes', e.target.value)} /></Field>
        </div>
        {ncrs.length > 0 && (
          <div className="mt-3 text-sm">
            <span className="text-ink-muted">Nonconformances: </span>
            {ncrs.map((n, i) => <span key={n.id}>{i > 0 && ', '}<button className="font-mono text-xs text-accent hover:underline" onClick={() => { nav.openSupplier(null); nav.openNcr(n.id) }}>{n.number}</button>{n.status === 'open' ? ' (open)' : ''}</span>)}
          </div>
        )}
      </Section>
      <Section title="Notes"><textarea className="input min-h-16" value={s.notes} placeholder="Payment terms, contact person, shipping notes…" onChange={(e) => set('notes', e.target.value)} /></Section>
      <Section title={`Parts (${parts.length})`}>
        <ul className="space-y-1 text-sm">
          {parts.map((p) => <li key={p.id}><button className="hover:underline" onClick={() => { nav.openSupplier(null); nav.openPart(p.id) }}><span className="font-mono text-xs text-ink-subtle">{p.pn}</span> {p.name}</button> <span className="text-ink-subtle">{p.supplierPn}</span></li>)}
          {parts.length === 0 && <li className="text-ink-subtle">No parts linked yet</li>}
        </ul>
      </Section>
      <Section title={`Orders (${orders.length})`}>
        <ul className="space-y-1 text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between">
              <button className="hover:underline" onClick={() => { nav.openSupplier(null); nav.openOrder(o.id) }}><span className="font-mono text-xs">{o.number}</span> <span className="text-ink-subtle">{o.orderDate}</span></button>
              <span className="flex items-center gap-2"><span className="num text-ink-subtle">{fmtMoney(o.lines.reduce((t, l) => t + l.qty * l.unitPrice, 0) + o.shipping, o.currency)}</span><OrderStatusChip status={o.status} late={isLate(o)} /></span>
            </li>
          ))}
        </ul>
      </Section>
    </SidePanel>
  )
}
