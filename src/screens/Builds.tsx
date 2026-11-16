import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardX, Plus, RefreshCw, Trash2, Wrench } from 'lucide-react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived } from '../lib/derived'
import { fmtNum } from '../lib/calc'
import { buildGaps, buildItemsFor, latestRelease, lotsFor, newNcr, nextBuildSerial } from '../lib/quality'
import { type Build, type BuildStatus, type ID, today, uid } from '../lib/types'
import { Empty, Field, FilterTabs, Modal, PageHeader, SearchBox, SidePanel, Chip } from '../components/ui'
import { BuildStatusChip, NcrStatusChip, SeverityChip } from '../components/quality'
import { Section } from './PartPanel'

export function GapsChip({ b }: { b: Build }) {
  const { data } = useStore()
  const g = buildGaps(data, b)
  if (!g.noLot && !g.noSerial) return <Chip color="tip" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Fully traced</Chip>
  const parts = [g.noLot && `${g.noLot} lot${g.noLot > 1 ? 's' : ''} unknown`, g.noSerial && `${g.noSerial} serial${g.noSerial > 1 ? 's' : ''} missing`].filter(Boolean).join(' · ')
  return <Chip color="caution">{parts}</Chip>
}

type F = 'all' | BuildStatus

export default function BuildsScreen() {
  const { data } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const [f, setF] = useState<F>('all')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const list = useMemo(() => {
    const s = q.toLowerCase()
    return data.builds
      .filter((b) => f === 'all' || b.status === f)
      .filter((b) => !s || [b.serial, b.notes, ...b.items.flatMap((i) => i.serials)].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => b.serial.localeCompare(a.serial))
  }, [data.builds, f, q])
  const count = (s: BuildStatus) => data.builds.filter((b) => b.status === s).length
  return (
    <>
      <PageHeader title="Builds" subtitle="Every unit you build, the configuration it was built to, and which lot and serial number each part came from." actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New build</button>} />
      <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
        <FilterTabs value={f} onChange={setF} options={[{ value: 'all', label: 'All', count: data.builds.length }, { value: 'in-progress', label: 'In progress', count: count('in-progress') }, { value: 'complete', label: 'Complete', count: count('complete') }, { value: 'scrapped', label: 'Scrapped', count: count('scrapped') }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search unit or part serial number…" />
      </div>
      <div className="p-6 pt-3">
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
          {list.length === 0 ? (
            <Empty icon={<Wrench className="h-5 w-5" />} title="No builds yet" text="Start a build for each drone you assemble. Its parts list comes from the BOM; you record which order (lot) each part came from and the serial numbers of key parts." action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New build</button>} />
          ) : (
            <table className="grid-table">
              <thead><tr><th>Unit serial</th><th>Assembly</th><th>Configuration</th><th>Status</th><th>Started</th><th>Completed</th><th>Traceability</th></tr></thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => nav.openBuild(b.id)}>
                    <td className="font-mono text-xs">{b.serial}</td>
                    <td>{idx.partById.get(b.assemblyId)?.name ?? '—'}</td>
                    <td className="text-ink-muted">{data.releases.find((r) => r.id === b.releaseId)?.name ?? <span className="text-caution">not set</span>}</td>
                    <td><BuildStatusChip s={b.status} /></td>
                    <td className="text-ink-muted">{b.startedOn}</td>
                    <td className="text-ink-muted">{b.completedOn}</td>
                    <td><GapsChip b={b} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {creating && <NewBuildDialog onClose={() => setCreating(false)} />}
    </>
  )
}

function NewBuildDialog({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const nav = useNav()
  const { idx, topAssemblies } = useDerived()
  const assemblies = data.parts.filter((p) => idx.children.has(p.id))
  const [asmId, setAsmId] = useState<ID>(data.settings.topAssemblyId && idx.partById.has(data.settings.topAssemblyId) ? data.settings.topAssemblyId : topAssemblies[0]?.id ?? assemblies[0]?.id ?? '')
  const releases = data.releases.filter((r) => r.assemblyId === asmId)
  const [relId, setRelId] = useState<string>(latestRelease(data, asmId)?.id ?? '')
  const [serial, setSerial] = useState(nextBuildSerial(data))
  const dup = data.builds.some((b) => b.serial.trim().toLowerCase() === serial.trim().toLowerCase())
  return (
    <Modal
      title="New build"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!asmId || !serial.trim() || dup} onClick={() => {
            const b: Build = { id: uid(), serial: serial.trim(), assemblyId: asmId, releaseId: relId || null, status: 'in-progress', startedOn: today(), completedOn: '', notes: '', items: buildItemsFor(data, idx, asmId) }
            update((d) => void d.builds.push(b))
            onClose()
            nav.go('builds')
            nav.openBuild(b.id)
          }}>Start build</button>
        </>
      }
    >
      {assemblies.length === 0 ? <p className="text-sm text-ink-subtle">Create an assembly in the BOM first.</p> : (
        <div className="space-y-3">
          <Field label="Unit serial number">
            <input className="input font-mono" autoFocus value={serial} onChange={(e) => setSerial(e.target.value)} />
            {dup && <span className="mt-1 block text-xs text-warning">That serial number is already used.</span>}
          </Field>
          <Field label="Assembly">
            <select className="input" value={asmId} onChange={(e) => { setAsmId(e.target.value); setRelId(latestRelease(data, e.target.value)?.id ?? '') }}>
              {assemblies.map((a) => <option key={a.id} value={a.id}>{a.pn} {a.name}</option>)}
            </select>
          </Field>
          <Field label="Built to configuration">
            <select className="input" value={relId} onChange={(e) => setRelId(e.target.value)}>
              <option value="">None (not released)</option>
              {[...releases].reverse().map((r) => <option key={r.id} value={r.id}>{r.name} ({r.date})</option>)}
            </select>
            {!releases.length && <span className="mt-1 block text-xs text-caution">No released configuration for this assembly yet. Release one from the BOM page so each unit records exactly what it was built to.</span>}
          </Field>
          <p className="text-xs text-ink-subtle">The parts list is filled from the current BOM. Each part's lot defaults to the most recent order it was received from; check it while you build.</p>
        </div>
      )}
    </Modal>
  )
}

export function BuildPanel({ id }: { id: ID }) {
  const { data, update, saveIfDirty, notify } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const b = data.builds.find((x) => x.id === id)
  if (!b) return null
  const asm = idx.partById.get(b.assemblyId)
  const editable = b.status === 'in-progress'
  const ncrs = data.ncrs.filter((n) => n.buildId === id)
  const setB = (fn: (x: Build) => void) => update((d) => fn(d.builds.find((y) => y.id === id)! as Build))
  const gaps = buildGaps(data, b)

  const complete = () => {
    if ((gaps.noLot || gaps.noSerial) && !confirm(`Traceability is incomplete (${[gaps.noLot && `${gaps.noLot} unknown lots`, gaps.noSerial && `${gaps.noSerial} missing serials`].filter(Boolean).join(', ')}). Complete anyway?`)) return
    update((d) => {
      const x = d.builds.find((y) => y.id === id)!
      x.status = 'complete'
      x.completedOn = today()
      // The parts are now in the drone: take them out of stock.
      for (const i of x.items) {
        const p = d.parts.find((y) => y.id === i.partId)
        if (!p || !i.qty) continue
        p.onHand -= i.qty
        d.stockMoves.push({ id: uid(), partId: i.partId, delta: -i.qty, reason: 'build', ref: x.serial, date: new Date().toISOString() })
      }
    })
    notify(`${b.serial} complete; parts taken out of stock`)
  }

  const refresh = () => setB((x) => {
    const fresh = buildItemsFor(data, idx, x.assemblyId)
    x.items = fresh.map((f) => {
      const old = x.items.find((o) => o.partId === f.partId)
      if (!old) return f
      const serials = f.serials.length ? f.serials.map((_, i) => old.serials[i] ?? '') : []
      return { ...f, id: old.id, lotOrderId: old.lotOrderId, serials }
    })
  })

  return (
    <SidePanel
      wide
      title={<span className="flex items-center gap-3"><span className="font-mono">{b.serial}</span> <BuildStatusChip s={b.status} /></span>}
      subtitle={asm ? `${asm.pn} ${asm.name}` : 'Assembly deleted'}
      onClose={() => nav.openBuild(null)}
      footerLeft={
        editable && (
          <button className="btn-ghost text-warning" onClick={() => {
            if (!confirm(`Delete build ${b.serial}?`)) return
            update((d) => void (d.builds = d.builds.filter((x) => x.id !== id)))
            nav.openBuild(null)
            void saveIfDirty()
          }}><Trash2 className="h-4 w-4" /> Delete</button>
        )
      }
      footerRight={
        <>
          <button className="btn" onClick={() => { const n = newNcr(data, { buildId: id }); update((d) => void d.ncrs.push(n)); nav.openBuild(null); nav.openNcr(n.id) }}><ClipboardX className="h-4 w-4" /> Report nonconformance</button>
          {editable && <button className="btn-primary" onClick={complete}><CheckCircle2 className="h-4 w-4" /> Mark complete</button>}
        </>
      }
      saveStyle={editable ? 'secondary' : 'primary'}
    >
      <div className="grid grid-cols-6 gap-3">
        <Field label="Unit serial number" className="col-span-2"><input className="input font-mono" value={b.serial} onChange={(e) => setB((x) => void (x.serial = e.target.value))} /></Field>
        <Field label="Built to configuration" className="col-span-4">
          <select className="input" value={b.releaseId ?? ''} onChange={(e) => setB((x) => void (x.releaseId = e.target.value || null))}>
            <option value="">None (not released)</option>
            {data.releases.filter((r) => r.assemblyId === b.assemblyId).reverse().map((r) => <option key={r.id} value={r.id}>{r.name} ({r.date})</option>)}
          </select>
        </Field>
        <Field label="Started" className="col-span-2"><input type="date" className="input" value={b.startedOn} onChange={(e) => setB((x) => void (x.startedOn = e.target.value))} /></Field>
        <Field label="Completed" className="col-span-2"><input type="date" className="input" value={b.completedOn} disabled={editable} onChange={(e) => setB((x) => void (x.completedOn = e.target.value))} /></Field>
        <div className="col-span-2 self-end pb-2"><GapsChip b={b} /></div>
      </div>

      <Section title={`Parts and traceability (${b.items.length})`}>
        {editable && (
          <div className="mb-2 flex items-center justify-between text-xs text-ink-subtle">
            <span>Pick the order (lot) each part came from; enter serial numbers for serialized parts.</span>
            <button className="btn-ghost h-7" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /> Update from BOM</button>
          </div>
        )}
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="grid-table">
            <thead><tr><th>Part</th><th className="num">Qty</th><th>Lot (order)</th><th>Serial numbers</th></tr></thead>
            <tbody>
              {b.items.map((it, i) => {
                const p = idx.partById.get(it.partId)
                const lots = lotsFor(data, it.partId)
                return (
                  <tr key={it.id}>
                    <td><button className="text-left hover:underline" onClick={() => { nav.openBuild(null); nav.openPart(it.partId) }}><span className="font-mono text-xs text-ink-subtle">{p?.pn}</span> {p?.name} <span className="text-xs text-ink-subtle">rev {p?.rev}</span></button></td>
                    <td className="num">{fmtNum(it.qty)}</td>
                    <td className="w-56">
                      <select className={`input h-8 ${!it.lotOrderId ? 'border-caution-line' : ''}`} disabled={!editable} value={it.lotOrderId ?? ''} onChange={(e) => setB((x) => void (x.items[i].lotOrderId = e.target.value || null))}>
                        <option value="">Unknown / older stock</option>
                        {lots.map((o) => <option key={o.id} value={o.id} title={`received ${o.receivedDate || o.orderDate}`}>{o.number} · {idx.supplierById.get(o.supplierId ?? '')?.name ?? '—'}</option>)}
                      </select>
                    </td>
                    <td className="min-w-48">
                      {p?.serialized ? (
                        <div className="flex flex-wrap gap-1">
                          {it.serials.map((sn, k) => (
                            <input key={k} className={`input h-8 w-32 font-mono text-xs ${!sn.trim() ? 'border-caution-line' : ''}`} disabled={!editable} value={sn} placeholder={`serial ${k + 1}`} onChange={(e) => setB((x) => void (x.items[i].serials[k] = e.target.value))} />
                          ))}
                        </div>
                      ) : <span className="text-xs text-ink-subtle">not serialized</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {ncrs.length > 0 && (
        <Section title="Nonconformances">
          <ul className="space-y-1 text-sm">
            {ncrs.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <button className="font-mono text-xs text-accent hover:underline" onClick={() => { nav.openBuild(null); nav.openNcr(n.id) }}>{n.number}</button>
                <span className="truncate">{n.title || 'Untitled'}</span><SeverityChip s={n.severity} /><NcrStatusChip n={n} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Notes">
        <textarea className="input min-h-16" value={b.notes} placeholder="Firmware version, test flight results, who built it…" onChange={(e) => setB((x) => void (x.notes = e.target.value))} />
      </Section>
      {editable ? null : b.status === 'complete' && (
        <p className="mt-4 text-xs text-ink-subtle">Completed builds are locked so the record stays as built. Report a nonconformance to record problems found later.</p>
      )}
    </SidePanel>
  )
}
