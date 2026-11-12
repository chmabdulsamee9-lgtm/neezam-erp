import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import useIsMobile from '../hooks/useIsMobile'
import { WHATS_NEW_PAGES, nextStep, prevStep, isLastStep, markWhatsNewSeen } from '../lib/whatsNew'

// Three-step "what is new" tour in a portal on document.body (above the sidebar and the Settings panel).
// Any way of closing it (Skip, Got it, Esc, click outside) marks the release as seen.
export default function WhatsNew({ onClose, t }) {
  const [step, setStep] = useState(0)
  const isMobile = useIsMobile() // phones: bottom sheet
  const cardRef = useRef(null)
  const close = () => { markWhatsNewSeen(); onClose() }
  const last = isLastStep(step)
  const page = WHATS_NEW_PAGES[step]

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { markWhatsNewSeen(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const btn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: isMobile ? 44 : undefined }
  return createPortal(
    <div onMouseDown={(e) => { if (cardRef.current && !cardRef.current.contains(e.target)) close() }}
      style={{ position: 'fixed', inset: 0, zIndex: 3100, background: 'rgba(10,14,38,.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
      <div ref={cardRef} role="dialog" aria-modal="true" aria-label={t('whatsnew.heading')}
        style={{ width: isMobile ? '100%' : 'min(420px, 100%)', background: 'var(--ne-surface-2)', color: 'var(--ne-text)', border: '1px solid var(--ne-border)', borderRadius: isMobile ? '14px 14px 0 0' : 14, padding: isMobile ? '22px 20px calc(18px + env(safe-area-inset-bottom))' : '22px 22px 18px', boxShadow: '0 16px 48px rgba(0,0,0,.35)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ne-muted)' }}>{t('whatsnew.heading')}</span>
          <span style={{ fontSize: 11, color: 'var(--ne-muted)' }}>{step + 1} / {WHATS_NEW_PAGES.length}</span>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--ne-accent-soft)', color: 'var(--ne-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Icon name={page.icon} size={20} />
        </div>
        <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>{t(page.title)}</h2>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9, minHeight: 138, alignContent: 'start' }}>
          {page.bullets.map((b) => (
            <li key={b} style={{ display: 'flex', gap: 9, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ne-text)' }}>
              <span style={{ color: 'var(--ne-success)', marginTop: 3 }}><Icon name="check" size={13} /></span>
              <span>{t(b)}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '16px 0 14px' }} aria-hidden="true">
          {WHATS_NEW_PAGES.map((_, i) => (
            <span key={i} style={{ width: i === step ? 18 : 7, height: 7, borderRadius: 4, background: i === step ? 'var(--ne-accent)' : 'var(--ne-border)', transition: 'width .15s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!last && <button onClick={close} style={{ ...btn, background: 'none', border: 'none', color: 'var(--ne-muted)', padding: '9px 6px' }}>{t('whatsnew.skip')}</button>}
          <span style={{ flex: 1 }} />
          {step > 0 && <button onClick={() => setStep((s) => prevStep(s))} style={{ ...btn, background: 'transparent', border: '1px solid var(--ne-border)', color: 'var(--ne-text)' }}><Icon name="chevronLeft" size={13} /> {t('whatsnew.back')}</button>}
          {last
            ? <button onClick={close} style={{ ...btn, background: 'var(--ne-grad)', border: 'none', color: '#fff' }}>{t('whatsnew.gotIt')}</button>
            : <button onClick={() => setStep((s) => nextStep(s))} style={{ ...btn, background: 'var(--ne-grad)', border: 'none', color: '#fff' }}>{t('whatsnew.next')} <Icon name="chevronRight" size={13} /></button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
