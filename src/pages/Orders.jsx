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
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailForm, setDetailForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(null);

  useEffect(() => {
    loadStore();
  }, []);

  const loadStore = async () => {
    const { data } = await supabase.from("stores").select("*").limit(1).single();
    if (data) {
      setStore(data);
      fetchOrders(data);
    } else {
      setError("Pehle Store Connect karo!");
      setLoading(false);
    }
  };

  const fetchOrders = async (storeData) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/.netlify/functions/shopify-orders?shop=${storeData.shopify_url}&token=${storeData.api_token}`
      );
      const data = await res.json();
      if (data.orders) {
        // Load saved statuses
        const { data: statuses } = await supabase.from("order_statuses").select("*");
        const statusMap = {};
        (statuses || []).forEach(s => { statusMap[s.order_id] = s; });
        const merged = data.orders.map(o => ({
          ...o,
          agent_data: statusMap[String(o.id)] || null,
          agent_status: statusMap[String(o.id)]?.status || null,
        }));
        setOrders(merged);
      } else {
        setError("Orders fetch nahi hue!");
      }
    } catch (err) {
      setError("Error: " + err.message);
    }
    setLoading(false);
  };

  const updateStatus = async (orderId, status) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("order_statuses").upsert({
      order_id: String(orderId),
      status,
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_id" });
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, agent_status: status } : o
    ));
    setStatusDropdown(null);
  };

  const openDetail = (order) => {
    setDetailOrder(order);
    setDetailForm({
      customer_name: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
      phone: order.customer?.phone || order.shipping_address?.phone || "",
      address: order.shipping_address?.address1 || "",
      city: order.shipping_address?.city || "",
      discount: order.agent_data?.discount || 0,
      notes: order.agent_data?.notes || "",
      product: order.line_items?.[0]?.title || "",
      quantity: order.line_items?.[0]?.quantity || 1,
    });
  };

  const saveDetail = async (updateShopify) => {
    setSaving(true);
    try {
      // Save to Supabase
      await supabase.from("order_statuses").upsert({
        order_id: String(detailOrder.id),
        status: detailOrder.agent_status || null,
        customer_name: detailForm.customer_name,
        phone: detailForm.phone,
        address: detailForm.address,
        city: detailForm.city,
        discount: detailForm.discount,
        notes: detailForm.notes,
        updated_at: new Date().toISOString(),
      }, { onConflict: "order_id" });

      if (updateShopify) {
        // Update Shopify
        await fetch("/.netlify/functions/shopify-update-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: store.shopify_url,
            token: store.api_token,
            orderId: detailOrder.id,
            updates: {
              shipping_address: {
                address1: detailForm.address,
                city: detailForm.city,
                phone: detailForm.phone,
              },
              discount: detailForm.discount,
            }
          }),
        });
      }

      // Update local state
      setOrders(prev => prev.map(o =>
        o.id === detailOrder.id ? {
          ...o,
          agent_data: { ...detailForm },
        } : o
      ));

      setDetailOrder(null);
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
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

  if (error) return (
    <div style={{ padding: "2rem", color: "#ef4444" }}>❌ {error}</div>
  );

  return (
    <div style={{ padding: "1.5rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#fff" }}>📦 Orders</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>{store?.store_name} — {filteredOrders.length} orders</p>
        </div>
        <button onClick={() => store && fetchOrders(store)} style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="🔍 Name, phone, order#..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13 }}>
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s.label}>{s.label}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13 }}>
          <option value="All">All Source</option>
          {["Meta", "TikTok", "Snapchat", "Google", "Direct"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13 }}>
          {cities.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#94a3b8" }}>Loading orders...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#94a3b8" }}>
                {["Order", "Date", "Customer", "Phone", "City", "Items", "Total", "Source", "Status", "Details"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, i) => {
                const source = getSource(order);
                const status = STATUSES.find(s => s.label === order.agent_status);
                const phone = order.agent_data?.phone || order.customer?.phone || order.shipping_address?.phone || "—";
                const fullName = order.agent_data?.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
                const city = order.agent_data?.city || order.shipping_address?.city || "—";
                const items = order.line_items?.map(i => `${i.quantity}x ${i.title}`).join(", ") || "—";
                const date = new Date(order.created_at).toLocaleDateString("en-PK");

                return (
                  <tr key={order.id} style={{ background: i % 2 === 0 ? "#0f172a" : "#0d1424", borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "10px 12px", color: "#60a5fa", fontWeight: 600 }}>{order.name}</td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8", whiteSpace: "nowrap" }}>{date}</td>
                    <td style={{ padding: "10px 12px", color: "#fff" }}>{fullName || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{phone}</td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{city}</td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{items}</td>
                    <td style={{ padding: "10px 12px", color: "#10b981", fontWeight: 600, whiteSpace: "nowrap" }}>Rs. {Number(order.total_price).toLocaleString()}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 12, fontSize: 11, background: "#1e293b", color: sourceColor[source], fontWeight: 600 }}>{source}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => setStatusDropdown(statusDropdown === order.id ? null : order.id)}
                          style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, background: status?.bg || "#1e293b", color: status?.color || "#94a3b8", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                        >
                          {order.agent_status || "Set ▼"}
                        </button>
                        {statusDropdown === order.id && (
                          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 200, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px", minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                            {STATUSES.map(s => (
                              <div key={s.label} onClick={() => updateStatus(order.id, s.label)}
                                style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: s.color, fontSize: 12, fontWeight: 500 }}
                                onMouseEnter={e => e.currentTarget.style.background = s.bg}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                              >{s.label}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button
                        onClick={() => openDetail(order)}
                        style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, background: "#1e3a5f", color: "#60a5fa", border: "none", cursor: "pointer", fontWeight: 600 }}
                      >
                        Details
                      </button>
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

      {/* Detail Modal */}
      {detailOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "#1e293b", borderRadius: 16, padding: "1.5rem", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 16 }}>📋 {detailOrder.name} — Details</h2>
              <button onClick={() => setDetailOrder(null)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {[
                { label: "Customer Name", key: "customer_name" },
                { label: "Phone", key: "phone" },
                { label: "Address", key: "address" },
                { label: "City", key: "city" },
                { label: "Discount (Rs.)", key: "discount", type: "number" },
                { label: "Product", key: "product" },
                { label: "Quantity", key: "quantity", type: "number" },
                { label: "Notes", key: "notes", textarea: true },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>{field.label}</label>
                  {field.textarea ? (
                    <textarea
                      value={detailForm[field.key] || ""}
                      onChange={(e) => setDetailForm({ ...detailForm, [field.key]: e.target.value })}
                      rows={3}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", resize: "vertical" }}
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={detailForm[field.key] || ""}
                      onChange={(e) => setDetailForm({ ...detailForm, [field.key]: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box" }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: "1.25rem" }}>
              <button
                onClick={() => saveDetail(false)}
                disabled={saving}
                style={{ flex: 1, padding: "10px", borderRadius: 8, background: "#334155", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                {saving ? "Saving..." : "💾 Save (Shopify nahi)"}
              </button>
              <button
                onClick={() => saveDetail(true)}
                disabled={saving}
                style={{ flex: 1, padding: "10px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                {saving ? "Updating..." : "✅ Update Shopify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}