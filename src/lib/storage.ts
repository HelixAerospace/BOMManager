// Reads and writes the BOM data in a folder the user picks (e.g. a OneDrive-synced folder),
// using the browser's File System Access API (Chrome / Edge on desktop).
import type { BomData } from './types'

export const DATA_FILE = 'helix-bom-data.json'
const BACKUP_DIR = 'backups'
const MAX_BACKUPS = 100

export const fsSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

// ---- remember the folder between visits (handles can be stored in IndexedDB) ----
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('helix-bom', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key)
    r.onsuccess = () => resolve(r.result as T)
    r.onerror = () => reject(r.error)
  })
}
async function kvSet(key: string, value: unknown) {
  const db = await idb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getSavedFolder() {
  try {
    return await kvGet<FileSystemDirectoryHandle>('folder')
  } catch {
    return undefined
  }
}
export async function forgetFolder() {
  await kvSet('folder', undefined)
}

export async function pickFolder() {
  const handle = await window.showDirectoryPicker({ id: 'helix-bom', mode: 'readwrite' })
  await kvSet('folder', handle)
  return handle
}

export async function hasPermission(handle: FileSystemDirectoryHandle, ask: boolean) {
  const opts = { mode: 'readwrite' as const }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if (!ask) return false
  return (await handle.requestPermission(opts)) === 'granted'
}

// ---- data file ----
export interface FileState {
  data: BomData
  lastModified: number
}

export async function readData(dir: FileSystemDirectoryHandle): Promise<FileState | null> {
  let fh: FileSystemFileHandle
  try {
    fh = await dir.getFileHandle(DATA_FILE)
  } catch {
    return null // file does not exist yet
  }
  const file = await fh.getFile()
  const text = await file.text()
  const data = JSON.parse(text) as BomData
  if (data.format !== 'helix-bom') throw new Error(`${DATA_FILE} is not a Helix BOM data file`)
  return { data, lastModified: file.lastModified }
}

export async function peekRevision(dir: FileSystemDirectoryHandle) {
  try {
    const fh = await dir.getFileHandle(DATA_FILE)
    const file = await fh.getFile()
    const data = JSON.parse(await file.text()) as BomData
    return { revision: data.revision, savedAt: data.savedAt, savedBy: data.savedBy, lastModified: file.lastModified }
  } catch {
    return null
  }
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(text)
  await w.close()
  return (await fh.getFile()).lastModified
}

const stamp = () => new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, '')

/** Copies the current data file into backups/ before it is overwritten, and prunes old backups. */
async function backupCurrent(dir: FileSystemDirectoryHandle) {
  let text: string
  try {
    const fh = await dir.getFileHandle(DATA_FILE)
    text = await (await fh.getFile()).text()
  } catch {
    return
  }
  const bdir = await dir.getDirectoryHandle(BACKUP_DIR, { create: true })
  await writeText(bdir, `helix-bom-data_${stamp()}.json`, text)
  const names: string[] = []
  for await (const [name] of bdir.entries()) if (name.endsWith('.json')) names.push(name)
  names.sort()
  for (const n of names.slice(0, Math.max(0, names.length - MAX_BACKUPS))) await bdir.removeEntry(n)
}

export async function writeData(dir: FileSystemDirectoryHandle, data: BomData) {
  await backupCurrent(dir)
  return writeText(dir, DATA_FILE, JSON.stringify(data, null, 2))
}

// ---- attachments (invoices, drawings, STEP files...) ----
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file'

/** Copies a file into <folder>/files/<group>/ and returns its relative path. */
export async function saveAttachment(dir: FileSystemDirectoryHandle, group: string, file: File) {
  const files = await dir.getDirectoryHandle('files', { create: true })
  const g = await files.getDirectoryHandle(safe(group), { create: true })
  let name = safe(file.name)
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; ; i++) {
    try {
      await g.getFileHandle(name)
      name = `${base} (${i})${ext}`
    } catch {
      break
    }
  }
  const fh = await g.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(file)
  await w.close()
  return `files/${safe(group)}/${name}`
}

export async function readAttachment(dir: FileSystemDirectoryHandle, path: string) {
  const parts = path.split('/')
  let d = dir
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p)
  return (await d.getFileHandle(parts[parts.length - 1])).getFile()
}

export function deviceName() {
  let n = localStorage.getItem('helix-bom-device')
  if (!n) {
    const ua = navigator.userAgent
    n = /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Computer'
    n += '-' + Math.random().toString(36).slice(2, 6)
    localStorage.setItem('helix-bom-device', n)
  }
  return n
}
