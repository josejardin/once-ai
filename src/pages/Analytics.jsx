import React from 'react'
import { useApp } from '../store.jsx'
import { Card, HBars, PageHead, Stat, SyntheticBanner, VBars } from '../components/ui.jsx'
import { INDICATORS, CASE_STATUSES, DISPOSITIONS, caseOf } from '../lib/pipeline.js'
import { download, toCSV, escapeHtml, DISCLAIMER } from '../lib/export.js'

export default function Analytics() {
  const { result, summary: s, state, dispatch } = useApp()
  const trig = INDICATORS.map((d) => ({ label: d.label, value: result.apps.filter((a) => a.indicators[d.key].result === 'Triggered').length }))
  const mitig = result.apps.filter((a) => a.indicators.geo.result === 'Mitigated by context').length
  const addrStatus = ['Resolved', 'Partial', 'Unresolved'].map((k) => ({ label: k, value: result.apps.filter((a) => a.addr.status === k).length }))
  const caseDist = CASE_STATUSES.map((k) => ({ label: k, value: s.triage.filter((a) => caseOf(state.caseState, a.id).status === k).length }))
  const disp = DISPOSITIONS.map((k) => ({ label: k, value: s.triage.filter((a) => caseOf(state.caseState, a.id).disposition === k).length }))
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const end = result.now - i * 7 * 86400000
    return { label: `W-${i}`, value: result.apps.filter((a) => +new Date(a.submittedAt) <= end && +new Date(a.submittedAt) > end - 7 * 86400000).length }
  }).reverse()

  const exportApps = () => {
    download('once-ai-screening-results.csv', 'text/csv', toCSV(result.apps, [
      { label: 'Application', value: 'id' }, { label: 'Barangay', value: (a) => a.addr.components.barangay || '' }, { label: 'Address status', value: (a) => a.addr.status },
      { label: 'Priority label', value: 'label' }, { label: 'Priority score (not a probability)', value: 'score' },
      ...INDICATORS.map((d) => ({ label: d.label, value: (a) => a.indicators[d.key].result })),
      { label: 'Cluster', value: (a) => a.cluster?.id || '' }, { label: 'Case status', value: (a) => caseOf(state.caseState, a.id).status },
      { label: 'Human disposition', value: (a) => caseOf(state.caseState, a.id).disposition || '' },
    ]))
    dispatch({ type: 'logView', action: 'EXPORT', target: 'screening-results', detail: 'Screening results exported to CSV' })
  }
  const exportClusters = () => {
    download('once-ai-clusters.csv', 'text/csv', toCSV(result.clusters, [
      { label: 'Cluster', value: 'id' }, { label: 'Barangay', value: 'barangayName' }, { label: 'Location', value: 'sitioOrArea' }, { label: 'Applications', value: 'size' }, { label: 'Radius m', value: 'radiusM' },
      { label: 'Span days', value: 'spanDays' }, { label: 'Severity', value: 'severity' }, { label: 'Status', value: 'status' }, { label: 'Review', value: (c) => state.clusterReview[c.id] || 'Unreviewed' }, { label: 'Context', value: 'contextText' },
    ]))
    dispatch({ type: 'logView', action: 'EXPORT', target: 'clusters', detail: 'Cluster list exported to CSV' })
  }
  const exportReport = () => {
    const li = (rows) => rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${r.value}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ONCE AI Summary Report</title><style>body{font:14px/1.5 Segoe UI,Arial;max-width:820px;margin:30px auto}table{border-collapse:collapse;width:100%;margin-bottom:16px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}.n{background:#fff6d6;border:1px solid #d9ac2b;padding:8px;font-size:12px}</style></head><body>
<h1>ONCE AI - Screening Summary Report</h1><div class="n">${escapeHtml(DISCLAIMER)}</div><p>Generated ${new Date().toISOString()}</p>
<h2>Totals</h2><table>${li([{ label: 'Applications screened', value: s.total }, { label: 'High priority', value: s.high }, { label: 'Moderate priority', value: s.moderate }, { label: 'Low priority', value: s.low }, { label: 'Clusters detected', value: s.clustersTotal }, { label: 'Clusters needing review', value: s.clustersFlagged }, { label: 'Resolved cases', value: s.resolved }])}</table>
<h2>Indicators triggered</h2><table>${li(trig)}</table><h2>Case statuses</h2><table>${li(caseDist)}</table><h2>Human dispositions</h2><table>${li(disp)}</table>
<h2>Clusters</h2><table>${result.clusters.map((c) => `<tr><td>${c.id}</td><td>${escapeHtml(c.barangayName)} - ${escapeHtml(c.sitioOrArea)}</td><td>${c.size} apps</td><td>${escapeHtml(c.status)}</td></tr>`).join('')}</table></body></html>`
    download('once-ai-summary-report.html', 'text/html', html)
    dispatch({ type: 'logView', action: 'EXPORT', target: 'summary-report', detail: 'Summary report exported as HTML' })
  }

  return (
    <div className="page">
      <PageHead title="Analytics & Reports" feature="ERB Triage Dashboard">
        Summary of screening activity, anomaly categories, geographic patterns and investigation outcomes. All figures are computed from the current dataset and update as cases are worked.
      </PageHead>
      <SyntheticBanner />
      <div className="row"><button className="btn primary" onClick={exportReport}>Download summary report (HTML)</button><button className="btn" onClick={exportApps}>Export screening results (CSV)</button><button className="btn" onClick={exportClusters}>Export clusters (CSV)</button></div>
      <div className="grid g4">
        <Stat value={s.total} label="Applications screened" /><Stat value={`${Math.round((s.flagged / s.total) * 100)}%`} label="Recommended for human review" tone="mod" /><Stat value={mitig} label="Geo flags mitigated by known-building context" /><Stat value={s.resolved} label="Resolved by a human disposition" tone="ok" />
      </div>
      <div className="grid g2">
        <Card title="Anomaly categories (indicators triggered)"><HBars rows={trig} /></Card>
        <Card title="Address standardization outcomes"><HBars rows={addrStatus} /></Card>
        <Card title="Case pipeline"><HBars rows={caseDist} /></Card>
        <Card title="Investigation outcomes (human dispositions)">{disp.some((d) => d.value) ? <HBars rows={disp} /> : <span className="muted small">No cases resolved yet. Resolve a case in Investigation Cases and this chart updates.</span>}</Card>
        <Card title="Weekly intake (12 weeks)"><VBars data={weekly} /></Card>
        <Card title="Cluster summary">
          <div className="tablewrap"><table><thead><tr><th>Cluster</th><th>Area</th><th>Apps</th><th>Status</th></tr></thead>
            <tbody>{result.clusters.map((c) => <tr key={c.id}><td className="mono">{c.id}</td><td className="small">{c.barangayName} - {c.sitioOrArea}</td><td>{c.size}</td><td className="small">{c.status}</td></tr>)}</tbody></table></div>
        </Card>
      </div>
    </div>
  )
}
