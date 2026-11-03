import React, { useState, useEffect } from 'react'
import { useApp } from '../store.jsx'
import MapView from '../components/MapView.jsx'
import { Badge, Card, PageHead, SyntheticBanner, EmptyState } from '../components/ui.jsx'
import { X, SearchCheck, Share2, Copy, CheckCircle2, ExternalLink, Globe, MapPin, ArrowRight } from 'lucide-react'
import { LGU } from '../lib/gazetteer.js'

const CL_REVIEW = ['Unreviewed', 'Under field verification', 'Explained by context', 'Escalated to ERB']

export default function Geo() {
  const { result, state, dispatch, perm, openApp, notify } = useApp()
  const [layers, setLayers] = useState({ apps: true, clusters: true, density: false, buildings: true, barangays: true })
  const [selId, setSelId] = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  // Sync selected cluster from URL hash query (e.g., #/geo?cluster=CL-0089)
  useEffect(() => {
    const parseHash = () => {
      const hashStr = window.location.hash || ''
      const queryIdx = hashStr.indexOf('?')
      if (queryIdx >= 0) {
        const params = new URLSearchParams(hashStr.slice(queryIdx))
        const cl = params.get('cluster')
        if (cl && result.clusters.some((c) => c.id === cl)) {
          setSelId(cl)
        }
      }
    }
    parseHash()
    window.addEventListener('hashchange', parseHash)
    return () => window.removeEventListener('hashchange', parseHash)
  }, [result.clusters])

  const sel = result.clusters.find((c) => c.id === selId)
  const tog = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  const noGeo = result.apps.filter((a) => !a.addr.coords || a.addr.precision === 'barangay').length

  const publicUrl = window.location.origin + window.location.pathname + '#/public-map?share=comelec-live-2026-audit'
  const iframeCode = `<iframe src="${publicUrl}" width="100%" height="600" frameborder="0" style="border:1px solid #e2e8f0;border-radius:12px;"></iframe>`

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl)
    setCopiedLink(true)
    notify('Public live tracking link copied to clipboard!')
    setTimeout(() => setCopiedLink(false), 2500)
  }

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(iframeCode)
    setCopiedEmbed(true)
    notify('Embed iframe code copied!')
    setTimeout(() => setCopiedEmbed(false), 2500)
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHead title="Geographic Analysis (De La Salle Taft Avenue Sector)" feature="Boundary Validation | Spatial Anomaly Radar | DLSU Taft & Nearby Manila Barangays">
            Geographic boundary validation, residency & location consistency, spatial anomaly detection (DBSCAN), and registration transfer patterns centered around De La Salle University, Taft Avenue, Manila.
          </PageHead>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 12 }}>
            <span className="chip" style={{ background: 'rgba(21, 128, 61, 0.1)', color: '#15803d', border: '1px solid rgba(21, 128, 61, 0.3)', fontWeight: 700 }}>
              <MapPin size={13} style={{ verticalAlign: -1, marginRight: 4 }} />
              Target Area: {LGU.municipality} ({LGU.district})
            </span>
            <span className="muted small">High-density urban barangays around DLSU Taft Avenue</span>
          </div>
        </div>
        
        {/* Lalamove-style Share Live Public Link Button */}
        <button 
          type="button" 
          className="btn primary" 
          onClick={() => setShowShareModal(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 700 }}
        >
          <Share2 size={16} />
          <span>Share Live Public Stream (Lalamove Style)</span>
        </button>
      </div>

      <SyntheticBanner />

      <div className="grid g-main">
        <div className="grid" style={{ gap: 10, alignContent: 'start' }}>
          <div className="row small" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['apps', 'Applications'], ['clusters', 'Detected clusters'], ['density', 'Density glow'], ['buildings', 'Known buildings (context)'], ['barangays', 'Barangay areas']].map(([k, l]) => (
                <label key={k} className="chip" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={layers[k]} onChange={() => tog(k)} style={{ width: 'auto' }} />{l}</label>
              ))}
            </div>
            <span className="muted">DBSCAN eps {state.config.eps} m, minPts {state.config.minPts}</span>
          </div>

          <div className="mapwrap">
            <MapView apps={result.apps} clusters={result.clusters} layers={layers} selectedCluster={selId} onSelectCluster={setSelId} onSelectApp={openApp} />
            {sel && (
            <aside className="cluster-panel" aria-label="Cluster details">
              <div className="cp-head">
                <h2>
                  <span className="mono">{sel.id}</span>
                  <span className="sub">Manila Cluster Details</span>
                </h2>
                <button className="btn sm" onClick={() => setSelId(null)} aria-label="Close cluster details"><X size={14} /></button>
              </div>
              <dl className="kv">
                <dt>Location</dt><dd>{sel.sitioOrArea}, Barangay {sel.barangayName}, {LGU.municipality}<br /><span className="mono small">{sel.center[0].toFixed(5)}, {sel.center[1].toFixed(5)}</span></dd>
                <dt>Applications</dt><dd>{sel.size} within {sel.radiusM} m, submitted over {sel.spanDays} days</dd>
                <dt>Barangay baseline</dt><dd>{sel.stat.last30} apps in 30 days vs {sel.stat.baseline}/month typical ({sel.stat.spike}x). Density: {sel.stat.densityPerKm2.toLocaleString()} residents/km²</dd>
              </dl>
              
              {/* Direct bridge to Investigation Case Queue */}
              <div style={{ margin: '10px 0', padding: '10px', background: 'var(--panel2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Case Queue Connection:</div>
                <div className="small muted" style={{ marginBottom: 8 }}>
                  Review and adjudicate the {sel.size} applications flagged under this Manila cluster.
                </div>
                <a 
                  href={`#/cases?cluster=${sel.id}`}
                  className="btn primary sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, textDecoration: 'none' }}
                >
                  <SearchCheck size={14} />
                  <span>Open {sel.size} Cases in Investigation Queue</span>
                  <ArrowRight size={13} />
                </a>
              </div>

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
            {!sel && <div className="map-hint">Select a cluster on the Manila map or in the list to investigate it</div>}
          </div>

          <div className="small muted">Map: Leaflet + OpenStreetMap (tiles need internet access; overlays render regardless). Coordinates placed in Manila demo sector ({LGU.municipality}, {LGU.province}); {noGeo} applications are excluded from clustering because only barangay-level or no location could be resolved.</div>
          <div className="row small"><span style={{ color: '#1b9a68' }}>● Low</span><span style={{ color: '#d9820f' }}>● Moderate</span><span style={{ color: '#c0272d' }}>● High</span><span style={{ color: '#374151' }}>● Known building</span><span style={{ color: '#c0272d' }}>◯ Cluster needs review</span><span style={{ color: '#6b7280' }}>◯ Cluster plausibly explained by context</span></div>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Detected Manila clusters" sub={`${result.clusters.length}`}>
            {result.clusters.map((c) => {
              const rev = state.clusterReview[c.id] || 'Unreviewed'
              return (
                <div key={c.id} className={`ind ${selId === c.id ? 'trig' : ''}`} style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setSelId(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelId(c.id)}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b className="mono">{c.id}</b>
                    <Badge tone={c.status === 'Plausibly explained by context' ? 'info' : c.status === 'Context unavailable' ? 'mod' : 'high'}>{c.status}</Badge>
                  </div>
                  <div className="small">{c.size} applications · Barangay {c.barangayName}, Manila · {c.sitioOrArea} · radius {c.radiusM} m</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div className="small muted">Review: {rev}</div>
                    <a 
                      href={`#/cases?cluster=${c.id}`} 
                      onClick={(e) => e.stopPropagation()} 
                      className="chip sm mono" 
                      title="Open cases in queue" 
                      style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                    >
                      <SearchCheck size={12} /> Cases ({c.size})
                    </a>
                  </div>
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

      {/* SHAREABLE EMBEDDED LINK MODAL (LALAMOVE STYLE) */}
      {showShareModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 20
        }}>
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            maxWidth: 580,
            width: '100%',
            padding: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#c0272d', padding: 8, borderRadius: 8, color: '#fff' }}>
                  <Globe size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Share Live Public Oversight Stream</h3>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Lalamove-Style Live Transparency Tracking</div>
                </div>
              </div>
              <button className="btn sm" onClick={() => setShowShareModal(false)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: 'var(--text)' }}>
              Like an active Lalamove delivery tracking link, this embedded public URL allows poll watchdogs, accredited citizens, and press observers to track the live geospatial status and detected clusters in real-time without administrative privileges. Individual PII remains completely protected.
            </p>

            {/* Direct Share Link */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>PUBLIC TRANSPARENCY URL</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  type="text" 
                  readOnly 
                  value={publicUrl} 
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, padding: '8px 12px' }} 
                />
                <button type="button" className="btn primary" onClick={handleCopyLink} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {copiedLink ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copiedLink ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Embed Code */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>EMBEDDABLE IFRAME WIDGET CODE</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  type="text" 
                  readOnly 
                  value={iframeCode} 
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, padding: '8px 12px' }} 
                />
                <button type="button" className="btn" onClick={handleCopyEmbed} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {copiedEmbed ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copiedEmbed ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <a 
                href="#/public-map" 
                target="_blank" 
                rel="noreferrer" 
                className="btn" 
                style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
              >
                Open Public View in New Tab <ExternalLink size={14} />
              </a>
              <button type="button" className="btn primary" onClick={() => setShowShareModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
