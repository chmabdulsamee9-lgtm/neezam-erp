import { useState, useEffect, useMemo, useId } from "react";
import { useNavigate } from "react-router-dom";
import { getCachedBookedOrders } from "../ordersCache";
import { syncBookedOrdersCache, bucketCourierStatusGranular, DATE_FILTERS, getDateRange } from "../bookedOrdersData";

// Status Funnel donut ke 6-category palette — Aurora Ledger vars se
const GRANULAR_COLORS = {
  Delivered: "var(--ne-success)",
  Returned: "var(--ne-danger)",
  "Pickup Failed": "var(--ne-orange)",
  Cancelled: "var(--ne-muted-2)",
  Lost: "var(--ne-accent2)",
  "In Transit": "var(--ne-accent)",
};

// Courier company brand colors — BookedOrders.jsx ke COURIER_COLORS se consistent
const COURIER_COLORS = {
  "PK-DEX": "#5C7CFA",
  "PK-LCS": "#34D88E",
  "PK-TCS": "#FB923C",
  "PK-TRAX": "#3B82F6",
  "PK-MNP-API": "#A855F7",
};
const courierColor = (name) => COURIER_COLORS[name] || "#8C93C4";

// BookedOrders.jsx ke bucketCourierStatus() jaisa hi — dono pages ki counting consistent rehni
// chahiye (agar BookedOrders "5 Failed Delivery" dikhaye to Dashboard bhi wahi 5 dikhaye)
function bucketCourierStatus(raw) {
  const s = (raw || "").toLowerCase();
  if (!s) return "In Transit";
  if (s.includes("return")) return "Returned";
  if (s.includes("fail")) return "Failed Delivery";
  if (s.includes("deliver")) return "Delivered";
  return "In Transit";
}

const fmtHours = (h) => {
  if (h == null || isNaN(h)) return "—";
  const days = Math.floor(h / 24);
  const hrs = Math.round(h % 24);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${h.toFixed(1)}h`;
};

// Catmull-Rom -> cubic-bezier — Dashboard.jsx ke Phase 7 Trend Chart jaisa smooth curve
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

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function DeliveredVsReturnedChart({ orders }) {
  const gradUid = useId();
  const [hoveredDay, setHoveredDay] = useState(null);

  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 30 }, (_, idx) => {
      const i = 29 - idx;
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStr = ymd(d);
      const delivered = orders.filter((o) => o.agent_data.delivered_at && ymd(new Date(o.agent_data.delivered_at)) === dayStr).length;
      const returned = orders.filter((o) => o.agent_data.return_success_at && ymd(new Date(o.agent_data.return_success_at)) === dayStr).length;
      return { date: dayStr, label: `${d.getMonth() + 1}/${d.getDate()}`, Delivered: delivered, Returned: returned };
    });
  }, [orders]);

  const W = 700, H = 200;
  const PAD = { top: 20, right: 20, bottom: 25, left: 10 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = days.length;
  const getX = (i) => PAD.left + (i / (n - 1)) * cW;
  const maxVal = Math.max(...days.map((d) => Math.max(d.Delivered, d.Returned)), 1);
  const getY = (val) => PAD.top + cH - (val / maxVal) * cH;
  const bandW = cW / (n - 1);

  const LINES = [
    { key: "Delivered", color: "#34D88E" },
    { key: "Returned", color: "#F26D6D" },
  ];
  const linePoints = (key) => days.map((d, i) => ({ x: getX(i), y: getY(d[key]) }));
  const buildPath = (key) => smoothLinePath(linePoints(key));
  const buildAreaPath = (key) => {
    const pts = linePoints(key);
    const baseline = PAD.top + cH;
    return `${smoothLinePath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${baseline.toFixed(1)} L${pts[0].x.toFixed(1)},${baseline.toFixed(1)} Z`;
  };

  const hovered = hoveredDay !== null ? days[hoveredDay] : null;
  const tooltipX = hoveredDay !== null ? getX(hoveredDay) : 0;
  const tooltipOnRight = tooltipX < W / 2;

  return (
    <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📈 Delivered vs Returned — Last 30 Days</h2>
      <div style={{ background: "var(--ne-bg)", borderRadius: 10, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} onMouseLeave={() => setHoveredDay(null)}>
          <defs>
            {LINES.map(({ key, color }) => (
              <linearGradient key={key} id={`${gradUid}-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.35" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line key={t} x1={PAD.left} y1={PAD.top + t * cH} x2={PAD.left + cW} y2={PAD.top + t * cH} stroke="#232A52" strokeWidth="0.8" />
          ))}
          {days.map((d, i) => (i % 5 === 0 || i === n - 1) && (
            <text key={i} x={getX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#4F567E">{d.label}</text>
          ))}
          {LINES.map(({ key }) => (
            <path key={`area-${key}`} d={buildAreaPath(key)} fill={`url(#${gradUid}-${key})`} stroke="none" />
          ))}
          {LINES.map(({ key, color }) => (
            <path key={key} d={buildPath(key)} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {LINES.map(({ key, color }) =>
            days.map((d, i) => (
              <circle key={`${key}-${i}`} cx={getX(i)} cy={getY(d[key])} r={hoveredDay === i ? 4 : 2.5} fill={color} stroke="#070A1A" strokeWidth="1.5" />
            ))
          )}
          {days.map((_, i) => {
            const x = i === 0 ? PAD.left : getX(i) - bandW / 2;
            const w = i === 0 || i === n - 1 ? bandW / 2 : bandW;
            return <rect key={i} x={x} y={PAD.top} width={w} height={cH} fill="transparent" style={{ cursor: "crosshair" }} onMouseEnter={() => setHoveredDay(i)} />;
          })}
          {hovered && <line x1={tooltipX} y1={PAD.top} x2={tooltipX} y2={PAD.top + cH} stroke="#4F567E" strokeWidth="0.8" strokeDasharray="3,2" />}
          {hovered && (
            <g>
              <rect x={tooltipOnRight ? tooltipX + 6 : tooltipX - 96} y={PAD.top + 2} width={90} height={42} rx={4} fill="#161B45" stroke="#232A52" strokeWidth="0.5" />
              <text x={tooltipOnRight ? tooltipX + 11 : tooltipX - 90} y={PAD.top + 12} fontSize="7.5" fill="#8C93C4">{hovered.date}</text>
              <text x={tooltipOnRight ? tooltipX + 11 : tooltipX - 90} y={PAD.top + 24} fontSize="8" fill="#34D88E" fontWeight="600">Delivered: {hovered.Delivered}</text>
              <text x={tooltipOnRight ? tooltipX + 11 : tooltipX - 90} y={PAD.top + 36} fontSize="8" fill="#F26D6D" fontWeight="600">Returned: {hovered.Returned}</text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// Center-hole donut chart via SVG stroke-dasharray segments — legend side mein
function StatusDonut({ segments }) {
  const size = 168, strokeWidth = 26, r = (size - strokeWidth) / 2, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let cumulative = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ne-border)" strokeWidth={strokeWidth} />
          {segments.filter((s) => s.value > 0).map((seg) => {
            const frac = seg.value / total;
            const dash = frac * circumference;
            const gap = circumference - dash;
            const offset = -cumulative;
            cumulative += dash;
            return (
              <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${gap}`} strokeDashoffset={offset} />
            );
          })}
        </g>
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--ne-text)">{total}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize="9" fill="var(--ne-muted)">Total</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {segments.map((seg) => {
          const p = total ? Math.round((seg.value / total) * 100) : 0;
          return (
            <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: seg.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "var(--ne-text)", fontWeight: 600, minWidth: 90 }}>{seg.label}</span>
              <span style={{ color: "var(--ne-muted)" }}>{seg.value} ({p}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Date-filter se EXCLUDE hota hai (hamesha all-time, last 12 months) — package_created_at
// se group karta hai, granular status ko Delivered/Returned/Others mein collapse karta hai
function MonthlyVolumeChart({ orders }) {
  const months = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, Delivered: 0, Returned: 0, Others: 0 });
    }
    const keyToIdx = {};
    buckets.forEach((b, i) => { keyToIdx[b.key] = i; });

    orders.forEach((o) => {
      const ts = o.agent_data.package_created_at;
      if (!ts) return;
      const d = new Date(ts);
      const idx = keyToIdx[`${d.getFullYear()}-${d.getMonth()}`];
      if (idx === undefined) return;
      const bucket = bucketCourierStatusGranular(o.agent_data.courier_order_status);
      if (bucket === "Delivered") buckets[idx].Delivered++;
      else if (bucket === "Returned") buckets[idx].Returned++;
      else buckets[idx].Others++;
    });
    return buckets;
  }, [orders]);

  const W = 700, H = 220;
  const PAD = { top: 20, right: 10, bottom: 30, left: 10 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const bandW = cW / months.length;
  const barW = bandW * 0.55;
  const maxVal = Math.max(...months.map((m) => m.Delivered + m.Returned + m.Others), 1);
  const scaleY = (v) => (v / maxVal) * cH;

  const STACK_KEYS = [
    { key: "Delivered", color: "var(--ne-success)" },
    { key: "Returned", color: "var(--ne-danger)" },
    { key: "Others", color: "var(--ne-muted-2)" },
  ];

  return (
    <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📦 Monthly Order Volume (All-Time)</h2>
      <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 10, color: "var(--ne-muted)", fontWeight: 600 }}>
        {STACK_KEYS.map((s) => (
          <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, display: "inline-block" }} /> {s.key}
          </span>
        ))}
      </div>
      <div style={{ background: "var(--ne-bg)", borderRadius: 10, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1={PAD.left} y1={PAD.top + t * cH} x2={PAD.left + cW} y2={PAD.top + t * cH} stroke="#232A52" strokeWidth="0.8" />
          ))}
          {months.map((m, i) => {
            const x = PAD.left + i * bandW + (bandW - barW) / 2;
            const baseline = PAD.top + cH;
            let yCursor = baseline;
            return (
              <g key={m.key}>
                {STACK_KEYS.map((s) => {
                  const h = scaleY(m[s.key]);
                  yCursor -= h;
                  return <rect key={s.key} x={x} y={yCursor} width={barW} height={h} fill={s.color} />;
                })}
                <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="8" fill="#4F567E">{m.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Delivered vs Returned per province — shipping_address.province (Shopify ka apna field;
// manual/unmatched orders is chart mein shamil nahi ho sakte, unka koi Shopify address nahi)
function ProvinceDistribution({ orders }) {
  const provinces = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const province = o.shipping_address?.province;
      if (!province) return;
      if (!map[province]) map[province] = { total: 0, delivered: 0, returned: 0 };
      map[province].total++;
      const bucket = bucketCourierStatusGranular(o.agent_data.courier_order_status);
      if (bucket === "Delivered") map[province].delivered++;
      else if (bucket === "Returned") map[province].returned++;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([province, v]) => ({ province, ...v }));
  }, [orders]);

  const maxTotal = Math.max(...provinces.map((p) => p.total), 1);

  return (
    <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
      <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📍 Province Distribution</h2>
      {provinces.length === 0 ? (
        <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi province data nahi mila (manual/unmatched orders is chart mein shamil nahi)</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {provinces.map((p) => {
            const deliveredW = (p.delivered / maxTotal) * 100;
            const returnedW = (p.returned / maxTotal) * 100;
            return (
              <div key={p.province} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{p.province}</span>
                <div style={{ flex: 1, display: "flex", gap: 2, height: 12 }}>
                  <div style={{ width: `${deliveredW}%`, background: "var(--ne-success)", borderRadius: 999 }} />
                  <div style={{ width: `${returnedW}%`, background: "var(--ne-danger)", borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 130, textAlign: "right", fontWeight: 600 }}>
                  {p.delivered}D / {p.returned}R / {p.total}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CourierDashboard({ storeId }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [dateFilter, setDateFilter] = useState("30days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) loadBooked();
  }, [storeId]);

  // App.jsx ka background preload agar pehle hi cache warm kar chuka ho, to yahan turant
  // (spinner ke bina) dikhega — warna yehi function full-load karega. syncBookedOrdersCache()
  // (src/bookedOrdersData.js) hi asal fetch/merge/cache-write karta hai, App.jsx ka
  // fire-and-forget preload bhi isi function ko use karta hai — dono jagah same logic.
  const loadBooked = async () => {
    setErrorMsg("");
    try {
      const cached = await getCachedBookedOrders();
      const cachedForStore = cached.filter((o) => o.agent_data?.store_id === storeId);

      if (cachedForStore.length > 0) {
        setOrders(cachedForStore);
        setLoading(false);
        syncBookedOrdersCache(storeId)
          .then(({ rows }) => {
            if (rows.length === 0) return;
            setOrders((prev) => {
              const map = {};
              prev.forEach((o) => { map[o.id] = o; });
              rows.forEach((o) => { map[o.id] = o; });
              return Object.values(map);
            });
          })
          .catch((err) => console.log("Booked delta sync error:", err.message));
        return;
      }

      setLoading(true);
      const { rows } = await syncBookedOrdersCache(storeId);
      setOrders(rows);
    } catch (err) {
      setErrorMsg(err.message);
    }
    setLoading(false);
  };

  // Top-level date filter — logistics_status_at se (yeh field har order pe set hota hai
  // jab bhi koi courier update aaye, live ya Excel dono se — delivered_at sirf delivered
  // orders pe hota, returned/in-transit orders filter se ghayab ho jaate)
  const dateFilteredOrders = useMemo(() => {
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    return orders.filter((o) => {
      const ts = o.agent_data.logistics_status_at;
      if (!ts) return false;
      const d = new Date(ts);
      return d >= from && d < to;
    });
  }, [orders, dateFilter, customFrom, customTo]);

  const stats = useMemo(() => {
    const total = dateFilteredOrders.length;
    const buckets = dateFilteredOrders.map((o) => bucketCourierStatus(o.agent_data.courier_order_status));
    const delivered = buckets.filter((b) => b === "Delivered").length;
    const returned = buckets.filter((b) => b === "Returned").length;
    const failed = buckets.filter((b) => b === "Failed Delivery").length;
    const inTransit = buckets.filter((b) => b === "In Transit").length;
    const successRate = total ? Math.round((delivered / total) * 100) : 0;

    const attemptCounts = dateFilteredOrders.map((o) => Number(o.agent_data.delivery_attempt_count) || 0);
    const avgAttempts = attemptCounts.length ? attemptCounts.reduce((a, b) => a + b, 0) / attemptCounts.length : 0;

    // Status Funnel donut — granular 6-category bucketing (courier_order_status se)
    const granularCounts = {};
    dateFilteredOrders.forEach((o) => {
      const bucket = bucketCourierStatusGranular(o.agent_data.courier_order_status);
      granularCounts[bucket] = (granularCounts[bucket] || 0) + 1;
    });
    const donutSegments = Object.keys(GRANULAR_COLORS).map((label) => ({ label, value: granularCounts[label] || 0, color: GRANULAR_COLORS[label] }));

    // Delivery Speed — pickup_success_at -> delivered_at duration, sirf delivered orders
    const speedBuckets = { "1-2 Days": 0, "3-5 Days": 0, "6+ Days": 0 };
    let speedCounted = 0;
    dateFilteredOrders.forEach((o) => {
      const ad = o.agent_data;
      if (ad.delivered_at && ad.pickup_success_at) {
        const days = (new Date(ad.delivered_at) - new Date(ad.pickup_success_at)) / 86400000;
        if (days < 0) return;
        speedCounted++;
        if (days <= 2) speedBuckets["1-2 Days"]++;
        else if (days <= 5) speedBuckets["3-5 Days"]++;
        else speedBuckets["6+ Days"]++;
      }
    });

    const courierCounts = {};
    dateFilteredOrders.forEach((o) => {
      const courier = o.agent_data.courier_name || "Unknown";
      courierCounts[courier] = (courierCounts[courier] || 0) + 1;
    });
    const courierSplit = Object.entries(courierCounts).sort((a, b) => b[1] - a[1]);

    const reasonCounts = {};
    dateFilteredOrders.forEach((o) => {
      const reason = o.agent_data.latest_fail_reason;
      if (reason) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });
    const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const cityMap = {};
    dateFilteredOrders.forEach((o) => {
      const city = o.agent_data.city || o.shipping_address?.city || "Unknown";
      if (!cityMap[city]) cityMap[city] = { total: 0, delivered: 0 };
      cityMap[city].total++;
      if (o.agent_data.delivered_at) cityMap[city].delivered++;
    });
    const topCities = Object.entries(cityMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([city, v]) => ({ city, ...v, rate: v.total ? Math.round((v.delivered / v.total) * 100) : 0 }));

    return { total, delivered, returned, failed, inTransit, successRate, avgAttempts, donutSegments, speedBuckets, speedCounted, courierSplit, topReasons, topCities };
  }, [dateFilteredOrders]);

  if (loading) {
    return <div style={{ padding: "3rem", textAlign: "center", color: "var(--ne-muted)" }}>Loading courier data...</div>;
  }
  if (errorMsg) {
    return <div style={{ padding: "1.5rem", color: "var(--ne-danger)", fontSize: 13 }}>{errorMsg}</div>;
  }
  // Truly no data ever (vs. no data in the current date-filter window, jo neeche
  // "Status Funnel" wala hissa handle karta hai) — sirf tab onboarding message
  if (orders.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
        <p>Abhi koi booked shipment nahi mili. "Courier Connect" page se Excel upload karo ya live Dex se shipment banao.</p>
      </div>
    );
  }

  const heroChips = [
    { label: "Total Shipments", value: stats.total },
    { label: "Delivered", value: stats.delivered },
    { label: "Returned/Failed", value: stats.returned + stats.failed },
    { label: "In Transit", value: stats.inTransit },
    { label: "Avg Attempts", value: stats.avgAttempts.toFixed(1) },
  ];

  const kpiCards = [
    { label: "Delivered", value: stats.delivered, color: "var(--ne-success)" },
    { label: "Returned", value: stats.returned, color: "var(--ne-danger)" },
    { label: "In Transit", value: stats.inTransit, color: "var(--ne-accent)" },
    { label: "Failed", value: stats.failed, color: "var(--ne-orange)" },
  ];

  return (
    <div style={{ padding: "1rem", color: "var(--ne-text)" }}>
      {/* Header + Date Filter + Detailed View button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          {DATE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setDateFilter(f.value)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: dateFilter === f.value ? "transparent" : "var(--ne-border)", fontSize: 11, cursor: "pointer", fontWeight: 700, background: dateFilter === f.value ? "var(--ne-grad)" : "var(--ne-surface-2)", color: dateFilter === f.value ? "#fff" : "var(--ne-muted)" }}>
              {f.label}
            </button>
          ))}
          {dateFilter === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
            </>
          )}
        </div>
        <button onClick={() => navigate("/courier-dashboard/detailed")}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          📊 Detailed View
        </button>
      </div>

      {stats.total === 0 ? (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)", marginBottom: "0.75rem" }}>
          Is date range mein koi shipment nahi mili.
        </div>
      ) : (
        <>
          {/* Hero */}
          <div style={{ background: "var(--ne-grad)", borderRadius: 18, padding: "1.4rem", marginBottom: "0.75rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontWeight: 600, marginBottom: 4 }}>Overall Delivery Success Rate</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#fff" }}>{stats.successRate}%</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {heroChips.map((chip) => (
                <div key={chip.label} style={{ background: "rgba(255,255,255,.16)", borderRadius: 10, padding: "8px 14px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{chip.value}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", fontWeight: 600, whiteSpace: "nowrap" }}>{chip.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: "0.6rem", marginBottom: "0.75rem" }}>
            {kpiCards.map((k) => {
              const p = stats.total ? Math.round((k.value / stats.total) * 100) : 0;
              return (
                <div key={k.label} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderLeft: `4px solid ${k.color}`, borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: "var(--ne-muted)", fontWeight: 600, marginTop: 2 }}>{k.label} ({p}%)</div>
                </div>
              );
            })}
          </div>

          {/* Trend Chart */}
          <DeliveredVsReturnedChart orders={dateFilteredOrders} />

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            {/* Status Funnel — donut chart */}
            <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📋 Status Funnel</h2>
              <StatusDonut segments={stats.donutSegments} />
            </div>

            {/* Delivery Speed */}
            <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>⏱️ Delivery Speed</h2>
              {stats.speedCounted === 0 ? (
                <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi delivered order nahi (dono timestamps chahiye)</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[
                    { label: "1-2 Days", color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
                    { label: "3-5 Days", color: "var(--ne-warning)", bg: "var(--ne-warning-soft)" },
                    { label: "6+ Days", color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
                  ].map((b) => {
                    const count = stats.speedBuckets[b.label];
                    const p = stats.speedCounted ? Math.round((count / stats.speedCounted) * 100) : 0;
                    return (
                      <div key={b.label} style={{ background: b.bg, borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: b.color }}>{count}</div>
                        <div style={{ fontSize: 9.5, color: b.color, fontWeight: 600, marginTop: 2 }}>{b.label}</div>
                        <div style={{ fontSize: 9, color: "var(--ne-muted)", marginTop: 1 }}>{p}%</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            {/* Courier Split */}
            <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>🚚 Courier Split</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {stats.courierSplit.map(([courier, count]) => {
                  const p = stats.total ? Math.round((count / stats.total) * 100) : 0;
                  const color = courierColor(courier);
                  return (
                    <div key={courier} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${color}22`, color, minWidth: 90, textAlign: "center" }}>{courier}</span>
                      <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                        <div style={{ width: `${p}%`, background: color, height: "100%", borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 55, textAlign: "right", fontWeight: 600 }}>{count} ({p}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Failed Delivery Reasons */}
            <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>⚠️ Failed Delivery Reasons</h2>
              {stats.topReasons.length === 0 ? (
                <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi failed-attempt data nahi</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {stats.topReasons.map(([reason, count]) => {
                    const p = stats.total ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={reason} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{reason}</span>
                        <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                          <div style={{ width: `${p}%`, background: "linear-gradient(90deg, var(--ne-orange) 0%, var(--ne-danger) 100%)", height: "100%", borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 30, textAlign: "right", fontWeight: 600 }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* City Performance */}
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>🗺️ City Performance</h2>
            {stats.topCities.length === 0 ? (
              <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi data nahi</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {stats.topCities.map(({ city, total, delivered, rate }) => {
                  const rateColor = rate >= 65 ? "var(--ne-success)" : rate >= 50 ? "var(--ne-warning)" : "var(--ne-danger)";
                  return (
                    <div key={city} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{city}</span>
                      <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 12, overflow: "hidden" }}>
                        <div style={{ width: `${rate}%`, background: rateColor, height: "100%", borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 11, color: rateColor, minWidth: 130, textAlign: "right", fontWeight: 700 }}>
                        {delivered}/{total} delivered ({rate}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Province Distribution */}
          <ProvinceDistribution orders={dateFilteredOrders} />
        </>
      )}

      {/* Monthly Order Volume — date-filter se EXCLUDE, hamesha all-time */}
      <MonthlyVolumeChart orders={orders} />
    </div>
  );
}
