import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useApp } from '../store.jsx'
import Dossier from '../components/Dossier.jsx'
import { Badge, Card, PageHead, RiskBadge, ScoreBar, SyntheticBanner, EmptyState, fmtDate } from '../components/ui.jsx'
import { CASE_STATUSES, caseOf } from '../lib/pipeline.js'
import { CheckCircle2, MapPin, Filter, X, Clock, AlertTriangle, AlertOctagon } from 'lucide-react'
import { LGU } from '../lib/gazetteer.js'
import { getComelecVoters, getAllAttendance } from '../lib/api.js'

export default function Cases() {
  const { result, state, summary, dispatch, perm, notify } = useApp()
  const [sel, setSel] = useState(null)
  const [fs, setFs] = useState('open')
  const [fl, setFl] = useState('all')
  const [fc, setFc] = useState('all') // Manila cluster filter
  const [q, setQ] = useState('')
  const [manual, setManual] = useState('')

  // Live COMELEC Registry & Attendance Records
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
        console.warn('Live cases registry fetch notice:', e)
      }
    }
    fetchLiveRecords()
    const timer = setInterval(fetchLiveRecords, 3000)
    return () => clearInterval(timer)
  }, [])

  // Sync cluster filter and selected app from URL hash query (e.g. #/cases?cluster=CL-0089)
  useEffect(() => {
    const parseHash = () => {
      const hashStr = window.location.hash || ''
      const queryIdx = hashStr.indexOf('?')
      if (queryIdx >= 0) {
        const params = new URLSearchParams(hashStr.slice(queryIdx))
        const cl = params.get('cluster')
        if (cl) {
          setFc(cl)
        }
        const appId = params.get('app')
        if (appId) {
          setSel(appId)
        }
      }
    }
    parseHash()
    window.addEventListener('hashchange', parseHash)
    return () => window.removeEventListener('hashchange', parseHash)
  }, [])

  // Unified Cases Pool: Screened Applications + Live Enrolled Citizens & Attendance Events
  const allCasesPool = useMemo(() => {
    const existingIds = new Set(result.apps.map((a) => a.id))
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
        indicators: {
          geo: { key: 'geo', severity: 0, result: 'Not triggered', explanation: 'Within DLSU Taft Avenue precinct area.', evidence: [] },
          address: { key: 'address', severity: 0, result: 'Not triggered', explanation: 'Declared address matches COMELEC registry record.', evidence: [] },
          unresolved: { key: 'unresolved', severity: 0, result: 'Not triggered', explanation: 'Address resolved to precinct.', evidence: [] },
          handwriting: { key: 'handwriting', severity: 0, result: 'Not assessable', explanation: 'Digital biometric intake station.', evidence: [] },
          batch: { key: 'batch', severity: 0, result: 'Not triggered', explanation: 'Individual attendance intake.', evidence: [] }
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

  // Track cases currently animating out upon resolution
  const [resolvingIds, setResolvingIds] = useState({})
  const prevStatusesRef = useRef({})

  // Detect when a case transitions to 'Resolved' and trigger animation
  useEffect(() => {
    const prev = prevStatusesRef.current
    const newlyResolved = []

    for (const app of allCasesPool) {
      const prevStatus = prev[app.id]
      const curStatus = caseOf(state.caseState, app.id).status
      if (prevStatus && prevStatus !== 'Resolved' && curStatus === 'Resolved') {
        newlyResolved.push(app.id)
      }
      prev[app.id] = curStatus
    }

    if (newlyResolved.length > 0) {
      setResolvingIds((cur) => {
        const next = { ...cur }
        newlyResolved.forEach((id) => { next[id] = true })
        return next
      })

      // Remove after animation completes (1.4 seconds)
      setTimeout(() => {
        setResolvingIds((cur) => {
          const next = { ...cur }
          newlyResolved.forEach((id) => { delete next[id] })
          return next
        })
      }, 1400)
    }
  }, [state.caseState, allCasesPool])

  const rows = allCasesPool.filter((a) => {
    const st = caseOf(state.caseState, a.id).status
    const isAnimResolving = !!resolvingIds[a.id]
    const hasSuspectedFlag = !!(a.issue || a.timing_anomaly || a.label !== 'Low' || state.caseState[a.id])

    // In open mode, show flagged cases or cases with open investigation
    const matchesStatus = fs === 'all' 
      ? true 
      : fs === 'open' 
        ? ((st !== 'Resolved' && hasSuspectedFlag) || isAnimResolving) 
        : st === fs

    // Manila spatial cluster filter
    const matchesCluster = fc === 'all' || (a.cluster && a.cluster.id === fc)

    // Search query matches ID, Name, Address, VIN, or Issue
    const queryTerm = q.toLowerCase().trim()
    const matchesQuery = !queryTerm || 
      `${a.id} ${a.name} ${a.addr?.normalized || ''} ${a.vin || ''} ${a.issue || ''} ${a.timing_anomaly?.flag || ''}`
        .toLowerCase()
        .includes(queryTerm)

    return matchesStatus && matchesCluster && (fl === 'all' || a.label === fl) && matchesQuery
  }).sort((a, b) => {
    // Suspected anomaly flags float to the top
    const aIssue = a.issue || a.timing_anomaly ? 1 : 0
    const bIssue = b.issue || b.timing_anomaly ? 1 : 0
    if (aIssue !== bIssue) return bIssue - aIssue
    return b.score - a.score
  })

  const cur = sel && allCasesPool.some(x => x.id === sel) ? sel : rows[0]?.id
  const curApp = allCasesPool.find((x) => x.id === cur) || result.byId[cur] || rows[0]

  const openManual = () => {
    const term = manual.trim().toUpperCase()
    if (!term) return
    const a = allCasesPool.find((x) => 
      x.id.toUpperCase() === term || 
      (x.vin && x.vin.toUpperCase() === term) ||
      x.name.toUpperCase().includes(term)
    )
    if (!a) {
      notify(`No case or citizen record found matching "${manual}".`)
      return
    }
    if (!state.caseState[a.id]) {
      dispatch({ type: 'caseUpdate', id: a.id, patch: { status: 'Under Review' }, text: 'Case opened manually by reviewer', action: 'CASE_OPENED' })
    }
    setSel(a.id)
    setManual('')
  }

  return (
    <div className="page">
      <PageHead title="Investigation Cases (De La Salle Taft Avenue Sector)" feature="ERB Triage Dashboard | Manila Spatial Cluster Integration | Secure Audit Dossier">
        Flagged voter registration applications and live biometric attendance anomalies become reviewable cases here. Directly connected to the De La Salle Taft Avenue Manila cluster radar. Only a human reviewer can record a final disposition.
      </PageHead>
      <SyntheticBanner />
      <div className="grid g4">
        {CASE_STATUSES.slice(0, 4).map((s) => (
          <Card key={s}>
            <div className="stat">
              <div className="v">{allCasesPool.filter((a) => (a.issue || a.label !== 'Low' || state.caseState[a.id]) && caseOf(state.caseState, a.id).status === s).length}</div>
              <div className="l">{s}</div>
            </div>
          </Card>
        ))}
      </div>
      <div className="split">
        <Card title="Case queue" sub={`${rows.length} cases`}>
          <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
            <input type="search" placeholder="Search cases by ID, name, flag (e.g. RUSH), or address..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cases" />
            <div className="grid g3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <select value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Status filter">
                <option value="open">Open cases</option>
                <option value="all">All statuses</option>
                {CASE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={fl} onChange={(e) => setFl(e.target.value)} aria-label="Priority filter">
                <option value="all">All priorities</option>
                <option>High</option>
                <option>Moderate</option>
                <option>Low</option>
              </select>
              <select value={fc} onChange={(e) => setFc(e.target.value)} aria-label="Manila Cluster filter">
                <option value="all">All Clusters</option>
                {result.clusters.map((c) => (
                  <option key={c.id} value={c.id}>{c.id} ({c.barangayName}, Manila)</option>
                ))}
              </select>
            </div>

            {/* Active Manila Cluster Filter Indicator */}
            {fc !== 'all' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(192, 39, 45, 0.08)',
                border: '1px solid rgba(192, 39, 45, 0.25)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} color="#c0272d" />
                  <span>Filtered to Manila Cluster: <b>{fc}</b> ({rows.length} cases)</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <a 
                    href={`#/geo?cluster=${fc}`} 
                    className="chip sm mono" 
                    style={{ fontSize: 11, textDecoration: 'none', background: 'var(--panel)', border: '1px solid var(--border)' }}
                  >
                    🗺️ View on Map
                  </a>
                  <button 
                    type="button" 
                    className="btn sm" 
                    style={{ padding: '2px 6px', fontSize: 11 }}
                    onClick={() => setFc('all')}
                  >
                    Clear Filter
                  </button>
                </div>
              </div>
            )}

            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="text" placeholder="Open case by ID or Name (e.g. VOTER-MOCK-XXXX, Carlos)" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && openManual()} />
              <button className="btn" disabled={!perm.canEdit} onClick={openManual}>Open</button>
            </div>
          </div>
          <div className="tablewrap" style={{ maxHeight: 640 }}>
            <table>
              <tbody>
                {rows.map((a) => {
                  const c = caseOf(state.caseState, a.id)
                  const isResolving = !!resolvingIds[a.id]
                  return (
                    <tr 
                      key={a.id} 
                      className={`click ${cur === a.id ? 'sel' : ''} ${isResolving ? 'case-resolving' : ''}`} 
                      onClick={() => setSel(a.id)} 
                      tabIndex={0} 
                      onKeyDown={(e) => e.key === 'Enter' && setSel(a.id)}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {a.photo_base64 && (
                            <img 
                              src={a.photo_base64} 
                              alt={a.name} 
                              style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} 
                            />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span className="mono"><b>{a.id}</b></span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</span>
                              {a.cluster && (
                                <a 
                                  href={`#/geo?cluster=${a.cluster.id}`}
                                  title={`Click to inspect cluster ${a.cluster.id} on Manila map`}
                                  className="chip sm mono"
                                  style={{ 
                                    fontSize: 10, 
                                    padding: '1px 6px', 
                                    textDecoration: 'none', 
                                    background: 'rgba(192, 39, 45, 0.1)', 
                                    color: '#c0272d', 
                                    border: '1px solid rgba(192, 39, 45, 0.25)' 
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  📍 {a.cluster.id}
                                </a>
                              )}
                              {isResolving && (
                                <Badge tone="low">
                                  <CheckCircle2 size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                                  Resolving...
                                </Badge>
                              )}
                            </div>

                            {/* Suspected Flags Badges Strip */}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                              {a.issue && (
                                <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 10, fontWeight: 700, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <AlertTriangle size={10} color="#b91c1c" />
                                  {a.issue} {a.duration_formatted ? `(${a.duration_formatted})` : ''}
                                </span>
                              )}
                              {a.timing_anomaly?.flag && a.timing_anomaly.flag !== a.issue && (
                                <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 10, fontWeight: 700, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <Clock size={10} color="#b91c1c" />
                                  {a.timing_anomaly.flag} ({a.duration_formatted || a.timing_anomaly.duration_seconds + 's'})
                                </span>
                              )}
                              {a.indicators?.address?.result === 'Triggered' && (
                                <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontSize: 10, fontWeight: 600, padding: '2px 6px' }}>
                                  ⚠️ Address Warning
                                </span>
                              )}
                              {a.indicators?.handwriting?.result === 'Triggered' && (
                                <span className="badge" style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: 10, fontWeight: 600, padding: '2px 6px' }}>
                                  ✍️ Similar Handwriting
                                </span>
                              )}
                              {a.indicators?.batch?.result === 'Triggered' && (
                                <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: 10, fontWeight: 600, padding: '2px 6px' }}>
                                  📦 Batch Intake
                                </span>
                              )}
                            </div>

                            <div className="small muted" style={{ marginTop: 2 }}>
                              {a.addr?.components?.barangay ? `Brgy. ${a.addr.components.barangay}, Manila` : (a.addr?.normalized || 'Taft Ave, Manila')} · {fmtDate(a.submittedAt)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ width: 80 }}><ScoreBar score={a.score} label={a.label} /></td>
                      <td>
                        <RiskBadge label={a.label} />
                        <div className="small" style={{ marginTop: 3 }}>
                          <Badge tone={c.status === 'Resolved' ? 'low' : c.status === 'New' ? 'off' : 'info'}>
                            {c.status}
                          </Badge>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && <tr><td><EmptyState title="No cases match">Try clearing the search or filters.</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="card sticky" style={{ maxHeight: 'calc(100vh - 90px)', overflow: 'auto' }}>
          {curApp ? <Dossier appId={curApp.id} appData={curApp} inline /> : <span className="muted">Select a case to inspect dossier.</span>}
        </div>
      </div>
    </div>
  )
}
