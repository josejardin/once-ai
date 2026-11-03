// Standalone Forensic Signature Engine for ONCE AI
// Evaluates 2D stroke rasterization, bounding-box normalization, 
// 1:1 Self-Authenticity and 1:N Cross-User Collision.

export const GRID_SIZE = 48
export const SELF_MATCH_THRESHOLD = 68.0    // Minimum match to pass legitimate user verification
export const COLLISION_THRESHOLD = 75.0     // Score above which a cross-user duplicate is flagged

const API_BASE = 'http://127.0.0.1:8000/api/signatures'

/**
 * Extracts a normalized 48x48 stroke-density matrix from an HTML5 Canvas.
 * Crops surrounding whitespace so comparison is position and size invariant.
 */
export function extractSignatureGridFromCanvas(canvas) {
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const imgData = ctx.getImageData(0, 0, width, height)
  const data = imgData.data

  let minX = width, minY = height, maxX = 0, maxY = 0
  let hasInk = false

  // Scan bounding box of dark or non-transparent strokes
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3]
      // Either non-transparent or dark pixel on white
      const isStroke = a > 30 && (r < 220 || g < 220 || b < 220)
      if (isStroke) {
        hasInk = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (!hasInk || maxX <= minX || maxY <= minY) {
    return new Float32Array(GRID_SIZE * GRID_SIZE)
  }

  // Create temporary canvas to crop and downsample
  const cropW = Math.max(1, maxX - minX + 1)
  const cropH = Math.max(1, maxY - minY + 1)

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = GRID_SIZE
  tempCanvas.height = GRID_SIZE
  const tempCtx = tempCanvas.getContext('2d')

  // Draw cropped region scaled into 48x48
  tempCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, GRID_SIZE, GRID_SIZE)
  const resizedData = tempCtx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data

  const grid = new Float32Array(GRID_SIZE * GRID_SIZE)
  let sumSq = 0

  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const idx = i * 4
    const a = resizedData[idx + 3]
    const r = resizedData[idx]
    // Density score 0.0 to 1.0
    const density = (a / 255.0) * (1.0 - r / 255.0)
    grid[i] = density
    sumSq += density * density
  }

  // Unit normalize
  const norm = Math.sqrt(sumSq)
  if (norm > 0) {
    for (let i = 0; i < grid.length; i++) {
      grid[i] = grid[i] / norm
    }
  }

  return grid
}

/**
 * Computes cosine similarity between two normalized stroke grids.
 * Returns a percentage 0.0 - 100.0%.
 */
export function computeSignatureSimilarity(gridA, gridB) {
  if (!gridA || !gridB || gridA.length !== gridB.length) return 0.0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < gridA.length; i++) {
    dot += gridA[i] * gridB[i]
    normA += gridA[i] * gridA[i]
    normB += gridB[i] * gridB[i]
  }

  if (normA === 0 || normB === 0) return 0.0

  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  const clamped = Math.max(0.0, Math.min(1.0, sim))
  return +(clamped * 100.0).toFixed(1)
}

/**
 * Validates a test signature against the registry locally in JavaScript.
 * Runs dual-layer check: 1:1 self-consistency & 1:N cross-user collision.
 */
export function verifySignatureLocally({ currentVoterId, testGrid, registry }) {
  const currentRecord = registry.find((v) => v.id === currentVoterId)
  if (!currentRecord) {
    return {
      status: 'ERROR',
      badge: 'VOTER NOT FOUND',
      reason: `No baseline record on file for voter ${currentVoterId}.`,
      selfScore: 0,
      collisionScore: 0,
      requiresReview: true
    }
  }

  const selfScore = computeSignatureSimilarity(testGrid, currentRecord.grid)

  // 1:N check against all OTHER voters
  let maxCollisionScore = 0.0
  let collidedVoter = null

  for (const other of registry) {
    if (other.id === currentVoterId) continue
    const sim = computeSignatureSimilarity(testGrid, other.grid)
    if (sim > maxCollisionScore) {
      maxCollisionScore = sim
      collidedVoter = other
    }
  }

  const auditId = `SIG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  const timestamp = new Date().toISOString()

  if (maxCollisionScore >= COLLISION_THRESHOLD) {
    return {
      status: 'COLLISION',
      badge: 'FLAGGED: CROSS-USER DUPLICATE',
      badgeClass: 'bad',
      reason: `Potential proxy/batch signing detected. Signature matches ${collidedVoter.name} (${collidedVoter.id}) with ${maxCollisionScore}% similarity (Threshold: ${COLLISION_THRESHOLD}%). Routed to ERB manual investigation.`,
      selfScore,
      collisionScore: maxCollisionScore,
      collidedWith: collidedVoter,
      requiresReview: true,
      auditId,
      timestamp
    }
  }

  if (selfScore < SELF_MATCH_THRESHOLD) {
    return {
      status: 'MISMATCH',
      badge: 'FLAGGED: INCONSISTENT SIGNATURE',
      badgeClass: 'warn',
      reason: `Inconsistent handwriting. Match with ${currentRecord.name}'s baseline is only ${selfScore}% (Required: ${SELF_MATCH_THRESHOLD}%). Routed to ERB manual investigation.`,
      selfScore,
      collisionScore: maxCollisionScore,
      collidedWith: null,
      requiresReview: true,
      auditId,
      timestamp
    }
  }

  return {
    status: 'VERIFIED',
    badge: 'VERIFIED: AUTHENTIC SIGNATURE',
    badgeClass: 'good',
    reason: `Passed forensic validation. Authenticity confidence: ${selfScore}%. No cross-user collisions found (${maxCollisionScore}%).`,
    selfScore,
    collisionScore: maxCollisionScore,
    collidedWith: null,
    requiresReview: false,
    auditId,
    timestamp
  }
}

/**
 * Validates a signature against the backend FastAPI service with fallback to local JS engine.
 */
export async function verifySignatureHybrid({ currentVoterId, canvas, registry }) {
  const testGrid = extractSignatureGridFromCanvas(canvas)
  const base64Data = canvas.toDataURL('image/png')

  // Try backend first for sovereign cloud verification
  try {
    const res = await fetch(`${API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voter_id: currentVoterId,
        signature_base64: base64Data
      }),
      signal: AbortSignal.timeout(1500)
    })

    if (res.ok) {
      const data = await res.json()
      return {
        status: data.status,
        badge: data.verdict_badge,
        badgeClass: data.status === 'VERIFIED' ? 'good' : data.status === 'COLLISION' ? 'bad' : 'warn',
        reason: data.reason,
        selfScore: data.self_match_score,
        collisionScore: data.collision_match_score,
        collidedWith: data.collided_with_voter_id ? { id: data.collided_with_voter_id, name: data.collided_with_name } : null,
        requiresReview: data.requires_human_review,
        auditId: data.audit_id,
        timestamp: data.timestamp,
        source: 'Sovereign Biometric Cloud (FastAPI)'
      }
    }
  } catch (err) {
    // Backend offline or timeout -> proceed with instant local edge engine
  }

  const localRes = verifySignatureLocally({ currentVoterId, testGrid, registry })
  localRes.source = 'Local Edge Forensics Engine'
  return localRes
}
