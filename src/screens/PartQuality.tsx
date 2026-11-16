import { useState } from 'react'
import { useStore } from '../lib/store'
import { useNav } from '../lib/nav'
import { buildsUsingPart, nextRev, revisePart } from '../lib/quality'
import { fmtNum } from '../lib/calc'
import type { Part } from '../lib/types'
import { Field, Modal } from '../components/ui'
import { BuildStatusChip, NcrStatusChip, SeverityChip } from '../components/quality'

/** Changes a part's revision through a dialog that records what changed and why. */
export function ReviseDialog({ part, onClose }: { part: Part; onClose: () => void }) {
  const { update, notify } = useStore()
  const [rev, setRev] = useState(nextRev(part.rev))
  const [change, setChange] = useState('')
  const [reason, setReason] = useState('')
  const ok = rev.trim() && rev.trim() !== part.rev && change.trim()
  return (
    <Modal
      title={`Revise ${part.pn}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!ok} onClick={() => {
            update((d) => revisePart(d.parts.find((x) => x.id === part.id)!, rev.trim(), change.trim(), reason.trim()))
            notify(`${part.pn} is now rev ${rev.trim()}`)
            onClose()
          }}>Change to rev {rev.trim() || '…'}</button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current revision"><input className="input" value={part.rev} disabled /></Field>
          <Field label="New revision"><input className="input" autoFocus value={rev} onChange={(e) => setRev(e.target.value)} /></Field>
        </div>
        <Field label="What changed"><textarea className="input min-h-16" value={change} placeholder="e.g. Hole pattern moved 2 mm; wall thickened to 2.5 mm" onChange={(e) => setChange(e.target.value)} /></Field>
        <Field label="Why (optional)"><textarea className="input min-h-14" value={reason} placeholder="e.g. Cracks found in flight test; see NCR-0002" onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="text-xs text-ink-subtle">Remember to update the part number's revision in Inventor and its drawings too.</p>
      </div>
    </Modal>
  )
}

export function RevisionLog({ part }: { part: Part }) {
  const list = [...(part.revisions ?? [])].reverse()
  if (!list.length) return <p className="text-sm text-ink-subtle">No revision changes recorded yet. Use <b>Revise…</b> next to the revision to change it with a reason.</p>
  return (
    <ol className="space-y-2">
      {list.map((r) => (
        <li key={r.id} className="rounded-lg border border-hairline px-3 py-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <b>Rev {r.fromRev} → {r.toRev}</b>
            <span className="text-xs text-ink-subtle">{r.date}{r.source === 'inventor' ? ' · from Inventor import' : ''}</span>
          </div>
          <div className="text-ink-muted">{r.change}</div>
          {r.reason && <div className="text-xs text-ink-subtle">Why: {r.reason}</div>}
        </li>
      ))}
    </ol>
  )
}

/** Built units that contain this part (with lot and serials), and nonconformances against it. */
export function PartTraceability({ part }: { part: Part }) {
  const { data } = useStore()
  const nav = useNav()
  const used = buildsUsingPart(data, part.id)
  const ncrs = data.ncrs.filter((n) => n.partId === part.id)
  const orderNo = (id: string | null) => data.orders.find((o) => o.id === id)?.number
  if (!used.length && !ncrs.length) return <p className="text-sm text-ink-subtle">Not used in any recorded build yet, and no nonconformances.</p>
  return (
    <div className="space-y-3">
      {used.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="grid-table">
            <thead><tr><th>Unit</th><th>Status</th><th className="num">Qty</th><th>Lot (order)</th><th>Serial numbers</th></tr></thead>
            <tbody>
              {used.map(({ build, item }) => (
                <tr key={build.id + item.id} className="clickable" onClick={() => { nav.openPart(null); nav.openBuild(build.id) }}>
                  <td className="font-mono text-xs">{build.serial}</td>
                  <td><BuildStatusChip s={build.status} /></td>
                  <td className="num">{fmtNum(item.qty)}</td>
                  <td className="font-mono text-xs">{orderNo(item.lotOrderId) ?? <span className="font-sans text-caution">unknown</span>}</td>
                  <td className="text-xs text-ink-muted">{item.serials.filter(Boolean).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ncrs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {ncrs.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <button className="font-mono text-xs text-accent hover:underline" onClick={() => { nav.openPart(null); nav.openNcr(n.id) }}>{n.number}</button>
              <span className="truncate">{n.title || 'Untitled'}</span>
              <SeverityChip s={n.severity} />
              <NcrStatusChip n={n} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
