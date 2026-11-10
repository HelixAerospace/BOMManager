import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { produce, type Draft } from 'immer'
import type { BomData } from './types'
import { emptyData } from './types'
import { sampleData } from './sample'
import * as fs from './storage'

declare const __APP_VERSION__: string

type Mode = 'loading' | 'welcome' | 'reconnect' | 'init-folder' | 'ready'

export interface Conflict {
  revision: number
  savedAt: string
  savedBy: string
}

interface Store {
  mode: Mode
  demo: boolean
  folderName: string
  data: BomData
  dirty: boolean
  saving: boolean
  lastSaved: string
  conflict: Conflict | null
  updateAvailable: boolean
  toast: string | null
  error: string | null
  update: (recipe: (d: Draft<BomData>) => void) => void
  save: (force?: boolean) => Promise<void>
  reload: () => Promise<void>
  openFolder: () => Promise<void>
  reconnect: () => Promise<void>
  initFolder: (withSample: boolean) => Promise<void>
  startDemo: () => void
  closeFolder: () => Promise<void>
  dismissConflict: () => void
  notify: (msg: string) => void
  attach: (group: string, file: File) => Promise<string | null>
  openFile: (path: string) => Promise<void>
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
export const useData = () => useStore().data

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading')
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [demo, setDemo] = useState(false)
  const [data, setData] = useState<BomData>(emptyData)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState('')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadedRevision = useRef(0)
  const toastTimer = useRef<number>(0)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async (handle: FileSystemDirectoryHandle) => {
    const st = await fs.readData(handle)
    setDir(handle)
    setDemo(false)
    if (!st) {
      setMode('init-folder')
      return
    }
    const d = { ...emptyData(), ...st.data, settings: { ...emptyData().settings, ...st.data.settings } }
    setData(d)
    loadedRevision.current = d.revision
    setLastSaved(d.savedAt)
    setDirty(false)
    setConflict(null)
    setMode('ready')
  }, [])

  // On start: reuse the folder picked last time.
  useEffect(() => {
    ;(async () => {
      if (!fs.fsSupported()) return setMode('welcome')
      const h = await fs.getSavedFolder()
      if (!h) return setMode('welcome')
      setDir(h)
      if (await fs.hasPermission(h, false)) {
        try {
          await load(h)
        } catch (e) {
          setError(String(e))
          setMode('welcome')
        }
      } else setMode('reconnect')
    })()
  }, [load])

  const update = useCallback((recipe: (d: Draft<BomData>) => void) => {
    setData((prev) => produce(prev, recipe))
    setDirty(true)
  }, [])

  const save = useCallback(
    async (force = false) => {
      if (demo) {
        setDirty(false)
        notify('Demo mode: changes are not saved to disk')
        return
      }
      if (!dir) return
      setSaving(true)
      try {
        const disk = await fs.peekRevision(dir)
        if (!force && disk && disk.revision > loadedRevision.current) {
          setConflict({ revision: disk.revision, savedAt: disk.savedAt, savedBy: disk.savedBy })
          return
        }
        const next: BomData = {
          ...data,
          revision: Math.max(loadedRevision.current, disk?.revision ?? 0) + 1,
          savedAt: new Date().toISOString(),
          savedBy: fs.deviceName(),
        }
        await fs.writeData(dir, next)
        loadedRevision.current = next.revision
        setData(next)
        setLastSaved(next.savedAt)
        setDirty(false)
        setConflict(null)
        notify('Saved')
      } catch (e) {
        setError(`Save failed: ${e}`)
      } finally {
        setSaving(false)
      }
    },
    [demo, dir, data, notify],
  )

  const reload = useCallback(async () => {
    if (dir) await load(dir)
  }, [dir, load])

  // When the window regains focus, check whether another computer saved a newer version.
  useEffect(() => {
    if (mode !== 'ready' || !dir) return
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const disk = await fs.peekRevision(dir)
      if (!disk || disk.revision <= loadedRevision.current) return
      if (!dirty) {
        await load(dir)
        notify(`Loaded newer data saved by ${disk.savedBy || 'another computer'}`)
      } else setConflict({ revision: disk.revision, savedAt: disk.savedAt, savedBy: disk.savedBy })
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [mode, dir, dirty, load, notify])

  // Check for a newer version of the app itself.
  useEffect(() => {
    if (import.meta.env.DEV) return
    const check = async () => {
      try {
        const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
        const v = (await r.json()).version
        if (v && v !== __APP_VERSION__) setUpdateAvailable(true)
      } catch {
        /* offline: ignore */
      }
    }
    check()
    const t = window.setInterval(check, 30 * 60 * 1000)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', check)
    }
  }, [])

  // Ctrl+S and a warning before closing with unsaved changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty) save()
      }
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [dirty, save])

  const openFolder = useCallback(async () => {
    try {
      const h = await fs.pickFolder()
      await load(h)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e))
    }
  }, [load])

  const reconnect = useCallback(async () => {
    if (!dir) return
    if (await fs.hasPermission(dir, true)) await load(dir)
  }, [dir, load])

  const initFolder = useCallback(
    async (withSample: boolean) => {
      if (!dir) return
      const d = withSample ? sampleData() : emptyData()
      d.revision = 1
      d.savedAt = new Date().toISOString()
      d.savedBy = fs.deviceName()
      await fs.writeData(dir, d)
      await load(dir)
    },
    [dir, load],
  )

  const startDemo = useCallback(() => {
    setDemo(true)
    setDir(null)
    setData(sampleData())
    setDirty(false)
    setMode('ready')
  }, [])

  const closeFolder = useCallback(async () => {
    await fs.forgetFolder()
    setDir(null)
    setDemo(false)
    setData(emptyData())
    setDirty(false)
    setMode('welcome')
  }, [])

  const attach = useCallback(
    async (group: string, file: File) => {
      if (!dir) {
        notify('Attachments need a data folder (not available in demo mode)')
        return null
      }
      try {
        return await fs.saveAttachment(dir, group, file)
      } catch (e) {
        setError(`Could not save file: ${e}`)
        return null
      }
    },
    [dir, notify],
  )

  const openFile = useCallback(
    async (path: string) => {
      if (!dir) return
      try {
        const f = await fs.readAttachment(dir, path)
        const url = URL.createObjectURL(f)
        const viewable = /\.(pdf|png|jpe?g|gif|webp|txt|svg)$/i.test(f.name)
        if (viewable) window.open(url, '_blank')
        else {
          const a = document.createElement('a')
          a.href = url
          a.download = f.name
          a.click()
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } catch (e) {
        setError(`Could not open ${path}: ${e}`)
      }
    },
    [dir],
  )

  const value = useMemo<Store>(
    () => ({
      mode, demo, folderName: dir?.name ?? '', data, dirty, saving, lastSaved, conflict, updateAvailable, toast, error,
      update, save, reload, openFolder, reconnect, initFolder, startDemo, closeFolder,
      dismissConflict: () => setConflict(null), notify, attach, openFile,
    }),
    [mode, demo, dir, data, dirty, saving, lastSaved, conflict, updateAvailable, toast, error, update, save, reload, openFolder, reconnect, initFolder, startDemo, closeFolder, notify, attach, openFile],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {error}
          <button className="underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </Ctx.Provider>
  )
}
