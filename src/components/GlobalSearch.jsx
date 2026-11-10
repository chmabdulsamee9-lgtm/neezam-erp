import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import Icon from './Icon'

// Admin UI overhaul, Part D1 — Ctrl+K global search. Diagnose confirmed there is no
// unified cross-entity search utility anywhere in the app, so this queries Orders
// (shopify_orders_cache) and Products (products_cache) directly, scoped to the current
// store, matching the same direct-Supabase-client convention those pages already use
// (not monitoredFetch — that's a dev-only instrumentation wrapper, not this app's normal
// data-fetch pattern). "Customers" is intentionally omitted as a category: diagnose found
// no dedicated customer table/page — customer data only exists nested inside order rows,
// which the Orders category search already covers (by order name/email/phone).
const CATEGORIES = [
  { id: 'all', labelKey: 'search.catAll' },
  { id: 'orders', labelKey: 'search.catOrders' },
  { id: 'products', labelKey: 'search.catProducts' },
  { id: 'settings', labelKey: 'search.catSettings' },
]

export default function GlobalSearch({ storeId, storeName, onNavigate, onClose, settingsSections, t }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q || !storeId) { setOrders([]); setProducts([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const [byName, byEmail, prodRows] = await Promise.all([
          category === 'all' || category === 'orders'
            ? supabase.from('shopify_orders_cache').select('id, raw_data').eq('store_id', storeId).ilike('raw_data->>name', `%${q}%`).limit(6)
            : Promise.resolve({ data: [] }),
          category === 'all' || category === 'orders'
            ? supabase.from('shopify_orders_cache').select('id, raw_data').eq('store_id', storeId).ilike('raw_data->>email', `%${q}%`).limit(6)
            : Promise.resolve({ data: [] }),
          category === 'all' || category === 'products'
            ? supabase.from('products_cache').select('id, raw_data').eq('store_id', storeId).ilike('raw_data->>title', `%${q}%`).limit(8)
            : Promise.resolve({ data: [] }),
        ])
        const mergedOrders = [...(byName.data || []), ...(byEmail.data || [])]
        const seen = new Set()
        setOrders(mergedOrders.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true))).slice(0, 8))
        setProducts(prodRows.data || [])
      } catch (err) {
        setOrders([]); setProducts([])
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, storeId, category])

  const q = query.trim().toLowerCase()
  const settingsMatches = q && (category === 'all' || category === 'settings')
    ? (settingsSections || []).filter((s) => s.label.toLowerCase().includes(q))
    : []

  const goto = (menuId) => { onNavigate(menuId); onClose() }
  const hasAnyResults = orders.length > 0 || products.length > 0 || settingsMatches.length > 0

  return (
    <div className="ne-search-overlay" onClick={onClose}>
      <div className="ne-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ne-search-inputrow">
          <Icon name="search" size={16} />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')} className="ne-search-input" />
          <button className="ne-search-close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="ne-search-chips">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`ne-search-chip${category === c.id ? ' active' : ''}`}>
              {t(c.labelKey)}
            </button>
          ))}
        </div>
        <div className="ne-search-results">
          {!q && (
            <div className="ne-search-empty">{t('search.emptyPrompt').replace('{store}', storeName || '')}</div>
          )}
          {q && loading && <div className="ne-search-empty">{t('search.loading')}</div>}
          {q && !loading && !hasAnyResults && <div className="ne-search-empty">{t('search.noResults')}</div>}

          {orders.length > 0 && (
            <div className="ne-search-group">
              <div className="ne-search-grouplabel">{t('search.catOrders')}</div>
              {orders.map((o) => (
                <div key={`o-${o.id}`} className="ne-search-result" onClick={() => goto('orders')}>
                  <Icon name="package" size={14} />
                  <span>{o.raw_data?.name || o.id}</span>
                  <span className="ne-search-result-sub">{o.raw_data?.email || o.raw_data?.phone || ''}</span>
                </div>
              ))}
            </div>
          )}

          {products.length > 0 && (
            <div className="ne-search-group">
              <div className="ne-search-grouplabel">{t('search.catProducts')}</div>
              {products.map((p) => (
                <div key={`p-${p.id}`} className="ne-search-result" onClick={() => goto('products')}>
                  <Icon name="products" size={14} />
                  <span>{p.raw_data?.title || p.id}</span>
                </div>
              ))}
            </div>
          )}

          {settingsMatches.length > 0 && (
            <div className="ne-search-group">
              <div className="ne-search-grouplabel">{t('search.catSettings')}</div>
              {settingsMatches.map((s) => (
                <div key={`s-${s.id}`} className="ne-search-result" onClick={() => goto(s.menu || 'settings')}>
                  <Icon name="settings" size={14} />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
