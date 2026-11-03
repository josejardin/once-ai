import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 32,
          maxWidth: 640,
          margin: '40px auto',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow)',
          textAlign: 'center'
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 16px',
            color: 'var(--high)'
          }}>
            <AlertTriangle size={24} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
            Something went wrong on this page
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
            An unexpected error occurred while rendering this section.
          </p>
          {this.state.error && (
            <pre style={{
              background: 'var(--panel2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              textAlign: 'left',
              overflowX: 'auto',
              color: 'var(--high)',
              fontFamily: 'monospace',
              marginBottom: 20
            }}>
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              className="btn primary"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                if (this.props.onReset) this.props.onReset()
                else window.location.reload()
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} />
              <span>Retry / Reload</span>
            </button>
            <a
              href="#/dashboard"
              className="btn"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                if (this.props.onGoHome) this.props.onGoHome()
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <Home size={14} />
              <span>Back to Dashboard</span>
            </a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
