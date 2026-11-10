import { Component } from 'react'
import { useLanguage, useTranslation } from '../i18n'
import { resetSidebarStorage } from '../lib/sidebarState'

// Outermost safety net: if anything in the app shell throws while rendering, show a friendly screen instead of a blank white page.
// "Reload" first forgets the stored sidebar state (the usual cause of a screen that stays broken after a refresh), then reloads.
function CrashScreen() {
  const [lang] = useLanguage()
  const t = useTranslation(lang)
  const reload = () => { resetSidebarStorage(); window.location.reload() }
  return (
    <div role="alert" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', background: 'var(--ne-bg)', color: 'var(--ne-text)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: 'min(380px, 100%)', textAlign: 'center', background: 'var(--ne-surface-2)', border: '1px solid var(--ne-border)', borderRadius: 14, padding: '28px 24px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>{t('crash.title')}</h1>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ne-muted)' }}>{t('crash.body')}</p>
        <button onClick={reload} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: 'var(--ne-grad)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('crash.reload')}</button>
      </div>
    </div>
  )
}

export default class AppCrashBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }

  render() {
    return this.state.crashed ? <CrashScreen /> : this.props.children
  }
}
