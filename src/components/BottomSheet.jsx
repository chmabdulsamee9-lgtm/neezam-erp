import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

// Mobile bottom sheet in a portal on document.body. Closes on backdrop tap, the close button, Esc and the phone's Back button
// (one history entry is added while it is open). Locks the page scroll while open. Body scrolls; `footer` stays at the bottom.
// full: takes the whole screen height (used by the Menu).
export default function BottomSheet({ open, onClose, title, closeLabel, footer, full = false, zIndex = 2950, children }) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const body = document.body
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    // Back button: push one entry for the sheet; going back pops it and closes the sheet
    let pushed = false
    try { window.history.pushState({ ...(window.history.state || {}), neSheet: true }, ''); pushed = true } catch { pushed = false }
    let closedByBack = false
    const onPop = () => { closedByBack = true; closeRef.current && closeRef.current() }
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current && closeRef.current() }
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKey)
    return () => {
      body.style.overflow = prevOverflow
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKey)
      // closed another way (button, backdrop, a link inside): drop our extra entry if it is still the current one
      if (pushed && !closedByBack) {
        try { if (window.history.state && window.history.state.neSheet) window.history.back() } catch { /* ignore */ }
      }
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="ne-sheet-backdrop" style={{ zIndex }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`ne-sheet${full ? ' ne-sheet-full' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ne-sheet-head">
          <span className="ne-sheet-grip" aria-hidden="true" />
          <h2 className="ne-sheet-title">{title}</h2>
          <button className="ne-sheet-close" onClick={onClose} aria-label={closeLabel}><Icon name="close" size={16} /></button>
        </div>
        <div className="ne-sheet-body">{children}</div>
        {footer && <div className="ne-sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
