import React, { useEffect, useState } from 'react'
import { useApp, ROLES } from './store.jsx'
import { Drawer } from './components/ui.jsx'
import Dossier from './components/Dossier.jsx'
import { 
  LayoutGrid, ScanFace, Map, Users, FolderSearch, 
  MessageSquareText, TrendingUp, FileText, Settings as SettingsIcon,
  ShieldCheck, User
} from 'lucide-react'

import Dashboard from './pages/Dashboard.jsx'
import IdentificationAnalysis from './pages/IdentificationAnalysis.jsx'
import Geo from './pages/Geo.jsx'
import VoterRecords from './pages/VoterRecords.jsx'
import Cases from './pages/Cases.jsx'
import Chatbot from './pages/Chatbot.jsx'
import Analytics from './pages/Analytics.jsx'
import AuditLogs from './pages/AuditLogs.jsx'
import SettingsPage from './pages/Settings.jsx'
import PublicGeoMap from './pages/PublicGeoMap.jsx'

const MAIN_MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, el: Dashboard },
  { id: 'identification', label: 'Identification Analysis', icon: ScanFace, el: IdentificationAnalysis },
  { id: 'geo', label: 'Geographic Analysis', icon: Map, el: Geo },
  { id: 'voters', label: 'Voter Records', icon: Users, el: VoterRecords },
  { id: 'cases', label: 'Investigation Cases', icon: FolderSearch, el: Cases },
  { id: 'chatbot', label: 'ONCE AI Chatbot', icon: MessageSquareText, el: Chatbot },
]

const SYSTEM_MENU = [
  { id: 'analytics', label: 'Analytics & Reports', icon: TrendingUp, el: Analytics },
  { id: 'audit', label: 'Audit Logs', icon: FileText, el: AuditLogs },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, el: SettingsPage },
]

const ALL_PAGES = [...MAIN_MENU, ...SYSTEM_MENU]

const HASH_ALIASES = {
  intake: 'identification',
  screening: 'identification',
  comelec: 'identification',
  system: 'audit',
  'public-map': 'public-map',
  'live-tracking': 'public-map'
}

const readHash = () => {
  const raw = location.hash.replace('#/', '').split('?')[0]
  const resolved = HASH_ALIASES[raw] || raw
  if (resolved === 'public-map') return 'public-map'
  return (ALL_PAGES.find((p) => p.id === resolved) || MAIN_MENU[0]).id
}

export default function App() {
  const { state, summary, openId, openApp, toast } = useApp()
  const [page, setPage] = useState(readHash)

  useEffect(() => {
    const h = () => setPage(readHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  const go = (id) => { 
    location.hash = '#/' + id
    setPage(id)
    openApp(null)
    document.querySelector('.main')?.scrollTo(0, 0) 
  }

  // Standalone Public View (for external observers, watchdogs, public embedded link)
  if (page === 'public-map') {
    return <PublicGeoMap />
  }

  const Page = ALL_PAGES.find((p) => p.id === page)?.el || Dashboard

  return (
    <div className="shell">
      <aside className="sidebar">
        {/* Brand Header */}
        <div className="brand">
          <div className="brand-icon-box">
            <ShieldCheck size={20} color="#fbbf24" strokeWidth={2.4} />
          </div>
          <div>
            <div className="brand-title">ONCE AI</div>
            <div className="brand-sub">COMELEC Election Oversight</div>
          </div>
        </div>

        {/* MAIN MENU Group */}
        <div className="nav-section-label">MAIN MENU</div>
        <nav className="nav" aria-label="Main Menu">
          {MAIN_MENU.map((p) => (
            <button 
              key={p.id} 
              className={page === p.id ? 'active' : ''} 
              onClick={() => go(p.id)} 
              aria-current={page === p.id ? 'page' : undefined}
            >
              <p.icon size={18} strokeWidth={2} aria-hidden />
              <span>{p.label}</span>
              {p.id === 'cases' && summary.awaiting + summary.pending > 0 && (
                <span className="count">{summary.awaiting + summary.pending}</span>
              )}
            </button>
          ))}
        </nav>

        {/* SYSTEM Group */}
        <div className="nav-section-label">SYSTEM</div>
        <nav className="nav" aria-label="System Menu">
          {SYSTEM_MENU.map((p) => (
            <button 
              key={p.id} 
              className={page === p.id ? 'active' : ''} 
              onClick={() => go(p.id)} 
              aria-current={page === p.id ? 'page' : undefined}
            >
              <p.icon size={18} strokeWidth={2} aria-hidden />
              <span>{p.label}</span>
            </button>
          ))}
        </nav>

        {/* Bottom User Profile (Exclusively COMELEC Administrator) */}
        <div className="sidebar-user">
          <div className="user-avatar" style={{ background: '#c0272d' }}>
            <User size={16} color="#ffffff" />
          </div>
          <div className="user-info">
            <div className="user-name">COMELEC Staff</div>
            <div className="user-sub" style={{ color: '#fbbf24', fontWeight: 600 }}>Administrator Account</div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="badge sim" title="All records are fictional">SYNTHETIC DEMO DATA</span>
          <span className="muted small grow">Decision-support for COMELEC Election Registration Board. Never an automatic disqualification.</span>
          <span className="badge ok" style={{ fontWeight: 700 }}>
            {ROLES[state.role]?.label || 'COMELEC Staff / Administrator'}
          </span>
        </header>
        <Page go={go} />
      </div>

      {openId && <Drawer onClose={() => openApp(null)}><Dossier appId={openId} /></Drawer>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
