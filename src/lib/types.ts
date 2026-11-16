export type ID = string

export type MakeBuy = 'make' | 'buy'

/** How a weight was obtained, from least to most trustworthy. */
export type WeightSource = 'cad' | 'supplier' | 'measured'
export const WEIGHT_SOURCES: { value: WeightSource; label: string; short: string }[] = [
  { value: 'cad', label: 'CAD estimate', short: 'CAD' },
  { value: 'supplier', label: 'Per supplier', short: 'Supplier' },
  { value: 'measured', label: 'As measured', short: 'Measured' },
]

export interface Category {
  prefix: string // e.g. "MEC"
  name: string // e.g. "Mechanical (custom)"
}

export interface Part {
  id: ID
  pn: string
  name: string
  category: string // category prefix
  makeBuy: MakeBuy
  rev: string
  unit: string // pcs, m, g ...
  plannedCost: number // per unit (piece), in `currency`. Derived from packPrice / packQty when both are set.
  currency: string
  packPrice?: number | null // price of one pack, when the part is bought in packs (e.g. 100 screws)
  packQty?: number | null // pieces per pack
  weight?: number | null // grams per unit; for assemblies, extra weight on top of the children (glue, wiring…)
  weightSource?: WeightSource | null // where the weight number comes from
  countryOfOrigin?: string // where the part is made (can differ from the supplier's country)
  serialized?: boolean // record a serial number for each unit in builds
  revisions?: RevisionEntry[] // revision log, oldest first
  supplierId: ID | null // preferred supplier (mirrors the preferred entry in sources)
  supplierPn: string
  url: string
  leadTimeDays: number | null
  sources?: PartSource[] // every supplier this part can be bought from
  onHand: number
  location: string
  minStock: number // reorder point
  sparesTarget: number // spares to keep on top of builds
  notes: string
  files: string[] // paths relative to the data folder
  createdAt: string
}

/** One place a part can be bought. A part can have several; part.supplierId is the preferred one. */
export interface PartSource {
  id: ID
  supplierId: ID | null
  supplierPn: string
  url: string
  leadTimeDays: number | null
  notes: string
}

export interface BomLine {
  id: ID
  parentId: ID
  childId: ID
  qty: number
  notes: string
  manual?: boolean // added by hand in the app (kept when re-importing from Inventor)
}

export interface Supplier {
  id: ID
  name: string
  website: string
  email: string
  phone: string
  currency: string
  notes: string
  // Approved supplier list (quality)
  country?: string // where the supplier is based
  aslStatus?: AslStatus
  approvedFor?: string // scope, e.g. "COTS propulsion", "CNC machining to drawing"
  approvedOn?: string // yyyy-mm-dd
  reviewDue?: string // yyyy-mm-dd
  aslNotes?: string // basis of approval: samples, audit, history…
}

/** Approved supplier list status. */
export type AslStatus = 'approved' | 'conditional' | 'pending' | 'disqualified'
export const ASL_STATUSES: { value: AslStatus; label: string }[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'pending', label: 'Pending review' },
  { value: 'disqualified', label: 'Disqualified' },
]

/** One entry in a part's revision log (configuration control). */
export interface RevisionEntry {
  id: ID
  date: string // yyyy-mm-dd
  fromRev: string
  toRev: string
  change: string // what changed
  reason: string // why
  source?: 'manual' | 'inventor'
}

/** A released configuration: a frozen copy of an assembly's BOM with every part's revision. */
export interface Release {
  id: ID
  assemblyId: ID
  name: string // e.g. "H1 config 1.0"
  date: string
  notes: string
  lines: { parentPn: string; pn: string; name: string; rev: string; qty: number }[] // structure, one per BOM line
}

export type BuildStatus = 'in-progress' | 'complete' | 'scrapped'
/** Which lot (order) and serial numbers went into one built unit for one part. */
export interface BuildItem {
  id: ID
  partId: ID
  qty: number // pieces used in this unit
  lotOrderId: ID | null // order the parts came from (lot); null = unknown / from stock before tracking
  serials: string[] // for serialized parts
}
export interface Build {
  id: ID
  serial: string // e.g. H1-0001
  assemblyId: ID
  releaseId: ID | null
  status: BuildStatus
  startedOn: string
  completedOn: string
  notes: string
  items: BuildItem[]
}

export type NcrSeverity = 'minor' | 'major' | 'critical'
export type NcrDisposition = 'pending' | 'use-as-is' | 'rework' | 'return-to-supplier' | 'scrap'
export interface Ncr {
  id: ID
  number: string // NCR-0001
  date: string
  title: string
  description: string
  severity: NcrSeverity
  partId: ID | null
  orderId: ID | null
  supplierId: ID | null
  buildId: ID | null
  qtyAffected: number | null
  disposition: NcrDisposition
  rootCause: string
  correctiveAction: string
  status: 'open' | 'closed'
  closedOn: string
  files: string[]
}

export type OrderStatus = 'draft' | 'ordered' | 'shipped' | 'partial' | 'received' | 'cancelled'

export interface OrderLine {
  id: ID
  partId: ID
  qty: number
  unitPrice: number // in order currency
  qtyReceived: number
}

export interface Order {
  id: ID
  number: string // PO-0001
  supplierId: ID | null
  status: OrderStatus
  currency: string
  fxToIls: number // exchange rate locked when ordered/received; editable
  orderDate: string // yyyy-mm-dd
  expectedDate: string
  receivedDate: string
  shipping: number // shipping/customs/fees (order currency, excl. reclaimable VAT)
  invoiceNumber: string
  invoiceTotal: number | null
  notes: string
  files: string[]
  lines: OrderLine[]
}

export interface StockMove {
  id: ID
  partId: ID
  delta: number
  reason: 'receive' | 'adjust' | 'build' | 'scrap'
  ref: string
  date: string // ISO
}

export interface Settings {
  baseCurrency: string // 'ILS': costs are calculated in shekels internally
  displayCurrency?: string // currency costs are shown in (default USD)
  fx: Record<string, number> // currency -> ILS rate
  categories: Category[]
  topAssemblyId: ID | null
  buildQty: number
}

export interface BomData {
  format: 'helix-bom'
  schemaVersion: 1
  revision: number // incremented on every save, used for conflict detection
  savedAt: string
  savedBy: string
  settings: Settings
  parts: Part[]
  bom: BomLine[]
  suppliers: Supplier[]
  orders: Order[]
  stockMoves: StockMove[]
  releases: Release[]
  builds: Build[]
  ncrs: Ncr[]
}

export const DEFAULT_CATEGORIES: Category[] = [
  { prefix: 'ASM', name: 'Assembly' },
  { prefix: 'MEC', name: 'Mechanical (custom)' },
  { prefix: 'ELE', name: 'Electronics' },
  { prefix: 'PUR', name: 'Purchased (off-the-shelf)' },
  { prefix: 'FAS', name: 'Fasteners & hardware' },
  { prefix: 'CON', name: 'Consumables' },
]

export function emptyData(): BomData {
  return {
    format: 'helix-bom',
    schemaVersion: 1,
    revision: 0,
    savedAt: '',
    savedBy: '',
    settings: {
      baseCurrency: 'ILS',
      displayCurrency: 'USD',
      fx: { ILS: 1, USD: 3.7, EUR: 4.0, CNY: 0.51, GBP: 4.7 },
      categories: DEFAULT_CATEGORIES,
      topAssemblyId: null,
      buildQty: 5,
    },
    parts: [],
    bom: [],
    suppliers: [],
    orders: [],
    stockMoves: [],
    releases: [],
    builds: [],
    ncrs: [],
  }
}

export const uid = () => crypto.randomUUID()
export const today = () => new Date().toISOString().slice(0, 10)
