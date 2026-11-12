import { useEffect, useState } from 'react'
import { MOBILE_QUERY } from '../lib/mobile'

// true below the one mobile breakpoint. Re-renders only when the breakpoint is crossed (matchMedia change), never on every resize pixel.
// matchMedia and its listener methods are always called on their own objects (never detached), see the setTimeout white-screen lesson.
function query() {
  try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_QUERY) : null } catch { return null }
}

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => { const mq = query(); return !!(mq && mq.matches) })
  useEffect(() => {
    const mq = query()
    if (!mq) return undefined
    const onChange = (e) => setIsMobile(!!e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange) // older Safari
    return () => mq.removeListener(onChange)
  }, [])
  return isMobile
}
