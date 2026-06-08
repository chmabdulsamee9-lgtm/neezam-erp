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
  const [selectedOrder, setSelectedOrder] = useState(null);

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
        setOrders(data.orders);
      } else {
        setError("Orders fetch nahi hue: " + JSON.stringify(data));
      }
    } catch (err) {
      setError("Error: " + err.message);
    }
    setLoading(false);
  };

  const updateStatus = async (orderId, status) => {
    await supabase.from("order_statuses").upsert({
      order_id: orderId,
      status: status,
      updated_at: new Date().toISOString(),
    }, { onConflict: "order_id" });
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, agent_status: status } : o
    ));
    setSelectedOrder(null);
  };

  const getSource = (order) => {
    const ref = order.referring_site || "";
    if (ref.includes("facebook") || ref.includes("meta")) return { label: "Meta", color: "#3b82f6" };
    if (ref.includes("tiktok")) return { label: "TikTok", color: "#ec4899" };
    if (ref.includes("snapchat")) return { label: "Snapchat", color: "#eab308" };
    if (ref.includes("google")) return { label: "Google", color: "#10b981" };
    if (ref === "") return { label: "Direct", color: "#94a3b8" };
    return { label: "Other", color: "#94a3b8" };
  };

  const filteredOrders = orders.filter(order => {
    const name = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.toLowerCase();
    const phone = order.customer?.phone || order.shipping_address?.phone || "";
    const orderNum = order.name || "";
    const matchSearch = name.includes(search.toLowerCase()) ||
      phone.includes(search) ||
      orderNum.includes(search);
    const matchStatus = statusFilter === "All" || order.agent_status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (error) return (
    <div style={{ padding: "2rem", color: "#ef4444", fontSize: 16 }}>
      ❌ {error}
    </div>
  );

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#fff" }}>📦 Orders</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            {store?.store_name} — {orders.length} orders
          </p>
        </div>
        <button
          onClick={() => store && fetchOrders(store)}
          style={{
            background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
            borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer"
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="🔍 Name, phone, order number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, padding: "8px 12px",
            borderRadius: 8, border: "1px solid #334155",
            background: "#0f172a", color: "#fff", fontSize: 13,
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "8px 12px", borderRadius: 8,
            border: "1px solid #334155", background: "#0f172a",
            color: "#fff", fontSize: 13, cursor: "pointer"
          }}
        >
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
        </select>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#94a3b8" }}>
          Loading orders...
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#94a3b8" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Order</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Date</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Customer</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Phone</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>City</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Items</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Total</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Source</th>
                <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, i) => {
                const source = getSource(order);
                const status = STATUSES.find(s => s.label === order.agent_status);
                const phone = order.customer?.phone || order.shipping_address?.phone || "—";
                const fullName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
                const items = order.line_items?.map(i => i.title).join(", ") || "—";
                const date = new Date(order.created_at).toLocaleDateString("en-PK");

                return (
                  <tr key={order.id} style={{
                    background: i % 2 === 0 ? "#0f172a" : "#0d1424",
                    borderBottom: "1px solid #1e293b"
                  }}>
                    <td style={{ padding: "10px 12px", color: "#60a5fa", fontWeight: 600 }}>
                      {order.name}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {date}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#fff" }}>
                      {fullName || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8" }}>
                      {phone}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8" }}>
                      {order.shipping_address?.city || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {items}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#10b981", fontWeight: 600, whiteSpace: "nowrap" }}>
                      Rs. {Number(order.total_price).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "3px 8px", borderRadius: 12, fontSize: 11,
                        background: "#1e293b", color: source.color, fontWeight: 600
                      }}>
                        {source.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}
                          style={{
                            padding: "4px 10px", borderRadius: 12, fontSize: 11,
                            background: status?.bg || "#1e293b",
                            color: status?.color || "#94a3b8",
                            border: "none", cursor: "pointer", fontWeight: 600,
                            whiteSpace: "nowrap"
                          }}
                        >
                          {order.agent_status || "Set Status ▼"}
                        </button>
                        {selectedOrder === order.id && (
                          <div style={{
                            position: "absolute", top: "100%", left: 0, zIndex: 100,
                            background: "#1e293b", border: "1px solid #334155",
                            borderRadius: 8, padding: "6px", minWidth: 180,
                            boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
                          }}>
                            {STATUSES.map(s => (
                              <div
                                key={s.label}
                                onClick={() => updateStatus(order.id, s.label)}
                                style={{
                                  padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                                  color: s.color, fontSize: 12, fontWeight: 500,
                                  background: "transparent",
                                }}
                                onMouseEnter={e => e.target.style.background = s.bg}
                                onMouseLeave={e => e.target.style.background = "transparent"}
                              >
                                {s.label}
                              </div>
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
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              Koi order nahi mila!
            </div>
          )}
        </div>
      )}
    </div>
  );
}