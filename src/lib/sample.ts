import { emptyData, uid, type BomData, type Part } from './types'

const d = (offset: number) => {
  const t = new Date()
  t.setDate(t.getDate() + offset)
  return t.toISOString().slice(0, 10)
}

export function sampleData(): BomData {
  const data = emptyData()
  const sup = (name: string, currency: string, website: string) => {
    const s = { id: uid(), name, currency, website, email: '', phone: '', notes: '' }
    data.suppliers.push(s)
    return s.id
  }
  const tmotor = sup('T-Motor', 'USD', 'https://store.tmotor.com')
  const digikey = sup('DigiKey', 'USD', 'https://www.digikey.com')
  const cnc = sup('Galil CNC (local machinist)', 'ILS', '')
  const mcm = sup('McMaster-Carr', 'USD', 'https://www.mcmaster.com')
  const holy = sup('Holybro', 'USD', 'https://holybro.com')
  const getfpv = sup('GetFPV', 'USD', 'https://www.getfpv.com')

  const part = (pn: string, name: string, category: string, makeBuy: 'make' | 'buy', cost: number, currency: string, supplierId: string | null, onHand: number, extra: Partial<Part> = {}) => {
    const p: Part = {
      id: uid(), pn, name, category, makeBuy, rev: 'A', unit: 'pcs', plannedCost: cost, currency, supplierId,
      supplierPn: '', url: '', leadTimeDays: null, onHand, location: '', minStock: 0, sparesTarget: 0, notes: '', files: [],
      createdAt: new Date().toISOString(), ...extra,
    }
    data.parts.push(p)
    return p.id
  }
  const line = (parentId: string, childId: string, qty: number) => data.bom.push({ id: uid(), parentId, childId, qty, notes: '' })

  const drone = part('ASM-00001', 'Helix H1 Drone', 'ASM', 'make', 0, 'ILS', null, 0)
  const frame = part('ASM-00002', 'Frame assembly', 'ASM', 'make', 0, 'ILS', null, 0)
  const prop = part('ASM-00003', 'Propulsion set (per arm)', 'ASM', 'make', 0, 'ILS', null, 0)
  const avion = part('ASM-00004', 'Avionics stack', 'ASM', 'make', 0, 'ILS', null, 0)

  const plate = part('MEC-00001', 'Center plate, carbon 3 mm', 'MEC', 'make', 180, 'ILS', cnc, 6, { leadTimeDays: 14, sparesTarget: 2, rev: 'B', weightSource: 'cad', weight: 38 })
  const arm = part('MEC-00002', 'Arm tube, carbon 20 mm', 'MEC', 'make', 95, 'ILS', cnc, 14, { leadTimeDays: 14, sparesTarget: 4, weightSource: 'cad', weight: 42 })
  const clamp = part('MEC-00003', 'Arm clamp, Al 6061', 'MEC', 'make', 60, 'ILS', cnc, 10, { leadTimeDays: 10, sparesTarget: 4, weightSource: 'cad', weight: 9.5 })
  const motor = part('PUR-00001', 'Motor MN3110 KV700', 'PUR', 'buy', 79.9, 'USD', tmotor, 9, { leadTimeDays: 21, sparesTarget: 2, supplierPn: 'MN3110-700', weightSource: 'supplier', weight: 98 })
  const propel = part('PUR-00002', 'Propeller 12x4 CF (pair)', 'PUR', 'buy', 28, 'USD', tmotor, 30, { sparesTarget: 8, minStock: 10, weightSource: 'measured', weight: 22 })
  const esc = part('ELE-00001', 'ESC 40A', 'ELE', 'buy', 42, 'USD', tmotor, 4, { leadTimeDays: 21, sparesTarget: 2, weightSource: 'supplier', weight: 28 })
  const fc = part('ELE-00002', 'Flight controller Pixhawk 6C', 'ELE', 'buy', 235, 'USD', holy, 2, { leadTimeDays: 14, sparesTarget: 1, weightSource: 'measured', weight: 59 })
  const gps = part('ELE-00003', 'GPS M10', 'ELE', 'buy', 45, 'USD', holy, 3, { sparesTarget: 1, weightSource: 'supplier', weight: 20 })
  const pdb = part('ELE-00004', 'Power distribution board', 'ELE', 'buy', 18, 'USD', digikey, 6, { weight: 12 })
  const xt60 = part('ELE-00005', 'XT60 connector pair', 'ELE', 'buy', 1.2, 'USD', digikey, 40, { minStock: 20, weightSource: 'supplier', weight: 3.5 })
  const m3 = part('FAS-00001', 'Screw M3x10 SHCS', 'FAS', 'buy', 0.095, 'USD', mcm, 100, { minStock: 50, packPrice: 9.5, packQty: 100, supplierPn: '91290A115', weightSource: 'supplier', weight: 0.8 })
  const tape = part('CON-00001', 'Threadlocker 243', 'CON', 'buy', 35, 'ILS', null, 1, { unit: 'bottle', minStock: 1 })

  const motorPart = data.parts.find((p) => p.id === motor)!
  motorPart.sources = [
    { id: uid(), supplierId: tmotor, supplierPn: 'MN3110-700', url: 'https://store.tmotor.com', leadTimeDays: 21, notes: '' },
    { id: uid(), supplierId: getfpv, supplierPn: 'TM-MN3110-KV700', url: 'https://www.getfpv.com', leadTimeDays: 7, notes: '' },
  ]

  line(drone, frame, 1)
  line(drone, prop, 4)
  line(drone, avion, 1)
  line(drone, m3, 48)
  line(drone, tape, 0.05)
  Object.assign(data.parts.find((p) => p.id === frame)!, { weight: 15, weightSource: 'cad' }) // wiring and glue on the frame
  line(frame, plate, 2)
  line(frame, arm, 4)
  line(frame, clamp, 4)
  line(prop, motor, 1)
  line(prop, propel, 1)
  line(prop, esc, 1)
  line(avion, fc, 1)
  line(avion, gps, 1)
  line(avion, pdb, 1)
  line(avion, xt60, 6)

  data.settings.topAssemblyId = drone

  // Motors bought twice before, from two different suppliers, to show price history.
  data.orders.push(
    {
      id: uid(), number: 'PO-0001', supplierId: tmotor, status: 'received', currency: 'USD', fxToIls: 3.75,
      orderDate: d(-210), expectedDate: d(-190), receivedDate: d(-188), shipping: 25, invoiceNumber: 'TM-80412', invoiceTotal: 313,
      notes: 'Prototype batch', files: [],
      lines: [{ id: uid(), partId: motor, qty: 4, unitPrice: 72, qtyReceived: 4 }],
    },
    {
      id: uid(), number: 'PO-0002', supplierId: getfpv, status: 'received', currency: 'USD', fxToIls: 3.72,
      orderDate: d(-120), expectedDate: d(-110), receivedDate: d(-108), shipping: 18, invoiceNumber: 'GF-55102', invoiceTotal: 354,
      notes: 'T-Motor was out of stock', files: [],
      lines: [{ id: uid(), partId: motor, qty: 4, unitPrice: 84, qtyReceived: 4 }],
    },
  )
  data.orders.push(
    {
      id: uid(), number: 'PO-0003', supplierId: tmotor, status: 'received', currency: 'USD', fxToIls: 3.68,
      orderDate: d(-40), expectedDate: d(-20), receivedDate: d(-18), shipping: 60, invoiceNumber: 'TM-88213', invoiceTotal: 1013.6,
      notes: '', files: [],
      lines: [
        { id: uid(), partId: motor, qty: 8, unitPrice: 76.5, qtyReceived: 8 },
        { id: uid(), partId: esc, qty: 4, unitPrice: 44, qtyReceived: 4 },
      ],
    },
    {
      id: uid(), number: 'PO-0004', supplierId: holy, status: 'shipped', currency: 'USD', fxToIls: 3.7,
      orderDate: d(-12), expectedDate: d(-2), receivedDate: '', shipping: 35, invoiceNumber: '', invoiceTotal: null, notes: 'DHL tracking 1234567890', files: [],
      lines: [
        { id: uid(), partId: fc, qty: 3, unitPrice: 229, qtyReceived: 0 },
        { id: uid(), partId: gps, qty: 3, unitPrice: 45, qtyReceived: 0 },
      ],
    },
    {
      id: uid(), number: 'PO-0005', supplierId: cnc, status: 'ordered', currency: 'ILS', fxToIls: 1,
      orderDate: d(-5), expectedDate: d(9), receivedDate: '', shipping: 0, invoiceNumber: '', invoiceTotal: null, notes: 'Rev B drawings sent', files: [],
      lines: [
        { id: uid(), partId: plate, qty: 6, unitPrice: 170, qtyReceived: 0 },
        { id: uid(), partId: clamp, qty: 12, unitPrice: 58, qtyReceived: 0 },
      ],
    },
    {
      id: uid(), number: 'PO-0006', supplierId: tmotor, status: 'draft', currency: 'USD', fxToIls: 3.7,
      orderDate: '', expectedDate: '', receivedDate: '', shipping: 0, invoiceNumber: '', invoiceTotal: null, notes: '', files: [],
      lines: [{ id: uid(), partId: esc, qty: 16, unitPrice: 42, qtyReceived: 0 }],
    },
  )
  // ---- quality records (example) ----
  const S = (id: string) => data.suppliers.find((x) => x.id === id)!
  Object.assign(S(tmotor), { country: 'China', aslStatus: 'approved', approvedFor: 'COTS motors, ESCs and propellers', approvedOn: d(-200), reviewDue: d(165), aslNotes: 'Manufacturer direct; 2 orders without issues' })
  Object.assign(S(digikey), { country: 'United States', aslStatus: 'approved', approvedFor: 'Electronic components (authorised distributor)', approvedOn: d(-300), reviewDue: d(65) })
  Object.assign(S(cnc), { country: 'Israel', aslStatus: 'conditional', approvedFor: 'CNC machining to drawing', approvedOn: d(-60), reviewDue: d(30), aslNotes: 'Conditional until NCR-0002 corrective action is verified' })
  Object.assign(S(mcm), { country: 'United States', aslStatus: 'approved', approvedFor: 'Fasteners and hardware', approvedOn: d(-300), reviewDue: d(-5) })
  Object.assign(S(holy), { country: 'China', aslStatus: 'approved', approvedFor: 'Flight controllers and GPS', approvedOn: d(-150), reviewDue: d(215) })
  Object.assign(S(getfpv), { country: 'United States', aslStatus: 'pending', approvedFor: 'Distributor for COTS propulsion (backup source)' })

  const P = (pn: string) => data.parts.find((x) => x.pn === pn)!
  const origin: Record<string, string> = {
    'MEC-00001': 'Israel', 'MEC-00002': 'Israel', 'MEC-00003': 'Israel', 'PUR-00001': 'China', 'PUR-00002': 'China', 'ELE-00001': 'China',
    'ELE-00002': 'China', 'ELE-00003': 'China', 'ELE-00004': 'Taiwan', 'ELE-00005': 'China', 'FAS-00001': 'United States',
  }
  for (const [pn, c] of Object.entries(origin)) P(pn).countryOfOrigin = c
  for (const pn of ['PUR-00001', 'ELE-00001', 'ELE-00002', 'ELE-00003']) P(pn).serialized = true
  P('MEC-00001').revisions = [{ id: uid(), date: d(-70), fromRev: 'A', toRev: 'B', change: 'Motor-arm bolt holes moved 1.5 mm outward; corner radius 3 → 5 mm', reason: 'Cracking at corners in flight test (NCR-0001)', source: 'manual' }]

  // Released configuration: a frozen copy of the current BOM
  const pn = (id: string) => data.parts.find((x) => x.id === id)!
  const lines: BomData['releases'][number]['lines'] = []
  const walk = (id: string) => {
    for (const l of data.bom.filter((x) => x.parentId === id).sort((a, b) => pn(a.childId).pn.localeCompare(pn(b.childId).pn))) {
      const c = pn(l.childId)
      lines.push({ parentPn: pn(id).pn, pn: c.pn, name: c.name, rev: c.rev, qty: l.qty })
      walk(l.childId)
    }
  }
  walk(drone)
  const rel = { id: uid(), assemblyId: drone, name: 'Helix H1 Drone config 1.0', date: d(-30), notes: 'First configuration for demo units', lines }
  data.releases.push(rel)

  // Two built units: one complete and fully traced, one in progress
  const po = (n: string) => data.orders.find((o) => o.number === n)!.id
  const leaves: [string, number][] = [['MEC-00001', 2], ['MEC-00002', 4], ['MEC-00003', 4], ['PUR-00001', 4], ['PUR-00002', 4], ['ELE-00001', 4], ['ELE-00002', 1], ['ELE-00003', 1], ['ELE-00004', 1], ['ELE-00005', 6], ['FAS-00001', 48], ['CON-00001', 0.05]]
  const lot: Record<string, string | null> = { 'PUR-00001': po('PO-0003'), 'ELE-00001': po('PO-0003') }
  const mkItems = (unit: number, complete: boolean) =>
    leaves.map(([code, qty]) => ({
      id: uid(), partId: P(code).id, qty, lotOrderId: lot[code] ?? null,
      serials: P(code).serialized ? Array.from({ length: qty }, (_, k) => (complete || code === 'PUR-00001' ? `${code.slice(0, 3)}${unit}${String(k + 1).padStart(2, '0')}-${(1000 + unit * 17 + k).toString(36).toUpperCase()}` : '')) : [],
    }))
  data.builds.push(
    { id: uid(), serial: 'SN-0001', assemblyId: drone, releaseId: rel.id, status: 'complete', startedOn: d(-25), completedOn: d(-21), notes: 'FW 1.4.2 · test flight 12 min OK. Built before lot tracking started for most parts.', items: mkItems(1, true).map((i) => (i.partId === P('PUR-00001').id ? { ...i, lotOrderId: po('PO-0001') } : i)) },
    { id: uid(), serial: 'SN-0002', assemblyId: drone, releaseId: rel.id, status: 'in-progress', startedOn: d(-3), completedOn: '', notes: '', items: mkItems(2, false) },
  )

  data.ncrs.push(
    {
      id: uid(), number: 'NCR-0001', date: d(-75), title: 'Center plate cracked at corners after flight test', description: 'Hairline cracks at two corner bolt holes after 6 flights. Drawing rev A, 3 mm carbon.',
      severity: 'major', partId: P('MEC-00001').id, orderId: null, supplierId: cnc, buildId: null, qtyAffected: 2, disposition: 'scrap',
      rootCause: 'Corner radius too small and bolt holes too close to the edge (design).', correctiveAction: 'Drawing revised to rev B: holes moved outward, corner radius 5 mm.', status: 'closed', closedOn: d(-68), files: [],
    },
    {
      id: uid(), number: 'NCR-0002', date: d(-4), title: 'Arm clamps bore oversize', description: 'Clamp bore measured 20.12–20.15 mm; drawing 20.00 +0.05/−0. Arms slip under torque.',
      severity: 'major', partId: P('MEC-00003').id, orderId: po('PO-0005'), supplierId: cnc, buildId: null, qtyAffected: 4, disposition: 'return-to-supplier',
      rootCause: '', correctiveAction: '', status: 'open', closedOn: '', files: [],
    },
  )
  return data
}
