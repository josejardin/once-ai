// Geographic helpers (WGS84, small-area approximations).
const R = 6371008.8

export function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function offsetMeters(origin, dxEast, dyNorth) {
  const dLat = dyNorth / 111320
  const dLng = dxEast / (111320 * Math.cos((origin[0] * Math.PI) / 180))
  return [origin[0] + dLat, origin[1] + dLng]
}

export function centroidOf(points) {
  const n = points.length
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n]
}
