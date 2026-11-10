import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Clock, FileText, Paperclip, Truck, Upload, X, XCircle, PackageCheck, PackageMinus, Search } from 'lucide-react'
import type { OrderStatus, Part } from '../lib/types'
import type { Availability, StockState } from '../lib/calc'
import { useStore } from '../lib/store'

// ---------- status chips: colour + icon + label, never colour alone ----------
const tone = {
  gray: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
}
export function Chip({ color = 'gray', icon, children }: { color?: keyof typeof tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[color]}`}>
      {icon}
      {children}
    </span>
  )
}
const ic = 'h-3 w-3'

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: keyof typeof tone; icon: ReactNode; step: number }> = {
  draft: { label: 'Draft', color: 'gray', icon: <Circle className={ic} />, step: 0 },
  ordered: { label: 'Ordered', color: 'blue', icon: <Clock className={ic} />, step: 1 },
  shipped: { label: 'Shipped', color: 'violet', icon: <Truck className={ic} />, step: 2 },
  partial: { label: 'Part received', color: 'amber', icon: <PackageMinus className={ic} />, step: 3 },
  received: { label: 'Received', color: 'green', icon: <PackageCheck className={ic} />, step: 4 },
  cancelled: { label: 'Cancelled', color: 'gray', icon: <XCircle className={ic} />, step: -1 },
}
export function OrderStatusChip({ status, late }: { status: OrderStatus; late?: boolean }) {
  const s = ORDER_STATUS[status]
  return (
    <span className="inline-flex items-center gap-1">
      <Chip color={s.color} icon={s.icon}>{s.label}</Chip>
      {late && <Chip color="red" icon={<AlertTriangle className={ic} />}>Late</Chip>}
    </span>
  )
}
export function StepBar({ status }: { status: OrderStatus }) {
  const step = ORDER_STATUS[status].step
  if (step < 0) return <div className="h-1.5 w-24 rounded-full bg-zinc-100" />
  return (
    <div className="flex w-24 gap-0.5" title={ORDER_STATUS[status].label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? (step === 4 ? 'bg-emerald-500' : 'bg-zinc-800') : 'bg-zinc-200'}`} />
      ))}
    </div>
  )
}
export function AvailabilityChip({ a }: { a: Availability }) {
  if (a === 'in-stock') return <Chip color="green" icon={<CheckCircle2 className={ic} />}>In stock</Chip>
  if (a === 'expected') return <Chip color="blue" icon={<Truck className={ic} />}>Expected</Chip>
  return <Chip color="red" icon={<AlertTriangle className={ic} />}>Short</Chip>
}
export function StockChip({ s }: { s: StockState }) {
  if (s === 'ok') return <Chip color="green" icon={<CheckCircle2 className={ic} />}>OK</Chip>
  if (s === 'low') return <Chip color="amber" icon={<AlertTriangle className={ic} />}>Low</Chip>
  return <Chip color="red" icon={<XCircle className={ic} />}>Out</Chip>
}
export function MakeBuyChip({ v }: { v: 'make' | 'buy' }) {
  return v === 'make' ? <Chip color="violet">Custom</Chip> : <Chip>Off-the-shelf</Chip>
}

// ---------- layout ----------
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white ${className}`}>{children}</div>
}

export function Kpi({ label, value, sub, tone: t, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'amber' | 'green'; onClick?: () => void }) {
  const accent = t === 'red' ? 'text-red-600' : t === 'amber' ? 'text-amber-600' : t === 'green' ? 'text-emerald-600' : 'text-zinc-900'
  return (
    <button onClick={onClick} className="rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className={`num mt-1 text-left text-2xl font-semibold tracking-tight ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </button>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 rounded-full bg-zinc-100 p-3 text-zinc-500">{icon}</div>
      <div className="font-medium">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-zinc-500">{text}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Right-hand slide-over panel for details/editing. */
export function SidePanel({ title, subtitle, onClose, children, footer, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-zinc-900/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`flex h-full w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} flex-col bg-white shadow-2xl`}>
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <div className="text-base font-semibold">{title}</div>
            {subtitle && <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>}
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <div className="font-semibold">{title}</div>
          <button className="btn-ghost" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">{footer}</div>}
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
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input className="input w-64 pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function FilterTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${value === o.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
        >
          {o.label}
          {o.count != null && <span className="ml-1 text-zinc-400">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Searchable part picker. */
export function PartPicker({ parts, onPick, placeholder = 'Add part… (type PN or name)', exclude }: { parts: Part[]; onPick: (p: Part) => void; placeholder?: string; exclude?: Set<string> }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const list = useMemo(() => {
    const s = q.toLowerCase()
    return parts
      .filter((p) => !exclude?.has(p.id))
      .filter((p) => !s || p.pn.toLowerCase().includes(s) || p.name.toLowerCase().includes(s))
      .slice(0, 12)
  }, [parts, q, exclude])
  const pick = (p: Part) => {
    onPick(p)
    setQ('')
    setOpen(false)
  }
  return (
    <div className="relative">
      <input
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
        }}
      />
      {open && list.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          {list.map((p, i) => (
            <button
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm ${i === hi ? 'bg-zinc-100' : ''}`}
            >
              <span className="w-24 font-mono text-xs text-zinc-500">{p.pn}</span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Attachments list with drag-and-drop. Files are copied into the data folder. */
export function Attachments({ files, group, onChange }: { files: string[]; group: string; onChange: (files: string[]) => void }) {
  const { attach, openFile, demo } = useStore()
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const add = async (list: FileList | null) => {
    if (!list) return
    const added: string[] = []
    for (const f of Array.from(list)) {
      const p = await attach(group, f)
      if (p) added.push(p)
    }
    if (added.length) onChange([...files, ...added])
  }
  return (
    <div>
      {files.length > 0 && (
        <ul className="mb-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">
          {files.map((f) => (
            <li key={f} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <button className="flex min-w-0 items-center gap-2 text-left hover:underline" onClick={() => openFile(f)}>
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="truncate">{f.split('/').pop()}</span>
              </button>
              <button className="text-xs text-zinc-400 hover:text-red-600" onClick={() => onChange(files.filter((x) => x !== f))} title="Remove link (file stays in the folder)">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          add(e.dataTransfer.files)
        }}
        onClick={() => input.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm ${over ? 'border-zinc-500 bg-zinc-50' : 'border-zinc-300 text-zinc-500 hover:bg-zinc-50'}`}
      >
        {files.length ? <Paperclip className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
        {demo ? 'Attachments are disabled in demo mode' : 'Drop files here or click to attach (PDF, images, STEP…)'}
      </div>
      <input ref={input} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  )
}
