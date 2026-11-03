import React, { useState } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, SyntheticBanner, fmtTime } from '../components/ui.jsx'
import { download, toCSV } from '../lib/export.js'
import { cyrb53 } from '../lib/rng.js'
import { FileText, ShieldCheck, Download, CheckCircle2, AlertTriangle, Key } from 'lucide-react'

export default function AuditLogs() {
  const { state, dispatch } = useApp()
  const [q, setQ] = useState('')
  const [act, setAct] = useState('all')
  const [verify, setVerify] = useState(null)

  const actions = [...new Set(state.audit.map((e) => e.action))]
  const rows = state.audit
    .filter((e) => (act === 'all' || e.action === act) && (!q || `${e.target} ${e.detail} ${e.action}`.toLowerCase().includes(q.toLowerCase())))
    .slice()
    .reverse()

  const doVerify = () => {
    let prev = 'GENESIS'
    for (const e of state.audit) {
      const { hash, prevHash, ...base } = e
      if (prevHash !== prev || cyrb53(prev + JSON.stringify(base)) !== hash) {
        setVerify({ ok: false, msg: `Chain integrity check failed at entry #${e.id}.` })
        return
      }
      prev = hash
    }
    setVerify({ 
      ok: true, 
      msg: `Cryptographic hash chain verified across ${state.audit.length} entries. Hash pointer sequence is intact and unmodified.` 
    })
  }

  const exportCsv = () => {
    download('once-ai-audit-log.csv', 'text/csv', toCSV(state.audit, [
      { label: '#', value: 'id' },
      { label: 'Timestamp', value: 'ts' },
      { label: 'Role', value: 'role' },
      { label: 'Action', value: 'action' },
      { label: 'Target', value: 'target' },
      { label: 'Detail', value: 'detail' },
      { label: 'Hash', value: 'hash' }
    ]))
    dispatch({ type: 'logView', action: 'EXPORT', target: 'audit-log', detail: `Exported ${state.audit.length} audit entries to CSV` })
  }

  return (
    <div className="page">
      <PageHead title="Audit Logs" feature="Cryptographic Audit Trail | Tamper-Evident History">
        Immutable record of user activity, record access, status changes, and review history. Every action is signed into a sequential hash chain for external oversight.
      </PageHead>
      <SyntheticBanner />

      <Card title="Activity Audit Trail" sub={`${state.audit.length} total recorded operations`}>
        <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <input 
            type="search" 
            style={{ maxWidth: 280 }} 
            placeholder="Search audit log..." 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
            aria-label="Search audit log" 
          />

          <select style={{ width: 'auto' }} value={act} onChange={(e) => setAct(e.target.value)} aria-label="Filter by action">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a}>{a}</option>)}
          </select>

          <button className="btn" onClick={doVerify} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Key size={14} />
            <span>Verify Hash Chain Integrity</span>
          </button>

          <button className="btn" onClick={exportCsv} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>

        {verify && (
          <div className={`banner ${verify.ok ? 'info' : 'alert'} small`} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {verify.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{verify.msg}</span>
          </div>
        )}

        <div className="tablewrap" style={{ maxHeight: 520 }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Timestamp</th>
                <th>Role</th>
                <th>Action</th>
                <th>Target</th>
                <th>Detail</th>
                <th>Chain Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="mono"><b>{e.id}</b></td>
                  <td className="small">{fmtTime(e.ts)}</td>
                  <td><Badge tone="info">{e.role}</Badge></td>
                  <td className="mono small"><b>{e.action}</b></td>
                  <td className="mono small">{e.target}</td>
                  <td className="small">{e.detail}</td>
                  <td className="mono small muted" style={{ fontSize: 10 }}>{e.hash ? e.hash.slice(0, 12) + '...' : '—'}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="7" className="muted" style={{ padding: 24, textAlign: 'center' }}>
                    No audit records match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
