import { useState, useLayoutEffect, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { placeBeside } from '../lib/popoverPosition'
import useIsMobile from '../hooks/useIsMobile'

// A popup rendered in a portal on document.body with position: fixed, so neither the sidebar (overflow: hidden)
// nor the Settings panel can clip it. Position comes from the trigger's and the sidebar's getBoundingClientRect(),
// re-measured on resize and scroll and clamped to the viewport. Closes on outside click and Esc.
// anchorRef : the trigger (decides the vertical position; clicks on it are not "outside", the trigger toggles itself)
// edgeSelector : the element the popup sits beside (the sidebar); falls back to the trigger itself
export default function FloatingPanel({ anchorRef, onClose, width = 230, maxHeightCap = 0, edgeSelector = '.ne-sidebar', className = '', children }) {
  const panelRef = useRef(null)
  const isMobile = useIsMobile() // phones: the popup becomes a bottom sheet (see .ne-float-sheet in theme.css)
  const [pos, setPos] = useState({ left: -9999, top: -9999, width, maxHeight: 0 })

  const measure = () => {
    const anchorEl = anchorRef && anchorRef.current
    const panelEl = panelRef.current
    if (!anchorEl || !panelEl) return
    const a = anchorEl.getBoundingClientRect()
    const edgeEl = anchorEl.closest(edgeSelector)
    const e = edgeEl ? edgeEl.getBoundingClientRect() : a
    const rtl = (document.documentElement.dir || document.body.dir || 'ltr') === 'rtl'
    const next = placeBeside({
      edge: { left: e.left, right: e.right }, anchor: { top: a.top, bottom: a.bottom },
      size: { w: width, h: panelEl.offsetHeight }, vp: { w: window.innerWidth, h: window.innerHeight }, rtl,
    })
    // only update when something moved, otherwise the layout effect below would re-render forever
    setPos((cur) => (cur.left === next.left && cur.top === next.top && cur.width === next.width && cur.maxHeight === next.maxHeight ? cur : next))
  }

  useLayoutEffect(() => { measure() })
  useEffect(() => {
    const onDown = (e) => {
      const inPanel = panelRef.current && panelRef.current.contains(e.target)
      const inAnchor = anchorRef && anchorRef.current && anchorRef.current.contains(e.target)
      if (!inPanel && !inAnchor) onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [onClose])

  return createPortal(
    <div ref={panelRef} className={isMobile ? `${className} ne-float-sheet` : className}
      style={isMobile
        ? { position: 'fixed', left: 0, right: 0, bottom: 0, top: 'auto', width: '100%', maxHeight: '80dvh', zIndex: 3000, boxSizing: 'border-box' }
        : { position: 'fixed', left: pos.left, top: pos.top, right: 'auto', bottom: 'auto', width: pos.width, maxHeight: maxHeightCap ? Math.min(pos.maxHeight || maxHeightCap, maxHeightCap) : pos.maxHeight || undefined, zIndex: 3000, boxSizing: 'border-box' }}>
      {children}
    </div>,
    document.body,
  )
}
