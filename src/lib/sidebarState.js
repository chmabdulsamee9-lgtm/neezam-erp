// Sidebar state: collapsed by default; a manual toggle is kept for the current browser session only (sessionStorage), so a page
// refresh keeps it but a new browser session or a new login starts collapsed. Any old persisted localStorage value is ignored and removed.
const KEY = 'neezam_sidebar_open'
const LEGACY_KEYS = ['neezam_sidebar_open', 'neezam_sidebar', 'neezam_sidebarOpen']

export function readSidebarOpen(storage = typeof window !== 'undefined' ? window : null) {
  try {
    if (!storage) return false
    for (const k of LEGACY_KEYS) storage.localStorage.removeItem(k)
    return storage.sessionStorage.getItem(KEY) === '1'
  } catch { return false }
}

export function writeSidebarOpen(open, storage = typeof window !== 'undefined' ? window : null) {
  try { if (storage) storage.sessionStorage.setItem(KEY, open ? '1' : '0') } catch { /* private mode: state just stays in memory */ }
}

export function clearSidebarOpen(storage = typeof window !== 'undefined' ? window : null) {
  try { if (storage) storage.sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

export const SIDEBAR_IDLE_MS = 120000

/** used by the crash screen: forget every stored sidebar value so the next start is collapsed */
export function resetSidebarStorage(storage = typeof window !== 'undefined' ? window : null) {
  try {
    if (!storage) return
    for (const k of LEGACY_KEYS) storage.localStorage.removeItem(k)
    storage.sessionStorage.removeItem(KEY)
  } catch { /* ignore */ }
}

/**
 * Collapses after delayMs without activity. touch() (re)starts the countdown, stop() cancels it.
 * When the countdown ends and canCollapse() is false (a popup is open, an input is focused, the pointer is over the sidebar)
 * it does not collapse and counts another full delay instead.
 */
// the default timers are wrapped: a browser's window.setTimeout throws "Illegal invocation" when it is called as a method of another object
const realTimers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) }

export function createIdleCollapse({ delayMs = SIDEBAR_IDLE_MS, onIdle, canCollapse = () => true, timers = realTimers }) {
  let id = null
  const stop = () => { if (id !== null) { timers.clearTimeout(id); id = null } }
  const fire = () => {
    id = null
    if (canCollapse()) onIdle()
    else id = timers.setTimeout(fire, delayMs)
  }
  const touch = () => { stop(); id = timers.setTimeout(fire, delayMs) }
  return { touch, stop }
}
