import { useState, useEffect } from "react";
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

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [cityFilter, setCityFilter] = useState("All");
  const [editingCell, setEditingCell] = useState(null);
  const [statusDropdown, setStatusDropdown] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => { loadStore(); }, []);

  const loadStore = async () => {
    const { data } = await supabase.from("stores").select("*").limit(1).single();
    if (data) { setStore(data); fetchOrders(data); }
    else { setError("Pehle Store Connect karo!"); setLoading(false); }
  };

  const fetchOrders = async (storeData) => {
    setLoading(true);
    try {
      const res = await fetch(`/.netlify/functions/shopify-orders?shop=${storeData.shopify_url}&token=${storeData.api_token}`);
      const data = await res.json();
      if (data.orders) {
        const { data: statuses } = await supabase.from("order_statuses").select("*");
        const statusMap = {};
        (statuses || []).forEach(s => { statusMap[s.order_id] = s; });
        setOrders(data.orders.map(o => ({
          ...o,
          agent_data: statusMap[String(o.id)] || {},
          agent_status: statusMap[String(o.id)]?.status || null,
        })));
      } else { setError("Orders fetch nahi hue!"); }
    } catch (err) { setError("Error: " + err.message); }
    setLoading(false);
  };

  const getSource = (order) => {
    const ref = order.referring_site || "";
    if (ref.includes("facebook") || ref.includes("meta") || ref.includes("fb")) return "Meta";
    if (ref.includes("tiktok")) return "TikTok";
    if (ref.includes("snapchat")) return "Snapchat";
    if (ref.includes("google")) return "Google";
    return "Direct";
  };

  const sourceColor = { Meta: "#3b82f6", TikTok: "#ec4899", Snapchat: "#eab308", Google: "#10b981", Direct: "#64748b" };

  const updateStatus = async (orderId, status) => {
    await supabase.from("order_statuses").upsert({ order_id: String(orderId), status, updated_at: new Date().toISOString() }, { onConflict: "order_id" });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, agent_status: status } : o));
    setStatusDropdown(null);
  };

  const updateField = async (orderId, field, value, shopifyUpdate = false) => {
    setSavingId(orderId);
    const existing = orders.find(o => o.id === orderId)?.agent_data || {};
    const updated = { ...existing, [field]: value };
    await supabase.from("order_statuses").upsert({
      order_id: String(orderId),
      ...updated,
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_id" });

    if (shopifyUpdate) {
      await fetch("/.netlify/functions/shopify-update-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: store.shopify_url,
          token: store.api_token,
          orderId,
          updates: { shipping_address: { address1: updated.address, city: updated.city, phone: updated.phone } }
        }),
      });
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, agent_data: updated } : o));
    setEditingCell(null);
    setSavingId(null);
  };

  const cities = ["All", ...new Set(orders.map(o => o.shipping_address?.city).filter(Boolean))];

  const filteredOrders = orders.filter(order => {
    const name = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.toLowerCase();
    const phone = order.customer?.phone || order.shipping_address?.phone || "";
    const orderNum = order.name || "";
    const matchSearch = !search || name.includes(search.toLowerCase()) || phone.includes(search) || orderNum.includes(search);
    const matchStatus = statusFilter === "All" || order.agent_status === statusFilter;
    const matchSource = sourceFilter === "All" || getSource(order) === sourceFilter;
    const matchCity = cityFilter === "All" || order.shipping_address?.city === cityFilter;
    return matchSearch && matchStatus && matchSource && matchCity;
  });

  const EditableCell = ({ orderId, field, value, shopify = false }) => {
    const cellKey = `${orderId}-${field}`;
    const isEditing = editingCell === cellKey;
    const [val, setVal] = useState(value || "");

    if (isEditing) return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") updateField(orderId, field, val, shopify);
            if (e.key === "Escape") setEditingCell(null);
          }}
          style={{ width: 120, padding: "3px 6px", borderRadius: 4, border: "1px solid #3b82f6", background: "#0f172a", color: "#fff", fontSize: 12 }}
        />
        <button onClick={() => updateField(orderId, field, val, shopify)} style={{ background: "#3b82f6", border: "none", borderRadius: 4, color: "#fff", padding: "3px 6px", cursor: "pointer", fontSize: 11 }}>✓</button>
      </div>
    );

    return (
      <span
        onClick={() => { setEditingCell(cellKey); }}
        style={{ cursor: "pointer", borderBottom: "1px dashed #334155", color: value ? "#fff" : "#475569", fontSize: 13 }}
        title="Click to edit"
      >
        {value || "—"}
      </span>
    );
  };

  if (error) return <div style={{ padding: "2rem", color: "#ef4444" }}>❌ {error}</div>;

  return (
    <div style={{ padding: "1rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#fff" }}>📦 Orders</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{store?.store_name} — {filteredOrders.length} orders</p>
        </div>
        <button onClick={() => store && fetchOrders(store)} style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Name, phone, order#..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 150, padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 12 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 12 }}>
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s.label}>{s.label}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 12 }}>
          <option value="All">All Source</option>
          {["Meta", "TikTok", "Snapchat", "Google", "Direct"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 12 }}>
          {cities.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#94a3b8" }}>Loading orders...</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #1e293b" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1e293b" }}>
                {["Date", "Time", "Order#", "Full Name", "Phone", "Address", "City", "Products", "SKU", "Unit Price", "Shipping", "Discount", "Total", "Source", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 10px", textAlign: "left", color: "#64748b", whiteSpace: "nowrap", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, i) => {
                const source = getSource(order);
                const status = STATUSES.find(s => s.label === order.agent_status);
                const phone = order.agent_data?.phone || order.customer?.phone || order.shipping_address?.phone || "";
                const fullName = order.agent_data?.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
                const city = order.agent_data?.city || order.shipping_address?.city || "";
                const address = order.agent_data?.address || order.shipping_address?.address1 || "";
                const products = order.line_items?.map(i => `${i.quantity > 1 ? i.quantity + "x " : ""}${i.title}`).join(" + ") || "—";
                const skus = order.line_items?.map(i => `${i.quantity > 1 ? i.quantity : ""}${i.sku || ""}`).join(" + ") || "—";
                const unitPrices = order.line_items?.map(i => i.price).join(" + ") || "—";
                const date = new Date(order.created_at).toLocaleDateString("en-PK");
                const time = new Date(order.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
                const discount = order.agent_data?.discount || order.total_discounts || "0";

                return (
                  <tr key={order.id} style={{ background: i % 2 === 0 ? "#0f172a" : "#0a0f1e", borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "8px 10px", color: "#94a3b8", whiteSpace: "nowrap" }}>{date}</td>
                    <td style={{ padding: "8px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{time}</td>
                    <td style={{ padding: "8px 10px", color: "#60a5fa", fontWeight: 600 }}>{order.name}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <EditableCell orderId={order.id} field="customer_name" value={fullName} shopify />
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <EditableCell orderId={order.id} field="phone" value={phone} shopify />
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 160 }}>
                      <EditableCell orderId={order.id} field="address" value={address} shopify />
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <EditableCell orderId={order.id} field="city" value={city} shopify />
                    </td>
                    <td style={{ padding: "8px 10px", color: "#94a3b8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{products}</td>
                    <td style={{ padding: "8px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{skus}</td>
                    <td style={{ padding: "8px 10px", color: "#94a3b8", whiteSpace: "nowrap" }}>{unitPrices}</td>
                    <td style={{ padding: "8px 10px", color: "#94a3b8" }}>Rs. {order.total_shipping_price_set?.presentment_money?.amount || "0"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <EditableCell orderId={order.id} field="discount" value={String(discount)} />
                    </td>
                    <td style={{ padding: "8px 10px", color: "#10b981", fontWeight: 600, whiteSpace: "nowrap" }}>Rs. {Number(order.total_price).toLocaleString()}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#1e293b", color: sourceColor[source], fontWeight: 600 }}>{source}</span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => setStatusDropdown(statusDropdown === order.id ? null : order.id)}
                          style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, background: status?.bg || "#1e293b", color: status?.color || "#64748b", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                        >
                          {order.agent_status || "Set ▼"}
                        </button>
                        {statusDropdown === order.id && (
                          <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 200, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "4px", minWidth: 170, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                            {STATUSES.map(s => (
                              <div key={s.label} onClick={() => updateStatus(order.id, s.label)}
                                style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", color: s.color, fontSize: 12, fontWeight: 500 }}
                                onMouseEnter={e => e.currentTarget.style.background = s.bg}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                              >{s.label}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredOrders.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Koi order nahi mila!</div>
          )}
        </div>
      )}
    </div>
  );
}