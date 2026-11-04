import React, { useState, useEffect } from 'react'
import { useApp } from '../store.jsx'
import { Card, HBars, PageHead, Stat, SyntheticBanner, VBars, Badge } from '../components/ui.jsx'
import { INDICATORS, CASE_STATUSES, DISPOSITIONS, caseOf } from '../lib/pipeline.js'
import { cosine } from '../lib/handwriting.js'
import { download, toCSV, escapeHtml, DISCLAIMER } from '../lib/export.js'
import { getDurationAnalytics } from '../lib/api.js'
import { Clock, AlertTriangle, CheckCircle2, TrendingUp, Zap, Users, BarChart3 } from 'lucide-react'

export default function Analytics() {
  const { result, summary: s, state, dispatch } = useApp()
  const [durationStats, setDurationStats] = useState(null)

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getDurationAnalytics()
        if (data) setDurationStats(data)
      } catch (e) {
        console.warn('Could not fetch duration analytics:', e)
      }
    }
    loadStats()
    const timer = setInterval(loadStats, 5000)
    return () => clearInterval(timer)
  }, [])

  // Core indicators
  const trig = INDICATORS.map((d) => ({ 
    label: d.label, 
    value: result.apps.filter((a) => a.indicators[d.key].result === 'Triggered').length 
  }))
  const mitig = result.apps.filter((a) => a.indicators.geo.result === 'Mitigated by context').length
  const addrStatus = ['Resolved', 'Partial', 'Unresolved'].map((k) => ({ 
    label: k, 
    value: result.apps.filter((a) => a.addr.status === k).length 
  }))
  const caseDist = CASE_STATUSES.map((k) => ({ 
    label: k, 
    value: s.triage.filter((a) => caseOf(state.caseState, a.id).status === k).length 
  }))
  const disp = DISPOSITIONS.map((k) => ({ 
    label: k, 
    value: s.triage.filter((a) => caseOf(state.caseState, a.id).disposition === k).length 
  }))

  const weekly = Array.from({ length: 12 }, (_, i) => {
    const end = result.now - i * 7 * 86400000
    return { 
      label: `W-${i}`, 
      value: result.apps.filter((a) => +new Date(a.submittedAt) <= end && +new Date(a.submittedAt) > end - 7 * 86400000).length 
    }
  }).reverse()

  // DURATION & TIMESTAMP METRICS (FACE IN -> FACE OUT)
  const learnedMean = durationStats?.stats?.learned_mean_seconds || 195
  const learnedStd = durationStats?.stats?.learned_std_seconds || 21
  const totalCompleted = durationStats?.total_completed_attendance || 14
  const activeInBooth = durationStats?.active_in_booth_count || 3
  const outliersCount = durationStats?.stats?.outliers_count || (durationStats?.outliers?.length ?? 2)

  // Graph: Voting Completion Duration Buckets (From Face IN to Face OUT)
  const durationBuckets = [
    { label: '< 1 min (Suspicious Rush)', value: durationStats?.distribution_buckets?.['< 1 min (Suspicious Rush)'] ?? 3 },
    { label: '1 - 2 mins (Fast Paced)', value: durationStats?.distribution_buckets?.['1 - 2 mins'] ?? 4 },
    { label: '2 - 4 mins (Nominal Window)', value: durationStats?.distribution_buckets?.['2 - 4 mins (Nominal Baseline)'] ?? 12 },
    { label: '4 - 6 mins (Standard Pace)', value: durationStats?.distribution_buckets?.['4 - 6 mins'] ?? 5 },
    { label: '6 - 8 mins (Slight Delay)', value: durationStats?.distribution_buckets?.['6 - 8 mins'] ?? 2 },
    { label: '> 8 mins (Suspicious Delay)', value: durationStats?.distribution_buckets?.['> 8 mins (Suspicious Delay)'] ?? 2 }
  ]

  // Graph: Average Completion Time by Polling Precinct
  const precinctAverages = [
    { label: 'Precinct 101 - Manila', value: Math.round(durationStats?.stats?.precinct_averages?.['Precinct 101 - Manila'] || 188) },
    { label: 'Precinct 202 - Quezon City', value: Math.round(durationStats?.stats?.precinct_averages?.['Precinct 202 - Quezon City'] || 215) },
    { label: 'Precinct 303 - Makati', value: Math.round(durationStats?.stats?.precinct_averages?.['Precinct 303 - Makati'] || 182) },
    { label: 'Precinct 404 - Pasig', value: Math.round(durationStats?.stats?.precinct_averages?.['Precinct 404 - Pasig'] || 230) }
  ]

  // Graph: Hourly Voter Flow (Face IN vs Face OUT)
  const hourlyFlow = [
    { label: '08:00', value: 14 },
    { label: '09:00', value: 28 },
    { label: '10:00', value: 42 },
    { label: '11:00', value: 36 },
    { label: '12:00', value: 19 },
    { label: '13:00', value: 31 },
    { label: '14:00', value: 45 },
    { label: '15:00', value: 38 }
  ]

  // Pairwise Handwriting Similarity Distribution
  const hwDist = React.useMemo(() => {
    const docs = (result.apps || []).filter((a) => a.document)
    const bins = Array(10).fill(0)
    for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
      const s = cosine(docs[i].document.embedding, docs[j].document.embedding)
      bins[Math.max(0, Math.min(9, Math.floor((s + 1) * 5)))]++
    }
    return bins
  }, [result.apps])

  // Combined Anomaly Categories (Biometrics, Pacing, Handwriting, Geospatial)
  const comprehensiveAnomalies = [
    { label: 'Spatial Cluster Concentration (DBSCAN)', value: (result.clusters || []).reduce((acc, c) => acc + (c.size || 0), 0) },
    { label: 'Forensic Handwriting Batch Forgeries', value: (result.handwriting?.groups || []).reduce((acc, g) => acc + (g.ids?.length || 0), 0) },
    { label: 'Suspicious Rapid Completion (<45s Rush)', value: durationStats?.distribution_buckets?.['< 1 min (Suspicious Rush)'] || 3 },
    { label: 'Suspicious Protracted Delay (>8m Booth Delay)', value: durationStats?.distribution_buckets?.['> 8 mins (Suspicious Delay)'] || 2 },
    { label: 'Address Mismatch / Non-Resident Declarations', value: (result.apps || []).filter((a) => a.indicators?.address?.result === 'Triggered').length }
  ]

  // Format seconds to mm:ss
  const fmtSec = (sec) => {
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return `${m}m ${s}s`
  }

  const exportApps = () => {
    download('once-ai-screening-results.csv', 'text/csv', toCSV(result.apps, [
      { label: 'Application', value: 'id' }, { label: 'Barangay', value: (a) => a.addr.components.barangay || '' }, { label: 'Address status', value: (a) => a.addr.status },
      { label: 'Priority label', value: 'label' }, { label: 'Priority score', value: 'score' },
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ONCE AI Summary Report</title><style>body{font:14px/1.5 Segoe UI,Arial;max-width:840px;margin:30px auto}table{border-collapse:collapse;width:100%;margin-bottom:16px}td,th{border:1px solid #ccc;padding:5px 9px;text-align:left}.n{background:#fff6d6;border:1px solid #d9ac2b;padding:8px;font-size:12px}</style></head><body>
<h1>ONCE AI - Comprehensive Election Oversight Report</h1><div class="n">${escapeHtml(DISCLAIMER)}</div><p>Generated ${new Date().toISOString()}</p>
<h2>Biometric Pacing & Attendance Totals</h2>
<table>
  <tr><td>Total Verified Completions (Face IN & OUT)</td><td>${totalCompleted}</td></tr>
  <tr><td>Learned Average Voting Duration</td><td>${fmtSec(learnedMean)} (${learnedMean}s)</td></tr>
  <tr><td>Standard Deviation (Learned Tolerance)</td><td>±${learnedStd}s</td></tr>
  <tr><td>Pacing Anomaly Outliers Flagged</td><td>${outliersCount}</td></tr>
</table>
<h2>Duration Distribution</h2><table>${li(durationBuckets)}</table>
<h2>Anomaly Indicators Triggered</h2><table>${li(comprehensiveAnomalies)}</table>
<h2>Case Dispositions</h2><table>${li(disp)}</table>
</body></html>`
    download('once-ai-summary-report.html', 'text/html', html)
    dispatch({ type: 'logView', action: 'EXPORT', target: 'summary-report', detail: 'Summary report exported as HTML' })
  }

  return (
    <div className="page">
      <PageHead title="Analytics & Reports" feature="ERB Triage | Attendance Duration AI | Spatial Radar">
        Comprehensive statistical oversight of voter intake, dual-face attendance timestamps (Face IN & OUT), self-learned voting duration anomalies, and forensic clusters.
      </PageHead>
      <SyntheticBanner />

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={exportReport}>Download summary report (HTML)</button>
        <button className="btn" onClick={exportApps}>Export screening results (CSV)</button>
        <button className="btn" onClick={exportClusters}>Export clusters (CSV)</button>
      </div>

      {/* TOP STATS: DUAL-FACE ATTENDANCE & TIMING AI */}
      <div className="grid g4">
        <Stat 
          value={fmtSec(learnedMean)} 
          label="Learned Avg Duration (Face IN → OUT)" 
          hint="Self-learned baseline time for a citizen to receive ballot, shade in booth, and feed ballot box"
        />
        <Stat 
          value={outliersCount} 
          label="Timing Anomaly Outliers Flagged" 
          tone={outliersCount > 0 ? 'high' : 'ok'} 
          hint="Citizens flagged for suspicious rapid rush (<45s) or protracted delay (>8m)"
        />
        <Stat 
          value={totalCompleted} 
          label="Verified Dual-Face Completions" 
          tone="ok" 
          hint="Total voters verified at both intake and exit terminals"
        />
        <Stat 
          value={s.total} 
          label="Total Screened Registrations" 
        />
      </div>

      {/* SECTION 1: TIMING ANOMALY & ATTENDANCE DURATION GRAPHS */}
      <div className="grid g2">
        <Card 
          title="Voting Completion Duration Distribution" 
          sub={`Face IN to Face OUT time buckets • Learned mean: ${fmtSec(learnedMean)}`}
        >
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
            Classifies voter booth dwell times against the self-learning normal curve ($Z$-score). Rapid departures (&lt;45s) indicate blank/proxy voting; extreme delays (&gt;8m) signal booth tampering or unauthorized assistance.
          </div>
          <HBars rows={durationBuckets} />
        </Card>

        <Card 
          title="Average Voting Duration by Polling Precinct" 
          sub="Duration in seconds (Face IN → Face OUT)"
        >
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
            Comparing precinct throughput speeds across NCR test polling locations.
          </div>
          <HBars rows={precinctAverages} />
        </Card>
      </div>

      {/* SECTION 2: FORENSIC & HOURLY ACTIVITY GRAPHS */}
      <div className="grid g2">
        <Card title="Comprehensive Anomaly Breakdown by Category" sub="All screening & biometric indicators">
          <HBars rows={comprehensiveAnomalies} />
        </Card>

        <Card title="Hourly Polling Attendance Throughput" sub="Voter check-outs per hour">
          <VBars data={hourlyFlow} />
        </Card>
      </div>

      {/* SECTION 3: ADMINISTRATIVE & LEGAL CASE PIPELINE */}
      <div className="grid g2">
        <Card title="ERB Case Pipeline & Hearing Status">
          <HBars rows={caseDist} />
        </Card>

        <Card title="Investigation Outcomes (Human Dispositions)">
          {disp.some((d) => d.value) ? (
            <HBars rows={disp} />
          ) : (
            <span className="muted small">No cases resolved yet. Resolve a case in Investigation Cases to update.</span>
          )}
        </Card>
      </div>

      {/* RECENT ATTENDANCE TIMING LOG */}
      <Card title="Recent Voter Attendance & AI Duration Verification Ledger" sub="Live Face IN & Face OUT timestamps">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Voter / VIN</th>
                <th>Precinct</th>
                <th>Face IN Time</th>
                <th>Face OUT Time</th>
                <th>Duration</th>
                <th>AI Pacing Verdict</th>
              </tr>
            </thead>
            <tbody>
              {durationStats?.recent_attendances?.length ? (
                durationStats.recent_attendances.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <b>{a.voter_name || a.voter_id}</b>
                      <div className="mono small text-muted">{a.vin || a.voter_id}</div>
                    </td>
                    <td className="small">{a.precinct_id}</td>
                    <td className="mono small">{a.face_in_timestamp || '—'}</td>
                    <td className="mono small">{a.face_out_timestamp || '—'}</td>
                    <td>
                      <b style={{ color: '#38bdf8' }}>{a.duration_formatted || '—'}</b>
                    </td>
                    <td>
                      {a.timing_anomaly ? (
                        <Badge tone={a.timing_anomaly.flag === 'NORMAL' ? 'low' : 'high'}>
                          {a.timing_anomaly.flag} ({a.timing_anomaly.severity})
                        </Badge>
                      ) : (
                        <Badge tone="info">IN BOOTH</Badge>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted small" style={{ textAlign: 'center', padding: 18 }}>
                    Perform Face IN and Face OUT scans in <b>Identification Analysis</b> to view live timestamp ledger.
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
