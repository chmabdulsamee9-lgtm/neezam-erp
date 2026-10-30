// Admin UI overhaul, Part C4 — one small shared style module for the Settings shell and
// its sections, reused instead of each page hand-rolling its own one-off cardStyle/
// inputStyle objects (diagnose found no shared Card/Input component existed anywhere).
// Scoped deliberately narrow: this only wraps container/label/input chrome — it never
// changes any page's functional behavior.
export function SettingsCard({ children, style }) {
  return (
    <div style={{
      background: 'var(--ne-surface-2)', border: '1px solid var(--ne-border)', borderRadius: 14,
      padding: '1.5rem', marginBottom: '1.5rem', ...style,
    }}>
      {children}
    </div>
  )
}

export const settingsInputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--ne-border)',
  background: 'var(--ne-bg)', color: 'var(--ne-text)', fontSize: 13, boxSizing: 'border-box', marginBottom: 10,
}

export const settingsLabelStyle = { color: 'var(--ne-muted)', fontSize: 12, display: 'block', marginBottom: 4, fontWeight: 600 }

export function SettingsPageWrap({ children }) {
  return (
    <div style={{ padding: '1.5rem', maxWidth: 760, margin: '0 auto' }}>
      {children}
    </div>
  )
}
