// eNeezam i18n — lightweight dictionary + hook, no external library.
// Scope (Phase 5, scoped down per user confirmation): sidebar/topbar nav labels + common
// high-visibility UI strings only. Deep per-page strings stay Roman Urdu (unchanged) for now —
// the "ur" dictionary below mirrors the app's existing default text so nothing looks different
// until a user actually switches to English.
//
// Wiring (done in Phase 6 alongside App.jsx's sidebar/topbar rewrite):
//   import { useLanguage, useTranslation } from './i18n'
//   const [lang, setLang] = useLanguage()       // reads/writes localStorage + profiles.preferred_language
//   const t = useTranslation(lang)
//   t('nav.dashboard') -> 'Dashboard' | 'Dashboard' (nav labels are already English in both)
//   t('action.save')   -> 'Save Karo' | 'Save'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const LANGUAGES = [
  { code: 'ur', label: 'Roman Urdu' },
  { code: 'en', label: 'English' },
]

export const translations = {
  ur: {
    'nav.group.overview': 'Overview',
    'nav.group.operations': 'Operations',
    'nav.group.insights': 'Insights',
    'nav.group.channels': 'Channels',
    'nav.dashboard': 'Dashboard',
    'nav.orders': 'Orders',
    'nav.courier': 'Booked Orders',
    'nav.returns': 'Returns',
    'nav.products': 'Products',
    'nav.ads': 'Ads Analytics',
    'nav.pnl': 'Profit & Loss',
    'nav.ledger': 'Supplier Ledger',
    'nav.cities': 'City Performance',
    'nav.budget': 'Budget Calculator',
    'nav.suggestions': 'Suggestions',
    'nav.courier-dashboard': 'Courier Dashboard',
    'nav.whatsapp': 'WhatsApp',
    'nav.store-connect': 'Store Connect',
    'nav.meta-connect': 'Meta Connect',
    'nav.courier-connect': 'Courier Connect',
    'nav.payments': 'Payments',
    'nav.team': 'Team',
    'nav.activity-log': 'Activity Log',
    'nav.settings': 'Settings',

    'action.save': 'Save Karo',
    'action.cancel': 'Cancel Karo',
    'action.edit': 'Edit Karo',
    'action.delete': 'Delete Karo',
    'action.add': 'Add Karo',
    'action.confirm': 'Confirm Karo',
    'action.back': 'Wapas',
    'action.next': 'Agla',
    'action.search': 'Search Karo',
    'action.logout': 'Logout Karo',
    'action.yes': 'Haan',
    'action.no': 'Nahi',
    'common.loading': 'Load ho raha hai...',
    'common.welcome': 'Khush aamdeed',

    'theme.toggle': 'Theme switch karo',
    'lang.switch': 'Zaban badlo',
  },
  en: {
    'nav.group.overview': 'Overview',
    'nav.group.operations': 'Operations',
    'nav.group.insights': 'Insights',
    'nav.group.channels': 'Channels',
    'nav.dashboard': 'Dashboard',
    'nav.orders': 'Orders',
    'nav.courier': 'Booked Orders',
    'nav.returns': 'Returns',
    'nav.products': 'Products',
    'nav.ads': 'Ads Analytics',
    'nav.pnl': 'Profit & Loss',
    'nav.ledger': 'Supplier Ledger',
    'nav.cities': 'City Performance',
    'nav.budget': 'Budget Calculator',
    'nav.suggestions': 'Suggestions',
    'nav.courier-dashboard': 'Courier Dashboard',
    'nav.whatsapp': 'WhatsApp',
    'nav.store-connect': 'Store Connect',
    'nav.meta-connect': 'Meta Connect',
    'nav.courier-connect': 'Courier Connect',
    'nav.payments': 'Payments',
    'nav.team': 'Team',
    'nav.activity-log': 'Activity Log',
    'nav.settings': 'Settings',

    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.edit': 'Edit',
    'action.delete': 'Delete',
    'action.add': 'Add',
    'action.confirm': 'Confirm',
    'action.back': 'Back',
    'action.next': 'Next',
    'action.search': 'Search',
    'action.logout': 'Logout',
    'action.yes': 'Yes',
    'action.no': 'No',
    'common.loading': 'Loading...',
    'common.welcome': 'Welcome',

    'theme.toggle': 'Switch theme',
    'lang.switch': 'Change language',
  },
}

const STORAGE_KEY = 'ne_lang'

export function getStoredLanguage() {
  if (typeof window === 'undefined') return 'ur'
  return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ur'
}

// Reads/writes localStorage immediately (instant UI response) and best-effort
// syncs profiles.preferred_language in the background so the choice follows
// the user across devices.
export function useLanguage(profileId) {
  const [lang, setLangState] = useState(getStoredLanguage())

  const setLang = useCallback((next) => {
    setLangState(next)
    localStorage.setItem(STORAGE_KEY, next)
    if (profileId) {
      supabase.from('profiles').update({ preferred_language: next }).eq('id', profileId).then(() => {})
    }
  }, [profileId])

  return [lang, setLang]
}

export function useTranslation(lang) {
  return useCallback((key) => translations[lang]?.[key] ?? translations.ur[key] ?? key, [lang])
}
