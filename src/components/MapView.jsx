import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BARANGAYS, ALL_BUILDINGS, LGU } from '../lib/gazetteer.js'
import { LABEL_COLOR } from './ui.jsx'

// Leaflet + OpenStreetMap tiles (tiles need internet access; overlays still render without it).
export default function MapView({ apps, clusters, layers, selectedCluster, onSelectCluster, onSelectApp, height }) {
  const el = useRef(null)
  const map = useRef(null)
  const group = useRef(null)
  const [ready, setReady] = React.useState(false)

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true, preferCanvas: true }).setView(LGU.center, 15)
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current)
    tiles.on('load', () => setReady(true))
    const to = setTimeout(() => setReady(true), 2500) // offline: stop the skeleton, overlays still render
    group.current = L.layerGroup().addTo(map.current)
    setTimeout(() => map.current && map.current.invalidateSize(), 150)
    return () => { clearTimeout(to); map.current.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const g = group.current
    if (!g) return
    g.clearLayers()
    if (layers.barangays) {
      // De La Salle University Taft Avenue Core Landmark
      L.marker(LGU.center, {
        interactive: true,
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#15803d;color:#fff;font:bold 11px system-ui;padding:3px 9px;border-radius:12px;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;transform:translate(-50%,-50%);cursor:pointer">🏛️ DLSU Taft Ave</div>`
        })
      }).bindTooltip('<b>De La Salle University - Manila</b><br/>2401 Taft Avenue, Malate, Manila (Core Monitoring Zone)').addTo(g)

      BARANGAYS.forEach((b) => {
        L.circle(b.centroid, { radius: 380, color: '#6b7280', weight: 1, dashArray: '4 6', fillOpacity: 0.03, interactive: false }).addTo(g)
        L.marker(b.centroid, { interactive: false, icon: L.divIcon({ className: '', html: `<div style="color:#2b2f3a;font:600 11px 'Segoe UI';text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 5px #fff;white-space:nowrap;transform:translate(-50%,-50%)">${b.name}</div>` }) }).addTo(g)
      })
    }
    if (layers.density) {
      apps.forEach((a) => {
        if (!a.addr.coords || !['building', 'sitio', 'landmark', 'street', 'purok'].includes(a.addr.precision)) return
        L.circle(a.addr.coords, { radius: 90, stroke: false, fillColor: '#c0272d', fillOpacity: 0.05, interactive: false }).addTo(g)
        L.circle(a.addr.coords, { radius: 40, stroke: false, fillColor: '#c0272d', fillOpacity: 0.07, interactive: false }).addTo(g)
      })
    }
    if (layers.buildings) {
      ALL_BUILDINGS.forEach((b) => L.circleMarker(b.center, { radius: 7, color: '#fff', weight: 2, fillColor: '#374151', fillOpacity: 1 }).bindTooltip(`${b.name} (${b.type}, capacity ${b.capacity}) - contextual data`).addTo(g))
    }
    if (layers.clusters) {
      clusters.forEach((c) => {
        const explained = c.status === 'Plausibly explained by context'
        const sel = selectedCluster === c.id
        L.circle(c.center, { radius: Math.max(c.radiusM + 25, 40), color: explained ? '#6b7280' : '#c0272d', weight: sel ? 4 : 2, fillColor: explained ? '#6b7280' : '#c0272d', fillOpacity: sel ? 0.28 : 0.15 })
          .bindTooltip(`${c.id}: ${c.size} applications - ${c.status}`)
          .on('click', () => onSelectCluster && onSelectCluster(c.id)).addTo(g)
        if (!explained) L.marker(c.center, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'pulse-wrap', html: '<span class="pulse"></span>', iconSize: [0, 0] }) }).addTo(g)
      })
    }
    if (layers.apps) {
      apps.forEach((a) => {
        if (!a.addr.coords || !['building', 'sitio', 'landmark', 'street', 'purok'].includes(a.addr.precision)) return
        const m = L.circleMarker(a.addr.coords, { radius: a.label === 'High' ? 6 : 4.5, color: '#ffffff', weight: 1, fillColor: a.synthetic ? LABEL_COLOR[a.label].replace(/var\(--(\w+)\)/, (_, k) => ({ low: '#1b9a68', mod: '#d9820f', high: '#c0272d' }[k])) : '#fff', fillOpacity: 0.95 })
        m.bindTooltip(`${a.id} - ${a.name || 'Applicant'}<br/>${a.addr.components?.barangay || '?'}<br/>${a.label} priority, score ${a.score}<br/><i>${a.addr.precisionBasis}</i>`)
        m.on('click', () => onSelectApp && onSelectApp(a.id))
        m.addTo(g)
      })

      // ACTIVE VOTER ANOMALIES & SUSPECTED INCIDENTS (Pulsing Radar Marker)
      apps.forEach((a) => {
        const hasIssue = !!(a.issue || (a.timing_anomaly?.flag && a.timing_anomaly.flag !== 'NORMAL') || (a.label === 'High' && !a.synthetic))
        if (!hasIssue || !a.addr?.coords) return

        const flagName = a.issue || a.timing_anomaly?.flag || 'SUSPECTED ANOMALY'
        const durationText = a.duration_formatted ? ` (${a.duration_formatted})` : ''

        // Pulsing red alert radar circle
        L.marker(a.addr.coords, {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'pulse-wrap',
            html: '<span class="pulse" style="border-color:#ef4444;background:rgba(239,68,68,0.35);animation-duration:1.2s"></span>',
            iconSize: [0, 0]
          })
        }).addTo(g)

        // Prominent Alert Badge Marker
        const iconHtml = `<div style="background:#dc2626;color:#ffffff;font:bold 11px system-ui;padding:3px 8px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 3px 10px rgba(220,38,38,0.6);display:inline-flex;align-items:center;gap:4px;white-space:nowrap;transform:translate(-50%,-50%);cursor:pointer">⚠️ ${flagName}${durationText}</div>`
        const m = L.marker(a.addr.coords, {
          icon: L.divIcon({ className: '', html: iconHtml })
        })

        m.bindTooltip(`<b>🚨 ACTIVE ANOMALY INCIDENT: ${flagName}</b><br/>Citizen: ${a.name} (${a.id})<br/>Location: ${a.addr.normalized || 'DLSU Taft Sector'}<br/>${a.timing_anomaly?.reason || 'Suspected biometric or duration anomaly'}<br/><i>Click to open case dossier</i>`)
        m.on('click', () => {
          if (onSelectApp) onSelectApp(a.id)
        })
        m.addTo(g)
      })
    }
  }, [apps, clusters, layers, selectedCluster, onSelectCluster, onSelectApp])

  useEffect(() => {
    if (!selectedCluster || !map.current) return
    const c = clusters.find((x) => x.id === selectedCluster)
    // keep the cluster visible beside the slide-in details panel
    if (c) map.current.flyToBounds(L.latLng(c.center).toBounds(Math.max(c.radiusM * 3, 160)), { duration: 0.8, maxZoom: 18, paddingTopLeft: [20, 20], paddingBottomRight: [window.innerWidth > 1100 ? 390 : 20, 20] })
  }, [selectedCluster])

  return <div ref={el} className={`mapbox ${ready ? '' : 'loading'}`} style={height ? { height } : undefined} role="application" aria-label="Interactive registration map" />
}
