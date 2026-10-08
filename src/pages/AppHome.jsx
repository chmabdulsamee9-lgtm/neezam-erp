import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabase";
import { useLanguage, useTranslation } from "../i18n";
import { DATE_FILTERS } from "../bookedOrdersData";
import Icon from "../components/Icon";
import { Sparkline, TrendChart } from "../components/HomeCharts";

const DATE_FILTER_LABEL_KEYS = {
  today: "dashboard.dateFilter.today",
  yesterday: "dashboard.dateFilter.yesterday",
  "7days": "dashboard.dateFilter.7days",
  "30days": "dashboard.dateFilter.30days",
  custom: "dashboard.dateFilter.custom",
};

const METRICS = [
  { key: "orders", labelKey: "home.stat.orders", kind: "num", color: "var(--ne-accent)" },
  { key: "sales", labelKey: "home.stat.totalSales", kind: "money", color: "var(--ne-accent2)" },
  { key: "approved", labelKey: "home.stat.approved", kind: "num", color: "var(--ne-success)" },
  { key: "dispatched", labelKey: "home.stat.dispatched", kind: "num", color: "var(--ne-accent)" },
  { key: "delivered", labelKey: "home.stat.delivered", kind: "num", color: "var(--ne-success)" },
  { key: "returned", labelKey: "home.stat.returned", kind: "num", color: "var(--ne-danger)", invert: true },
];

const TODO_ROWS = [
  { key: "pending_confirmation", labelKey: "home.todo.pendingConfirm", noteKey: "home.todo.last30", menu: "orders" },
  { key: "ready_for_booking", labelKey: "home.todo.readyForBooking", menu: "courier", open: { tab: "Ready for Booking" } },
  { key: "shipper_advice", labelKey: "home.todo.shipperAdvice", menu: "courier", open: { tab: "Shipper Remarks", sub: "Shipper Advice" } },
  { key: "attempt_failed", labelKey: "home.todo.attemptFailed", menu: "courier", open: { tab: "Shipper Remarks", sub: "Delivery Attempt Failed" } },
  { key: "aging", labelKey: "home.todo.aging", menu: "courier", open: { tab: "Shipper Remarks", sub: "Aging Orders" } },
];

const pill = (active) => ({
  padding: "6px 14px", borderRadius: 20, border: "1px solid",
  borderColor: active ? "transparent" : "var(--ne-border)", fontSize: 11, cursor: "pointer", fontWeight: 700,
  background: active ? "var(--ne-grad)" : "var(--ne-surface-2)", color: active ? "#fff" : "var(--ne-muted)",
});

const dateInput = {
  padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)",
  background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5,
};

const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14 };

const num = (v) => Number(v || 0);
const fmtValue = (kind, v) => (kind === "money" ? `Rs. ${Math.round(num(v)).toLocaleString()}` : Math.round(num(v)).toLocaleString());

function changeOf(cur, prev) {
  const c = num(cur), p = num(prev);
  if (!p) return c ? { isNew: true } : null;
  return { pct: Math.round(((c - p) / p) * 100) };
}

function buildLabels(start, stepSecs, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(start || "");
  if (!m) return Array.from({ length: n }, (_, i) => String(i + 1));
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base + i * stepSecs * 1000);
    if (stepSecs < 86400) {
      const h = d.getUTCHours();
      return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    }
    return `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
  });
}

export default function AppHome({ storeId, storeName, apiBase, fetcher, onNavigate, canOpen }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [preset, setPreset] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState("orders");
  const reqId = useRef(0);

  useEffect(() => { setData(null); }, [storeId]);

  const load = useCallback(async () => {
    if (!storeId) return;
    if (preset === "custom" && (!customFrom || !customTo)) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetcher(`${apiBase}/home-overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId, preset,
          from: preset === "custom" ? customFrom : null,
          to: preset === "custom" ? customTo : null,
        }),
      });
      const json = await res.json();
      if (myReq !== reqId.current) return; // purani request ka jawab ignore
      if (!res.ok || !json.overview) throw new Error(json.error || "home-overview fail");
      setData(json.overview);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(true);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [storeId, apiBase, fetcher, preset, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? t("home.greet.morning") : hour < 17 ? t("home.greet.afternoon") : t("home.greet.evening");
  const vsNote = preset === "today" ? t("home.vsSameTime") : preset === "yesterday" ? t("home.vsDayBefore") : t("home.vsPrevPeriod");

  const series = data?.series || {};
  const metric = METRICS.find((m) => m.key === selected) || METRICS[0];
  const curSeries = series[metric.key]?.cur || [];
  const prevSeries = series[metric.key]?.prev || [];
  const labels = data ? buildLabels(data.start, data.step_secs, data.n) : [];
  const chartEmpty = data && [...curSeries, ...prevSeries].every((v) => !num(v));
  const todoRows = TODO_ROWS.filter((r) => !canOpen || canOpen(r.menu));
  const todoTotal = data ? todoRows.reduce((s, r) => s + num(data.todo?.[r.key]), 0) : 0;
  const todayMode = preset === "today";

  const openRow = (r) => {
    if (r.open) {
      try { sessionStorage.setItem("neezam_booked_open", JSON.stringify(r.open)); } catch (e) { /* ignore */ }
    }
    if (onNavigate) onNavigate(r.menu);
  };

  return (
    <div style={{ padding: "1rem", color: "var(--ne-text)", maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        .ne-home-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .ne-home-split{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:12px}
        @media (max-width:900px){.ne-home-split{grid-template-columns:1fr}}
        @media (max-width:640px){.ne-home-grid{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{greet}</h1>
          <div style={{ fontSize: 12.5, color: "var(--ne-muted)", marginTop: 2 }}>
            {storeName ? `${storeName} · ` : ""}{t("home.subtitle")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          {DATE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setPreset(f.value)} style={pill(preset === f.value)}>
              {t(DATE_FILTER_LABEL_KEYS[f.value])}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={dateInput} />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={dateInput} />
            </>
          )}
        </div>
      </div>

      {error ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ne-muted)", fontSize: 13 }}>
          <span>{t("home.loadError")}</span>
          <button onClick={load} style={pill(true)}>{t("home.retry")}</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "var(--ne-muted)", marginBottom: 8, minHeight: 14 }}>{data ? vsNote : ""}</div>

          <div className="ne-home-grid" style={{ opacity: loading && data ? 0.6 : 1, transition: "opacity .15s" }}>
            {METRICS.map((m) => {
              const ch = data ? changeOf(data.cur?.[m.key], data.prev?.[m.key]) : null;
              const good = ch && ch.pct !== undefined && ch.pct !== 0 ? (ch.pct > 0) !== !!m.invert : null;
              const chColor = good === null ? "var(--ne-muted)" : good ? "var(--ne-success)" : "var(--ne-danger)";
              const valueText = data ? fmtValue(m.kind, data.cur?.[m.key]) : "";
              const active = selected === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelected(m.key)}
                  style={{
                    ...card, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
                    padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
                    borderColor: active ? m.color : "var(--ne-border)",
                    boxShadow: active ? `0 0 0 1px ${m.color}` : "none",
                  }}
                >
                  <div style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{t(m.labelKey)}</div>
                  {data ? (
                    <div key={valueText} className="ne-fade-in" style={{ fontSize: 22, fontWeight: 700 }}>{valueText}</div>
                  ) : (
                    <div className="ne-skel" style={{ height: 26, width: "60%" }} />
                  )}
                  <div style={{ minHeight: 16, fontSize: 11.5, fontWeight: 700, color: chColor, display: "flex", alignItems: "center", gap: 3 }}>
                    {ch && ch.isNew && <span style={{ color: "var(--ne-accent)" }}>{t("home.new")}</span>}
                    {ch && ch.pct !== undefined && (
                      <>
                        {ch.pct > 0 && <Icon name="arrowUp" size={11} />}
                        {ch.pct < 0 && <Icon name="arrowDown" size={11} />}
                        <span>{Math.abs(ch.pct)}%</span>
                      </>
                    )}
                  </div>
                  {data ? <Sparkline values={series[m.key]?.cur || []} color={m.color} /> : <div className="ne-skel" style={{ height: 28 }} />}
                </button>
              );
            })}
          </div>

          <div className="ne-home-split">
            <div style={{ ...card, padding: 16, opacity: loading && data ? 0.6 : 1, transition: "opacity .15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t(metric.labelKey)}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--ne-muted)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 14, height: 3, borderRadius: 2, background: metric.color }} />
                    {todayMode ? t("home.legend.today") : t("home.legend.current")}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 14, height: 0, borderTop: "2px dashed var(--ne-muted-2)" }} />
                    {todayMode ? t("home.legend.yesterday") : t("home.legend.previous")}
                  </span>
                </div>
              </div>
              {data ? (
                <>
                  <TrendChart
                    cur={curSeries} prev={prevSeries} labels={labels} color={metric.color}
                    format={(v) => fmtValue(metric.kind, v)}
                    curLabel={todayMode ? t("home.legend.today") : t("home.legend.current")}
                    prevLabel={todayMode ? t("home.legend.yesterday") : t("home.legend.previous")}
                    height={220}
                  />
                  {chartEmpty && (
                    <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--ne-muted)", marginTop: 4 }}>{t("home.chart.empty")}</div>
                  )}
                </>
              ) : (
                <div className="ne-skel" style={{ height: 240 }} />
              )}
            </div>

            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t("home.todo.title")}</div>
              <div style={{ fontSize: 11, color: "var(--ne-muted)", marginBottom: 8 }}>{t("home.todo.subtitle")}</div>
              {data && todoTotal === 0 && (
                <div style={{ fontSize: 12, color: "var(--ne-success)", fontWeight: 700, margin: "4px 0 8px" }}>{t("home.todo.allClear")}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {todoRows.map((r, idx) => {
                  const count = data ? num(data.todo?.[r.key]) : null;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => openRow(r)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                        background: "transparent", border: "none", cursor: "pointer", font: "inherit", color: "inherit",
                        padding: "10px 2px", borderTop: idx === 0 ? "none" : "1px solid var(--ne-border)",
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5 }}>{t(r.labelKey)}</span>
                        {r.noteKey && <span style={{ fontSize: 10.5, color: "var(--ne-muted)", marginLeft: 6 }}>{t(r.noteKey)}</span>}
                      </span>
                      {count === null ? (
                        <span className="ne-skel" style={{ width: 28, height: 16 }} />
                      ) : (
                        <span
                          style={{
                            minWidth: 26, textAlign: "center", fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                            background: count > 0 ? "var(--ne-warning-soft)" : "var(--ne-muted-soft)",
                            color: count > 0 ? "var(--ne-warning)" : "var(--ne-muted)",
                          }}
                        >
                          {count.toLocaleString()}
                        </span>
                      )}
                      <span style={{ color: "var(--ne-muted)", display: "inline-flex" }}><Icon name="chevronRight" size={12} /></span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
