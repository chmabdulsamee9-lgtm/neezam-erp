import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabase";
import { useLanguage, useTranslation } from "../i18n";
import { DATE_FILTERS, getDateRange } from "../bookedOrdersData";

const DATE_FILTER_LABEL_KEYS = {
  today: "dashboard.dateFilter.today",
  yesterday: "dashboard.dateFilter.yesterday",
  "7days": "dashboard.dateFilter.7days",
  "30days": "dashboard.dateFilter.30days",
  custom: "dashboard.dateFilter.custom",
};

const pill = (active) => ({
  padding: "6px 14px", borderRadius: 20, border: "1px solid",
  borderColor: active ? "transparent" : "var(--ne-border)", fontSize: 11, cursor: "pointer", fontWeight: 700,
  background: active ? "var(--ne-grad)" : "var(--ne-surface-2)", color: active ? "#fff" : "var(--ne-muted)",
});

const dateInput = {
  padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)",
  background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5,
};

export default function AppHome({ storeId, apiBase, fetcher }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [dateFilter, setDateFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!storeId) return;
    if (dateFilter === "custom" && (!customFrom || !customTo)) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(false);
    try {
      const { from, to } = getDateRange(dateFilter, customFrom, customTo);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetcher(`${apiBase}/home-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, from: from.toISOString(), to: to.toISOString() }),
      });
      const json = await res.json();
      if (myReq !== reqId.current) return; // purani request ka jawab ignore
      if (!res.ok || !json.stats) throw new Error(json.error || "home-stats fail");
      setStats(json.stats);
    } catch (e) {
      if (myReq !== reqId.current) return;
      setError(true);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [storeId, apiBase, fetcher, dateFilter, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  const n = (v) => Number(v || 0);
  const cards = [
    { key: "orders", label: t("home.stat.orders"), value: n(stats?.orders).toLocaleString() },
    { key: "sales", label: t("home.stat.totalSales"), value: `Rs. ${Math.round(n(stats?.total_sales)).toLocaleString()}` },
    { key: "approved", label: t("home.stat.approved"), value: n(stats?.approved).toLocaleString() },
    { key: "booked", label: t("home.stat.booked"), value: n(stats?.booked).toLocaleString() },
    { key: "delivered", label: t("home.stat.delivered"), value: n(stats?.delivered).toLocaleString() },
    { key: "returned", label: t("home.stat.returned"), value: n(stats?.returned).toLocaleString() },
  ];

  return (
    <div style={{ padding: "1rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {DATE_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setDateFilter(f.value)} style={pill(dateFilter === f.value)}>
            {t(DATE_FILTER_LABEL_KEYS[f.value])}
          </button>
        ))}
        {dateFilter === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={dateInput} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={dateInput} />
          </>
        )}
      </div>

      {error ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ne-muted)", fontSize: 13 }}>
          <span>{t("home.loadError")}</span>
          <button onClick={load} style={pill(true)}>{t("home.retry")}</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.key} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 11.5, color: "var(--ne-muted)", marginBottom: 6 }}>{c.label}</div>
              {loading || stats === null ? (
                <div className="ne-skel" style={{ height: 26, width: "60%" }} />
              ) : (
                <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
