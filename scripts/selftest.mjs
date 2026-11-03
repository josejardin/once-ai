// Logic self-test: node scripts/selftest.mjs   (npm test)
import assert from 'node:assert/strict'
import { normalizeAddress } from '../src/lib/address.js'
import { dbscan } from '../src/lib/dbscan.js'
import { analyze, summarize, DEFAULT_CONFIG } from '../src/lib/pipeline.js'
import { SEED_APPS } from '../src/data/seed.js'

let pass = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  -', name) } catch (e) { console.error('FAIL -', name, '\n', e.message); process.exitCode = 1 } }

console.log('Address normalization')
t('abbreviations + purok number', () => { const a = normalizeAddress('Prk 3 Brgy. Sampaguita'); assert.equal(a.components.barangay, 'Sampaguita'); assert.equal(a.components.purok, 3); assert.equal(a.precision, 'purok') })
t('number words', () => assert.equal(normalizeAddress('Brgy Kalayaan, Purok dos').components.purok, 2))
t('fuzzy barangay', () => { const a = normalizeAddress('Purok 1 Brgy Sampaguit'); assert.equal(a.components.barangay, 'Sampaguita'); assert.equal(a.matchType, 'fuzzy') })
t('uppercase glued purok', () => { const a = normalizeAddress('PUROK3 BGY MALIGAYA'); assert.equal(a.components.barangay, 'Maligaya'); assert.equal(a.components.purok, 3) })
t('colloquial landmark with barangay resolves', () => { const a = normalizeAddress('tapat ng simbahan, Brgy. Dalisay'); assert.equal(a.precision, 'landmark'); assert.ok(a.coords) })
t('colloquial landmark without barangay is unresolved', () => { const a = normalizeAddress('malapit sa palengke'); assert.equal(a.status, 'Unresolved'); assert.equal(a.coords, null) })
t('sitio mismatch warning', () => assert.ok(normalizeAddress('Sitio Ilaya, Purok 5, Brgy. Pag-asa').warnings.some((w) => w.code === 'SITIO_MISMATCH')))
t('outside LGU', () => assert.ok(normalizeAddress('Purok 2, Brgy. Bantug, Cabanatuan City').warnings.some((w) => w.code === 'OUTSIDE_LGU')))
t('unknown barangay', () => assert.ok(normalizeAddress('Barangay Santa Rita, Purok 2').warnings.some((w) => w.code === 'BRGY_UNKNOWN')))
t('known building is geocoded at building precision', () => assert.equal(normalizeAddress('Dalisay Student Residences, Purok 2, Brgy. Dalisay').precision, 'building'))
t('deterministic geocoding', () => assert.deepEqual(normalizeAddress('Purok 2 Brgy Maligaya', 'x').coords, normalizeAddress('Purok 2 Brgy Maligaya', 'x').coords))

console.log('DBSCAN')
t('finds two blobs and noise', () => {
  const pts = []
  for (let i = 0; i < 8; i++) pts.push([15 + i * 1e-5, 120])
  for (let i = 0; i < 8; i++) pts.push([15.01 + i * 1e-5, 120.01])
  pts.push([15.5, 120.5])
  const l = dbscan(pts, 50, 4)
  assert.equal(new Set(l.filter((x) => x >= 0)).size, 2)
  assert.equal(l[16], -1)
})

console.log('Pipeline on synthetic dataset')
const res = analyze(SEED_APPS, DEFAULT_CONFIG)
const sum = summarize(res, {})
console.log(`  ${res.apps.length} apps | clusters: ${res.clusters.map((c) => `${c.id}(${c.size},${c.barangayName},${c.status},sev ${c.severity})`).join('; ')}`)
console.log(`  labels: High ${sum.high} / Moderate ${sum.moderate} / Low ${sum.low}; hw groups ${res.handwriting.groups.map((g) => g.ids.length).join(',')}; addr inconsistencies ${sum.addrIncons}; unresolved ${sum.unresolved}`)
t('exactly three clusters expected', () => assert.equal(res.clusters.length, 3))
t('dorm cluster is plausibly explained by context', () => assert.ok(res.clusters.some((c) => c.barangayId === 'DAL' && c.status === 'Plausibly explained by context')))
t('Sampaguita cluster: no context data, barangay spike >= 2x', () => assert.ok(res.clusters.some((c) => c.barangayId === 'SAM' && c.size >= 14 && c.status === 'Context unavailable' && c.stat.spike >= 2)))
t('Kalayaan cluster flags missing context', () => assert.ok(res.clusters.some((c) => c.barangayId === 'KAL' && c.status === 'Context unavailable')))
t('handwriting groups found (>=3 groups)', () => assert.ok(res.handwriting.groups.length >= 3, 'groups=' + res.handwriting.groups.length))
t('no unrelated false-positive handwriting pairs', () => { const grouped = new Set(res.handwriting.groups.flatMap((g) => g.ids)); assert.ok(grouped.size <= 20, 'grouped=' + grouped.size) })
t('geo-only apps never labeled High', () => assert.ok(res.apps.every((a) => !(a.label === 'High' && a.triggered < 2))))
t('dorm members are not High', () => assert.ok(res.apps.filter((a) => a.cluster && a.cluster.barangayId === 'DAL').every((a) => a.label !== 'High')))
t('some High cases exist', () => assert.ok(sum.high >= 5 && sum.high < 30, 'high=' + sum.high))
t('ids unique', () => assert.equal(new Set(res.apps.map((a) => a.id)).size, res.apps.length))
t('synthetic flag on every record', () => assert.ok(SEED_APPS.every((a) => a.synthetic)))
t('param change recomputes (eps small -> fewer clusters)', () => assert.ok(analyze(SEED_APPS, { ...DEFAULT_CONFIG, eps: 5 }).clusters.length < res.clusters.length))
console.log(`\n${pass} checks passed${process.exitCode ? ' (with failures)' : ''}`)
