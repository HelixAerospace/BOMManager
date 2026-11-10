import { Building2, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { fmtMoney, isOpen, orderValueIls } from '../lib/calc'
import { uid } from '../lib/types'
import { Empty, PageHeader } from '../components/ui'

export default function SuppliersScreen() {
  const { data, update } = useStore()
  const nav = useNav()
  const add = () => {
    const s = { id: uid(), name: 'New supplier', website: '', email: '', phone: '', currency: 'USD', notes: '' }
    update((d) => void d.suppliers.push(s))
    nav.openSupplier(s.id)
  }
  const list = [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <PageHeader title="Suppliers" subtitle={`${data.suppliers.length} suppliers`} actions={<button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> New supplier</button>} />
      <div className="p-6">
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
          {list.length === 0 ? (
            <Empty icon={<Building2 className="h-5 w-5" />} title="No suppliers yet" text="Add the shops and machinists you buy from, then link them to parts and orders." action={<button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> New supplier</button>} />
          ) : (
            <table className="grid-table">
              <thead><tr><th>Name</th><th>Currency</th><th className="num">Parts</th><th className="num">Open orders</th><th className="num">Total spent (₪)</th><th>Contact</th></tr></thead>
              <tbody>
                {list.map((s) => {
                  const orders = data.orders.filter((o) => o.supplierId === s.id)
                  const spent = orders.filter((o) => o.lines.some((l) => l.qtyReceived > 0)).reduce((t, o) => t + orderValueIls(data, o), 0)
                  return (
                    <tr key={s.id} className="clickable" onClick={() => nav.openSupplier(s.id)}>
                      <td className="font-medium">{s.name}</td>
                      <td className="text-ink-subtle">{s.currency}</td>
                      <td className="num">{data.parts.filter((p) => p.supplierId === s.id).length}</td>
                      <td className="num">{orders.filter(isOpen).length || ''}</td>
                      <td className="num">{spent ? fmtMoney(spent) : ''}</td>
                      <td className="text-ink-subtle">{s.email || s.phone || s.website.replace(/^https?:\/\//, '')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
