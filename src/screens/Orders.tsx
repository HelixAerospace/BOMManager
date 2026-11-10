import { useMemo, useState } from 'react'
import { Paperclip, Plus, ShoppingCart } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived } from '../lib/derived'
import { fmtMoney, isLate, isOpen, nextPoNumber, orderValueIls } from '../lib/calc'
import { type BomData, type Order, uid } from '../lib/types'
import { Empty, FilterTabs, OrderStatusChip, PageHeader, SearchBox, StepBar } from '../components/ui'

export function newOrder(data: BomData, supplierId: string | null = null): Order {
  const sup = data.suppliers.find((s) => s.id === supplierId)
  const currency = sup?.currency ?? data.settings.baseCurrency
  return {
    id: uid(), number: nextPoNumber(data), supplierId, status: 'draft', currency, fxToIls: data.settings.fx[currency] ?? 1,
    orderDate: '', expectedDate: '', receivedDate: '', shipping: 0, invoiceNumber: '', invoiceTotal: null, notes: '', files: [], lines: [],
  }
}

type F = 'open' | 'draft' | 'late' | 'received' | 'all'

export default function OrdersScreen() {
  const { data, update } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const [f, setF] = useState<F>('open')
  const [q, setQ] = useState('')

  const groups: Record<F, Order[]> = useMemo(() => ({
    open: data.orders.filter(isOpen),
    draft: data.orders.filter((o) => o.status === 'draft'),
    late: data.orders.filter(isLate),
    received: data.orders.filter((o) => o.status === 'received'),
    all: data.orders,
  }), [data.orders])

  const list = useMemo(() => {
    const s = q.toLowerCase()
    return groups[f]
      .filter((o) => !s || [o.number, o.invoiceNumber, o.notes, idx.supplierById.get(o.supplierId ?? '')?.name ?? '', ...o.lines.map((l) => idx.partById.get(l.partId)?.pn ?? '')].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => b.number.localeCompare(a.number))
  }, [groups, f, q, idx])

  const add = () => {
    const o = newOrder(data)
    update((d) => void d.orders.push(o))
    nav.openOrder(o.id)
  }

  return (
    <>
      <PageHeader title="Orders" subtitle={`${groups.open.length} open · ${groups.late.length} late`} actions={<button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> New order</button>} />
      <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
        <FilterTabs value={f} onChange={setF} options={[
          { value: 'open', label: 'Open', count: groups.open.length },
          { value: 'draft', label: 'Drafts', count: groups.draft.length },
          { value: 'late', label: 'Late', count: groups.late.length },
          { value: 'received', label: 'Received', count: groups.received.length },
          { value: 'all', label: 'All', count: groups.all.length },
        ]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search PO, supplier, part, invoice…" />
      </div>
      <div className="p-6 pt-3">
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
          {list.length === 0 ? (
            <Empty icon={<ShoppingCart className="h-5 w-5" />} title="No orders here" text="Create an order, or use BOM › Build check to create draft orders for everything you’re short of." action={<button className="btn-primary" onClick={add}><Plus className="h-4 w-4" /> New order</button>} />
          ) : (
            <table className="grid-table">
              <thead>
                <tr><th>PO</th><th>Supplier</th><th>Progress</th><th>Status</th><th>Ordered</th><th>Expected</th><th className="num">Items</th><th className="num">Value</th><th className="num">Value (₪)</th><th></th></tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const goods = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) + (o.shipping || 0)
                  return (
                    <tr key={o.id} className="clickable" onClick={() => nav.openOrder(o.id)}>
                      <td className="font-mono text-xs">{o.number}</td>
                      <td>{idx.supplierById.get(o.supplierId ?? '')?.name ?? <span className="text-ink-subtle">No supplier</span>}</td>
                      <td><StepBar status={o.status} /></td>
                      <td><OrderStatusChip status={o.status} late={isLate(o)} /></td>
                      <td className="text-ink-subtle">{o.orderDate}</td>
                      <td className={isLate(o) ? 'font-medium text-warning' : 'text-ink-subtle'}>{o.expectedDate}</td>
                      <td className="num">{o.lines.length}</td>
                      <td className="num text-ink-subtle">{fmtMoney(goods, o.currency)}</td>
                      <td className="num">{fmtMoney(orderValueIls(data, o))}</td>
                      <td>{o.files.length > 0 && <Paperclip className="h-3.5 w-3.5 text-ink-subtle" />}</td>
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
