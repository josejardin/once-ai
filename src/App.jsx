import React, { useEffect, useState } from 'react'
import { useApp, ROLES } from './store.jsx'
import { Drawer } from './components/ui.jsx'
import Dossier from './components/Dossier.jsx'
import { 
  LayoutGrid, ScanFace, Map, Users, FolderSearch, 
  MessageSquareText, TrendingUp, FileText, Settings as SettingsIcon,
  ShieldCheck, User, LogOut 
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
}

const readHash = () => {
  const raw = location.hash.replace('#/', '')
  const resolved = HASH_ALIASES[raw] || raw
  return (ALL_PAGES.find((p) => p.id === resolved) || MAIN_MENU[0]).id
}

export default function App() {
  const { state, dispatch, summary, openId, openApp, toast } = useApp()
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
            <div className="brand-sub">Election Oversight System</div>
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

        {/* Bottom User Profile */}
        <div className="sidebar-user">
          <div className="user-avatar">
            <User size={16} />
          </div>
          <div className="user-info">
            <div className="user-name">Administrator</div>
            <div className="user-sub">System Account</div>
          </div>
          <button 
            className="user-logout" 
            title="Switch Demo Role" 
            onClick={() => {
              const roles = ['admin', 'erb', 'viewer']
              const next = roles[(roles.indexOf(state.role) + 1) % roles.length]
              dispatch({ type: 'role', role: next })
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="badge sim" title="All records are fictional">SYNTHETIC DEMO DATA</span>
          <span className="muted small grow">Decision-support for the Election Registration Board. Never an automatic approval or rejection.</span>
          <span className="small muted">{ROLES[state.role]?.label || 'Administrator'}</span>
        </header>
        <Page go={go} />
      </div>

      {openId && <Drawer onClose={() => openApp(null)}><Dossier appId={openId} /></Drawer>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
