export type ID = string

export type MakeBuy = 'make' | 'buy'

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
  plannedCost: number // per unit, in `currency`
  currency: string
  supplierId: ID | null
  supplierPn: string
  url: string
  leadTimeDays: number | null
  onHand: number
  location: string
  minStock: number // reorder point
  sparesTarget: number // spares to keep on top of builds
  notes: string
  files: string[] // paths relative to the data folder
  createdAt: string
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
  baseCurrency: string // 'ILS'
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
  }
}

export const uid = () => crypto.randomUUID()
export const today = () => new Date().toISOString().slice(0, 10)
