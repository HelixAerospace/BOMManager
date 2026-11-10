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
  saveIfDirty: () => Promise<void>
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
  const dataRef = useRef<BomData>(data)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const pendingSave = useRef(false)
  const saveRef = useRef<(force?: boolean) => Promise<void>>(async () => {})
  const setDataSync = useCallback((d: BomData) => {
    dataRef.current = d
    setData(d)
  }, [])
  const setDirtySync = useCallback((v: boolean) => {
    dirtyRef.current = v
    setDirty(v)
  }, [])
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
    setDataSync(d)
    loadedRevision.current = d.revision
    setLastSaved(d.savedAt)
    setDirtySync(false)
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
    setDataSync(produce(dataRef.current, recipe))
    setDirtySync(true)
  }, [])

  const save = useCallback(
    async (force = false) => {
      if (demo) {
        setDirtySync(false)
        notify('Demo mode: changes are not saved to disk')
        return
      }
      if (!dir) return
      if (savingRef.current) {
        pendingSave.current = true // another save is running; save again when it finishes
        return
      }
      savingRef.current = true
      setSaving(true)
      try {
        const disk = await fs.peekRevision(dir)
        if (!force && disk && disk.revision > loadedRevision.current) {
          setConflict({ revision: disk.revision, savedAt: disk.savedAt, savedBy: disk.savedBy })
          return
        }
        const snapshot = dataRef.current
        const next: BomData = {
          ...snapshot,
          revision: Math.max(loadedRevision.current, disk?.revision ?? 0) + 1,
          savedAt: new Date().toISOString(),
          savedBy: fs.deviceName(),
        }
        await fs.writeData(dir, next)
        loadedRevision.current = next.revision
        setLastSaved(next.savedAt)
        if (dataRef.current === snapshot) {
          setDataSync(next)
          setDirtySync(false)
        } else {
          // edits were made while saving: keep them (still unsaved) on top of the new revision
          setDataSync({ ...dataRef.current, revision: next.revision, savedAt: next.savedAt, savedBy: next.savedBy })
        }
        setConflict(null)
        notify('Saved')
      } catch (e) {
        setError(`Save failed: ${e}`)
      } finally {
        savingRef.current = false
        setSaving(false)
        if (pendingSave.current) {
          pendingSave.current = false
          if (dirtyRef.current) setTimeout(() => saveRef.current(), 0)
        }
      }
    },
    [demo, dir, notify, setDataSync, setDirtySync],
  )
  saveRef.current = save
  /** Saves only when there are unsaved changes (used when an edit panel closes). */
  const saveIfDirty = useCallback(async () => {
    if (dirtyRef.current) await saveRef.current()
  }, [])

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
    setDataSync(sampleData())
    setDirtySync(false)
    setMode('ready')
  }, [])

  const closeFolder = useCallback(async () => {
    await fs.forgetFolder()
    setDir(null)
    setDemo(false)
    setDataSync(emptyData())
    setDirtySync(false)
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
      update, save, saveIfDirty, reload, openFolder, reconnect, initFolder, startDemo, closeFolder,
      dismissConflict: () => setConflict(null), notify, attach, openFile,
    }),
    [mode, demo, dir, data, dirty, saving, lastSaved, conflict, updateAvailable, toast, error, update, save, saveIfDirty, reload, openFolder, reconnect, initFolder, startDemo, closeFolder, notify, attach, openFile],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      {error && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-lg border border-warning-line bg-warning-bg px-4 py-3 text-sm text-ink">
          <span><b className="text-warning">Warning</b> {error}</span>
          <button className="font-medium text-accent hover:underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </Ctx.Provider>
  )
}
