import React from 'react'
import { strokesFromEmbedding } from '../lib/handwriting.js'

// Visual representation for a scanned handwriting / signature sample in authentic cursive penmanship.
export function HandwritingSample({ app, caption }) {
  if (!app?.document) return <div className="muted small">No scanned form on file.</div>
  const s = strokesFromEmbedding(app.document.embedding)
  return (
    <figure style={{ margin: 0 }}>
      <div 
        className="sheet" 
        style={{ 
          position: 'relative', 
          overflow: 'hidden', 
          backgroundColor: '#fdfcf9', 
          border: '1.5px solid #dcd7c9', 
          borderRadius: 8, 
          padding: 6,
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)'
        }}
      >
        <svg viewBox={`0 0 ${s.width} ${s.height}`} role="img" aria-label={`Cursive handwriting sample for ${app.id}`}>
          {/* Subtle scanned document ledger baseline rule */}
          <line x1="25" y1="92" x2={s.width - 25} y2="92" stroke="#d5d0bf" strokeWidth="1" strokeDasharray="4 3" opacity="0.65" />
          <text x={s.width - 14} y="16" textAnchor="end" fontSize="8.5" fontWeight="700" fill="#9ca3af" letterSpacing="0.07em">PLDT SPECIMEN</text>
          
          {s.lines.map((d, i) => (
            <path 
              key={i} 
              d={d} 
              fill="none" 
              stroke="#1e293b" 
              strokeWidth={s.pressure} 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              opacity="0.94" 
            />
          ))}
        </svg>
      </div>
      <figcaption className="small muted" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><b>{caption || app.id}</b> · Scanned Cursive Sample</span>
        <span className="badge" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>Quality: {Math.round(app.document.scanQuality * 100)}%</span>
      </figcaption>
    </figure>
  )
}
