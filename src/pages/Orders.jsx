import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const STATUSES = [
  { label: "Approved", color: "#16a34a", bg: "#14532d" },
  { label: "Under Verification", color: "#eab308", bg: "#713f12" },
  { label: "Cancelled", color: "#ef4444", bg: "#7f1d1d" },
  { label: "Not Answering", color: "#f97316", bg: "#7c2d12" },
  { label: "Powered Off", color: "#ec4899", bg: "#831843" },
  { label: "Hold", color: "#94a3b8", bg: "#1e293b" },
  { label: "Busy", color: "#60a5fa", bg: "#1e3a5f" },
  { label: "FAKE Order", color: "#ef4444", bg: "#450a0a" },
  { label: "No WhatsApp", color: "#94a3b8", bg: "#27272a" },
  { label: "Callback Scheduled", color: "#a78bfa", bg: "#2e1065" },
  { label: "Wrong Number", color: "#f87171", bg: "#3b0764" },
];

const SOURCE_COLORS = { Meta: "#3b82f6", TikTok: "#ec4899", Snapchat: "#eab308", Google: "#10b981", Direct: "#64748b" };
const PER_PAGE_OPTIONS = [20, 50, 100];

const truncate = (str, max = 25) => {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
};

export default function Orders({ ordersData, setOrdersData, ordersLoaded, setOrdersLoaded, ordersStore, setOrdersStore, cfUrl }) {
  const orders = ordersData;
  const setOrders = setOrdersData;
  const [loading, setLoading] = useState(!ordersLoaded);
  const [store, setStore] = useState(ordersStore);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState([]);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [cityFilter, setCityFilter] = useState("All");
  const [skuFilter, setSkuFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [statusDropdown, setStatusDropdown] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, showAbove: false });
  const [statusMultiOpen, setStatusMultiOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [syncingId, setSyncingId] = useState(null);
  const tableRef = useRef(null);

  useEffect(() => {
    if (!ordersLoaded) loadStore();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest("[data-status-dropdown]") && !e.target.closest("[data-order-btn]")) {
        setStatusDropdown(null);
      }
      if (!e.target.closest("[data-status-multi]")) {
        setStatusMultiOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const loadStore = async () => {
    const { data } = await supabase.from("stores").select("*").limit(1).single();
    if (data) {
      setStore(data);
      setOrdersStore(data);
      fetchOrders(data);
    } else {
      setError("Pehle Store Connect karo!");
      setLoading(false);
    }
  };

  const fetchOrders = async (storeData) => {
    setLoading(true);
    try {
      const res = await fetch(`${cfUrl}/shopify-orders?shop=${storeData.shopify_url}&token=${storeData.api_token}`);
      const data = await res.json();
      if (data.orders) {
        const { data: statuses } = await supabase.from("order_statuses").select("*");
        const statusMap = {};
        (statuses || []).forEach(s => { statusMap[s.order_id] = s; });
        const merged = data.orders.map(o => ({
          ...o,
          agent_data: statusMap[String(o.id)] || {},
          agent_status: statusMap[String(o.id)]?.status || null,
        }));
        setOrders(merged);
        setOrdersLoaded(true);
      } else {
        setError("Orders fetch nahi hue!");
      }
    } catch (err) {
      setError("Error: " + err.message);
    }
    setLoading(false);
  };

  const handleRefresh = () => {
    const storeData = store || ordersStore;
    if (storeData) fetchOrders(storeData);
  };

  const getSource = (order) => {
    const ref = order.referring_site || "";
    if (ref.includes("facebook") || ref.includes("meta") || ref.includes("fb")) return "Meta";
    if (ref.includes("tiktok")) return "TikTok";
    if (ref.includes("snapchat")) return "Snapchat";
    if (ref.includes("google")) return "Google";
    return "Direct";
  };

  const getSKUs = (order) => {
    return order.line_items?.flatMap(i => {
      const sku = i.sku || "";
      return sku.split(/[+,]/).map(s => s.replace(/^\d+/, "").trim()).filter(Boolean);
    }) || [];
  };

  const updateStatus = async (orderId, status) => {
    const { error } = await supabase.from("order_statuses").upsert(
      { order_id: String(orderId), status, updated_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, agent_status: status } : o));
    }
    setStatusDropdown(null);
  };

  const updateField = async (orderId, field, value) => {
    const existing = orders.find(o => o.id === orderId)?.agent_data || {};
    const updated = { ...existing, [field]: value };
    const { error } = await supabase.from("order_statuses").upsert({
      order_id: String(orderId),
      status: orders.find(o => o.id === orderId)?.agent_status || null,
      customer_name: updated.customer_name || null,
      phone: updated.phone || null,
      address: updated.address || null,
      city: updated.city || null,
      discount: updated.discount || null,
      notes: updated.notes || null,
      product: updated.product || null,
      sku: updated.sku || null,
      shipping: updated.shipping || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_id" });
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, agent_data: updated } : o));
    }
    setEditingCell(null);
  };

  const syncToShopify = async (order) => {
    const storeData = store || ordersStore;
    if (!storeData) return;
    setSyncingId(order.id);
    const agentData = order.agent_data || {};
    const customerName = agentData.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
    try {
      const res = await fetch(`${cfUrl}/shopify-update-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: storeData.shopify_url,
          token: storeData.api_token,
          orderId: order.id,
          updates: {
            shipping_address: {
              first_name: customerName.split(" ")[0] || "",
              last_name: customerName.split(" ").slice(1).join(" ") || "",
              address1: agentData.address || order.shipping_address?.address1 || "",
              city: agentData.city || order.shipping_address?.city || "",
              phone: agentData.phone || order.customer?.phone || "",
            }
          }
        }),
      });
      const data = await res.json();
      if (data.errors || data.error) {
        alert("❌ Shopify Error:\n" + JSON.stringify(data.errors || data.error, null, 2));
      } else {
        alert("✅ Shopify pe update ho gaya!\nOrder: " + order.name);
      }
    } catch (err) {
      alert("❌ Error: " + err.message);
    }
    setSyncingId(null);
  };

  const handleStatusBtnClick = (e, orderId) => {
    if (statusDropdown === orderId) {
      setStatusDropdown(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownHeight = 290;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < dropdownHeight;
    const left = Math.min(rect.left, window.innerWidth - 185);
    setDropdownPos({
      top: showAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left,
      showAbove,
    });
    setStatusDropdown(orderId);
  };

  const currentStore = store || ordersStore;
  const cities = ["All", ...new Set(orders.map(o => o.shipping_address?.city).filter(Boolean))];

  const filteredOrders = orders.filter(order => {
    const name = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.toLowerCase();
    const phone = order.customer?.phone || order.shipping_address?.phone || "";
    const orderNum = order.name || "";
    const matchSearch = !search || name.includes(search.toLowerCase()) || phone.includes(search) || orderNum.includes(search);
    const matchStatus = statusFilters.length === 0 || statusFilters.includes(order.agent_status);
    const matchSource = sourceFilter === "All" || getSource(order) === sourceFilter;
    const matchCity = cityFilter === "All" || order.shipping_address?.city === cityFilter;
    const matchSku = skuFilter === "All" || getSKUs(order).includes(skuFilter);
    const orderDate = new Date(order.created_at);
    const matchFrom = !dateFrom || orderDate >= new Date(dateFrom);
    const matchTo = !dateTo || orderDate <= new Date(dateTo + "T23:59:59");
    return matchSearch && matchStatus && matchSource && matchCity && matchSku && matchFrom && matchTo;
  });

  const allSKUs = [...new Set(filteredOrders.flatMap(o => getSKUs(o)))].filter(Boolean).sort();
  const totalPages = Math.ceil(filteredOrders.length / perPage);
  const pagedOrders = filteredOrders.slice((page - 1) * perPage, page * perPage);

  const EditableCell = ({ orderId, field, value, width = 100, maxChars = 20 }) => {
    const cellKey = `${orderId}-${field}`;
    const isEditing = editingCell === cellKey;
    const [val, setVal] = useState(value || "");
    useEffect(() => { setVal(value || ""); }, [value]);

    if (isEditing) return (
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") updateField(orderId, field, val); if (e.key === "Escape") setEditingCell(null); }}
          style={{ width, padding: "2px 5px", borderRadius: 4, border: "1px solid #3b82f6", background: "#0f172a", color: "#fff", fontSize: 11 }} />
        <button onClick={() => updateField(orderId, field, val)}
          style={{ background: "#3b82f6", border: "none", borderRadius: 4, color: "#fff", padding: "2px 5px", cursor: "pointer", fontSize: 10 }}>✓</button>
        <button onClick={() => setEditingCell(null)}
          style={{ background: "#334155", border: "none", borderRadius: 4, color: "#fff", padding: "2px 5px", cursor: "pointer", fontSize: 10 }}>✕</button>
      </div>
    );

    const display = truncate(value, maxChars);
    const needsTooltip = value && value.length > maxChars;

    return (
      <span onClick={() => setEditingCell(cellKey)} title={needsTooltip ? value : ""}
        style={{ cursor: "pointer", color: value ? "#e2e8f0" : "#475569", fontSize: 11, whiteSpace: "nowrap" }}>
        {display || "—"}
      </span>
    );
  };

  if (error) return <div style={{ padding: "2rem", color: "#ef4444" }}>❌ {error}</div>;

  const tdBase = { padding: "5px 6px" };
  const thBase = { padding: "7px 6px", textAlign: "left", color: "#64748b", whiteSpace: "nowrap", fontWeight: 500, borderBottom: "1px solid #334155", background: "#1e293b" };

  return (
    <div style={{ padding: "0.5rem", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>📦 Orders</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>{currentStore?.store_name} — {filteredOrders.length} orders</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#fff", fontSize: 11 }}>
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button onClick={handleRefresh}
            style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: "4px", flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Name, phone, order#..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 130, padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#7f1d1d", color: "#fca5a5", fontSize: 11, cursor: "pointer" }}>✕</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }} data-status-multi>
          <button onClick={() => setStatusMultiOpen(!statusMultiOpen)}
            style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
            {statusFilters.length === 0 ? "All Status ▼" : `${statusFilters.length} selected ▼`}
          </button>
          {statusMultiOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 9999, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px", minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.8)" }}>
              <div onClick={() => { setStatusFilters([]); setStatusMultiOpen(false); }}
                style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", color: "#94a3b8", fontSize: 11 }}>✕ Clear All</div>
              {STATUSES.map(s => (
                <div key={s.label} onClick={() => { setStatusFilters(prev => prev.includes(s.label) ? prev.filter(x => x !== s.label) : [...prev, s.label]); setPage(1); }}
                  style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = s.bg}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span>{statusFilters.includes(s.label) ? "✅" : "⬜"}</span>{s.label}
                </div>
              ))}
            </div>
          )}
        </div>
        <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }}>
          <option value="All">All Source</option>
          {["Meta", "TikTok", "Snapchat", "Google", "Direct"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={cityFilter} onChange={e => { setCityFilter(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }}>
          {cities.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={skuFilter} onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }}>
          <option value="All">All SKU</option>
          {allSKUs.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#94a3b8" }}>Loading orders...</div>
      ) : (
        <div ref={tableRef} style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #1e293b", flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 15 }}>
              <tr style={{ background: "#1e293b" }}>
                <th style={{ ...thBase, position: "sticky", left: 0, zIndex: 20, background: "#1e293b", minWidth: 85 }}>Order#</th>
                <th style={{ ...thBase }}>Date</th>
                <th style={{ ...thBase }}>Time</th>
                <th style={{ ...thBase }}>Full Name</th>
                <th style={{ ...thBase }}>Phone</th>
                <th style={{ ...thBase }}>Address</th>
                <th style={{ ...thBase }}>City</th>
                <th style={{ ...thBase }}>Products</th>
                <th style={{ ...thBase }}>SKU</th>
                <th style={{ ...thBase }}>Unit Price</th>
                <th style={{ ...thBase }}>Shipping</th>
                <th style={{ ...thBase }}>Discount</th>
                <th style={{ ...thBase }}>Total</th>
                <th style={{ ...thBase }}>Source</th>
                <th style={{ ...thBase, position: "sticky", right: 0, zIndex: 20, background: "#1e293b", minWidth: 120 }}>Status / Sync</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order, i) => {
                const source = getSource(order);
                const status = STATUSES.find(s => s.label === order.agent_status);
                const phone = order.agent_data?.phone || order.customer?.phone || order.shipping_address?.phone || "";
                const fullName = order.agent_data?.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
                const city = order.agent_data?.city || order.shipping_address?.city || "";
                const address = order.agent_data?.address || order.shipping_address?.address1 || "";
                const products = order.agent_data?.product || order.line_items?.map(i => `${i.quantity > 1 ? i.quantity + "x " : ""}${i.title}`).join(" + ") || "—";
                const skus = order.agent_data?.sku || order.line_items?.map(i => `${i.quantity > 1 ? i.quantity : ""}${i.sku || ""}`).join(" + ") || "—";
                const unitPrices = order.line_items?.map(i => i.price).join(" + ") || "—";
                const shipping = order.agent_data?.shipping || order.total_shipping_price_set?.presentment_money?.amount || "0";
                const discount = order.agent_data?.discount || order.total_discounts || "0";
                const date = new Date(order.created_at).toLocaleDateString("en-PK");
                const time = new Date(order.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
                const shopifyUrl = `https://${currentStore?.shopify_url}/admin/orders/${order.id}`;
                const rowBg = i % 2 === 0 ? "#0f172a" : "#0a0f1e";
                const isSyncing = syncingId === order.id;

                return (
                  <tr key={order.id} style={{ background: rowBg, borderBottom: "1px solid #1e293b" }}>
                    <td style={{ ...tdBase, position: "sticky", left: 0, zIndex: 4, background: rowBg, whiteSpace: "nowrap" }}>
                      <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontWeight: 600, textDecoration: "none", fontSize: 11 }}>{order.name}</a>
                    </td>
                    <td style={{ ...tdBase, color: "#94a3b8", whiteSpace: "nowrap" }}>{date}</td>
                    <td style={{ ...tdBase, color: "#64748b", whiteSpace: "nowrap" }}>{time}</td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="customer_name" value={fullName} width={110} maxChars={15} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="phone" value={phone} width={100} maxChars={13} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="address" value={address} width={130} maxChars={18} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="city" value={city} width={80} maxChars={10} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="product" value={products} width={160} maxChars={20} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="sku" value={skus} width={100} maxChars={12} /></td>
                    <td style={{ ...tdBase, color: "#94a3b8", whiteSpace: "nowrap" }}>{unitPrices}</td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="shipping" value={String(shipping)} width={60} maxChars={7} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="discount" value={String(discount)} width={60} maxChars={7} /></td>
                    <td style={{ ...tdBase, color: "#10b981", fontWeight: 600, whiteSpace: "nowrap" }}>Rs. {Number(order.total_price).toLocaleString()}</td>
                    <td style={tdBase}>
                      <span style={{ padding: "2px 6px", borderRadius: 8, fontSize: 10, background: "#1e293b", color: SOURCE_COLORS[source], fontWeight: 600 }}>{source}</span>
                    </td>
                    <td style={{ ...tdBase, position: "sticky", right: 0, zIndex: 4, background: rowBg }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                        <div style={{ position: "relative" }}>
                          <button
                            data-order-btn={order.id}
                            onClick={(e) => handleStatusBtnClick(e, order.id)}
                            style={{ padding: "3px 8px", borderRadius: 8, fontSize: 10, background: status?.bg || "#1e293b", color: status?.color || "#64748b", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                            {order.agent_status || "Set ▼"}
                          </button>
                        </div>
                        <button onClick={() => syncToShopify(order)} disabled={isSyncing}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 9, background: isSyncing ? "#1e293b" : "#0c4a6e", color: isSyncing ? "#64748b" : "#38bdf8", border: "none", cursor: isSyncing ? "default" : "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {isSyncing ? "Syncing..." : "🔄 Sync"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagedOrders.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Koi order nahi mila!</div>
          )}
        </div>
      )}

      {/* Status Dropdown — Fixed Portal */}
      {statusDropdown && (
        <div
          data-status-dropdown
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            zIndex: 999999,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "4px",
            minWidth: 175,
            boxShadow: "0 8px 30px rgba(0,0,0,0.9)",
          }}>
          {STATUSES.map(s => (
            <div key={s.label} onClick={() => updateStatus(statusDropdown, s.label)}
              style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = s.bg}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {s.label}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filteredOrders.length)} of {filteredOrders.length}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === 1 ? "#0f172a" : "#1e293b", color: page === 1 ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === 1 ? "#0f172a" : "#1e293b", color: page === 1 ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>‹</button>
          {[...Array(Math.min(5, totalPages))].map((_, idx) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + idx;
            return <button key={p} onClick={() => setPage(p)} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === p ? "#3b82f6" : "#1e293b", color: page === p ? "#fff" : "#94a3b8", fontSize: 11, cursor: "pointer" }}>{p}</button>;
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === totalPages ? "#0f172a" : "#1e293b", color: page === totalPages ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === totalPages ? "#0f172a" : "#1e293b", color: page === totalPages ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>»</button>
        </div>
      </div>
    </div>
  );
}