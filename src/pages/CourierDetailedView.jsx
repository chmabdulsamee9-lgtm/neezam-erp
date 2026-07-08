import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getCachedBookedOrders } from "../ordersCache";
import { syncBookedOrdersCache, bucketCourierStatusGranular } from "../bookedOrdersData";

const GRANULAR_KEYS = ["Delivered", "Returned", "Pickup Failed", "Cancelled", "Lost", "In Transit"];
const GRANULAR_COLORS = {
  Delivered: "var(--ne-success)",
  Returned: "var(--ne-danger)",
  "Pickup Failed": "var(--ne-orange)",
  Cancelled: "var(--ne-muted-2)",
  Lost: "var(--ne-accent2)",
  "In Transit": "var(--ne-accent)",
};

const METRIC_OPTIONS = [
  { value: "volume", label: "Order Volume" },
  { value: "rate", label: "Delivery vs Return %" },
  { value: "stacked", label: "All Status Stacked" },
];

const TABS = ["Monthly", "Weekly", "Province"];

function emptyGranularRow() {
  const row = {};
  GRANULAR_KEYS.forEach((k) => { row[k] = 0; });
  return row;
}

function ymKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ymLabel(d) {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Fixed Monday reference (2020-01-06) — poore dataset mein consistent week-boundaries
// milte hain chahe orders kisi bhi mahine/saal ke hon
const WEEK_REF = Date.UTC(2020, 0, 6);
function weekKeyOf(d) {
  const days = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - WEEK_REF) / 86400000);
  return Math.floor(days / 7);
}
function weekLabelOf(weekNum) {
  const start = new Date(WEEK_REF + weekNum * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} - ${fmt(end)}`;
}

function aggregateByPeriod(orders, keyFn, labelFn) {
  const map = {};
  orders.forEach((o) => {
    const ts = o.agent_data.package_created_at;
    if (!ts) return;
    const d = new Date(ts);
    const key = keyFn(d);
    if (!map[key]) map[key] = { key, label: labelFn(d, key), total: 0, ...emptyGranularRow() };
    map[key].total++;
    map[key][bucketCourierStatusGranular(o.agent_data.courier_order_status)]++;
  });
  return Object.values(map).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function aggregateByProvince(orders) {
  const map = {};
  orders.forEach((o) => {
    const province = o.shipping_address?.province;
    if (!province) return;
    if (!map[province]) map[province] = { province, total: 0, ...emptyGranularRow() };
    map[province].total++;
    map[province][bucketCourierStatusGranular(o.agent_data.courier_order_status)]++;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

const rateColor = (rate) => (rate >= 65 ? "var(--ne-success)" : rate >= 50 ? "var(--ne-warning)" : "var(--ne-danger)");

// Metric-aware stacked/simple bar chart — Monthly aur Weekly section dono is ek hi
// component ko reuse karte hain (sirf data alag hota hai)
function PeriodBarChart({ rows, metric }) {
  const W = 700, H = 220;
  const PAD = { top: 20, right: 10, bottom: 30, left: 10 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = Math.max(rows.length, 1);
  const bandW = cW / n;
  const barW = bandW * 0.6;
  const baseline = PAD.top + cH;

  const others = (r) => r["Pickup Failed"] + r.Cancelled + r.Lost + r["In Transit"];
  const maxVal = metric === "rate" ? 100 : Math.max(...rows.map((r) => (metric === "stacked" ? r.total : r.total)), 1);
  const scaleY = (v) => (v / maxVal) * cH;

  const legend = metric === "rate"
    ? [{ key: "Delivered", color: "var(--ne-success)" }, { key: "Returned", color: "var(--ne-danger)" }, { key: "Others", color: "var(--ne-muted-2)" }]
    : metric === "stacked"
    ? GRANULAR_KEYS.map((k) => ({ key: k, color: GRANULAR_COLORS[k] }))
    : [{ key: "Total Orders", color: "var(--ne-accent)" }];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 10, color: "var(--ne-muted)", fontWeight: 600, flexWrap: "wrap" }}>
        {legend.map((l) => (
          <span key={l.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: l.color, display: "inline-block" }} /> {l.key}
          </span>
        ))}
      </div>
      <div style={{ background: "var(--ne-bg)", borderRadius: 10, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1={PAD.left} y1={PAD.top + t * cH} x2={PAD.left + cW} y2={PAD.top + t * cH} stroke="#232A52" strokeWidth="0.8" />
          ))}
          {rows.map((r, i) => {
            const x = PAD.left + i * bandW + (bandW - barW) / 2;
            let yCursor = baseline;
            let segments;
            if (metric === "volume") {
              segments = [{ key: "Total Orders", value: r.total, color: "var(--ne-accent)" }];
            } else if (metric === "rate") {
              const otherCount = others(r);
              const pctD = r.total ? (r.Delivered / r.total) * 100 : 0;
              const pctR = r.total ? (r.Returned / r.total) * 100 : 0;
              const pctO = r.total ? (otherCount / r.total) * 100 : 0;
              segments = [
                { key: "Delivered", value: pctD, color: "var(--ne-success)" },
                { key: "Returned", value: pctR, color: "var(--ne-danger)" },
                { key: "Others", value: pctO, color: "var(--ne-muted-2)" },
              ];
            } else {
              segments = GRANULAR_KEYS.map((k) => ({ key: k, value: r[k], color: GRANULAR_COLORS[k] }));
            }
            return (
              <g key={r.key ?? r.province}>
                {segments.map((s) => {
                  const h = scaleY(s.value);
                  yCursor -= h;
                  return <rect key={s.key} x={x} y={yCursor} width={barW} height={h} fill={s.color} />;
                })}
                {(rows.length <= 20 || i % Math.ceil(rows.length / 15) === 0) && (
                  <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="7.5" fill="#4F567E">{r.label}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function GranularTable({ rows, periodLabel }) {
  const th = { padding: "7px 8px", textAlign: "left", color: "var(--ne-muted)", whiteSpace: "nowrap", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--ne-border)" };
  const td = { padding: "7px 8px", fontSize: 11.5, color: "var(--ne-text)", whiteSpace: "nowrap" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <thead>
          <tr>
            <th style={th}>{periodLabel}</th>
            <th style={th}>Total</th>
            <th style={th}>Delivered</th>
            <th style={th}>Returned</th>
            <th style={th}>Pickup Failed</th>
            <th style={th}>Cancelled</th>
            <th style={th}>Lost</th>
            <th style={th}>Delivery Rate</th>
            <th style={th}>Return Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dRate = r.total ? Math.round((r.Delivered / r.total) * 100) : 0;
            const rRate = r.total ? Math.round((r.Returned / r.total) * 100) : 0;
            return (
              <tr key={r.key} style={{ borderBottom: "1px solid var(--ne-border)" }}>
                <td style={{ ...td, fontWeight: 700 }}>{r.label}</td>
                <td style={td}>{r.total}</td>
                <td style={{ ...td, color: "var(--ne-success)" }}>{r.Delivered}</td>
                <td style={{ ...td, color: "var(--ne-danger)" }}>{r.Returned}</td>
                <td style={{ ...td, color: "var(--ne-orange)" }}>{r["Pickup Failed"]}</td>
                <td style={{ ...td, color: "var(--ne-muted-2)" }}>{r.Cancelled}</td>
                <td style={{ ...td, color: "var(--ne-accent2)" }}>{r.Lost}</td>
                <td style={{ ...td, color: rateColor(dRate), fontWeight: 700 }}>{dRate}%</td>
                <td style={{ ...td, color: "var(--ne-danger)", fontWeight: 700 }}>{rRate}%</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "var(--ne-muted-2)" }}>Koi data nahi</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function CourierDetailedView({ storeId }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("Monthly");
  const [metric, setMetric] = useState("volume");

  useEffect(() => {
    if (storeId) loadBooked();
  }, [storeId]);

  // BookedOrders.jsx/CourierDashboard.jsx wala exact pattern: cache mein data ho to
  // FORAN dikhao, warna syncBookedOrdersCache() (bookedOrdersData.js) full-load karega
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
          .catch((err) => console.log("Detailed view delta sync error:", err.message));
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

  const monthlyRows = useMemo(() => aggregateByPeriod(orders, ymKey, ymLabel), [orders]);
  const weeklyRows = useMemo(() => aggregateByPeriod(orders, weekKeyOf, (_, key) => weekLabelOf(key)), [orders]);
  const provinceRows = useMemo(() => aggregateByProvince(orders), [orders]);

  const maxProvinceTotal = Math.max(...provinceRows.map((p) => p.total), 1);

  if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "var(--ne-muted)" }}>Loading courier data...</div>;
  if (errorMsg) return <div style={{ padding: "1.5rem", color: "var(--ne-danger)", fontSize: 13 }}>{errorMsg}</div>;

  return (
    <div style={{ padding: "1rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate("/courier-dashboard")}
            style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 12, cursor: "pointer" }}>
            ← Back
          </button>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>📊 Courier Detailed Analysis</h1>
        </div>
        {activeTab !== "Province" && (
          <select value={metric} onChange={(e) => setMetric(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
            {METRIC_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "7px 16px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab ? "transparent" : "var(--ne-border)",
              background: activeTab === tab ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted)" }}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Monthly" && (
        <>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📦 Monthly Analysis</h2>
            <PeriodBarChart rows={monthlyRows} metric={metric} />
          </div>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
            <GranularTable rows={monthlyRows} periodLabel="Month" />
          </div>
        </>
      )}

      {activeTab === "Weekly" && (
        <>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📅 Weekly Performance</h2>
            <PeriodBarChart rows={weeklyRows} metric={metric} />
          </div>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
            <GranularTable rows={weeklyRows} periodLabel="Week" />
          </div>
        </>
      )}

      {activeTab === "Province" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📍 Orders by Province</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {provinceRows.map((p) => (
                  <div key={p.province} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{p.province}</span>
                    <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                      <div style={{ width: `${(p.total / maxProvinceTotal) * 100}%`, background: "var(--ne-grad)", height: "100%", borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 30, textAlign: "right", fontWeight: 600 }}>{p.total}</span>
                  </div>
                ))}
                {provinceRows.length === 0 && <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi data nahi</p>}
              </div>
            </div>
            <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>✅ Delivery Rate by Province</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {provinceRows.map((p) => {
                  const rate = p.total ? Math.round((p.Delivered / p.total) * 100) : 0;
                  return (
                    <div key={p.province} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{p.province}</span>
                      <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                        <div style={{ width: `${rate}%`, background: rateColor(rate), height: "100%", borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 11, color: rateColor(rate), minWidth: 35, textAlign: "right", fontWeight: 700 }}>{rate}%</span>
                    </div>
                  );
                })}
                {provinceRows.length === 0 && <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi data nahi</p>}
              </div>
            </div>
          </div>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr>
                    {["Province", "Total", "Delivered", "Returned", "Pickup Failed", "Lost", "In Transit", "Delivery Rate", "Return Rate"].map((h) => (
                      <th key={h} style={{ padding: "7px 8px", textAlign: "left", color: "var(--ne-muted)", whiteSpace: "nowrap", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--ne-border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {provinceRows.map((p) => {
                    const dRate = p.total ? Math.round((p.Delivered / p.total) * 100) : 0;
                    const rRate = p.total ? Math.round((p.Returned / p.total) * 100) : 0;
                    const td = { padding: "7px 8px", fontSize: 11.5, color: "var(--ne-text)", whiteSpace: "nowrap" };
                    return (
                      <tr key={p.province} style={{ borderBottom: "1px solid var(--ne-border)" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{p.province}</td>
                        <td style={td}>{p.total}</td>
                        <td style={{ ...td, color: "var(--ne-success)" }}>{p.Delivered}</td>
                        <td style={{ ...td, color: "var(--ne-danger)" }}>{p.Returned}</td>
                        <td style={{ ...td, color: "var(--ne-orange)" }}>{p["Pickup Failed"]}</td>
                        <td style={{ ...td, color: "var(--ne-accent2)" }}>{p.Lost}</td>
                        <td style={{ ...td, color: "var(--ne-accent)" }}>{p["In Transit"]}</td>
                        <td style={{ ...td, color: rateColor(dRate), fontWeight: 700 }}>{dRate}%</td>
                        <td style={{ ...td, color: "var(--ne-danger)", fontWeight: 700 }}>{rRate}%</td>
                      </tr>
                    );
                  })}
                  {provinceRows.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: "7px 8px", fontSize: 11.5, textAlign: "center", color: "var(--ne-muted-2)" }}>Koi data nahi</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
