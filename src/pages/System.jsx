import React, { useState } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, SyntheticBanner, fmtTime } from '../components/ui.jsx'
import { download, toCSV } from '../lib/export.js'
import { cyrb53 } from '../lib/rng.js'

const STATUS = [
  ['Address standardization (Feature 1)', 'Implemented', 'Rule-based parser: abbreviations, number words, fuzzy barangay match, gazetteer lookup. Demo gazetteer only (fictitious LGU).'],
  ['Geocoding', 'Simulated', 'Offline gazetteer; points placed deterministically inside the matched purok/sitio/building. No external geocoding service.'],
  ['Spatial Anomaly Radar (Feature 2)', 'Implemented', 'Real DBSCAN (haversine metric) with barangay baselines and known-building context. Leaflet + OpenStreetMap map.'],
  ['OCR extraction', 'Not integrated', 'No OCR engine. Uploaded forms are previewed only; intake is manual.'],
  ['Handwriting similarity (Feature 3)', 'Simulated', 'Synthetic embeddings compared by cosine similarity. No trained Siamese Neural Network is running.'],
  ['Explainable risk prioritization (Feature 4)', 'Implemented', 'Five indicators, configurable PROVISIONAL weights, two-indicator rule for High. Not validated.'],
  ['Audit dossier (Feature 5)', 'Implemented (prototype)', 'Per-application dossier with notes, history, exports and an audit log with a demo hash chain.'],
  ['Role-based access', 'Demo only', 'Role switcher disables controls in the UI. No authentication or server-side enforcement.'],
  ['Storage', 'Browser localStorage', 'Not secure and not tamper-proof. Production requires a hardened backend.'],
  ['Backend / PostgreSQL', 'Not implemented', 'Data layer is modular (pipeline.js + store.jsx) so a Node/Express + PostgreSQL API can replace it.'],
  ['COMELEC / AFIS integration', 'None', 'No access to COMELEC systems, AFIS or real voter data.'],
  ['ePLDT Sovereign Cloud', 'Planned', 'Cloud-ready design; not deployed. Subject to infrastructure and security implementation.'],
]
const TONE = { Implemented: 'low', 'Implemented (prototype)': 'low', Simulated: 'sim', 'Demo only': 'sim', 'Browser localStorage': 'mod', 'Not integrated': 'off', 'Not implemented': 'off', None: 'off', Planned: 'info' }

export default function System() {
  const { state, dispatch, perm, notify } = useApp()
  const [q, setQ] = useState('')
  const [act, setAct] = useState('all')
  const [verify, setVerify] = useState(null)
  const actions = [...new Set(state.audit.map((e) => e.action))]
  const rows = state.audit.filter((e) => (act === 'all' || e.action === act) && (!q || `${e.target} ${e.detail} ${e.action}`.toLowerCase().includes(q.toLowerCase()))).slice().reverse()

  const doVerify = () => {
    let prev = 'GENESIS'
    for (const e of state.audit) {
      const { hash, prevHash, ...base } = e
      if (prevHash !== prev || cyrb53(prev + JSON.stringify(base)) !== hash) { setVerify(`Chain broken at entry #${e.id}.`); return }
      prev = hash
    }
    setVerify(`Chain consistent across ${state.audit.length} entries in this browser. This is a demonstration: anyone with access to localStorage could rewrite and re-hash the log, so it is not tamper-proof.`)
  }

  return (
    <div className="page">
      <PageHead title="Audit Logs & System" feature="Secure Audit Dossier">
        Activity history, an honest inventory of what is implemented versus simulated, and the privacy and security design intended for production.
      </PageHead>
      <SyntheticBanner full />
      <Card title="Implementation status" sub="What is real, what is simulated">
        <div className="tablewrap"><table><thead><tr><th>Component</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>{STATUS.map(([c, s, d]) => <tr key={c}><td><b>{c}</b></td><td><Badge tone={TONE[s]}>{s}</Badge></td><td className="small">{d}</td></tr>)}</tbody></table></div>
      </Card>

      <Card title="Activity log" sub={`${state.audit.length} entries`}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input type="search" style={{ maxWidth: 260 }} placeholder="Search log" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
          <select style={{ width: 'auto' }} value={act} onChange={(e) => setAct(e.target.value)} aria-label="Filter by action"><option value="all">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>
          <button className="btn" onClick={doVerify}>Verify demo hash chain</button>
          <button className="btn" onClick={() => download('once-ai-audit-log.csv', 'text/csv', toCSV(state.audit, [{ label: '#', value: 'id' }, { label: 'Timestamp', value: 'ts' }, { label: 'Role', value: 'role' }, { label: 'Action', value: 'action' }, { label: 'Target', value: 'target' }, { label: 'Detail', value: 'detail' }, { label: 'Hash', value: 'hash' }]))}>Export CSV</button>
        </div>
        {verify && <div className="banner info small" style={{ marginBottom: 8 }}>{verify}</div>}
        <div className="tablewrap" style={{ maxHeight: 420 }}><table>
          <thead><tr><th>#</th><th>Time</th><th>Role</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((e) => <tr key={e.id}><td className="mono">{e.id}</td><td className="small">{fmtTime(e.ts)}</td><td className="small">{e.role}</td><td className="mono small">{e.action}</td><td className="mono small">{e.target}</td><td className="small">{e.detail}</td></tr>)}
            {!rows.length && <tr><td colSpan="6" className="muted">No activity recorded yet. Actions you take in this prototype (intake, case updates, notes, exports) appear here.</td></tr>}</tbody></table></div>
      </Card>

      <div className="grid g2">
        <Card title="Privacy and security design (production target)">
          <ul className="small" style={{ margin: '0 0 0 18px' }}>
            <li><b>Role-based access control</b> with least privilege (viewer, ERB reviewer, administrator) enforced on the server.</li>
            <li><b>Encryption</b> in transit (TLS) and at rest, with encrypted secure document storage.</li>
            <li><b>Append-only audit logging</b> in a protected store, replacing this browser demo log.</li>
            <li><b>Data minimization:</b> only fields needed for screening are held; no biometric data.</li>
            <li><b>Retention policies</b> with scheduled deletion of closed cases.</li>
            <li><b>Cloud-ready</b> for deployment on ePLDT Sovereign Cloud, subject to infrastructure and security implementation.</li>
          </ul>
        </Card>
        <Card title="Demo data controls">
          <div className="banner small">All records are synthetic and fictitious. They are not COMELEC voter data. This prototype does not access COMELEC systems or AFIS and has no real-time integration.</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" disabled={!perm.canConfig} title={perm.canConfig ? '' : 'Requires Administrator role'} onClick={() => { if (confirm('Reset all cases, notes, new intakes, settings and the audit log to the seed state?')) { dispatch({ type: 'reset' }); notify('Demo data reset.') } }}>Reset demo data</button>
            {!perm.canConfig && <span className="small muted">Switch the demo role to Administrator to reset.</span>}
          </div>
        </Card>
      </div>
    </div>
  )
}
