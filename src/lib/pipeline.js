// Core analysis pipeline. Every page derives its numbers from the output of analyze().
// Workflow: normalize -> geocode -> DBSCAN -> document comparison -> indicators -> explainable priority score.
import { normalizeAddress, CLUSTERABLE_PRECISION } from './address.js'
import { dbscan } from './dbscan.js'
import { centroidOf, haversine } from './geo.js'
import { compareDocuments } from './handwriting.js'
import { BARANGAYS, ALL_BUILDINGS, getBarangay } from './gazetteer.js'

export const DEFAULT_CONFIG = {
  eps: 75,
  minPts: 6,
  hwThreshold: 0.9,
  batchMin: 5,
  weights: { geo: 30, address: 25, unresolved: 10, handwriting: 25, batch: 10 },
  thresholds: { moderate: 25, high: 55 },
}

export const INDICATORS = [
  { key: 'geo', label: 'Unusual geographic concentration', feature: 'Spatial Anomaly Radar' },
  { key: 'address', label: 'Address inconsistency', feature: 'Address Standardization' },
  { key: 'unresolved', label: 'Unresolved / ambiguous address reference', feature: 'Address Standardization' },
  { key: 'handwriting', label: 'Handwriting similarity across applications', feature: 'Batch Forgery Detector' },
  { key: 'batch', label: 'Unusual batch registration pattern', feature: 'Intake pattern analysis' },
]

const DAY = 86400000
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))

export function labelFor(score, triggeredCount, cfg) {
  if (score >= cfg.thresholds.high && triggeredCount >= 2) return 'High'
  if (score >= cfg.thresholds.moderate) return 'Moderate'
  return 'Low'
}

export function analyze(rawApps, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config, weights: { ...DEFAULT_CONFIG.weights, ...(config.weights || {}) }, thresholds: { ...DEFAULT_CONFIG.thresholds, ...(config.thresholds || {}) } }
  const apps = rawApps.map((a) => ({ ...a, addr: normalizeAddress(a.rawAddress, a.id) }))
  const byId = Object.fromEntries(apps.map((a) => [a.id, a]))
  const now = Math.max(...apps.map((a) => +new Date(a.submittedAt)), 0)

  // ---------- barangay statistics (comparison across areas) ----------
  const barangayStats = BARANGAYS.map((b) => {
    const mine = apps.filter((a) => a.addr.barangayId === b.id)
    const last30 = mine.filter((a) => now - +new Date(a.submittedAt) <= 30 * DAY).length
    return { id: b.id, name: b.name, total: mine.length, last30, baseline: b.baseline, spike: +(last30 / b.baseline).toFixed(2), densityPerKm2: b.densityPerKm2, population: b.population }
  })
  const statOf = (id) => barangayStats.find((s) => s.id === id)

  // ---------- Spatial Anomaly Radar: DBSCAN ----------
  const pointIdx = apps.map((a, i) => i).filter((i) => CLUSTERABLE_PRECISION.has(apps[i].addr.precision) && apps[i].addr.coords)
  const labels = dbscan(pointIdx.map((i) => apps[i].addr.coords), cfg.eps, cfg.minPts)
  const groupsByLabel = {}
  labels.forEach((l, k) => {
    if (l >= 0) (groupsByLabel[l] = groupsByLabel[l] || []).push(apps[pointIdx[k]])
  })
  const clusters = Object.values(groupsByLabel).map((members) => {
    const ids = members.map((m) => m.id).sort()
    const center = centroidOf(members.map((m) => m.addr.coords))
    const radius = Math.max(...members.map((m) => haversine(center, m.addr.coords)))
    const times = members.map((m) => +new Date(m.submittedAt))
    const spanDays = +((Math.max(...times) - Math.min(...times)) / DAY).toFixed(1)
    const bcount = {}
    members.forEach((m) => (bcount[m.addr.barangayId] = (bcount[m.addr.barangayId] || 0) + 1))
    const domId = Object.keys(bcount).sort((x, y) => bcount[y] - bcount[x])[0]
    const dom = getBarangay(domId)
    const st = statOf(domId)
    const nearest = ALL_BUILDINGS.map((b) => ({ b, d: haversine(center, b.center) })).sort((x, y) => x.d - y.d)[0]
    let context
    if (nearest && nearest.d <= 120) {
      const share = members.length / nearest.b.capacity
      context = { kind: 'building', building: nearest.b, share: +share.toFixed(2), explains: share <= 0.6, distanceM: Math.round(nearest.d) }
    } else {
      context = { kind: 'none', explains: false }
    }
    const factors = []
    let sev = 0.35
    factors.push(`${members.length} applications within ${Math.round(radius)} m of each other (DBSCAN: eps ${cfg.eps} m, minPts ${cfg.minPts}).`)
    sev += 0.05 * Math.max(0, members.length - cfg.minPts)
    if (st && st.spike >= 2) { sev += 0.2; factors.push(`${dom.name} received ${st.last30} applications in the last 30 days vs a baseline of ${st.baseline}/month (${st.spike}x).`) }
    else if (st) factors.push(`${dom.name} received ${st.last30} applications in the last 30 days vs a baseline of ${st.baseline}/month (${st.spike}x - not a clear spike).`)
    if (spanDays <= 7) { sev += 0.15; factors.push(`All applications were submitted within ${spanDays} days.`) }
    else factors.push(`Applications were spread over ${spanDays} days.`)
    sev = clamp(sev)
    let status = 'Requires review'
    let contextText
    if (context.kind === 'building') {
      contextText = `Known ${context.building.type.toLowerCase()}: ${context.building.name} (recorded capacity ${context.building.capacity}). The cluster equals ${Math.round(context.share * 100)}% of capacity.`
      if (context.explains) { status = 'Plausibly explained by context'; sev *= 0.3; contextText += ' This density is consistent with a multi-resident building, so the concern is reduced. It is not a clearance.' }
      else contextText += ' This exceeds a plausible share of capacity, so context does not fully explain the density.'
    } else {
      status = 'Context unavailable'
      contextText = 'LIMITATION: no building, occupancy or household-count data exists for this location in the demo dataset. A dense subdivision, boarding house or informal settlement cannot be ruled out without field verification.'
    }
    return {
      id: 'CL-' + ids[0].replace('APP-', ''),
      memberIds: ids, size: members.length, center, radiusM: Math.round(radius), spanDays,
      barangayId: domId, barangayName: dom.name, barangaySplit: bcount,
      density: +(members.length / (Math.PI * Math.max(radius, 20) ** 2 / 1e6)).toFixed(0),
      stat: st, context, contextText, factors, severity: +sev.toFixed(2), status,
      sitioOrArea: members[0].addr.precisionBasis,
    }
  }).sort((a, b) => b.severity - a.severity)
  const clusterOf = {}
  clusters.forEach((c) => c.memberIds.forEach((id) => (clusterOf[id] = c)))

  // ---------- Batch Forgery Detector ----------
  const hw = compareDocuments(apps, cfg.hwThreshold)
  const related = {}
  hw.pairs.forEach((p) => {
    ;(related[p.a] = related[p.a] || []).push({ id: p.b, sim: p.sim, lowQuality: p.lowQuality })
    ;(related[p.b] = related[p.b] || []).push({ id: p.a, sim: p.sim, lowQuality: p.lowQuality })
  })
  Object.values(related).forEach((l) => l.sort((x, y) => y.sim - x.sim))
  const hwGroupOf = {}
  hw.groups.forEach((g) => g.ids.forEach((id) => (hwGroupOf[id] = g)))

  // ---------- batch pattern ----------
  const batches = {}
  apps.forEach((a) => a.batchId && (batches[a.batchId] = batches[a.batchId] || []).push(a))

  // ---------- indicators ----------
  const enriched = apps.map((a) => {
    const ind = {}
    // geo
    const cl = clusterOf[a.id]
    if (cl) {
      const mitigated = cl.context.explains
      ind.geo = { key: 'geo', severity: cl.severity, result: mitigated ? 'Mitigated by context' : 'Triggered', explanation: `Located in spatial cluster ${cl.id} (${cl.size} applications, ${cl.sitioOrArea}, Barangay ${cl.barangayName}). ${cl.contextText}`, evidence: [{ type: 'cluster', id: cl.id }, ...cl.memberIds.filter((x) => x !== a.id).slice(0, 5).map((x) => ({ type: 'app', id: x }))] }
    } else if (!CLUSTERABLE_PRECISION.has(a.addr.precision)) {
      ind.geo = { key: 'geo', severity: 0, result: 'Not assessable', explanation: 'Address resolved only to barangay level or not at all, so it is excluded from spatial clustering.', evidence: [] }
    } else ind.geo = { key: 'geo', severity: 0, result: 'Not triggered', explanation: 'Not part of any detected concentration at the current DBSCAN settings.', evidence: [] }

    // address inconsistency
    const issues = []
    let aSev = 0
    const bad = a.addr.warnings.filter((x) => ['SITIO_MISMATCH', 'BUILDING_MISMATCH'].includes(x.code))
    bad.forEach((x) => { issues.push(x.text); aSev = Math.max(aSev, 0.7) })
    a.addr.warnings.filter((x) => ['OUTSIDE_LGU', 'PUROK_SITIO', 'PUROK_RANGE'].includes(x.code)).forEach((x) => { issues.push(x.text); aSev = Math.max(aSev, x.code === 'OUTSIDE_LGU' ? 0.6 : 0.4) })
    if (a.supportingDoc && a.addr.barangayId && a.supportingDoc.barangayId !== a.addr.barangayId) {
      issues.push(`Supporting document (${a.supportingDoc.type}) shows Barangay ${getBarangay(a.supportingDoc.barangayId).name}, but the declared address is Barangay ${a.addr.components.barangay}.`)
      aSev = Math.max(aSev, 0.8)
    }
    if (a.yearsAtAddress !== undefined && a.yearsAtAddress < 0.5 && a.type === 'Transfer of registration') { issues.push(`Transfer applicant declares only ${a.yearsAtAddress} years at the new address.`); aSev = Math.max(aSev, 0.5) }
    ind.address = { key: 'address', severity: aSev, result: issues.length ? 'Triggered' : 'Not triggered', explanation: issues.length ? issues.join(' ') : 'Declared address, supporting document and gazetteer are mutually consistent.', evidence: issues.length && a.supportingDoc ? [{ type: 'doc', text: `${a.supportingDoc.type} (Barangay ${getBarangay(a.supportingDoc.barangayId).name})` }] : [] }

    // unresolved
    const u = a.addr.status
    ind.unresolved = { key: 'unresolved', severity: u === 'Unresolved' ? 0.7 : u === 'Partial' ? 0.4 : 0, result: u === 'Resolved' ? 'Not triggered' : 'Triggered', explanation: u === 'Resolved' ? 'Address resolved to a gazetteer unit.' : `Address status "${u}": ${a.addr.warnings.filter((x) => x.level !== 'info').map((x) => x.text).join(' ') || 'Low precision.'} This calls for manual verification and is not by itself evidence of wrongdoing.`, evidence: [] }

    // handwriting
    const rel = related[a.id] || []
    if (rel.length) {
      const top = rel[0]
      const grp = hwGroupOf[a.id]
      let sev = clamp(0.5 + ((top.sim - cfg.hwThreshold) / (1 - cfg.hwThreshold)) * 0.3 + (grp.ids.length >= 3 ? 0.2 : 0))
      const lowQ = a.document.scanQuality < 0.5 || top.lowQuality
      if (lowQ) sev *= 0.7
      ind.handwriting = { key: 'handwriting', severity: +sev.toFixed(2), result: 'Triggered', explanation: `Simulated similarity ${top.sim.toFixed(3)} with ${top.id}; ${grp.ids.length} related forms in group ${grp.id}.${lowQ ? ' Low scan quality: confidence reduced.' : ''} Similar handwriting can occur naturally; this is not proof of common authorship.`, evidence: rel.slice(0, 6).map((r) => ({ type: 'app', id: r.id, sim: r.sim })) }
    } else ind.handwriting = { key: 'handwriting', severity: 0, result: a.document ? 'Not triggered' : 'Not assessable', explanation: a.document ? `No other form reaches the similarity threshold (${cfg.hwThreshold}).` : 'No scanned form on file for this application.', evidence: [] }

    // batch
    const b = a.batchId ? batches[a.batchId] : null
    if (b && a.submittedVia === 'Satellite registration') ind.batch = { key: 'batch', severity: 0, result: 'Not triggered', explanation: `Part of an official satellite registration activity (${a.batchId}, ${b.length} forms).`, evidence: [] }
    else if (b && b.length >= cfg.batchMin) {
      const sameBrgy = b.filter((x) => x.addr.barangayId === a.addr.barangayId).length / b.length
      if (sameBrgy >= 0.6) ind.batch = { key: 'batch', severity: clamp(0.4 + 0.1 * (b.length - cfg.batchMin)), result: 'Triggered', explanation: `${b.length} forms were submitted together (${a.submittedVia}, batch ${a.batchId}); ${Math.round(sameBrgy * 100)}% declare the same barangay.`, evidence: b.filter((x) => x.id !== a.id).slice(0, 5).map((x) => ({ type: 'app', id: x.id })) }
      else ind.batch = { key: 'batch', severity: 0, result: 'Not triggered', explanation: `Batch ${a.batchId} (${b.length} forms) spans several barangays.`, evidence: [] }
    } else ind.batch = { key: 'batch', severity: 0, result: 'Not triggered', explanation: b ? `Small batch (${b.length} forms) below threshold ${cfg.batchMin}.` : 'Individually submitted application.', evidence: [] }

    const totalW = Object.values(cfg.weights).reduce((s, x) => s + x, 0) || 1
    const contributions = INDICATORS.map((d) => ({ key: d.key, points: (cfg.weights[d.key] * ind[d.key].severity * 100) / totalW }))
    const score = Math.round(contributions.reduce((s, c) => s + c.points, 0))
    const triggered = INDICATORS.filter((d) => ind[d.key].result === 'Triggered').length
    const label = labelFor(score, triggered, cfg)
    const cappedByRule = score >= cfg.thresholds.high && triggered < 2
    return { ...a, cluster: cl || null, indicators: ind, contributions, score, triggered, label, cappedByRule, related: rel, hwGroup: hwGroupOf[a.id] || null }
  })

  return { apps: enriched, clusters, barangayStats, handwriting: hw, config: cfg, now, byId: Object.fromEntries(enriched.map((a) => [a.id, a])) }
}

export const CASE_STATUSES = ['New', 'Under Review', 'Evidence Requested', 'Pending ERB Decision', 'Resolved']
export const DISPOSITIONS = ['Cleared - no further action', 'Referred to ERB for hearing', 'Insufficient basis - closed']

export function caseOf(caseState, id) {
  return caseState[id] || { status: 'New', disposition: null, rationale: '', notes: [], history: [] }
}

export function summarize(result, caseState) {
  const { apps, clusters } = result
  const triage = apps.filter((a) => a.label !== 'Low' || caseState[a.id])
  const status = (a) => caseOf(caseState, a.id).status
  return {
    total: apps.length,
    flagged: apps.filter((a) => a.label !== 'Low').length,
    high: apps.filter((a) => a.label === 'High').length,
    moderate: apps.filter((a) => a.label === 'Moderate').length,
    low: apps.filter((a) => a.label === 'Low').length,
    clustersFlagged: clusters.filter((c) => c.status !== 'Plausibly explained by context').length,
    clustersTotal: clusters.length,
    hwApps: apps.filter((a) => a.indicators.handwriting.result === 'Triggered').length,
    hwGroups: result.handwriting.groups.length,
    addrIncons: apps.filter((a) => a.indicators.address.result === 'Triggered').length,
    unresolved: apps.filter((a) => a.addr.status !== 'Resolved').length,
    triage,
    awaiting: triage.filter((a) => status(a) === 'New').length,
    pending: triage.filter((a) => ['Under Review', 'Evidence Requested', 'Pending ERB Decision'].includes(status(a))).length,
    resolved: triage.filter((a) => status(a) === 'Resolved').length,
  }
}
