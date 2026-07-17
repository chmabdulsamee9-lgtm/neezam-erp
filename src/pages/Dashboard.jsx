import { useState, useMemo, useEffect, useId } from "react";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CHART_LINE_LABEL_KEYS = { Orders: "dashboard.chart.orders", Revenue: "dashboard.chart.revenue", "Approved Orders": "dashboard.chart.approvedOrders" };
const HOURLY_METRIC_LABEL_KEYS = { orders: "dashboard.hourly.orders", confirmed: "dashboard.hourly.confirmed", revenue: "dashboard.hourly.revenue" };
const DATE_FILTER_LABEL_KEYS = { today: "dashboard.dateFilter.today", yesterday: "dashboard.dateFilter.yesterday", "7days": "dashboard.dateFilter.7days", "30days": "dashboard.dateFilter.30days", custom: "dashboard.dateFilter.custom" };

// TASK Phase 7: hardcoded hex colors light mode mein illegible/wrong the (dark-tuned bg
// values light theme mein bhi dark reh jate) — ab sab CSS vars use karte hain, jo
// theme.css mein dono (:root aur :root[data-theme="light"]) ke liye define hain,
// bilkul ProfitLoss.jsx wale pattern jaisa.
const STATUSES = [
  { label: "Approved", color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
  { label: "Under Verification", color: "var(--ne-warning)", bg: "var(--ne-warning-soft)" },
  { label: "Cancelled", color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
  { label: "Not Answering", color: "var(--ne-orange)", bg: "var(--ne-orange-soft)" },
  { label: "Powered Off", color: "var(--ne-pink)", bg: "var(--ne-pink-soft)" },
  { label: "Hold", color: "var(--ne-muted)", bg: "var(--ne-muted-soft)" },
  { label: "Busy", color: "var(--ne-accent)", bg: "var(--ne-accent-soft)" },
  { label: "FAKE Order", color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
  { label: "No WhatsApp", color: "var(--ne-muted)", bg: "var(--ne-muted-soft)" },
  { label: "Callback Scheduled", color: "var(--ne-accent2)", bg: "var(--ne-accent2-soft)" },
  { label: "Wrong Number", color: "var(--ne-pink)", bg: "var(--ne-pink-soft)" },
];

const SOURCE_COLORS = { Meta: "#5C7CFA", TikTok: "#F472B6", Snapchat: "#F2A83E", Google: "#34D88E", Direct: "#8C93C4" };

const DATE_FILTERS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "Custom", value: "custom" },
];

const CHART_LINES = [
  { key: "Orders", color: "#5C7CFA" },
  { key: "Revenue", color: "#34D88E" },
  { key: "Approved Orders", color: "#F2A83E" },
];

// Catmull-Rom -> cubic-bezier conversion (tension 1/6) — seedhi lines ki jagah
// smooth curved path banane ke liye, bina extra library ke.
function smoothLinePath(points) {
  if (points.length < 2) return "";
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function TrendChart({ ordersData }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [activeLines, setActiveLines] = useState(["Orders", "Revenue", "Approved Orders"]);
  const [hoveredDay, setHoveredDay] = useState(null);
  const gradUid = useId();

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

  const linePoints = (key) => days.map((d, i) => ({ x: getX(i), y: getY(key, d[key]) }));
  const buildPath = (key) => smoothLinePath(linePoints(key));
  const buildAreaPath = (key) => {
    const pts = linePoints(key);
    const baseline = PAD.top + cH;
    return `${smoothLinePath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${baseline.toFixed(1)} L${pts[0].x.toFixed(1)},${baseline.toFixed(1)} Z`;
  };

  const bandW = cW / (n - 1);

  const toggleLine = (key) =>
    setActiveLines(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const hovered = hoveredDay !== null ? days[hoveredDay] : null;
  const tooltipX = hoveredDay !== null ? getX(hoveredDay) : 0;
  const tooltipOnRight = tooltipX < W / 2;
  const activeCount = activeLines.length;

  return (
    <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="trending" size={13} /> {t("dashboard.trendTitle")}</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CHART_LINES.map(({ key, color }) => (
            <button key={key} onClick={() => toggleLine(key)}
              style={{ padding: "4px 12px", borderRadius: 20, border: `1px solid ${activeLines.includes(key) ? "transparent" : "var(--ne-border)"}`, fontSize: 10, cursor: "pointer", fontWeight: 600,
                background: activeLines.includes(key) ? color : "var(--ne-surface)",
                color: activeLines.includes(key) ? "#0A0E26" : color, transition: "all 0.15s" }}>
              {t(CHART_LINE_LABEL_KEYS[key])}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--ne-bg)", borderRadius: 10, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}
          onMouseLeave={() => setHoveredDay(null)}>

          <defs>
            {CHART_LINES.map(({ key, color }) => (
              <linearGradient key={key} id={`${gradUid}-${key.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.35" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <line key={t} x1={PAD.left} y1={PAD.top + t * cH} x2={PAD.left + cW} y2={PAD.top + t * cH}
              stroke="#232A52" strokeWidth="0.8" />
          ))}

          {/* X axis labels every 5 days */}
          {days.map((d, i) => (i % 5 === 0 || i === n - 1) && (
            <text key={i} x={getX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#4F567E">{d.label}</text>
          ))}

          {/* Gradient area fill (smooth curve ke neeche) */}
          {CHART_LINES.filter(({ key }) => activeLines.includes(key)).map(({ key }) => (
            <path key={`area-${key}`} d={buildAreaPath(key)} fill={`url(#${gradUid}-${key.replace(/\s+/g, "")})`} stroke="none" />
          ))}

          {/* Smooth curved lines */}
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
                fill={color} stroke="#070A1A" strokeWidth="1.5" />
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
              stroke="#4F567E" strokeWidth="0.8" strokeDasharray="3,2" />
          )}

          {/* Tooltip */}
          {hovered && (
            <g>
              <rect
                x={tooltipOnRight ? tooltipX + 6 : tooltipX - 106}
                y={PAD.top + 2}
                width={100}
                height={14 + activeCount * 14}
                rx={4} fill="#161B45" stroke="#232A52" strokeWidth="0.5" />
              <text x={tooltipOnRight ? tooltipX + 11 : tooltipX - 100} y={PAD.top + 12}
                fontSize="7.5" fill="#8C93C4">{hovered.date}</text>
              {CHART_LINES.filter(({ key }) => activeLines.includes(key)).map(({ key, color }, j) => (
                <text key={key}
                  x={tooltipOnRight ? tooltipX + 11 : tooltipX - 100}
                  y={PAD.top + 24 + j * 13}
                  fontSize="8" fill={color} fontWeight="600">
                  {t(CHART_LINE_LABEL_KEYS[key])}: {key === "Revenue" ? `Rs.${hovered[key].toLocaleString()}` : hovered[key]}
                </text>
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const HOURLY_METRICS = [
  { key: "orders", label: "Orders" },
  { key: "confirmed", label: "Confirmed" },
  { key: "revenue", label: "Revenue" },
];

// Aaj vs Kal ka 24-ghante ka comparison — dateFilter se independent hai (hamesha
// "aaj"/"kal" calendar din dikhata hai), taake Today/Yesterday ka apples-to-apples
// hourly pattern dekha ja sake.
function HourlyComparisonChart({ ordersData }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [metric, setMetric] = useState("orders");
  const gradUid = useId();

  const { todayHours, yestHours } = useMemo(() => {
    const now = new Date();
    const todayStr = ymd(now);
    const yestStr = ymd(new Date(now.getTime() - 86400000));
    const todayHours = Array(24).fill(0);
    const yestHours = Array(24).fill(0);

    (ordersData || []).forEach(o => {
      const d = new Date(o.created_at);
      const dateStr = ymd(d);
      if (dateStr !== todayStr && dateStr !== yestStr) return;
      const hour = d.getHours();
      const value = metric === "revenue" ? Number(o.total_price || 0)
        : metric === "confirmed" ? (o.agent_status === "Approved" ? 1 : 0)
        : 1;
      if (dateStr === todayStr) todayHours[hour] += value;
      else yestHours[hour] += value;
    });

    return { todayHours, yestHours };
  }, [ordersData, metric]);

  const W = 700, H = 190;
  const PAD = { top: 16, right: 8, bottom: 22, left: 8 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const groupW = cW / 24;
  const barW = groupW * 0.32;
  const maxVal = Math.max(...todayHours, ...yestHours, 1);
  const barH = (v) => (v / maxVal) * cH;
  const fmtVal = (v) => metric === "revenue" ? `Rs.${Math.round(v).toLocaleString()}` : Math.round(v);

  const [hoveredHour, setHoveredHour] = useState(null);

  return (
    <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="clock" size={13} /> {t("dashboard.hourlyTitle")}</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {HOURLY_METRICS.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              style={{ padding: "4px 12px", borderRadius: 20, border: `1px solid ${metric === m.key ? "transparent" : "var(--ne-border)"}`, fontSize: 10, cursor: "pointer", fontWeight: 600,
                background: metric === m.key ? "var(--ne-grad)" : "var(--ne-surface)",
                color: metric === m.key ? "#fff" : "var(--ne-muted)", transition: "all 0.15s" }}>
              {t(HOURLY_METRIC_LABEL_KEYS[m.key])}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 10, color: "var(--ne-muted)", fontWeight: 600 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--ne-grad)", display: "inline-block" }} /> {t("dashboard.today")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--ne-border)", display: "inline-block" }} /> {t("dashboard.yesterday")}
        </span>
      </div>

      <div style={{ background: "var(--ne-bg)", borderRadius: 10, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} onMouseLeave={() => setHoveredHour(null)}>
          <defs>
            <linearGradient id={`${gradUid}-bar`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#A855F7" />
              <stop offset="1" stopColor="#5C7CFA" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map(t => (
            <line key={t} x1={PAD.left} y1={PAD.top + t * cH} x2={PAD.left + cW} y2={PAD.top + t * cH}
              stroke="#232A52" strokeWidth="0.8" />
          ))}

          {Array.from({ length: 24 }, (_, h) => {
            const gx = PAD.left + h * groupW;
            const tH = barH(todayHours[h]);
            const yH = barH(yestHours[h]);
            const baseline = PAD.top + cH;
            return (
              <g key={h} onMouseEnter={() => setHoveredHour(h)}>
                <rect x={gx} y={PAD.top} width={groupW} height={cH} fill="transparent" style={{ cursor: "crosshair" }} />
                <rect x={gx + groupW / 2 - barW - 1.5} y={baseline - yH} width={barW} height={yH} rx={2} fill="var(--ne-border)" />
                <rect x={gx + groupW / 2 + 1.5} y={baseline - tH} width={barW} height={tH} rx={2} fill={`url(#${gradUid}-bar)`} />
                {(h % 3 === 0) && (
                  <text x={gx + groupW / 2} y={H - 6} textAnchor="middle" fontSize="7.5" fill="#4F567E">{h}h</text>
                )}
              </g>
            );
          })}

          {hoveredHour !== null && (
            <g>
              {(() => {
                const gx = PAD.left + hoveredHour * groupW;
                const onRight = gx < W / 2;
                const boxX = onRight ? gx + groupW + 4 : gx - 96;
                return (
                  <>
                    <rect x={boxX} y={PAD.top} width={92} height={40} rx={5} fill="#161B45" stroke="#232A52" strokeWidth="0.5" />
                    <text x={boxX + 6} y={PAD.top + 12} fontSize="7.5" fill="#8C93C4">{hoveredHour}:00 - {hoveredHour + 1}:00</text>
                    <text x={boxX + 6} y={PAD.top + 24} fontSize="8" fill="#A855F7" fontWeight="600">{t("dashboard.today")}: {fmtVal(todayHours[hoveredHour])}</text>
                    <text x={boxX + 6} y={PAD.top + 35} fontSize="8" fill="#8C93C4" fontWeight="600">{t("dashboard.yesterday")}: {fmtVal(yestHours[hoveredHour])}</text>
                  </>
                );
              })()}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

export default function Dashboard({ ordersData }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [dateFilter, setDateFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  // ordersData khali ho (naya store, ya orders load na hui hon) to bhi crash na ho —
  // saare downstream computations 0/khali array pe hi default ho jate hain (TASK 21)
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

  const dateFilterLabel = t(DATE_FILTER_LABEL_KEYS[dateFilter] || "dashboard.dateFilter.today");

  const heroChips = [
    { label: t("dashboard.chip.totalOrders"), value: totalOrders },
    { label: t("dashboard.chip.approved"), value: statusCounts["Approved"] || 0 },
    { label: t("dashboard.chip.pending"), value: pendingCount },
    { label: t("dashboard.chip.approvedRevenue"), value: `Rs. ${approvedRevenue.toLocaleString()}` },
    { label: t("dashboard.chip.noStatus"), value: noStatusCount },
  ];

  return (
    <div style={{ padding: "1rem", color: "var(--ne-text)" }}>

      {/* Date Filter */}
      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {DATE_FILTERS.map(f => (
          <button key={f.value} onClick={() => setDateFilter(f.value)}
            style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: dateFilter === f.value ? "transparent" : "var(--ne-border)", fontSize: 11, cursor: "pointer", fontWeight: 700, background: dateFilter === f.value ? "var(--ne-grad)" : "var(--ne-surface-2)", color: dateFilter === f.value ? "#fff" : "var(--ne-muted)" }}>
            {t(DATE_FILTER_LABEL_KEYS[f.value])}
          </button>
        ))}
        {dateFilter === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
          </>
        )}
        <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>{filtered.length} {t("dashboard.ordersSuffix")}</span>
      </div>

      {/* Hero Revenue Card */}
      <div style={{ background: "var(--ne-grad)", borderRadius: 18, padding: "1.4rem", marginBottom: "0.75rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontWeight: 600, marginBottom: 4 }}>
            {dateFilterLabel} {t("dashboard.totalRevenueSuffix")}
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#fff" }}>
            Rs. {totalRevenue.toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {heroChips.map(chip => (
            <div key={chip.label} style={{ background: "rgba(255,255,255,.16)", borderRadius: 10, padding: "8px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{chip.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", fontWeight: 600, whiteSpace: "nowrap" }}>{chip.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Breakdown Grid — saare 11 statuses, soft-background cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.6rem", marginBottom: "0.75rem" }}>
        {STATUSES.map(s => {
          const count = statusCounts[s.label] || 0;
          const p = pct(count);
          return (
            <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "0.7rem" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, marginBottom: 2 }}>{count} ({p}%)</div>
              <div style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Trend Chart */}
      <TrendChart ordersData={ordersData} />

      {/* Hourly Comparison */}
      <HourlyComparisonChart ordersData={ordersData} />

      {/* Status Breakdown + Source */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>

        {/* Status Breakdown */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="chart" size={13} /> {t("dashboard.statusBreakdown")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {STATUSES.map(s => {
              const count = statusCounts[s.label] || 0;
              const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
              return (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: s.color, minWidth: 130, fontWeight: 600 }}>{s.label}</span>
                  <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, background: s.color, height: "100%", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 30, textAlign: "right" }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Breakdown */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="megaphone" size={13} /> {t("dashboard.sourceBreakdown")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
              const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
              const color = SOURCE_COLORS[src] || "var(--ne-muted-2)";
              return (
                <div key={src} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color, minWidth: 70, fontWeight: 600 }}>{src}</span>
                  <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, background: color, height: "100%", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 50, textAlign: "right" }}>{count} ({p}%)</span>
                </div>
              );
            })}
          </div>

          {/* Status remaining */}
          <h2 style={{ margin: "1rem 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="clipboard" size={13} /> {t("dashboard.otherStatuses")}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STATUSES.filter(s => statusCounts[s.label] > 0).map(s => (
              <span key={s.label} style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10, background: s.bg, color: s.color, fontWeight: 600 }}>
                {s.label}: {statusCounts[s.label]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Top Cities + Top SKUs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.75rem" }}>

        {/* Top Cities */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="map" size={13} /> {t("dashboard.topCities")}</h2>
          {topCities.length === 0 ? (
            <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>{t("dashboard.noData")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {topCities.map(([city, count]) => {
                const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={city} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{city}</span>
                    <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 12, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, background: "var(--ne-grad)", height: "100%", borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 60, textAlign: "right", fontWeight: 600 }}>{count} ({p}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top SKUs */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="tag" size={13} /> {t("dashboard.topSkus")}</h2>
          {topSKUs.length === 0 ? (
            <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>{t("dashboard.noData")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {topSKUs.map(([sku, count]) => {
                const p = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
                return (
                  <div key={sku} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sku}</span>
                    <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 12, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, background: "var(--ne-grad)", height: "100%", borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 60, textAlign: "right", fontWeight: 600 }}>{count} ({p}%)</span>
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
