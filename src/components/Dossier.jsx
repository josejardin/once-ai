import React, { useState } from 'react'
import { useApp } from '../store.jsx'
import { CASE_STATUSES, DISPOSITIONS, INDICATORS, caseOf } from '../lib/pipeline.js'
import { getBarangay } from '../lib/gazetteer.js'
import { Badge, RiskBadge, SimBadge, ScoreBar, fmtDate, fmtTime } from './ui.jsx'
import { HandwritingSample } from './Handwriting.jsx'
import { download, escapeHtml, DISCLAIMER } from '../lib/export.js'
import { MapPin, AlertTriangle, AlertOctagon, Clock, UserCheck, Trash2 } from 'lucide-react'

const REVIEW = ['Unreviewed', 'Concern noted', 'Dismissed after review']
const tone = { Triggered: 'mod', 'Mitigated by context': 'info', 'Not triggered': 'low', 'Not assessable': 'off' }

export function buildDossier(app, cs, ir, audit) {
  return {
    generatedAt: new Date().toISOString(),
    notice: DISCLAIMER,
    application: { reference: app.id, name: app.name, age: app.age, type: app.type, submittedAt: app.submittedAt, submittedVia: app.submittedVia, batchId: app.batchId, yearsAtAddress: app.yearsAtAddress, synthetic: !!app.synthetic },
    address: { original: app.addr.original, standardized: app.addr.normalized, components: app.addr.components, precision: app.addr.precision, basis: app.addr.precisionBasis, coordinates: app.addr.coords, parsingConfidence: app.addr.confidence, status: app.addr.status, warnings: app.addr.warnings },
    screening: { priorityScore: app.score, priorityLabel: app.label, labelNote: 'Review priority only; not a probability of fraud and not a finding of guilt.', indicators: INDICATORS.map((d) => ({ indicator: d.label, ...app.indicators[d.key], reviewStatus: ir[`${app.id}:${d.key}`] || 'Unreviewed' })) },
    geographicAnalysis: app.cluster ? { clusterId: app.cluster.id, size: app.cluster.size, status: app.cluster.status, context: app.cluster.contextText, factors: app.cluster.factors } : null,
    handwritingSimilarity: { simulated: true, related: app.related },
    supportingDocument: app.supportingDoc ? { type: app.supportingDoc.type, barangay: getBarangay(app.supportingDoc.barangayId).name } : null,
    case: { status: cs.status, disposition: cs.disposition, rationale: cs.rationale, notes: cs.notes, history: cs.history },
    auditTrail: audit.filter((e) => e.target === app.id || e.target.startsWith(app.id + ':')),
  }
}

export function dossierHtml(d) {
  const kv = (o) => Object.entries(o).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Audit Dossier ${escapeHtml(d.application.reference)}</title><style>body{font:14px/1.5 Montserrat,Segoe UI,Arial,sans-serif;max-width:860px;margin:30px auto;color:#111}h1{font-size:20px}h2{font-size:15px;border-bottom:1px solid #999;margin-top:22px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}th{width:200px;background:#f1f1f1}.n{background:#fff6d6;border:1px solid #d9ac2b;padding:8px;font-size:12px}</style></head><body>
<h1>ONCE AI - Secure Audit Dossier: ${escapeHtml(d.application.reference)}</h1><div class="n">${escapeHtml(d.notice)}</div>
<p>Generated ${escapeHtml(d.generatedAt)}</p>
<h2>Application</h2><table>${kv(d.application)}</table>
<h2>Address standardization</h2><table>${kv({ original: d.address.original, standardized: d.address.standardized, precision: d.address.precision + ' (' + d.address.basis + ')', status: d.address.status, 'parsing confidence (heuristic)': d.address.parsingConfidence })}</table>
<h2>Screening: priority ${escapeHtml(d.screening.priorityLabel)} (score ${d.screening.priorityScore})</h2><p>${escapeHtml(d.screening.labelNote)}</p>
<table>${d.screening.indicators.map((i) => `<tr><th>${escapeHtml(i.indicator)}</th><td><b>${escapeHtml(i.result)}</b> - review: ${escapeHtml(i.reviewStatus)}<br>${escapeHtml(i.explanation)}</td></tr>`).join('')}</table>
${d.geographicAnalysis ? `<h2>Geographic analysis</h2><table>${kv({ cluster: d.geographicAnalysis.clusterId, size: d.geographicAnalysis.size, status: d.geographicAnalysis.status, context: d.geographicAnalysis.context })}</table>` : ''}
<h2>Handwriting similarity (simulated)</h2><p>${d.handwritingSimilarity.related.length ? d.handwritingSimilarity.related.map((r) => `${escapeHtml(r.id)} (${r.sim})`).join(', ') : 'No related forms above threshold.'}</p>
<h2>Case</h2><table>${kv({ status: d.case.status, disposition: d.case.disposition, rationale: d.case.rationale })}</table>
<h2>Reviewer notes</h2><ul>${d.case.notes.map((n) => `<li>${escapeHtml(n.ts)} [${escapeHtml(n.role)}] ${escapeHtml(n.text)}</li>`).join('') || '<li>None</li>'}</ul>
<h2>Review history</h2><ul>${d.case.history.map((n) => `<li>${escapeHtml(n.ts)} [${escapeHtml(n.role)}] ${escapeHtml(n.text)}</li>`).join('') || '<li>None</li>'}</ul>
<h2>Audit trail</h2><ul>${d.auditTrail.map((e) => `<li>#${e.id} ${escapeHtml(e.ts)} ${escapeHtml(e.action)} - ${escapeHtml(e.detail)} (hash ${escapeHtml(e.hash)})</li>`).join('') || '<li>None</li>'}</ul>
</body></html>`
}

export default function Dossier({ appId, appData, inline }) {
  const { result, state, dispatch, perm, openApp, notify } = useApp()
  const app = appData || result.byId[appId]
  const [note, setNote] = useState('')
  const [rationale, setRationale] = useState('')
  const [disp, setDisp] = useState('')
  if (!app) return <div className="muted">Application or citizen record not found.</div>
  const cs = caseOf(state.caseState, app.id)
  const ir = state.indicatorReview
  const locked = !perm.canEdit
  const setStatus = (status) => {
    if (status === 'Resolved') return
    dispatch({ type: 'caseUpdate', id: app.id, patch: { status }, text: `Case status changed from "${cs.status}" to "${status}"`, action: 'CASE_STATUS' })
  }
  const resolve = () => {
    if (!disp || !rationale.trim()) { notify('A final human disposition and written rationale are required to resolve a case.'); return }
    dispatch({ type: 'caseUpdate', id: app.id, patch: { status: 'Resolved', disposition: disp, rationale: rationale.trim() }, text: `Case resolved by a human reviewer. Disposition: ${disp}. Rationale: ${rationale.trim()}`, action: 'CASE_RESOLVED' })
    notify('Case resolved. Disposition recorded as a human decision.')
  }
  const exportJson = () => { download(`dossier-${app.id}.json`, 'application/json', JSON.stringify(buildDossier(app, cs, ir, state.audit), null, 2)); dispatch({ type: 'logView', action: 'DOSSIER_EXPORT', target: app.id, detail: 'Dossier exported as JSON' }) }
  const exportHtml = () => { download(`dossier-${app.id}.html`, 'text/html', dossierHtml(buildDossier(app, cs, ir, state.audit))); dispatch({ type: 'logView', action: 'DOSSIER_EXPORT', target: app.id, detail: 'Dossier exported as HTML' }) }
  const trail = state.audit.filter((e) => e.target === app.id || e.target.startsWith(app.id + ':')).slice().reverse()

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="muted small">Secure Audit Dossier {app.synthetic ? '- synthetic record' : '- live enrolled citizen record'}</div>
          <h1 className="mono" style={{ fontSize: 20 }}>{app.id}</h1>
        </div>
        <div className="row"><RiskBadge label={app.label} /><Badge tone="off">Score {app.score}/100</Badge></div>
      </div>
      <div className="banner" style={{ margin: '10px 0' }}>Review priority only. ONCE AI never approves, rejects or disqualifies a registration; the ERB and the appropriate election authority decide.</div>
      {app.cappedByRule && <div className="banner info small">Score is in the High range, but fewer than two independent indicators are triggered, so the label is capped at Moderate.</div>}

      {/* SUSPECTED ANOMALY ALERT BOX */}
      {(app.issue || app.timing_anomaly) && (
        <div className="sect" style={{ background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: 10, padding: 14, margin: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#991b1b', fontWeight: 800, fontSize: 14 }}>
            <AlertOctagon size={18} />
            <span>SUSPECTED BIOMETRIC / TIMING ANOMALY FLAGGED</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span><b>Suspected Flag:</b> <Badge tone="high">{app.issue || app.timing_anomaly?.flag}</Badge></span>
            {app.duration_formatted && <span><b>Recorded Voting Duration:</b> <code>{app.duration_formatted}</code></span>}
          </div>
          <div className="small" style={{ marginTop: 6, color: '#334155' }}>
            {app.timing_anomaly?.reason || 'AI Pacing detector caught a duration outlier outside normal learned bounds during attendance check-out.'}
          </div>
        </div>
      )}

      {/* DUAL-FACE ATTENDANCE LEDGER */}
      {app.attendance && (
        <div className="sect" style={{ background: 'var(--panel2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="#38bdf8" />
            <span>Dual-Face Attendance Record</span>
          </h3>
          <dl className="kv" style={{ fontSize: 12 }}>
            <dt>Face IN Intake</dt><dd className="mono">{app.attendance.face_in_timestamp || 'Completed at Precinct Intake'}</dd>
            <dt>Face OUT Check-Out</dt><dd className="mono">{app.attendance.face_out_timestamp || 'Completed at Ballot Box'}</dd>
            <dt>Total Voting Duration</dt><dd><b>{app.duration_formatted || app.attendance.duration || 'Recorded'}</b></dd>
            <dt>Ballot Serial Number</dt><dd className="mono">{app.attendance.ballot_serial || 'BALLOT-CEF1-ACTIVE'}</dd>
          </dl>
        </div>
      )}

      <div className="sect"><h3>Application</h3>
        <dl className="kv">
          <dt>Applicant</dt><dd>{app.name} (age {app.age}) {app.synthetic ? <Badge tone="sim">synthetic</Badge> : <Badge tone="info">live enrolled citizen</Badge>}</dd>
          <dt>Type</dt><dd>{app.type}{app.previousBarangayId && ` (from Barangay ${getBarangay(app.previousBarangayId)?.name || app.previousBarangayId})`}</dd>
          <dt>Submitted</dt><dd>{fmtDate(app.submittedAt)} via {app.submittedVia}{app.batchId && ` - batch ${app.batchId}`}</dd>
          <dt>Declared years at address</dt><dd>{app.yearsAtAddress || 'N/A'}</dd>
          <dt>Supporting document</dt><dd>{app.supportingDoc ? `${app.supportingDoc.type} (${app.supportingDoc.barangayId ? 'Barangay ' + (getBarangay(app.supportingDoc.barangayId)?.name || app.supportingDoc.barangayId) : 'National'})` : 'None on file'}</dd>
          {app.photo_base64 && (
            <>
              <dt>Biometric Facial ID</dt>
              <dd>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <img src={app.photo_base64} alt={app.name} style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1.5px solid var(--border)' }} />
                  <div>
                    <Badge tone="low">✓ Biometric Vector Indexed (RAM Only)</Badge>
                    <div className="mono small muted" style={{ marginTop: 2 }}>{app.biometrics?.hash || 'SHA256:LOCAL_RAM'}</div>
                  </div>
                </div>
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="sect"><h3>Address standardization <Badge tone="info">Rule-based</Badge></h3>
        <dl className="kv">
          <dt>Original</dt><dd className="mono">{app.addr?.original || app.rawAddress || 'Declared Address'}</dd>
          <dt>Standardized</dt><dd><b>{app.addr?.normalized || app.rawAddress || 'Standardized Address'}</b></dd>
          <dt>Location</dt><dd>{app.addr?.coords ? `${app.addr.coords[0].toFixed(5)}, ${app.addr.coords[1].toFixed(5)} - ${app.addr.precision || 'precinct'} precision (${app.addr.precisionBasis || 'DLSU Taft Sector'})` : 'Not geocoded'} <SimBadge>Offline gazetteer</SimBadge></dd>
          <dt>Status</dt><dd><Badge tone={app.addr?.status === 'Resolved' ? 'low' : app.addr?.status === 'Partial' ? 'mod' : 'high'}>{app.addr?.status || 'Resolved'}</Badge> <span className="muted small">parsing confidence {Math.round((app.addr?.confidence || 0.95) * 100)}% (heuristic)</span></dd>
        </dl>
        {(app.addr?.warnings || []).map((w, i) => <div key={i} className={`warn ${w.level}`}>- {w.text}</div>)}
      </div>

      <div className="sect"><h3>AI screening findings</h3>
        <div className="grid" style={{ gap: 8 }}>
          {INDICATORS.map((d) => {
            const x = app.indicators?.[d.key] || { key: d.key, severity: 0, result: 'Not assessable', explanation: 'No direct indicator data recorded.', evidence: [] }
            const k = `${app.id}:${d.key}`
            return (
              <div key={d.key} className={`ind ${x.result === 'Triggered' ? 'trig' : x.result === 'Mitigated by context' ? 'mit' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{d.label}</b>
                  <span className="row"><Badge tone={tone[x.result] || 'off'}>{x.result}</Badge>{x.severity > 0 && <span className="mono muted">severity {x.severity}</span>}</span>
                </div>
                <div className="small">{x.explanation}</div>
                {(x.evidence || []).length > 0 && <div className="row small"><span className="muted">Evidence:</span>{x.evidence.map((e, i) => e.type === 'app' ? <button key={i} className="chip mono" onClick={() => openApp(e.id)}>{e.id}{e.sim ? ` (${e.sim})` : ''}</button> : <span key={i} className="chip">{e.id || e.text}</span>)}</div>}
                <div className="row small"><span className="muted">Review status:</span>
                  <select style={{ width: 'auto' }} value={ir[k] || 'Unreviewed'} disabled={locked} onChange={(e) => dispatch({ type: 'indicatorReview', key: k, value: e.target.value })} aria-label={`Review status for ${d.label}`}>{REVIEW.map((r) => <option key={r}>{r}</option>)}</select>
                </div>
              </div>
            )
          })}
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>Priority score uses provisional demonstration weights; see AI Screening. <ScoreBar score={app.score} label={app.label} /></div>
      </div>

      {app.cluster && (
        <div className="sect"><h3>Geographic analysis (Manila Cluster)</h3>
          <dl className="kv"><dt>Cluster</dt><dd><span className="mono">{app.cluster.id}</span> - {app.cluster.size} applications within {app.cluster.radiusM} m - <Badge tone={app.cluster.status === 'Plausibly explained by context' ? 'info' : 'mod'}>{app.cluster.status}</Badge></dd></dl>
          <ul className="small" style={{ margin: '6px 0 0 18px' }}>{app.cluster.factors.map((f, i) => <li key={i}>{f}</li>)}<li>{app.cluster.contextText}</li></ul>
          <div style={{ marginTop: 8 }}>
            <a 
              href={`#/geo?cluster=${app.cluster.id}`} 
              className="btn sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontWeight: 600 }}
            >
              <MapPin size={13} color="#c0272d" />
              <span>Inspect {app.cluster.id} on Manila Spatial Map</span>
            </a>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>Geographic concentration is not proof of fraud. Dormitories, apartments and dense communities in Manila can legitimately hold many registrants.</div>
        </div>
      )}

      <div className="sect"><h3>Handwriting similarity <SimBadge>Simulated embedding comparator</SimBadge></h3>
        {app.document ? (
          <div className="compare">
            <HandwritingSample app={app} caption={`${app.id} (this form)`} />
            {app.related[0] ? <HandwritingSample app={result.byId[app.related[0].id]} caption={`${app.related[0].id} - similarity ${app.related[0].sim}`} /> : <div className="muted small">No related form above the similarity threshold.</div>}
          </div>
        ) : <div className="muted small">No scanned form on file.</div>}
        {app.related.length > 0 && <div className="row small" style={{ marginTop: 6 }}><span className="muted">Related applications:</span>{app.related.map((r) => <button key={r.id} className="chip mono" onClick={() => openApp(r.id)}>{r.id} ({r.sim})</button>)}</div>}
        <div className="small muted" style={{ marginTop: 6 }}>A similarity value is not proof of forgery or common authorship. Scan quality and natural similarity affect results.</div>
      </div>

      <div className="sect"><h3>Case management</h3>
        <div className="row">
          <div className="field" style={{ minWidth: 200 }}><label>Case status</label>
            <select value={cs.status} disabled={locked || cs.status === 'Resolved'} onChange={(e) => setStatus(e.target.value)}>{CASE_STATUSES.filter((s) => s !== 'Resolved' || cs.status === 'Resolved').map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          {cs.status === 'Resolved' && <Badge tone="low">Resolved: {cs.disposition}</Badge>}
        </div>
        {cs.status === 'Resolved' ? (
          <div className="small" style={{ marginTop: 8 }}><b>Human rationale:</b> {cs.rationale} <button className="btn sm" style={{ marginLeft: 8 }} disabled={locked} onClick={() => dispatch({ type: 'caseUpdate', id: app.id, patch: { status: 'Under Review', disposition: null, rationale: '' }, text: 'Case reopened', action: 'CASE_REOPENED' })}>Reopen case</button></div>
        ) : (
          <div className="grid g2" style={{ marginTop: 10 }}>
            <div className="field"><label>Final human disposition</label><select value={disp} disabled={locked} onChange={(e) => setDisp(e.target.value)}><option value="">Select...</option>{DISPOSITIONS.map((d) => <option key={d}>{d}</option>)}</select></div>
            <div className="field"><label>Rationale (required)</label><input type="text" value={rationale} disabled={locked} onChange={(e) => setRationale(e.target.value)} placeholder="Reason for the decision" /></div>
            <div><button className="btn gold" disabled={locked} onClick={resolve}>Record human disposition and resolve</button></div>
          </div>
        )}
        <div className="field" style={{ marginTop: 12 }}><label>Reviewer notes</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}><input type="text" value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} placeholder={locked ? 'Viewer role is read-only' : 'Add an observation or field-verification result'} onKeyDown={(e) => e.key === 'Enter' && note.trim() && (dispatch({ type: 'note', id: app.id, text: note.trim() }), setNote(''))} />
            <button className="btn" disabled={locked || !note.trim()} onClick={() => { dispatch({ type: 'note', id: app.id, text: note.trim() }); setNote('') }}>Add note</button></div>
        </div>
        <ul className="timeline" style={{ marginTop: 10 }}>{cs.notes.length ? cs.notes.slice().reverse().map((n, i) => <li key={i}><span className="mono muted">{fmtTime(n.ts)} - {n.role}</span><br />{n.text}</li>) : <li className="muted">No notes yet.</li>}</ul>
        {(!app.synthetic || app.isComelecEnrolled || state.extraApps?.some((ea) => ea.id === app.id)) && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1.5px dashed #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="small muted">Mock Testing Record:</span>
            <button
              type="button"
              className="btn sm"
              style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              onClick={() => {
                if (window.confirm(`Permanently delete mock test record ${app.id} (${app.name}) from investigation queue?`)) {
                  dispatch({ type: 'removeApp', id: app.id })
                  notify(`Mock record ${app.id} deleted.`)
                  openApp(null)
                }
              }}
            >
              <Trash2 size={13} />
              <span>Delete Mock Test Record</span>
            </button>
          </div>
        )}
      </div>

      <div className="sect"><h3>Review history and audit trail</h3>
        <ul className="timeline">{trail.length ? trail.map((e) => <li key={e.id}><span className="mono muted">{fmtTime(e.ts)} - {e.role} - {e.action}</span><br />{e.detail}</li>) : <li className="muted">No recorded activity for this application yet.</li>}</ul>
        <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={exportJson}>Export dossier (JSON)</button><button className="btn" onClick={exportHtml}>Export dossier (HTML)</button></div>
      </div>
    </div>
  )
}
