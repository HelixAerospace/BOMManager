import { Trash2, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived, useMoney } from '../lib/derived'
import { fmtMoney, fmtNum, fmtWeight, nextPn, stockState, toIls, weightBySource } from '../lib/calc'
import { WeightSourceStats } from '../components/weight'
import { type Part, type WeightSource, WEIGHT_SOURCES, uid } from '../lib/types'
import { SuppliersEditor, PriceHistory } from './PartSourcing'
import { Attachments, Field, FilterTabs, MakeBuyChip, NumInput, OrderStatusChip, SidePanel, StockChip } from '../components/ui'

export const CURRENCIES = ['ILS', 'USD', 'EUR', 'CNY', 'GBP']

export default function PartPanel({ id }: { id: string }) {
  const { fmt: money, sym, cur: dispCur } = useMoney()
  const { data, update, saveIfDirty } = useStore()
  const nav = useNav()
  const { idx, costs, actual, onOrder, weights } = useDerived()
  const p = idx.partById.get(id)
  if (!p) return null
  const set = <K extends keyof Part>(k: K, v: Part[K]) => update((d) => void (d.parts.find((x) => x.id === id)![k] = v))
  const isAsm = idx.children.has(id)
  const cost = costs.get(id)
  const w = weights.get(id)
  const a = actual.get(id)
  const usedIn = idx.parents.get(id) ?? []
  const orderLines = data.orders.flatMap((o) => o.lines.filter((l) => l.partId === id).map((l) => ({ o, l }))).sort((x, y) => (y.o.orderDate || '9').localeCompare(x.o.orderDate || '9'))
  const moves = data.stockMoves.filter((m) => m.partId === id).slice(-8).reverse()

  // Switching category gives the part the next free number in the new category (e.g. PUR-00012 → MEC-00004),
  // as long as its number is still an automatic one (PREFIX-digits). A hand-typed part number is kept.
  const changeCategory = (prefix: string) =>
    update((d) => {
      const x = d.parts.find((y) => y.id === id)!
      const auto = /^[A-Z0-9]+-\d+$/i.test(x.pn.trim())
      x.category = prefix
      if (auto && !x.pn.toUpperCase().startsWith(prefix.toUpperCase() + '-')) {
        x.pn = nextPn({ ...d, parts: d.parts.filter((y) => y.id !== id) } as never, prefix)
      }
    })

  const packMode = p.packQty != null
  const setPack = (price: number, qty: number) =>
    update((d) => {
      const x = d.parts.find((y) => y.id === id)!
      x.packPrice = price
      x.packQty = qty
      x.plannedCost = qty > 0 ? price / qty : 0
    })

  const setOnHand = (v: number) =>
    update((d) => {
      const part = d.parts.find((x) => x.id === id)!
      const delta = v - part.onHand
      if (!delta) return
      part.onHand = v
      d.stockMoves.push({ id: uid(), partId: id, delta, reason: 'adjust', ref: 'Manual adjustment', date: new Date().toISOString() })
    })

  const remove = () => {
    const inOrders = orderLines.length
    const msg = `Delete ${p.pn} ${p.name}?` + (usedIn.length ? `\nIt will be removed from ${usedIn.length} assembl${usedIn.length > 1 ? 'ies' : 'y'}.` : '') + (isAsm ? '\nIts own BOM lines will be deleted (the child parts are kept).' : '')
    if (inOrders) return alert(`${p.pn} appears in ${inOrders} order line(s). Remove it from those orders first.`)
    if (!confirm(msg)) return
    update((d) => {
      d.parts = d.parts.filter((x) => x.id !== id)
      d.bom = d.bom.filter((l) => l.parentId !== id && l.childId !== id)
    })
    nav.openPart(null)
    void saveIfDirty()
  }

  return (
    <SidePanel
      wide
      onClose={() => nav.openPart(null)}
      title={<span className="flex items-center gap-2"><span className="font-mono text-sm text-ink-subtle">{p.pn}</span> {p.name || 'Unnamed part'}</span>}
      subtitle={<span className="flex items-center gap-2">{isAsm ? 'Assembly' : <MakeBuyChip v={p.makeBuy} />}{!isAsm && <StockChip s={stockState(p)} />} rev {p.rev}</span>}
      footerLeft={<button className="btn-ghost text-warning" onClick={remove}><Trash2 className="h-4 w-4" /> Delete part</button>}
    >
      <div className="grid grid-cols-5 gap-3 rounded-lg bg-alt p-3 text-sm">
        <Stat label="Planned unit cost" value={money(cost?.planned)} />
        <Stat label="Actual unit cost" value={isAsm ? (cost && cost.actualCoverage > 0 ? money(cost.actual) : '—') : a ? money(a.unitIls) : '—'} sub={a ? `last: ${a.orderNumber}` : isAsm && cost ? `${Math.round(cost.actualCoverage * 100)}% known` : undefined} />
        <Stat label="On hand" value={isAsm ? '—' : fmtNum(p.onHand)} sub={p.location || undefined} />
        <Stat label="On order" value={fmtNum(onOrder.get(id) ?? 0)} />
        <Stat label="Weight" value={fmtWeight(isAsm ? w?.grams : p.weight)} sub={isAsm && w && w.missing ? `${w.missing} missing` : undefined} />
      </div>

      <Section title="Details">
        <div className="grid grid-cols-6 gap-3">
          <Field label="Part number" className="col-span-2"><input className="input font-mono" value={p.pn} onChange={(e) => set('pn', e.target.value)} /></Field>
          <Field label="Name" className="col-span-3"><input autoFocus={!p.name} className="input" value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Rev"><input className="input" value={p.rev} onChange={(e) => set('rev', e.target.value)} /></Field>
          <Field label="Category" className="col-span-2">
            <select className="input" value={p.category} onChange={(e) => changeCategory(e.target.value)}>
              {data.settings.categories.map((c) => <option key={c.prefix} value={c.prefix}>{c.prefix} · {c.name}</option>)}
            </select>
          </Field>
          <Field label="Make or buy" className="col-span-2">
            <select className="input" value={p.makeBuy} onChange={(e) => set('makeBuy', e.target.value as Part['makeBuy'])}>
              <option value="make">Custom (made to my drawing)</option>
              <option value="buy">Off-the-shelf</option>
            </select>
          </Field>
          <Field label="Unit" className="col-span-2"><input className="input" value={p.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
          <Field label={isAsm ? 'Extra weight (g), e.g. glue, wiring' : 'Weight per unit (g)'} className="col-span-2"><NumInput value={p.weight ?? null} min={0} placeholder="grams" onChange={(v) => set('weight', v)} /></Field>
          <div className="col-span-4">
            <span className="label">{isAsm ? 'Source of extra weight' : 'Weight source'}</span>
            <FilterTabs
              value={p.weightSource ?? ''}
              onChange={(v) => set('weightSource', v === p.weightSource ? null : (v as WeightSource))}
              options={WEIGHT_SOURCES.map((x) => ({ value: x.value, label: x.label }))}
            />
          </div>
          <div className="col-span-6 text-sm text-ink-muted">
            {isAsm ? <>Total {fmtWeight(w?.grams)} per unit{w && w.missing > 0 && <span className="text-caution"> · {w.missing} part{w.missing > 1 ? 's' : ''} below have no weight</span>}</> : p.weight == null ? <span className="text-caution">No weight yet</span> : !p.weightSource ? <span className="text-ink-subtle">Choose where this weight comes from.</span> : null}
          </div>
          {isAsm && w && w.grams > 0 && <div className="col-span-6 rounded-lg border border-hairline p-3"><WeightSourceStats b={weightBySource(idx, id)} compact /></div>}
        </div>
      </Section>

      <Section title="Cost">
        <div className="grid grid-cols-6 gap-3">
          {!isAsm && (
            <div className="col-span-6">
              <FilterTabs
                value={packMode ? 'pack' : 'piece'}
                onChange={(v) => update((d) => {
                  const x = d.parts.find((y) => y.id === id)!
                  if (v === 'pack') {
                    x.packQty = x.packQty ?? 100
                    x.packPrice = x.packPrice ?? Math.round(x.plannedCost * x.packQty * 100) / 100
                    x.plannedCost = x.packPrice / x.packQty
                  } else {
                    x.packQty = null
                    x.packPrice = null
                  }
                })}
                options={[{ value: 'piece', label: 'Priced per piece' }, { value: 'pack', label: 'Bought in packs' }]}
              />
            </div>
          )}
          {packMode && !isAsm ? (
            <>
              <Field label="Pack price" className="col-span-2"><NumInput value={p.packPrice ?? null} min={0} onChange={(v) => setPack(v, p.packQty ?? 1)} /></Field>
              <Field label="Pieces per pack"><NumInput value={p.packQty ?? null} min={1} onChange={(v) => setPack(p.packPrice ?? 0, Math.max(1, Math.round(v)))} /></Field>
            </>
          ) : (
            <Field label={isAsm ? 'Extra cost per unit (labour etc.)' : 'Planned cost per piece'} className="col-span-3"><NumInput value={p.plannedCost} min={0} onChange={(v) => set('plannedCost', v)} /></Field>
          )}
          <Field label="Currency">
            <select className="input" value={p.currency} onChange={(e) => set('currency', e.target.value)}>
              {[...new Set([...CURRENCIES, ...Object.keys(data.settings.fx)])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <div className="col-span-2 self-end pb-2 text-sm text-ink-muted">
            {packMode && !isAsm && p.packQty ? <>= <b className="text-ink">{fmtMoney(p.plannedCost, p.currency)}</b> per piece</> : null}
            {p.currency !== dispCur && p.plannedCost ? <div className="text-xs text-ink-subtle">≈ {money(toIls(data, p.plannedCost, p.currency))}{packMode ? ' per piece' : ''}</div> : null}
          </div>
        </div>
      </Section>

      {!isAsm && (
        <Section title="Suppliers">
          <SuppliersEditor part={p} />
        </Section>
      )}

      {!isAsm && (
        <Section title="Stock & spares">
          <div className="grid grid-cols-4 gap-3">
            <Field label="On hand"><NumInput value={p.onHand} onChange={setOnHand} /></Field>
            <Field label="Location"><input className="input" value={p.location} placeholder="Shelf B2" onChange={(e) => set('location', e.target.value)} /></Field>
            <Field label="Reorder below (min)"><NumInput value={p.minStock} min={0} onChange={(v) => set('minStock', v)} /></Field>
            <Field label="Spares to keep"><NumInput value={p.sparesTarget} min={0} onChange={(v) => set('sparesTarget', v)} /></Field>
          </div>
          {moves.length > 0 && (
            <div className="mt-3 text-xs text-ink-subtle">
              {moves.map((m) => (
                <div key={m.id} className="flex justify-between border-b border-hairline py-1">
                  <span>{new Date(m.date).toLocaleDateString()} · {m.ref}</span>
                  <span className={`num ${m.delta > 0 ? 'text-tip' : 'text-warning'}`}>{m.delta > 0 ? '+' : ''}{fmtNum(m.delta)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {usedIn.length > 0 && (
        <Section title="Used in">
          <ul className="space-y-1 text-sm">
            {usedIn.map((u) => {
              const parent = idx.partById.get(u.parentId)
              return parent && (
                <li key={u.lineId}><button className="hover:underline" onClick={() => nav.openPart(parent.id)}><span className="font-mono text-xs text-ink-subtle">{parent.pn}</span> {parent.name}</button> <span className="text-ink-subtle">× {fmtNum(u.qty)}</span></li>
              )
            })}
          </ul>
        </Section>
      )}

      {isAsm && (
        <Section title="Contains">
          <ul className="space-y-1 text-sm">
            {(idx.children.get(id) ?? []).map((k) => {
              const c = idx.partById.get(k.childId)
              return c && <li key={k.lineId}><button className="hover:underline" onClick={() => nav.openPart(c.id)}><span className="font-mono text-xs text-ink-subtle">{c.pn}</span> {c.name}</button> <span className="text-ink-subtle">× {fmtNum(k.qty)}</span></li>
            })}
          </ul>
        </Section>
      )}

      {!isAsm && (
        <Section title="Price history">
          <PriceHistory part={p} />
        </Section>
      )}

      <Section title="Files (drawings, datasheets, STEP)">
        <Attachments files={p.files} group={p.pn} onChange={(f) => set('files', f)} />
      </Section>

      <Section title="Notes">
        <textarea className="input min-h-20" value={p.notes} onChange={(e) => set('notes', e.target.value)} />
      </Section>
    </SidePanel>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-[15px] font-semibold leading-6 text-ink">{title}</h3>
      {children}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-ink-subtle">{label}</div>
      <div className="num text-left text-base font-semibold">{value}</div>
      {sub && <div className="text-xs text-ink-subtle">{sub}</div>}
    </div>
  )
}
