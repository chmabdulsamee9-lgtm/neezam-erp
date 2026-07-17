import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { isDevEnv } from "../App";

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

export default function DevMonitor() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [dateFilter, setDateFilter] = useState("today");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isDevEnv()) return;
    loadLogs();
  }, [dateFilter]);

  const loadLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const { from, to } = getDateRange(dateFilter);
      const { data, error: fetchError } = await supabase
        .from("dev_monitoring_log")
        .select("*")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);
      if (fetchError) throw fetchError;
      setLogs(data || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

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
      if (!userMap[key]) userMap[key] = { user: key, events: 0, errors: 0 };
      userMap[key].events++;
      if (l.status === "error") userMap[key].errors++;
    });
    const perUser = Object.values(userMap).sort((a, b) => b.events - a.events);

    const dayMap = {};
    logs.forEach((l) => {
      const key = ymd(new Date(l.created_at));
      if (!dayMap[key]) dayMap[key] = { key, success: 0, error: 0 };
      if (l.status === "error") dayMap[key].error++;
      else dayMap[key].success++;
    });
    const dailyBreakdown = Object.values(dayMap).sort((a, b) => (a.key < b.key ? -1 : 1));

    const recentErrors = logs.filter((l) => l.status === "error").slice(0, 20);

    return { total, successCount, errorCount, errorRate, avgFrontend, avgWorker, perUser, dailyBreakdown, recentErrors };
  }, [logs, t]);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" };
  const dateBtnStyle = (type) => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 700, border: "1px solid",
    borderColor: dateFilter === type ? "transparent" : "var(--ne-border)",
    background: dateFilter === type ? "var(--ne-grad)" : "var(--ne-surface-2)",
    color: dateFilter === type ? "#fff" : "var(--ne-muted)",
  });

  if (!isDevEnv()) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>{t("devMonitor.notDevEnv")}</div>
    );
  }

  const statCards = [
    { label: t("devMonitor.totalEvents"), value: stats.total, color: "var(--ne-accent)" },
    { label: t("devMonitor.successCount"), value: stats.successCount, color: "var(--ne-success)" },
    { label: t("devMonitor.errorCount"), value: stats.errorCount, color: "var(--ne-danger)" },
    { label: t("devMonitor.errorRate"), value: `${stats.errorRate}%`, color: stats.errorRate > 10 ? "var(--ne-danger)" : "var(--ne-warning)" },
    { label: t("devMonitor.avgFrontend"), value: stats.avgFrontend != null ? `${stats.avgFrontend}ms` : "—", color: "var(--ne-accent2)" },
    { label: t("devMonitor.avgWorker"), value: stats.avgWorker != null ? `${stats.avgWorker}ms` : "—", color: "var(--ne-accent2)" },
  ];

  const maxDayTotal = Math.max(...stats.dailyBreakdown.map((d) => d.success + d.error), 1);

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="database" size={17} /> {t("devMonitor.title")}</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("devMonitor.subtitle")}</p>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap" }}>
        {["today", "yesterday", "7days", "30days"].map((f) => (
          <button key={f} style={dateBtnStyle(f)} onClick={() => setDateFilter(f)}>{t(DATE_FILTER_LABEL_KEYS[f])}</button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="error" size={12} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("devMonitor.loading")}</div>
      ) : stats.total === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("devMonitor.noData")}</div>
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

          {/* Daily breakdown */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="chart" size={13} /> {t("devMonitor.dailyBreakdownTitle")}
            </h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110, overflowX: "auto" }}>
              {stats.dailyBreakdown.map((d) => {
                const total = d.success + d.error;
                const h = (total / maxDayTotal) * 100;
                const successH = total ? (d.success / total) * h : 0;
                const errorH = total ? (d.error / total) * h : 0;
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
                      {[t("devMonitor.table.user"), t("devMonitor.table.events"), t("devMonitor.table.errors")].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.perUser.map((u) => (
                      <tr key={u.user}>
                        <td style={{ padding: "6px 8px", color: "var(--ne-text)" }}>{u.user}</td>
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
        </>
      )}
    </div>
  );
}
