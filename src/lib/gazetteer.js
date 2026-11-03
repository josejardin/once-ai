// Local government unit used for the demonstration: City of Manila (NCR).
// Small compact barangays in the City of Manila focused around De La Salle University, Taft Avenue, Malate (District 5).
import { hashStr, mulberry32 } from './rng.js'
import { offsetMeters } from './geo.js'

export const LGU = {
  municipality: 'City of Manila',
  province: 'Metro Manila (NCR)',
  district: 'District 5 - Malate / De La Salle Taft Avenue',
  center: [14.5648, 120.9932], // De La Salle University, Taft Avenue, Malate, Manila
}

const RAW = [
  { id: 'SAM', name: 'Sampaguita', aliases: ['sampagita'], centroid: [14.5695, 120.9885], population: 5200, areaKm2: 0.28, baseline: 7, misspell: ['Sampagita', 'Sampaguta'] },
  { id: 'MAB', name: 'Mabini Norte', aliases: ['mabini', 'mabini n'], centroid: [14.5710, 120.9932], population: 6100, areaKm2: 0.32, baseline: 9, misspell: ['Mabini Norte', 'Mabini N.'] },
  { id: 'DAL', name: 'Dalisay', aliases: ['dalisai'], centroid: [14.5695, 120.9980], population: 4800, areaKm2: 0.25, baseline: 10, misspell: ['Dalisai', 'Dalisay'] },
  { id: 'BAG', name: 'Bagong Silang', aliases: ['bagong silangan', 'b silang'], centroid: [14.5648, 120.9875], population: 7300, areaKm2: 0.35, baseline: 11, misspell: ['Bagong Silang', 'Bagong Silan'] },
  { id: 'MAL', name: 'Maligaya', aliases: ['maligaia'], centroid: [14.5648, 120.9932], population: 8200, areaKm2: 0.38, baseline: 12, misspell: ['Maligya', 'Maligaya'] },
  { id: 'PAG', name: 'Pag-asa', aliases: ['pagasa', 'pag asa'], centroid: [14.5648, 120.9990], population: 3900, areaKm2: 0.22, baseline: 6, misspell: ['Pagasa', 'Pag-asa'] },
  { id: 'KAL', name: 'Kalayaan', aliases: ['kalayan'], centroid: [14.5590, 120.9895], population: 3600, areaKm2: 0.26, baseline: 6, misspell: ['Kalayan', 'Kalayaan'] },
  { id: 'SIS', name: 'San Isidro', aliases: ['sn isidro', 'san isidro demo'], centroid: [14.5590, 120.9970], population: 4500, areaKm2: 0.29, baseline: 8, misspell: ['San Isidro', 'Sn. Isidro'] },
]

const SITIOS = {
  SAM: [{ name: 'Riverside', purok: 3, off: [60, 40] }, { name: 'Mangga', purok: 1, off: [-40, 80] }],
  MAB: [{ name: 'Bagong Pook', purok: 2, off: [50, -60] }, { name: 'Looban', purok: 4, off: [-70, 30] }],
  DAL: [{ name: 'Silangan', purok: 1, off: [30, 60] }],
  BAG: [{ name: 'Tanglaw', purok: 2, off: [-30, -50] }],
  MAL: [{ name: 'Ilaya', purok: 5, off: [70, 40] }, { name: 'Mulawin', purok: 3, off: [-60, -20] }],
  PAG: [{ name: 'Kabisig', purok: 1, off: [40, -40] }],
  KAL: [{ name: 'Tabing-Ilog', purok: 4, off: [55, 35] }, { name: 'Pulo', purok: 2, off: [-50, 55] }],
  SIS: [{ name: 'Bagumbayan', purok: 3, off: [20, -70] }],
}

// Known multi-resident buildings: the contextual data used to avoid flagging legitimate density.
const BUILDINGS = [
  { id: 'BLD-DAL-1', barangayId: 'DAL', purok: 2, name: 'Dalisay Student Residences', aliases: ['student residences', 'dalisay residences', 'dalisay dormitory'], type: 'Dormitory', capacity: 80, off: [-80, 20] },
  { id: 'BLD-MAL-1', barangayId: 'MAL', purok: 5, name: 'Maligaya Heights Apartments', aliases: ['maligaya heights', 'heights apartments'], type: 'Apartment building', capacity: 120, off: [90, -50] },
]

const LANDMARK_TYPES = [
  { key: 'church', label: 'Church / Chapel', phrases: ['simbahan', 'church', 'kapilya', 'chapel'] },
  { key: 'market', label: 'Public Market', phrases: ['palengke', 'public market', 'talipapa', 'market'] },
  { key: 'school', label: 'School', phrases: ['eskwelahan', 'paaralan', 'elementary school', 'school', 'dlsu', 'la salle'] },
  { key: 'hall', label: 'Barangay Hall', phrases: ['barangay hall', 'brgy hall', 'munisipyo'] },
  { key: 'court', label: 'Basketball Court', phrases: ['basketball court', 'covered court', 'basketball'] },
  { key: 'bridge', label: 'Bridge', phrases: ['tulay', 'bridge'] },
]

const STREET_POOL = ['Taft Ave', 'Fidel Reyes', 'Leon Guinto', 'Pablo Ocampo', 'Estrada', 'Castro', 'Quirino Ave', 'Adriatico']

function purokCenter(centroid, n) {
  const ang = ((n - 1) * 72 * Math.PI) / 180
  return offsetMeters(centroid, Math.cos(ang) * 330, Math.sin(ang) * 330)
}

function jitterOffset(key, maxM) {
  const r = mulberry32(hashStr(key))
  const ang = r() * Math.PI * 2
  const d = Math.sqrt(r()) * maxM
  return [Math.cos(ang) * d, Math.sin(ang) * d]
}

export const BARANGAYS = RAW.map((b) => {
  const puroks = [1, 2, 3, 4, 5].map((n) => ({ n, center: purokCenter(b.centroid, n), radiusM: 200 }))
  const sitios = (SITIOS[b.id] || []).map((s) => ({
    name: s.name,
    aliases: [s.name.toLowerCase().replace(/-/g, ' ')],
    purok: s.purok,
    barangayId: b.id,
    center: offsetMeters(puroks[s.purok - 1].center, s.off[0], s.off[1]),
    radiusM: 45,
  }))
  const buildings = BUILDINGS.filter((x) => x.barangayId === b.id).map((x) => ({
    ...x,
    center: offsetMeters(puroks[x.purok - 1].center, x.off[0], x.off[1]),
    radiusM: 25,
  }))
  const landmarks = LANDMARK_TYPES.map((t) => ({
    ...t,
    barangayId: b.id,
    center: offsetMeters(b.centroid, ...jitterOffset(b.id + t.key, 450)),
    radiusM: 60,
  }))
  const streets = [0, 1, 2, 3].map((k) => {
    const name = STREET_POOL[(hashStr(b.id) + k * 3) % STREET_POOL.length]
    return { name, barangayId: b.id, center: offsetMeters(b.centroid, ...jitterOffset(b.id + name, 500)), radiusM: 120 }
  })
  return { ...b, puroks, sitios, buildings, landmarks, streets, densityPerKm2: Math.round(b.population / b.areaKm2) }
})

export const ALL_BUILDINGS = BARANGAYS.flatMap((b) => b.buildings)
export const ALL_SITIOS = BARANGAYS.flatMap((b) => b.sitios)
export const LANDMARK_KINDS = LANDMARK_TYPES

export function getBarangay(id) {
  return BARANGAYS.find((b) => b.id === id)
}
