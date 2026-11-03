import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { SEED_APPS } from './data/seed.js'
import { analyze, summarize, DEFAULT_CONFIG, caseOf } from './lib/pipeline.js'
import { cyrb53 } from './lib/rng.js'

const KEY = 'onceai.prototype.v3'
export const ROLES = {
  admin: { label: 'COMELEC Staff / Administrator', canEdit: true, canConfig: true },
}

const initial = {
  role: 'admin',
  theme: 'light',
  config: DEFAULT_CONFIG,
  extraApps: [],
  caseState: {},
  indicatorReview: {},
  clusterReview: {},
  audit: [],
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...initial, ...parsed, role: 'admin' }
    }
  } catch (e) { /* storage unavailable */ }
  return initial
}

function makeAudit(state, entry) {
  const prev = state.audit.length ? state.audit[state.audit.length - 1].hash : 'GENESIS'
  const base = { id: state.audit.length + 1, ts: new Date().toISOString(), role: 'admin', ...entry }
  return { ...base, prevHash: prev, hash: cyrb53(prev + JSON.stringify(base)) }
}

function reducer(state, a) {
  const log = (entry) => [...state.audit, makeAudit(state, entry)]
  const now = new Date().toISOString()
  switch (a.type) {
    case 'role': return { ...state, role: 'admin' }
    case 'theme': return { ...state, theme: a.theme }
    case 'config': return { ...state, config: a.config, audit: log({ action: 'CONFIG_CHANGE', target: 'screening-config', detail: a.detail }) }
    case 'addApp': return { ...state, extraApps: [...state.extraApps, a.app], audit: log({ action: 'APPLICATION_INTAKE', target: a.app.id, detail: `Application entered via Registration Intake; address standardized and screened` }) }
    case 'caseUpdate': {
      const cur = caseOf(state.caseState, a.id)
      const next = { ...cur, ...a.patch, history: [...cur.history, { ts: now, role: 'admin', text: a.text }] }
      return { ...state, caseState: { ...state.caseState, [a.id]: next }, audit: log({ action: a.action || 'CASE_UPDATE', target: a.id, detail: a.text }) }
    }
    case 'note': {
      const cur = caseOf(state.caseState, a.id)
      const next = { ...cur, notes: [...cur.notes, { ts: now, role: 'admin', text: a.text }], history: [...cur.history, { ts: now, role: 'admin', text: 'Reviewer note added' }] }
      return { ...state, caseState: { ...state.caseState, [a.id]: next }, audit: log({ action: 'NOTE_ADDED', target: a.id, detail: a.text.slice(0, 140) }) }
    }
    case 'indicatorReview': return { ...state, indicatorReview: { ...state.indicatorReview, [a.key]: a.value }, audit: log({ action: 'INDICATOR_REVIEW', target: a.key, detail: `Indicator review status set to "${a.value}"` }) }
    case 'clusterReview': return { ...state, clusterReview: { ...state.clusterReview, [a.id]: a.value }, audit: log({ action: 'CLUSTER_REVIEW', target: a.id, detail: `Cluster review status set to "${a.value}"` }) }
    case 'logView': return { ...state, audit: log({ action: a.action, target: a.target, detail: a.detail }) }
    case 'removeApp': {
      const nextExtra = (state.extraApps || []).filter((x) => x.id !== a.id)
      const nextCaseState = { ...state.caseState }
      delete nextCaseState[a.id]
      return {
        ...state,
        extraApps: nextExtra,
        caseState: nextCaseState,
        audit: log({ action: 'MOCK_RECORD_DELETED', target: a.id, detail: `Mock test record ${a.id} permanently removed.` })
      }
    }
    case 'clearMockTesting': {
      const seedIds = new Set(SEED_APPS.map((x) => x.id))
      const cleanCaseState = {}
      if (state.caseState) {
        Object.entries(state.caseState).forEach(([k, v]) => {
          if (seedIds.has(k)) {
            cleanCaseState[k] = v
          }
        })
      }
      return {
        ...state,
        extraApps: [],
        caseState: cleanCaseState,
        audit: log({ action: 'CLEAR_MOCK_TESTING', target: 'all', detail: 'Purged all mock testing applications and test cases from investigation queue.' })
      }
    }
    case 'reset': return { ...initial, role: 'admin', theme: state.theme, audit: [makeAudit({ ...initial, role: 'admin' }, { action: 'DEMO_RESET', target: 'all', detail: 'Demo data reset to the synthetic seed state' })] }
    default: return state
  }
}

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  const [openId, setOpenId] = useState(null)
  const [toast, setToast] = useState(null)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { /* ignore */ } }, [state])
  useEffect(() => { document.documentElement.setAttribute('data-theme', state.theme) }, [state.theme])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t) } }, [toast])

  const allApps = useMemo(() => [...SEED_APPS, ...state.extraApps], [state.extraApps])
  const result = useMemo(() => analyze(allApps, state.config), [allApps, state.config])
  const summary = useMemo(() => summarize(result, state.caseState), [result, state.caseState])
  const perm = ROLES.admin

  const value = { state, dispatch, result, summary, perm, openId, openApp: setOpenId, toast, notify: setToast, allApps }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
