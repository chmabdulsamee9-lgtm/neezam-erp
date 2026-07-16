import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const PAGE_SIZE = 50;

export default function ActivityLog({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  // Naye action_types future phases mein bhi 'activityLog.action.<type>' key ke naam se
  // i18n.js mein add hote rehte hain — yahan koi hardcoded map maintain nahi karni
  const actionLabel = (type) => {
    const key = `activityLog.action.${type}`;
    const translated = t(key);
    return translated === key ? type : translated;
  };
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userFilter, setUserFilter] = useState("All");
  const [orderSearch, setOrderSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (storeId) fetchLogs();
  }, [storeId]);

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(2000);
    setLogs(data || []);
    setLoading(false);
  };

  const availableUsers = ["All", ...new Set(logs.map(l => l.user_name).filter(Boolean))].sort();

  const filteredLogs = logs.filter(l => {
    const logDate = new Date(l.created_at);
    const matchFrom = !dateFrom || logDate >= new Date(dateFrom + "T00:00:00");
    const matchTo = !dateTo || logDate <= new Date(dateTo + "T23:59:59");
    const matchUser = userFilter === "All" || l.user_name === userFilter;
    const matchOrder = !orderSearch || String(l.order_id || "").includes(orderSearch.trim());
    return matchFrom && matchTo && matchUser && matchOrder;
  });

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE) || 1;
  const pagedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const inputStyle = {
    padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5,
  };

  const formatDetails = (details) => {
    if (!details) return "—";
    try {
      const entries = Object.entries(details).slice(0, 3);
      return entries.map(([k, v]) => `${k}: ${v}`).join(" · ") || "—";
    } catch {
      return "—";
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="activity-log" size={18} /> {t("activityLog.title")}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ne-muted)" }}>{filteredLogs.length} {t("activityLog.entries")}</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={inputStyle} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={inputStyle} />
        <select value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1); }} style={inputStyle}>
          {availableUsers.map(u => <option key={u}>{u}</option>)}
        </select>
        <div style={{ position: "relative", minWidth: 160 }}>
          <Icon name="search" size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--ne-muted-2)" }} />
          <input type="text" placeholder={t("activityLog.orderSearchPlaceholder")} value={orderSearch}
            onChange={e => { setOrderSearch(e.target.value); setPage(1); }} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingLeft: 26 }} />
        </div>
        {(dateFrom || dateTo || userFilter !== "All" || orderSearch) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setUserFilter("All"); setOrderSearch(""); setPage(1); }}
            style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--ne-danger)", background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontSize: 11, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="close" size={10} /> {t("activityLog.clear")}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("activityLog.loading")}</div>
      ) : filteredLogs.length === 0 ? (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)", fontSize: 13 }}>
          {t("activityLog.noActivity")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pagedLogs.map(l => (
            <div key={l.id} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "var(--ne-text)", fontWeight: 600 }}>
                  <span style={{ color: "var(--ne-accent)" }}>{l.user_name || "—"}</span>
                  {" — "}
                  {actionLabel(l.action_type)}
                  {l.order_id && <span style={{ color: "var(--ne-muted)" }}> · {t("activityLog.orderPrefix")}{l.order_id}</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginTop: 2 }}>{formatDetails(l.details)}</div>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", whiteSpace: "nowrap", flexShrink: 0 }}>
                {new Date(l.created_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: "1rem" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>{t("activityLog.prev")}</button>
          <span style={{ fontSize: 11, color: "var(--ne-muted-2)", alignSelf: "center" }}>{t("activityLog.pagePrefix")} {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>{t("activityLog.next")}</button>
        </div>
      )}
    </div>
  );
}
