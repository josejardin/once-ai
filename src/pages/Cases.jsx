import React, { useState } from 'react'
import { useApp } from '../store.jsx'
import Dossier from '../components/Dossier.jsx'
import { Badge, Card, PageHead, RiskBadge, ScoreBar, SyntheticBanner, EmptyState, fmtDate } from '../components/ui.jsx'
import { CASE_STATUSES, caseOf } from '../lib/pipeline.js'

export default function Cases() {
  const { result, state, summary, dispatch, perm } = useApp()
  const [sel, setSel] = useState(null)
  const [fs, setFs] = useState('open')
  const [fl, setFl] = useState('all')
  const [q, setQ] = useState('')
  const [manual, setManual] = useState('')

  const triageIds = new Set(summary.triage.map((a) => a.id))
  const rows = result.apps.filter((a) => triageIds.has(a.id)).filter((a) => {
    const st = caseOf(state.caseState, a.id).status
    return (fs === 'all' || (fs === 'open' ? st !== 'Resolved' : st === fs)) && (fl === 'all' || a.label === fl) && (!q || `${a.id} ${a.name} ${a.addr.normalized}`.toLowerCase().includes(q.toLowerCase()))
  }).sort((a, b) => b.score - a.score)
  const cur = sel && result.byId[sel] ? sel : rows[0]?.id

  const openManual = () => {
    const a = result.byId[manual.trim().toUpperCase()]
    if (!a) return
    if (!state.caseState[a.id]) dispatch({ type: 'caseUpdate', id: a.id, patch: { status: 'Under Review' }, text: 'Case opened manually by reviewer', action: 'CASE_OPENED' })
    setSel(a.id); setManual('')
  }

  return (
    <div className="page">
      <PageHead title="Investigation Cases" feature="ERB Triage Dashboard | Secure Audit Dossier">
        Flagged applications become reviewable cases here. Examine the evidence, record observations and set a status. Only a human reviewer can record a final disposition; ONCE AI never approves or rejects a registration.
      </PageHead>
      <SyntheticBanner />
      <div className="grid g4">
        {CASE_STATUSES.slice(0, 4).map((s) => <Card key={s}><div className="stat"><div className="v">{summary.triage.filter((a) => caseOf(state.caseState, a.id).status === s).length}</div><div className="l">{s}</div></div></Card>)}
      </div>
      <div className="split">
        <Card title="Case queue" sub={`${rows.length}`}>
          <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
            <input type="search" placeholder="Search cases" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cases" />
            <div className="grid g2"><select value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Status filter"><option value="open">Open cases</option><option value="all">All statuses</option>{CASE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              <select value={fl} onChange={(e) => setFl(e.target.value)} aria-label="Priority filter"><option value="all">All priorities</option><option>High</option><option>Moderate</option></select></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}><input type="text" placeholder="Open case by ID, e.g. APP-0010" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && openManual()} /><button className="btn" disabled={!perm.canEdit} onClick={openManual}>Open</button></div>
          </div>
          <div className="tablewrap" style={{ maxHeight: 640 }}><table><tbody>
            {rows.map((a) => {
              const c = caseOf(state.caseState, a.id)
              return (
                <tr key={a.id} className={`click ${cur === a.id ? 'sel' : ''}`} onClick={() => setSel(a.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(a.id)}>
                  <td><span className="mono">{a.id}</span><div className="small muted">{a.addr.components.barangay || 'unresolved'} · {fmtDate(a.submittedAt)}</div></td>
                  <td style={{ width: 80 }}><ScoreBar score={a.score} label={a.label} /></td>
                  <td><RiskBadge label={a.label} /><div className="small" style={{ marginTop: 3 }}><Badge tone={c.status === 'Resolved' ? 'low' : c.status === 'New' ? 'off' : 'info'}>{c.status}</Badge></div></td>
                </tr>)
            })}
            {!rows.length && <tr><td><EmptyState title="No cases match">Try clearing the search or filters.</EmptyState></td></tr>}
          </tbody></table></div>
        </Card>
        <div className="card sticky" style={{ maxHeight: 'calc(100vh - 90px)', overflow: 'auto' }}>
          {cur ? <Dossier appId={cur} inline /> : <span className="muted">Select a case.</span>}
        </div>
      </div>
    </div>
  )
}
