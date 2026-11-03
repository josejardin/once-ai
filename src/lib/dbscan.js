// DBSCAN (Ester et al., 1996). Real implementation, O(n^2) neighbour search - fine for prototype sizes.
// points: array of [lat, lng]; eps in metres; returns labels[] where -1 = noise, 0..k-1 = cluster id.
import { haversine } from './geo.js'

export function dbscan(points, eps, minPts, dist = haversine) {
  const n = points.length
  const labels = new Array(n).fill(undefined)
  const neighbours = (i) => {
    const out = []
    for (let j = 0; j < n; j++) if (dist(points[i], points[j]) <= eps) out.push(j)
    return out
  }
  let cluster = -1
  for (let i = 0; i < n; i++) {
    if (labels[i] !== undefined) continue
    const nb = neighbours(i)
    if (nb.length < minPts) {
      labels[i] = -1
      continue
    }
    cluster++
    labels[i] = cluster
    const queue = nb.filter((j) => j !== i)
    while (queue.length) {
      const q = queue.shift()
      if (labels[q] === -1) labels[q] = cluster
      if (labels[q] !== undefined) continue
      labels[q] = cluster
      const nbq = neighbours(q)
      if (nbq.length >= minPts) for (const k of nbq) if (labels[k] === undefined || labels[k] === -1) queue.push(k)
    }
  }
  return labels
}
