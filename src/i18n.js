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
    'nav.inventory': 'Inventory',
    'nav.dev-monitor': 'Dev Monitor',

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
    'common.comingSoon': 'Ye module jald aa raha hai!',

    'theme.toggle': 'Theme switch karo',
    'lang.switch': 'Zaban badlo',

    'pending.title': 'Approval ka wait hai',
    'pending.body': 'Aapka account abhi approve nahi hua. Jaise hi admin approve karega, aap Neezam use kar sakenge.',

    'master.headerSuffix': '— Master Dashboard',
    'master.headerSubtitle': 'Creator view — saare brands',
    'master.pendingApprovals': 'Pending Approvals',
    'master.allBrands': 'Saare Brands',
    'master.approve': 'Approve',
    'master.deny': 'Deny',
    'master.choosePlanPlaceholder': '— Plan chuno —',
    'master.addonsLabel': 'Add-ons:',
    'master.enter': 'Enter',
    'master.editAdmin': 'Edit',
    'master.noBrands': 'Abhi koi brand register nahi hua.',
    'master.deleteTitle': 'Store delete karein?',
    'master.deleteBody': 'Yeh store, iska sara data (orders, courier-data, expenses waghera), aur admin ka login account — sab PERMANENTLY delete ho jayega. Yeh action wapis nahi ho sakti.',
    'master.confirmDelete': 'Haan, Delete Karo',
    'master.editAdminTitlePrefix': 'Edit Admin —',
    'master.profileDetails': 'Profile Details',
    'master.namePlaceholder': 'Naam',
    'master.phonePlaceholder': 'Phone number (11 digits)',
    'master.emailPlaceholder': 'Email',
    'master.phoneError': 'Phone number exactly 11 digits ka hona chahiye',
    'master.nameEmailRequired': 'Naam aur email zaroori hain',
    'master.saveDetails': 'Save Details',
    'master.saving': 'Save ho raha hai...',
    'master.resetPassword': 'Reset Password',
    'master.newPasswordPlaceholder': 'Naya password (min 6 characters)',
    'master.passwordMinError': 'Naya password kam az kam 6 characters ka ho',
    'master.passwordResetSuccess': 'Password reset ho gaya',
    'master.resetPasswordButton': 'Password Reset Karo',
    'master.close': 'Close',
    'master.myBrands': 'Meri Brands',
    'master.backToMaster': '← Master Dashboard',
    'master.wapas': '← Wapas',
    'master.today': 'Today',
    'master.yesterday': 'Yesterday',
    'master.approvedStat': 'Approved',
    'master.lifetime': 'Lifetime',
    'master.denyConfirm': 'Yeh signup permanently delete ho jayegi (profile + store + sara data). Confirm?',
    'master.deleteFailPrefix': 'Delete fail hui: ',

    'dashboard.noOrders': 'Koi orders nahi mile',
    'dashboard.retryLoad': 'Retry Load',

    'sync.checkingNew': 'naye orders check ho rahe hain...',
    'sync.loadingOld': 'purane orders background mein load ho rahe hain...',

    'common.noPhone': 'phone nahi',
    'common.shopifyNotConnected': 'Shopify connected nahi',
    'master.miniHeaderTitle': 'نظام — Meri Brands',
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
    'nav.inventory': 'Inventory',
    'nav.dev-monitor': 'Dev Monitor',

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
    'common.comingSoon': 'This module is coming soon!',

    'theme.toggle': 'Switch theme',
    'lang.switch': 'Change language',

    'pending.title': 'Waiting for approval',
    'pending.body': 'Your account has not been approved yet. As soon as an admin approves it, you will be able to use Neezam.',

    'master.headerSuffix': '— Master Dashboard',
    'master.headerSubtitle': 'Creator view — all brands',
    'master.pendingApprovals': 'Pending Approvals',
    'master.allBrands': 'All Brands',
    'master.approve': 'Approve',
    'master.deny': 'Deny',
    'master.choosePlanPlaceholder': '— Choose a plan —',
    'master.addonsLabel': 'Add-ons:',
    'master.enter': 'Enter',
    'master.editAdmin': 'Edit',
    'master.noBrands': 'No brand has registered yet.',
    'master.deleteTitle': 'Delete this store?',
    'master.deleteBody': 'This store, all of its data (orders, courier data, expenses, etc.), and the admin login account will be PERMANENTLY deleted. This action cannot be undone.',
    'master.confirmDelete': 'Yes, Delete It',
    'master.editAdminTitlePrefix': 'Edit Admin —',
    'master.profileDetails': 'Profile Details',
    'master.namePlaceholder': 'Name',
    'master.phonePlaceholder': 'Phone number (11 digits)',
    'master.emailPlaceholder': 'Email',
    'master.phoneError': 'Phone number must be exactly 11 digits',
    'master.nameEmailRequired': 'Name and email are required',
    'master.saveDetails': 'Save Details',
    'master.saving': 'Saving...',
    'master.resetPassword': 'Reset Password',
    'master.newPasswordPlaceholder': 'New password (min 6 characters)',
    'master.passwordMinError': 'New password must be at least 6 characters',
    'master.passwordResetSuccess': 'Password has been reset',
    'master.resetPasswordButton': 'Reset Password',
    'master.close': 'Close',
    'master.myBrands': 'My Brands',
    'master.backToMaster': '← Master Dashboard',
    'master.wapas': '← Back',
    'master.today': 'Today',
    'master.yesterday': 'Yesterday',
    'master.approvedStat': 'Approved',
    'master.lifetime': 'Lifetime',
    'master.denyConfirm': 'This signup will be permanently deleted (profile + store + all data). Confirm?',
    'master.deleteFailPrefix': 'Delete failed: ',

    'dashboard.noOrders': 'No orders found',
    'dashboard.retryLoad': 'Retry Load',

    'sync.checkingNew': 'checking for new orders...',
    'sync.loadingOld': 'loading older orders in the background...',

    'common.noPhone': 'no phone',
    'common.shopifyNotConnected': 'Shopify not connected',
    'master.miniHeaderTitle': 'Neezam — My Brands',
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
