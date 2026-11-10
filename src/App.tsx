import { useEffect, useMemo, useState } from 'react'
import { Boxes, Building2, FolderOpen, LayoutDashboard, ListTree, Loader2, RefreshCw, Save, Settings as SettingsIcon, ShoppingCart, Warehouse, CheckCircle2, Search, AlertTriangle } from 'lucide-react'
import { useStore } from './lib/store'
import { useNav, type Screen } from './lib/nav'
import { fsSupported } from './lib/storage'
import { Modal } from './components/ui'
import { Logo, ThemeToggle } from './components/brand'
import Dashboard from './screens/Dashboard'
import BomScreen from './screens/Bom'
import PartsScreen from './screens/Parts'
import OrdersScreen from './screens/Orders'
import InventoryScreen from './screens/Inventory'
import SuppliersScreen from './screens/Suppliers'
import SettingsScreen from './screens/Settings'
import PartPanel from './screens/PartPanel'
import OrderPanel from './screens/OrderPanel'
import SupplierPanel from './screens/SupplierPanel'

const NAV: { id: Screen; label: string; icon: typeof Boxes }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'bom', label: 'BOM', icon: ListTree },
  { id: 'parts', label: 'Parts', icon: Boxes },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'inventory', label: 'Inventory', icon: Warehouse },
  { id: 'suppliers', label: 'Suppliers', icon: Building2 },
]

export default function App() {
  const s = useStore()
  if (s.mode === 'loading') return <Centered><Loader2 className="h-5 w-5 animate-spin text-ink-subtle" /></Centered>
  if (s.mode !== 'ready') return <Welcome />
  return <Shell />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6">{children}</div>
}

function Welcome() {
  const s = useStore()
  const supported = fsSupported()
  return (
    <Centered>
      <div className="w-full max-w-md rounded-lg border border-hairline bg-surface p-10">
        <div className="mb-8">
          <Logo height={48} />
          <div className="mt-4 text-[19px] font-semibold leading-[26px]">BOM Manager</div>
        </div>
        {s.mode === 'reconnect' && (
          <>
            <p className="mb-4 text-sm text-ink-muted">Click to reopen your data folder <b>{s.folderName}</b>. The browser asks once per visit unless you choose “Allow on every visit”.</p>
            <button className="btn-primary w-full justify-center" onClick={s.reconnect}><FolderOpen className="h-4 w-4" /> Open {s.folderName}</button>
            <button className="btn-ghost mt-2 w-full justify-center" onClick={s.openFolder}>Choose a different folder</button>
          </>
        )}
        {s.mode === 'init-folder' && (
          <>
            <p className="mb-4 text-sm text-ink-muted">The folder <b>{s.folderName}</b> has no BOM data yet. How do you want to start?</p>
            <div className="space-y-2">
              <button className="btn-primary w-full justify-center" onClick={() => s.initFolder(false)}>Start empty</button>
              <button className="btn w-full justify-center" onClick={() => s.initFolder(true)}>Start with example data</button>
              <button className="btn-ghost w-full justify-center" onClick={s.openFolder}>Choose a different folder</button>
            </div>
          </>
        )}
        {s.mode === 'welcome' && (
          <>
            <p className="mb-2 text-sm text-ink-muted">Your BOM lives in a folder you choose — for example <b>OneDrive › Helix BOM</b>. OneDrive keeps it in sync between your computers.</p>
            <p className="mb-5 text-sm text-ink-subtle">Nothing is uploaded anywhere else.</p>
            {supported ? (
              <button className="btn-primary w-full justify-center" onClick={s.openFolder}><FolderOpen className="h-4 w-4" /> Choose data folder</button>
            ) : (
              <div className="rounded-lg bg-caution-bg p-3 text-sm text-caution">This browser can’t open local folders. Use <b>Chrome</b> or <b>Edge</b> on a computer.</div>
            )}
            <button className="btn-ghost mt-2 w-full justify-center" onClick={s.startDemo}>Try it with example data (nothing saved)</button>
          </>
        )}
      </div>
    </Centered>
  )
}

function Shell() {
  const s = useStore()
  const nav = useNav()
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const Screen = { dashboard: Dashboard, bom: BomScreen, parts: PartsScreen, orders: OrdersScreen, inventory: InventoryScreen, suppliers: SuppliersScreen, settings: SettingsScreen }[nav.screen]

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-hairline bg-side">
        <div className="px-5 pb-4 pt-5">
          <Logo height={40} />
          <div className="mt-4 text-xs font-medium text-ink-subtle">BOM Manager</div>
        </div>
        <button onClick={() => setPalette(true)} className="mx-3 mb-4 flex h-9 items-center gap-2 rounded-lg border border-hairline bg-alt px-3 text-sm text-ink-subtle hover:border-control">
          <Search className="h-4 w-4" /> Search <kbd className="ml-auto rounded border border-hairline bg-surface px-1.5 font-mono text-xs text-ink-subtle">Ctrl K</kbd>
        </button>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {NAV.map((n) => (
            <NavItem key={n.id} current={nav.screen === n.id} onClick={() => nav.go(n.id)} icon={<n.icon className="h-4 w-4" />} label={n.label} />
          ))}
        </nav>
        <div className="space-y-3 border-t border-hairline p-3">
          <SaveButton />
          <NavItem current={nav.screen === 'settings'} onClick={() => nav.go('settings')} icon={<SettingsIcon className="h-4 w-4" />} label="Settings" />
          <ThemeToggle />
          <div className="truncate px-2.5 text-xs text-ink-subtle" title={s.folderName}>{s.demo ? 'Demo mode: not saved' : `Folder: ${s.folderName}`}</div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {s.updateAvailable && (
          <div className="flex items-center justify-center gap-3 bg-ink px-4 py-1.5 text-sm text-on-ink">
            A new version of the BOM Manager is available.
            <button className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-ink" onClick={() => (s.dirty ? s.save().then(() => location.reload()) : location.reload())}>
              {s.dirty ? 'Save & reload' : 'Reload'}
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Screen />
        </div>
      </main>

      {nav.partId && <PartPanel id={nav.partId} />}
      {nav.orderId && <OrderPanel id={nav.orderId} />}
      {nav.supplierId && <SupplierPanel id={nav.supplierId} />}
      {palette && <Palette onClose={() => setPalette(false)} />}
      {s.conflict && <ConflictDialog />}
      {s.toast && <div role="status" className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-ink bg-ink px-4 py-2 text-sm text-on-ink"><CheckCircle2 className="h-4 w-4" /> {s.toast}</div>}
    </div>
  )
}

/** NavTree item style: current item is SemiBold ui-accent on ui-accent-tint. */
function NavItem({ current, onClick, icon, label }: { current: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm ${current ? 'bg-accent-tint font-semibold text-accent' : 'text-ink-muted hover:bg-alt hover:text-ink'}`}
    >
      {icon} {label}
    </button>
  )
}

function SaveButton() {
  const s = useStore()
  if (s.dirty)
    return (
      <button className="btn-primary w-full justify-center" onClick={() => s.save()} disabled={s.saving}>
        {s.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
      </button>
    )
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-ink-subtle">
      <CheckCircle2 className="h-3.5 w-3.5 text-tip" />
      {s.demo ? 'Demo data' : `Saved ${s.lastSaved ? new Date(s.lastSaved).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''}`}
      {!s.demo && (
        <button className="ml-auto text-ink-subtle hover:text-ink" title="Reload from folder" onClick={s.reload}><RefreshCw className="h-3.5 w-3.5" /></button>
      )}
    </div>
  )
}

function ConflictDialog() {
  const s = useStore()
  const c = s.conflict!
  return (
    <Modal
      title="Newer data on disk"
      onClose={s.dismissConflict}
      footer={
        <>
          <button className="btn" onClick={s.dismissConflict}>Decide later</button>
          <button className="btn" onClick={s.reload}>Discard my changes & load theirs</button>
          <button className="btn-primary" onClick={() => s.save(true)}>Keep mine (overwrite)</button>
        </>
      }
    >
      <div className="flex gap-3 text-sm text-ink-muted">
        <AlertTriangle className="h-5 w-5 shrink-0 text-caution" />
        <div>
          <b>{c.savedBy || 'Another computer'}</b> saved the BOM at {c.savedAt ? new Date(c.savedAt).toLocaleString() : 'an unknown time'}, after you opened it here, and you also have unsaved changes.
          <div className="mt-2">Overwriting keeps your version; the other version is still kept in the <code>backups</code> folder.</div>
        </div>
      </div>
    </Modal>
  )
}

function Palette({ onClose }: { onClose: () => void }) {
  const data = useStore().data
  const nav = useNav()
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const items = useMemo(() => {
    const s = q.toLowerCase().trim()
    const all = [
      ...NAV.map((n) => ({ key: 'nav' + n.id, kind: 'Go to', label: n.label, sub: '', run: () => nav.go(n.id) })),
      ...data.parts.map((p) => ({ key: p.id, kind: 'Part', label: `${p.pn}  ${p.name}`, sub: '', run: () => nav.openPart(p.id) })),
      ...data.orders.map((o) => ({ key: o.id, kind: 'Order', label: o.number, sub: data.suppliers.find((x) => x.id === o.supplierId)?.name ?? '', run: () => nav.openOrder(o.id) })),
      ...data.suppliers.map((x) => ({ key: x.id, kind: 'Supplier', label: x.name, sub: '', run: () => nav.openSupplier(x.id) })),
    ]
    return (s ? all.filter((i) => (i.label + ' ' + i.sub).toLowerCase().includes(s)) : all.slice(0, 6)).slice(0, 12)
  }, [q, data, nav])
  const run = (i: (typeof items)[number]) => {
    i.run()
    onClose()
  }
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[15vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-hairline bg-surface">
        <div className="flex items-center gap-2 border-b border-hairline px-4">
          <Search className="h-4 w-4 text-ink-subtle" />
          <input
            autoFocus
            className="w-full py-3 text-sm"
            placeholder="Search parts, orders, suppliers…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setHi(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, items.length - 1))
              if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0))
              if (e.key === 'Enter' && items[hi]) run(items[hi])
            }}
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink-subtle">No matches</div>}
          {items.map((i, n) => (
            <button key={i.key} onMouseEnter={() => setHi(n)} onClick={() => run(i)} className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${n === hi ? 'bg-alt' : ''}`}>
              <span className="w-16 text-xs text-ink-subtle">{i.kind}</span>
              <span className="truncate">{i.label}</span>
              <span className="ml-auto truncate text-xs text-ink-subtle">{i.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
