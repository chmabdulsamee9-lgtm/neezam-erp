import { useState, useEffect, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const DATE_FILTER_LABEL_KEYS = { today: "devMonitor.today", yesterday: "devMonitor.yesterday", "7days": "devMonitor.7days", "30days": "devMonitor.30days" };

function getDateRange(dateFilter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dateFilter === "today") return { from: today, to: new Date(today.getTime() + 86400000) };
  if (dateFilter === "yesterday") {
    const y = new Date(today.getTime() - 86400000);
    return { from: y, to: today };
  }
  if (dateFilter === "7days") return { from: new Date(today.getTime() - 7 * 86400000), to: new Date(today.getTime() + 86400000) };
  return { from: new Date(today.getTime() - 30 * 86400000), to: new Date(today.getTime() + 86400000) };
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// request_details/response_details/stack_trace column-type se depend karta hai (jsonb ->
// already-parsed object, text -> raw/JSON string) — dono cases handle karte hain.
function prettyJson(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return String(value); }
}

export default function DevMonitorDetailed({ allStores }) {
  const navigate = useNavigate();
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [dateFilter, setDateFilter] = useState("today");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentsError, setDeploymentsError] = useState("");

  const [brandFilter, setBrandFilter] = useState("");
  const [endpointFilter, setEndpointFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [hitRowCap, setHitRowCap] = useState(false);

  const storeMap = useMemo(() => {
    const map = {};
    (allStores || []).forEach((s) => { map[s.id] = s.store_name; });
    return map;
  }, [allStores]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { loadLogs(); }, [dateFilter, brandFilter, endpointFilter, statusFilter, sourceFilter]);
  useEffect(() => { loadDeployments(); }, []);

  const exportLogsCsv = () => {
    const columns = ["created_at", "brand_name", "source", "store_id", "user_name", "page_or_endpoint", "action", "status", "http_status_code", "order_id", "error_message", "duration_ms", "details", "request_details", "response_details", "stack_trace"];
    const escapeCsv = (value) => {
      const s = value == null ? "" : (typeof value === "object" ? JSON.stringify(value) : String(value));
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredLogs.map((l) => columns.map((c) => escapeCsv(c === "brand_name" ? (storeMap[l.store_id] || "") : l[c])).join(","));
    const csv = [columns.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dev-monitor-log-${dateFilter}-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadLogs = async () => {
    setLoading(true);
    setError("");
    setHitRowCap(false);
    try {
      const { from, to } = getDateRange(dateFilter);
      const PAGE_SIZE = 1000;
      let allRows = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let query = supabase
          .from("dev_monitoring_log")
          .select("*")
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString());
        if (brandFilter) query = query.eq("store_id", brandFilter);
        if (endpointFilter) query = query.eq("page_or_endpoint", endpointFilter);
        if (statusFilter) query = query.eq("status", statusFilter);
        if (sourceFilter) query = query.eq("source", sourceFilter);
        const { data, error: fetchError } = await query
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (fetchError) throw fetchError;
        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break; // last page reached
        offset += PAGE_SIZE;
        if (offset > 5000) { setHitRowCap(true); break; } // hard safety ceiling so a runaway date-range can't loop forever
      }
      setLogs(allRows);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadDeployments = async () => {
    setDeploymentsLoading(true);
    setDeploymentsError("");
    try {
      const PAGE_SIZE = 1000;
      let allRows = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error: fetchError } = await supabase
          .from("deployment_log")
          .select("*")
          .order("deployed_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (fetchError) throw fetchError;
        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        if (offset > 5000) break;
      }
      setDeployments(allRows);
    } catch (err) {
      setDeploymentsError(err.message);
    }
    setDeploymentsLoading(false);
  };

  // Summary stats — same calculation DevMonitor.jsx (ab-retired summary component) use karta
  // tha, ab isi page ke already-loaded `logs` (same dateFilter) se derive hoti hai — do alag
  // fetches ki zaroorat nahi.
  const stats = useMemo(() => {
    const total = logs.length;
    const successCount = logs.filter((l) => l.status === "success").length;
    const errorCount = logs.filter((l) => l.status === "error").length;
    const errorRate = total ? Math.round((errorCount / total) * 100) : 0;

    const frontendDurations = logs.filter((l) => l.source === "frontend" && l.duration_ms != null).map((l) => l.duration_ms);
    const workerDurations = logs.filter((l) => l.source === "worker" && l.duration_ms != null).map((l) => l.duration_ms);
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const avgFrontend = avg(frontendDurations);
    const avgWorker = avg(workerDurations);

    const userMap = {};
    logs.forEach((l) => {
      const key = l.user_name || t("devMonitor.unknownUser");
      if (!userMap[key]) userMap[key] = { user: key, events: 0, errors: 0, brands: new Set() };
      userMap[key].events++;
      if (l.status === "error") userMap[key].errors++;
      const brandName = storeMap[l.store_id];
      if (brandName) userMap[key].brands.add(brandName);
    });
    const perUser = Object.values(userMap)
      .map((u) => ({ ...u, brand: u.brands.size ? Array.from(u.brands).join(", ") : "—" }))
      .sort((a, b) => b.events - a.events);

    const dayMap = {};
    logs.forEach((l) => {
      const key = ymd(new Date(l.created_at));
      if (!dayMap[key]) dayMap[key] = { key, success: 0, error: 0 };
      if (l.status === "error") dayMap[key].error++;
      else dayMap[key].success++;
    });
    const dailyBreakdown = Object.values(dayMap).sort((a, b) => (a.key < b.key ? -1 : 1));

    const recentErrors = logs.filter((l) => l.status === "error").slice(0, 20);

    // P50/P95/P99 helper
    const percentile = (arr, p) => {
      if (!arr.length) return null
      const sorted = [...arr].sort((a, b) => a - b)
      const idx = Math.ceil((p / 100) * sorted.length) - 1
      return sorted[Math.max(0, idx)]
    }

    // Worker response time percentiles
    const workerP50 = percentile(workerDurations, 50)
    const workerP95 = percentile(workerDurations, 95)
    const workerP99 = percentile(workerDurations, 99)

    // 4xx/5xx breakdown
    const errors4xx = logs.filter(l =>
      l.http_status_code >= 400 &&
      l.http_status_code < 500
    ).length
    const errors5xx = logs.filter(l =>
      l.http_status_code >= 500
    ).length

    // Top endpoints by volume
    const endpointVolumeMap = {}
    logs.forEach(l => {
      if (!l.page_or_endpoint) return
      if (!endpointVolumeMap[l.page_or_endpoint])
        endpointVolumeMap[l.page_or_endpoint] = {
          endpoint: l.page_or_endpoint,
          total: 0, errors: 0, durations: []
        }
      endpointVolumeMap[l.page_or_endpoint].total++
      if (l.status === 'error')
        endpointVolumeMap[l.page_or_endpoint].errors++
      if (l.duration_ms != null)
        endpointVolumeMap[l.page_or_endpoint]
          .durations.push(l.duration_ms)
    })
    const topEndpointsByVolume = Object.values(endpointVolumeMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(e => ({
        ...e,
        errorRate: e.total ?
          Math.round((e.errors / e.total) * 100) : 0,
        avgMs: e.durations.length ?
          Math.round(
            e.durations.reduce((a,b) => a+b,0) /
            e.durations.length
          ) : null,
        p99Ms: percentile(e.durations, 99)
      }))

    // Source breakdown
    const frontendCount = logs.filter(
      l => l.source === 'frontend'
    ).length
    const workerCount = logs.filter(
      l => l.source === 'worker'
    ).length

    // Hourly breakdown for line chart
    const hourlyMap = {}
    logs.forEach(l => {
      const d = new Date(l.created_at)
      const key = `${ymd(d)} ${String(d.getHours())
        .padStart(2,'0')}:00`
      if (!hourlyMap[key])
        hourlyMap[key] = { key, success: 0, error: 0 }
      if (l.status === 'error') hourlyMap[key].error++
      else hourlyMap[key].success++
    })
    const hourlyBreakdown = Object.values(hourlyMap)
      .sort((a,b) => a.key < b.key ? -1 : 1)

    return {
      total, successCount, errorCount, errorRate, avgFrontend, avgWorker, perUser, dailyBreakdown, recentErrors,
      workerP50, workerP95, workerP99,
      errors4xx, errors5xx,
      topEndpointsByVolume,
      frontendCount, workerCount,
      hourlyBreakdown
    };
  }, [logs, t, storeMap]);

  const endpointOptions = useMemo(() => {
    const set = new Set(logs.map((l) => l.page_or_endpoint).filter(Boolean));
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return logs.filter((l) => {
      if (brandFilter && l.store_id !== brandFilter) return false;
      if (endpointFilter && l.page_or_endpoint !== endpointFilter) return false;
      if (statusFilter && l.status !== statusFilter) return false;
      if (q) {
        const haystack = `${l.error_message || ""} ${l.order_id || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, brandFilter, endpointFilter, statusFilter, searchText]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" };
  const dateBtnStyle = (type) => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 700, border: "1px solid",
    borderColor: dateFilter === type ? "transparent" : "var(--ne-border)",
    background: dateFilter === type ? "var(--ne-grad)" : "var(--ne-surface-2)",
    color: dateFilter === type ? "#fff" : "var(--ne-muted)",
  });
  const controlStyle = {
    padding: "7px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-bg)",
    color: "var(--ne-text)", fontSize: 12,
  };
  const thStyle = { textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase" };
  const tdStyle = { padding: "6px 8px" };

  const statCards = [
    { label: t("devMonitor.totalEvents"), value: stats.total, color: "var(--ne-accent)" },
    { label: t("devMonitor.successCount"), value: stats.successCount, color: "var(--ne-success)" },
    { label: t("devMonitor.errorCount"), value: stats.errorCount, color: "var(--ne-danger)" },
    { label: t("devMonitor.errorRate"), value: `${stats.errorRate}%`, color: stats.errorRate > 10 ? "var(--ne-danger)" : "var(--ne-warning)" },
    { label: t("devMonitor.avgFrontend"), value: stats.avgFrontend != null ? `${stats.avgFrontend}ms` : "—", color: "var(--ne-accent2)" },
    { label: t("devMonitor.avgWorker"), value: stats.avgWorker != null ? `${stats.avgWorker}ms` : "—", color: "var(--ne-accent2)" },
    {
      label: "Worker P50",
      value: stats.workerP50 != null ?
        `${stats.workerP50}ms` : "—",
      color: "var(--ne-accent)"
    },
    {
      label: "Worker P95",
      value: stats.workerP95 != null ?
        `${stats.workerP95}ms` : "—",
      color: stats.workerP95 > 2000 ?
        "var(--ne-warning)" : "var(--ne-accent)"
    },
    {
      label: "Worker P99",
      value: stats.workerP99 != null ?
        `${stats.workerP99}ms` : "—",
      color: stats.workerP99 > 5000 ?
        "var(--ne-danger)" : "var(--ne-accent)"
    },
    {
      label: "4xx Errors",
      value: stats.errors4xx,
      color: stats.errors4xx > 0 ?
        "var(--ne-warning)" : "var(--ne-muted)"
    },
    {
      label: "5xx Errors",
      value: stats.errors5xx,
      color: stats.errors5xx > 0 ?
        "var(--ne-danger)" : "var(--ne-muted)"
    },
    {
      label: "Frontend Calls",
      value: stats.frontendCount,
      color: "var(--ne-accent2)"
    },
  ];
  const maxDayTotal = Math.max(...stats.dailyBreakdown.map((d) => d.success + d.error), 1);

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <button onClick={() => navigate('/master-dashboard')}
        style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--ne-border)', background: 'transparent', color: 'var(--ne-muted)', fontSize: 12, cursor: 'pointer', marginBottom: 14 }}>
        {t('master.backToMaster')}
      </button>

      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="database" size={17} /> {t("devMonitor.title")}</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("devMonitor.subtitle")}</p>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap" }}>
        {["today", "yesterday", "7days", "30days"].map((f) => (
          <button key={f} style={dateBtnStyle(f)} onClick={() => setDateFilter(f)}>{t(DATE_FILTER_LABEL_KEYS[f])}</button>
        ))}
        <button style={{ ...dateBtnStyle("export"), display: "flex", alignItems: "center", gap: 5 }} onClick={exportLogsCsv}>
          <Icon name="download" size={11} /> {t("devMonitor.exportLogs")}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="error" size={12} /> {error}
        </div>
      )}

      {hitRowCap && !loading && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-warning-soft)", color: "var(--ne-warning)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="warning" size={12} /> 5,000 results shown — narrow your filters for more specific results
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("devMonitor.loading")}</div>
      ) : stats.total === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12, marginBottom: 20 }}>{t("devMonitor.noData")}</div>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)", gap: "0.6rem", marginBottom: "0.75rem" }}>
            {statCards.map((c) => (
              <div key={c.label} style={{ ...cardStyle, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 9.5, color: "var(--ne-muted)", fontWeight: 600, marginTop: 3 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Hourly breakdown */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{
              margin: "0 0 0.75rem", fontSize: 13,
              color: "var(--ne-muted)", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6
            }}>
              <Icon name="chart" size={13} />
              Requests Over Time (Hourly)
            </h2>
            {stats.hourlyBreakdown.length === 0 ? (
              <div style={{
                color: "var(--ne-muted-2)",
                fontSize: 12, textAlign: "center"
              }}>No data</div>
            ) : (
              <div style={{
                display: "flex", alignItems: "flex-end",
                gap: 3, height: 80, overflowX: "auto"
              }}>
                {stats.hourlyBreakdown.map(h => {
                  const maxH = Math.max(
                    ...stats.hourlyBreakdown.map(
                      x => x.success + x.error
                    ), 1
                  )
                  const total = h.success + h.error
                  const height = (total / maxH) * 100
                  const errH = total ?
                    (h.error / total) * height : 0
                  const sucH = total ?
                    (h.success / total) * height : 0
                  return (
                    <div
                      key={h.key}
                      title={`${h.key}: ${h.success} ok, ${h.error} err`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        height: "100%",
                        width: 14,
                        flexShrink: 0,
                        cursor: "default"
                      }}
                    >
                      <div style={{
                        height: `${errH}%`,
                        background: "var(--ne-danger)",
                        borderRadius: "2px 2px 0 0",
                        minHeight: h.error > 0 ? 2 : 0
                      }} />
                      <div style={{
                        height: `${sucH}%`,
                        background: "var(--ne-success)",
                        minHeight: h.success > 0 ? 2 : 0
                      }} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Daily breakdown */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="chart" size={13} /> {t("devMonitor.dailyBreakdownTitle")}
            </h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110, overflowX: "auto" }}>
              {stats.dailyBreakdown.map((d) => {
                const dTotal = d.success + d.error;
                const h = (dTotal / maxDayTotal) * 100;
                const successH = dTotal ? (d.success / dTotal) * h : 0;
                const errorH = dTotal ? (d.error / dTotal) * h : 0;
                return (
                  <div key={d.key} title={`${d.key}: ${d.success} success, ${d.error} error`} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", width: 20, flexShrink: 0 }}>
                    <div style={{ height: `${errorH}%`, background: "var(--ne-danger)", borderRadius: "3px 3px 0 0", minHeight: d.error > 0 ? 2 : 0 }} />
                    <div style={{ height: `${successH}%`, background: "var(--ne-success)", minHeight: d.success > 0 ? 2 : 0 }} />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            {/* Per-user breakdown */}
            <div style={cardStyle}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="team" size={13} /> {t("devMonitor.perUserTitle")}
              </h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead>
                    <tr>
                      {[t("devMonitor.table.user"), t("devMonitor.table.brand"), t("devMonitor.table.events"), t("devMonitor.table.errors")].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.perUser.map((u) => (
                      <tr key={u.user}>
                        <td style={{ padding: "6px 8px", color: "var(--ne-text)" }}>{u.user}</td>
                        <td style={{ padding: "6px 8px", color: "var(--ne-muted)" }}>{u.brand}</td>
                        <td style={{ padding: "6px 8px", color: "var(--ne-muted)" }}>{u.events}</td>
                        <td style={{ padding: "6px 8px", color: u.errors > 0 ? "var(--ne-danger)" : "var(--ne-muted)", fontWeight: u.errors > 0 ? 700 : 400 }}>{u.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent errors */}
            <div style={cardStyle}>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="warning" size={13} /> {t("devMonitor.recentErrorsTitle")}
              </h2>
              {stats.recentErrors.length === 0 ? (
                <p style={{ color: "var(--ne-muted-2)", fontSize: 12, margin: 0 }}>{t("devMonitor.noErrors")}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                  {stats.recentErrors.map((l) => (
                    <div key={l.id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, color: "var(--ne-danger)" }}>{l.source} · {l.page_or_endpoint}</span>
                        <span style={{ color: "var(--ne-muted-2)", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                      <div style={{ color: "var(--ne-muted)" }}>{l.error_message || "—"}</div>
                      <div style={{ color: "var(--ne-muted-2)", marginTop: 2 }}>{l.user_name || t("devMonitor.unknownUser")}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top Endpoints */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{
              margin: "0 0 0.75rem", fontSize: 13,
              color: "var(--ne-muted)", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6
            }}>
              <Icon name="chart" size={13} />
              Top Endpoints
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11
              }}>
                <thead>
                  <tr>
                    {[
                      "Endpoint", "Requests",
                      "Errors", "Error %",
                      "Avg ms", "P99 ms"
                    ].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.topEndpointsByVolume.map(e => (
                    <tr key={e.endpoint}>
                      <td style={{
                        ...tdStyle,
                        fontFamily: "monospace",
                        fontSize: 10.5,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {e.endpoint}
                      </td>
                      <td style={tdStyle}>{e.total}</td>
                      <td style={{
                        ...tdStyle,
                        color: e.errors > 0 ?
                          "var(--ne-danger)" :
                          "var(--ne-muted)",
                        fontWeight: e.errors > 0 ? 700 : 400
                      }}>
                        {e.errors}
                      </td>
                      <td style={{
                        ...tdStyle,
                        color: e.errorRate > 10 ?
                          "var(--ne-danger)" :
                          e.errorRate > 5 ?
                            "var(--ne-warning)" :
                            "var(--ne-muted)"
                      }}>
                        {e.errorRate}%
                      </td>
                      <td style={tdStyle}>
                        {e.avgMs != null ? `${e.avgMs}ms` : "—"}
                      </td>
                      <td style={{
                        ...tdStyle,
                        color: e.p99Ms > 5000 ?
                          "var(--ne-danger)" :
                          e.p99Ms > 2000 ?
                            "var(--ne-warning)" :
                            "var(--ne-muted)"
                      }}>
                        {e.p99Ms != null ? `${e.p99Ms}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Raw filterable/searchable log table */}
      <div style={{ marginTop: 8 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="clipboard" size={13} /> Raw Logs
        </h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={controlStyle}>
            <option value="">Sab Brands</option>
            {(allStores || []).map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
          </select>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            style={controlStyle}
          >
            <option value="">Sab Sources</option>
            <option value="worker">Worker</option>
            <option value="frontend">Frontend</option>
          </select>
          <select value={endpointFilter} onChange={(e) => setEndpointFilter(e.target.value)} style={controlStyle}>
            <option value="">Sab Endpoints</option>
            {endpointOptions.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={controlStyle}>
            <option value="">Sab Status</option>
            <option value="success">success</option>
            <option value="error">error</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 200 }}>
            <Icon name="search" size={13} style={{ color: "var(--ne-muted)" }} />
            <input placeholder="Error message ya order_id search karo..." value={searchText} onChange={(e) => setSearchText(e.target.value)}
              style={{ ...controlStyle, flex: 1 }} />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)" }}>{t("devMonitor.loading")}</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted-2)", fontSize: 12 }}>Koi log match nahi hui.</div>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  {["", "Time", "Brand", "Endpoint", "Status", "HTTP", "Order ID", "Error", "Source", "Action", "Duration"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((l) => {
                  const isOpen = expandedIds.has(l.id);
                  return (
                    <Fragment key={l.id}>
                      <tr onClick={() => toggleExpand(l.id)} style={{ cursor: "pointer" }}>
                        <td style={tdStyle}>
                          <Icon name="chevronDown" size={11} style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
                        </td>
                        <td style={{ ...tdStyle, color: "var(--ne-muted-2)", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td style={tdStyle}>{storeMap[l.store_id] || l.store_id || "—"}</td>
                        <td style={tdStyle}>{l.page_or_endpoint}</td>
                        <td style={{ ...tdStyle, color: l.status === "error" ? "var(--ne-danger)" : "var(--ne-success)", fontWeight: 600 }}>{l.status}</td>
                        <td style={tdStyle}>{l.http_status_code ?? "—"}</td>
                        <td style={tdStyle}>{l.order_id || "—"}</td>
                        <td style={{ ...tdStyle, color: "var(--ne-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.error_message || "—"}</td>
                        <td style={tdStyle}>{l.source || "—"}</td>
                        <td style={tdStyle}>{l.action || "—"}</td>
                        <td style={{
                          ...tdStyle,
                          color: l.duration_ms > 5000 ?
                            "var(--ne-danger)" :
                            l.duration_ms > 2000 ?
                              "var(--ne-warning)" :
                              "var(--ne-muted)"
                        }}>
                          {l.duration_ms != null ? `${l.duration_ms}ms` : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={11} style={{ padding: "10px 12px", background: "var(--ne-surface)", borderBottom: "1px solid var(--ne-border)" }}>
                            <div style={{ display: "grid", gap: 8 }}>
                              <div>
                                <strong style={{
                                  fontSize: 10.5, color: "var(--ne-muted)",
                                  textTransform: "uppercase"
                                }}>
                                  Action
                                </strong>
                                <div style={{ fontSize: 12 }}>
                                  {l.action || "—"}
                                </div>
                              </div>
                              <div>
                                <strong style={{
                                  fontSize: 10.5, color: "var(--ne-muted)",
                                  textTransform: "uppercase"
                                }}>
                                  Duration
                                </strong>
                                <div style={{ fontSize: 12 }}>
                                  {l.duration_ms != null ?
                                    `${l.duration_ms}ms` : "—"}
                                </div>
                              </div>
                              <div>
                                <strong style={{
                                  fontSize: 10.5, color: "var(--ne-muted)",
                                  textTransform: "uppercase"
                                }}>
                                  Details
                                </strong>
                                <pre style={{
                                  margin: "4px 0 0", fontSize: 11,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-all"
                                }}>
                                  {prettyJson(l.details) || "—"}
                                </pre>
                              </div>
                              <div>
                                <strong style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase" }}>HTTP Status</strong>
                                <div style={{ fontSize: 12 }}>{l.http_status_code ?? "—"}</div>
                              </div>
                              <div>
                                <strong style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase" }}>Request Details</strong>
                                <pre style={{ margin: "4px 0 0", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{prettyJson(l.request_details) || "—"}</pre>
                              </div>
                              <div>
                                <strong style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase" }}>Response Details</strong>
                                <pre style={{ margin: "4px 0 0", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{prettyJson(l.response_details) || "—"}</pre>
                              </div>
                              <div>
                                <strong style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase" }}>Stack Trace</strong>
                                <pre style={{ margin: "4px 0 0", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{prettyJson(l.stack_trace) || "—"}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deployments */}
      <div style={{ marginTop: 8 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="upload" size={13} /> Deployments
        </h2>
        {deploymentsError && (
          <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)" }}>
            {deploymentsError}
          </div>
        )}
        {deploymentsLoading ? (
          <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--ne-muted)" }}>{t("devMonitor.loading")}</div>
        ) : deployments.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--ne-muted-2)", fontSize: 12 }}>Abhi tak koi deployment log nahi.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  {["Deployed At", "Repo", "Branch", "Environment", "Commit", "Message", "Status", "URL"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{d.deployed_at ? new Date(d.deployed_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                    <td style={tdStyle}>{d.repo || "—"}</td>
                    <td style={tdStyle}>{d.branch || "—"}</td>
                    <td style={tdStyle}>{d.environment || "—"}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 10.5 }}>{d.commit_hash ? d.commit_hash.slice(0, 7) : "—"}</td>
                    <td style={{ ...tdStyle, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.commit_message || "—"}</td>
                    <td style={{ ...tdStyle, color: d.status === "error" || d.status === "failed" ? "var(--ne-danger)" : "var(--ne-success)", fontWeight: 600 }}>{d.status || "—"}</td>
                    <td style={tdStyle}>{d.deploy_url ? <a href={d.deploy_url} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)" }}>Link</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
