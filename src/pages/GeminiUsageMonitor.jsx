import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import Icon from "../components/Icon";

// DevMonitorDetailed.jsx ke exact date-filter pattern se liya (koi custom date-range
// picker Dev Monitor mein nahi hai — sirf yeh 4 quick buttons).
const DATE_FILTER_LABELS = { today: "Today", yesterday: "Yesterday", "7days": "7 Days", "30days": "30 Days" };

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

// Gemini calls jo abhi is monitor mein cover hote hain — matchOrderAddress() ke teeno
// call-types (reformat/grounded/translate), teeno EXACT isi shape ke sath log hote hain
// (logGeminiUsage/logGeminiSkip, worker/index.js).
const GEMINI_ACTIONS = ["gemini_reformat", "gemini_grounded", "gemini_translate"];

// cfUrl/session props App.jsx se DevMonitorDetailed jaisa hi pass hote hain (consistency
// ke liye) — is page ko unki zaroorat nahi (supabase client ka ambient session use karta
// hai), DevMonitorDetailed bhi wahi extra props leta hai bina destructure kiye.
export default function GeminiUsageMonitor() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState("today");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [keys, setKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { loadLogs(); }, [dateFilter]);
  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    setKeysLoading(true);
    // api_key khud KABHI nahi select karte — sirf label/status/creation date, same
    // security discipline jo worker ke logGeminiUsage() bhi follow karta hai (key
    // kabhi log/return nahi hoti, sirf uska human label).
    const { data } = await supabase.from("gemini_api_keys").select("id,label,is_active,created_at").order("created_at");
    setKeys(data || []);
    setKeysLoading(false);
  };

  const loadLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const { from, to } = getDateRange(dateFilter);
      const PAGE_SIZE = 1000;
      let allRows = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error: fetchError } = await supabase
          .from("dev_monitoring_log")
          .select("id,created_at,action,status,error_message,details")
          .in("action", GEMINI_ACTIONS)
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString())
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (fetchError) throw fetchError;
        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break; // last page reached
        offset += PAGE_SIZE;
        if (offset > 50000) break; // hard safety ceiling so a runaway date-range can't loop forever
      }
      setLogs(allRows);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const stats = useMemo(() => {
    const total = logs.length;
    const successCount = logs.filter((l) => l.status === "success").length;
    const errorCount = logs.filter((l) => l.status === "error").length;
    const skippedCount = logs.filter((l) => l.status === "skipped").length;

    // key_label -> { totals: {success,error,skipped}, models: { model -> {success,error,skipped} } }
    const byKey = {};
    logs.forEach((l) => {
      const keyLabel = l.details?.key_label || "(unknown key)";
      const model = l.details?.model || "(unknown model)";
      if (!byKey[keyLabel]) byKey[keyLabel] = { totals: { success: 0, error: 0, skipped: 0 }, models: {} };
      byKey[keyLabel].totals[l.status] = (byKey[keyLabel].totals[l.status] || 0) + 1;
      if (!byKey[keyLabel].models[model]) byKey[keyLabel].models[model] = { success: 0, error: 0, skipped: 0 };
      byKey[keyLabel].models[model][l.status] = (byKey[keyLabel].models[model][l.status] || 0) + 1;
    });

    const skipReasonMap = {};
    logs.forEach((l) => {
      if (l.status !== "skipped") return;
      const reason = l.details?.skip_reason || "(unknown)";
      skipReasonMap[reason] = (skipReasonMap[reason] || 0) + 1;
    });

    const dayMap = {};
    logs.forEach((l) => {
      const key = ymd(new Date(l.created_at));
      if (!dayMap[key]) dayMap[key] = { key, success: 0, error: 0, skipped: 0 };
      dayMap[key][l.status] = (dayMap[key][l.status] || 0) + 1;
    });
    const dailyBreakdown = Object.values(dayMap).sort((a, b) => (a.key < b.key ? -1 : 1));

    const recentErrors = logs.filter((l) => l.status === "error").slice(0, 20);

    return { total, successCount, errorCount, skippedCount, byKey, skipReasonMap, dailyBreakdown, recentErrors };
  }, [logs]);

  const toggleKeyExpand = (keyLabel) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyLabel)) next.delete(keyLabel); else next.add(keyLabel);
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
  const thStyle = { textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase" };
  const tdStyle = { padding: "6px 8px" };
  const skipReasonColor = { quota_exceeded: "var(--ne-warning)", deprecated: "var(--ne-muted)", unsupported_tool: "var(--ne-danger)" };

  const statCards = [
    { label: "Total Calls", value: stats.total, color: "var(--ne-accent)" },
    { label: "Success", value: stats.successCount, color: "var(--ne-success)" },
    { label: "Error", value: stats.errorCount, color: "var(--ne-danger)" },
    { label: "Skipped", value: stats.skippedCount, color: "var(--ne-warning)" },
  ];
  const maxDayTotal = Math.max(...stats.dailyBreakdown.map((d) => d.success + d.error + d.skipped), 1);
  const keyLabels = Object.keys(stats.byKey).sort((a, b) => (stats.byKey[b].totals.success + stats.byKey[b].totals.error + stats.byKey[b].totals.skipped) - (stats.byKey[a].totals.success + stats.byKey[a].totals.error + stats.byKey[a].totals.skipped));

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <button onClick={() => navigate('/master-dashboard')}
        style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--ne-border)', background: 'transparent', color: 'var(--ne-muted)', fontSize: 12, cursor: 'pointer', marginBottom: 14 }}>
        Back to Master
      </button>

      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="zap" size={17} /> Gemini Usage Monitor</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>Model fallback chain usage across all active keys — reformat, grounded search, and Urdu-translation calls</p>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap" }}>
        {["today", "yesterday", "7days", "30days"].map((f) => (
          <button key={f} style={dateBtnStyle(f)} onClick={() => setDateFilter(f)}>{DATE_FILTER_LABELS[f]}</button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="error" size={12} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>Loading...</div>
      ) : stats.total === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12, marginBottom: 20 }}>No Gemini calls logged for this range.</div>
      ) : (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: "0.6rem", marginBottom: "0.75rem" }}>
            {statCards.map((c) => (
              <div key={c.label} style={{ ...cardStyle, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 9.5, color: "var(--ne-muted)", fontWeight: 600, marginTop: 3 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Daily breakdown — success/error/skipped stacked bars, same plain HTML/CSS
              technique DevMonitorDetailed uses (no charting library in this codebase) */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="chart" size={13} /> Daily Call Volume
            </h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110, overflowX: "auto" }}>
              {stats.dailyBreakdown.map((d) => {
                const dTotal = d.success + d.error + d.skipped;
                const h = (dTotal / maxDayTotal) * 100;
                const successH = dTotal ? (d.success / dTotal) * h : 0;
                const errorH = dTotal ? (d.error / dTotal) * h : 0;
                const skippedH = dTotal ? (d.skipped / dTotal) * h : 0;
                return (
                  <div key={d.key} title={`${d.key}: ${d.success} success, ${d.error} error, ${d.skipped} skipped`} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", width: 20, flexShrink: 0 }}>
                    <div style={{ height: `${errorH}%`, background: "var(--ne-danger)", borderRadius: "3px 3px 0 0", minHeight: d.error > 0 ? 2 : 0 }} />
                    <div style={{ height: `${skippedH}%`, background: "var(--ne-warning)", minHeight: d.skipped > 0 ? 2 : 0 }} />
                    <div style={{ height: `${successH}%`, background: "var(--ne-success)", minHeight: d.success > 0 ? 2 : 0 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: "var(--ne-muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ne-success)", display: "inline-block" }} /> Success</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ne-warning)", display: "inline-block" }} /> Skipped</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ne-danger)", display: "inline-block" }} /> Error</span>
            </div>
          </div>

          {/* Skip-reason breakdown */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="warning" size={13} /> Skip Reasons
            </h2>
            {Object.keys(stats.skipReasonMap).length === 0 ? (
              <p style={{ color: "var(--ne-muted-2)", fontSize: 12, margin: 0 }}>No skipped attempts in this range.</p>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Object.entries(stats.skipReasonMap).map(([reason, count]) => (
                  <div key={reason} style={{ padding: "8px 14px", borderRadius: 10, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", minWidth: 120 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: skipReasonColor[reason] || "var(--ne-muted)" }}>{count}</div>
                    <div style={{ fontSize: 10, color: "var(--ne-muted)", marginTop: 2 }}>{reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-key / per-model breakdown */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="key" size={13} /> Usage by Key
            </h2>
            {keysLoading ? (
              <div style={{ textAlign: "center", padding: "1rem", color: "var(--ne-muted)" }}>Loading keys...</div>
            ) : keys.length === 0 ? (
              <p style={{ color: "var(--ne-muted-2)", fontSize: 12, margin: 0 }}>No gemini_api_keys rows found.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {keys.map((k) => {
                  const usage = stats.byKey[k.label];
                  const isOpen = expandedKeys.has(k.label);
                  const t = usage?.totals || { success: 0, error: 0, skipped: 0 };
                  return (
                    <div key={k.id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, overflow: "hidden" }}>
                      <div onClick={() => usage && toggleKeyExpand(k.label)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: usage ? "pointer" : "default" }}>
                        {usage ? (
                          <Icon name="chevronDown" size={11} style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s", flexShrink: 0 }} />
                        ) : <span style={{ width: 11, flexShrink: 0 }} />}
                        <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: k.is_active ? "var(--ne-success-soft)" : "var(--ne-surface-2)", color: k.is_active ? "var(--ne-success)" : "var(--ne-muted-2)", flexShrink: 0 }}>
                          {k.is_active ? "active" : "inactive"}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 12.5, flex: 1 }}>{k.label}</span>
                        <span style={{ fontSize: 11, color: "var(--ne-success)" }}>{t.success} ok</span>
                        <span style={{ fontSize: 11, color: "var(--ne-warning)" }}>{t.skipped} skip</span>
                        <span style={{ fontSize: 11, color: "var(--ne-danger)" }}>{t.error} err</span>
                      </div>
                      {isOpen && usage && (
                        <div style={{ padding: "0 12px 12px", overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                            <thead>
                              <tr>
                                {["Model", "Success", "Skipped", "Error"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(usage.models).map(([model, counts]) => (
                                <tr key={model}>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 10.5 }}>{model}</td>
                                  <td style={{ ...tdStyle, color: "var(--ne-success)" }}>{counts.success || 0}</td>
                                  <td style={{ ...tdStyle, color: "var(--ne-warning)" }}>{counts.skipped || 0}</td>
                                  <td style={{ ...tdStyle, color: "var(--ne-danger)" }}>{counts.error || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Log rows whose key_label doesn't match any current gemini_api_keys row
                    (e.g. a key that's since been removed) — still show so usage isn't lost. */}
                {keyLabels.filter((label) => !keys.some((k) => k.label === label)).map((label) => {
                  const usage = stats.byKey[label];
                  const isOpen = expandedKeys.has(label);
                  return (
                    <div key={label} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, overflow: "hidden" }}>
                      <div onClick={() => toggleKeyExpand(label)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
                        <Icon name="chevronDown" size={11} style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s", flexShrink: 0 }} />
                        <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "var(--ne-surface-2)", color: "var(--ne-muted-2)", flexShrink: 0 }}>removed</span>
                        <span style={{ fontWeight: 700, fontSize: 12.5, flex: 1 }}>{label}</span>
                        <span style={{ fontSize: 11, color: "var(--ne-success)" }}>{usage.totals.success} ok</span>
                        <span style={{ fontSize: 11, color: "var(--ne-warning)" }}>{usage.totals.skipped} skip</span>
                        <span style={{ fontSize: 11, color: "var(--ne-danger)" }}>{usage.totals.error} err</span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: "0 12px 12px", overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                            <thead>
                              <tr>{["Model", "Success", "Skipped", "Error"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {Object.entries(usage.models).map(([model, counts]) => (
                                <tr key={model}>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 10.5 }}>{model}</td>
                                  <td style={{ ...tdStyle, color: "var(--ne-success)" }}>{counts.success || 0}</td>
                                  <td style={{ ...tdStyle, color: "var(--ne-warning)" }}>{counts.skipped || 0}</td>
                                  <td style={{ ...tdStyle, color: "var(--ne-danger)" }}>{counts.error || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent errors */}
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="warning" size={13} /> Recent Errors
            </h2>
            {stats.recentErrors.length === 0 ? (
              <p style={{ color: "var(--ne-muted-2)", fontSize: 12, margin: 0 }}>No errors in this range.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                {stats.recentErrors.map((l) => (
                  <div key={l.id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, color: "var(--ne-danger)" }}>{l.action} · {l.details?.key_label || "—"} · {l.details?.model || "—"}</span>
                      <span style={{ color: "var(--ne-muted-2)", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                    <div style={{ color: "var(--ne-muted)" }}>{l.error_message || "—"}</div>
                    <div style={{ color: "var(--ne-muted-2)", marginTop: 2 }}>order_id: {l.details?.order_id || "—"} · step: {l.details?.step || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
