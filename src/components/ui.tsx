import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Clock, FileText, Paperclip, Truck, Upload, X, XCircle, PackageCheck, PackageMinus, Save, Search, Link2, Copy } from 'lucide-react'
import type { OrderStatus, Part } from '../lib/types'
import type { Availability, StockState } from '../lib/calc'
import { useStore } from '../lib/store'

// ---------- badges: hx-badge. Safety colours only when they mean something, always with icon + label ----------
const tone = {
  neutral: 'bg-alt text-ink-muted border-hairline', // hx-badge
  note: 'bg-accent-tint text-accent border-note-line', // Note: information
  tip: 'bg-tip-bg text-tip border-tip-line', // Tip: good / done
  caution: 'bg-caution-bg text-caution border-caution-line', // Caution: needs attention soon
  warning: 'bg-warning-bg text-warning border-warning-line', // Warning: problem now
}
export function Chip({ color = 'neutral', icon, children }: { color?: keyof typeof tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium leading-5 ${tone[color]}`}>
      {icon}
      {children}
    </span>
  )
}
const ic = 'h-3.5 w-3.5'

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: keyof typeof tone; icon: ReactNode; step: number }> = {
  draft: { label: 'Draft', color: 'neutral', icon: <Circle className={ic} />, step: 0 },
  ordered: { label: 'Ordered', color: 'neutral', icon: <Clock className={ic} />, step: 1 },
  shipped: { label: 'Shipped', color: 'neutral', icon: <Truck className={ic} />, step: 2 },
  partial: { label: 'Part received', color: 'note', icon: <PackageMinus className={ic} />, step: 3 },
  received: { label: 'Received', color: 'tip', icon: <PackageCheck className={ic} />, step: 4 },
  cancelled: { label: 'Cancelled', color: 'neutral', icon: <XCircle className={ic} />, step: -1 },
}
export function OrderStatusChip({ status, late }: { status: OrderStatus; late?: boolean }) {
  const s = ORDER_STATUS[status]
  return (
    <span className="inline-flex items-center gap-1">
      <Chip color={s.color} icon={s.icon}>{s.label}</Chip>
      {late && <Chip color="warning" icon={<AlertTriangle className={ic} />}>Late</Chip>}
    </span>
  )
}
export function StepBar({ status }: { status: OrderStatus }) {
  const step = ORDER_STATUS[status].step
  if (step < 0) return <div className="h-1.5 w-24 rounded-full bg-hairline" />
  return (
    <div className="flex w-24 gap-0.5" title={ORDER_STATUS[status].label} aria-label={`Progress: ${ORDER_STATUS[status].label}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? (step === 4 ? 'bg-tip' : 'bg-ink') : 'bg-hairline'}`} />
      ))}
    </div>
  )
}
export function AvailabilityChip({ a }: { a: Availability }) {
  if (a === 'in-stock') return <Chip color="tip" icon={<CheckCircle2 className={ic} />}>In stock</Chip>
  if (a === 'expected') return <Chip color="note" icon={<Truck className={ic} />}>Expected</Chip>
  return <Chip color="warning" icon={<AlertTriangle className={ic} />}>Short</Chip>
}
export function StockChip({ s }: { s: StockState }) {
  if (s === 'ok') return <Chip icon={<CheckCircle2 className={ic} />}>OK</Chip>
  if (s === 'low') return <Chip color="caution" icon={<AlertTriangle className={ic} />}>Low</Chip>
  return <Chip color="warning" icon={<XCircle className={ic} />}>Out</Chip>
}
export function MakeBuyChip({ v }: { v: 'make' | 'buy' }) {
  return <Chip>{v === 'make' ? 'Custom' : 'Off-the-shelf'}</Chip>
}

// ---------- layout ----------
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-hairline bg-surface px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold leading-7">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-ink-subtle">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-hairline bg-surface ${className}`}>{children}</div>
}

export function Kpi({ label, value, sub, tone: t, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'amber' | 'green'; onClick?: () => void }) {
  // Safety colours only when something needs action; "fine" stays ink.
  const accent = t === 'red' ? 'text-warning' : t === 'amber' ? 'text-caution' : 'text-ink'
  return (
    <button onClick={onClick} className="rounded-lg border border-hairline bg-surface p-4 text-left hover:border-control">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={`num mt-1 flex items-center gap-2 text-left text-[28px] font-semibold leading-9 ${accent}`}>
        {(t === 'red' || t === 'amber') && <AlertTriangle className="h-5 w-5" aria-hidden />}
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-subtle">{sub}</div>}
    </button>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 rounded-full border border-hairline bg-alt p-3 text-ink-muted">{icon}</div>
      <div className="text-[19px] font-semibold leading-[26px]">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-ink-subtle">{text}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Right-hand slide-over panel for details/editing. */
/** Right-hand edit panel. Closing it in any way (Save, X, Esc, clicking outside) saves changes to the folder. */
export function SidePanel({ title, subtitle, onClose, children, footerLeft, footerRight, saveStyle = 'primary', wide }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode
  footerLeft?: ReactNode; footerRight?: ReactNode; saveStyle?: 'primary' | 'secondary'; wide?: boolean
}) {
  const { saveIfDirty, saving } = useStore()
  const close = useRef<() => void>(() => {})
  close.current = () => {
    // Commit the field being edited (number fields save on blur) before saving.
    const el = document.activeElement as HTMLElement | null
    if (el && typeof el.blur === 'function') el.blur()
    onClose()
    void saveIfDirty()
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
      <div className={`flex h-full w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} flex-col border-l border-hairline bg-surface`}>
        <div className="flex items-start justify-between border-b border-hairline px-5 py-4">
          <div>
            <div className="text-[19px] font-semibold leading-[26px]">{title}</div>
            {subtitle && <div className="mt-0.5 text-sm text-ink-subtle">{subtitle}</div>}
          </div>
          <button className="btn-icon" onClick={() => close.current()} aria-label="Save and close" title="Save and close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex items-center justify-between gap-2 border-t border-hairline px-5 py-3">
          <div>{footerLeft}</div>
          <div className="flex items-center gap-2">
            {footerRight}
            <button className={saveStyle === 'primary' ? 'btn-primary' : 'btn'} disabled={saving} onClick={() => close.current()}>
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  // Esc closes only this dialog, not the panel underneath it.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      close.current()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [])
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`flex max-h-[90vh] w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} flex-col rounded-lg border border-hairline bg-surface`}>
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="text-[19px] font-semibold leading-[26px]">{title}</div>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

/** Number input that commits on blur/enter so typing "0." doesn't fight the state. */
export function NumInput({ value, onChange, className = 'input num', min, step, placeholder }: { value: number | null; onChange: (v: number) => void; className?: string; min?: number; step?: number; placeholder?: string }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const commit = () => {
    const v = parseFloat(text)
    if (!Number.isNaN(v) && v !== value) onChange(min != null ? Math.max(min, v) : v)
    else if (Number.isNaN(v)) setText(value == null ? '' : String(value))
  }
  return (
    <input
      className={className}
      inputMode="decimal"
      value={text}
      step={step}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      <input className="input w-64 pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function FilterTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 rounded-lg border border-hairline bg-alt p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md border px-2.5 py-1 text-sm font-medium ${value === o.value ? 'border-hairline bg-surface text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
        >
          {o.label}
          {o.count != null && <span className="ml-1 text-ink-subtle">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Searchable part picker. The list is positioned on the page (not inside its table) so it is never cut off. */
export function PartPicker({ parts, onPick, placeholder = 'Add part… (type PN or name)', exclude }: { parts: Part[]; onPick: (p: Part) => void; placeholder?: string; exclude?: Set<string> }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const list = useMemo(() => {
    const s = q.toLowerCase()
    return parts
      .filter((p) => !exclude?.has(p.id))
      .filter((p) => !s || p.pn.toLowerCase().includes(s) || p.name.toLowerCase().includes(s))
      .sort((a, b) => a.pn.localeCompare(b.pn))
      .slice(0, 50)
  }, [parts, q, exclude])
  useEffect(() => {
    if (!open) return
    const place = () => ref.current && setRect(ref.current.getBoundingClientRect())
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])
  const pick = (p: Part) => {
    onPick(p)
    setQ('')
    setHi(0)
  }
  const maxH = 288
  const below = rect ? window.innerHeight - rect.bottom - 8 >= Math.min(maxH, 120) || rect.top < maxH : true
  return (
    <div className="relative">
      <input
        ref={ref}
        className="input"
        value={q}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setHi(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, list.length - 1))
          if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0))
          if (e.key === 'Enter' && list[hi]) pick(list[hi])
          if (e.key === 'Escape') {
            e.stopPropagation()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {open && rect && (
        <div
          role="listbox"
          className="fixed z-50 overflow-y-auto rounded-lg border border-hairline bg-surface py-1"
          style={{
            left: rect.left,
            width: Math.max(rect.width, 360),
            maxHeight: below ? Math.min(maxH, window.innerHeight - rect.bottom - 8) : Math.min(maxH, rect.top - 8),
            ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
          }}
        >
          {list.length === 0 && <div className="px-3 py-2 text-sm text-ink-subtle">{parts.length ? 'No matching parts' : 'No parts yet: add them on the Parts page'}</div>}
          {list.map((p, i) => (
            <button
              key={p.id}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(p)}
              className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${i === hi ? 'bg-alt' : ''}`}
            >
              <span className="w-24 font-mono text-xs text-ink-subtle">{p.pn}</span>
              <span className="truncate">{p.name || 'Unnamed'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Attachments: either a copy kept in the BOM folder (files/…), or a link to a file that already lives
 *  in the chosen folder (paths starting with "/"), e.g. a STEP file next to the Inventor model. */
export function Attachments({ files, group, onChange }: { files: string[]; group: string; onChange: (files: string[]) => void }) {
  const { attach, openFile, demo, linkFiles, linkHandle, fileExists, rootName, notify } = useStore()
  const [over, setOver] = useState(false)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const input = useRef<HTMLInputElement>(null)
  const key = files.join('|')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const m = new Set<string>()
      for (const f of files) if (!(await fileExists(f))) m.add(f)
      if (alive) setMissing(m)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fileExists])

  const addPaths = (paths: string[]) => {
    const fresh = paths.filter((p) => !files.includes(p))
    if (fresh.length) onChange([...files, ...fresh])
  }
  const copyIn = async (list: File[]) => {
    const added: string[] = []
    for (const f of list) {
      const p = await attach(group, f)
      if (p) added.push(p)
    }
    addPaths(added)
  }
  // Dropped files already inside the chosen folder are linked; anything else is copied in.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const items = Array.from(e.dataTransfer.items).filter((it) => it.kind === 'file')
    const handles = await Promise.all(items.map((it) => ('getAsFileSystemHandle' in it ? (it as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle() : Promise.resolve(null))))
    const files2 = items.map((it) => it.getAsFile())
    const links: string[] = []
    const copies: File[] = []
    for (let i = 0; i < items.length; i++) {
      const h = handles[i]
      const link = h && h.kind === 'file' ? await linkHandle(h as FileSystemFileHandle) : null
      if (link) links.push(link)
      else if (files2[i]) copies.push(files2[i]!)
    }
    addPaths(links)
    if (copies.length) await copyIn(copies)
  }
  const prettyLink = (p: string) => [rootName, ...p.split('/').filter(Boolean)].join(' › ')
  const winPath = (p: string) => [rootName, ...p.split('/').filter(Boolean)].join('\\')

  return (
    <div>
      {files.length > 0 && (
        <ul className="mb-2 divide-y divide-hairline rounded-lg border border-hairline">
          {files.map((f) => {
            const linked = f.startsWith('/')
            const gone = missing.has(f)
            return (
              <li key={f} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <button className="flex min-w-0 items-center gap-2 text-left hover:underline disabled:no-underline" disabled={gone} onClick={() => openFile(f)}>
                    {linked ? <Link2 className="h-4 w-4 shrink-0 text-ink-subtle" /> : <FileText className="h-4 w-4 shrink-0 text-ink-subtle" />}
                    <span className="truncate">{f.split('/').pop()}</span>
                  </button>
                  <div className="ml-6 flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
                    {linked ? <span className="truncate" title={prettyLink(f)}>Linked · {prettyLink(f)}</span> : <span>Copy in BOM folder</span>}
                    {gone && <Chip color="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />}>Missing</Chip>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {linked && (
                    <button className="btn-icon h-7 w-7" title="Copy file path" aria-label="Copy file path" onClick={async () => { await navigator.clipboard.writeText(winPath(f)); notify('Path copied') }}>
                      <Copy className="h-4 w-4" />
                    </button>
                  )}
                  <button className="text-xs text-ink-subtle hover:text-warning" onClick={() => onChange(files.filter((x) => x !== f))} title={linked ? 'Remove link (the file is not touched)' : 'Remove from this list (the copy stays in the folder)'}>
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {demo ? (
        <div className="rounded-lg border border-dashed border-control px-3 py-3 text-center text-sm text-ink-subtle">Attachments are disabled in demo mode</div>
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={`rounded-lg border border-dashed px-3 py-3 text-center text-sm ${over ? 'border-control bg-alt' : 'border-control text-ink-subtle'}`}
          >
            <div className="flex items-center justify-center gap-2">{files.length ? <Paperclip className="h-4 w-4" /> : <Upload className="h-4 w-4" />} Drop files here</div>
            <div className="mt-1 text-xs">Files already inside {rootName || 'your folder'} are linked in place; others are copied into the BOM folder.</div>
          </div>
          <div className="mt-2 flex gap-2">
            <button className="btn" onClick={async () => addPaths(await linkFiles())}><Link2 className="h-4 w-4" /> Link existing file…</button>
            <button className="btn" onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> Attach a copy…</button>
          </div>
        </>
      )}
      <input ref={input} type="file" multiple hidden onChange={(e) => { copyIn(Array.from(e.target.files ?? [])); e.target.value = '' }} />
    </div>
  )
}
