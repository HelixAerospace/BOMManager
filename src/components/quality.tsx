import { AlertTriangle, CheckCircle2, CircleDashed, Clock, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Wrench, XCircle } from 'lucide-react'
import { ASL_STATUSES, type AslStatus, type BuildStatus, type Ncr, type NcrDisposition, type NcrSeverity } from '../lib/types'
import { Chip } from './ui'

const ic = 'h-3.5 w-3.5'

export function AslChip({ s }: { s: AslStatus | undefined }) {
  const label = ASL_STATUSES.find((x) => x.value === s)?.label ?? 'Not reviewed'
  if (s === 'approved') return <Chip color="tip" icon={<ShieldCheck className={ic} />}>{label}</Chip>
  if (s === 'conditional') return <Chip color="caution" icon={<ShieldAlert className={ic} />}>{label}</Chip>
  if (s === 'disqualified') return <Chip color="warning" icon={<ShieldX className={ic} />}>{label}</Chip>
  return <Chip icon={<ShieldQuestion className={ic} />}>{label}</Chip>
}

export function BuildStatusChip({ s }: { s: BuildStatus }) {
  if (s === 'complete') return <Chip color="tip" icon={<CheckCircle2 className={ic} />}>Complete</Chip>
  if (s === 'scrapped') return <Chip icon={<XCircle className={ic} />}>Scrapped</Chip>
  return <Chip color="note" icon={<Wrench className={ic} />}>In progress</Chip>
}

export const SEVERITIES: { value: NcrSeverity; label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'major', label: 'Major' },
  { value: 'critical', label: 'Critical' },
]
export const DISPOSITIONS: { value: NcrDisposition; label: string }[] = [
  { value: 'pending', label: 'Pending decision' },
  { value: 'use-as-is', label: 'Use as is' },
  { value: 'rework', label: 'Rework' },
  { value: 'return-to-supplier', label: 'Return to supplier' },
  { value: 'scrap', label: 'Scrap' },
]

export function SeverityChip({ s }: { s: NcrSeverity }) {
  if (s === 'critical') return <Chip color="warning" icon={<AlertTriangle className={ic} />}>Critical</Chip>
  if (s === 'major') return <Chip color="caution" icon={<AlertTriangle className={ic} />}>Major</Chip>
  return <Chip>Minor</Chip>
}

export function NcrStatusChip({ n }: { n: Pick<Ncr, 'status' | 'disposition'> }) {
  if (n.status === 'closed') return <Chip color="tip" icon={<CheckCircle2 className={ic} />}>Closed</Chip>
  if (n.disposition === 'pending') return <Chip color="caution" icon={<CircleDashed className={ic} />}>Open · no decision</Chip>
  return <Chip color="note" icon={<Clock className={ic} />}>Open</Chip>
}

// Common countries for electronics and drone parts; free text is allowed too.
export const COUNTRIES = [
  'Israel', 'United States', 'China', 'Taiwan', 'Japan', 'South Korea', 'Germany', 'United Kingdom', 'France', 'Italy',
  'Switzerland', 'Netherlands', 'Sweden', 'Czech Republic', 'Poland', 'Canada', 'Mexico', 'India', 'Vietnam', 'Thailand', 'Malaysia', 'Singapore',
]
export function CountryInput({ value, onChange, placeholder = 'Country' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <>
      <input className="input" list="helix-countries" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <datalist id="helix-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  )
}
