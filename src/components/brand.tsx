import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import logoSvg from '../assets/helix-logo-horizontal.svg?raw'

/** Helix Aerospace horizontal lockup, from the design system's master SVG.
 *  Black on light grounds, white on dark (via --helix-logo). Never recoloured, stretched or redrawn. */
export function Logo({ height = 28 }: { height?: number }) {
  return <span className="logo" style={{ height }} role="img" aria-label="Helix Aerospace" dangerouslySetInnerHTML={{ __html: logoSvg }} />
}

type Theme = 'system' | 'light' | 'dark'
const apply = (t: Theme) => {
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}
export function initTheme() {
  apply((localStorage.getItem('helix-bom-theme') as Theme) || 'system')
}

/** Light / dark toggle. "System" follows the device setting, as the design system asks. */
export function ThemeToggle() {
  const [t, setT] = useState<Theme>(() => (localStorage.getItem('helix-bom-theme') as Theme) || 'system')
  useEffect(() => {
    localStorage.setItem('helix-bom-theme', t)
    apply(t)
  }, [t])
  const opts: { v: Theme; label: string; icon: typeof Sun }[] = [
    { v: 'system', label: 'Match device', icon: Monitor },
    { v: 'light', label: 'Light', icon: Sun },
    { v: 'dark', label: 'Dark', icon: Moon },
  ]
  return (
    <div className="flex gap-0.5 rounded-lg border border-hairline bg-alt p-0.5" role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={t === o.v}
          aria-label={o.label}
          title={o.label}
          onClick={() => setT(o.v)}
          className={`flex h-7 flex-1 items-center justify-center rounded-md border ${t === o.v ? 'border-hairline bg-surface text-ink' : 'border-transparent text-ink-subtle hover:text-ink'}`}
        >
          <o.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
