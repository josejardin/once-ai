import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, RiskBadge, ScoreBar, SimBadge, SyntheticBanner, Tabs } from '../components/ui.jsx'
import { normalizeAddress } from '../lib/address.js'
import { simulatedEmbeddingFromFile, cosine } from '../lib/handwriting.js'
import { HandwritingSample } from '../components/Handwriting.jsx'
import BiometricIntakeCapture from '../components/BiometricIntakeCapture.jsx'
import SignatureArena from '../components/SignatureArena.jsx'
import { getComelecVoters, registerComelecVoter, clearAllComelecVoters } from '../lib/api.js'
import { 
  ScanFace, PenTool, IdCard, CheckCircle2, AlertTriangle, 
  Camera, Upload, Shield, RefreshCw, Plus, Trash2, X, Lock
} from 'lucide-react'

const PRECINCTS = [
  'Precinct 101 - Manila (Malate DLSU Ward)',
  'Precinct 102 - Manila (Ermita Ward)',
  'Precinct 202 - Quezon City',
  'Precinct 303 - Makati',
  'Precinct 404 - Pasig',
  'Precinct 505 - Sampaguita Ward'
]

export default function IdentificationAnalysis() {
  const { result, state, dispatch, perm, openApp, notify } = useApp()
  const [tab, setTab] = useState('facial')

  // --- FACIAL RECOGNITION & BIOMETRIC INTAKE STATE ---
  const [addr, setAddr] = useState('Prk 3 Brgy. Sampagita')
  const [name, setName] = useState('')
  const [age, setAge] = useState(30)
  const [type, setType] = useState('New registration')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [biometricData, setBiometricData] = useState(null)
  const [comelecVoters, setComelecVoters] = useState([])
  const [selectedVoter, setSelectedVoter] = useState(null)
  const fileRef = useRef(null)


  // --- COMELEC MOCK REGISTRY STATE ---
  const [registryLoading, setRegistryLoading] = useState(false)
  const [transferPrecinct, setTransferPrecinct] = useState('Precinct 202 - Quezon City')
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [enrollName, setEnrollName] = useState('')
  const [enrollPrecinct, setEnrollPrecinct] = useState(PRECINCTS[0])
  const [enrollDeclaredAddress, setEnrollDeclaredAddress] = useState('2401 Taft Ave, Malate (DLSU Ward), Manila')
  const [enrollAge, setEnrollAge] = useState(24)
  const [enrollPhoto, setEnrollPhoto] = useState(null)
  const [enrolling, setEnrolling] = useState(false)
  const [registrySearch, setRegistrySearch] = useState('')
  const enrollVideoRef = useRef(null)
  const enrollStreamRef = useRef(null)
  const [enrollCamActive, setEnrollCamActive] = useState(false)

  const startEnrollCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: 'user' }
      })
      enrollStreamRef.current = stream
      setEnrollCamActive(true)
      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = stream
        enrollVideoRef.current.play()
      }
    } catch (err) {
      console.warn('Webcam access error in enrollment:', err)
      alert('Could not start live webcam. Please grant camera permission.')
    }
  }

  const stopEnrollCamera = () => {
    if (enrollStreamRef.current) {
      enrollStreamRef.current.getTracks().forEach((t) => t.stop())
      enrollStreamRef.current = null
    }
    setEnrollCamActive(false)
  }

  const snapEnrollPhoto = () => {
    if (!enrollVideoRef.current) return
    const v = enrollVideoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    const size = Math.min(v.videoWidth || 256, v.videoHeight || 256)
    const sx = ((v.videoWidth || 256) - size) / 2
    const sy = ((v.videoHeight || 256) - size) / 2
    ctx.drawImage(v, sx, sy, size, size, 0, 0, 256, 256)
    const b64 = canvas.toDataURL('image/jpeg', 0.88)
    setEnrollPhoto(b64)
    stopEnrollCamera()
  }

  useEffect(() => {
    if (showEnrollModal && !enrollPhoto) {
      startEnrollCamera()
    } else if (!showEnrollModal) {
      stopEnrollCamera()
    }
    return () => stopEnrollCamera()
  }, [showEnrollModal])

  const live = useMemo(() => normalizeAddress(addr, 'preview'), [addr])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

    const userClearedRef = useRef(false)
  const hasInitializedRef = useRef(false)

  const fetchVoters = async () => {
    try {
      const data = await getComelecVoters()
      if (data?.voters) {
        setComelecVoters(data.voters)
        // Only initialize default selection once on initial load if user hasn't explicitly cleared
        if (!hasInitializedRef.current && !userClearedRef.current && data.voters.length > 0) {
          hasInitializedRef.current = true
          const v = data.voters[0]
          setSelectedVoter(v)
          setName(v.name)
          setAge(v.age || 24)
          setAddr(v.declared_address || v.rawAddress || v.barangay || `Purok 1, ${v.precinct_id}`)
        }
      }
    } catch (err) {
      console.warn('Error fetching COMELEC voters:', err)
    }
  }

  useEffect(() => {
    fetchVoters()
    const timer = setInterval(fetchVoters, 3000)
    return () => clearInterval(timer)
  }, [])

  const handleBiometricChange = (bioData) => {
    setBiometricData(bioData)
    if (!bioData) return
    const vId = bioData.voter_id || selectedVoter?.voter_id
    if (!vId) return

    const anomaly = bioData.timing_anomaly
    const isAnomaly = (anomaly?.flag && anomaly.flag !== 'NORMAL') || bioData.status === 'FLYING_VOTER_BLOCKED'

    if (isAnomaly) {
      const flagName = bioData.status === 'FLYING_VOTER_BLOCKED' ? 'FLYING_VOTER_BLOCKED' : anomaly.flag
      const flagReason = bioData.status === 'FLYING_VOTER_BLOCKED'
        ? 'Biometric facial mismatch: Scanned face does not match registered COMELEC ID card.'
        : `${flagName}: Completed in ${bioData.duration} (${anomaly.reason || 'Duration outlier'})`

      dispatch({
        type: 'caseUpdate',
        id: vId,
        patch: {
          status: 'Under Review',
          suspectedFlag: flagName,
          timing_anomaly: anomaly,
          duration: bioData.duration,
          stage: bioData.stage,
          photo_base64: bioData.photo_base64
        },
        text: `🚨 SUSPECTED ANOMALY TRIGGERED: ${flagName} - ${flagReason}`,
        action: 'ANOMALY_TRIGGERED'
      })
      notify(`🚨 Suspected Flag [${flagName}] logged for ${vId}! Viewable in Investigation Cases.`)
    }
  }

  const isFaceOutCompleted = Boolean(
    biometricData?.stage === 'FACE_OUT' || 
    biometricData?.face_out_time || 
    biometricData?.duration ||
    (selectedVoter && (selectedVoter.has_voted || selectedVoter.attendance?.face_out))
  )

  const submitApplication = () => {
    if (!name.trim() || !addr.trim()) { 
      notify('Applicant name and declared address are required.')
      return 
    }
    const n = state.extraApps.length + 1
    const id = `APP-N${String(n).padStart(3, '0')}`
    const hasAnomaly = biometricData?.timing_anomaly?.flag && biometricData.timing_anomaly.flag !== 'NORMAL'
    const appRecord = {
      id, 
      name: name.trim(), 
      age: Number(age) || 18, 
      type, 
      previousBarangayId: null, 
      rawAddress: addr.trim(),
      submittedAt: new Date().toISOString(), 
      submittedVia: 'Walk-in', 
      batchId: null, 
      supportingDoc: null, 
      yearsAtAddress: undefined, 
      synthetic: false,
      photo_base64: biometricData?.photo_base64 || selectedVoter?.photo_base64 || null,
      issue: hasAnomaly ? biometricData.timing_anomaly.flag : null,
      timing_anomaly: hasAnomaly ? biometricData.timing_anomaly : null,
      duration_formatted: biometricData?.duration,
      label: hasAnomaly ? 'High' : 'Moderate',
      score: hasAnomaly ? 95 : 35,
      biometrics: biometricData ? {
        enrolled: true,
        voter_id: biometricData.voter_id,
        vin: biometricData.vin,
        hash: biometricData.biometric_hash,
        status: biometricData.status
      } : (selectedVoter ? {
        enrolled: true,
        voter_id: selectedVoter.voter_id,
        vin: selectedVoter.vin,
        hash: `VERIFIED-1:1:${selectedVoter.voter_id}`,
        status: 'VERIFIED'
      } : null),
      document: file ? { 
        filename: file.name, 
        scanQuality: 0.8, 
        pages: 1, 
        embedding: simulatedEmbeddingFromFile(file.name, file.size), 
        simulatedFromFile: true 
      } : null,
    }

    dispatch({
      type: 'addApp',
      app: appRecord,
    })

    // Automatically open a case in the Investigation Queue
    dispatch({
      type: 'caseUpdate',
      id,
      patch: { 
        status: hasAnomaly ? 'Under Review' : 'New',
        suspectedFlag: hasAnomaly ? biometricData.timing_anomaly.flag : null,
        timing_anomaly: appRecord.timing_anomaly,
        duration: appRecord.duration_formatted,
        photo_base64: appRecord.photo_base64
      },
      text: hasAnomaly 
        ? `🚨 Suspected ${biometricData.timing_anomaly.flag} logged during biometric intake.`
        : `Biometric registration application queued for review.`,
      action: hasAnomaly ? 'ANOMALY_TRIGGERED' : 'CASE_OPENED'
    })

    notify(`${id} biometric profile indexed and forwarded to ERB case queue.`)
    setName('')
    setFile(null)
    setPreview(null)
    setBiometricData(null)
    setSelectedVoter(null)
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => openApp(id), 150)
  }

  const handleEnrollMockCitizen = async (e) => {
    e.preventDefault()
    if (!enrollName.trim()) {
      alert('Please enter citizen name.')
      return
    }
    if (!enrollPhoto) {
      alert('Please snap a live photo with the camera before enrolling.')
      return
    }
    setEnrolling(true)
    try {
      const citizenAge = Number(enrollAge) || 24
      const decAddr = enrollDeclaredAddress.trim() || '2401 Taft Ave, Malate (DLSU Ward), Manila'
      const resp = await registerComelecVoter({
        name: enrollName.trim(),
        precinct_id: enrollPrecinct,
        barangay: enrollPrecinct,
        declared_address: decAddr,
        age: citizenAge,
        birthdate: '2001-05-15',
        photo_base64: enrollPhoto
      })
      await fetchVoters()

      // Synchronize into application store & open investigation case
      const vId = resp?.voter_id || `VOTER-MOCK-${Date.now().toString(36).toUpperCase()}`
      const newCitizenApp = {
        id: vId,
        vin: resp?.vin || `VIN-${Date.now()}`,
        name: enrollName.trim(),
        age: citizenAge,
        type: 'COMELEC Enrolled Citizen',
        previousBarangayId: null,
        rawAddress: decAddr,
        declared_address: decAddr,
        submittedAt: new Date().toISOString(),
        submittedVia: 'COMELEC Biometric Enrollment',
        batchId: null,
        supportingDoc: { type: 'COMELEC Mock Voter ID', barangayId: 'MAL' },
        yearsAtAddress: 4,
        synthetic: false,
        photo_base64: enrollPhoto,
        biometrics: {
          enrolled: true,
          voter_id: vId,
          vin: resp?.vin,
          hash: resp?.biometric_hash || 'SHA256:LOCAL_RAM',
          status: resp?.registration_status || 'ACTIVE_VERIFIED'
        },
        document: null,
        isComelecEnrolled: true,
        label: 'Moderate',
        score: 45
      }

      // Automatically auto-fill into Biometrics form so no re-typing is needed
      setSelectedVoter({
        ...newCitizenApp,
        voter_id: vId,
        declared_address: decAddr,
        precinct_id: enrollPrecinct
      })
      setName(enrollName.trim())
      setAge(citizenAge)
      setAddr(decAddr)
      dispatch({ type: 'addApp', app: newCitizenApp })
      dispatch({
        type: 'caseUpdate',
        id: vId,
        patch: { status: 'New', photo_base64: enrollPhoto },
        text: `Citizen ${enrollName} enrolled with official COMELEC ID (${vId}). Case registered in queue.`,
        action: 'CASE_OPENED'
      })

      setShowEnrollModal(false)
      setEnrollName('')
      setEnrollPhoto(null)
      stopEnrollCamera()
      notify(`Citizen ${enrollName} successfully enrolled (${vId}) and queued in Investigation Cases!`)
    } catch (err) {
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        alert('Enrollment failed: Cannot reach the Biometric Engine on http://127.0.0.1:8000. Please ensure the backend is running (double-click start_backend.bat or start_all.bat).')
      } else {
        alert('Enrollment failed: ' + err.message)
      }
    } finally {
      setEnrolling(false)
    }
  }

  const handleClearRegistry = async () => {
    if (!confirm('⚠️ Reset COMELEC mock database? All mock records and biometric vectors will be wiped.')) return
    try {
      await clearAllComelecVoters()
      await fetchVoters()
      setSelectedVoter(null)
      dispatch({ type: 'purgeAllStorage' })
      notify('Mock voter database, browser storage, and investigation test cases completely cleared.')
    } catch (err) {
      alert('Error clearing registry: ' + err.message)
    }
  }

  function generateAvatarCanvas(nameText) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#38bdf8'
    ctx.font = 'bold 80px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const initials = nameText.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CIT'
    ctx.fillText(initials, 128, 128)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  const ac = live.components
  const filteredVoters = comelecVoters.filter(v => 
    !registrySearch || 
    `${v.name} ${v.vin} ${v.voter_id} ${v.precinct_id}`.toLowerCase().includes(registrySearch.toLowerCase())
  )

  return (
    <div className="page">
      <PageHead title="Identification Analysis" feature="Dual-Face Biometrics | Forensic Analysis">
        AI-powered biometric attendance and signature forensics to intercept flying voters, impostors, and forged registrations.
      </PageHead>
      <SyntheticBanner />

      <Tabs 
        value={tab} 
        onChange={setTab} 
        tabs={[
          { id: 'facial', label: 'Dual-Face Biometrics & Pacing AI', icon: ScanFace },
          { id: 'signature', label: 'Forensic Signature Validation', icon: PenTool },
          { id: 'handwriting', label: 'Handwriting Batch Forgery Analysis', icon: PenTool }
        ]} 
      />

      {/* ----------------- TAB 1: FACIAL RECOGNITION & BIOMETRIC INTAKE ----------------- */}
      {tab === 'facial' && (
        <div className="grid g2">
          <Card title="Biometric Intake & 1:1 Identity Verification" sub="100% Local AI in RAM • Zero Cloud Storage">
            <div className="grid" style={{ gap: 12 }}>
              {/* COMELEC Staff Voter Picker */}
              <div style={{
                padding: '14px 16px',
                background: 'var(--panel2)',
                border: '1.5px solid var(--border)',
                borderRadius: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13, color: 'var(--blue)' }}>
                    <IdCard size={18} />
                    <span>COMELEC Staff: Pick Registered Citizen to Verify</span>
                  </span>
                  {selectedVoter && (
                    <button
                      type="button"
                      className="chip small"
                      onClick={() => {
                        setSelectedVoter(null)
                        setName('')
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      ✕ Clear Selection
                    </button>
                  )}
                </div>

                {comelecVoters.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <select
                      value={selectedVoter?.voter_id || ''}
                      onChange={(e) => {
                        const found = comelecVoters.find(v => v.voter_id === e.target.value)
                        setSelectedVoter(found || null)
                        if (found) {
                          setName(found.name)
                          setAge(found.age || 24)
                          setAddr(found.declared_address || found.rawAddress || found.barangay || `Purok 1, ${found.precinct_id}`)
                        } else {
                          setName('')
                        }
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: 13,
                        background: 'var(--panel)',
                        border: '1.5px solid var(--border)',
                        color: 'var(--text)'
                      }}
                    >
                      <option value="">-- Choose Voter from COMELEC Database --</option>
                      {comelecVoters.map((v) => (
                        <option key={v.voter_id} value={v.voter_id}>
                          {v.name} ({v.vin || v.voter_id}) — {v.precinct_id}
                        </option>
                      ))}
                    </select>

                    {/* Selected Voter Info Card */}
                    {selectedVoter && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(34, 197, 94, 0.08)',
                        border: '1.5px solid rgba(34, 197, 94, 0.35)',
                        padding: '10px 14px',
                        borderRadius: 10,
                        flexWrap: 'wrap',
                        gap: 10
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {selectedVoter.photo_base64 && (
                            <img
                              src={selectedVoter.photo_base64}
                              alt={selectedVoter.name}
                              style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '2px solid #22c55e', flexShrink: 0 }}
                            />
                          )}
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 13, color: '#15803d' }}>
                              {selectedVoter.name}
                            </div>
                            <div className="mono muted" style={{ fontSize: 11 }}>
                              VIN: {selectedVoter.vin || selectedVoter.voter_id} • Age: {selectedVoter.age || 24}
                            </div>
                            <div className="small muted" style={{ fontSize: 10 }}>
                              Assigned Precinct: <b>{selectedVoter.precinct_id}</b>
                            </div>
                          </div>
                        </div>
                        <Badge tone="low">Ready for Biometrics</Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1.5px dashed #f87171',
                    borderRadius: 10,
                    color: '#991b1b',
                    fontSize: 12
                  }}>
                    ⚠️ No registered voters found. Please enroll voters in the <b>COMELEC Registry</b> tab or upload a photo in the camera below.
                  </div>
                )}
              </div>

              {/* LIVE BIOMETRIC WEBCAM / UPLOAD COMPONENT */}
              <BiometricIntakeCapture
                applicantName={name}
                barangay={ac.barangay || 'Sampagita'}
                selectedVoter={selectedVoter}
                registryCount={comelecVoters.length}
                onGoToRegistry={() => setTab('registry')}
                onBiometricChange={handleBiometricChange}
                disabled={!perm.canEdit}
              />

              <div>
                <button 
                  className={`btn ${isFaceOutCompleted ? 'primary' : ''}`} 
                  disabled={!perm.canEdit || !isFaceOutCompleted} 
                  onClick={submitApplication} 
                  title={
                    !perm.canEdit 
                      ? 'Requires ERB Reviewer role' 
                      : !isFaceOutCompleted 
                        ? 'Submit disabled: Please complete Step 2 (Face OUT) biometric verification first.' 
                        : ''
                  }
                  style={{ 
                    width: '100%', 
                    padding: '12px 16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: 8,
                    cursor: !isFaceOutCompleted ? 'not-allowed' : 'pointer',
                    background: !isFaceOutCompleted ? '#94a3b8' : undefined,
                    color: !isFaceOutCompleted ? '#f8fafc' : undefined,
                    opacity: !isFaceOutCompleted ? 0.6 : 1,
                    fontWeight: 700
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    {isFaceOutCompleted 
                      ? '✓ Submit Biometric Application & Screen' 
                      : '🔒 Submit Biometric (Grayed: Awaiting 2nd Face Verification)'}
                  </span>
                </button>
                {!isFaceOutCompleted && (
                  <div className="small muted" style={{ textAlign: 'center', marginTop: 6, color: 'var(--mod)' }}>
                    ⚠️ Note: Both <b>Face IN</b> (Intake) and <b>Face OUT</b> (Ballot feed) must be completed before submission.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Address Standardization & Identity Evidence" sub="Live preview - rule-based normalizer">
            <dl className="kv">
              <dt>Original</dt><dd className="mono">{live.original || '—'}</dd>
              <dt>Normalized</dt><dd><b>{live.normalized}</b></dd>
              <dt>Status</dt>
              <dd>
                <Badge tone={live.status === 'Resolved' ? 'low' : live.status === 'Partial' ? 'mod' : 'high'}>
                  {live.status}
                </Badge>{' '}
                <span className="muted small">parsing confidence {Math.round(live.confidence * 100)}%</span>
              </dd>
              <dt>Barangay match</dt><dd>{ac.barangay || '—'} <span className="muted small">({live.matchType})</span></dd>
              <dt>Components</dt>
              <dd className="small">
                Street: {ac.street || '—'} | Purok: {ac.purok || '—'} | Sitio: {ac.sitio || '—'} | Building: {ac.building || '—'}
              </dd>
              <dt>Geocoding</dt>
              <dd>
                {live.coords ? (
                  <>
                    {live.coords[0].toFixed(5)}, {live.coords[1].toFixed(5)}{' '}
                    <span className="muted small">({live.precision}: {live.precisionBasis})</span>{' '}
                    <SimBadge>Offline gazetteer</SimBadge>
                  </>
                ) : (
                  <span className="muted">Not geocoded - manual review required</span>
                )}
              </dd>
            </dl>

            <div style={{ marginTop: 12 }}>
              {live.warnings.length ? (
                live.warnings.map((w, i) => <div key={i} className={`warn ${w.level}`}>- {w.text}</div>)
              ) : (
                <div className="warn info">No address validation warnings.</div>
              )}
            </div>

            {selectedVoter && (
              <div style={{ marginTop: 16, padding: 12, background: 'var(--panel2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div className="small muted" style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IdCard size={14} />
                  <span>COMELEC REGISTRY COMPARISON TARGET</span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {selectedVoter.photo_base64 && (
                    <img 
                      src={selectedVoter.photo_base64} 
                      alt="Registered target" 
                      style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} 
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 700 }}>{selectedVoter.name}</div>
                    <div className="mono small text-muted">{selectedVoter.vin}</div>
                    <div className="small muted">{selectedVoter.precinct_id}</div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ----------------- TAB: SIGNATURE INTELLIGENCE & COLLUSION ----------------- */}
      {tab === 'signature' && <SignatureArena />}

      {/* ENROLL MOCK CITIZEN MODAL */}
      {showEnrollModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 18, maxWidth: 440, width: '100%', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <IdCard size={18} />
                <span>Enroll Mock Citizen ID</span>
              </h3>
              <button className="chip small" onClick={() => setShowEnrollModal(false)}><X size={14} /></button>
            </div>

            <form onSubmit={handleEnrollMockCitizen} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Citizen Full Name</label>
                <input 
                  type="text" 
                  value={enrollName} 
                  onChange={(e) => setEnrollName(e.target.value)} 
                  placeholder="e.g. Maria Santos" 
                  required 
                />
              </div>

              <div className="field">
                <label>Registered Precinct</label>
                <select value={enrollPrecinct} onChange={(e) => setEnrollPrecinct(e.target.value)}>
                  {PRECINCTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Citizen Age</label>
                <input 
                  type="number" 
                  min="18" 
                  max="120" 
                  value={enrollAge} 
                  onChange={(e) => setEnrollAge(e.target.value)} 
                  required 
                />
              </div>

              <div className="field">
                <label style={{ fontWeight: 700, color: 'var(--blue)' }}>Declared Address (Residence / Street)</label>
                <input 
                  type="text" 
                  value={enrollDeclaredAddress} 
                  onChange={(e) => setEnrollDeclaredAddress(e.target.value)} 
                  placeholder="e.g. 2401 Taft Ave / Fidel Reyes St, Malate, Manila" 
                  required 
                />
                <div className="small muted" style={{ marginTop: 2 }}>
                  ✓ This declared address auto-fills automatically in Biometric Intake without re-typing.
                </div>
              </div>

              <div className="field">
                <label>Official Biometric Photo (Live Camera Only)</label>
                
                {enrollPhoto ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--panel2)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ width: 84, height: 84, borderRadius: 10, overflow: 'hidden', border: '2px solid #22c55e', background: '#000', flexShrink: 0 }}>
                      <img src={enrollPhoto} alt="Captured Citizen" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={14} /> Live Portrait Captured
                      </div>
                      <div className="small muted" style={{ margin: '4px 0 8px 0' }}>Ready for 512-D vector indexing in local RAM.</div>
                      <button 
                        type="button" 
                        className="chip small" 
                        onClick={() => { setEnrollPhoto(null); startEnrollCamera(); }}
                      >
                        🔄 Retake Live Photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: 170, height: 170, margin: '0 auto 10px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #38bdf8', background: '#000' }}>
                      <video
                        ref={enrollVideoRef}
                        playsInline
                        autoPlay
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="btn primary small"
                        onClick={snapEnrollPhoto}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Camera size={14} />
                        <span>📸 Snap Live Citizen Photo</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => setShowEnrollModal(false)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={enrolling}>
                  {enrolling ? 'Enrolling...' : 'Generate Official ID Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
