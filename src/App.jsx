import { useState, useEffect, useRef } from 'react'
import './theme.css'
import { supabase } from './supabase'
import { getCachedOrders, saveOrdersBulk, upsertOrder, getMeta, setMeta, clearCache } from './ordersCache'
import Login from './pages/Login'
import StoreConnect from './pages/StoreConnect'
import ShopifyCallback from './pages/ShopifyCallback'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import WhatsApp from './pages/WhatsApp'
import Team from './pages/Team'

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev"
const BATCH_SIZE = 1000

const NAV_ICONS = {
  dashboard: <svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5"/><rect x="11" y="11" width="6.5" height="6.5" rx="1.5"/></svg>,
  orders: <svg viewBox="0 0 20 20"><path d="M10 2.5 17 6.5v7L10 17.5 3 13.5v-7Z"/><path d="M3 6.5 10 10.5 17 6.5"/><path d="M10 10.5v7"/></svg>,
  courier: <svg viewBox="0 0 20 20"><rect x="2" y="6" width="9" height="7" rx="1"/><path d="M11 9h3.5L17 11.5V13h-6"/><circle cx="6" cy="15.5" r="1.6"/><circle cx="14.5" cy="15.5" r="1.6"/></svg>,
  ads: <svg viewBox="0 0 20 20"><path d="M3 17V9"/><path d="M9 17V3"/><path d="M15 17v-6"/></svg>,
  pnl: <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7"/><path d="M10 6.5v7M7.5 8.3c0-1.1 1.1-1.8 2.5-1.8s2.5.6 2.5 1.6c0 2.2-5 1-5 3.2 0 1 1.1 1.6 2.5 1.6s2.5-.7 2.5-1.8"/></svg>,
  ledger: <svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M6 8h8M6 11h8M6 14h5"/></svg>,
  returns: <svg viewBox="0 0 20 20"><path d="M7 5 3 9l4 4"/><path d="M3 9h9a4 4 0 0 1 4 4v1"/></svg>,
  cities: <svg viewBox="0 0 20 20"><path d="M10 18s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10Z"/><circle cx="10" cy="8" r="2"/></svg>,
  products: <svg viewBox="0 0 20 20"><path d="M3 3h6l8 8-6 6-8-8Z"/><circle cx="7" cy="7" r="1.3" fill="currentColor" stroke="none"/></svg>,
  budget: <svg viewBox="0 0 20 20"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 8h15M6 12h2M11 12h3"/></svg>,
  suggestions: <svg viewBox="0 0 20 20"><path d="M10 2.5a5.5 5.5 0 0 0-3 10.1V14h6v-1.4A5.5 5.5 0 0 0 10 2.5Z"/><path d="M8 17h4"/></svg>,
  whatsapp: <svg viewBox="0 0 20 20"><path d="M5 17l1-3.2A6.5 6.5 0 1 1 9.5 16L5 17Z"/><path d="M7.2 8c0 2.5 2.3 4.8 4.8 4.8"/></svg>,
  'store-connect': <svg viewBox="0 0 20 20"><path d="M8 12 12 8"/><rect x="2" y="9" width="6" height="6" rx="3" transform="rotate(-45 5 12)"/><rect x="12" y="5" width="6" height="6" rx="3" transform="rotate(-45 15 8)"/></svg>,
  team: <svg viewBox="0 0 20 20"><circle cx="7" cy="7" r="2.6"/><circle cx="14" cy="8" r="2"/><path d="M2.5 17c.5-3 2.2-4.5 4.5-4.5s4 1.5 4.5 4.5"/><path d="M12 17c.4-2.3 1.6-3.7 3.5-3.7s2.7 1.1 3 3.2"/></svg>,
}

function SplashScreen() {
  return (
    <div className="ne-app-shell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <div style={{ fontSize: '2.8rem', fontWeight: 700, color: '#fff' }}>نظام</div>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid #232A52', borderTopColor: '#5C7CFA',
        animation: 'neezam-spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 13, color: '#8C93C4' }}>Tayar ho raha hai...</div>
      <style>{`@keyframes neezam-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function PendingApprovalScreen({ onSignOut }) {
  return (
    <div className="ne-app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--ne-surface)', border: '1px solid var(--ne-border)', borderRadius: 18, padding: '2.5rem', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: 18 }}>Approval ka wait hai</h2>
        <p style={{ color: 'var(--ne-muted)', fontSize: 13, lineHeight: 1.6 }}>
          Aapka account abhi approve nahi hua. Jaise hi admin approve karega, aap Neezam use kar sakenge.
        </p>
        <button onClick={onSignOut}
          style={{ marginTop: 16, padding: '9px 20px', borderRadius: 10, border: '1px solid var(--ne-border)', background: 'transparent', color: 'var(--ne-muted)', fontSize: 13, cursor: 'pointer' }}>
          🚪 Logout
        </button>
      </div>
    </div>
  )
}

function MasterDashboard({ allStores, pendingProfiles, onApprove, onEnterStore, onSignOut, userEmail }) {
  const statCard = (value, label, color) => (
    <div style={{ flex: 1, background: 'var(--ne-surface)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--ne-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div className="ne-app-shell" style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--ne-border)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>نظام — Master Dashboard</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ne-muted)' }}>Creator view — saare brands</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--ne-muted)' }}>{userEmail}</span>
          <button onClick={onSignOut}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--ne-border)', background: 'transparent', color: '#F26D6D', fontSize: 12, cursor: 'pointer' }}>
            🚪 Logout
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {pendingProfiles.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: 14, color: '#F2A83E', marginBottom: 10 }}>⏳ Pending Approvals ({pendingProfiles.length})</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {pendingProfiles.map(p => (
                <div key={p.id} style={{ background: 'var(--ne-surface)', border: '1px solid var(--ne-border)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.full_name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ne-muted)' }}>{p.email} · {p.phone || 'no phone'} · {p.role}</div>
                  </div>
                  <button onClick={() => onApprove(p.id)}
                    style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--ne-grad)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✓ Approve
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 14, color: 'var(--ne-muted)', marginBottom: 10 }}>🏪 Saare Brands ({allStores.length})</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {allStores.map(s => (
            <div key={s.id} style={{ background: 'var(--ne-surface)', border: '1px solid var(--ne-border)', borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.store_name}</div>
                <div style={{ fontSize: 12, color: 'var(--ne-muted)' }}>{s.shopify_url || 'Shopify connected nahi'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {statCard(s.today_count ?? '—', 'Today', '#34D88E')}
                {statCard(s.yesterday_count ?? '—', 'Yesterday', '#5C7CFA')}
                {statCard(s.approved_count ?? '—', 'Approved', '#F2A83E')}
                {statCard(s.lifetime_count ?? '—', 'Lifetime', '#A855F7')}
              </div>
              <button onClick={() => onEnterStore(s)}
                style={{ padding: '9px', borderRadius: 10, border: 'none', background: 'var(--ne-grad)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                → Enter
              </button>
            </div>
          ))}
          {allStores.length === 0 && (
            <div style={{ color: 'var(--ne-muted)', fontSize: 13 }}>Abhi koi brand register nahi hua.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem('neezam_theme')) || 'dark')
  const [forceMobile, setForceMobile] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('neezam_theme', theme)
  }, [theme])
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [ordersData, setOrdersData] = useState([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [ordersStore, setOrdersStore] = useState(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [syncStatusText, setSyncStatusText] = useState("")

  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [userStoresList, setUserStoresList] = useState([])
  const [allStores, setAllStores] = useState([])
  const [pendingProfiles, setPendingProfiles] = useState([])
  const [selectedStoreId, setSelectedStoreId] = useState(null)
  const [isMasterView, setIsMasterView] = useState(false)

  const statusMapRef = useRef({})
  const realtimeChannelRef = useRef(null)
  const rawOrdersRef = useRef([])
  const hasStartedLoadRef = useRef(false)
  const lastUserIdRef = useRef(null)

  const resetUserState = () => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }
    setProfile(null)
    setProfileLoaded(false)
    setOrdersData([])
    setOrdersLoaded(false)
    setOrdersStore(null)
    setSelectedStoreId(null)
    setIsMasterView(false)
    setUserStoresList([])
    setAllStores([])
    setPendingProfiles([])
    rawOrdersRef.current = []
    statusMapRef.current = {}
    hasStartedLoadRef.current = false
    clearCache()
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      lastUserIdRef.current = session?.user?.id || null
      setLoading(false)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const newUserId = newSession?.user?.id || null
      if (newUserId !== lastUserIdRef.current) {
        resetUserState()
        lastUserIdRef.current = newUserId
      }
      setSession(newSession)
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session && !profileLoaded) {
      loadProfileAndStores()
    }
  }, [session])

  useEffect(() => {
    if (session && profile?.approved && selectedStoreId && !hasStartedLoadRef.current) {
      hasStartedLoadRef.current = true
      autoLoadOrders(selectedStoreId)
    }
  }, [session, profile, selectedStoreId])

  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
    }
  }, [])

  const loadProfileAndStores = async () => {
    const userId = session.user.id
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(profileData || null)

    if (profileData?.role === 'creator') {
      const { data: stores } = await supabase.from('stores').select('*').order('created_at', { ascending: false })
      const storesWithStats = await Promise.all((stores || []).map(async (s) => {
        const { data: statsRows } = await supabase.rpc('get_store_stats', { p_store_id: s.id })
        const stats = statsRows && statsRows[0] ? statsRows[0] : {}
        return {
          ...s,
          lifetime_count: stats.lifetime_count ?? 0,
          today_count: stats.today_count ?? 0,
          yesterday_count: stats.yesterday_count ?? 0,
          approved_count: stats.approved_count ?? 0,
        }
      }))
      setAllStores(storesWithStats)
      const { data: pending } = await supabase.from('profiles').select('*').eq('approved', false).neq('role', 'creator')
      setPendingProfiles(pending || [])
      setIsMasterView(true)
    } else if (profileData?.approved) {
      const { data: us } = await supabase
        .from('user_stores')
        .select('store_id, permissions, stores(store_name, shopify_url, id)')
        .eq('user_id', userId)
      setUserStoresList(us || [])
      if (us && us.length > 0) {
        setSelectedStoreId(us[0].store_id)
      }
    }
    setProfileLoaded(true)
  }

  const handleApprove = async (profileId) => {
    await supabase.from('profiles').update({ approved: true }).eq('id', profileId)
    setPendingProfiles(prev => prev.filter(p => p.id !== profileId))
  }

  const handleEnterStore = (store) => {
    setIsMasterView(false)
    setSelectedStoreId(store.id)
  }

  const fetchAllOrderStatuses = async () => {
    let allRows = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("*")
        .range(from, from + BATCH_SIZE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      allRows = allRows.concat(data)
      if (data.length < BATCH_SIZE) break
      from += BATCH_SIZE
    }
    return allRows
  }

  const mergeOrder = (o, statusMap) => ({
    ...o,
    agent_data: statusMap[String(o.id)] || {},
    agent_status: statusMap[String(o.id)]?.status || null,
    synced_at: statusMap[String(o.id)]?.synced_at || null,
    last_edited_at: statusMap[String(o.id)]?.last_edited_at || null,
  })

  const rebuildOrdersData = (rawOrders, statusMap) => {
    const sorted = [...rawOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return sorted.map(o => mergeOrder(o, statusMap))
  }

  const setupRealtime = (storeId) => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }
    const channel = supabase
      .channel(`orders-changes-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopify_orders_cache", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const row = payload.new
          if (!row || !row.raw_data) return
          const rawOrder = row.raw_data
          upsertOrder(rawOrder)

          setOrdersData(prev => {
            const idx = prev.findIndex(o => o.id === rawOrder.id)
            let next
            if (idx >= 0) {
              const existing = prev[idx]
              const merged = {
                ...rawOrder,
                agent_data: existing.agent_data,
                agent_status: existing.agent_status,
                synced_at: existing.synced_at,
                last_edited_at: existing.last_edited_at,
              }
              next = [...prev]
              next[idx] = merged
            } else {
              const merged = mergeOrder(rawOrder, statusMapRef.current)
              next = [merged, ...prev]
            }
            const rawIdx = rawOrdersRef.current.findIndex(o => o.id === rawOrder.id)
            if (rawIdx >= 0) {
              const rawNext = [...rawOrdersRef.current]
              rawNext[rawIdx] = rawOrder
              rawOrdersRef.current = rawNext
            } else {
              rawOrdersRef.current = [rawOrder, ...rawOrdersRef.current]
            }
            return next
          })
        }
      )
      .subscribe((status) => {
        if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setTimeout(() => {
            setupRealtime(storeId)
          }, 3000)
        }
      })
    realtimeChannelRef.current = channel
  }

  const autoLoadOrders = async (storeId) => {
    setOrdersLoading(true)
    const expectedUserId = session?.user?.id
    const isStale = () => session?.user?.id !== expectedUserId

    try {
      const { data: storeData } = await supabase.from('stores').select('*').eq('id', storeId).single()
      if (isStale()) return
      if (!storeData) { setOrdersLoading(false); return }
      setOrdersStore(storeData)

      const statuses = await fetchAllOrderStatuses()
      if (isStale()) return
      const statusMap = {}
      statuses.forEach(s => { statusMap[s.order_id] = s })
      statusMapRef.current = statusMap

      const loadStartTime = new Date().toISOString()
      const cachedRaw = await getCachedOrders()
      if (isStale()) return

      if (cachedRaw.length > 0) {
        rawOrdersRef.current = cachedRaw
        setOrdersData(rebuildOrdersData(cachedRaw, statusMap))
        setOrdersLoaded(true)
        setOrdersLoading(false)
        setupRealtime(storeId)

        const lastSyncedAt = (await getMeta("lastSyncedAt")) || "2000-01-01T00:00:00Z"
        setSyncStatusText("⏳ naye orders check ho rahe hain...")
        try {
          let from = 0
          let deltaOrders = []
          while (true) {
            const { data: deltaBatch, error } = await supabase
              .from("shopify_orders_cache")
              .select("raw_data")
              .eq("store_id", storeId)
              .gt("synced_at", lastSyncedAt)
              .order("synced_at", { ascending: true })
              .range(from, from + BATCH_SIZE - 1)
            if (error) break
            if (isStale()) return
            if (!deltaBatch || deltaBatch.length === 0) break
            deltaOrders = deltaOrders.concat(deltaBatch.map(r => r.raw_data))
            if (deltaBatch.length < BATCH_SIZE) break
            from += BATCH_SIZE
          }
          if (isStale()) return
          if (deltaOrders.length > 0) {
            await saveOrdersBulk(deltaOrders)
            if (isStale()) return
            const merged = [...rawOrdersRef.current]
            deltaOrders.forEach(o => {
              const idx = merged.findIndex(m => m.id === o.id)
              if (idx >= 0) merged[idx] = o
              else merged.push(o)
            })
            rawOrdersRef.current = merged
            setOrdersData(rebuildOrdersData(merged, statusMap))
          }
          await setMeta("lastSyncedAt", loadStartTime)
        } catch (err) {
          console.log("Delta sync error:", err.message)
        }
        if (!isStale()) setSyncStatusText("")
        return
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data: recentBatch, error: recentError } = await supabase
        .from("shopify_orders_cache")
        .select("raw_data")
        .eq("store_id", storeId)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
      if (recentError) throw recentError
      if (isStale()) return

      const recentRaw = (recentBatch || []).map(r => r.raw_data)
      rawOrdersRef.current = recentRaw
      setOrdersData(rebuildOrdersData(recentRaw, statusMap))
      setOrdersLoaded(true)
      setOrdersLoading(false)
      setupRealtime(storeId)
      await saveOrdersBulk(recentRaw)
      if (isStale()) return

      setSyncStatusText("⏳ purane orders background mein load ho rahe hain...")
      try {
        let from = 0
        while (true) {
          const { data: olderBatch, error: olderError } = await supabase
            .from("shopify_orders_cache")
            .select("raw_data")
            .eq("store_id", storeId)
            .lt("created_at", sevenDaysAgo)
            .order("created_at", { ascending: false })
            .range(from, from + BATCH_SIZE - 1)
          if (olderError) break
          if (isStale()) return
          if (!olderBatch || olderBatch.length === 0) break
          const olderRaw = olderBatch.map(r => r.raw_data)
          await saveOrdersBulk(olderRaw)
          if (isStale()) return
          const merged = [...rawOrdersRef.current, ...olderRaw]
          rawOrdersRef.current = merged
          setOrdersData(rebuildOrdersData(merged, statusMap))
          if (olderBatch.length < BATCH_SIZE) break
          from += BATCH_SIZE
        }
        await setMeta("lastSyncedAt", loadStartTime)
      } catch (err) {
        console.log("Background load error:", err.message)
      }
      if (!isStale()) setSyncStatusText("")
    } catch (err) {
      console.log("Orders load error:", err.message)
      if (!isStale()) {
        setOrdersLoading(false)
        setOrdersLoaded(true)
      }
    }
  }

  if (window.location.pathname === '/auth/callback') {
    return <ShopifyCallback />
  }

  if (loading) return <SplashScreen />
  if (!session) return <Login />
  if (!profileLoaded) return <SplashScreen />
  if (!profile) return <PendingApprovalScreen onSignOut={() => supabase.auth.signOut()} />
  if (profile.role !== 'creator' && !profile.approved) return <PendingApprovalScreen onSignOut={() => supabase.auth.signOut()} />

  if (profile.role === 'creator' && isMasterView) {
    return (
      <MasterDashboard
        allStores={allStores}
        pendingProfiles={pendingProfiles}
        onApprove={handleApprove}
        onEnterStore={handleEnterStore}
        onSignOut={() => supabase.auth.signOut()}
        userEmail={session.user.email}
      />
    )
  }

  if (!selectedStoreId) return <SplashScreen />
  if (!ordersLoaded) return <SplashScreen />

  const currentUserStoreEntry = userStoresList.find(us => us.store_id === selectedStoreId)
  const isStaff = profile.role === 'staff'
  const staffPermissions = currentUserStoreEntry?.permissions || []
  const hasAccess = (moduleId) => !isStaff || staffPermissions.includes(moduleId)

  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard', group: 'Overview' },
    { id: 'orders', label: 'Orders', group: 'Overview' },
    { id: 'courier', label: 'Courier Tracking', group: 'Operations' },
    { id: 'returns', label: 'Returns', group: 'Operations' },
    { id: 'products', label: 'Products', group: 'Operations' },
    { id: 'ads', label: 'Ads Analytics', group: 'Insights' },
    { id: 'pnl', label: 'Profit & Loss', group: 'Insights' },
    { id: 'ledger', label: 'Supplier Ledger', group: 'Insights' },
    { id: 'cities', label: 'City Performance', group: 'Insights' },
    { id: 'budget', label: 'Budget Calculator', group: 'Insights' },
    { id: 'suggestions', label: 'Suggestions', group: 'Insights' },
    { id: 'whatsapp', label: 'WhatsApp', group: 'Channels' },
    { id: 'store-connect', label: 'Store Connect', group: 'Channels' },
  ]

  const menuItemsWithTeam = (profile.role === 'admin' || profile.role === 'creator')
    ? [...allMenuItems, { id: 'team', label: 'Team', group: 'Channels' }]
    : allMenuItems

  const menuItems = menuItemsWithTeam.filter(m => hasAccess(m.id) || m.id === 'team')
  const fullScreenModules = ['orders']
  const currentStoreInfo = userStoresList.find(us => us.store_id === selectedStoreId)?.stores

  // Group nav items in original order, preserving group sequence
  const groupOrder = ['Overview', 'Operations', 'Insights', 'Channels']
  const groupedMenu = groupOrder.map(g => ({ group: g, items: menuItems.filter(m => m.group === g) })).filter(g => g.items.length > 0)

  const closeDrawer = () => setMobileDrawerOpen(false)

  const renderNavItem = (item) => (
    <div key={item.id}
      onClick={() => { setActiveMenu(item.id); closeDrawer() }}
      title={!sidebarOpen ? item.label : ''}
      className={`ne-navitem${activeMenu === item.id ? ' active' : ''}`}>
      <span className="ne-ic">{NAV_ICONS[item.id]}</span>
      {(sidebarOpen || mobileDrawerOpen) && <span>{item.label}</span>}
    </div>
  )

  return (
    <div className="ne-app-shell">
      <div className="ne-app">

        {mobileDrawerOpen && <div className="ne-drawer-backdrop open" onClick={closeDrawer} />}

        <div className={`ne-sidebar${sidebarOpen ? '' : ' collapsed'}${mobileDrawerOpen ? ' open' : ''}`}>
          <div className="ne-brand-row">
            <span className="ne-brand">نظام</span>
            <span className="ne-live-dot" title="Realtime connected" />
            {(sidebarOpen || mobileDrawerOpen) && (
              <button className="ne-collapse-btn" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ marginLeft: 'auto' }}>◀</button>
            )}
            {!sidebarOpen && !mobileDrawerOpen && (
              <button className="ne-collapse-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>▶</button>
            )}
          </div>

          {currentStoreInfo && (sidebarOpen || mobileDrawerOpen) && (
            <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, color: 'var(--ne-muted)', marginBottom: 10 }}>
              🏪 {currentStoreInfo.store_name}
            </div>
          )}

          {profile.role === 'creator' && (sidebarOpen || mobileDrawerOpen) && (
            <button onClick={() => { setIsMasterView(true); setSelectedStoreId(null); setOrdersLoaded(false); hasStartedLoadRef.current = false; closeDrawer() }}
              style={{ width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--ne-border)', background: 'transparent', color: 'var(--ne-muted)', fontSize: 11.5, cursor: 'pointer', marginBottom: 8 }}>
              ← Master Dashboard
            </button>
          )}

          {groupedMenu.map(g => (
            <div key={g.group}>
              {(sidebarOpen || mobileDrawerOpen) && <div className="ne-navlabel">{g.group}</div>}
              {g.items.map(renderNavItem)}
            </div>
          ))}

          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div onClick={() => supabase.auth.signOut()} className="ne-navitem" style={{ color: '#F26D6D' }}>
              <span className="ne-ic" style={{ background: 'rgba(242,109,109,.1)' }}>
                <svg viewBox="0 0 20 20" stroke="#F26D6D"><path d="M7 17H4.5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 4.5 3H7"/><path d="M13 14l4-4-4-4"/><path d="M17 10H7"/></svg>
              </span>
              {(sidebarOpen || mobileDrawerOpen) && <span>Logout</span>}
            </div>
          </div>
        </div>

        <div className="ne-main">
          {!fullScreenModules.includes(activeMenu) && (
            <div className="ne-topbar">
              <button className="ne-hamburger" onClick={() => setMobileDrawerOpen(true)}>☰</button>
              <h1 className="ne-page-title">
                {menuItems.find(m => m.id === activeMenu)?.label}
                {syncStatusText && <span className="ne-sync-status">{syncStatusText}</span>}
              </h1>
              <div className="ne-userchip">
                {profile.role === 'creator' && (
                  <button className={`ne-mobile-preview-btn${forceMobile ? ' active' : ''}`} onClick={() => setForceMobile(!forceMobile)} title="Mobile view preview">
                    📱 {forceMobile ? 'Mobile ON' : 'Mobile Preview'}
                  </button>
                )}
                <button className="ne-theme-toggle" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Theme switch karo">
                  {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <div className="ne-avatar">{session.user.email[0].toUpperCase()}</div>
                <span>{session.user.email}</span>
              </div>
            </div>
          )}

          {fullScreenModules.includes(activeMenu) && (
            <button className="ne-hamburger" onClick={() => setMobileDrawerOpen(true)} style={{ position: 'absolute', top: 10, left: 10, zIndex: 50 }}>☰</button>
          )}

          <div className="ne-content">
            {activeMenu === 'orders' && hasAccess('orders') && (
              <Orders
                ordersData={ordersData} setOrdersData={setOrdersData}
                ordersLoaded={ordersLoaded} setOrdersLoaded={setOrdersLoaded}
                ordersStore={ordersStore} setOrdersStore={setOrdersStore}
                cfUrl={CF_URL}
              />
            )}
            {activeMenu === 'dashboard' && hasAccess('dashboard') && (
              ordersData.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--ne-muted)', fontSize: 14, gap: 8 }}>
                  <div style={{ fontSize: 32 }}>📦</div>
                  <div>Koi orders nahi mile</div>
                  <button onClick={() => autoLoadOrders(selectedStoreId)} style={{ padding: '6px 16px', borderRadius: 8, background: 'var(--ne-grad)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, marginTop: 8 }}>
                    🔄 Retry Load
                  </button>
                </div>
              ) : (
                <Dashboard ordersData={ordersData} />
              )
            )}
            {activeMenu === 'store-connect' && hasAccess('store-connect') && <StoreConnect storeId={selectedStoreId} />}
            {activeMenu === 'whatsapp' && hasAccess('whatsapp') && <WhatsApp />}
            {activeMenu === 'team' && (profile.role === 'admin' || profile.role === 'creator') && (
              <Team storeId={selectedStoreId} storeName={currentStoreInfo?.store_name || ordersStore?.store_name} cfUrl={CF_URL} />
            )}
            {!['dashboard', 'store-connect', 'orders', 'whatsapp', 'team'].includes(activeMenu) && (
              <div style={{ padding: '1.25rem' }}>
                <div style={{ background: 'var(--ne-surface)', border: '1px solid var(--ne-border)', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
                  <h2 style={{ color: '#fff', marginBottom: 8 }}>{menuItems.find(m => m.id === activeMenu)?.label}</h2>
                  <p style={{ color: 'var(--ne-muted)', fontSize: 14 }}>Ye module jald aa raha hai!</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export default App