import React from 'react'
import { useApp } from '../store.jsx'
import { Card, Stat, PageHead, SyntheticBanner, RiskBadge, ScoreRing, HBars, VBars, CountUp, EmptyState } from '../components/ui.jsx'
import { caseOf, INDICATORS } from '../lib/pipeline.js'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { BARANGAYS } from '../lib/gazetteer.js'

export default function Dashboard({ go }) {
  const { result, summary: s, state, openApp } = useApp()
  const queue = result.apps.filter((a) => a.label !== 'Low' && caseOf(state.caseState, a.id).status !== 'Resolved').sort((a, b) => b.score - a.score).slice(0, 8)
  const byB = BARANGAYS.map((b) => {
    const mine = result.apps.filter((a) => a.addr.barangayId === b.id)
    const hi = mine.filter((a) => a.label === 'High').length
    const mo = mine.filter((a) => a.label === 'Moderate').length
    return { label: b.name, total: mine.length, parts: [{ value: hi, color: 'var(--high)', title: 'High' }, { value: mo, color: 'var(--mod)', title: 'Moderate' }, { value: mine.length - hi - mo, color: 'var(--low)', title: 'Low' }] }
  })
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = result.now - i * 7 * 86400000
    const n = result.apps.filter((a) => +new Date(a.submittedAt) <= end && +new Date(a.submittedAt) > end - 7 * 86400000).length
    return { label: `W-${i}`, value: n }
  }).reverse()
  const noAddr = result.apps.filter((a) => !a.addr.barangayId).length

  return (
    <div className="page">
      <PageHead title="Operations Dashboard" feature="ERB Triage Dashboard" hero={
        <>
          <button className="hero-stat" onClick={() => go('intake')}><b><CountUp value={s.total} /></b><span>Applications screened</span></button>
          <button className="hero-stat" onClick={() => go('screening')}><b><CountUp value={s.flagged} /></b><span>For human review</span></button>
          <button className="hero-stat strong" onClick={() => go('cases')}><b><CountUp value={queue.length} /></b><span>High-priority cases</span></button>
          <button className="btn hero-cta" onClick={() => document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' })}>Open priority queue <ArrowRight size={16} /></button>
        </>
      }>
        Spot unusual voter-registration patterns before rolls are finalized. ONCE AI recommends cases for human review; the Election Registration Board decides.
      </PageHead>
      <SyntheticBanner full />

      <div className="grid g4">
        <Stat value={`${s.clustersFlagged} / ${s.clustersTotal}`} label="Geographic clusters needing review / detected" tone="gold" onClick={() => go('geo')} hint="DBSCAN clusters; those plausibly explained by known buildings are not counted as needing review" />
        <Stat value={s.hwApps} label={`Potential handwriting similarities (${s.hwGroups} groups, simulated)`} onClick={() => go('screening')} zeroNote="No similar handwriting detected." />
        <Stat value={s.addrIncons} label="Address inconsistencies" onClick={() => go('screening')} zeroNote="No inconsistencies found." />
        <Stat value={s.pending} label={`Pending investigations in progress (+${s.awaiting} awaiting triage)`} onClick={() => go('cases')} zeroNote="No active investigations yet. Open a case from the queue." />
      </div>

      <Card title="Screening workflow" sub="Every number is derived from the same application records">
        <div className="flow">
          {[
            ['intake', 'Intake', s.total, 'applications received'],
            ['intake', 'Address standardization', s.total - s.unresolved, `resolved (${s.unresolved} need manual check)`],
            ['screening', 'Document analysis', result.apps.filter((a) => a.document).length, 'forms compared (simulated)'],
            ['geo', 'Anomaly analysis', s.clustersTotal, 'clusters detected'],
            ['cases', 'ERB triage', s.triage.length, 'cases in triage'],
            ['system', 'Audit dossier', state.audit.length, state.audit.length ? 'audited actions logged' : 'actions appear here as reviewers work'],
          ].map(([pg, name, val, text], i) => (
            <button key={name} className="step" onClick={() => go(pg)}>
              <span className="dot">{i + 1}</span>
              <span className="n">{name}</span><b><CountUp value={val} /></b><span>{text}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid g-main">
        <Card title="Priority review queue" sub="Highest priority first - click to open the dossier" className="accent" id="queue">
          <div className="queue">
            {queue.map((a) => {
              const trig = INDICATORS.filter((ind) => a.indicators[ind.key]?.result === 'Triggered')
              return (
                <button key={a.id} className={`qrow ${a.label === 'High' ? 'hi' : 'mod'}`} onClick={() => openApp(a.id)}>
                  <ScoreRing score={a.score} label={a.label} />
                  <span className="qmain">
                    <span className="qtop"><b className="mono">{a.id}</b><RiskBadge label={a.label} /></span>
                    <span className="small muted">Brgy. {a.addr.components.barangay || 'unresolved'} · {trig.length} of {INDICATORS.length} indicators</span>
                    <span className="qchips">{trig.map((t) => <span key={t.key} className="chip-ind">{t.label}</span>)}</span>
                  </span>
                  <ArrowRight size={16} className="qgo" aria-hidden />
                </button>)
            })}
            {!queue.length && <EmptyState title="Nothing waiting for review" icon={ShieldCheck}>No open flagged applications. New intake appears here automatically.</EmptyState>}
          </div>
        </Card>
        <div className="grid">
          <Card title="Applications by declared barangay" sub={noAddr ? `${noAddr} with no resolvable barangay not shown` : ''}>
            <HBars rows={byB} />
            <div className="row small muted" style={{ marginTop: 8 }}><span style={{ color: 'var(--high)' }}>■ High</span><span style={{ color: 'var(--mod)' }}>■ Moderate</span><span style={{ color: 'var(--low)' }}>■ Low</span></div>
          </Card>
          <Card title="Intake volume (last 8 weeks)"><VBars data={weeks} /></Card>
        </div>
      </div>
    </div>
  )
}
