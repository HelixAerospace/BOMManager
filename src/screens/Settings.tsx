import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Download, FileUp, FolderOpen, Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { displayCurrencyOf, useDerived } from '../lib/derived'
import { parseInventorCsv, planImport, type ImportPlan, type ImportRow } from '../lib/importer'
import { fmtMoney, orderValueIls, sourcesOf, toIls } from '../lib/calc'
import { uid } from '../lib/types'
import { Card, Field, Modal, NumInput, PageHeader } from '../components/ui'

declare const __APP_VERSION__: string

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function SettingsScreen() {
  const s = useStore()
  const { data, update } = s
  const { idx, costs, actual, weights } = useDerived()
  const [newCur, setNewCur] = useState('')

  const dc = displayCurrencyOf(data.settings)
  const dRate = dc === 'ILS' ? 1 : data.settings.fx[dc]
  const exportParts = () => {
    const rows = data.parts.map((p) => ({
      'Part number': p.pn, Name: p.name, Rev: p.rev, Category: p.category, Type: idx.children.has(p.id) ? 'Assembly' : p.makeBuy === 'make' ? 'Custom' : 'Off-the-shelf',
      'Preferred supplier': idx.supplierById.get(p.supplierId ?? '')?.name ?? '', 'Supplier PN': p.supplierPn, 'All suppliers': sourcesOf(p).map((x) => `${idx.supplierById.get(x.supplierId ?? '')?.name ?? '?'}${x.supplierPn ? ` (${x.supplierPn})` : ''}`).join('; '), 'Planned cost per piece': Math.round(p.plannedCost * 10000) / 10000, 'Pack price': p.packPrice ?? '', 'Pieces per pack': p.packQty ?? '', Currency: p.currency, 'Weight (g)': p.weight ?? '', 'Weight rolled up (g)': Math.round((weights.get(p.id)?.grams ?? 0) * 10) / 10,
      [`Planned (${dc}, rolled up)`]: Math.round(((costs.get(p.id)?.planned ?? 0) / dRate) * 10000) / 10000, [`Actual (${dc})`]: actual.get(p.id) ? Math.round((actual.get(p.id)!.unitIls / dRate) * 10000) / 10000 : '',
      'On hand': p.onHand, Location: p.location, 'Min stock': p.minStock, 'Spares target': p.sparesTarget, URL: p.url, Notes: p.notes,
    }))
    download(`helix-parts-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + Papa.unparse(rows))
  }
  const exportBom = () => {
    const rows = data.bom.map((l) => ({ Parent: idx.partById.get(l.parentId)?.pn, Child: idx.partById.get(l.childId)?.pn, 'Child name': idx.partById.get(l.childId)?.name, Qty: l.qty }))
    download(`helix-bom-lines-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + Papa.unparse(rows))
  }
  const exportOrders = () => {
    const rows = data.orders.flatMap((o) => o.lines.map((l) => ({
      PO: o.number, Supplier: idx.supplierById.get(o.supplierId ?? '')?.name ?? '', Status: o.status, 'Order date': o.orderDate, Expected: o.expectedDate, Received: o.receivedDate,
      'Part number': idx.partById.get(l.partId)?.pn, Part: idx.partById.get(l.partId)?.name, Qty: l.qty, 'Qty received': l.qtyReceived, 'Unit price': l.unitPrice, Currency: o.currency,
      'Rate to ILS': o.fxToIls, 'Order shipping/fees': o.shipping, [`Order total (${dc})`]: Math.round((orderValueIls(data, o) / dRate) * 100) / 100, Invoice: o.invoiceNumber,
    })))
    download(`helix-orders-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + Papa.unparse(rows))
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-5xl gap-5 p-6 lg:grid-cols-2">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 text-[15px] font-semibold leading-6">Show costs in</h2>
          <p className="mb-3 text-sm text-ink-subtle">Every cost column, total and chart uses this currency. Parts and orders keep their own currency; they are converted with the rates below.</p>
          <select className="input w-48" value={displayCurrencyOf(data.settings)} onChange={(e) => update((d) => void (d.settings.displayCurrency = e.target.value))}>
            {['USD', 'ILS', ...Object.keys(data.settings.fx).filter((c) => c !== 'USD' && c !== 'ILS')].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-[15px] font-semibold leading-6">Exchange rates</h2>
          <p className="mb-3 text-sm text-ink-subtle">₪ per 1 unit of currency. Used for planned costs; each order locks its own rate when you mark it ordered.</p>
          <div className="space-y-2">
            {Object.entries(data.settings.fx).filter(([c]) => c !== 'ILS').map(([c, r]) => (
              <div key={c} className="flex items-center gap-2">
                <span className="w-12 font-mono text-sm">{c}</span>
                <NumInput className="input num w-32" value={r} min={0} onChange={(v) => update((d) => void (d.settings.fx[c] = v))} />
                <span className="text-xs text-ink-subtle">e.g. 100 {c} = {fmtMoney(toIls(data, 100, c))}</span>
                <button className="ml-auto text-ink-subtle hover:text-warning" onClick={() => update((d) => void delete d.settings.fx[c])}><X className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input className="input w-24 uppercase" maxLength={3} placeholder="JPY" value={newCur} onChange={(e) => setNewCur(e.target.value.toUpperCase())} />
              <button className="btn" disabled={newCur.length !== 3} onClick={() => { update((d) => void (d.settings.fx[newCur] = 1)); setNewCur('') }}><Plus className="h-4 w-4" /> Add currency</button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-[15px] font-semibold leading-6">Part categories</h2>
          <p className="mb-3 text-sm text-ink-subtle">The prefix starts new part numbers, e.g. MEC-00012. Revision is kept separately.</p>
          <div className="space-y-2">
            {data.settings.categories.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input w-20 font-mono uppercase" value={c.prefix} onChange={(e) => update((d) => void (d.settings.categories[i].prefix = e.target.value.toUpperCase()))} />
                <input className="input" value={c.name} onChange={(e) => update((d) => void (d.settings.categories[i].name = e.target.value))} />
                <button className="text-ink-subtle hover:text-warning" disabled={data.parts.some((p) => p.category === c.prefix)} title="Only unused categories can be removed" onClick={() => update((d) => void d.settings.categories.splice(i, 1))}><X className="h-4 w-4" /></button>
              </div>
            ))}
            <button className="btn" onClick={() => update((d) => void d.settings.categories.push({ prefix: 'NEW', name: 'New category' }))}><Plus className="h-4 w-4" /> Add category</button>
          </div>
        </Card>

        <InventorImport />

        <Card className="p-5">
          <h2 className="mb-1 text-[15px] font-semibold leading-6">Export</h2>
          <p className="mb-3 text-sm text-ink-subtle">Spreadsheet-friendly copies (open in Excel). Your full data is always the <code>helix-bom-data.json</code> file in your folder.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={exportParts}><Download className="h-4 w-4" /> Parts</button>
            <button className="btn" onClick={exportBom}><Download className="h-4 w-4" /> BOM lines</button>
            <button className="btn" onClick={exportOrders}><Download className="h-4 w-4" /> Orders</button>
            <button className="btn" onClick={() => download(`helix-bom-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')}><Download className="h-4 w-4" /> Full backup (JSON)</button>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 text-[15px] font-semibold leading-6">Data folder</h2>
          {s.demo ? (
            <p className="text-sm text-ink-subtle">You’re in demo mode — nothing is saved. Choose a folder to start for real.</p>
          ) : (
            <p className="text-sm text-ink-subtle">
              Using <b className="text-ink">{s.folderName}</b>. It contains <code>helix-bom-data.json</code> (everything), <code>files/</code> (attachments, one folder per part or order) and <code>backups/</code> (a copy before every save, last 100 kept).
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button className="btn" onClick={s.openFolder}><FolderOpen className="h-4 w-4" /> {s.demo ? 'Choose data folder' : 'Switch folder'}</button>
            {!s.demo && <button className="btn-ghost" onClick={() => { if (!s.dirty || confirm('Discard unsaved changes?')) s.closeFolder() }}>Close folder</button>}
          </div>
          <p className="mt-4 text-xs text-ink-subtle">App version {__APP_VERSION__}</p>
        </Card>
      </div>
    </>
  )
}

function InventorImport() {
  const { data, update, notify } = useStore()
  const { idx } = useDerived()
  const input = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState('')
  const assemblies = data.parts.filter((p) => idx.children.has(p.id) || p.category === 'ASM')
  const [target, setTarget] = useState<string>('__new')
  const [newPn, setNewPn] = useState('')
  const [newName, setNewName] = useState('')
  const [cat, setCat] = useState('PUR')

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const res = parseInventorCsv(await f.text())
    setFileName(f.name)
    setErr(res.error ?? '')
    setRows(res.error ? null : res.rows)
    setNewName(f.name.replace(/\.[^.]+$/, ''))
    setTarget(assemblies[0]?.id ?? '__new')
  }

  let plan: ImportPlan | null = null
  if (rows) {
    const tid = target === '__new' ? '__target' : target
    plan = planImport(data, rows, tid, cat)
  }

  const apply = () => {
    if (!rows || !plan) return
    update((d) => {
      let tid = target
      if (target === '__new') {
        tid = uid()
        d.parts.push({
          id: tid, pn: newPn || `ASM-${String(d.parts.filter((p) => p.category === 'ASM').length + 1).padStart(5, '0')}`, name: newName || 'Imported assembly',
          category: 'ASM', makeBuy: 'make', rev: 'A', unit: 'pcs', plannedCost: 0, currency: d.settings.baseCurrency, supplierId: null, supplierPn: '', url: '',
          leadTimeDays: null, onHand: 0, location: '', minStock: 0, sparesTarget: 0, notes: 'Imported from Inventor', files: [], createdAt: new Date().toISOString(),
        })
      }
      planImport(d as never, rows, tid, cat).apply(d)
      if (!d.settings.topAssemblyId) d.settings.topAssemblyId = tid
    })
    notify(`Imported ${rows.length} rows from ${fileName}`)
    setRows(null)
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-[15px] font-semibold leading-6">Import BOM from Inventor</h2>
      <p className="mb-3 text-sm text-ink-subtle">
        In Inventor: <i>Assemble › Bill of Materials › Export</i>, choose the <b>Structured</b> view (all levels) and save as <b>.csv</b>. Parts are matched by <b>Part Number</b> (new ones take their category from the prefix, e.g. MEC-); an <i>Estimated Cost</i> column is read in your display currency; add the <i>Mass</i> column to fill in part weights; you’ll see the changes before anything is applied. Lines you added by hand (glue, cables…) are kept.
      </p>
      <button className="btn" onClick={() => input.current?.click()}><FileUp className="h-4 w-4" /> Choose CSV file…</button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      {err && <p className="mt-2 text-sm text-warning">{err}</p>}

      {rows && plan && (
        <Modal
          title={`Import ${fileName}`}
          onClose={() => setRows(null)}
          footer={<><button className="btn" onClick={() => setRows(null)}>Cancel</button><button className="btn-primary" onClick={apply}>Apply import</button></>}
        >
          <div className="space-y-3 text-sm">
            <Field label="This BOM belongs to assembly">
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="__new">Create a new assembly</option>
                {assemblies.map((a) => <option key={a.id} value={a.id}>{a.pn} {a.name}</option>)}
              </select>
            </Field>
            {target === '__new' && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Part number"><input className="input font-mono" placeholder="ASM-00010" value={newPn} onChange={(e) => setNewPn(e.target.value)} /></Field>
                <Field label="Name" className="col-span-2"><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
              </div>
            )}
            <Field label="Category for new (non-assembly) parts">
              <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
                {data.settings.categories.filter((c) => c.prefix !== 'ASM').map((c) => <option key={c.prefix} value={c.prefix}>{c.prefix} · {c.name}</option>)}
              </select>
            </Field>
            <div className="rounded-lg bg-alt p-3">
              <div className="mb-1 font-medium">{rows.length} rows read · changes:</div>
              <ul className="space-y-0.5 text-ink-muted">
                <li><b className="text-tip">{plan.newParts.length}</b> new parts</li>
                <li><b>{plan.updates.length}</b> name, revision or weight updates</li>
                <li><b className="text-tip">{plan.added.length}</b> BOM lines added, <b>{plan.changed.length}</b> quantity changes, <b className="text-warning">{plan.removed.length}</b> removed</li>
              </ul>
              <div className="mt-2 max-h-40 overflow-y-auto font-mono text-xs text-ink-subtle">
                {plan.updates.map((u, i) => <div key={'u' + i}>~ {u.part.pn} {u.field}: “{u.from}” → “{u.to}”</div>)}
                {plan.changed.map((c, i) => <div key={'c' + i}>~ {c.parent} › {c.child}: qty {c.from} → {c.to}</div>)}
                {plan.removed.map((c, i) => <div key={'r' + i} className="text-warning">− {c.parent} › {c.child}</div>)}
                {plan.newParts.slice(0, 30).map((p) => <div key={p.id} className="text-tip">+ {p.pn} {p.name}</div>)}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
