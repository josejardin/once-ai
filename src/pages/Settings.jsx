import React from 'react'
import { useApp, ROLES } from '../store.jsx'
import { Badge, Card, PageHead, SyntheticBanner } from '../components/ui.jsx'
import { DEFAULT_CONFIG, INDICATORS } from '../lib/pipeline.js'
import { Settings as SettingsIcon, Shield, Sun, Moon, RotateCcw, Lock, CheckCircle2 } from 'lucide-react'

const STATUS = [
  ['Biometric Facial Recognition', 'Implemented', '100% Local AI in RAM using DeepFace FaceNet512. Cancelable orthogonal matrix projection salt (RA 10173). Zero disk writes.'],
  ['Address Standardization', 'Implemented', 'Rule-based normalizer: abbreviations, number words, fuzzy barangay match, gazetteer lookup.'],
  ['Spatial Anomaly Radar (DBSCAN)', 'Implemented', 'Real DBSCAN with haversine metric against barangay baselines and known-building context.'],
  ['Batch Forgery Handwriting Similarity', 'Simulated', '24-D feature embeddings compared by cosine distance. Simulates Siamese Neural Network output.'],
  ['Explainable Risk Prioritization', 'Implemented', 'Five independent indicators with configurable weights and strict two-indicator rule for High.'],
  ['Audit Dossier & Hash Chain', 'Implemented (prototype)', 'Per-application dossier with notes, audit log, and cryptographically verified hash chain.'],
  ['Role-Based Access Control', 'Demo RBAC', 'Interactive role switcher (Administrator, ERB Reviewer, Public Viewer) controlling edit and config permissions.'],
  ['ePLDT Sovereign Cloud Target', 'Planned Architecture', 'Air-gapped and Sovereign Cloud ready. Designed to comply with Republic Act 10173 and Republic Act 9369.'],
]

const TONE = { 
  Implemented: 'low', 
  'Implemented (prototype)': 'low', 
  Simulated: 'sim', 
  'Demo RBAC': 'mod', 
  'Planned Architecture': 'info' 
}

export default function Settings() {
  const { state, dispatch, perm, notify } = useApp()
  const cfg = state.config

  const setCfg = (patch, detail) => perm.canConfig && dispatch({ type: 'config', config: { ...cfg, ...patch }, detail })
  const setW = (k, v) => setCfg({ weights: { ...cfg.weights, [k]: v } }, `Weight for "${k}" set to ${v}`)

  return (
    <div className="page">
      <PageHead title="Settings" feature="System Preferences | Access Control">
        Manage user accounts, roles, permissions, theme preferences, and AI screening model parameters.
      </PageHead>
      <SyntheticBanner />

      <div className="grid g2">
        {/* User Account & Role Permissions */}
        <Card title="User Account & Role-Based Access" sub="Role-Based Security Matrix (DEMO)">
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="user-role-select">Active Session Role</label>
            <select 
              id="user-role-select" 
              value={state.role} 
              onChange={(e) => dispatch({ type: 'role', role: e.target.value })}
            >
              {Object.entries(ROLES).map(([k, r]) => (
                <option key={k} value={k}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="tablewrap" style={{ marginBottom: 14 }}>
            <table>
              <thead>
                <tr><th>Permission</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Can View Records & Dossiers</td>
                  <td><Badge tone="low">Allowed (All)</Badge></td>
                </tr>
                <tr>
                  <td>Can Intake Biometrics & Submit Applications</td>
                  <td><Badge tone={perm.canEdit ? 'low' : 'off'}>{perm.canEdit ? 'Granted' : 'Restricted'}</Badge></td>
                </tr>
                <tr>
                  <td>Can Review Cases & Record Findings</td>
                  <td><Badge tone={perm.canEdit ? 'low' : 'off'}>{perm.canEdit ? 'Granted' : 'Restricted'}</Badge></td>
                </tr>
                <tr>
                  <td>Can Modify Model Weights & Thresholds</td>
                  <td><Badge tone={perm.canConfig ? 'low' : 'off'}>{perm.canConfig ? 'Granted (Admin)' : 'Restricted'}</Badge></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Interface Appearance</div>
              <div className="small muted">Current theme: {state.theme}</div>
            </div>
            <button 
              className="btn" 
              onClick={() => dispatch({ type: 'theme', theme: state.theme === 'dark' ? 'light' : 'dark' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {state.theme === 'dark' ? <><Sun size={15} /> Switch to Light</> : <><Moon size={15} /> Switch to Dark</>}
            </button>
          </div>
        </Card>

        {/* Demo Data Management */}
        <Card title="Database & Session Controls" sub="Session resets and local data cleanup">
          <div className="banner small" style={{ marginBottom: 14 }}>
            All records in this system are synthetic demonstration entries designed for election integrity evaluation. Resetting will restore original seed cases, weights, and audit logs.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button 
              className="btn" 
              disabled={!perm.canConfig} 
              title={perm.canConfig ? '' : 'Requires Administrator role'} 
              onClick={() => { 
                if (confirm('Reset all cases, notes, intakes, settings and audit log to initial state?')) { 
                  dispatch({ type: 'reset' })
                  notify('System demo data successfully restored to factory defaults.') 
                } 
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: '10px 14px' }}
            >
              <RotateCcw size={15} />
              <span>Reset Demo Applications & Cases</span>
            </button>
            {!perm.canConfig && <span className="small muted">Switch role to Administrator to perform database reset.</span>}
          </div>
        </Card>
      </div>

      {/* Model Hyperparameters Configuration */}
      <Card title="Provisional Model Parameters & Weights" sub={perm.canConfig ? 'Administrator Configurator' : 'Read-only — Administrator role required to edit'}>
        <div className="banner info small" style={{ marginBottom: 14 }}>
          Adjust the explainable scoring weights and detection thresholds. Changes immediately recompute priority queues across all pages.
        </div>

        <div className="grid g2">
          <div>
            <h4 style={{ marginBottom: 10 }}>Indicator Contribution Weights</h4>
            {INDICATORS.map((d) => (
              <div className="field" key={d.key} style={{ marginBottom: 10 }}>
                <label htmlFor={'w' + d.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{d.label}</span>
                  <b>{cfg.weights[d.key]} pts</b>
                </label>
                <input 
                  id={'w' + d.key} 
                  type="range" 
                  min="0" 
                  max="50" 
                  value={cfg.weights[d.key]} 
                  disabled={!perm.canConfig} 
                  onChange={(e) => setW(d.key, Number(e.target.value))} 
                />
              </div>
            ))}
          </div>

          <div>
            <h4 style={{ marginBottom: 10 }}>Detection & Clustering Thresholds</h4>
            <div className="grid g2" style={{ gap: 10 }}>
              <div className="field">
                <label>DBSCAN Radius (eps in meters)</label>
                <input 
                  type="number" 
                  min="10" 
                  max="500" 
                  value={cfg.eps} 
                  disabled={!perm.canConfig} 
                  onChange={(e) => setCfg({ eps: Number(e.target.value) }, `DBSCAN eps set to ${e.target.value} m`)} 
                />
              </div>
              <div className="field">
                <label>DBSCAN Minimum Density (minPts)</label>
                <input 
                  type="number" 
                  min="2" 
                  max="30" 
                  value={cfg.minPts} 
                  disabled={!perm.canConfig} 
                  onChange={(e) => setCfg({ minPts: Number(e.target.value) }, `DBSCAN minPts set to ${e.target.value}`)} 
                />
              </div>
              <div className="field">
                <label>Handwriting Similarity Threshold</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.5" 
                  max="0.99" 
                  value={cfg.hwThreshold} 
                  disabled={!perm.canConfig} 
                  onChange={(e) => setCfg({ hwThreshold: Number(e.target.value) }, `Handwriting threshold set to ${e.target.value}`)} 
                />
              </div>
              <div className="field">
                <label>Batch Size Spike Trigger</label>
                <input 
                  type="number" 
                  min="2" 
                  max="30" 
                  value={cfg.batchMin} 
                  disabled={!perm.canConfig} 
                  onChange={(e) => setCfg({ batchMin: Number(e.target.value) }, `Batch trigger set to ${e.target.value}`)} 
                />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <button 
                className="btn" 
                disabled={!perm.canConfig} 
                onClick={() => { 
                  dispatch({ type: 'config', config: DEFAULT_CONFIG, detail: 'Settings restored to defaults' })
                  notify('Model defaults restored.') 
                }}
              >
                Restore Factory Defaults
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Component & Security Architecture Inventory */}
      <Card title="System Component & Sovereign Cloud Architecture" sub="Inventory of production versus prototype modules">
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Component</th><th>Status</th><th>Technical Details</th></tr>
            </thead>
            <tbody>
              {STATUS.map(([c, s, d]) => (
                <tr key={c}>
                  <td><b>{c}</b></td>
                  <td><Badge tone={TONE[s] || 'info'}>{s}</Badge></td>
                  <td className="small">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
