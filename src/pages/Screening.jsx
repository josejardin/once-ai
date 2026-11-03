import React, { useMemo, useState } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, RiskBadge, ScoreBar, SimBadge, SyntheticBanner, Tabs, LABEL_COLOR } from '../components/ui.jsx'
import { DEFAULT_CONFIG, INDICATORS } from '../lib/pipeline.js'
import { HandwritingSample } from '../components/Handwriting.jsx'
import { cosine } from '../lib/handwriting.js'

const IND_COLORS = { geo: '#c0272d', address: '#374151', unresolved: '#9ca3af', handwriting: '#f59e0b', batch: '#6b1519' }

export default function Screening() {
  const { result, state, dispatch, perm, openApp, notify } = useApp()
  const [tab, setTab] = useState('indicators')
  const [sel, setSel] = useState(null)
  const [flt, setFlt] = useState('flagged')
  const [pairSel, setPairSel] = useState(0)
  const cfg = state.config

  const list = result.apps.filter((a) => (flt === 'flagged' ? a.label !== 'Low' : flt === 'all' ? true : a.label === flt)).sort((a, b) => b.score - a.score)
  const cur = result.byId[sel] || list[0]

  const setCfg = (patch, detail) => perm.canConfig && dispatch({ type: 'config', config: { ...cfg, ...patch }, detail })
  const setW = (k, v) => setCfg({ weights: { ...cfg.weights, [k]: v } }, `Weight for "${k}" set to ${v} (provisional demonstration setting)`)

  const pairs = result.handwriting.pairs
  const pair = pairs[Math.min(pairSel, pairs.length - 1)]
  const pa = pair && result.byId[pair.a]
  const pb = pair && result.byId[pair.b]
  const dist = useMemo(() => {
    const docs = result.apps.filter((a) => a.document)
    const bins = Array(10).fill(0)
    for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
      const s = cosine(docs[i].document.embedding, docs[j].document.embedding)
      bins[Math.max(0, Math.min(9, Math.floor((s + 1) * 5)))]++
    }
    return bins
  }, [result.apps])

  return (
    <div className="page">
      <PageHead title="AI Screening" feature="ERB Triage | Batch Forgery Detector">
        Explainable screening. Each application is assessed on five independent indicators; each has its own result, explanation, evidence and review status. The combined score only orders the review queue.
      </PageHead>
      <SyntheticBanner />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'indicators', label: 'Indicators & prioritization' }, { id: 'handwriting', label: 'Handwriting similarity (Batch Forgery Detector)' }, { id: 'config', label: 'Provisional settings' }]} />

      {tab === 'indicators' && (
        <div className="split">
          <Card title="Applications" sub={`${list.length}`}>
            <select value={flt} onChange={(e) => setFlt(e.target.value)} style={{ marginBottom: 8 }} aria-label="Priority filter"><option value="flagged">Flagged (Moderate + High)</option><option value="High">High only</option><option value="Moderate">Moderate only</option><option value="Low">Low only</option><option value="all">All</option></select>
            <div className="tablewrap" style={{ maxHeight: 620 }}><table><tbody>
              {list.map((a) => (
                <tr key={a.id} className={`click ${cur?.id === a.id ? 'sel' : ''}`} onClick={() => setSel(a.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(a.id)}>
                  <td className="mono">{a.id}<div className="small muted">{a.addr.components.barangay || 'unresolved'}</div></td>
                  <td style={{ width: 90 }}><ScoreBar score={a.score} label={a.label} /><div className="small mono muted">{a.score}</div></td>
                  <td><RiskBadge label={a.label} /></td>
                </tr>))}
            </tbody></table></div>
          </Card>
          {cur ? (
            <div className="grid">
              <Card title={<>{cur.id} <RiskBadge label={cur.label} /></>} sub={`Priority score ${cur.score}/100`}>
                <div className="small muted">How the score was composed (provisional weights - not validated):</div>
                <div className="bar" style={{ height: 18, margin: '6px 0' }}>{cur.contributions.map((c) => <i key={c.key} style={{ width: `${c.points}%`, background: IND_COLORS[c.key] }} title={`${INDICATORS.find((x) => x.key === c.key).label}: ${c.points.toFixed(1)} pts`} />)}</div>
                <div className="row small">{INDICATORS.map((d) => <span key={d.key} style={{ color: IND_COLORS[d.key] }}>■ {d.label.split(' ')[0]} {cur.contributions.find((c) => c.key === d.key).points.toFixed(0)}</span>)}</div>
                {cur.cappedByRule && <div className="banner info small" style={{ marginTop: 8 }}>The score is in the High range, but fewer than two independent indicators are triggered, so the label is capped at Moderate (a single signal never makes a case High).</div>}
                <div className="row" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => openApp(cur.id)}>Open dossier</button></div>
              </Card>
              {INDICATORS.map((d) => {
                const x = cur.indicators[d.key]
                const k = `${cur.id}:${d.key}`
                return (
                  <div key={d.key} className={`ind ${x.result === 'Triggered' ? 'trig' : x.result === 'Mitigated by context' ? 'mit' : ''}`}>
                    <div className="row" style={{ justifyContent: 'space-between' }}><b>{d.label}</b><Badge tone={x.result === 'Triggered' ? 'mod' : x.result === 'Mitigated by context' ? 'info' : x.result === 'Not triggered' ? 'low' : 'off'}>{x.result}</Badge></div>
                    <div className="small muted">{d.feature}{d.key === 'handwriting' && <> <SimBadge /></>}</div>
                    <div className="small">{x.explanation}</div>
                    {x.evidence.length > 0 && <div className="row small"><span className="muted">Evidence:</span>{x.evidence.map((e, i) => e.type === 'app' ? <button key={i} className="chip mono" onClick={() => setSel(e.id)}>{e.id}</button> : <span key={i} className="chip">{e.id || e.text}</span>)}</div>}
                    <div className="row small"><span className="muted">Review status:</span>
                      <select style={{ width: 'auto' }} disabled={!perm.canEdit} value={state.indicatorReview[k] || 'Unreviewed'} onChange={(e) => dispatch({ type: 'indicatorReview', key: k, value: e.target.value })} aria-label={`Review status ${d.label}`}><option>Unreviewed</option><option>Concern noted</option><option>Dismissed after review</option></select></div>
                  </div>
                )
              })}
            </div>
          ) : <Card><span className="muted">No applications in this filter.</span></Card>}
        </div>
      )}

      {tab === 'handwriting' && (
        <>
          <div className="banner alert"><b>Simulated analysis.</b> No OCR engine or trained Siamese Neural Network is integrated in this prototype. Synthetic documents carry simulated 24-dimension embeddings, compared by cosine similarity - the comparison step a Siamese network performs on learned embeddings. <b>A similarity score is not proof of forgery or common authorship</b>; natural similarity and scan quality both matter.</div>
          <div className="grid g-main">
            <Card title="Potentially related applications" sub={`${pairs.length} pairs ≥ ${cfg.hwThreshold} · ${result.handwriting.groups.length} groups`}>
              <div className="tablewrap" style={{ maxHeight: 420 }}><table>
                <thead><tr><th>Form A</th><th>Form B</th><th>Similarity (simulated)</th><th>Notes</th></tr></thead>
                <tbody>{pairs.map((p, i) => (
                  <tr key={p.a + p.b} className={`click ${i === pairSel ? 'sel' : ''}`} onClick={() => setPairSel(i)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPairSel(i)}>
                    <td className="mono">{p.a}</td><td className="mono">{p.b}</td><td className="mono">{p.sim.toFixed(3)}</td><td className="small">{p.lowQuality ? <Badge tone="mod">low scan quality</Badge> : ''}</td>
                  </tr>))}
                  {!pairs.length && <tr><td colSpan="4" className="muted">No pairs reach the threshold.</td></tr>}</tbody></table></div>
              <div className="row small" style={{ marginTop: 10 }}>{result.handwriting.groups.map((g) => <Badge key={g.id} tone="sim" title={g.ids.join(', ')}>{g.id}: {g.ids.length} forms</Badge>)}</div>
            </Card>
            <Card title="Pairwise similarity distribution" sub="all form pairs">
              <div className="vbars">{dist.map((v, i) => <div className="vbar" key={i} title={`similarity ${(i / 5 - 1).toFixed(1)} to ${((i + 1) / 5 - 1).toFixed(1)}: ${v} pairs`}><span>{v}</span><i style={{ height: `${Math.max(2, (Math.log10(v + 1) / Math.log10(Math.max(...dist) + 1)) * 100)}%`, background: i >= 9 ? 'var(--mod)' : 'var(--blue)' }} /><span>{(i / 5 - 1).toFixed(1)}</span></div>)}</div>
              <div className="small muted">Log-scaled counts. Nearly all pairs are unrelated; the right-most bin holds the unusually similar pairs.</div>
            </Card>
          </div>
        </>
      )}

      {tab === 'config' && (
        <Card title="Provisional demonstration settings" sub={perm.canConfig ? 'Administrator' : 'Read-only - switch to Administrator to edit'}>
          <div className="banner" style={{ marginBottom: 12 }}>These weights and thresholds are <b>illustrative, not scientifically validated</b>. They exist to show that prioritization is configurable and explainable. Changing them recomputes every page immediately.</div>
          <div className="grid g2">
            <div>
              <h3 style={{ marginBottom: 8 }}>Indicator weights</h3>
              {INDICATORS.map((d) => (
                <div className="field" key={d.key} style={{ marginBottom: 8 }}><label htmlFor={'w' + d.key}>{d.label}: <b>{cfg.weights[d.key]}</b></label>
                  <input id={'w' + d.key} type="range" min="0" max="50" value={cfg.weights[d.key]} disabled={!perm.canConfig} onChange={(e) => setW(d.key, Number(e.target.value))} /></div>
              ))}
              <h3 style={{ margin: '14px 0 8px' }}>Priority label thresholds (score 0-100)</h3>
              <div className="grid g2">
                <div className="field"><label>Moderate from</label><input type="number" min="1" max="99" value={cfg.thresholds.moderate} disabled={!perm.canConfig} onChange={(e) => setCfg({ thresholds: { ...cfg.thresholds, moderate: Number(e.target.value) } }, `Moderate threshold set to ${e.target.value}`)} /></div>
                <div className="field"><label>High from (needs ≥ 2 triggered indicators)</label><input type="number" min="1" max="100" value={cfg.thresholds.high} disabled={!perm.canConfig} onChange={(e) => setCfg({ thresholds: { ...cfg.thresholds, high: Number(e.target.value) } }, `High threshold set to ${e.target.value}`)} /></div>
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>Detection parameters</h3>
              <div className="grid g2">
                <div className="field"><label>DBSCAN eps (metres)</label><input type="number" min="10" max="500" value={cfg.eps} disabled={!perm.canConfig} onChange={(e) => setCfg({ eps: Number(e.target.value) }, `DBSCAN eps set to ${e.target.value} m`)} /></div>
                <div className="field"><label>DBSCAN minPts</label><input type="number" min="2" max="30" value={cfg.minPts} disabled={!perm.canConfig} onChange={(e) => setCfg({ minPts: Number(e.target.value) }, `DBSCAN minPts set to ${e.target.value}`)} /></div>
                <div className="field"><label>Handwriting similarity threshold</label><input type="number" step="0.01" min="0.5" max="0.99" value={cfg.hwThreshold} disabled={!perm.canConfig} onChange={(e) => setCfg({ hwThreshold: Number(e.target.value) }, `Handwriting threshold set to ${e.target.value}`)} /></div>
                <div className="field"><label>Batch size trigger</label><input type="number" min="2" max="30" value={cfg.batchMin} disabled={!perm.canConfig} onChange={(e) => setCfg({ batchMin: Number(e.target.value) }, `Batch trigger set to ${e.target.value}`)} /></div>
              </div>
              <div style={{ marginTop: 14 }}><button className="btn" disabled={!perm.canConfig} onClick={() => { dispatch({ type: 'config', config: DEFAULT_CONFIG, detail: 'Settings restored to provisional defaults' }); notify('Defaults restored.') }}>Restore defaults</button></div>
              <div className="small muted" style={{ marginTop: 10 }}>Defaults produce High: {result.apps.filter((a) => a.label === 'High').length}, Moderate: {result.apps.filter((a) => a.label === 'Moderate').length} for the current dataset.</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
