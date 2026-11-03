import React from 'react'
import { DISCLAIMER } from '../lib/export.js'
import { Info, Inbox } from 'lucide-react'

// Animated number (respects prefers-reduced-motion). Non-numeric values render as-is.
export function CountUp({ value, duration = 700 }) {
  const num = typeof value === 'number' && Number.isFinite(value)
  const [v, setV] = React.useState(num ? 0 : value)
  React.useEffect(() => {
    if (!num) { setV(value); return }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return }
    let raf; const t0 = performance.now()
    const tick = (t) => { const p = Math.min(1, (t - t0) / duration); setV(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, num, duration])
  return <>{v}</>
}

export function EmptyState({ title, children, icon: Icon = Inbox }) {
  return <div className="empty"><Icon size={26} strokeWidth={1.6} aria-hidden /><b>{title}</b>{children && <span>{children}</span>}</div>
}

// Circular priority score (review order only, not a probability)
export function ScoreRing({ score, label, size = 44 }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Priority score ${score} of 100`}>
      <title>{`Priority score ${score} / 100 (review order, not a probability of fraud)`}</title>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LABEL_COLOR[label]} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-arc" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3} fontWeight="800" fill="var(--text)">{score}</text>
    </svg>
  )
}

export const LABEL_TONE = { Low: 'low', Moderate: 'mod', High: 'high' }
export const LABEL_COLOR = { Low: 'var(--low)', Moderate: 'var(--mod)', High: 'var(--high)' }

export function Badge({ tone = 'info', children, title }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>
}
export const RiskBadge = ({ label }) => <Badge tone={LABEL_TONE[label]} title="Review priority only - not a finding of guilt">{label} priority</Badge>
export const SimBadge = ({ children = 'Simulated' }) => <Badge tone="sim" title="Simulated result: no trained model or external service is operating">{children}</Badge>

export function Stat({ value, label, tone, onClick, hint, zeroNote }) {
  return (
    <div className={`card stat ${tone || ''} ${onClick ? 'click' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()} title={hint}>
      <div className="v"><CountUp value={value} /></div>
      <div className="l">{label}</div>
      {value === 0 && zeroNote && <div className="zero-note">{zeroNote}</div>}
    </div>
  )
}

export function Card({ title, sub, children, className = '', id }) {
  return (
    <section id={id} className={`card ${className}`}>
      {title && <h2>{title}{sub && <span className="sub">{sub}</span>}</h2>}
      {children}
    </section>
  )
}

export function PageHead({ title, feature, children, hero }) {
  return (
    <header className={`page-head ${hero ? 'has-hero' : ''}`}>
      <div className="ph-main">
        {feature && <div className="ph-tags">{feature.split('|').map((f) => <span key={f} className="feature-tag">{f.trim()}</span>)}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {hero && <div className="ph-hero">{hero}</div>}
    </header>
  )
}

export const SyntheticBanner = ({ full = false }) => full
  ? <div className="banner" role="note"><b>Synthetic demonstration data.</b> {DISCLAIMER.replace('SYNTHETIC DEMONSTRATION DATA. ', '')}</div>
  : <div className="note-strip" role="note" title={DISCLAIMER}><Info size={14} aria-hidden /><span><b>Synthetic demo data.</b> Priority = review order only, not a finding of fraud. The ERB decides.</span></div>

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>
}

export function HBars({ rows, max, colors }) {
  const m = max || Math.max(1, ...rows.map((r) => r.total ?? r.value))
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="barrow" key={r.label}>
          <span title={r.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div className="bar">
            {(r.parts || [{ value: r.value, color: colors?.[0] || 'var(--blue)' }]).map((p, i) => <i key={i} style={{ width: `${(p.value / m) * 100}%`, background: p.color }} title={p.title || ''} />)}
          </div>
          <span className="mono" style={{ textAlign: 'right' }}>{r.total ?? r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function VBars({ data }) {
  const m = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="vbars">
      {data.map((d) => (
        <div className="vbar" key={d.label} title={`${d.label}: ${d.value}`}>
          <span>{d.value}</span>
          <i style={{ height: `${(d.value / m) * 100}%` }} />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function ScoreBar({ score, label }) {
  return <div className="scorebar" title={`Priority score ${score} / 100 (not a probability of fraud)`}><i style={{ width: `${score}%`, background: LABEL_COLOR[label] }} /></div>
}

export function Drawer({ onClose, children }) {
  React.useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 6 }}><button className="btn sm" onClick={onClose}>Close (Esc)</button></div>
        {children}
      </aside>
    </div>
  )
}

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
export const fmtTime = (iso) => new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
