// The ONE mobile breakpoint of the logged-in app. The same value is used by the CSS (@media (max-width: 760px) in theme.css)
// and by the pages that already switch layout at 760px. At 761px and wider the desktop UI is unchanged.
export const MOBILE_MAX_PX = 760
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_PX}px)`

// Bottom tab bar: the most used pages for a cash-on-delivery seller, in this order. Only the ones the user may open are shown
// (same hasAccess check as the sidebar); everything else stays reachable from the Menu sheet.
export const BOTTOM_TAB_CANDIDATES = ['home', 'orders', 'courier', 'products']
export const ALWAYS_VISIBLE = ['home']

/** ids for the bottom bar (max 4) given the sidebar's hasAccess(id) */
export function pickBottomTabs(hasAccess) {
  const can = typeof hasAccess === 'function' ? hasAccess : () => false
  return BOTTOM_TAB_CANDIDATES.filter((id) => ALWAYS_VISIBLE.includes(id) || can(id)).slice(0, 4)
}

/** which tab is highlighted for the current page (a child page highlights nothing unless it is itself a tab) */
export function activeTabFor(navMenu, tabs) {
  const m = String(navMenu || '')
  return tabs.find((id) => m === id || m.startsWith(`${id}/`)) || null
}

/** number of filters that differ from their "all" value; arrays count when not empty */
export function countActiveFilters(values, defaults) {
  let n = 0
  for (const [k, v] of Object.entries(values || {})) {
    if (Array.isArray(v)) { if (v.length) n++; continue }
    const d = defaults && Object.prototype.hasOwnProperty.call(defaults, k) ? defaults[k] : ''
    if (v !== undefined && v !== null && v !== '' && v !== d) n++
  }
  return n
}
