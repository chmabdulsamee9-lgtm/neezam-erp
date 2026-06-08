import { useState, useMemo } from "react";

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

const DATE_FILTERS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "Custom", value: "custom" },
];

export default function Dashboard({ ordersData }) {
  const [dateFilter, setDateFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateFilter === "today") return { from: today, to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "yesterday") {
      const y = new Date(today.getTime() - 86400000);
      return { from: y, to: today };
    }
    if (dateFilter === "7days") return { from: new Date(today.getTime() - 7 * 86400000), to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "30days") return { from: new Date(today.getTime() - 30 * 86400000), to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(new Date(customTo).getTime() + 86400000) };
    }
    return { from: today, to: new Date(today.getTime() + 86400000) };
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

  const filtered = useMemo(() => {
    if (!ordersData?.length) return [];
    const { from, to } = getDateRange();
    return ordersData.filter(o => {
      const d = new Date(o.created_at);
      return d >= from && d < to;
    });
  }, [ordersData, dateFilter, customFrom, customTo]);

  const totalRevenue = filtered.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
  const totalOrders = filtered.length;

  const statusCounts = {};
  STATUSES.forEach(s => { statusCounts[s.label] = 0; });
  filtered.forEach(o => {
    const st = o.agent_status;
    if (st && statusCounts[st] !== undefined) statusCounts[st]++;
  });

  const sourceCounts = {};
  filtered.forEach(o => {
    const src = getSource(o);
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  const cityMap = {};
  filtered.forEach(o => {
    const city = o.agent_data?.city || o.shipping_address?.city;
    if (city) cityMap[city] = (cityMap[city] || 0) + 1;
  });
  const topCities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const skuMap = {};
  filtered.forEach(o => {
    getSKUs(o).forEach(sku => {
      if (sku) skuMap[sku] = (skuMap[sku] || 0) + 1;
    });
  });
  const topSKUs = Object.entries(skuMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const approvedRevenue = filtered
    .filter(o => o.agent_status === "Approved")
    .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

  const pendingCount = filtered.filter(o => !o.agent_status || o.agent_status === "Under Verification").length;

  return (
    <div style={{ padding: "1rem", color: "#fff" }}>

      {/* Date Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {DATE_FILTERS.map(f => (
          <button key={f.value} onClick={() => setDateFilter(f.value)}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", fontSize: 11, cursor: "pointer", fontWeight: 500, background: dateFilter === f.value ? "#3b82f6" : "#1e293b", color: dateFilter === f.value ? "#fff" : "#94a3b8" }}>
            {f.label}
          </button>
        ))}
        {dateFilter === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
          </>
        )}
        <span style={{ fontSize: 11, color: "#64748b" }}>{filtered.length} orders</span>
      </div>

      {/* Top Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        {[
          { label: "Total Orders", value: totalOrders, color: "#3b82f6", icon: "📦" },
          { label: "Total Revenue", value: `Rs. ${totalRevenue.toLocaleString()}`, color: "#10b981", icon: "💰" },
          { label: "Approved Revenue", value: `Rs. ${approvedRevenue.toLocaleString()}`, color: "#16a34a", icon: "✅" },
          { label: "Pending", value: pendingCount, color: "#eab308", icon: "⏳" },
          { label: "Approved", value: statusCounts["Approved"] || 0, color: "#16a34a", icon: "✅" },
          { label: "Cancelled", value: statusCounts["Cancelled"] || 0, color: "#ef4444", icon: "❌" },
          { label: "Not Answering", value: statusCounts["Not Answering"] || 0, color: "#f97316", icon: "📵" },
          { label: "No Status", value: filtered.filter(o => !o.agent_status).length, color: "#64748b", icon: "❓" },
        ].map((card, i) => (
          <div key={i} style={{ background: "#1e293b", borderRadius: 10, padding: "0.85rem", borderLeft: `3px solid ${card.color}` }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{card.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Status Breakdown + Source */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>

        {/* Status Breakdown */}
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>📊 Status Breakdown</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {STATUSES.map(s => {
              const count = statusCounts[s.label] || 0;
              const pct = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
              return (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: s.color, minWidth: 130, fontWeight: 500 }}>{s.label}</span>
                  <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, background: s.color, height: "100%", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 30, textAlign: "right" }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Breakdown */}
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>📣 Source Breakdown</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
              const pct = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
              const color = SOURCE_COLORS[src] || "#64748b";
              return (
                <div key={src} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color, minWidth: 70, fontWeight: 500 }}>{src}</span>
                  <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 50, textAlign: "right" }}>{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>

          {/* Status remaining */}
          <h2 style={{ margin: "1rem 0 0.75rem", fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>📋 Other Statuses</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STATUSES.filter(s => statusCounts[s.label] > 0).map(s => (
              <span key={s.label} style={{ padding: "3px 8px", borderRadius: 12, fontSize: 10, background: s.bg, color: s.color, fontWeight: 500 }}>
                {s.label}: {statusCounts[s.label]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Top Cities + Top SKUs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>

        {/* Top Cities */}
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>🗺️ Top Cities</h2>
          {topCities.length === 0 ? (
            <p style={{ color: "#475569", fontSize: 12 }}>Koi data nahi</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topCities.map(([city, count]) => {
                const pct = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={city} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#e2e8f0", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city}</span>
                    <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, background: "#3b82f6", height: "100%", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 30, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top SKUs */}
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>🏷️ Top SKUs</h2>
          {topSKUs.length === 0 ? (
            <p style={{ color: "#475569", fontSize: 12 }}>Koi data nahi</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topSKUs.map(([sku, count]) => {
                const pct = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={sku} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#e2e8f0", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sku}</span>
                    <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, background: "#a78bfa", height: "100%", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 30, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}