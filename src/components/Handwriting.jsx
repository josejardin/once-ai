import React from 'react'
import { strokesFromEmbedding } from '../lib/handwriting.js'

// Visual representation for a scanned handwriting sample in authentic cursive penmanship matching the PLDT reference.
export function HandwritingSample({ app, caption, customImage }) {
  if (!app?.document && !customImage) return <div className="muted small">No scanned form on file.</div>
  const s = app?.document ? strokesFromEmbedding(app.document.embedding) : null
  return (
    <figure style={{ margin: 0 }}>
      <div
        className="sheet"
        style={{
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: 8,
          padding: '14px 18px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 120
        }}
      >
        {customImage ? (
          <img
            src={customImage}
            alt={`Handwriting specimen for ${app?.id || 'sample'}`}
            style={{ width: '100%', maxWidth: 280, height: 'auto', maxHeight: 110, objectFit: 'contain', display: 'block' }}
          />
        ) : (
          s && (
            <svg
              viewBox={`0 0 ${s.width} ${s.height}`}
              style={{ width: '100%', maxWidth: 270, height: 'auto', display: 'block' }}
              role="img"
              aria-label={`Cursive pldt handwriting sample for ${app?.id}`}
            >
              {s.strokes.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={s.pressure}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.88"
                />
              ))}
            </svg>
          )
        )}
      </div>
      <figcaption className="small muted" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><b>{caption || app?.id}</b> · Scanned Specimen</span>
        <span className="badge" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>Scan Quality: {Math.round((app?.document?.scanQuality || 0.90) * 100)}%</span>
      </figcaption>
    </figure>
  )
}
