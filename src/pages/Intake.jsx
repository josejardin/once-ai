import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, RiskBadge, SimBadge, SyntheticBanner, fmtDate } from '../components/ui.jsx'
import { normalizeAddress } from '../lib/address.js'
import { BARANGAYS } from '../lib/gazetteer.js'
import { download, toCSV } from '../lib/export.js'
import { simulatedEmbeddingFromFile } from '../lib/handwriting.js'
import BiometricIntakeCapture from '../components/BiometricIntakeCapture.jsx'
import { getComelecVoters } from '../lib/api.js'
import { IdCard } from 'lucide-react'

export default function Intake() {
  const { result, state, dispatch, perm, openApp, notify } = useApp()
  const [addr, setAddr] = useState('Prk 3 Brgy. Sampagita')
  const [name, setName] = useState('')
  const [age, setAge] = useState(30)
  const [type, setType] = useState('New registration')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [biometricData, setBiometricData] = useState(null)
  const [comelecVoters, setComelecVoters] = useState([])
  const [selectedVoter, setSelectedVoter] = useState(null)
  const [q, setQ] = useState('')
  const [fb, setFb] = useState('all')
  const [fs, setFs] = useState('all')
  const [fl, setFl] = useState('all')
  const fileRef = useRef(null)

  const live = useMemo(() => normalizeAddress(addr, 'preview'), [addr])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  useEffect(() => {
    let active = true
    getComelecVoters().then((data) => {
      if (active && data?.voters) setComelecVoters(data.voters)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const pick = (f) => {
    setFile(f || null)
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }
  const submit = () => {
    if (!name.trim() || !addr.trim()) { notify('Applicant name and declared address are required.'); return }
    const n = state.extraApps.length + 1
    const id = `APP-N${String(n).padStart(3, '0')}`
    dispatch({
      type: 'addApp',
      app: {
        id, name: name.trim(), age: Number(age) || 18, type, previousBarangayId: null, rawAddress: addr.trim(),
        submittedAt: new Date().toISOString(), submittedVia: 'Walk-in', batchId: null, supportingDoc: null, yearsAtAddress: undefined, synthetic: false,
        photo_base64: biometricData?.photo_base64 || selectedVoter?.photo_base64 || null,
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
        document: file ? { filename: file.name, scanQuality: 0.8, pages: 1, embedding: simulatedEmbeddingFromFile(file.name, file.size), simulatedFromFile: true } : null,
      },
    })
    notify(`${id} entered, biometrics indexed, and screened.`)
    setName(''); setFile(null); setPreview(null); setBiometricData(null); setSelectedVoter(null); if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => openApp(id), 150)
  }

  const rows = result.apps.filter((a) => {
    const hay = `${a.id} ${a.name} ${a.addr.original} ${a.addr.normalized}`.toLowerCase()
    return (!q || hay.includes(q.toLowerCase())) && (fb === 'all' || a.addr.barangayId === fb || (fb === 'none' && !a.addr.barangayId)) && (fs === 'all' || a.addr.status === fs) && (fl === 'all' || a.label === fl)
  })
  const exportCsv = () => {
    download('once-ai-applications.csv', 'text/csv', toCSV(rows, [
      { label: 'Application', value: 'id' }, { label: 'Synthetic', value: (a) => (a.synthetic ? 'yes' : 'no') }, { label: 'Submitted', value: 'submittedAt' },
      { label: 'Original address', value: (a) => a.addr.original }, { label: 'Standardized address', value: (a) => a.addr.normalized },
      { label: 'Address status', value: (a) => a.addr.status }, { label: 'Parsing confidence', value: (a) => a.addr.confidence }, { label: 'Precision', value: (a) => a.addr.precision },
      { label: 'Priority label', value: 'label' }, { label: 'Priority score (not a probability)', value: 'score' },
    ]))
    dispatch({ type: 'logView', action: 'EXPORT', target: 'applications', detail: `Exported ${rows.length} applications to CSV` })
  }
  const ac = live.components

  return (
    <div className="page">
      <PageHead title="Registration Intake" feature="Address Standardization | Document intake">
        Enter a declared address and watch it standardized in real time against the demo gazetteer. Informal references, abbreviations and misspellings are handled; anything unresolved is sent to manual review instead of being guessed.
      </PageHead>
      <SyntheticBanner />

      <div className="grid g2">
        <Card title="New application intake" sub="Reviewer role required to submit">
          <div className="grid" style={{ gap: 10 }}>
            {comelecVoters.length > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--panel2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IdCard size={14} />
                    <b>Autofill from Enrolled COMELEC Mock Voter ID (Optional)</b>
                  </span>
                  {selectedVoter && (
                    <button
                      type="button"
                      className="chip small"
                      onClick={() => { setSelectedVoter(null); setName(''); }}
                    >
                      ✕ Clear Selection
                    </button>
                  )}
                </div>
                <div className="chips" style={{ marginTop: 4 }}>
                  {comelecVoters.map((v) => {
                    const isSelected = selectedVoter?.voter_id === v.voter_id
                    return (
                      <button
                        key={v.voter_id}
                        type="button"
                        className={`chip ${isSelected ? 'primary' : ''}`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedVoter(null)
                          } else {
                            setSelectedVoter(v)
                            setName(v.name)
                            if (v.precinct_id) {
                              setAddr(`Purok 1, ${v.precinct_id}`)
                            }
                          }
                        }}
                      >
                        {v.name} ({v.vin || v.voter_id.slice(-6)})
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="grid g2">
              <div className="field"><label htmlFor="nm">Applicant name (fictitious)</label><input id="nm" type="text" value={name} onChange={(e) => { setName(e.target.value); if (selectedVoter && e.target.value !== selectedVoter.name) setSelectedVoter(null); }} placeholder="e.g. Juan Sample" /></div>
              <div className="grid g2"><div className="field"><label htmlFor="ag">Age</label><input id="ag" type="number" min="18" max="120" value={age} onChange={(e) => setAge(e.target.value)} /></div>
                <div className="field"><label htmlFor="ty">Type</label><select id="ty" value={type} onChange={(e) => setType(e.target.value)}><option>New registration</option><option>Transfer of registration</option></select></div></div>
            </div>
            <div className="field">
              <label htmlFor="ad">Declared address (as written on the form)</label>
              <textarea 
                id="ad" 
                value={addr} 
                onChange={(e) => setAddr(e.target.value)} 
                placeholder="e.g. Purok 3, Barangay Sampaguita"
                rows={2}
              />
            </div>
            <BiometricIntakeCapture
              applicantName={name}
              barangay={ac.barangay || 'Sampagita'}
              selectedVoter={selectedVoter}
              registryCount={comelecVoters.length}
              onBiometricChange={setBiometricData}
              disabled={!perm.canEdit}
            />
            <div><button className="btn primary" disabled={!perm.canEdit} onClick={submit} title={perm.canEdit ? '' : 'Requires ERB Reviewer role'}>Submit and screen application</button></div>
          </div>
        </Card>

        <Card title="Address standardization result" sub="Live preview - rule-based">
          <dl className="kv">
            <dt>Original</dt><dd className="mono">{live.original || '—'}</dd>
            <dt>Normalized</dt><dd><b>{live.normalized}</b></dd>
            <dt>Status</dt><dd><Badge tone={live.status === 'Resolved' ? 'low' : live.status === 'Partial' ? 'mod' : 'high'}>{live.status}</Badge> <span className="muted small">parsing confidence {Math.round(live.confidence * 100)}% (heuristic score, not a probability)</span></dd>
            <dt>Barangay match</dt><dd>{ac.barangay || '—'} <span className="muted small">({live.matchType})</span></dd>
            <dt>Components</dt><dd className="small">Street: {ac.street || '—'} | Purok: {ac.purok || '—'} | Sitio: {ac.sitio || '—'} | Building: {ac.building || '—'} | Landmark: {ac.landmark || '—'} | Municipality: {ac.municipality || '—'} | Province: {ac.province || '—'}</dd>
            <dt>Geocoding</dt><dd>{live.coords ? <>{live.coords[0].toFixed(5)}, {live.coords[1].toFixed(5)} <span className="muted small">({live.precision}: {live.precisionBasis})</span> <SimBadge>Offline gazetteer</SimBadge></> : <span className="muted">Not geocoded - manual review required</span>}</dd>
          </dl>
          <div style={{ marginTop: 8 }}>{live.warnings.length ? live.warnings.map((w, i) => <div key={i} className={`warn ${w.level}`}>- {w.text}</div>) : <div className="warn info">No validation warnings.</div>}</div>
          <div className="small muted" style={{ marginTop: 8 }}>The normalizer only knows the fictitious demo gazetteer (8 barangays). Not every informal address can be resolved; unresolved ones are routed to manual review.</div>
        </Card>
      </div>

      <Card title="All applications" sub={`${rows.length} of ${result.apps.length}`}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input type="search" style={{ maxWidth: 260 }} placeholder="Search id, name or address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applications" />
          <select style={{ width: 'auto' }} value={fb} onChange={(e) => setFb(e.target.value)} aria-label="Filter by barangay"><option value="all">All barangays</option>{BARANGAYS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}<option value="none">No barangay resolved</option></select>
          <select style={{ width: 'auto' }} value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Filter by address status"><option value="all">All address statuses</option><option>Resolved</option><option>Partial</option><option>Unresolved</option></select>
          <select style={{ width: 'auto' }} value={fl} onChange={(e) => setFl(e.target.value)} aria-label="Filter by priority"><option value="all">All priorities</option><option>High</option><option>Moderate</option><option>Low</option></select>
          <button className="btn" onClick={exportCsv} style={{ marginLeft: 'auto' }}>Export CSV</button>
        </div>
        <div className="tablewrap" style={{ maxHeight: 520 }}><table>
          <thead><tr><th>ID</th><th>Submitted</th><th>Original address</th><th>Standardized</th><th>Address</th><th>Priority</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id} className="click" onClick={() => openApp(a.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openApp(a.id)}>
              <td className="mono">{a.id}{!a.synthetic && <> <Badge tone="info">new</Badge></>}</td><td className="small">{fmtDate(a.submittedAt)}</td>
              <td className="small mono">{a.addr.original}</td><td className="small">{a.addr.normalized}</td>
              <td><Badge tone={a.addr.status === 'Resolved' ? 'low' : a.addr.status === 'Partial' ? 'mod' : 'high'}>{a.addr.status}</Badge></td>
              <td><RiskBadge label={a.label} /></td>
            </tr>))}
            {!rows.length && <tr><td colSpan="6" className="muted">No applications match these filters.</td></tr>}
          </tbody></table></div>
      </Card>
    </div>
  )
}
