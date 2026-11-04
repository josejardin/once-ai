import React, { useState, useRef, useEffect, useMemo } from 'react'
import { 
  PenTool, ShieldCheck, AlertTriangle, CheckCircle2, 
  RotateCcw, Sparkles, UserCheck, Users, ArrowRight,
  ExternalLink, Layers, Search
} from 'lucide-react'
import SignaturePad from './SignaturePad.jsx'
import { 
  extractSignatureGridFromCanvas, 
  computeSignatureSimilarity,
  verifySignatureLocally, 
  verifySignatureHybrid,
  SELF_MATCH_THRESHOLD,
  COLLISION_THRESHOLD
} from '../lib/signatureEngine.js'
import { useApp } from '../store.jsx'
import { Badge, Card } from './ui.jsx'

// Pre-defined realistic signature paths for seed voters
const PRESET_PATHS = {
  // Juan Dela Cruz's signature: cursive 'J. Dela Cruz' style
  juan: [
    "M 40 80 Q 70 30 90 70 T 80 130 Q 70 160 50 140",
    "M 75 80 Q 120 75 140 82",
    "M 145 70 Q 155 110 175 85 Q 190 65 195 100",
    "M 198 88 Q 230 84 250 86 Q 270 90 280 110",
    "M 285 75 Q 310 115 330 80 Q 345 60 360 90",
    "M 50 145 Q 180 135 370 120"
  ],
  // Maria Santos's signature: looping 'M. Santos' style with distinctive treble loop
  maria: [
    "M 50 120 L 70 50 L 90 110 L 115 45 L 130 115",
    "M 140 100 Q 165 70 185 105 T 205 100",
    "M 215 95 Q 240 60 260 95 Q 275 115 295 90",
    "M 300 85 Q 320 85 335 105",
    "M 45 135 Q 200 150 350 125"
  ],
  // Random / inconsistent scribble: erratic spikes
  scribble: [
    "M 60 110 L 90 60 L 110 120 L 140 70 L 170 125",
    "M 180 115 Q 220 90 240 120",
    "M 250 80 L 270 130 L 290 85 L 320 120",
    "M 70 140 L 330 140"
  ],
  // Single straight line / lazy mark
  line: [
    "M 70 100 L 390 100"
  ]
}

function drawPathsOnCanvas(canvas, paths, strokeColor = '#1e293b') {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  paths.forEach((pStr) => {
    const p = new Path2D(pStr)
    ctx.stroke(p)
  })
}

export default function SignatureArena() {
  const { result, state, dispatch, notify, openApp } = useApp()
  const [pairSel, setPairSel] = useState(0)
  const cfg = state?.config
  const pairs = result?.handwriting?.pairs || []
  const padRef = useRef(null)

  // Demo Enrolled Registry
  const [registry, setRegistry] = useState([
    {
      id: 'VTR-1044',
      name: 'Juan Dela Cruz',
      precinct: 'Precinct 101 - Manila',
      barangay: 'Barangay Malate',
      paths: PRESET_PATHS.juan,
      grid: null,
      dataUrl: null
    },
    {
      id: 'VTR-2089',
      name: 'Maria Santos',
      precinct: 'Precinct 202 - Quezon City',
      barangay: 'Barangay Sampaguita',
      paths: PRESET_PATHS.maria,
      grid: null,
      dataUrl: null
    },
    {
      id: 'VTR-3105',
      name: 'Antonio Luna',
      precinct: 'Precinct 303 - Makati',
      barangay: 'Barangay Ermita',
      paths: PRESET_PATHS.scribble,
      grid: null,
      dataUrl: null
    }
  ])

  const [selectedVoterId, setSelectedVoterId] = useState('VTR-1044')
  const [verdict, setVerdict] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [caseCreated, setCaseCreated] = useState(false)

  // Initialize seed baseline grids
  useEffect(() => {
    const updated = registry.map((voter) => {
      const c = document.createElement('canvas')
      c.width = 460
      c.height = 180
      drawPathsOnCanvas(c, voter.paths)
      const grid = extractSignatureGridFromCanvas(c)
      const dataUrl = c.toDataURL('image/png')

      // Also silently register to backend if available
      fetch('http://127.0.0.1:8000/api/signatures/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voter_id: voter.id,
          name: voter.name,
          signature_base64: dataUrl
        })
      }).catch(() => {})

      return { ...voter, grid, dataUrl }
    })
    setRegistry(updated)
  }, [])

  const currentVoter = useMemo(
    () => registry.find((v) => v.id === selectedVoterId) || registry[0],
    [registry, selectedVoterId]
  )

  // Evaluate signature drawn on canvas
  const evaluateSignature = async (canvas, isEmpty = false) => {
    if (isEmpty || !canvas) {
      setVerdict(null)
      return
    }

    setAnalyzing(true)
    setCaseCreated(false)

    try {
      const result = await verifySignatureHybrid({
        currentVoterId: selectedVoterId,
        canvas,
        registry
      })
      setVerdict(result)
    } catch (e) {
      console.error(e)
    } finally {
      setAnalyzing(false)
    }
  }

  // Pitch Preset Handlers
  const handlePresetAuthentic = () => {
    const canvas = padRef.current?.getCanvas()
    if (!canvas) return
    drawPathsOnCanvas(canvas, currentVoter.paths)
    padRef.current?.loadFromDataURL(canvas.toDataURL())
    evaluateSignature(canvas, false)
  }

  const handlePresetInconsistent = () => {
    const canvas = padRef.current?.getCanvas()
    if (!canvas) return
    drawPathsOnCanvas(canvas, PRESET_PATHS.scribble)
    padRef.current?.loadFromDataURL(canvas.toDataURL())
    evaluateSignature(canvas, false)
  }

  const handlePresetFixerCollision = () => {
    const canvas = padRef.current?.getCanvas()
    if (!canvas) return
    // Draw Maria Santos's signature while claiming to be Juan Dela Cruz
    const otherPaths = selectedVoterId === 'VTR-2089' ? PRESET_PATHS.juan : PRESET_PATHS.maria
    drawPathsOnCanvas(canvas, otherPaths)
    padRef.current?.loadFromDataURL(canvas.toDataURL())
    evaluateSignature(canvas, false)
  }

  const handlePresetSingleLine = () => {
    const canvas = padRef.current?.getCanvas()
    if (!canvas) return
    drawPathsOnCanvas(canvas, PRESET_PATHS.line)
    padRef.current?.loadFromDataURL(canvas.toDataURL())
    evaluateSignature(canvas, false)
  }

  // Escalate to ERB Dossier
  const handleEscalateToDossier = () => {
    if (!verdict) return

    const caseId = `SIG-${selectedVoterId}`
    const noteText = `[ERB FORENSIC ALERT] Signature anomaly flagged for ${currentVoter.name} (${selectedVoterId}). ` +
      `Verdict: ${verdict.badge}. Reason: ${verdict.reason} (Self-Match: ${verdict.selfScore}%, Collision: ${verdict.collisionScore}%).`

    dispatch({
      type: 'logView',
      action: 'SIGNATURE_ANOMALY_ESCALATED',
      target: selectedVoterId,
      detail: noteText
    })

    setCaseCreated(true)
    notify(`Case escalated to ERB Dossier! Audit ID: ${verdict.auditId}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header Card */}
      <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--primary, #d92d20)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <PenTool size={20} color="var(--primary, #d92d20)" />
              Forensic Signature Intelligence & Duplicate Collision Arena
            </h3>
            <p className="muted small" style={{ margin: '4px 0 0 0' }}>
              Dual-Layer Biometric Verification: 1:1 Identity Consistency & 1:N Cross-User "Fixer" Duplicate Detection.
            </p>
          </div>
          <span className="badge info" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <ShieldCheck size={14} /> Edge Normalized Vector (48x48)
          </span>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1.4fr)', gap: 20 }}>
        
        {/* Left Column: Voter Selector & Baseline Profile */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserCheck size={16} /> Select Registered Citizen Under Review
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {registry.map((voter) => {
                const isSelected = voter.id === selectedVoterId
                return (
                  <div
                    key={voter.id}
                    onClick={() => {
                      setSelectedVoterId(voter.id)
                      padRef.current?.clear()
                      setVerdict(null)
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: isSelected ? '2px solid var(--primary, #d92d20)' : '1px solid var(--border, #e2e8f0)',
                      backgroundColor: isSelected ? 'rgba(217, 45, 32, 0.04)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ fontSize: '0.92rem' }}>{voter.name}</b>
                      <span className="badge" style={{ fontSize: '0.72rem' }}>{voter.id}</span>
                    </div>
                    <div className="muted small" style={{ marginTop: 2 }}>{voter.precinct}</div>
                    <div className="muted small" style={{ fontSize: '0.75rem' }}>{voter.barangay}</div>
                  </div>
                )
              })}
            </div>

            {/* Baseline Signature on File */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="small muted">Official Signature on File (Baseline):</span>
                <span className="badge good" style={{ fontSize: '0.7rem' }}>Enrolled</span>
              </div>
              <div
                style={{
                  height: 90,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}
              >
                {currentVoter.dataUrl ? (
                  <img
                    src={currentVoter.dataUrl}
                    alt={`${currentVoter.name} signature`}
                    style={{ maxHeight: '85%', maxWidth: '90%', objectFit: 'contain' }}
                  />
                ) : (
                  <span className="muted small">Generating baseline vector...</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Pitch Demo Scenarios */}
          <div className="card" style={{ padding: 16, backgroundColor: 'var(--subtle, #f8fafc)' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={16} color="#d92d20" /> 1-Click Pitch Demonstration Presets
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handlePresetAuthentic}
                style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span><b>1. Legitimate Voter</b> ({currentVoter.name} signs authentic)</span>
                <span className="badge good" style={{ fontSize: '0.7rem' }}>PASS</span>
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={handlePresetInconsistent}
                style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span><b>2. Inconsistent Signature</b> (Random / Poor Scribble)</span>
                <span className="badge warn" style={{ fontSize: '0.7rem' }}>FLAGGED</span>
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={handlePresetFixerCollision}
                style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span><b>3. "Fixer" Collusion</b> (Form signed by Maria Santos)</span>
                <span className="badge bad" style={{ fontSize: '0.7rem' }}>COLLISION</span>
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={handlePresetSingleLine}
                style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span><b>4. Just a Line</b> (Lazy straight stroke mark)</span>
                <span className="badge warn" style={{ fontSize: '0.7rem' }}>FLAGGED</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Test Canvas & Live Forensic Decision */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <PenTool size={16} /> Candidate Signature Intake
              </h4>
              <span className="muted small">Draw or click a preset above</span>
            </div>

            {/* Signature Pad */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SignaturePad
                ref={padRef}
                width={480}
                height={170}
                placeholder={`Sign as ${currentVoter.name}...`}
                onStrokeEnd={evaluateSignature}
              />
            </div>

            {/* Live Forensic Analysis Result */}
            {verdict && (
              <div
                style={{
                  marginTop: 18,
                  padding: 16,
                  borderRadius: 8,
                  border: `1.5px solid ${
                    verdict.status === 'VERIFIED' ? '#10b981' : verdict.status === 'COLLISION' ? '#ef4444' : '#f59e0b'
                  }`,
                  backgroundColor:
                    verdict.status === 'VERIFIED'
                      ? 'rgba(16, 185, 129, 0.05)'
                      : verdict.status === 'COLLISION'
                      ? 'rgba(239, 68, 68, 0.05)'
                      : 'rgba(245, 158, 11, 0.05)'
                }}
              >
                {/* Decision Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span
                    className={`badge ${verdict.badgeClass}`}
                    style={{ fontSize: '0.85rem', padding: '5px 12px', fontWeight: 700 }}
                  >
                    {verdict.badge}
                  </span>
                  <span className="muted small" style={{ fontSize: '0.72rem' }}>
                    {verdict.source || 'Local Edge Engine'}
                  </span>
                </div>

                {/* Score Meters */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div style={{ backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                      <span className="muted">Self-Consistency:</span>
                      <b style={{ color: verdict.selfScore >= SELF_MATCH_THRESHOLD ? '#10b981' : '#f59e0b' }}>
                        {verdict.selfScore}%
                      </b>
                    </div>
                    <div style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${verdict.selfScore}%`,
                          height: '100%',
                          backgroundColor: verdict.selfScore >= SELF_MATCH_THRESHOLD ? '#10b981' : '#f59e0b',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                    <div className="muted small" style={{ fontSize: '0.68rem', marginTop: 3 }}>
                      Req: {SELF_MATCH_THRESHOLD}% match
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                      <span className="muted">Cross-Registry Collision:</span>
                      <b style={{ color: verdict.collisionScore >= COLLISION_THRESHOLD ? '#ef4444' : '#10b981' }}>
                        {verdict.collisionScore}%
                      </b>
                    </div>
                    <div style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${verdict.collisionScore}%`,
                          height: '100%',
                          backgroundColor: verdict.collisionScore >= COLLISION_THRESHOLD ? '#ef4444' : '#10b981',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                    <div className="muted small" style={{ fontSize: '0.68rem', marginTop: 3 }}>
                      Max Threshold: {COLLISION_THRESHOLD}%
                    </div>
                  </div>
                </div>

                {/* Forensic Reason Details */}
                <p style={{ margin: '0 0 12px 0', fontSize: '0.84rem', lineHeight: 1.45, color: '#334155' }}>
                  {verdict.reason}
                </p>

                {/* Action Trigger for ERB Review */}
                {verdict.requiresReview && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <span className="small muted">Investigation required by ERB officer.</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleEscalateToDossier}
                      disabled={caseCreated}
                    >
                      {caseCreated ? (
                        <>
                          <CheckCircle2 size={14} /> Escalated to ERB Dossier
                        </>
                      ) : (
                        <>
                          <ArrowRight size={14} /> Escalate to Investigation Case
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    
      {/* POTENTIALLY RELATED APPLICATIONS (BATCH FORGERY / COLLUSION RADAR) */}
      <div style={{ marginTop: 24 }}>
        <Card title="Potentially related applications" sub={`${pairs.length} pairs ≥ ${cfg?.hwThreshold || 0.85} · ${result?.handwriting?.groups?.length || 0} groups`}>
          <div className="tablewrap" style={{ maxHeight: 380 }}>
            <table>
              <thead>
                <tr><th>Form A</th><th>Form B</th><th>Similarity</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {pairs.map((p, i) => (
                  <tr 
                    key={p.a + p.b} 
                    className={`click ${i === pairSel ? 'sel' : ''}`} 
                    onClick={() => setPairSel(i)} 
                    tabIndex={0} 
                    onKeyDown={(e) => e.key === 'Enter' && setPairSel(i)}
                  >
                    <td className="mono"><b>{p.a}</b></td>
                    <td className="mono"><b>{p.b}</b></td>
                    <td className="mono"><b>{p.sim.toFixed(3)}</b></td>
                    <td className="small">{p.lowQuality ? <Badge tone="mod">low scan quality</Badge> : <Badge tone="high">flagged</Badge>}</td>
                  </tr>
                ))}
                {!pairs.length && <tr><td colSpan="4" className="muted" style={{ textAlign: 'center', padding: 14 }}>No pairs reach the threshold.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="row small" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
            {(result?.handwriting?.groups || []).map((g) => (
              <Badge key={g.id} tone="sim" title={g.ids.join(', ')}>{g.id}: {g.ids.length} forms</Badge>
            ))}
          </div>
        </Card>
      </div>
  </div>
  )
}
