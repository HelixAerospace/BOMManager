import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Screen = 'dashboard' | 'bom' | 'parts' | 'orders' | 'inventory' | 'suppliers' | 'builds' | 'quality' | 'settings'

interface Nav {
  screen: Screen
  go: (s: Screen) => void
  partId: string | null
  openPart: (id: string | null) => void
  orderId: string | null
  openOrder: (id: string | null) => void
  supplierId: string | null
  openSupplier: (id: string | null) => void
  buildId: string | null
  openBuild: (id: string | null) => void
  ncrId: string | null
  openNcr: (id: string | null) => void
  releaseId: string | null
  openRelease: (id: string | null) => void
}
const Ctx = createContext<Nav | null>(null)
export const useNav = () => useContext(Ctx)!

const SCREENS: Screen[] = ['dashboard', 'bom', 'parts', 'orders', 'inventory', 'suppliers', 'builds', 'quality', 'settings']
const fromHash = (): Screen => {
  const h = location.hash.replace(/^#\/?/, '') as Screen
  return SCREENS.includes(h) ? h : 'dashboard'
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>(fromHash)
  const [partId, openPart] = useState<string | null>(null)
  const [orderId, openOrder] = useState<string | null>(null)
  const [supplierId, openSupplier] = useState<string | null>(null)
  const [buildId, openBuild] = useState<string | null>(null)
  const [ncrId, openNcr] = useState<string | null>(null)
  const [releaseId, openRelease] = useState<string | null>(null)
  useEffect(() => {
    const f = () => setScreen(fromHash())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  const go = (s: Screen) => {
    location.hash = `/${s}`
    setScreen(s)
  }
  return <Ctx.Provider value={{ screen, go, partId, openPart, orderId, openOrder, supplierId, openSupplier, buildId, openBuild, ncrId, openNcr, releaseId, openRelease }}>{children}</Ctx.Provider>
}
