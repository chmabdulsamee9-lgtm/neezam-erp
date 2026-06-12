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

const CHART_LINES = [
  { key: "Orders", color: "#3b82f6" },
  { key: "Revenue", color: "#10b981" },
  { key: "Approved Orders", color: "#f59e0b" },
];

function TrendChart({ ordersData }) {
  const [activeLines, setActiveLines] = useState(["Orders", "Revenue", "Approved Orders"]);
  const [hoveredDay, setHoveredDay] = useState(null);

  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 30 }, (_, idx) => {
      const i = 29 - idx;
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayOrders = (ordersData || []).filter(o => (o.created_at || "").slice(0, 10) === dayStr);
      return {
        date: dayStr,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        Orders: dayOrders.length,
        Revenue: Math.round(dayOrders.reduce((s, o) => s + Number(o.total_price || 0), 0)),
        "Approved Orders": dayOrders.filter(o => o.agent_status === "Approved").length,
      };
    });
  }, [ordersData]);

  const W = 700, H = 200;
  const PAD = { top: 20, right: 20, bottom: 25, left: 10 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = days.length;

  const getX = (i) => PAD.left + (i / (n - 1)) * cW;

  const maxVal = {};
  CHART_LINES.forEach(({ key }) => {
    maxVal[key] = Math.max(...days.map(d => d[key]), 1);
  });

  const getY = (key, val) => PAD.top + cH - (val / maxVal[key]) * cH;

  const buildPath = (key) =>
    days.map((d, i) => `${i === 0 ? "M" : "L"}${getX(i).toFixed(1)},${getY(key, d[key]).toFixed(1)}`).join(" ");

  const bandW = cW / (n - 1);

  const toggleLine = (key) =>
    setActiveLines(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const hovered = hoveredDay !== null ? days[hoveredDay] : null;
  const tooltipX = hoveredDay !== null ? getX(hoveredDay) : 0;
  const tooltipOnRight = tooltipX < W / 2;
  const activeCount = activeLines.length;

  return (
    <div style={{ background: "#1e293b", borderRadius: 10, padding: "1rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>📈 30-Day Trend</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CHART_LINES.map(({ key, color }) => (
            <button key={key} onClick={() => toggleLine(key)}
              style={{ padding: "3px 10px", borderRadius: 20, border: `1px solid ${color}`, fontSize: 10, cursor: "pointer", fontWeight: 500,
                background: activeLines.includes(key) ? color : "transparent",
                color: activeLines.includes(key) ? "#fff" : color, transition: "all 0.15s" }}>
              {key}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "#0f172a", borderRadius: 8, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}
          onMouseLeave={() => setHoveredDay(null)}>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <line key={t} x1={PAD.left} y1={PAD.top + t * cH} x2={PAD.left + cW} y2={PAD.top + t * cH}
              stroke="#1e293b" strokeWidth="0.8" />
          ))}

          {/* X axis labels every 5 days */}
          {days.map((d, i) => (i % 5 === 0 || i === n - 1) && (
            <text key={i} x={getX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#475569">{d.label}</text>
          ))}

          {/* Lines */}
          {CHART_LINES.filter(({ key }) => activeLines.includes(key)).map(({ key, color }) => (
            <path key={key} d={buildPath(key)} fill="none" stroke={color} strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* Dots */}
          {CHART_LINES.filter(({ key }) => activeLines.includes(key)).map(({ key, color }) =>
            days.map((d, i) => (
              <circle key={`${key}-${i}`}
                cx={getX(i)} cy={getY(key, d[key])}
                r={hoveredDay === i ? 4 : 2.5}
                fill={color} stroke="#0f172a" strokeWidth="1.5" />
            ))
          )}

          {/* Hover bands */}
          {days.map((_, i) => {
            const x = i === 0 ? PAD.left : getX(i) - bandW / 2;
            const w = i === 0 || i === n - 1 ? bandW / 2 : bandW;
            return (
              <rect key={i} x={x} y={PAD.top} width={w} height={cH}
                fill="transparent" style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHoveredDay(i)} />
            );
          })}

          {/* Vertical hover line */}
          {hovered && (
            <line x1={tooltipX} y1={PAD.top} x2={tooltipX} y2={PAD.top + cH}
              stroke="#475569" strokeWidth="0.8" strokeDasharray="3,2" />
          )}

          {/* Tooltip */}
          {hovered && (
            <g>
              <rect
                x={tooltipOnRight ? tooltipX + 6 : tooltipX - 106}
                y={PAD.top + 2}
                width={100}
                height={14 + activeCount * 14}
                rx={4} fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
              <text x={tooltipOnRight ? tooltipX + 11 : tooltipX - 100} y={PAD.top + 12}
                fontSize="7.5" fill="#94a3b8">{hovered.date}</text>
              {CHART_LINES.filter(({ key }) => activeLines.includes(key)).map(({ key, color }, j) => (
                <text key={key}
                  x={tooltipOnRight ? tooltipX + 11 : tooltipX - 100}
                  y={PAD.top + 24 + j * 13}
                  fontSize="8" fill={color} fontWeight="500">
                  {key}: {key === "Revenue" ? `Rs.${hovered[key].toLocaleString()}` : hovered[key]}
                </text>
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

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
  const noStatusCount = filtered.filter(o => !o.agent_status).length;

  const pct = (count) => totalOrders ? Math.round((count / totalOrders) * 100) : 0;
  const withPct = (count) => `${count} (${pct(count)}%)`;

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {[
          { label: "Total Orders", value: totalOrders, color: "#3b82f6", icon: "📦" },
          { label: "Total Revenue", value: `Rs. ${totalRevenue.toLocaleString()}`, color: "#10b981", icon: "💰" },
          { label: "Approved Revenue", value: `Rs. ${approvedRevenue.toLocaleString()}`, color: "#16a34a", icon: "✅" },
          { label: "Pending", value: withPct(pendingCount), color: "#eab308", icon: "⏳" },
          { label: "Approved", value: withPct(statusCounts["Approved"] || 0), color: "#16a34a", icon: "✅" },
          { label: "Cancelled", value: withPct(statusCounts["Cancelled"] || 0), color: "#ef4444", icon: "❌" },
          { label: "Not Answering", value: withPct(statusCounts["Not Answering"] || 0), color: "#f97316", icon: "📵" },
          { label: "No Status", value: withPct(noStatusCount), color: "#64748b", icon: "❓" },
        ].map((card, i) => (
          <div key={i} style={{ background: "#1e293b", borderRadius: 10, padding: "0.85rem", borderLeft: `3px solid ${card.color}` }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{card.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* All Statuses Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {STATUSES.map(s => {
          const count = statusCounts[s.label] || 0;
          const p = pct(count);
          return (
            <div key={s.label} style={{ background: "#1e293b", borderRadius: 8, padding: "0.65rem", borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{count} ({p}%)</div>
              <div style={{ fontSize: 10, color: s.color, fontWeight: 500 }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Trend Chart */}
      <TrendChart ordersData={ordersData} />

      {/* Status Breakdown + Source */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>

        {/* Status Breakdown */}
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>📊 Status Breakdown</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {STATUSES.map(s => {
              const count = statusCounts[s.label] || 0;
              const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
              return (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: s.color, minWidth: 130, fontWeight: 500 }}>{s.label}</span>
                  <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, background: s.color, height: "100%", borderRadius: 4 }} />
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
              const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
              const color = SOURCE_COLORS[src] || "#64748b";
              return (
                <div key={src} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color, minWidth: 70, fontWeight: 500 }}>{src}</span>
                  <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, background: color, height: "100%", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 50, textAlign: "right" }}>{count} ({p}%)</span>
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
                const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={city} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#e2e8f0", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city}</span>
                    <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, background: "#3b82f6", height: "100%", borderRadius: 4 }} />
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
                const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={sku} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#e2e8f0", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sku}</span>
                    <div style={{ flex: 1, background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, background: "#a78bfa", height: "100%", borderRadius: 4 }} />
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
