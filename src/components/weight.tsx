import { fmtWeight, type WeightBreakdown, type WeightBucket } from '../lib/calc'
import { WEIGHT_SOURCES, type WeightSource } from '../lib/types'
import { Chip } from './ui'

// Ink shades, darkest = most trustworthy. Every segment also has a written label and percentage.
const SHADE: Record<WeightBucket, string> = {
  measured: 'var(--ui-ink)',
  supplier: 'var(--ui-ink-muted)',
  cad: 'var(--ui-control-border)',
  unset: 'var(--ui-hairline)',
}
const LABEL: Record<WeightBucket, string> = { measured: 'As measured', supplier: 'Per supplier', cad: 'CAD estimate', unset: 'Source not set' }
const ORDER: WeightBucket[] = ['measured', 'supplier', 'cad', 'unset']

const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0)

/** Share of the BOM weight by where each weight came from. */
export function WeightSourceStats({ b, compact }: { b: WeightBreakdown; compact?: boolean }) {
  const shown = ORDER.filter((k) => b.grams[k] > 0 || k !== 'unset')
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-alt" role="img" aria-label={ORDER.map((k) => `${LABEL[k]} ${pct(b.grams[k], b.total)}%`).join(', ')}>
        {ORDER.map((k) => b.grams[k] > 0 && <div key={k} style={{ width: `${(b.grams[k] / b.total) * 100}%`, background: SHADE[k] }} />)}
      </div>
      <div className={`mt-2 grid gap-x-4 gap-y-1 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
        {shown.map((k) => (
          <div key={k} className="flex items-baseline gap-1.5 text-sm">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-hairline" style={{ background: SHADE[k] }} aria-hidden />
            <span className="text-ink-muted">{LABEL[k]}</span>
            <b className="num ml-auto">{pct(b.grams[k], b.total)}%</b>
            {!compact && <span className="num w-16 text-xs text-ink-subtle">{fmtWeight(b.grams[k])}</span>}
          </div>
        ))}
      </div>
      {b.missingParts > 0 && <div className="mt-1 text-xs text-caution">{b.missingParts} part{b.missingParts > 1 ? 's have' : ' has'} no weight yet (not counted)</div>}
    </div>
  )
}

export function WeightSourceChip({ s }: { s: WeightSource | null | undefined }) {
  const w = WEIGHT_SOURCES.find((x) => x.value === s)
  if (!w) return null
  return <Chip color={s === 'measured' ? 'tip' : 'neutral'}>{w.short}</Chip>
}
