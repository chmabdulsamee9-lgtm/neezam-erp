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

  // Sirf ek baar trigger hota hai jab session pehli baar milta hai —
  // baad mein token-refresh se session object badle to dobara load nahi hota
  useEffect(() => {
    if (session && !hasStartedLoadRef.current) {
      hasStartedLoadRef.current = true
      autoLoadOrders()
    }
  }, [session])

  // Realtime channel sirf component unmount par close hota hai —
  // session/auth refresh isay disturb nahi karta
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
    }
  }, [])

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

  // IMPORTANT: jab hum khud koi order Shopify pe update karte hain, Shopify
  // "orders/updated" webhook fire karta hai jo wapas humare shopify_orders_cache
  // mein aata hai aur Realtime se yahan event trigger hota hai. Pehle code
  // poori order list ko PURANE/stale statusMap se rebuild kar deta tha — jisse
  // user ka fresh edit/sync status 2-4 second baad "ulta" ho jata tha.
  // Fix: sirf Shopify-side raw fields (address, line items, etc.) update karo,
  // agent_data/agent_status/synced_at jo already current state mein hain
  // unhe chhedo mat — woh sirf Orders.jsx ke apne updates se hi badalte hain.
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
              // Existing order — sirf Shopify-side fields refresh karo,
              // local agent_data/status/sync state ko bilkul chhedo mat
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
              // Bilkul naya order — fresh statusMap se merge karo
              const merged = mergeOrder(rawOrder, statusMapRef.current)
              next = [merged, ...prev]
            }
            // rawOrdersRef ko bhi sync rakho (IndexedDB / future reload ke liye)
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

  const autoLoadOrders = async () => {
    setOrdersLoading(true)
    try {
      const result = await supabase.from("stores").select("*").limit(1).single()
      const storeData = result.data
      if (!storeData) { setOrdersLoading(false); return }
      setOrdersStore(storeData)

      const statuses = await fetchAllOrderStatuses()
      const statusMap = {}
      statuses.forEach(s => { statusMap[s.order_id] = s })
      statusMapRef.current = statusMap

      const loadStartTime = new Date().toISOString()
      const cachedRaw = await getCachedOrders()

      if (cachedRaw.length > 0) {
        // Browser mein pehle se data hai — INSTANT show karo, 0 sec wait
        rawOrdersRef.current = cachedRaw
        setOrdersData(rebuildOrdersData(cachedRaw, statusMap))
        setOrdersLoaded(true)
        setOrdersLoading(false)
        setupRealtime(storeData.id)

        // Background mein: jo bhi naya/updated order pichli visit ke baad aaya, woh sync karo
        const lastSyncedAt = (await getMeta("lastSyncedAt")) || "2000-01-01T00:00:00Z"
        setSyncStatusText("⏳ naye orders check ho rahe hain...")
        try {
          let from = 0
          let deltaOrders = []
          while (true) {
            const { data: deltaBatch, error } = await supabase
              .from("shopify_orders_cache")
              .select("raw_data")
              .eq("store_id", storeData.id)
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

      // Naya browser — cache khaali hai. Pehle last 7 days fast laao, baqi background mein.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data: recentBatch, error: recentError } = await supabase
        .from("shopify_orders_cache")
        .select("raw_data")
        .eq("store_id", storeData.id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
      if (recentError) throw recentError

      const recentRaw = (recentBatch || []).map(r => r.raw_data)
      rawOrdersRef.current = recentRaw
      setOrdersData(rebuildOrdersData(recentRaw, statusMap))
      setOrdersLoaded(true)
      setOrdersLoading(false)
      setupRealtime(storeData.id)
      await saveOrdersBulk(recentRaw)

      // Baqi (purane) orders background mein load karo
      setSyncStatusText("⏳ purane orders background mein load ho rahe hain...")
      try {
        let from = 0
        while (true) {
          const { data: olderBatch, error: olderError } = await supabase
            .from("shopify_orders_cache")
            .select("raw_data")
            .eq("store_id", storeData.id)
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
  if (!ordersLoaded) return <SplashScreen />

  const menuItems = [
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

  const fullScreenModules = ['orders']

  return (
    <div style={{display:'flex',height:'100%',width:'100%',overflow:'hidden',background:'#0f172a',color:'#fff'}}>
      <div style={{width:sidebarOpen?'240px':'60px',minWidth:sidebarOpen?'240px':'60px',background:'#1e293b',padding:'1rem 0',transition:'width 0.3s, min-width 0.3s',display:'flex',flexDirection:'column',height:'100%',overflowY:'auto',overflowX:'hidden',flexShrink:0}}>
        <div style={{padding:'0 1rem',marginBottom:'1.5rem',display:'flex',alignItems:'center',justifyContent:sidebarOpen?'space-between':'center'}}>
          {sidebarOpen && <span style={{fontSize:'1.4rem',fontWeight:'700',color:'#fff'}}>نظام</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:'18px',padding:'4px',flexShrink:0}}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
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
          {activeMenu === 'orders' && (
            <Orders
              ordersData={ordersData} setOrdersData={setOrdersData}
              ordersLoaded={ordersLoaded} setOrdersLoaded={setOrdersLoaded}
              ordersStore={ordersStore} setOrdersStore={setOrdersStore}
              cfUrl={CF_URL}
            />
          )}
          {activeMenu === 'dashboard' && (
            ordersData.length === 0 ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'300px',color:'#94a3b8',fontSize:14,gap:8}}>
                <div style={{fontSize:32}}>📦</div>
                <div>Koi orders nahi mile</div>
                <button onClick={autoLoadOrders} style={{padding:'6px 16px',borderRadius:6,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:12,marginTop:8}}>
                  🔄 Retry Load
                </button>
              </div>
            ) : (
              <Dashboard ordersData={ordersData} />
            )
          )}
          {activeMenu === 'store-connect' && <StoreConnect />}
          {activeMenu === 'whatsapp' && <WhatsApp />}
          {activeMenu !== 'dashboard' && activeMenu !== 'store-connect' && activeMenu !== 'orders' && activeMenu !== 'whatsapp' && (
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