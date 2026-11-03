import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Eraser, RotateCcw, PenTool } from 'lucide-react'

const SignaturePad = forwardRef(function SignaturePad(
  { width = 460, height = 180, onStrokeEnd, strokeColor = '#1e293b', strokeWidth = 2.5, placeholder = 'Sign inside this box...' },
  ref
) {
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const historyRef = useRef([])

  // Expose clean controls to parent
  useImperativeHandle(ref, () => ({
    clear: () => clearCanvas(),
    undo: () => undoStroke(),
    getCanvas: () => canvasRef.current,
    hasContent: () => hasStrokes,
    loadFromDataURL: (dataUrl) => loadDataUrl(dataUrl)
  }))

  const saveState = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (historyRef.current.length > 20) historyRef.current.shift()
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    historyRef.current = []
    setHasStrokes(false)
    if (onStrokeEnd) onStrokeEnd(canvas, true)
  }

  const undoStroke = () => {
    const canvas = canvasRef.current
    if (!canvas || historyRef.current.length === 0) return
    historyRef.current.pop() // Pop current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (historyRef.current.length > 0) {
      const prev = historyRef.current[historyRef.current.length - 1]
      ctx.putImageData(prev, 0, 0)
      setHasStrokes(true)
    } else {
      setHasStrokes(false)
    }
    if (onStrokeEnd) onStrokeEnd(canvas, !hasStrokes)
  }

  const loadDataUrl = (dataUrl) => {
    const canvas = canvasRef.current
    if (!canvas || !dataUrl) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      saveState()
      setHasStrokes(true)
      if (onStrokeEnd) onStrokeEnd(canvas, false)
    }
    img.src = dataUrl
  }

  const getCoordinates = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }

  const startDrawing = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { x, y } = getCoordinates(e)

    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    setIsDrawing(true)
  }

  const draw = (e) => {
    if (!isDrawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { x, y } = getCoordinates(e)

    ctx.lineTo(x, y)
    ctx.stroke()
    setHasStrokes(true)
  }

  const stopDrawing = (e) => {
    if (!isDrawing) return
    e.preventDefault()
    setIsDrawing(false)
    saveState()
    if (onStrokeEnd && canvasRef.current) {
      onStrokeEnd(canvasRef.current, false)
    }
  }

  return (
    <div style={{ display: 'inline-block', position: 'relative' }}>
      <div
        style={{
          border: '1.5px dashed var(--border, #cbd5e1)',
          borderRadius: 8,
          backgroundColor: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
          width,
          height
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{
            display: 'block',
            cursor: 'crosshair',
            touchAction: 'none'
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {!hasStrokes && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#94a3b8',
              pointerEvents: 'none',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <PenTool size={14} opacity={0.6} />
            <span>{placeholder}</span>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            display: 'flex',
            gap: 6,
            zIndex: 5
          }}
        >
          <button
            type="button"
            onClick={undoStroke}
            disabled={!hasStrokes}
            className="btn btn-sm btn-subtle"
            style={{ padding: '3px 8px', fontSize: '0.75rem', opacity: hasStrokes ? 1 : 0.4 }}
            title="Undo stroke"
          >
            <RotateCcw size={12} />
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            disabled={!hasStrokes}
            className="btn btn-sm btn-subtle"
            style={{ padding: '3px 8px', fontSize: '0.75rem', opacity: hasStrokes ? 1 : 0.4 }}
            title="Clear canvas"
          >
            <Eraser size={12} /> Clear
          </button>
        </div>
      </div>
    </div>
  )
})

export default SignaturePad
