import { useMemo, useState } from 'react'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived, useMoney } from '../lib/derived'
import { explode, partHasSupplier } from '../lib/calc'
import { buildGaps, diffConfig, diffCount, newNcr, reviewOverdue, snapshotLines } from '../lib/quality'
import { type ID, type Ncr, today } from '../lib/types'
import { Attachments, Card, Empty, Field, FilterTabs, Kpi, NumInput, PageHeader, SidePanel } from '../components/ui'
import { AslChip, DISPOSITIONS, NcrStatusChip, SEVERITIES, SeverityChip } from '../components/quality'
import { Section } from './PartPanel'

type Tab = 'suppliers' | 'ncr' | 'config' | 'origin'

export default function QualityScreen() {
  const { data, update } = useStore()
  const nav = useNav()
  const { idx, costs, topAssemblies } = useDerived()
  const [tab, setTab] = useState<Tab>('suppliers')

  const approved = data.suppliers.filter((s) => s.aslStatus === 'approved').length
  const openNcrs = data.ncrs.filter((n) => n.status === 'open')
  const traced = data.builds.filter((b) => b.status === 'complete' && (() => { const g = buildGaps(data, b); return !g.noLot && !g.noSerial })()).length
  const completed = data.builds.filter((b) => b.status === 'complete').length
  const leaf = data.parts.filter((p) => !idx.children.has(p.id))
  const withOrigin = leaf.filter((p) => p.countryOfOrigin?.trim()).length

  const addNcr = () => {
    const n = newNcr(data)
    update((d) => void d.ncrs.push(n))
    nav.openNcr(n.id)
  }

  return (
    <>
      <PageHeader
        title="Quality"
        subtitle="Approved suppliers, nonconformances, configuration control and country of origin, in one place for diligence."
        actions={<button className="btn-primary" onClick={addNcr}><Plus className="h-4 w-4" /> New NCR</button>}
      />
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi label="Approved suppliers" value={`${approved} of ${data.suppliers.length}`} sub={(() => { const k = data.suppliers.filter(reviewOverdue).length; return k ? `${k} review${k > 1 ? 's' : ''} overdue` : 'no reviews overdue' })()} tone={approved < data.suppliers.length ? 'amber' : undefined} onClick={() => setTab('suppliers')} />
          <Kpi label="Open nonconformances" value={openNcrs.length} sub={`${openNcrs.filter((n) => n.severity !== 'minor').length} major or critical`} tone={openNcrs.some((n) => n.severity !== 'minor') ? 'red' : openNcrs.length ? 'amber' : undefined} onClick={() => setTab('ncr')} />
          <Kpi label="Built units fully traced" value={`${traced} of ${completed}`} sub="every lot and serial recorded" tone={traced < completed ? 'amber' : undefined} onClick={() => nav.go('builds')} />
          <Kpi label="Parts with country of origin" value={`${leaf.length ? Math.round((withOrigin / leaf.length) * 100) : 0}%`} sub={`${withOrigin} of ${leaf.length} parts`} tone={withOrigin < leaf.length ? 'amber' : undefined} onClick={() => setTab('origin')} />
        </div>

        <FilterTabs value={tab} onChange={setTab} options={[
          { value: 'suppliers', label: 'Approved suppliers', count: data.suppliers.length },
          { value: 'ncr', label: 'Nonconformances', count: data.ncrs.length },
          { value: 'config', label: 'Configuration', count: data.releases.length },
          { value: 'origin', label: 'Country of origin' },
        ]} />

        {tab === 'suppliers' && <SupplierList />}
        {tab === 'ncr' && <NcrList onNew={addNcr} />}
        {tab === 'config' && <ConfigList />}
        {tab === 'origin' && <OriginView topId={data.settings.topAssemblyId && idx.partById.has(data.settings.topAssemblyId) ? data.settings.topAssemblyId : topAssemblies[0]?.id} costs={costs} />}
      </div>
    </>
  )
}

function SupplierList() {
  const { data } = useStore()
  const nav = useNav()
  const rows = [...data.suppliers].sort((a, b) => a.name.localeCompare(b.name))
  if (!rows.length) return <Card><Empty icon={<ShieldCheck className="h-5 w-5" />} title="No suppliers yet" text="Add suppliers on the Suppliers page, then review and approve them here." /></Card>
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
      <table className="grid-table">
        <thead><tr><th>Supplier</th><th>Status</th><th>Country</th><th>Approved for</th><th>Approved</th><th>Next review</th><th className="num">Parts</th><th className="num">NCRs</th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const ncrs = data.ncrs.filter((n) => n.supplierId === s.id)
            const open = ncrs.filter((n) => n.status === 'open').length
            return (
              <tr key={s.id} className="clickable" onClick={() => nav.openSupplier(s.id)}>
                <td className="font-medium">{s.name}</td>
                <td><AslChip s={s.aslStatus} /></td>
                <td className="text-ink-muted">{s.country || <span className="text-caution">not set</span>}</td>
                <td className="max-w-64 truncate text-ink-muted" title={s.approvedFor}>{s.approvedFor}</td>
                <td className="text-ink-muted">{s.approvedOn}</td>
                <td className={reviewOverdue(s) ? 'font-medium text-caution' : 'text-ink-muted'}>{s.reviewDue}{reviewOverdue(s) ? ' (overdue)' : ''}</td>
                <td className="num">{data.parts.filter((p) => partHasSupplier(p, s.id)).length}</td>
                <td className="num">{ncrs.length ? <>{ncrs.length}{open ? <span className="text-caution"> ({open} open)</span> : ''}</> : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function NcrList({ onNew }: { onNew: () => void }) {
  const { data } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const [f, setF] = useState<'open' | 'closed' | 'all'>('open')
  const rows = data.ncrs.filter((n) => f === 'all' || n.status === f).sort((a, b) => b.number.localeCompare(a.number))
  return (
    <div className="space-y-3">
      <FilterTabs value={f} onChange={setF} options={[{ value: 'open', label: 'Open', count: data.ncrs.filter((n) => n.status === 'open').length }, { value: 'closed', label: 'Closed', count: data.ncrs.filter((n) => n.status === 'closed').length }, { value: 'all', label: 'All', count: data.ncrs.length }]} />
      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        {rows.length === 0 ? (
          <Empty icon={<ShieldCheck className="h-5 w-5" />} title={f === 'open' ? 'No open nonconformances' : 'Nothing here'} text="Log any part, delivery or build that doesn't meet its drawing or spec: what was wrong, what you decided to do, and how you stop it happening again." action={<button className="btn-primary" onClick={onNew}><Plus className="h-4 w-4" /> New NCR</button>} />
        ) : (
          <table className="grid-table">
            <thead><tr><th>NCR</th><th>Date</th><th>Title</th><th>Severity</th><th>Part</th><th>Supplier</th><th>Disposition</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="clickable" onClick={() => nav.openNcr(n.id)}>
                  <td className="font-mono text-xs">{n.number}</td>
                  <td className="whitespace-nowrap text-ink-muted">{n.date}</td>
                  <td className="max-w-72 truncate">{n.title || <span className="text-ink-subtle">Untitled</span>}</td>
                  <td><SeverityChip s={n.severity} /></td>
                  <td className="font-mono text-xs text-ink-muted">{idx.partById.get(n.partId ?? '')?.pn ?? ''}</td>
                  <td className="text-ink-muted">{idx.supplierById.get(n.supplierId ?? '')?.name ?? ''}</td>
                  <td className="text-ink-muted">{DISPOSITIONS.find((x) => x.value === n.disposition)?.label}</td>
                  <td><NcrStatusChip n={n} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ConfigList() {
  const { data } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const revs = data.parts
    .flatMap((p) => (p.revisions ?? []).map((r) => ({ p, r })))
    .sort((a, b) => b.r.date.localeCompare(a.r.date))
    .slice(0, 30)
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <div className="border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">Released configurations</div>
        {data.releases.length === 0 ? <p className="px-4 py-6 text-sm text-ink-subtle">None yet. Use <b>Release configuration…</b> on the BOM page to freeze a configuration before you build to it.</p> : (
          <table className="grid-table">
            <thead><tr><th>Configuration</th><th>Assembly</th><th>Released</th><th className="num">Units built</th><th>Today's BOM</th></tr></thead>
            <tbody>
              {[...data.releases].reverse().map((r) => {
                const changes = idx.partById.has(r.assemblyId) ? diffCount(diffConfig(r.lines, snapshotLines(idx, r.assemblyId))) : 0
                return (
                  <tr key={r.id} className="clickable" onClick={() => nav.openRelease(r.id)}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-ink-muted">{idx.partById.get(r.assemblyId)?.name ?? '—'}</td>
                    <td className="text-ink-muted">{r.date}</td>
                    <td className="num">{data.builds.filter((b) => b.releaseId === r.id).length || ''}</td>
                    <td className={changes ? 'text-caution' : 'text-ink-subtle'}>{changes ? `${changes} change${changes > 1 ? 's' : ''} since` : 'matches'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <div className="border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">Recent revision changes</div>
        {revs.length === 0 ? <p className="px-4 py-6 text-sm text-ink-subtle">No revision changes recorded yet. Use <b>Revise…</b> on a part to change its revision with a reason.</p> : (
          <ul className="divide-y divide-hairline">
            {revs.map(({ p, r }) => (
              <li key={r.id}>
                <button className="w-full px-4 py-2 text-left text-sm hover:bg-alt" onClick={() => nav.openPart(p.id)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span><span className="font-mono text-xs text-ink-subtle">{p.pn}</span> {p.name} · <b>rev {r.fromRev} → {r.toRev}</b></span>
                    <span className="whitespace-nowrap text-xs text-ink-subtle">{r.date}</span>
                  </div>
                  <div className="truncate text-ink-muted">{r.change}{r.reason ? ` (${r.reason})` : ''}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function OriginView({ topId, costs }: { topId: ID | undefined; costs: Map<ID, { planned: number }> }) {
  const { data } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const { fmt: money } = useMoney()
  const rows = useMemo(() => {
    if (!topId) return { byCountry: [], total: 0, missing: [] as { id: ID; pn: string; name: string; value: number }[] }
    const per = explode(idx, topId)
    const m = new Map<string, number>()
    const missing: { id: ID; pn: string; name: string; value: number }[] = []
    let total = 0
    for (const [id, qty] of per) {
      const p = idx.partById.get(id)
      if (!p) continue
      const value = (costs.get(id)?.planned ?? 0) * qty
      total += value
      const c = p.countryOfOrigin?.trim() || 'Unknown'
      m.set(c, (m.get(c) ?? 0) + value)
      if (c === 'Unknown') missing.push({ id, pn: p.pn, name: p.name, value })
    }
    return { byCountry: [...m.entries()].sort((a, b) => b[1] - a[1]), total, missing: missing.sort((a, b) => b.value - a.value) }
  }, [topId, idx, costs])
  const top = topId ? idx.partById.get(topId) : undefined
  if (!top) return <Card><p className="px-4 py-6 text-sm text-ink-subtle">Create an assembly first.</p></Card>
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <div className="border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">Where {top.name} comes from (share of planned cost)</div>
        <div className="space-y-3 p-4">
          {rows.byCountry.map(([c, v]) => (
            <div key={c}>
              <div className="mb-1 flex justify-between text-xs">
                <span className={c === 'Unknown' ? 'text-caution' : 'text-ink-muted'}>{c}</span>
                <span className="num text-ink">{money(v)} · {rows.total ? Math.round((v / rows.total) * 100) : 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-alt"><div className={`h-2 rounded-full ${c === 'Unknown' ? 'bg-control' : 'bg-ink'}`} style={{ width: `${rows.total ? (v / rows.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
        <p className="border-t border-hairline px-4 py-2 text-xs text-ink-subtle">Country of origin is where a part is made, set on each part. It can differ from where the supplier is based.</p>
      </Card>
      <Card>
        <div className="border-b border-hairline px-4 py-3 text-[15px] font-semibold leading-6">Parts without a country of origin ({rows.missing.length})</div>
        {rows.missing.length === 0 ? <p className="px-4 py-6 text-sm text-ink-subtle">Every part in {top.name} has a country of origin.</p> : (
          <ul className="divide-y divide-hairline">
            {rows.missing.map((p) => (
              <li key={p.id}>
                <button className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-alt" onClick={() => nav.openPart(p.id)}>
                  <span><span className="font-mono text-xs text-ink-subtle">{p.pn}</span> {p.name}</span>
                  <span className="num text-xs text-ink-subtle">{money(p.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function NcrPanel({ id }: { id: ID }) {
  const { data, update, saveIfDirty } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const n = data.ncrs.find((x) => x.id === id)
  if (!n) return null
  const set = <K extends keyof Ncr>(k: K, v: Ncr[K]) => update((d) => void (d.ncrs.find((x) => x.id === id)![k] = v))
  const go = (fn: () => void) => { nav.openNcr(null); fn() }
  return (
    <SidePanel
      wide
      title={<span className="flex items-center gap-3"><span className="font-mono">{n.number}</span> <SeverityChip s={n.severity} /> <NcrStatusChip n={n} /></span>}
      subtitle={n.title || 'Nonconformance'}
      onClose={() => nav.openNcr(null)}
      footerLeft={
        <button className="btn-ghost text-warning" onClick={() => {
          if (!confirm(`Delete ${n.number}? Deleting quality records is unusual; consider closing it instead.`)) return
          update((d) => void (d.ncrs = d.ncrs.filter((x) => x.id !== id)))
          nav.openNcr(null)
          void saveIfDirty()
        }}><Trash2 className="h-4 w-4" /> Delete</button>
      }
      footerRight={
        n.status === 'open'
          ? <button className="btn" disabled={n.disposition === 'pending'} title={n.disposition === 'pending' ? 'Decide a disposition first' : ''} onClick={() => update((d) => { const x = d.ncrs.find((y) => y.id === id)!; x.status = 'closed'; x.closedOn = today() })}>Close NCR</button>
          : <button className="btn" onClick={() => update((d) => { const x = d.ncrs.find((y) => y.id === id)!; x.status = 'open'; x.closedOn = '' })}>Reopen</button>
      }
    >
      <div className="grid grid-cols-6 gap-3">
        <Field label="Title" className="col-span-4"><input className="input" autoFocus={!n.title} value={n.title} placeholder="e.g. Arm clamps out of tolerance" onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Date found" className="col-span-2"><input type="date" className="input" value={n.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Severity" className="col-span-2">
          <select className="input" value={n.severity} onChange={(e) => set('severity', e.target.value as Ncr['severity'])}>
            {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Qty affected" className="col-span-2"><NumInput value={n.qtyAffected} min={0} onChange={(v) => set('qtyAffected', v)} /></Field>
        <Field label="Disposition" className="col-span-2">
          <select className="input" value={n.disposition} onChange={(e) => set('disposition', e.target.value as Ncr['disposition'])}>
            {DISPOSITIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="What is wrong" className="col-span-6"><textarea className="input min-h-20" value={n.description} placeholder="Requirement (drawing / spec) vs. what was found, and how it was found" onChange={(e) => set('description', e.target.value)} /></Field>
      </div>

      <Section title="Linked to">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Part">
            <div className="flex gap-1">
              <select className="input" value={n.partId ?? ''} onChange={(e) => set('partId', e.target.value || null)}>
                <option value="">—</option>
                {[...data.parts].sort((a, b) => a.pn.localeCompare(b.pn)).map((p) => <option key={p.id} value={p.id}>{p.pn} {p.name}</option>)}
              </select>
              {n.partId && <button className="btn" onClick={() => go(() => nav.openPart(n.partId!))}>Open</button>}
            </div>
          </Field>
          <Field label="Supplier">
            <div className="flex gap-1">
              <select className="input" value={n.supplierId ?? ''} onChange={(e) => set('supplierId', e.target.value || null)}>
                <option value="">—</option>
                {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {n.supplierId && <button className="btn" onClick={() => go(() => nav.openSupplier(n.supplierId!))}>Open</button>}
            </div>
          </Field>
          <Field label="Order (lot)">
            <div className="flex gap-1">
              <select className="input" value={n.orderId ?? ''} onChange={(e) => update((d) => {
                const x = d.ncrs.find((y) => y.id === id)!
                x.orderId = e.target.value || null
                const o = d.orders.find((y) => y.id === x.orderId)
                if (o && !x.supplierId) x.supplierId = o.supplierId
              })}>
                <option value="">—</option>
                {[...data.orders].sort((a, b) => b.number.localeCompare(a.number)).map((o) => <option key={o.id} value={o.id}>{o.number} · {idx.supplierById.get(o.supplierId ?? '')?.name ?? '—'}</option>)}
              </select>
              {n.orderId && <button className="btn" onClick={() => go(() => nav.openOrder(n.orderId!))}>Open</button>}
            </div>
          </Field>
          <Field label="Build (unit)">
            <div className="flex gap-1">
              <select className="input" value={n.buildId ?? ''} onChange={(e) => set('buildId', e.target.value || null)}>
                <option value="">—</option>
                {[...data.builds].sort((a, b) => b.serial.localeCompare(a.serial)).map((b) => <option key={b.id} value={b.id}>{b.serial}</option>)}
              </select>
              {n.buildId && <button className="btn" onClick={() => go(() => nav.openBuild(n.buildId!))}>Open</button>}
            </div>
          </Field>
        </div>
        {n.orderId && (() => {
          const affected = data.builds.filter((b) => b.items.some((i) => i.lotOrderId === n.orderId && (!n.partId || i.partId === n.partId)))
          return affected.length ? <p className="mt-2 text-sm text-ink-muted">Units built with this lot{n.partId ? ' of this part' : ''}: {affected.map((b) => b.serial).join(', ')}</p> : null
        })()}
      </Section>

      <Section title="Root cause and corrective action">
        <div className="space-y-3">
          <Field label="Root cause"><textarea className="input min-h-16" value={n.rootCause} placeholder="Why it happened" onChange={(e) => set('rootCause', e.target.value)} /></Field>
          <Field label="Corrective action"><textarea className="input min-h-16" value={n.correctiveAction} placeholder="What was changed so it doesn't happen again (drawing revision, supplier instruction, inspection step…)" onChange={(e) => set('correctiveAction', e.target.value)} /></Field>
          {n.status === 'closed' && <p className="text-sm text-ink-muted">Closed on {n.closedOn}.</p>}
        </div>
      </Section>

      <Section title="Evidence (photos, measurements, supplier replies)">
        <Attachments files={n.files} group={n.number} onChange={(f) => set('files', f)} />
      </Section>
    </SidePanel>
  )
}
