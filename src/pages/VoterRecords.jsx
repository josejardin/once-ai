import React, { useState } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, RiskBadge, SimBadge, SyntheticBanner, fmtDate } from '../components/ui.jsx'
import { BARANGAYS } from '../lib/gazetteer.js'
import { download, toCSV } from '../lib/export.js'
import { Users, Search, Download, Eye, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'

export default function VoterRecords() {
  const { result, state, dispatch, perm, openApp, summary } = useApp()
  const [q, setQ] = useState('')
  const [fb, setFb] = useState('all')
  const [fs, setFs] = useState('all')
  const [fl, setFl] = useState('all')

  const rows = result.apps.filter((a) => {
    const hay = `${a.id} ${a.name} ${a.addr.original} ${a.addr.normalized}`.toLowerCase()
    return (
      (!q || hay.includes(q.toLowerCase())) &&
      (fb === 'all' || a.addr.barangayId === fb || (fb === 'none' && !a.addr.barangayId)) &&
      (fs === 'all' || a.addr.status === fs) &&
      (fl === 'all' || a.label === fl)
    )
  })

  const exportCsv = () => {
    download('once-ai-voter-records.csv', 'text/csv', toCSV(rows, [
      { label: 'Application ID', value: 'id' },
      { label: 'Voter Name', value: 'name' },
      { label: 'Age', value: 'age' },
      { label: 'Type', value: 'type' },
      { label: 'Synthetic', value: (a) => (a.synthetic ? 'yes' : 'no') },
      { label: 'Submitted Date', value: 'submittedAt' },
      { label: 'Original Address', value: (a) => a.addr.original },
      { label: 'Standardized Address', value: (a) => a.addr.normalized },
      { label: 'Address Status', value: (a) => a.addr.status },
      { label: 'Parsing Confidence', value: (a) => a.addr.confidence },
      { label: 'Priority Label', value: 'label' },
      { label: 'Priority Score', value: 'score' },
      { label: 'Biometrics', value: (a) => a.biometrics ? 'Enrolled' : 'None' }
    ]))
    dispatch({ type: 'logView', action: 'EXPORT', target: 'voter-records', detail: `Exported ${rows.length} voter records to CSV` })
  }

  return (
    <div className="page">
      <PageHead title="Voter Records" feature="Master Voter Registry | Search & Inspection">
        Master directory of processed voter registration records. Search, browse, inspect normalized addresses, and review biometric status across all precincts.
      </PageHead>
      <SyntheticBanner />

      {/* Quick Summary Metric Cards */}
      <div className="grid g4">
        <Card className="stat">
          <div className="v">{result.apps.length}</div>
          <div className="l">Total Registered Records</div>
        </Card>
        <Card className="stat">
          <div className="v" style={{ color: 'var(--high)' }}>{summary.high}</div>
          <div className="l">High Risk / Flagged Anomaly</div>
        </Card>
        <Card className="stat">
          <div className="v" style={{ color: 'var(--mod)' }}>{summary.moderate}</div>
          <div className="l">Moderate Priority</div>
        </Card>
        <Card className="stat">
          <div className="v" style={{ color: 'var(--low)' }}>{result.apps.filter(a => a.addr.status === 'Resolved').length}</div>
          <div className="l">Resolved Clean Geocodes</div>
        </Card>
      </div>

      <Card title="Registered Voter Applications" sub={`Displaying ${rows.length} of ${result.apps.length} applications`}>
        <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <input 
              type="search" 
              placeholder="Search by ID, name, or address..." 
              value={q} 
              onChange={(e) => setQ(e.target.value)} 
              aria-label="Search voter records" 
              style={{ width: '100%', paddingLeft: 12 }}
            />
          </div>

          <select style={{ width: 'auto' }} value={fb} onChange={(e) => setFb(e.target.value)} aria-label="Filter by barangay">
            <option value="all">All barangays</option>
            {BARANGAYS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="none">No barangay resolved</option>
          </select>

          <select style={{ width: 'auto' }} value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Filter by address status">
            <option value="all">All address statuses</option>
            <option>Resolved</option>
            <option>Partial</option>
            <option>Unresolved</option>
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

        <div className="tablewrap" style={{ maxHeight: 600 }}>
          <table>
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Applicant Name</th>
                <th>Submitted</th>
                <th>Standardized Address</th>
                <th>Biometrics</th>
                <th>Address Status</th>
                <th>Priority</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="click" onClick={() => openApp(a.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openApp(a.id)}>
                  <td className="mono">
                    <b>{a.id}</b>
                    {!a.synthetic && <> <Badge tone="info">new</Badge></>}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div className="small muted">{a.type || 'New registration'} • Age {a.age || 25}</div>
                  </td>
                  <td className="small">{fmtDate(a.submittedAt)}</td>
                  <td>
                    <div className="small">{a.addr.normalized}</div>
                    <div className="mono small muted" style={{ fontSize: 11 }}>{a.addr.original}</div>
                  </td>
                  <td>
                    {a.biometrics ? (
                      <Badge tone="low">
                        <CheckCircle2 size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                        Indexed
                      </Badge>
                    ) : (
                      <span className="small muted">—</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={a.addr.status === 'Resolved' ? 'low' : a.addr.status === 'Partial' ? 'mod' : 'high'}>
                      {a.addr.status}
                    </Badge>
                  </td>
                  <td>
                    <RiskBadge label={a.label} />
                  </td>
                  <td>
                    <button 
                      className="chip small"
                      onClick={(e) => { e.stopPropagation(); openApp(a.id); }}
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
                  <td colSpan="8" className="muted" style={{ padding: 24, textAlign: 'center' }}>
                    No voter records match the current filters.
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
