// "What is new" tour: 3 short pages, shown once per user per release (seen flag in localStorage keyed by the release id).
// The content is built in (i18n keys below); it does not need the database, so it works without any SQL.
export const WHATS_NEW_ID = 'whatsnew-2026-11'
const KEY_PREFIX = 'neezam_'

export const WHATS_NEW_PAGES = [
  { icon: 'palette', title: 'whatsnew.p1.title', bullets: ['whatsnew.p1.b1', 'whatsnew.p1.b2', 'whatsnew.p1.b3'] },
  { icon: 'megaphone', title: 'whatsnew.p2.title', bullets: ['whatsnew.p2.b1', 'whatsnew.p2.b2', 'whatsnew.p2.b3'] },
  { icon: 'sparkle', title: 'whatsnew.p3.title', bullets: ['whatsnew.p3.b1', 'whatsnew.p3.b2', 'whatsnew.p3.b3'] },
]

const store = () => { try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null } }

export function hasSeenWhatsNew(id = WHATS_NEW_ID, storage = store()) {
  try { return !!storage && storage.getItem(KEY_PREFIX + id) === '1' } catch { return true } // storage unreadable: do not nag
}
export function markWhatsNewSeen(id = WHATS_NEW_ID, storage = store()) {
  try { if (storage) storage.setItem(KEY_PREFIX + id, '1') } catch { /* ignore */ }
}

export const clampStep = (i, n = WHATS_NEW_PAGES.length) => Math.min(Math.max(i, 0), n - 1)
export const nextStep = (i, n = WHATS_NEW_PAGES.length) => clampStep(i + 1, n)
export const prevStep = (i, n = WHATS_NEW_PAGES.length) => clampStep(i - 1, n)
export const isLastStep = (i, n = WHATS_NEW_PAGES.length) => i >= n - 1
