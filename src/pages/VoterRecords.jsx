import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, RiskBadge, SimBadge, SyntheticBanner, fmtDate } from '../components/ui.jsx'
import { BARANGAYS } from '../lib/gazetteer.js'
import { download, toCSV } from '../lib/export.js'
import { getComelecVoters, getAllAttendance, getVoterDossier } from '../lib/api.js'
import { 
  Users, Search, Download, Eye, FileText, CheckCircle2, 
  AlertTriangle, ShieldCheck, Clock, AlertOctagon, UserCheck, X 
} from 'lucide-react'

export default function VoterRecords() {
  const { result, state, dispatch, perm, openApp, summary, notify } = useApp()
  const [q, setQ] = useState('')
  const [fb, setFb] = useState('all')
  const [fs, setFs] = useState('all')
  const [fl, setFl] = useState('all')
  const [fIssue, setFIssue] = useState('all') // 'all' or 'issues_only'

  const [comelecVoters, setComelecVoters] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [inspectedVoterDossier, setInspectedVoterDossier] = useState(null)
  const [dossierLoading, setDossierLoading] = useState(false)

  // Fetch live enrolled COMELEC voters & attendance events from backend
  useEffect(() => {
    async function loadLiveRegistry() {
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
      } catch (err) {
        console.warn('Live voter registry fetch notice:', err)
      }
    }
    loadLiveRegistry()
    const timer = setInterval(loadLiveRegistry, 4000)
    return () => clearInterval(timer)
  }, [])

  // Map enrolled COMELEC citizens and connect their live attendance issues
  const enrolledCitizens = useMemo(() => {
    const attMap = {}
    attendanceRecords.forEach((a) => {
      attMap[a.voter_id] = a
    })

    return comelecVoters.map((v) => {
      const att = attMap[v.voter_id] || v.attendance
      const anomalyFlag = att?.timing_anomaly?.flag || att?.anomaly_flag
      const hasIssue = anomalyFlag && anomalyFlag !== 'NORMAL'
      const isHigh = hasIssue || v.registration_status?.includes('LOCKED') || v.registration_status?.includes('BLOCKED')

      return {
        id: v.voter_id,
        vin: v.vin,
        name: v.name,
        age: 26,
        type: 'COMELEC Enrolled Citizen',
        synthetic: false,
        submittedAt: att?.face_in_timestamp || new Date().toISOString(),
        addr: {
          original: v.barangay || v.precinct_id || 'Declared Ward',
          normalized: v.barangay || v.precinct_id || 'Declared Ward',
          status: 'Resolved',
          confidence: 1.0,
          barangayId: v.barangay ? v.barangay.toLowerCase() : null
        },
        biometrics: {
          enrolled: true,
          status: v.registration_status,
          hash: v.biometric_hash
        },
        label: isHigh ? 'High' : (v.has_voted ? 'Low' : 'Moderate'),
        score: hasIssue ? 90 : (v.has_voted ? 10 : 35),
        photo_base64: v.photo_base64,
        issue: anomalyFlag,
        timing_anomaly: att?.timing_anomaly,
        duration_formatted: att?.duration_formatted || att?.duration,
        attendance: att,
        isComelecEnrolled: true
      }
    })
  }, [comelecVoters, attendanceRecords])

  // Unified master list connecting screened applications + live enrolled voters
  const allMasterRecords = useMemo(() => {
    const existingIds = new Set(result.apps.map((a) => a.id))
    const freshEnrolled = enrolledCitizens.filter((c) => !existingIds.has(c.id))
    return [...freshEnrolled, ...result.apps]
  }, [enrolledCitizens, result.apps])

  const rows = allMasterRecords.filter((a) => {
    const hay = `${a.id} ${a.name} ${a.addr.original} ${a.addr.normalized} ${a.vin || ''} ${a.issue || ''}`.toLowerCase()
    const matchesQuery = !q || hay.includes(q.toLowerCase())
    const matchesBarangay = fb === 'all' || a.addr.barangayId === fb || (fb === 'none' && !a.addr.barangayId)
    const matchesStatus = fs === 'all' || a.addr.status === fs
    const matchesPriority = fl === 'all' || a.label === fl
    const matchesIssue = fIssue === 'all' || (fIssue === 'issues_only' ? (a.label === 'High' || !!a.issue) : true)

    return matchesQuery && matchesBarangay && matchesStatus && matchesPriority && matchesIssue
  })

  const openVoterDetail = async (record) => {
    if (record.isComelecEnrolled) {
      setDossierLoading(true)
      try {
        const d = await getVoterDossier(record.id)
        setInspectedVoterDossier(d)
      } catch (e) {
        // Fallback to local record details
        setInspectedVoterDossier({
          name: record.name,
          voter_id: record.id,
          vin: record.vin,
          precinct_id: record.addr.normalized,
          registration_status: record.biometrics?.status || 'ENROLLED',
          photo_id_base64: record.photo_base64,
          photo_in_base64: record.photo_base64,
          photo_out_base64: record.photo_base64,
          face_in_timestamp: record.attendance?.face_in_timestamp || '—',
          face_out_timestamp: record.attendance?.face_out_timestamp || '—',
          duration_formatted: record.duration_formatted || '—',
          timing_anomaly: record.timing_anomaly
        })
      } finally {
        setDossierLoading(false)
      }
    } else {
      openApp(record.id)
    }
  }

  const exportCsv = () => {
    download('once-ai-voter-records.csv', 'text/csv', toCSV(rows, [
      { label: 'Application ID / VIN', value: (a) => a.vin || a.id },
      { label: 'Voter Name', value: 'name' },
      { label: 'Type', value: 'type' },
      { label: 'Declared Address / Precinct', value: (a) => a.addr.normalized },
      { label: 'Address Status', value: (a) => a.addr.status },
      { label: 'Priority Label', value: 'label' },
      { label: 'Priority Score', value: 'score' },
      { label: 'Biometrics', value: (a) => (a.biometrics ? 'Enrolled' : 'None') },
      { label: 'Attendance Issue', value: (a) => a.issue || 'None' }
    ]))
    dispatch({ type: 'logView', action: 'EXPORT', target: 'voter-records', detail: `Exported ${rows.length} voter records to CSV` })
  }

  const issueCount = allMasterRecords.filter((a) => a.label === 'High' || !!a.issue).length

  return (
    <div className="page">
      <PageHead title="Voter Records" feature="Master Voter Registry | Live Enrolled Citizens & Issue Tracker">
        Master directory connecting processed voter applications and live enrolled citizens. Inspect normalized addresses, dual-face attendance logs, and flagged timing or identity issues.
      </PageHead>
      <SyntheticBanner />

      {/* Quick Summary Metric Cards */}
      <div className="grid g4">
        <Card className="stat">
          <div className="v">{allMasterRecords.length}</div>
          <div className="l">Total Connected Voters</div>
        </Card>
        <Card className="stat">
          <div className="v" style={{ color: 'var(--high)' }}>{issueCount}</div>
          <div className="l">Flagged Issues / Anomalies</div>
        </Card>
        <Card className="stat">
          <div className="v" style={{ color: '#38bdf8' }}>{comelecVoters.length}</div>
          <div className="l">Enrolled Citizens (COMELEC)</div>
        </Card>
        <Card className="stat">
          <div className="v" style={{ color: 'var(--low)' }}>{allMasterRecords.filter(a => a.addr.status === 'Resolved').length}</div>
          <div className="l">Resolved Clean Geocodes</div>
        </Card>
      </div>

      <Card title="Registered & Enrolled Voter Records" sub={`Displaying ${rows.length} of ${allMasterRecords.length} records`}>
        <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <input 
              type="search" 
              placeholder="Search by ID, name, VIN, or issue..." 
              value={q} 
              onChange={(e) => setQ(e.target.value)} 
              aria-label="Search voter records" 
              style={{ width: '100%', paddingLeft: 12 }}
            />
          </div>

          <button
            type="button"
            className={`chip ${fIssue === 'issues_only' ? 'primary' : ''}`}
            onClick={() => setFIssue(fIssue === 'issues_only' ? 'all' : 'issues_only')}
            style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <AlertOctagon size={14} color={fIssue === 'issues_only' ? '#fff' : '#f43f5e'} />
            <span>{fIssue === 'issues_only' ? 'Showing Issues Only' : 'Filter: Issues & Anomalies Only'}</span>
            {issueCount > 0 && <span className="count">{issueCount}</span>}
          </button>

          <select style={{ width: 'auto' }} value={fb} onChange={(e) => setFb(e.target.value)} aria-label="Filter by barangay">
            <option value="all">All barangays</option>
            {BARANGAYS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="none">No barangay resolved</option>
          </select>

          <select style={{ width: 'auto' }} value={fl} onChange={(e) => setFl(e.target.value)} aria-label="Filter by priority">
            <option value="all">All priorities</option>
            <option>High</option>
            <option>Moderate</option>
            <option>Low</option>
          </select>

          <button className="btn" onClick={exportCsv} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="tablewrap" style={{ maxHeight: 620 }}>
          <table>
            <thead>
              <tr>
                <th>Voter / Record ID</th>
                <th>Citizen Name</th>
                <th>Declared Address / Precinct</th>
                <th>Biometrics & Issue Status</th>
                <th>Priority</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="click" onClick={() => openVoterDetail(a)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openVoterDetail(a)}>
                  <td className="mono">
                    <b>{a.vin || a.id}</b>
                    {a.isComelecEnrolled && <Badge tone="info" style={{ marginLeft: 6 }}>Enrolled Citizen</Badge>}
                    {!a.synthetic && !a.isComelecEnrolled && <Badge tone="info" style={{ marginLeft: 6 }}>New Intake</Badge>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {a.photo_base64 && (
                        <div style={{ width: 34, height: 34, borderRadius: 6, overflow: 'hidden', background: '#000', flexShrink: 0, border: '1px solid var(--border)' }}>
                          <img src={a.photo_base64} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        <div className="small muted">Age {a.age || 25}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="small">{a.addr.normalized}</div>
                    <div className="mono small muted" style={{ fontSize: 11 }}>{a.addr.original}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {a.issue ? (
                        <Badge tone="high">
                          <AlertTriangle size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                          {a.issue}
                        </Badge>
                      ) : a.biometrics ? (
                        <Badge tone="low">
                          <CheckCircle2 size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                          {a.biometrics.status || 'Biometrics Indexed'}
                        </Badge>
                      ) : (
                        <span className="small muted">—</span>
                      )}
                      {a.duration_formatted && (
                        <span className="mono small" style={{ fontSize: 11, color: '#38bdf8' }}>
                          ⏱️ Dwell: {a.duration_formatted}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <RiskBadge label={a.label} />
                  </td>
                  <td>
                    <button 
                      className="chip small"
                      onClick={(e) => { e.stopPropagation(); openVoterDetail(a); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Eye size={12} />
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="7" className="muted" style={{ padding: 24, textAlign: 'center' }}>
                    No voter records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* INSPECTED ENROLLED CITIZEN DOSSIER MODAL */}
      {inspectedVoterDossier && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, maxWidth: 540, width: '100%', padding: 22, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{inspectedVoterDossier.name}</h3>
                <div className="mono small text-muted">VIN: {inspectedVoterDossier.vin} • ID: {inspectedVoterDossier.voter_id}</div>
              </div>
              <button className="chip small" onClick={() => setInspectedVoterDossier(null)}><X size={15} /></button>
            </div>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, background: 'var(--panel2)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
              {inspectedVoterDossier.photo_id_base64 && (
                <div style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: '2px solid #38bdf8', background: '#000', flexShrink: 0 }}>
                  <img src={inspectedVoterDossier.photo_id_base64} alt={inspectedVoterDossier.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ fontSize: 13 }}>
                <div>Assigned Precinct: <b>{inspectedVoterDossier.precinct_id}</b></div>
                <div>Status: <Badge tone={inspectedVoterDossier.timing_anomaly?.flag === 'RUSH_ANOMALY' ? 'high' : 'low'}>{inspectedVoterDossier.registration_status}</Badge></div>
                <div className="small muted" style={{ marginTop: 4 }}>Face IN: {inspectedVoterDossier.face_in_timestamp}</div>
                <div className="small muted">Face OUT: {inspectedVoterDossier.face_out_timestamp}</div>
              </div>
            </div>

            {inspectedVoterDossier.timing_anomaly && (
              <div style={{ 
                padding: '12px 14px', 
                borderRadius: 10, 
                background: inspectedVoterDossier.timing_anomaly.flag === 'NORMAL' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                border: inspectedVoterDossier.timing_anomaly.flag === 'NORMAL' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                marginBottom: 14
              }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: inspectedVoterDossier.timing_anomaly.flag === 'NORMAL' ? '#22c55e' : '#f43f5e', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <AlertOctagon size={14} />
                  AI Pacing Verdict: {inspectedVoterDossier.timing_anomaly.flag} ({inspectedVoterDossier.timing_anomaly.severity})
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                  {inspectedVoterDossier.timing_anomaly.explanation}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn primary" onClick={() => setInspectedVoterDossier(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
