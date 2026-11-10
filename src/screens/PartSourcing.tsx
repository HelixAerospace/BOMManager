import { ExternalLink, Plus, Star, X } from 'lucide-react'
import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived, useMoney } from '../lib/derived'
import { fmtNum, fmtPrice, isPacked, priceHistory, sourcesOf, syncPreferred, type PricePoint } from '../lib/calc'
import { type Part, type PartSource, uid } from '../lib/types'
import { NumInput, OrderStatusChip } from '../components/ui'

/** Every supplier a part can be bought from. The starred one is preferred (used for build-check draft orders). */
export function SuppliersEditor({ part }: { part: Part }) {
  const { data, update } = useStore()
  const sources = sourcesOf(part)
  const history = useMemo(() => priceHistory(data, part.id), [data, part.id])
  const { conv, cur } = useMoney()

  // Make sure the part has its own sources list before editing it.
  const edit = (fn: (list: PartSource[], p: Part) => void) =>
    update((d) => {
      const p = d.parts.find((x) => x.id === part.id)!
      if (!p.sources || !p.sources.length) p.sources = sourcesOf(p).map((s) => ({ ...s, id: s.id.startsWith('legacy-') ? uid() : s.id }))
      fn(p.sources, p)
      syncPreferred(p)
    })

  return (
    <div>
      {sources.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="grid-table table-fixed">
            <colgroup><col className="w-11" /><col className="w-[24%]" /><col className="w-[19%]" /><col className="w-[12%]" /><col className="w-[17%]" /><col /><col className="w-10" /></colgroup>
            <thead>
              <tr><th></th><th>Supplier</th><th>Supplier part no.</th><th className="num">Lead (days)</th><th className="num">Last paid</th><th>Link</th><th></th></tr>
            </thead>
            <tbody>
              {sources.map((s, i) => {
                const preferred = s.supplierId != null && s.supplierId === part.supplierId
                const last = [...history].reverse().find((h) => h.supplierId === s.supplierId)
                return (
                  <tr key={s.id}>
                    <td>
                      <button
                        className={`btn-icon h-7 w-7 ${preferred ? 'text-accent' : 'text-ink-subtle'}`}
                        aria-label={preferred ? 'Preferred supplier' : 'Make preferred supplier'}
                        title={preferred ? 'Preferred supplier' : 'Make preferred'}
                        aria-pressed={preferred}
                        onClick={() => edit((_, p) => void (p.supplierId = s.supplierId))}
                      >
                        <Star className="h-4 w-4" fill={preferred ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td>
                      <select className="input h-8" value={s.supplierId ?? ''} onChange={(e) => edit((list, p) => {
                        const wasPreferred = p.supplierId === list[i].supplierId
                        list[i].supplierId = e.target.value || null
                        if (wasPreferred) p.supplierId = list[i].supplierId
                      })}>
                        <option value="">Choose…</option>
                        {data.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                    <td><input className="input h-8" value={s.supplierPn} onChange={(e) => edit((list) => void (list[i].supplierPn = e.target.value))} /></td>
                    <td><NumInput className="input num h-8" value={s.leadTimeDays} min={0} onChange={(v) => edit((list) => void (list[i].leadTimeDays = v))} /></td>
                    <td className="num whitespace-nowrap">
                      {last ? (
                        <span title={`${last.orderNumber}, ordered ${last.date}`}>
                          {fmtPrice(last.unitPrice * (isPacked(part) ? part.packQty! : 1), last.currency)}{isPacked(part) ? '/pack' : ''}
                          <div className="text-xs text-ink-subtle">{last.date}{last.currency !== cur ? ` · ≈ ${fmtPrice(conv(last.unitIls), cur)}/pc` : ''}</div>
                        </span>
                      ) : <span className="text-ink-subtle">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <input className="input h-8" value={s.url} placeholder="https://" onChange={(e) => edit((list) => void (list[i].url = e.target.value))} />
                        {/^https?:\/\//.test(s.url) && <a className="btn-icon" href={s.url} target="_blank" rel="noreferrer" aria-label="Open link"><ExternalLink className="h-4 w-4" /></a>}
                      </div>
                    </td>
                    <td>
                      <button className="btn-icon h-7 w-7 hover:text-warning" aria-label="Remove supplier" title="Remove supplier" onClick={() => edit((list, p) => {
                        const [removed] = list.splice(i, 1)
                        if (removed.supplierId === p.supplierId) p.supplierId = list[0]?.supplierId ?? null
                      })}>
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <button
        className="btn mt-2"
        onClick={() => edit((list, p) => {
          const used = new Set(list.map((s) => s.supplierId))
          const next = data.suppliers.find((s) => !used.has(s.id))
          list.push({ id: uid(), supplierId: next?.id ?? null, supplierPn: '', url: '', leadTimeDays: null, notes: '' })
          if (!p.supplierId) p.supplierId = next?.id ?? null
        })}
      >
        <Plus className="h-4 w-4" /> Add supplier
      </button>
      {sources.length > 1 && <p className="mt-2 text-xs text-ink-subtle">The starred supplier is preferred: build-check draft orders go to it.</p>}
    </div>
  )
}

const MARKERS = ['circle', 'square', 'diamond', 'triangle'] as const
const SHADES = ['var(--ui-ink)', 'var(--ui-accent)', 'var(--ui-ink-muted)', 'var(--ui-ink-subtle)']

/** Price paid over time (landed cost per piece, in the display currency), one series per supplier. */
export function PriceHistory({ part }: { part: Part }) {
  const { data } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const { conv, cur } = useMoney()
  const money = (ils: number) => fmtPrice(conv(ils), cur)
  const history = useMemo(() => priceHistory(data, part.id), [data, part.id])
  const drafts = data.orders.filter((o) => o.status === 'draft' && o.lines.some((l) => l.partId === part.id))
  const supplierName = (id: string | null) => idx.supplierById.get(id ?? '')?.name ?? 'No supplier'

  const series = useMemo(() => {
    const m = new Map<string, PricePoint[]>()
    for (const h of history.filter((x) => x.date)) {
      const k = h.supplierId ?? ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(h)
    }
    return [...m.entries()].map(([k, pts], i) => ({ supplierId: k || null, pts, marker: MARKERS[i % 4], shade: SHADES[i % 4] }))
  }, [history])

  if (!history.length && !drafts.length) return <p className="text-sm text-ink-subtle">No orders yet. Each order you place adds a point here with its date, supplier and price.</p>

  // Per-supplier summary
  const summary = series.map((s) => {
    const vals = s.pts.map((p) => p.landedIls)
    return { ...s, last: s.pts[s.pts.length - 1], min: Math.min(...vals), count: s.pts.length }
  })
  const cheapest = summary.length > 1 ? summary.reduce((a, b) => (b.last.landedIls < a.last.landedIls ? b : a)) : null
  const first = history.find((h) => h.date)
  const last = [...history].reverse().find((h) => h.date)
  const change = first && last && first !== last ? (last.landedIls - first.landedIls) / first.landedIls : null

  return (
    <div className="space-y-4">
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {summary.map((s) => (
            <div key={s.supplierId ?? 'none'} className="rounded-lg border border-hairline px-3 py-2">
              <div className="flex items-center gap-1.5 font-medium"><Marker kind={s.marker} color={s.shade} /> {supplierName(s.supplierId)}</div>
              <div className="text-ink-muted">last {money(s.last.landedIls)}/pc · {s.last.date}</div>
              <div className="text-xs text-ink-subtle">{s.count} order{s.count > 1 ? 's' : ''} · lowest {money(s.min)}{cheapest === s ? ' · cheapest now' : ''}</div>
            </div>
          ))}
          {change != null && (
            <div className="rounded-lg border border-hairline px-3 py-2">
              <div className="font-medium">Since first order</div>
              <div className={change > 0.02 ? 'text-caution' : 'text-ink-muted'}>{change > 0 ? '+' : ''}{Math.round(change * 100)}% per piece</div>
              <div className="text-xs text-ink-subtle">{first!.date} → {last!.date}</div>
            </div>
          )}
        </div>
      )}

      {history.filter((h) => h.date).length > 1 && <Chart series={series} conv={conv} cur={cur} supplierName={supplierName} />}

      <div className="overflow-hidden rounded-lg border border-hairline">
        <table className="grid-table">
          <thead>
            <tr><th>Ordered</th><th>PO</th><th>Supplier</th><th className="num">Qty</th><th className="num">Price paid</th><th className="num">Landed / pc</th><th>Status</th></tr>
          </thead>
          <tbody>
            {[...history].reverse().map((h) => (
              <tr key={h.orderId + h.unitPrice} className="clickable" onClick={() => { nav.openPart(null); nav.openOrder(h.orderId) }}>
                <td className="whitespace-nowrap">{h.date || <span className="text-ink-subtle">no date</span>}</td>
                <td className="font-mono text-xs">{h.orderNumber}</td>
                <td className="text-ink-muted">{supplierName(h.supplierId)}</td>
                <td className="num">{isPacked(part) ? `${fmtNum(h.qty / part.packQty!)} packs` : fmtNum(h.qty)}</td>
                <td className="num">{fmtPrice(h.unitPrice * (isPacked(part) ? part.packQty! : 1), h.currency)}{isPacked(part) ? '/pack' : ''}</td>
                <td className="num font-medium" title="Price per piece including its share of shipping and fees">{money(h.landedIls)}</td>
                <td><OrderStatusChip status={h.status} /></td>
              </tr>
            ))}
            {drafts.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => { nav.openPart(null); nav.openOrder(o.id) }}>
                <td className="text-ink-subtle">not ordered yet</td>
                <td className="font-mono text-xs">{o.number}</td>
                <td className="text-ink-muted">{supplierName(o.supplierId)}</td>
                <td className="num" colSpan={3}></td>
                <td><OrderStatusChip status="draft" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Marker({ kind, color, x = 6, y = 6, r = 4 }: { kind: (typeof MARKERS)[number]; color: string; x?: number; y?: number; r?: number }) {
  const shape =
    kind === 'circle' ? <circle cx={x} cy={y} r={r} fill={color} /> :
    kind === 'square' ? <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill={color} /> :
    kind === 'diamond' ? <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} fill={color} /> :
    <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} fill={color} />
  if (x !== 6 || y !== 6) return shape
  return <svg width="12" height="12" aria-hidden>{shape}</svg>
}

function Chart({ series, conv, cur, supplierName }: {
  series: { supplierId: string | null; pts: PricePoint[]; marker: (typeof MARKERS)[number]; shade: string }[]
  conv: (ils: number) => number; cur: string; supplierName: (id: string | null) => string
}) {
  const W = 640, H = 200, L = 56, R = 12, T = 12, B = 28
  const all = series.flatMap((s) => s.pts)
  const t = (d: string) => new Date(d + 'T00:00:00').getTime()
  const t0 = Math.min(...all.map((p) => t(p.date)))
  const t1 = Math.max(...all.map((p) => t(p.date)))
  const vals = all.map((p) => conv(p.landedIls))
  let v0 = Math.min(...vals), v1 = Math.max(...vals)
  const pad = (v1 - v0) * 0.15 || v1 * 0.1 || 1
  v0 = Math.max(0, v0 - pad); v1 = v1 + pad
  const X = (d: string) => L + (t1 === t0 ? (W - L - R) / 2 : ((t(d) - t0) / (t1 - t0)) * (W - L - R))
  const Y = (v: number) => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B)
  const ticks = [0, 0.5, 1].map((f) => v0 + (v1 - v0) * f)
  const fmtV = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: v < 10 ? 2 : 0 }).format(v)
  const dates = [...new Set(all.map((p) => p.date))].sort()
  const dateTicks = dates.length <= 4 ? dates : [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]]
  return (
    <figure className="rounded-lg border border-hairline p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price paid per piece over time">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--ui-hairline)" />
            <text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ui-ink-subtle)">{fmtV(v)}</text>
          </g>
        ))}
        {dateTicks.map((d, i) => <text key={d} x={X(d)} y={H - 8} textAnchor={dateTicks.length > 1 && i === 0 ? 'start' : dateTicks.length > 1 && i === dateTicks.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--ui-ink-subtle)">{d}</text>)}
        {series.map((s) => (
          <g key={s.supplierId ?? 'none'}>
            {s.pts.length > 1 && <polyline fill="none" stroke={s.shade} strokeWidth="1.5" points={s.pts.map((p) => `${X(p.date)},${Y(conv(p.landedIls))}`).join(' ')} />}
            {s.pts.map((p) => (
              <g key={p.orderId}>
                <title>{`${supplierName(s.supplierId)} · ${p.orderNumber} · ${p.date} · ${fmtV(conv(p.landedIls))}/pc`}</title>
                <Marker kind={s.marker} color={s.shade} x={X(p.date)} y={Y(conv(p.landedIls))} r={4} />
              </g>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
        <span>Landed price per piece ({cur}), by order date</span>
        {series.map((s) => <span key={s.supplierId ?? 'none'} className="inline-flex items-center gap-1"><Marker kind={s.marker} color={s.shade} /> {supplierName(s.supplierId)}</span>)}
      </figcaption>
    </figure>
  )
}
