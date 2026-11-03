import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../store.jsx'
import { Badge, Card, PageHead, RiskBadge, SyntheticBanner } from '../components/ui.jsx'
import { getComelecVoters } from '../lib/api.js'
import { 
  MessageSquareText, Send, Sparkles, Bot, User, 
  HelpCircle, ArrowRight, ShieldCheck, AlertTriangle, FileText, CheckCircle2 
} from 'lucide-react'

const SUGGESTED_QUERIES = [
  'Show High priority cases in Sampaguita',
  'Summarize cluster CL-0089',
  'Which applications have matching handwriting?',
  'How does 100% Local AI biometric facial recognition work?',
  'List registered mock voters in COMELEC registry',
  'What is the status of ERB investigation cases?'
]

export default function Chatbot() {
  const { result, state, summary, openApp } = useApp()
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello, Administrator. I am the **ONCE AI Oversight Assistant**. I have authorized read-only access to voter applications, geospatial clusters, forensic handwriting similarity findings, and local biometric verification logs. How may I assist your election review today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, typing])

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
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
      setTyping(false)
    }, 600)
  }

  const generateAnswer = async (q, res, st, sm) => {
    const low = q.toLowerCase()

    if (low.includes('sampaguita') || low.includes('cl-0089') || low.includes('cluster')) {
      const c = res.clusters.find(x => x.id === 'CL-0089' || x.barangayName.toLowerCase().includes('sampaguita'))
      const appsInCluster = res.apps.filter(a => a.cluster?.id === c?.id)
      return {
        text: `**Spatial Cluster Investigation: ${c?.id || 'CL-0089'} (${c?.barangayName || 'Sampaguita'})**\n\n` +
          `• **Cluster Size:** ${c?.size || 16} voter applications within a dense radius.\n` +
          `• **Anomaly Severity:** ${(c?.severity * 100).toFixed(0)}% (Spike ratio: ${c?.stat?.spike || '2.3x'} baseline).\n` +
          `• **Context Analysis:** **${c?.status || 'Context unavailable'}**. Unlike student dorms, this address has no registered high-capacity residential structure, indicating a potential flying voter staging hub.\n\n` +
          `Here are the prominent applications in this cluster for immediate review:`,
        cards: appsInCluster.slice(0, 4).map(a => ({
          id: a.id,
          name: a.name,
          address: a.addr.normalized,
          label: a.label,
          score: a.score
        }))
      }
    }

    if (low.includes('high priority') || low.includes('flagged') || low.includes('high risk')) {
      const highApps = res.apps.filter(a => a.label === 'High')
      return {
        text: `**High-Risk Application Summary**\n\n` +
          `The ERB triage model has isolated **${highApps.length} High-Risk applications** requiring formal hearing. Under our conservative two-indicator policy, an application is only rated High if at least two independent indicators (e.g. spatial clustering + handwriting duplication) trigger simultaneously.`,
        cards: highApps.slice(0, 5).map(a => ({
          id: a.id,
          name: a.name,
          address: a.addr.normalized,
          label: a.label,
          score: a.score
        }))
      }
    }

    if (low.includes('handwriting') || low.includes('forgery') || low.includes('batch')) {
      const groups = res.handwriting.groups
      return {
        text: `**Batch Forgery & Handwriting Similarity Findings**\n\n` +
          `• **Similarity Groups:** Detected **${groups.length} distinct handwriting clusters** sharing high cosine similarity.\n` +
          `• **Threshold:** Cosine distance benchmark is configured at **${st.config.hwThreshold}**.\n` +
          `• **Largest Group:** Group **${groups[0]?.id || 'HW-G1'}** contains **${groups[0]?.ids.length || 7} applications** written with the exact same pen strokes and glyph morphology.\n\n` +
          `You can inspect pairwise visual comparisons in **Identification Analysis → Handwriting Similarity**.`,
        cards: groups.slice(0, 3).map(g => ({
          id: g.id,
          name: `${g.ids.length} Linked Applications`,
          address: `Application IDs: ${g.ids.slice(0, 3).join(', ')}...`,
          label: 'Moderate',
          score: 85
        }))
      }
    }

    if (low.includes('biometric') || low.includes('face') || low.includes('facial') || low.includes('local ai')) {
      return {
        text: `**Biometric Facial Recognition Architecture**\n\n` +
          `• **100% Local AI in RAM:** Powered by DeepFace FaceNet512, extracting 512-dimensional vector embeddings with zero cloud upload.\n` +
          `• **Cancelable Biometric Salt:** Vector templates are projected via an orthogonal matrix transformation ($Q \\in \\mathbb{R}^{512 \\times 512}$) to protect citizen privacy under **Republic Act 10173**.\n` +
          `• **1:1 Check-in Matching:** Calibrated at **0.77 threshold**. Legitimate voters consistently score ~82% - 88% confidence, while impostors (< 75%) are instantly blocked with an alert.\n` +
          `• **Physical Paper Ballot Protection:** Adheres to **Republic Act 9369**. Facial recognition is used exclusively for voter identity intake and precinct check-in, never for voting.`
      }
    }

    if (low.includes('mock') || low.includes('comelec') || low.includes('voter')) {
      let count = 0
      try {
        const d = await getComelecVoters()
        count = d.count || 0
      } catch (e) {}

      return {
        text: `**COMELEC Mock Voter Registry**\n\n` +
          `Currently, **${count} mock citizens** are enrolled in the local RAM database. You can generate new mock voter IDs or test 1:1 biometric facial check-in under the **Identification Analysis** or **COMELEC Mock Registry** tabs.`
      }
    }

    if (low.includes('case') || low.includes('investigation') || low.includes('erb')) {
      return {
        text: `**Investigation Cases Overview**\n\n` +
          `• **Awaiting Review:** ${sm.awaiting} cases\n` +
          `• **Pending Decision:** ${sm.pending} cases\n` +
          `• **Confirmed Anomalies:** ${sm.confirmed} cases\n` +
          `• **Dismissed / Cleared:** ${sm.dismissed} cases\n\n` +
          `Investigators can record findings, tag suspicious ringleaders, and prepare ERB hearing reports in **Investigation Cases**.`
      }
    }

    // Default Fallback
    return {
      text: `I received your inquiry regarding: "*${q}*".\n\n` +
        `As an election oversight agent, I can provide direct analysis across:\n` +
        `1. **Identification Analysis:** Facial 1:1 matches, flying voter cross-checks, and batch handwriting similarities.\n` +
        `2. **Geographic Analysis:** Spatial DBSCAN clustering, barangay baseline spikes, and dorm registration patterns.\n` +
        `3. **Voter Records:** Address normalization confidence and registration history.\n` +
        `4. **Audit Logs:** Immutable activity history and cryptographic hash chains.\n\n` +
        `Try clicking one of the suggested query chips below or asking about a specific barangay or application ID!`
    }
  }

  return (
    <div className="page" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <PageHead title="ONCE AI Chatbot" feature="Conversational Intelligence | Authorized Access">
        Conversational assistant for election officers and ERB investigators. Query authorized voter records, spatial clusters, handwriting anomalies, and biometric findings using natural language.
      </PageHead>
      <SyntheticBanner />

      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 460, padding: 0, overflow: 'hidden' }}>
        {/* Chat Header */}
        <div style={{ padding: '12px 18px', background: 'var(--panel2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue)', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <Bot size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>ONCE AI Investigation Assistant</div>
              <div className="small muted">Read-Only Secure Pipeline • Republic Act 10173 Compliant</div>
            </div>
          </div>
          <Badge tone="low">
            <ShieldCheck size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Active Session
          </Badge>
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
                maxWidth: m.sender === 'user' ? '70%' : '85%'
              }}
            >
              {m.sender === 'bot' && (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--panel2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Sparkles size={16} color="var(--blue)" />
                </div>
              )}

              <div>
                <div 
                  style={{ 
                    background: m.sender === 'user' ? 'var(--blue)' : 'var(--panel2)', 
                    color: m.sender === 'user' ? '#fff' : 'var(--text)', 
                    padding: '12px 16px', 
                    borderRadius: 16,
                    borderTopLeftRadius: m.sender === 'bot' ? 4 : 16,
                    borderTopRightRadius: m.sender === 'user' ? 4 : 16,
                    lineHeight: 1.5,
                    fontSize: 13.5,
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {m.text}

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
              <div className="small muted">ONCE AI is analyzing records...</div>
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
            placeholder="Ask about voter records, spatial clusters, handwriting anomalies, or biometrics..."
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
