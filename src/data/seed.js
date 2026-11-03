// SYNTHETIC DEMONSTRATION DATA. None of these people, addresses or documents are real.
// They are not COMELEC records. The scenarios below are scripted so each ONCE AI feature has something to show.
import { mulberry32, gauss, pick } from '../lib/rng.js'
import { BARANGAYS } from '../lib/gazetteer.js'
import { EMBED_DIM } from '../lib/handwriting.js'

export const ANCHOR = '2026-10-28T08:00:00.000Z'
const DAY = 86400000
const FIRST = ['Mateo', 'Liza', 'Ramon', 'Carmela', 'Josefa', 'Andres', 'Luz', 'Danilo', 'Perla', 'Nestor', 'Imelda', 'Rodel', 'Marites', 'Jericho', 'Aurora', 'Cesar', 'Dolores', 'Eduardo', 'Fe', 'Gil', 'Hazel', 'Isagani', 'Joy', 'Kristoffer', 'Lorna', 'Manuel', 'Nora', 'Orlando', 'Pia', 'Ruben']
const LAST = ['Aguirre', 'Bautista', 'Castillo', 'Dizon', 'Estrada', 'Flores', 'Gamboa', 'Herrera', 'Ilagan', 'Javier', 'Lacson', 'Manalo', 'Navarro', 'Ocampo', 'Pascual', 'Quiambao', 'Rivera', 'Salonga', 'Tolentino', 'Urbano', 'Valdez', 'Yambao', 'Zamora', 'Dela Pena', 'Santos']

const r = mulberry32(20261028)
const emb = () => Array.from({ length: EMBED_DIM }, () => +gauss(r).toFixed(3))
const noisy = (base, s = 0.22) => base.map((v) => +(v + gauss(r) * s).toFixed(3))
const bById = Object.fromEntries(BARANGAYS.map((b) => [b.id, b]))
const rint = (a, b) => a + Math.floor(r() * (b - a + 1))
const name = () => `${pick(r, FIRST)} ${pick(r, LAST)}`
const DOCS = ['Barangay Clearance', 'Utility Bill', 'Certificate of Residency', 'School ID', 'Lease Contract']

function bn(b, allowTypo = true) {
  const forms = [b.name, b.name, b.name.toUpperCase(), b.name.toLowerCase()]
  if (allowTypo && r() < 0.15) forms.push(pick(r, b.misspell))
  return pick(r, forms)
}
function normalAddr(b, purok) {
  const n = bn(b)
  const streets = b.streets
  const st = pick(r, streets).name
  const words = ['', 'uno', 'dos', 'tres', 'kwatro', 'singko']
  const forms = [
    `Purok ${purok}, Brgy. ${n}`,
    `Prk ${purok} ${n}`,
    `${rint(1, 250)} ${st} St., Purok ${purok}, Barangay ${n}, Sta. Demo`,
    `Brgy ${n}, Purok ${words[purok]}`,
    `${st} Street, Brgy. ${n}, Santa Demo, Nueva Demo`,
    `Purok${purok} Bgy ${n}`,
    `tapat ng ${pick(r, ['simbahan', 'palengke', 'eskwelahan', 'basketball court', 'tulay'])}, Brgy. ${n}`,
  ]
  return pick(r, forms)
}

function baseApp(b, extra = {}) {
  const transfer = r() < 0.18
  const other = pick(r, BARANGAYS.filter((x) => x.id !== b.id))
  return {
    name: name(), age: rint(18, 72),
    type: transfer ? 'Transfer of registration' : 'New registration',
    previousBarangayId: transfer ? other.id : null,
    submittedAt: new Date(+new Date(ANCHOR) - r() * 90 * DAY).toISOString(),
    submittedVia: 'Walk-in', batchId: null,
    supportingDoc: { type: pick(r, DOCS), barangayId: b.id },
    yearsAtAddress: +(r() * 24 + 1).toFixed(1),
    document: r() < 0.9 ? { filename: 'form.png', scanQuality: +(0.45 + r() * 0.5).toFixed(2), embedding: emb(), pages: 1 } : null,
    ...extra,
  }
}

const out = []

// 1) background applications (normal geographic spread)
BARANGAYS.forEach((b) => {
  const n = b.id === 'SAM' ? 7 : b.id === 'DAL' ? 7 : b.id === 'KAL' ? 6 : 11
  for (let i = 0; i < n; i++) {
    const p = rint(1, 5)
    const a = baseApp(b)
    a.rawAddress = normalAddr(b, p)
    if (r() < 0.12) { a.submittedVia = 'Satellite registration'; a.batchId = `SAT-${b.id}-${rint(1, 3)}` }
    out.push(a)
  }
})

// 2) SCENARIO A - possible residency manipulation: 16 forms, Sitio Riverside, Brgy Sampaguita, 3 third-party batch drop-offs
const SAM = bById.SAM
const batchesA = [['BD-1019', 6], ['BD-1022', 5], ['BD-1025', 5]]
const h1 = emb()
let k = 0
batchesA.forEach(([bid, cnt], bi) => {
  for (let i = 0; i < cnt; i++, k++) {
    const mismatch = k < 11
    const variants = [
      `Sitio Riverside, Purok 3, Brgy. Sampaguita`,
      `Riverside, Prk 3, Barangay Sampaguita, Sta. Demo`,
      `SITIO RIVERSIDE PUROK 3 BRGY SAMPAGUITA`,
      `Sitio Riverside Brgy Sampagita`,
    ]
    out.push({
      name: name(), age: rint(19, 55),
      type: mismatch ? 'Transfer of registration' : 'New registration',
      previousBarangayId: mismatch ? 'MAL' : null,
      rawAddress: pick(r, variants),
      submittedAt: new Date(+new Date(ANCHOR) - (9 - bi * 3 - r() * 2) * DAY).toISOString(),
      submittedVia: 'Batch drop-off (third party)', batchId: bid,
      supportingDoc: { type: mismatch ? 'Utility Bill' : 'Barangay Clearance', barangayId: mismatch ? 'MAL' : 'SAM' },
      yearsAtAddress: +(r() * 0.8).toFixed(1),
      document: { filename: 'form.png', scanQuality: +(0.6 + r() * 0.35).toFixed(2), embedding: k % 16 < 7 ? noisy(h1) : emb(), pages: 1 },
    })
  }
})

// 3) SCENARIO B - legitimate density: 14 students in a known dormitory, official satellite registration
const DAL = bById.DAL
for (let i = 0; i < 14; i++) {
  const variants = ['Dalisay Student Residences, Purok 2, Brgy. Dalisay', 'Student Residences, Dalisay', 'Dalisay Dormitory Purok 2 Brgy Dalisay']
  out.push({
    name: name(), age: rint(18, 24), type: 'New registration', previousBarangayId: null,
    rawAddress: pick(r, variants),
    submittedAt: new Date(+new Date(ANCHOR) - r() * 20 * DAY).toISOString(),
    submittedVia: 'Satellite registration', batchId: 'SAT-DAL-1',
    supportingDoc: { type: 'School ID', barangayId: 'DAL' },
    yearsAtAddress: +(1 + r() * 2).toFixed(1),
    document: { filename: 'form.png', scanQuality: +(0.55 + r() * 0.4).toFixed(2), embedding: emb(), pages: 1 },
  })
}

// 4) SCENARIO C - dense cluster with NO context data (limitation shown), partly similar handwriting
const KAL = bById.KAL
const h3 = emb()
for (let i = 0; i < 9; i++) {
  const variants = ['Sitio Tabing-Ilog, Purok 4, Brgy. Kalayaan', 'Tabing Ilog Prk 4 Kalayaan', 'Sitio Tabing Ilog, Brgy Kalayan']
  out.push({
    name: name(), age: rint(20, 60), type: 'New registration', previousBarangayId: null,
    rawAddress: pick(r, variants),
    submittedAt: new Date(+new Date(ANCHOR) - r() * 12 * DAY).toISOString(),
    submittedVia: 'Walk-in', batchId: null,
    supportingDoc: { type: pick(r, DOCS), barangayId: 'KAL' },
    yearsAtAddress: +(1 + r() * 4).toFixed(1),
    document: { filename: 'form.png', scanQuality: +(0.5 + r() * 0.45).toFixed(2), embedding: i < 3 ? noisy(h3) : emb(), pages: 1 },
  })
}

// 5) Declared barangay disagrees with the sitio's real barangay (address inconsistency, 3 forms)
;[['Sitio Ilaya, Purok 5, Brgy. Pag-asa', 'PAG'], ['Sitio Ilaya Brgy Pag-asa', 'PAG'], ['Sitio Mulawin, Prk 3, Barangay Kalayaan', 'KAL']].forEach(([addr, bid]) => {
  out.push({ ...baseApp(bById[bid]), rawAddress: addr })
})

// 6) Handwriting-only similarity: four forms in different barangays
const h2 = emb()
;['BAG', 'MAB', 'SIS', 'PAG'].forEach((bid) => {
  const b = bById[bid]
  out.push({ ...baseApp(b), rawAddress: normalAddr(b, rint(1, 5)), document: { filename: 'form.png', scanQuality: +(0.7 + r() * 0.25).toFixed(2), embedding: noisy(h2, 0.18), pages: 1 } })
})

// 7) Unresolved / ambiguous / outside-LGU addresses
;[
  'malapit sa palengke', 'tapat ng simbahan, kanto', 'Barangay Santa Rita, Purok 2', 'Sitio Maputi, Purok 1',
  'Purok 2, Brgy. Bantug, Cabanatuan City', 'likod ng eskwelahan sa kabilang ilog', 'Brgy. Pag-asa', 'Purok 7 Brgy Maligaya',
].forEach((addr, i) => {
  const b = pick(r, BARANGAYS)
  const doc = { ...baseApp(b) }
  out.push({ ...doc, rawAddress: addr, supportingDoc: { type: 'Certificate of Residency', barangayId: b.id }, yearsAtAddress: +(r() * 5).toFixed(1) })
})

// sort by submission time and assign ids
out.sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt))
export const SEED_APPS = out.map((a, i) => ({
  ...a,
  id: `APP-${String(i + 1).padStart(4, '0')}`,
  synthetic: true,
  submittedAt: a.submittedAt,
}))
