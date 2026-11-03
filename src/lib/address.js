// FEATURE 1 - Address standardization and normalization.
// Rule-based parser (abbreviation expansion, number words, fuzzy barangay matching, gazetteer lookup).
// It is a real, working normalizer, but it is NOT a trained NLP model and only knows the fictitious demo gazetteer.
import { BARANGAYS, LGU, ALL_BUILDINGS, ALL_SITIOS, getBarangay } from './gazetteer.js'
import { hashStr, mulberry32 } from './rng.js'
import { offsetMeters } from './geo.js'

const STOP = new Set(['purok', 'sitio', 'barangay', 'street', 'avenue', 'road', 'santa', 'nueva', 'demo', 'manila', 'ncr', 'tapat', 'malapit', 'likod', 'katabi', 'harap', 'ng', 'sa', 'ni', 'ang', 'block', 'lot', 'subdivision', 'phase', 'poblacion', 'city', 'municipality', 'province', 'ecija', 'near', 'beside', 'behind', 'in', 'front', 'of', 'the', 'at'])
const OUTSIDE = ['cabanatuan', 'gapan', 'munoz', 'guimba', 'palayan', 'quezon city', 'makati', 'pasig', 'taguig', 'cavite', 'bulacan', 'pampanga']

const NUM_WORDS = { uno: 1, isa: 1, one: 1, dos: 2, dalawa: 2, two: 2, tres: 3, tatlo: 3, three: 3, kwatro: 4, apat: 4, four: 4, singko: 5, lima: 5, five: 5 }

export const PRECISION_ORDER = ['building', 'sitio', 'landmark', 'street', 'purok', 'barangay', 'none']
export const CLUSTERABLE_PRECISION = new Set(['building', 'sitio', 'landmark', 'street', 'purok'])

function lev(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}

const norm = (s) => s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
const title = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase())

export function cleanText(raw) {
  let s = ' ' + String(raw || '').toLowerCase() + ' '
  s = s.replace(/[.,;:()#/\\]/g, ' ')
  s = s.replace(/\b(brgy|bgy|brg|bgry|brangay|baranggay|barrio)\b/g, 'barangay')
  s = s.replace(/\b(prk|prok|purk)\b/g, 'purok')
  s = s.replace(/purok\s*(\d)/g, 'purok $1').replace(/purok(?=[a-z])/g, 'purok ')
  s = s.replace(/\b(st|str)\b/g, 'street').replace(/\bave\b/g, 'avenue').replace(/\brd\b/g, 'road')
  s = s.replace(/\bsta\b/g, 'santa').replace(/\bsto\b/g, 'santo').replace(/\bblk\b/g, 'block').replace(/\bsubd\b/g, 'subdivision')
  s = s.replace(/purok\s+(uno|isa|one|dos|dalawa|two|tres|tatlo|three|kwatro|apat|four|singko|lima|five)\b/g, (_, w) => 'purok ' + NUM_WORDS[w])
  return s.replace(/\s+/g, ' ').trim()
}

function matchBarangay(text) {
  const tokens = text.split(' ')
  const cands = []
  BARANGAYS.forEach((b) => {
    const names = [b.name, ...b.aliases].map(norm)
    names.forEach((nm) => cands.push({ b, nm, isAlias: nm !== norm(b.name) }))
  })
  // Prefer the phrase right after the word "barangay", otherwise scan all n-grams.
  const idx = tokens.indexOf('barangay')
  const grams = []
  const pushGrams = (start) => {
    for (let n = 3; n >= 1; n--) {
      if (start + n > tokens.length) continue
      const g = tokens.slice(start, start + n)
      if (STOP.has(g[0])) continue
      grams.push({ text: g.join(' '), pos: start })
    }
  }
  if (idx >= 0) pushGrams(idx + 1)
  tokens.forEach((_, i) => pushGrams(i))
  let best = null
  const seen = new Set()
  for (const g of grams) {
    if (seen.has(g.text)) continue
    seen.add(g.text)
    for (const c of cands) {
      const d = lev(g.text, c.nm)
      const limit = c.nm.length >= 8 ? 2 : c.nm.length >= 5 ? 1 : 0
      if (d <= limit && g.text.length >= 4) {
        const score = d * 10 + (g.pos === idx + 1 ? 0 : 3) - g.text.split(' ').length
        if (!best || score < best.score) best = { b: c.b, dist: d, isAlias: c.isAlias, score, text: g.text, anchored: g.pos === idx + 1 }
      }
    }
  }
  if (!best) return null
  // Ambiguity: another barangay matches the same gram at the same distance.
  const ties = new Set()
  for (const c of cands) {
    if (c.b.id === best.b.id) continue
    if (lev(best.text, c.nm) === best.dist) ties.add(c.b.name)
  }
  return { barangay: best.b, matchType: best.dist === 0 ? (best.isAlias ? 'alias' : 'exact') : 'fuzzy', dist: best.dist, ambiguousWith: [...ties], matchedText: best.text }
}

function takeTokensUntilStop(tokens, start) {
  const out = []
  for (let i = start; i < tokens.length && out.length < 3; i++) {
    if (STOP.has(tokens[i]) || /^\d+$/.test(tokens[i])) break
    out.push(tokens[i])
  }
  return out
}

function placeWithin(center, radiusM, key) {
  const r = mulberry32(hashStr(key))
  const ang = r() * Math.PI * 2
  const d = Math.sqrt(r()) * radiusM
  return offsetMeters(center, Math.cos(ang) * d, Math.sin(ang) * d)
}

export function normalizeAddress(rawInput, seedKey = 'preview') {
  const original = String(rawInput || '')
  const text = cleanText(original)
  const tokens = text.split(' ').filter(Boolean)
  const warnings = []
  const comp = { house: null, street: null, purok: null, sitio: null, barangay: null, landmark: null, building: null, municipality: null, province: null }
  const flags = { barangayId: null, sitioBarangayId: null }
  const w = (code, level, msg) => warnings.push({ code, level, text: msg })
  let barangay = null
  let matchType = 'none'

  if (!text) {
    w('EMPTY', 'alert', 'No address text provided.')
    return finish()
  }

  // municipality / province / outside-LGU references
  if (text.includes('santa demo') || text.includes('manila') || text.includes('city of manila')) comp.municipality = LGU.municipality
  if (text.includes('nueva demo') || text.includes('metro manila') || text.includes('ncr')) comp.province = LGU.province
  const outside = OUTSIDE.find((o) => text.includes(o))
  if (outside) w('OUTSIDE_LGU', 'alert', `Address mentions "${title(outside)}", which is outside ${LGU.municipality}. Residency in this LGU is questionable.`)

  // purok
  const pm = text.match(/purok (\d+)/)
  if (pm) {
    comp.purok = Number(pm[1])
    if (comp.purok < 1 || comp.purok > 5) w('PUROK_RANGE', 'warn', `Purok ${comp.purok} does not exist in the gazetteer (valid: 1-5).`)
  }

  // house / block / lot
  const hm = text.match(/^(\d{1,4})\s/) || text.match(/block (\d+)/) || text.match(/lot (\d+)/)
  if (hm) comp.house = hm[1]

  // building (known multi-resident buildings)
  const bld = ALL_BUILDINGS.find((x) => [x.name, ...x.aliases].some((a) => text.includes(norm(a))))
  if (bld) comp.building = bld

  // sitio: gazetteer first, then generic capture
  const sit = ALL_SITIOS.find((s) => text.includes(norm(s.name)))
  if (sit) comp.sitio = sit
  else {
    const si = tokens.indexOf('sitio')
    if (si >= 0) {
      const nm = takeTokensUntilStop(tokens, si + 1).join(' ')
      if (nm) {
        comp.sitio = { name: title(nm), unknown: true }
        w('SITIO_UNKNOWN', 'warn', `Sitio "${title(nm)}" is not in the gazetteer; it cannot be placed on the map.`)
      }
    }
  }

  // street
  const kw = tokens.findIndex((t) => ['street', 'avenue', 'road'].includes(t))
  if (kw > 0) {
    const pre = []
    for (let i = kw - 1; i >= 0 && pre.length < 2; i--) {
      if (STOP.has(tokens[i]) || /^\d+$/.test(tokens[i])) break
      pre.unshift(tokens[i])
    }
    if (pre.length) comp.street = title(pre.join(' ')) + ' ' + title(tokens[kw])
  }

  // barangay
  const bm = matchBarangay(text)
  if (bm) {
    barangay = bm.barangay
    matchType = bm.matchType
    if (bm.matchType === 'fuzzy') w('BRGY_FUZZY', 'info', `Barangay spelled "${bm.matchedText}" was matched to "${barangay.name}" by fuzzy matching (edit distance ${bm.dist}). Please confirm.`)
    if (bm.ambiguousWith.length) w('BRGY_AMBIGUOUS', 'warn', `Barangay text is ambiguous: could also be ${bm.ambiguousWith.join(', ')}.`)
  } else if (tokens.includes('barangay')) {
    const nm = takeTokensUntilStop(tokens, tokens.indexOf('barangay') + 1).join(' ')
    w('BRGY_UNKNOWN', 'alert', `Declared barangay "${title(nm) || '(blank)'}" was not found in the ${LGU.municipality} gazetteer.`)
  }
  if (!barangay && comp.sitio && !comp.sitio.unknown) {
    barangay = getBarangay(comp.sitio.barangayId)
    matchType = 'inferred'
    w('BRGY_INFERRED', 'warn', `No barangay declared; inferred "${barangay.name}" from Sitio ${comp.sitio.name}.`)
  }
  if (!barangay && comp.building) {
    barangay = getBarangay(comp.building.barangayId)
    matchType = 'inferred'
    w('BRGY_INFERRED', 'warn', `No barangay declared; inferred "${barangay.name}" from ${comp.building.name}.`)
  }
  if (barangay) {
    comp.barangay = barangay.name
    flags.barangayId = barangay.id
  }

  // consistency between declared barangay and sitio / building
  if (barangay && matchType !== 'inferred') {
    if (comp.sitio && !comp.sitio.unknown && comp.sitio.barangayId !== barangay.id) {
      const other = getBarangay(comp.sitio.barangayId)
      w('SITIO_MISMATCH', 'alert', `Sitio ${comp.sitio.name} is located in Barangay ${other.name}, but the address declares Barangay ${barangay.name}.`)
      flags.sitioBarangayId = other.id
    }
    if (comp.building && comp.building.barangayId !== barangay.id) {
      const other = getBarangay(comp.building.barangayId)
      w('BUILDING_MISMATCH', 'alert', `${comp.building.name} is located in Barangay ${other.name}, but the address declares Barangay ${barangay.name}.`)
      flags.sitioBarangayId = other.id
    }
    if (comp.sitio && !comp.sitio.unknown && comp.sitio.barangayId === barangay.id && comp.purok && comp.sitio.purok !== comp.purok) {
      w('PUROK_SITIO', 'warn', `Sitio ${comp.sitio.name} is in Purok ${comp.sitio.purok}, but Purok ${comp.purok} was declared.`)
    }
  }

  // landmark (colloquial reference). Needs a barangay to be resolvable.
  if (barangay) {
    const lm = barangay.landmarks.find((l) => l.phrases.some((p) => text.includes(p)))
    if (lm) comp.landmark = lm
  } else {
    const any = BARANGAYS[0].landmarks.find((l) => l.phrases.some((p) => text.includes(p)))
    if (any) {
      comp.landmark = { ...any, unresolved: true }
      w('LANDMARK_AMBIGUOUS', 'alert', `Landmark reference (${any.label}) exists in several barangays and no barangay was declared; it cannot be resolved automatically.`)
    }
  }

  if (!barangay && !warnings.some((x) => ['BRGY_UNKNOWN'].includes(x.code))) w('BRGY_MISSING', 'alert', 'No barangay could be identified in the declared address.')
  if (barangay && !comp.purok && !comp.sitio && !comp.building) w('PUROK_MISSING', 'info', 'No purok, sitio or building declared; location can only be placed at street/barangay level.')
  if (!comp.municipality && barangay) w('MUNI_ASSUMED', 'info', `Municipality not declared; ${LGU.municipality} assumed from the intake office.`)

  return finish()

  function finish() {
    // geocoding via gazetteer (offline, simulated placement inside the matched unit)
    let precision = 'none'
    let coords = null
    let radius = 0
    let basis = 'No gazetteer unit matched'
    if (barangay) {
      if (comp.building && !comp.building.unknown) {
        precision = 'building'; basis = comp.building.name
        coords = placeWithin(comp.building.center, comp.building.radiusM, seedKey); radius = comp.building.radiusM
      } else if (comp.sitio && !comp.sitio.unknown) {
        precision = 'sitio'; basis = 'Sitio ' + comp.sitio.name
        coords = placeWithin(comp.sitio.center, comp.sitio.radiusM, seedKey); radius = comp.sitio.radiusM
      } else if (comp.landmark && !comp.landmark.unresolved) {
        precision = 'landmark'; basis = comp.landmark.label
        coords = placeWithin(comp.landmark.center, comp.landmark.radiusM, seedKey); radius = comp.landmark.radiusM
      } else if (comp.street && barangay.streets.find((s) => comp.street.startsWith(s.name))) {
        const st = barangay.streets.find((s) => comp.street.startsWith(s.name))
        precision = 'street'; basis = comp.street
        coords = placeWithin(st.center, st.radiusM, seedKey); radius = st.radiusM
      } else if (comp.purok >= 1 && comp.purok <= 5) {
        const pk = barangay.puroks[comp.purok - 1]
        precision = 'purok'; basis = 'Purok ' + comp.purok
        coords = placeWithin(pk.center, pk.radiusM, seedKey); radius = pk.radiusM
      } else {
        precision = 'barangay'; basis = 'Barangay centroid only'
        coords = barangay.centroid; radius = 600
        w('BRGY_ONLY', 'info', 'Only barangay-level precision; excluded from spatial clustering.')
      }
    }

    // confidence (rule-based heuristic, not a statistical probability)
    let conf = 0
    if (barangay) conf += { exact: 0.45, alias: 0.4, fuzzy: 0.3, inferred: 0.3 }[matchType] || 0
    conf += { building: 0.35, sitio: 0.3, landmark: 0.2, street: 0.2, purok: 0.15, barangay: 0, none: 0 }[precision]
    if (comp.purok) conf += 0.05
    if (comp.municipality) conf += 0.1
    if (comp.province) conf += 0.05
    if (warnings.some((x) => ['BRGY_AMBIGUOUS', 'SITIO_MISMATCH', 'BUILDING_MISMATCH', 'OUTSIDE_LGU'].includes(x.code))) conf -= 0.25
    conf = Math.max(0, Math.min(1, conf))

    let status = 'Unresolved'
    if (barangay) status = CLUSTERABLE_PRECISION.has(precision) && conf >= 0.55 && !warnings.some((x) => x.level === 'alert') ? 'Resolved' : 'Partial'

    const parts = []
    if (comp.house) parts.push(comp.house)
    if (comp.street) parts.push(comp.street)
    if (comp.building) parts.push(comp.building.name)
    if (comp.sitio) parts.push('Sitio ' + comp.sitio.name)
    if (comp.purok) parts.push('Purok ' + comp.purok)
    if (comp.barangay) parts.push('Barangay ' + comp.barangay)
    if (barangay) {
      parts.push(LGU.municipality)
      parts.push(LGU.province)
    }
    return {
      original,
      normalized: parts.length ? parts.join(', ') : '(unable to standardize)',
      components: {
        house: comp.house,
        street: comp.street,
        purok: comp.purok,
        sitio: comp.sitio ? comp.sitio.name : null,
        building: comp.building ? comp.building.name : null,
        landmark: comp.landmark ? comp.landmark.label : null,
        barangay: comp.barangay,
        municipality: comp.municipality || (barangay ? LGU.municipality + ' (assumed)' : null),
        province: comp.province || (barangay ? LGU.province + ' (assumed)' : null),
      },
      barangayId: flags.barangayId,
      sitioBarangayId: flags.sitioBarangayId,
      matchType,
      precision,
      precisionBasis: basis,
      coords,
      radiusM: radius,
      confidence: Math.round(conf * 100) / 100,
      status,
      warnings,
    }
  }
}
