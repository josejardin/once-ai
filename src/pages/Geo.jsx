import React, { useState } from 'react'
import { useApp } from '../store.jsx'
import MapView from '../components/MapView.jsx'
import { Badge, Card, PageHead, SyntheticBanner, EmptyState } from '../components/ui.jsx'
import { X, SearchCheck } from 'lucide-react'
import { LGU } from '../lib/gazetteer.js'

const CL_REVIEW = ['Unreviewed', 'Under field verification', 'Explained by context', 'Escalated to ERB']

export default function Geo() {
  const { result, state, dispatch, perm, openApp } = useApp()
  const [layers, setLayers] = useState({ apps: true, clusters: true, density: false, buildings: true, barangays: true })
  const [selId, setSelId] = useState(null)
  const sel = result.clusters.find((c) => c.id === selId)
  const tog = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  const noGeo = result.apps.filter((a) => !a.addr.coords || a.addr.precision === 'barangay').length

  return (
    <div className="page">
      <PageHead title="Geographic Analysis" feature="Boundary Validation | Spatial Anomaly Radar | Transfer Patterns">
        Geographic boundary validation, residency & location consistency, spatial anomaly detection (DBSCAN), and registration transfer patterns. A cluster is a lead for review, never automatic proof of fraud.
      </PageHead>
      <SyntheticBanner />
      <div className="grid g-main">
        <div className="grid" style={{ gap: 10, alignContent: 'start' }}>
          <div className="row small">
            {[['apps', 'Applications'], ['clusters', 'Detected clusters'], ['density', 'Density glow'], ['buildings', 'Known buildings (context)'], ['barangays', 'Barangay areas']].map(([k, l]) => (
              <label key={k} className="chip" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={layers[k]} onChange={() => tog(k)} style={{ width: 'auto' }} />{l}</label>
            ))}
            <span className="muted">DBSCAN eps {state.config.eps} m, minPts {state.config.minPts} (change in AI Screening → Provisional settings)</span>
          </div>
          <div className="mapwrap">
            <MapView apps={result.apps} clusters={result.clusters} layers={layers} selectedCluster={selId} onSelectCluster={setSelId} onSelectApp={openApp} />
            {sel && (
            <aside className="cluster-panel" aria-label="Cluster details">
              <div className="cp-head"><h2><span className="mono">{sel.id}</span><span className="sub">Cluster details</span></h2><button className="btn sm" onClick={() => setSelId(null)} aria-label="Close cluster details"><X size={14} /></button></div>
              <dl className="kv">
                <dt>Location</dt><dd>{sel.sitioOrArea}, Barangay {sel.barangayName}, {LGU.municipality}<br /><span className="mono small">{sel.center[0].toFixed(5)}, {sel.center[1].toFixed(5)}</span></dd>
                <dt>Applications</dt><dd>{sel.size} within {sel.radiusM} m, submitted over {sel.spanDays} days</dd>
                <dt>Barangay baseline</dt><dd>{sel.stat.last30} apps in 30 days vs {sel.stat.baseline}/month typical ({sel.stat.spike}x). Density of barangay: {sel.stat.densityPerKm2.toLocaleString()} residents/km²</dd>
              </dl>
              <div className="sect"><h3>Why it was flagged</h3><ul className="small" style={{ margin: '0 0 0 18px' }}>{sel.factors.map((f, i) => <li key={i}>{f}</li>)}</ul></div>
              <div className="sect"><h3>Contextual review</h3>
                <div className={`banner ${sel.context.explains ? 'info' : ''} small`}>{sel.contextText}</div>
                <div className="field" style={{ marginTop: 8 }}><label htmlFor="clrev">Contextual review status</label>
                  <select id="clrev" disabled={!perm.canEdit} value={state.clusterReview[sel.id] || 'Unreviewed'} onChange={(e) => dispatch({ type: 'clusterReview', id: sel.id, value: e.target.value })}>{CL_REVIEW.map((r) => <option key={r}>{r}</option>)}</select></div>
              </div>
              <div className="sect"><h3>Associated applications ({sel.memberIds.length})</h3>
                <div className="chips">{sel.memberIds.map((id) => <button key={id} className="chip mono" onClick={() => openApp(id)}>{id} · {result.byId[id].label}</button>)}</div>
              </div>
              <div className="small muted" style={{ marginTop: 10 }}>Geographic concentration alone never produces a High priority label; at least two independent indicators are required.</div>
            </aside>
            )}
            {!sel && <div className="map-hint">Select a cluster on the map or in the list to investigate it</div>}
          </div>
          <div className="small muted">Map: Leaflet + OpenStreetMap (tiles need internet access; overlays render regardless). Coordinates come from the offline demo gazetteer, placed within the matched purok, sitio or building; {noGeo} applications are excluded from clustering because only barangay-level or no location could be resolved. Map locations are fictional.</div>
          <div className="row small"><span style={{ color: '#1b9a68' }}>● Low</span><span style={{ color: '#d9820f' }}>● Moderate</span><span style={{ color: '#c0272d' }}>● High</span><span style={{ color: '#374151' }}>● Known building</span><span style={{ color: '#c0272d' }}>◯ Cluster needs review</span><span style={{ color: '#6b7280' }}>◯ Cluster plausibly explained by context</span></div>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Detected clusters" sub={`${result.clusters.length}`}>
            {result.clusters.map((c) => {
              const rev = state.clusterReview[c.id] || 'Unreviewed'
              return (
                <div key={c.id} className={`ind ${selId === c.id ? 'trig' : ''}`} style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setSelId(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelId(c.id)}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b className="mono">{c.id}</b><Badge tone={c.status === 'Plausibly explained by context' ? 'info' : c.status === 'Context unavailable' ? 'mod' : 'high'}>{c.status}</Badge></div>
                  <div className="small">{c.size} applications · Barangay {c.barangayName} · {c.sitioOrArea} · radius {c.radiusM} m · anomaly severity {c.severity}</div>
                  <div className="small muted">Review: {rev}</div>
                </div>
              )
            })}
            {!result.clusters.length && <EmptyState title="No clusters detected" icon={SearchCheck}>Nothing is concentrated at the current DBSCAN settings. Adjust eps / minPts in AI Screening to explore.</EmptyState>}
          </Card>

        </div>
      </div>

      <Card title="Comparison across barangays" sub="Last 30 days vs recorded baseline (synthetic)">
        <div className="tablewrap"><table>
          <thead><tr><th>Barangay</th><th>Population</th><th>Density /km²</th><th>Apps (all)</th><th>Last 30 days</th><th>Baseline /month</th><th>Ratio</th><th>Clusters</th></tr></thead>
          <tbody>{result.barangayStats.map((b) => (
            <tr key={b.id}><td>{b.name}</td><td>{b.population.toLocaleString()}</td><td>{b.densityPerKm2.toLocaleString()}</td><td>{b.total}</td><td>{b.last30}</td><td>{b.baseline}</td>
              <td><Badge tone={b.spike >= 2 ? 'mod' : 'low'}>{b.spike}x</Badge></td><td>{result.clusters.filter((c) => c.barangayId === b.id).length}</td></tr>))}</tbody></table></div>
        <div className="small muted" style={{ marginTop: 6 }}>A ratio ≥ 2x is highlighted for attention only. Baselines and building capacities are synthetic; where such context is missing in real use, the system states that limitation.</div>
      </Card>
    </div>
  )
}
