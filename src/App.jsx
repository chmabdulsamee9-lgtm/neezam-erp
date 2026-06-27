import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Login from './pages/Login'
import StoreConnect from './pages/StoreConnect'
import ShopifyCallback from './pages/ShopifyCallback'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import WhatsApp from './pages/WhatsApp'

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev"
const INITIAL_BATCH = 200
const BATCH_SIZE = 1000

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ordersData, setOrdersData] = useState([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [ordersStore, setOrdersStore] = useState(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [backgroundLoading, setBackgroundLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  useEffect(() => {
    if (session && !ordersLoaded && !ordersLoading) {
      autoLoadOrders()
    }
  }, [session])

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

  // Pehle latest 200 orders fauran load karta hai (instant feel),
  // phir baqi sab background mein silently load hote rehte hain
  const autoLoadOrders = async () => {
    setOrdersLoading(true)
    try {
      const result = await supabase.from("stores").select("*").limit(1).single()
      const storeData = result.data
      if (!storeData) { setOrdersLoading(false); return }
      setOrdersStore(storeData)

      const statusesPromise = fetchAllOrderStatuses()

      const { data: firstBatch, error: firstError } = await supabase
        .from("shopify_orders_cache")
        .select("raw_data")
        .eq("store_id", storeData.id)
        .order("created_at", { ascending: false })
        .range(0, INITIAL_BATCH - 1)
      if (firstError) throw firstError

      const statuses = await statusesPromise
      const statusMap = {}
      statuses.forEach(s => { statusMap[s.order_id] = s })

      const mergeOrder = (o) => ({
        ...o,
        agent_data: statusMap[String(o.id)] || {},
        agent_status: statusMap[String(o.id)]?.status || null,
        synced_at: statusMap[String(o.id)]?.synced_at || null,
        last_edited_at: statusMap[String(o.id)]?.last_edited_at || null,
      })

      const firstMerged = (firstBatch || []).map(r => mergeOrder(r.raw_data))
      setOrdersData(firstMerged)
      setOrdersLoaded(true)
      setOrdersLoading(false)

      // Baqi orders background mein load karo, page-by-page
      if (firstBatch && firstBatch.length === INITIAL_BATCH) {
        setBackgroundLoading(true)
        let from = INITIAL_BATCH
        while (true) {
          const { data: nextBatch, error: nextError } = await supabase
            .from("shopify_orders_cache")
            .select("raw_data")
            .eq("store_id", storeData.id)
            .order("created_at", { ascending: false })
            .range(from, from + BATCH_SIZE - 1)
          if (nextError) break
          if (!nextBatch || nextBatch.length === 0) break
          const nextMerged = nextBatch.map(r => mergeOrder(r.raw_data))
          setOrdersData(prev => [...prev, ...nextMerged])
          if (nextBatch.length < BATCH_SIZE) break
          from += BATCH_SIZE
        }
        setBackgroundLoading(false)
      }
    } catch (err) {
      console.log("Orders load error:", err.message)
      setOrdersLoading(false)
    }
  }

  if (window.location.pathname === '/auth/callback') {
    return <ShopifyCallback />
  }

  if (loading) return (
    <div style={{height:'100%',background:'#0f172a',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'18px'}}>
      Loading...
    </div>
  )

  if (!session) return <Login />

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
              {backgroundLoading && <span style={{fontSize:'11px',color:'#64748b',fontWeight:400,marginLeft:10}}>⏳ baqi orders load ho rahe hain...</span>}
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
            ordersLoading ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'300px',color:'#94a3b8',fontSize:14,gap:8}}>
                <div style={{fontSize:32}}>⏳</div>
                <div>Orders load ho rahe hain...</div>
                <div style={{fontSize:11,color:'#475569'}}>Cache se data aa raha hai</div>
              </div>
            ) : ordersData.length === 0 ? (
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