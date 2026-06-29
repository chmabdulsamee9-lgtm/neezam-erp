import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getCachedOrders, saveOrdersBulk, upsertOrder, getMeta, setMeta } from './ordersCache'
import Login from './pages/Login'
import StoreConnect from './pages/StoreConnect'
import ShopifyCallback from './pages/ShopifyCallback'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import WhatsApp from './pages/WhatsApp'

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev"
const BATCH_SIZE = 1000

function SplashScreen() {
  return (
    <div style={{
      height: '100%', width: '100%', background: '#0f172a',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 18,
    }}>
      <div style={{ fontSize: '2.8rem', fontWeight: 700, color: '#fff' }}>نظام</div>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid #1e293b', borderTopColor: '#3b82f6',
        animation: 'neezam-spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 13, color: '#64748b' }}>Tayar ho raha hai...</div>
      <style>{`
        @keyframes neezam-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function PendingApprovalScreen({ onSignOut }) {
  return (
    <div style={{ height: '100%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1e293b', borderRadius: 16, padding: '2.5rem', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: 18 }}>Approval ka wait hai</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
          Aapka account abhi approve nahi hua. Jaise hi admin approve karega, aap Neezam use kar sakenge.
        </p>
        <button onClick={onSignOut}
          style={{ marginTop: 16, padding: '9px 20px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
          🚪 Logout
        </button>
      </div>
    </div>
  )
}

function MasterDashboard({ allStores, pendingProfiles, onApprove, onEnterStore, onSignOut, userEmail }) {
  const statCard = (value, label, color) => (
    <div style={{ flex: 1, background: '#0f172a', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#0f172a', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #1e293b' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>نظام — Master Dashboard</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Creator view — saare brands</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{userEmail}</span>
          <button onClick={onSignOut}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}>
            🚪 Logout
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {pendingProfiles.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: 14, color: '#eab308', marginBottom: 10 }}>⏳ Pending Approvals ({pendingProfiles.length})</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {pendingProfiles.map(p => (
                <div key={p.id} style={{ background: '#1e293b', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.full_name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{p.email} · {p.phone || 'no phone'} · {p.role}</div>
                  </div>
                  <button onClick={() => onApprove(p.id)}
                    style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✓ Approve
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>🏪 Saare Brands ({allStores.length})</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {allStores.map(s => (
            <div key={s.id} style={{ background: '#1e293b', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.store_name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{s.shopify_url || 'Shopify connected nahi'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {statCard(s.today_count ?? '—', 'Today', '#16a34a')}
                {statCard(s.yesterday_count ?? '—', 'Yesterday', '#60a5fa')}
                {statCard(s.approved_count ?? '—', 'Approved', '#eab308')}
                {statCard(s.lifetime_count ?? '—', 'Lifetime', '#3b82f6')}
              </div>
              <button onClick={() => onEnterStore(s)}
                style={{ padding: '8px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                → Enter
              </button>
            </div>
          ))}
          {allStores.length === 0 && (
            <div style={{ color: '#64748b', fontSize: 13 }}>Abhi koi brand register nahi hua.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
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
    try {
      const { data: storeData } = await supabase.from('stores').select('*').eq('id', storeId).single()
      if (!storeData) { setOrdersLoading(false); return }
      setOrdersStore(storeData)

      const statuses = await fetchAllOrderStatuses()
      const statusMap = {}
      statuses.forEach(s => { statusMap[s.order_id] = s })
      statusMapRef.current = statusMap

      const loadStartTime = new Date().toISOString()
      const cachedRaw = await getCachedOrders()

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
            if (!deltaBatch || deltaBatch.length === 0) break
            deltaOrders = deltaOrders.concat(deltaBatch.map(r => r.raw_data))
            if (deltaBatch.length < BATCH_SIZE) break
            from += BATCH_SIZE
          }
          if (deltaOrders.length > 0) {
            await saveOrdersBulk(deltaOrders)
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
        setSyncStatusText("")
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

      const recentRaw = (recentBatch || []).map(r => r.raw_data)
      rawOrdersRef.current = recentRaw
      setOrdersData(rebuildOrdersData(recentRaw, statusMap))
      setOrdersLoaded(true)
      setOrdersLoading(false)
      setupRealtime(storeId)
      await saveOrdersBulk(recentRaw)

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
          if (!olderBatch || olderBatch.length === 0) break
          const olderRaw = olderBatch.map(r => r.raw_data)
          await saveOrdersBulk(olderRaw)
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
      setSyncStatusText("")
    } catch (err) {
      console.log("Orders load error:", err.message)
      setOrdersLoading(false)
      setOrdersLoaded(true)
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
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'orders', label: 'Orders', icon: '📦' },
    { id: 'courier', label: 'Courier Tracking', icon: '🚚' },
    { id: 'ads', label: 'Ads Analytics', icon: '📈' },
    { id: 'pnl', label: 'Profit & Loss', icon: '💰' },
    { id: 'ledger', label: 'Supplier Ledger', icon: '🏪' },
    { id: 'returns', label: 'Returns', icon: '↩️' },
    { id: 'cities', label: 'City Performance', icon: '🗺️' },
    { id: 'products', label: 'Products', icon: '🛍️' },
    { id: 'budget', label: 'Budget Calculator', icon: '🧮' },
    { id: 'suggestions', label: 'Suggestions', icon: '💡' },
    { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { id: 'store-connect', label: 'Store Connect', icon: '🔗' },
  ]

  const menuItems = allMenuItems.filter(m => hasAccess(m.id))
  const fullScreenModules = ['orders']
  const currentStoreInfo = userStoresList.find(us => us.store_id === selectedStoreId)?.stores

  return (
    <div style={{display:'flex',height:'100%',width:'100%',overflow:'hidden',background:'#0f172a',color:'#fff'}}>
      <div style={{width:sidebarOpen?'240px':'60px',minWidth:sidebarOpen?'240px':'60px',background:'#1e293b',padding:'1rem 0',transition:'width 0.3s, min-width 0.3s',display:'flex',flexDirection:'column',height:'100%',overflowY:'auto',overflowX:'hidden',flexShrink:0}}>
        <div style={{padding:'0 1rem',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:sidebarOpen?'space-between':'center'}}>
          {sidebarOpen && <span style={{fontSize:'1.4rem',fontWeight:'700',color:'#fff'}}>نظام</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:'18px',padding:'4px',flexShrink:0}}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {sidebarOpen && currentStoreInfo && (
          <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
            <div style={{ background: '#0f172a', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#94a3b8' }}>
              🏪 {currentStoreInfo.store_name}
            </div>
          </div>
        )}

        {profile.role === 'creator' && sidebarOpen && (
          <div style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
            <button onClick={() => { setIsMasterView(true); setSelectedStoreId(null); setOrdersLoaded(false); hasStartedLoadRef.current = false }}
              style={{ width: '100%', padding: '7px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
              ← Master Dashboard
            </button>
          </div>
        )}

        {menuItems.map(item => (
          <div key={item.id} onClick={() => setActiveMenu(item.id)} title={!sidebarOpen?item.label:''}
            style={{display:'flex',alignItems:'center',gap:'10px',padding:sidebarOpen?'9px 1rem':'9px 0',justifyContent:sidebarOpen?'flex-start':'center',cursor:'pointer',background:activeMenu===item.id?'#3b82f6':'transparent',borderRadius:'8px',margin:'2px 8px',transition:'background 0.2s'}}>
            <span style={{fontSize:'17px',flexShrink:0}}>{item.icon}</span>
            {sidebarOpen && <span style={{fontSize:'13px',color:activeMenu===item.id?'#fff':'#94a3b8',whiteSpace:'nowrap'}}>{item.label}</span>}
          </div>
        ))}
        <div style={{marginTop:'auto',padding:'1rem'}}>
          <div onClick={() => supabase.auth.signOut()} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px',justifyContent:sidebarOpen?'flex-start':'center',cursor:'pointer',borderRadius:'8px',background:'#dc262620'}}>
            <span>🚪</span>
            {sidebarOpen && <span style={{fontSize:'13px',color:'#dc2626'}}>Logout</span>}
          </div>
        </div>
      </div>

      <div style={{flex:1,display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',minWidth:0}}>
        {!fullScreenModules.includes(activeMenu) && (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.75rem 1.25rem',background:'#1e293b',borderBottom:'1px solid #334155',flexShrink:0}}>
            <h1 style={{fontSize:'16px',fontWeight:'600',color:'#fff',margin:0}}>
              {menuItems.find(m=>m.id===activeMenu)?.icon} {menuItems.find(m=>m.id===activeMenu)?.label}
              {syncStatusText && <span style={{fontSize:'11px',color:'#64748b',fontWeight:400,marginLeft:10}}>{syncStatusText}</span>}
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <span style={{fontSize:'12px',color:'#94a3b8'}}>{session.user.email}</span>
              <div style={{width:'30px',height:'30px',borderRadius:'50%',background:'#3b82f6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:'600'}}>
                {session.user.email[0].toUpperCase()}
              </div>
            </div>
          </div>
        )}

        <div style={{flex:1,overflow:'auto',minWidth:0,width:'100%'}}>
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
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'300px',color:'#94a3b8',fontSize:14,gap:8}}>
                <div style={{fontSize:32}}>📦</div>
                <div>Koi orders nahi mile</div>
                <button onClick={() => autoLoadOrders(selectedStoreId)} style={{padding:'6px 16px',borderRadius:6,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:12,marginTop:8}}>
                  🔄 Retry Load
                </button>
              </div>
            ) : (
              <Dashboard ordersData={ordersData} />
            )
          )}
          {activeMenu === 'store-connect' && hasAccess('store-connect') && <StoreConnect />}
          {activeMenu === 'whatsapp' && hasAccess('whatsapp') && <WhatsApp />}
          {!['dashboard','store-connect','orders','whatsapp'].includes(activeMenu) && (
            <div style={{padding:'1.25rem'}}>
              <div style={{background:'#1e293b',borderRadius:'10px',padding:'2rem',textAlign:'center'}}>
                <div style={{fontSize:'48px',marginBottom:'1rem'}}>{menuItems.find(m=>m.id===activeMenu)?.icon}</div>
                <h2 style={{color:'#fff',marginBottom:'8px'}}>{menuItems.find(m=>m.id===activeMenu)?.label}</h2>
                <p style={{color:'#94a3b8',fontSize:'14px'}}>Ye module jald aa raha hai!</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App