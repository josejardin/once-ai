import React from 'react'
import { strokesFromEmbedding } from '../lib/handwriting.js'

// Visual stand-in for a scanned handwriting sample. Strokes are generated from the synthetic embedding.
export function HandwritingSample({ app, caption }) {
  if (!app?.document) return <div className="muted small">No scanned form on file.</div>
  const s = strokesFromEmbedding(app.document.embedding)
  return (
    <figure style={{ margin: 0 }}>
      <div className="sheet">
        <svg viewBox={`0 0 ${s.width} ${s.height}`} role="img" aria-label={`Synthetic handwriting sample for ${app.id}`}>
          {s.lines.map((d, i) => <path key={i} d={d} fill="none" stroke="#2b2f3a" strokeWidth={s.pressure} strokeLinecap="round" strokeLinejoin="round" opacity=".88" />)}
        </svg>
      </div>
      <figcaption className="small muted" style={{ marginTop: 4 }}>{caption || app.id} - synthetic rendering, scan quality {Math.round(app.document.scanQuality * 100)}%</figcaption>
    </figure>
  )
}
