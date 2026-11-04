import React, { useEffect, useState } from 'react'
import { useApp, ROLES } from './store.jsx'
import { Drawer } from './components/ui.jsx'
import Dossier from './components/Dossier.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { 
  LayoutGrid, ScanFace, Map, Users, FolderSearch, 
  MessageSquareText, TrendingUp, FileText, Settings as SettingsIcon,
  ShieldCheck, User, IdCard, Menu, X, Trash2
} from 'lucide-react'
import { clearAllComelecVoters, getComelecVoters } from './lib/api.js'

import Dashboard from './pages/Dashboard.jsx'
import IdentificationAnalysis from './pages/IdentificationAnalysis.jsx'
import Geo from './pages/Geo.jsx'
import VoterRecords from './pages/VoterRecords.jsx'
import Cases from './pages/Cases.jsx'
import Chatbot from './pages/Chatbot.jsx'
import ComelecRegistry from './pages/ComelecRegistry.jsx'
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
  { id: 'comelec', label: 'COMELEC Registry', icon: IdCard, el: ComelecRegistry },
  { id: 'analytics', label: 'Analytics & Reports', icon: TrendingUp, el: Analytics },
  { id: 'audit', label: 'Audit Logs', icon: FileText, el: AuditLogs },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, el: SettingsPage },
]

const ALL_PAGES = [...MAIN_MENU, ...SYSTEM_MENU]

const HASH_ALIASES = {
  intake: 'identification',
  screening: 'identification',
  registry: 'comelec',
  system: 'audit',
  'public-map': 'public-map',
  'live-tracking': 'public-map'
}

const readHash = () => {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0]
  const resolved = HASH_ALIASES[raw] || raw
  if (resolved === 'public-map') return 'public-map'
  return (ALL_PAGES.find((p) => p.id === resolved) || MAIN_MENU[0]).id
}

export default function App() {
  const { state, dispatch, summary, openId, openApp, toast, notify } = useApp()
  const [page, setPage] = useState(readHash)
  const [mobileNav, setMobileNav] = useState(false)
  const [purging, setPurging] = useState(false)
  const [realCasesCount, setRealCasesCount] = useState(0)

  useEffect(() => {
    async function syncRealCases() {
      try {
        const data = await getComelecVoters()
        const voters = data?.voters || []
        // Only count voters who have an actual active investigation case or suspected anomaly
        const activeCount = voters.filter(v => {
          const cs = state.caseState[v.voter_id]
          const isResolved = cs?.status === 'Resolved'
          const hasAnomaly = !!(
            cs?.suspectedFlag ||
            (v.attendance?.anomaly_flag && v.attendance.anomaly_flag !== 'NORMAL') ||
            (v.registration_status && (v.registration_status.includes('BLOCKED') || v.registration_status.includes('LOCKED')))
          )
          return hasAnomaly && !isResolved
        }).length + (state.extraApps || []).filter(a => {
          if (a.synthetic) return false
          const cs = state.caseState[a.id]
          const isResolved = cs?.status === 'Resolved'
          const hasAnomaly = !!(a.issue || a.timing_anomaly || cs?.suspectedFlag)
          return hasAnomaly && !isResolved
        }).length
        setRealCasesCount(activeCount)
      } catch (e) {
        setRealCasesCount((state.extraApps || []).filter(a => !a.synthetic && (a.issue || a.timing_anomaly || state.caseState[a.id]?.suspectedFlag) && state.caseState[a.id]?.status !== 'Resolved').length)
      }
    }
    syncRealCases()
    const timer = setInterval(syncRealCases, 2500)
    return () => clearInterval(timer)
  }, [state.caseState, state.extraApps])

  const handlePurgeAllStorage = async () => {
    if (!window.confirm('Wipe all storages (browser localStorage, cached test cases, and backend biometric database) completely clean?')) {
      return
    }
    setPurging(true)
    try {
      await clearAllComelecVoters()
    } catch (e) {
      console.warn('Backend clear notice:', e)
    }
    dispatch({ type: 'purgeAllStorage' })
    if (notify) notify('🧹 All storages completely wiped clean! System reset.')
    setPurging(false)
  }

  useEffect(() => {
    const h = () => setPage(readHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  const go = (id) => { 
    const resolved = HASH_ALIASES[id] || id
    location.hash = '#/' + id
    setPage(resolved)
    openApp(null)
    setMobileNav(false)
    document.querySelector('.main')?.scrollTo(0, 0) 
  }

  // Standalone Public View (for external observers, watchdogs, public embedded link)
  if (page === 'public-map') {
    return (
      <ErrorBoundary onGoHome={() => go('dashboard')}>
        <PublicGeoMap />
      </ErrorBoundary>
    )
  }

  const Page = ALL_PAGES.find((p) => p.id === page)?.el || Dashboard

  return (
    <div className="shell">
      {/* Mobile Backdrop Overlay */}
      {mobileNav && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setMobileNav(false)} 
          aria-hidden="true" 
        />
      )}

      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="brand">
          <div className="brand-icon-box" style={{ background: 'transparent', padding: 0, overflow: 'hidden', borderRadius: 8 }}>
            <img src="/logo.png" alt="ONCE AI Logo" width="32" height="32" style={{ objectFit: 'contain', display: 'block' }} />
          </div>
          <div className="brand-text">
            <div className="brand-title">ONCE AI</div>
            <div className="brand-meaning">Oversight Network for Clean Elections</div>
          </div>
          {/* Mobile Close Button */}
          <button 
            className="mobile-close-btn"
            onClick={() => setMobileNav(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
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
              {p.id === 'cases' && realCasesCount > 0 && (
                <span className="count">{realCasesCount}</span>
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
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileNav(!mobileNav)} 
            aria-label="Toggle Navigation Menu"
          >
            {mobileNav ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="badge sim" title="All records are fictional">SYNTHETIC DEMO DATA</span>
          <span className="muted small grow">COMELEC Decision-Support System</span>
        </header>
        <ErrorBoundary key={page} onGoHome={() => go('dashboard')}>
          <Page go={go} />
        </ErrorBoundary>
      </div>

      {openId && <Drawer onClose={() => openApp(null)}><Dossier appId={openId} /></Drawer>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
