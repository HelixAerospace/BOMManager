import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { useDerived } from '../lib/derived'
import { diffConfig, diffCount, latestRelease, snapshotLines, type ConfigDiff } from '../lib/quality'
import { fmtNum } from '../lib/calc'
import { type ID, type Release, today, uid } from '../lib/types'
import { Field, Modal, SidePanel } from '../components/ui'
import { BuildStatusChip } from '../components/quality'
import { Section } from './PartPanel'

/** Freezes the current BOM of an assembly as a released configuration. */
export function ReleaseDialog({ assemblyId, onClose }: { assemblyId: ID; onClose: () => void }) {
  const { data, update, notify } = useStore()
  const { idx } = useDerived()
  const asm = idx.partById.get(assemblyId)!
  const prev = latestRelease(data, assemblyId)
  const lines = useMemo(() => snapshotLines(idx, assemblyId), [idx, assemblyId])
  const diff = prev ? diffConfig(prev.lines, lines) : null
  const count = data.releases.filter((r) => r.assemblyId === assemblyId).length
  const [name, setName] = useState(`${asm.name} config ${count + 1}.0`)
  const [notes, setNotes] = useState('')
  return (
    <Modal
      title={`Release configuration of ${asm.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!name.trim() || (!!diff && diffCount(diff) === 0)} onClick={() => {
            const r: Release = { id: uid(), assemblyId, name: name.trim(), date: today(), notes: notes.trim(), lines }
            update((d) => void d.releases.push(r))
            notify(`Released ${r.name}`)
            onClose()
          }}>Release</button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-ink-muted">This freezes the current structure, quantities and every part's revision ({lines.length} BOM lines). Builds record which configuration they were built to.</p>
        <Field label="Name"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Notes (what this configuration is for)"><textarea className="input min-h-14" value={notes} placeholder="e.g. First customer demo units; frame rev B" onChange={(e) => setNotes(e.target.value)} /></Field>
        {prev && diff && (
          <div className="rounded-lg border border-hairline p-3">
            <div className="mb-1 font-medium">Changes since {prev.name} ({prev.date})</div>
            {diffCount(diff) === 0 ? <div className="text-ink-subtle">No changes: this would be identical to {prev.name}.</div> : <DiffList diff={diff} />}
          </div>
        )}
      </div>
    </Modal>
  )
}

export function DiffList({ diff }: { diff: ConfigDiff }) {
  return (
    <ul className="space-y-0.5 font-mono text-xs">
      {diff.revChanged.map((c) => <li key={'r' + c.pn}>~ {c.pn} {c.name}: rev {c.from} → {c.to}</li>)}
      {diff.qtyChanged.map((c) => <li key={'q' + c.parentPn + c.pn}>~ {c.parentPn} › {c.pn}: qty {fmtNum(c.from)} → {fmtNum(c.to)}</li>)}
      {diff.added.map((c) => <li key={'a' + c.parentPn + c.pn} className="text-tip">+ {c.parentPn} › {c.pn} {c.name} × {fmtNum(c.qty)}</li>)}
      {diff.removed.map((c) => <li key={'d' + c.parentPn + c.pn} className="text-warning">− {c.parentPn} › {c.pn} {c.name}</li>)}
    </ul>
  )
}

/** A released configuration: frozen BOM, differences to today's BOM, and units built to it. */
export function ReleasePanel({ id }: { id: ID }) {
  const { data, update, saveIfDirty } = useStore()
  const nav = useNav()
  const { idx } = useDerived()
  const r = data.releases.find((x) => x.id === id)
  if (!r) return null
  const asm = idx.partById.get(r.assemblyId)
  const current = asm ? snapshotLines(idx, r.assemblyId) : []
  const diff = diffConfig(r.lines, current)
  const builds = data.builds.filter((b) => b.releaseId === id)
  // indent by depth in the frozen structure
  const depthOf = new Map<string, number>([[asm?.pn ?? '', 0]])
  for (const l of r.lines) depthOf.set(l.pn, (depthOf.get(l.parentPn) ?? 0) + 1)
  return (
    <SidePanel
      wide
      title={r.name}
      subtitle={<>Released {r.date} · {asm ? `${asm.pn} ${asm.name}` : 'assembly deleted'}</>}
      onClose={() => nav.openRelease(null)}
      footerLeft={
        builds.length === 0 && (
          <button className="btn-ghost text-warning" onClick={() => {
            if (!confirm(`Delete ${r.name}? No builds use it.`)) return
            update((d) => void (d.releases = d.releases.filter((x) => x.id !== id)))
            nav.openRelease(null)
            void saveIfDirty()
          }}>Delete release</button>
        )
      }
    >
      {r.notes && <p className="mb-4 text-sm text-ink-muted">{r.notes}</p>}
      <Section title={`Compared with today's BOM`}>
        {diffCount(diff) === 0 ? <p className="text-sm text-ink-subtle">The current BOM matches this configuration.</p> : <DiffList diff={diff} />}
      </Section>
      <Section title={`Units built to this configuration (${builds.length})`}>
        {builds.length === 0 ? <p className="text-sm text-ink-subtle">None yet.</p> : (
          <div className="flex flex-wrap gap-2">
            {builds.map((b) => (
              <button key={b.id} className="flex items-center gap-2 rounded-lg border border-hairline px-2 py-1 text-sm hover:bg-alt" onClick={() => { nav.openRelease(null); nav.openBuild(b.id) }}>
                <span className="font-mono text-xs">{b.serial}</span><BuildStatusChip s={b.status} />
              </button>
            ))}
          </div>
        )}
      </Section>
      <Section title={`Frozen BOM (${r.lines.length} lines)`}>
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="grid-table">
            <thead><tr><th>Part</th><th>Rev</th><th className="num">Qty</th></tr></thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={i}>
                  <td><span style={{ paddingLeft: ((depthOf.get(l.pn) ?? 1) - 1) * 16 }}><span className="font-mono text-xs text-ink-subtle">{l.pn}</span> {l.name}</span></td>
                  <td>{l.rev}</td>
                  <td className="num">{fmtNum(l.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </SidePanel>
  )
}
