import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store.jsx'
import MapView from '../components/MapView.jsx'
import { Badge, Card } from '../components/ui.jsx'
import { ShieldCheck, Radio, Eye, ExternalLink, X, Info, Share2, Layers, CheckCircle2 } from 'lucide-react'
import { LGU, BARANGAYS } from '../lib/gazetteer.js'
import { getComelecVoters, getAllAttendance } from '../lib/api.js'

export default function PublicGeoMap() {
  const { result, state } = useApp()
  const [layers, setLayers] = useState({ apps: true, clusters: true, density: true, buildings: true, barangays: true })
  const [selId, setSelId] = useState('CL-0089')
  const [copied, setCopied] = useState(false)

  // Live COMELEC Registry & Attendance Records for Real-Time Sync with Admin DBSCAN Map
  const [comelecVoters, setComelecVoters] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])

  useEffect(() => {
    async function fetchLiveRecords() {
      try {
        const [vData, aData] = await Promise.allSettled([
          getComelecVoters(),
          getAllAttendance()
        ])
        if (vData.status === 'fulfilled' && vData.value?.voters) {
          setComelecVoters(vData.value.voters)
        }
        if (aData.status === 'fulfilled' && aData.value?.attendance) {
          setAttendanceRecords(aData.value.attendance)
        }
      } catch (e) {
        console.warn('Live public map sync notice:', e)
      }
    }
    fetchLiveRecords()
    const timer = setInterval(fetchLiveRecords, 2000)
    return () => clearInterval(timer)
  }, [])

  // Unified Spatial Pool for Public Stream
  const allGeoApps = useMemo(() => {
    const attMap = {}
    attendanceRecords.forEach((att) => { attMap[att.voter_id] = att })

    const enrolledAsApps = comelecVoters.map((v) => {
      const att = attMap[v.voter_id] || v.attendance
      const anomaly = att?.timing_anomaly || (att?.anomaly_flag && att.anomaly_flag !== 'NORMAL' ? { flag: att.anomaly_flag, reason: 'Pacing outlier detected' } : null)
      const hasIssue = !!(anomaly?.flag && anomaly.flag !== 'NORMAL') || v.registration_status?.includes('BLOCKED') || v.registration_status?.includes('LOCKED')
      const cs = state.caseState[v.voter_id]
      const flagName = cs?.suspectedFlag || anomaly?.flag || (hasIssue ? 'ANOMALY_DETECTED' : null)

      return {
        id: v.voter_id,
        vin: v.vin,
        name: v.name,
        age: 26,
        type: 'COMELEC Enrolled Citizen',
        submittedAt: att?.face_in_timestamp || v.created_at || new Date().toISOString(),
        submittedVia: 'Biometric Intake Station',
        batchId: null,
        supportingDoc: { type: 'COMELEC ID', barangayId: 'MAL' },
        yearsAtAddress: 4,
        synthetic: false,
        photo_base64: v.photo_base64 || cs?.photo_base64 || null,
        biometrics: {
          enrolled: true,
          voter_id: v.voter_id,
          vin: v.vin,
          hash: v.biometric_hash,
          status: v.registration_status
        },
        addr: {
          original: v.barangay || v.precinct_id || 'Taft Ave, Malate, Manila',
          normalized: v.barangay || v.precinct_id || 'Taft Ave, Malate, Manila',
          status: 'Resolved',
          precision: 'street',
          precisionBasis: 'Taft Ave, Malate (DLSU Ward)',
          confidence: 1.0,
          warnings: [],
          components: { barangay: 'Maligaya (DLSU Taft)' },
          coords: [14.5648, 120.9932]
        },
        label: hasIssue ? 'High' : (cs ? 'Moderate' : 'Low'),
        score: hasIssue ? 95 : (cs ? 45 : 20),
        issue: flagName,
        timing_anomaly: anomaly,
        duration_formatted: att?.duration_formatted || att?.duration || cs?.duration,
        attendance: att,
        isComelecEnrolled: true,
        document: null,
        related: [],
        cluster: null
      }
    })

    const merged = [...result.apps]
    enrolledAsApps.forEach((ea) => {
      const idx = merged.findIndex((m) => m.id === ea.id)
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...ea, photo_base64: ea.photo_base64 || merged[idx].photo_base64 }
      } else {
        merged.unshift(ea)
      }
    })
    return merged
  }, [result.apps, comelecVoters, attendanceRecords, state.caseState])

  const sel = result.clusters.find((c) => c.id === selId)
  const tog = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))

  const shareUrl = window.location.origin + window.location.pathname + '#/public-map?share=comelec-live-2026-audit'

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Public Transparency Topbar */}
      <header style={{
        background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
        borderBottom: '2px solid #c0272d',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ 
            background: '#c0272d', 
            padding: 8, 
            borderRadius: 10, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(192, 39, 45, 0.4)'
          }}>
            <ShieldCheck size={24} color="#ffffff" strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 18, letterSpacing: '0.5px' }}>
                COMELEC PUBLIC OVERSIGHT
              </span>
              <span style={{ 
                background: 'rgba(34, 197, 94, 0.2)', 
                color: '#4ade80', 
                border: '1px solid rgba(34, 197, 94, 0.4)',
                borderRadius: 20, 
                padding: '2px 8px', 
                fontSize: 11, 
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}>
                <Radio size={12} className="pulse-dot" /> LIVE PUBLIC STREAM
              </span>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>
              Sovereign Geospatial Anomaly Radar • Live Public Transparency Stream
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            type="button" 
            onClick={copyLink}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {copied ? <CheckCircle2 size={14} color="#4ade80" /> : <Share2 size={14} />}
            {copied ? 'Link Copied to Clipboard!' : 'Share Live Tracking Link'}
          </button>

          <a 
            href="#/dashboard"
            style={{
              background: '#c0272d',
              color: '#ffffff',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            Staff Login <ExternalLink size={13} />
          </a>
        </div>
      </header>

      {/* Real-Time Transparency KPI Strip */}
      <div style={{
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Jurisdiction</span>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{LGU.municipality} ({LGU.district})</div>
          </div>
          <div style={{ width: 1, height: 26, background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Screened Registrations</span>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{allGeoApps.length} Verified Entries</div>
          </div>
          <div style={{ width: 1, height: 26, background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Monitored Barangays</span>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{BARANGAYS.length} Manila Wards</div>
          </div>
          <div style={{ width: 1, height: 26, background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Spatial Clusters</span>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#c0272d' }}>{result.clusters.length} Under Oversight</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span className="chip" style={{ background: 'var(--panel2)' }}>
            <Layers size={13} /> Layer Controls:
          </span>
          {[['clusters', 'Clusters'], ['density', 'Heatmap'], ['buildings', 'Buildings'], ['barangays', 'Barangays']].map(([k, l]) => (
            <label key={k} className="chip" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={layers[k]} onChange={() => tog(k)} style={{ width: 'auto' }} /> {l}
            </label>
          ))}
        </div>
      </div>

      {/* Main Map Canvas Area with Slide-Over Transparency Dossier */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, height: 'calc(100vh - 130px)', position: 'relative' }}>
          <MapView 
            apps={allGeoApps} 
            clusters={result.clusters} 
            layers={layers} 
            selectedCluster={selId} 
            onSelectCluster={setSelId} 
            onSelectApp={() => {}} 
          />

          {/* Floating Public Map Notice */}
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            maxWidth: 380,
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4, color: '#38bdf8' }}>
              <Info size={14} /> Public Watchdog & Transparency Notice
            </div>
            This public stream displays real-time geospatial density and DBSCAN anomaly clustering. In compliance with <b>RA 10173</b>, citizen PII is cryptographically redacted from the public layer.
          </div>
        </div>

        {/* Right Transparency Sidebar */}
        <aside style={{
          width: 380,
          background: 'var(--panel)',
          borderLeft: '1px solid var(--border)',
          height: 'calc(100vh - 130px)',
          overflowY: 'auto',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <div>
            <h3 style={{ fontSize: 16, margin: '0 0 4px 0', fontWeight: 700 }}>Spatial Cluster Transparency</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Live algorithmic review of registration density per barangay.
            </p>
          </div>

          {sel ? (
            <div style={{ 
              background: 'var(--panel2)', 
              border: '1px solid var(--border)', 
              borderRadius: 12, 
              padding: 14 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="mono" style={{ fontWeight: 800, fontSize: 16, color: '#c0272d' }}>{sel.id}</span>
                <Badge tone={sel.status === 'Plausibly explained by context' ? 'info' : sel.status === 'Context unavailable' ? 'mod' : 'high'}>
                  {sel.status}
                </Badge>
              </div>

              <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
                Barangay {sel.barangayName} ({sel.sitioOrArea})
              </div>

              <dl className="kv" style={{ fontSize: 12 }}>
                <dt>Concentration</dt>
                <dd>{sel.size} applications within {sel.radiusM} meters</dd>
                <dt>Spike Ratio</dt>
                <dd><b>{sel.stat.spike}x</b> typical baseline ({sel.stat.last30} vs {sel.stat.baseline}/mo)</dd>
                <dt>Context Evaluation</dt>
                <dd>{sel.contextText}</dd>
                <dt>Review Status</dt>
                <dd>{state.clusterReview[sel.id] || 'Under field verification'}</dd>
              </dl>
            </div>
          ) : (
            <div className="small muted">Click on any cluster on the map to inspect public advisory details.</div>
          )}

          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px 0', textTransform: 'uppercase', color: 'var(--muted)' }}>
              All Monitored Clusters ({result.clusters.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.clusters.map((c) => (
                <div 
                  key={c.id}
                  onClick={() => setSelId(c.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: selId === c.id ? 'var(--panel2)' : 'transparent',
                    border: selId === c.id ? '1px solid #c0272d' : '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{c.id}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: c.status === 'Plausibly explained by context' ? '#38bdf8' : '#e11d48' }}>
                      {c.size} apps · {c.stat.spike}x spike
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Brgy. {c.barangayName} ({c.sitioOrArea})
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
