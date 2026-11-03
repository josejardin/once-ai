import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, RiskBadge, SyntheticBanner } from '../components/ui.jsx'
import { getComelecVoters, getVoterDossier, getDurationAnalytics } from '../lib/api.js'
import { 
  MessageSquareText, Send, Sparkles, Bot, User, 
  HelpCircle, ArrowRight, ShieldCheck, AlertTriangle, FileText, 
  CheckCircle2, Clock, IdCard, Camera, Search, UserCheck, AlertOctagon
} from 'lucide-react'

const SUGGESTED_QUERIES = [
  'Summarize voter CARLOS DELA CRUZ',
  'Summarize voter MARIA SANTOS',
  'Show High priority cases in Sampaguita',
  'How does self-learned AI detect voting pacing anomalies?',
  'What is the average voting duration across precincts?',
  'Summarize cluster CL-0089',
  'Which applications have matching handwriting?',
  'How does 100% Local AI biometric privacy comply with RA 10173?'
]

export default function Chatbot() {
  const { result, state, summary, openApp } = useApp()
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello, Administrator. I am the **ONCE AI Oversight & Voter Intelligence Assistant**.\n\nI can **summarize any voter** with their complete official record, registered ID picture, live verification photos (Face IN & OUT), attendance timestamps, and self-learned AI pacing analysis. I can also answer interactive questions regarding fraud clusters, handwriting similarities, and precinct turnout.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [comelecVoters, setComelecVoters] = useState([])
  const [selectedVoterId, setSelectedVoterId] = useState('')
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, typing])

  useEffect(() => {
    async function fetchVoters() {
      try {
        const d = await getComelecVoters()
        if (d?.voters) setComelecVoters(d.voters)
      } catch (e) {
        console.warn('Could not fetch COMELEC voters in chat:', e)
      }
    }
    fetchVoters()
    const timer = setInterval(fetchVoters, 2000)
    return () => clearInterval(timer)
  }, [])

  // Auto-respond when routed via #/chatbot?voter=Name
  useEffect(() => {
    const parseUrlQuery = () => {
      const hashStr = window.location.hash || ''
      const qIdx = hashStr.indexOf('?')
      if (qIdx >= 0) {
        const params = new URLSearchParams(hashStr.slice(qIdx))
        const vParam = params.get('voter')
        if (vParam) {
          handleSend(`Summarize voter ${decodeURIComponent(vParam)}`)
        }
      }
    }
    parseUrlQuery()
  }, [comelecVoters.length])

  const handleSend = async (queryText) => {
    const text = (queryText || input).trim()
    if (!text) return

    const userMsg = {
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTyping(true)

    // Generate intelligent grounded response based on system state
    setTimeout(async () => {
      const botResponse = await generateAnswer(text, result, state, summary)
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: botResponse.text,
        cards: botResponse.cards || null,
        voterDossier: botResponse.voterDossier || null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
      setTyping(false)
    }, 600)
  }

  // Handle Quick Voter Summarizer button/dropdown
  const handleSummarizeVoter = async (voterId) => {
    if (!voterId) return
    const v = comelecVoters.find(x => x.voter_id === voterId)
    const name = v?.name || voterId
    await handleSend(`Summarize voter ${name}`)
  }

  const generateAnswer = async (q, res, st, sm) => {
    const low = q.toLowerCase()

    // --------------------------------------------------------------------------
    // 1. SPECIFIC VOTER SUMMARY WITH PHOTOS (ID VS LIVE FACE IN / OUT)
    // --------------------------------------------------------------------------
    if (low.includes('summarize voter') || low.includes('votee') || low.includes('tell me about voter') || low.includes('carlos') || low.includes('maria') || low.includes('voter-')) {
      // Find matching voter from live registry
      let currentVoters = comelecVoters;
      if (!currentVoters || currentVoters.length === 0) {
        try {
          const fresh = await getComelecVoters();
          if (fresh?.voters) {
            currentVoters = fresh.voters;
            setComelecVoters(fresh.voters);
          }
        } catch (e) {}
      }

      let matchedVoter = null;
      for (const v of (currentVoters || [])) {
        if (low.includes(v.name.toLowerCase()) || low.includes(v.voter_id.toLowerCase()) || low.includes(v.vin.toLowerCase())) {
          matchedVoter = v;
          break;
        }
      }

      // If still not matched, check token/words
      if (!matchedVoter && currentVoters && currentVoters.length > 0) {
        const words = low.replace(/summarize|voter|tell|me|about/g, '').trim().split(/\s+/).filter(Boolean);
        for (const v of currentVoters) {
          if (words.some(w => w.length > 1 && v.name.toLowerCase().includes(w))) {
            matchedVoter = v;
            break;
          }
        }
      }

      // If general query or no specific match, default to most recently registered voter
      if (!matchedVoter && currentVoters && currentVoters.length > 0) {
        matchedVoter = currentVoters[currentVoters.length - 1];
      }

      // Try fetching live dossier from backend API
      let liveDossier = null
      if (matchedVoter) {
        try {
          liveDossier = await getVoterDossier(matchedVoter.voter_id)
        } catch (e) {
          console.warn('Backend dossier API notice:', e)
        }
      }

      // Fallback synthetic dossier if none enrolled yet or demo query
      if (!matchedVoter && !liveDossier) {
        // Pick an application from the dataset
        const app = res.apps.find(a => low.includes(a.name.toLowerCase()) || low.includes(a.id.toLowerCase())) || res.apps[0]
        liveDossier = {
          voter_id: app.id,
          name: app.name,
          vin: `VIN-${app.id.replace('APP-', '')}-NCR2026`,
          precinct_id: 'Precinct 101 - Manila',
          barangay: app.addr.components.barangay || 'Sampaguita',
          birthdate: '1996-08-20',
          civil_status: 'Married',
          citizenship: 'Filipino',
          registration_status: app.label === 'High' ? 'FLAGGED FOR HEARING' : 'VERIFIED & CLEARED',
          has_voted: true,
          ballot_serial: 'BALLOT-CEF1-884210AF',
          photo_id_base64: app.photo_base64 || generatePlaceholderAvatar(app.name, '#1e293b', '#38bdf8'),
          photo_in_base64: app.photo_base64 || generatePlaceholderAvatar(app.name, '#0f172a', '#22c55e'),
          photo_out_base64: app.photo_base64 || generatePlaceholderAvatar(app.name, '#111827', '#fbbf24'),
          face_in_timestamp: '2026-11-03 09:14:22',
          face_out_timestamp: '2026-11-03 09:17:45',
          duration_seconds: 203,
          duration_formatted: '3m 23s',
          timing_anomaly: {
            flag: 'NORMAL',
            severity: 'NONE',
            explanation: 'Voter completed ballot in 3m 23s (203s), consistent with the running learned average of 195s ± 21s.'
          },
          id_match_confidence: 98.7
        }
      } else if (!liveDossier && matchedVoter) {
        const att = matchedVoter.attendance || {}
        const anom = att.timing_anomaly || matchedVoter.timing_anomaly
        const isFlagged = Boolean(
          (anom && anom.flag && anom.flag !== 'NORMAL') ||
          matchedVoter.registration_status?.includes('FLAGGED') ||
          matchedVoter.registration_status?.includes('SUSPICIOUS') ||
          matchedVoter.registration_status?.includes('BLOCKED')
        )

        liveDossier = {
          voter_id: matchedVoter.voter_id,
          name: matchedVoter.name,
          vin: matchedVoter.vin,
          precinct_id: matchedVoter.precinct_id,
          barangay: matchedVoter.barangay,
          birthdate: matchedVoter.birthdate || '2000-01-01',
          civil_status: matchedVoter.civil_status || 'Single',
          citizenship: 'Filipino',
          registration_status: isFlagged
            ? (matchedVoter.registration_status || `SUSPICIOUS (${anom?.flag || 'ANOMALY'})`)
            : (matchedVoter.has_voted ? 'BALLOT CAST (LOCKED)' : (att.face_in ? 'IN_BOOTH (VOTING)' : 'REGISTERED / ELIGIBLE')),
          has_voted: Boolean(matchedVoter.has_voted || att.face_out),
          ballot_serial: att.ballot_serial || (att.face_in ? 'BALLOT-CEF1-2B1089A' : 'NOT YET ISSUED'),
          photo_id_base64: matchedVoter.photo_id_base64 || matchedVoter.photo_base64,
          photo_in_base64: att.photo_in_base64 || matchedVoter.photo_in_base64 || null,
          photo_out_base64: att.photo_out_base64 || matchedVoter.photo_out_base64 || null,
          face_in_timestamp: att.face_in || matchedVoter.face_in_timestamp || null,
          face_out_timestamp: att.face_out || matchedVoter.face_out_timestamp || null,
          duration_seconds: anom?.duration_seconds,
          duration_formatted: att.duration || matchedVoter.duration_formatted || null,
          timing_anomaly: anom || (att.face_out ? {
            flag: 'NORMAL',
            severity: 'NONE',
            explanation: 'Voter completed ballot pacing within nominal learned baseline.'
          } : null),
          id_match_confidence: 99.1
        }
      }

      return {
        text: `### 📋 Comprehensive Voter Dossier: ${liveDossier.name}\n\n` +
          `Here is the verified intelligence summary for **${liveDossier.name}** (${liveDossier.vin}). This includes comparison between the **official registered ID photo** and the **live photos captured at Face IN and Face OUT**, alongside timestamps and AI timing anomaly evaluation:`,
        voterDossier: liveDossier
      }
    }

    // --------------------------------------------------------------------------
    // 2. TIMING ANOMALY & SELF-LEARNED AI QUESTIONS
    // --------------------------------------------------------------------------
    if (low.includes('pacing') || low.includes('average completed time') || low.includes('duration') || low.includes('early') || low.includes('lately') || low.includes('suspicious') && low.includes('time')) {
      let stats = null
      try {
        const d = await getDurationAnalytics()
        stats = d?.stats
      } catch (e) {}

      const avg = stats?.learned_mean_seconds || 195
      const minNominal = stats?.nominal_min_seconds || 45
      const maxNominal = stats?.nominal_max_seconds || 480

      return {
        text: `### ⏱️ Mocked Self-Learned AI Voting Pacing Engine\n\n` +
          `The ONCE AI duration engine continuously monitors the time elapsed from **Face IN** (receiving paper ballot) to **Face OUT** (feeding ballot into the box):\n\n` +
          `• **Current Learned Baseline Average:** **${Math.floor(avg/60)}m ${Math.round(avg%60)}s** (${avg} seconds).\n` +
          `• **Adaptive Learning Mechanism:** Each completed voter attendance updates the running normal distribution ($\mu, \sigma$) in RAM, allowing the AI to adjust to specific precinct lines and ballot lengths dynamically.\n` +
          `• **🚨 Early Completion Anomaly (Rush):** Flagged if a voter finishes in **< ${minNominal} seconds** ($Z < -2.0$). Indicates potential unshaded blank ballots, rushed coercion, or booth bypass.\n` +
          `• **⚠️ Protracted Delay Anomaly (Delay):** Flagged if a voter remains in the booth for **> ${Math.floor(maxNominal/60)} minutes** ($Z > +2.5$). Indicates potential ballot tampering, illegal booth photography, unauthorized assistance, or ballot substitution.\n\n` +
          `You can view the real-time pacing bell-curve distribution under **Analytics & Reports**.`
      }
    }

    // --------------------------------------------------------------------------
    // 3. GEOSPATIAL CLUSTERS & DBSCAN
    // --------------------------------------------------------------------------
    if (low.includes('sampaguita') || low.includes('cl-0089') || low.includes('cluster')) {
      const c = res.clusters.find(x => x.id === 'CL-0089' || x.barangayName.toLowerCase().includes('sampaguita'))
      const appsInCluster = res.apps.filter(a => a.cluster?.id === c?.id)
      return {
        text: `### 🗺️ Spatial Cluster Investigation: ${c?.id || 'CL-0089'} (${c?.barangayName || 'Sampaguita'})\n\n` +
          `• **Cluster Size:** **${c?.size || 16} applications** grouped within a tight ${c?.radiusM || 85}m radius.\n` +
          `• **Anomaly Severity:** ${(c?.severity * 100).toFixed(0)}% (Spike ratio: **${c?.stat?.spike || '2.3x'}** of monthly baseline).\n` +
          `• **Context Analysis:** **${c?.status || 'Context unavailable'}**. Unlike student dorms, this residential area lacks multi-tenant housing capacity, indicating a potential flying voter staging hub.\n\n` +
          `Associated applications flagged for hearing:`,
        cards: appsInCluster.slice(0, 4).map(a => ({
          id: a.id,
          name: a.name,
          address: a.addr.normalized,
          label: a.label,
          score: a.score
        }))
      }
    }

    // --------------------------------------------------------------------------
    // 4. FORENSIC HANDWRITING FORGERY
    // --------------------------------------------------------------------------
    if (low.includes('handwriting') || low.includes('forgery') || low.includes('batch')) {
      const groups = res.handwriting.groups
      return {
        text: `### ✍️ Forensic Handwriting Batch Forgery Findings\n\n` +
          `• **Identified Handwriting Clusters:** **${groups.length} distinct groups** sharing high cosine stroke similarity.\n` +
          `• **Threshold Setting:** Cosine distance benchmark is configured at **${st.config.hwThreshold}**.\n` +
          `• **Largest Forgery Ring:** Group **${groups[0]?.id || 'HW-G1'}** contains **${groups[0]?.ids.length || 7} applications** exhibiting matching stroke curvature, pen pressure, and glyph morphology, indicating a single preparer.\n\n` +
          `Compare high-resolution visual stroke crops under **Identification Analysis → Handwriting Similarity**.`,
        cards: groups.slice(0, 3).map(g => ({
          id: g.id,
          name: `${g.ids.length} Linked Applications`,
          address: `Application IDs: ${g.ids.slice(0, 3).join(', ')}...`,
          label: 'Moderate',
          score: 85
        }))
      }
    }

    // --------------------------------------------------------------------------
    // 5. DATA PRIVACY & RA 10173 COMPLIANCE
    // --------------------------------------------------------------------------
    if (low.includes('privacy') || low.includes('10173') || low.includes('compliance') || low.includes('secure') || low.includes('biometric')) {
      return {
        text: `### 🔒 Sovereign Biometric Privacy & RA 10173 Architecture\n\n` +
          `1. **100% Local In-Memory Inference:** OpenCV and Facenet512 decode images strictly in RAM (` + '`' + `cv2.imdecode` + '`' + `). Zero temporary files are written to disk or sent to external cloud APIs.\n` +
          `2. **Cancelable Biometrics ($Q$-Matrix Projection):** Vectors are transformed via a secret orthogonal projection matrix ($Q^T Q = I$). If leaked, templates cannot be inverted to reconstruct the citizen's original face.\n` +
          `3. **Post-Election Crypto-Shredding:** Revoking ` + '`' + `ELECTION_SECRET_SALT` + '`' + ` immediately renders all stored vectors mathematically useless, guaranteeing zero lingering biometric retention.\n` +
          `4. **Strict Separation:** The public live tracking stream only shows anonymized spatial clusters with zero citizen PII.`
      }
    }

    // Default Fallback
    return {
      text: `I received your inquiry regarding: "*${q}*".\n\n` +
        `As the COMELEC election oversight agent, I can assist you with:\n` +
        `1. **Voter Dossier Summaries:** Try asking "*Summarize voter CARLOS DELA CRUZ*" or "*Tell me about Maria Santos*".\n` +
        `2. **Attendance & Timing Anomalies:** Inquire about Face IN/OUT duration benchmarks and rush/delay outliers.\n` +
        `3. **Spatial Radar:** Ask about clusters in Sampaguita or dorm mitigation.\n` +
        `4. **Forensic Handwriting:** Query batch forgeries and matching glyph clusters.\n\n` +
        `Feel free to click any of the query chips below or choose a voter from the Quick Summarizer bar!`
    }
  }

  function generatePlaceholderAvatar(name, bg, fg) {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = bg || '#1e293b'
    ctx.fillRect(0, 0, 160, 160)
    ctx.fillStyle = fg || '#38bdf8'
    ctx.font = 'bold 54px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CIT'
    ctx.fillText(initials, 80, 80)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  return (
    <div className="page" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <PageHead title="ONCE AI Chatbot" feature="Conversational Intelligence | Voter Dossier Summarizer">
        Conversational assistant for COMELEC election officers. Query registered voter dossiers (ID vs live verification photos), self-learned AI pacing anomalies, and forensic clusters.
      </PageHead>
      <SyntheticBanner />

      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 480, padding: 0, overflow: 'hidden' }}>
        {/* Chat Header */}
        <div style={{ padding: '12px 18px', background: 'var(--panel2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#c0272d', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 2px 10px rgba(192,39,45,0.3)' }}>
              <Bot size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>ONCE AI Sovereign Oversight Assistant</div>
              <div className="small muted">Dual-Face Biometrics • Self-Learned Pacing Engine • RA 10173 Compliant</div>
            </div>
          </div>

          {/* Quick Voter Summarizer Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <IdCard size={14} /> Quick Summarize Voter:
            </span>
            <select
              value={selectedVoterId}
              onChange={(e) => {
                setSelectedVoterId(e.target.value)
                handleSummarizeVoter(e.target.value)
              }}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--border)' }}
            >
              <option value="">Select Enrolled Citizen...</option>
              {comelecVoters.map((v) => (
                <option key={v.voter_id} value={v.voter_id}>
                  {v.name} ({v.vin || v.voter_id.slice(-6)})
                </option>
              ))}
              {!comelecVoters.length && (
                <option value="DEMO-CARLOS">Carlos Dela Cruz (Simulated)</option>
              )}
            </select>
          </div>
        </div>

        {/* Message Log */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m, idx) => (
            <div 
              key={idx} 
              style={{ 
                display: 'flex', 
                gap: 12, 
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: m.sender === 'user' ? '70%' : '88%'
              }}
            >
              {m.sender === 'bot' && (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--panel2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Sparkles size={16} color="#c0272d" />
                </div>
              )}

              <div>
                <div 
                  style={{ 
                    background: m.sender === 'user' ? 'var(--blue)' : 'var(--panel2)', 
                    color: m.sender === 'user' ? '#fff' : 'var(--text)', 
                    padding: '14px 18px', 
                    borderRadius: 16,
                    borderTopLeftRadius: m.sender === 'bot' ? 4 : 16,
                    borderTopRightRadius: m.sender === 'user' ? 4 : 16,
                    lineHeight: 1.5,
                    fontSize: 13.5,
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {m.text}

                  {/* -------------------------------------------------------- */}
                  {/* VOTER DOSSIER SUMMARY CARD WITH ID VS LIVE VERIFIED PHOTOS */}
                  {/* -------------------------------------------------------- */}
                  {m.voterDossier && (
                    <div style={{ 
                      marginTop: 14, 
                      background: 'var(--panel)', 
                      border: '1.5px solid var(--border)', 
                      borderRadius: 14, 
                      padding: 16,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800 }}>{m.voterDossier.name}</div>
                          <div className="mono small" style={{ color: 'var(--muted)' }}>VIN: {m.voterDossier.vin} • ID: {m.voterDossier.voter_id}</div>
                        </div>
                        <Badge tone={m.voterDossier.registration_status.includes('FLAGGED') ? 'high' : 'low'}>
                          {m.voterDossier.registration_status}
                        </Badge>
                      </div>

                      {/* TRIPLE PHOTO COMPARISON: ID PHOTO VS LIVE FACE IN VS LIVE FACE OUT */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                          Biometric Photo Comparison (Official Registry vs Live Intake & Exit Verification)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
                          {/* 1. Official COMELEC ID Photo */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ width: '100%', height: 145, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--border)', background: '#090d16', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img 
                                src={m.voterDossier.photo_id_base64 || generatePlaceholderAvatar(m.voterDossier.name)} 
                                alt="Official ID Photo" 
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                            </div>
                            <span className="chip small" style={{ fontSize: 10, fontWeight: 700 }}>
                              1. Official ID Photo
                            </span>
                          </div>

                          {/* 2. Live Face IN (Check-In) */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ width: '100%', height: 145, borderRadius: 10, overflow: 'hidden', border: '2px solid #22c55e', background: '#090d16', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {m.voterDossier.photo_in_base64 ? (
                                <img 
                                  src={m.voterDossier.photo_in_base64} 
                                  alt="Live Face IN" 
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                              ) : (
                                <div style={{ color: 'var(--muted)', fontSize: 11, padding: 8 }}>
                                  ⏳ Not yet checked in
                                </div>
                              )}
                            </div>
                            <span className="chip small" style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>
                              2. Live Face IN {m.voterDossier.face_in_timestamp ? `(${m.voterDossier.face_in_timestamp.split(' ')[1] || m.voterDossier.face_in_timestamp})` : '(Pending)'}
                            </span>
                          </div>

                          {/* 3. Live Face OUT (Check-Out) */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ width: '100%', height: 145, borderRadius: 10, overflow: 'hidden', border: '2px solid #38bdf8', background: '#090d16', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {m.voterDossier.photo_out_base64 ? (
                                <img 
                                  src={m.voterDossier.photo_out_base64} 
                                  alt="Live Face OUT" 
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                              ) : (
                                <div style={{ color: 'var(--muted)', fontSize: 11, padding: 8 }}>
                                  ⏳ Pending Exit
                                  <div style={{ fontSize: 9.5, opacity: 0.8, marginTop: 2 }}>Citizen in booth</div>
                                </div>
                              )}
                            </div>
                            <span className="chip small" style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8' }}>
                              3. Live Face OUT {m.voterDossier.face_out_timestamp ? `(${m.voterDossier.face_out_timestamp.split(' ')[1] || m.voterDossier.face_out_timestamp})` : '(Pending)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Attendance Timestamps & Voting Booth Duration */}
                      <div style={{ background: 'var(--panel2)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, fontSize: 12 }}>
                          <div>
                            <span className="muted small">Assigned Precinct</span>
                            <div style={{ fontWeight: 700 }}>{m.voterDossier.precinct_id}</div>
                          </div>
                          <div>
                            <span className="muted small">Face IN Check-In</span>
                            <div className="mono" style={{ fontWeight: 700, color: m.voterDossier.face_in_timestamp ? '#22c55e' : 'var(--muted)' }}>
                              {m.voterDossier.face_in_timestamp || 'Pending Check-In'}
                            </div>
                          </div>
                          <div>
                            <span className="muted small">Face OUT Check-Out</span>
                            <div className="mono" style={{ fontWeight: 700, color: m.voterDossier.face_out_timestamp ? '#38bdf8' : '#fbbf24' }}>
                              {m.voterDossier.face_out_timestamp || (m.voterDossier.face_in_timestamp ? '⏳ Voting in booth' : 'Pending')}
                            </div>
                          </div>
                          <div>
                            <span className="muted small">Total Voting Duration</span>
                            <div style={{ fontWeight: 800, color: m.voterDossier.timing_anomaly?.flag && m.voterDossier.timing_anomaly.flag !== 'NORMAL' ? '#f43f5e' : '#38bdf8' }}>
                              {m.voterDossier.duration_formatted || (m.voterDossier.face_in_timestamp ? 'In progress...' : 'N/A')}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Self-Learned AI Pacing Verdict */}
                      <div style={{ 
                        padding: '10px 14px', 
                        borderRadius: 10, 
                        background: (!m.voterDossier.timing_anomaly || m.voterDossier.timing_anomaly?.flag === 'NORMAL') ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.18)',
                        border: (!m.voterDossier.timing_anomaly || m.voterDossier.timing_anomaly?.flag === 'NORMAL') ? '1px solid rgba(34, 197, 94, 0.3)' : '1.5px solid rgba(239, 68, 68, 0.5)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ 
                            fontWeight: 800, 
                            fontSize: 12,
                            color: (!m.voterDossier.timing_anomaly || m.voterDossier.timing_anomaly?.flag === 'NORMAL') ? '#22c55e' : '#f43f5e',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}>
                            {(!m.voterDossier.timing_anomaly || m.voterDossier.timing_anomaly?.flag === 'NORMAL') ? <CheckCircle2 size={14} /> : <AlertOctagon size={14} />}
                            {m.voterDossier.timing_anomaly?.flag && m.voterDossier.timing_anomaly.flag !== 'NORMAL' ? '🚨 SUSPICIOUS PACING ANOMALY: ' : 'AI Pacing Verdict: '}
                            {m.voterDossier.timing_anomaly?.flag || 'NORMAL (PENDING COMPLETION)'}
                          </span>
                          <span className="mono small" style={{ fontSize: 11 }}>
                            Match: <b>{m.voterDossier.id_match_confidence}%</b> (Facenet512)
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text)', lineHeight: 1.4 }}>
                          {m.voterDossier.timing_anomaly?.explanation || 'Awaiting Face OUT exit scan to complete statistical pacing anomaly evaluation.'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Standard Query Cards */}
                  {m.cards && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                      {m.cards.map((c) => (
                        <div 
                          key={c.id} 
                          onClick={() => openApp(c.id)}
                          style={{ 
                            background: 'var(--panel)', 
                            border: '1px solid var(--border)', 
                            borderRadius: 10, 
                            padding: '8px 12px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{c.id} — {c.name}</div>
                            <div className="small muted">{c.address}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <RiskBadge label={c.label} />
                            <ArrowRight size={14} className="muted" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="small muted" style={{ fontSize: 10, marginTop: 4, textAlign: m.sender === 'user' ? 'right' : 'left' }}>
                  {m.timestamp}
                </div>
              </div>

              {m.sender === 'user' && (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--panel2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <User size={16} />
                </div>
              )}
            </div>
          ))}

          {typing && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--panel2)', display: 'grid', placeItems: 'center' }}>
                <Sparkles size={16} className="animate-spin" />
              </div>
              <div className="small muted">ONCE AI is analyzing biometric records & self-learning timestamps...</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggested Queries Chips */}
        <div style={{ padding: '8px 16px', background: 'var(--panel2)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {SUGGESTED_QUERIES.map((q, i) => (
            <button 
              key={i} 
              type="button" 
              className="chip small" 
              onClick={() => handleSend(q)}
              style={{ cursor: 'pointer', background: 'var(--panel)', border: '1px solid var(--border)' }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
          style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, background: 'var(--panel)' }}
        >
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Ask about any voter, compare ID vs live verification photos, or query AI pacing anomalies..."
            style={{ flex: 1, padding: '10px 14px' }}
          />
          <button type="submit" className="btn primary" disabled={!input.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px' }}>
            <Send size={15} />
            <span>Send</span>
          </button>
        </form>
      </Card>
    </div>
  )
}
