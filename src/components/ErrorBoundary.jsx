import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Page error caught by boundary:', error, info)
    // logDevMonitoring agar available ho
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem', textAlign: 'center',
          color: 'var(--ne-text)', minHeight: '200px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '1rem'
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontWeight: 700 }}>Kuch masla aaya — page reload karo</div>
          <div style={{ fontSize: 12, color: 'var(--ne-muted)' }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px', borderRadius: 8,
              background: 'var(--ne-grad)', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 700
            }}
          >
            Dobara try karo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
