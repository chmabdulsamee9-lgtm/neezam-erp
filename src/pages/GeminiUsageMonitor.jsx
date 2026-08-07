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
// call-types (reformat/grounded/translate).
const GEMINI_ACTIONS = ["gemini_reformat", "gemini_grounded", "gemini_translate"];

// GEMINI_MODEL_FALLBACK_CHAIN (worker/index.js) ke exact do models — free-tier RPD
// (requests-per-day) limit dono ke liye 500 hai, per key.
const QUOTA_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
const DAILY_LIMIT = 500;

// Worker ab per-model/per-key subrequest logs batch karta hai — ek dev_monitoring_log
// row mein saare attempts (skipped + terminal) ek details.attempts[] array mein, is
// se pehle har attempt apni alag row leta tha (details.model/key_label/skip_reason
// seedha row par). Dono shapes ko ek consistent "event" list mein normalize karte hain
// taake purana logged data (attempts array ke bina) bhi dashboard se ghayab na ho.
function eventsFromLog(log) {
  const attempts = log.details?.attempts;
  if (Array.isArray(attempts)) {
    return attempts.map((a) => ({
      model: a.model || "(unknown model)",
      key_label: a.key_label || "(unknown key)",
      result: a.result || "error",
      reason: a.reason || null,
      created_at: log.created_at,
    }));
  }
  // Purana (pre-batching) format — khud row hi ek event hai.
  return [{
    model: log.details?.model || "(unknown model)",
    key_label: log.details?.key_label || "(unknown key)",
    result: log.status,
    reason: log.details?.skip_reason || log.details?.step || null,
    created_at: log.created_at,
  }];
}

// Recent-errors card ke liye — jis model/key ne is call type ko terminal error diya
// (naye batched format mein attempts[] ka aakhri entry, purane format mein seedha
// details.model/key_label).
function terminalAttemptInfo(log) {
  const attempts = log.details?.attempts;
  if (Array.isArray(attempts) && attempts.length > 0) {
    const last = attempts[attempts.length - 1];
    return { model: last.model, key_label: last.key_label, reason: last.reason };
  }
  return { model: log.details?.model || null, key_label: log.details?.key_label || null, reason: log.details?.step || null };
}

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

  const [quotaLogs, setQuotaLogs] = useState([]);
  const [quotaError, setQuotaError] = useState("");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { loadLogs(); }, [dateFilter]);
  useEffect(() => { loadKeys(); }, []);
  useEffect(() => { loadQuotaToday(); }, []);

  const loadKeys = async () => {
    setKeysLoading(true);
    // api_key khud KABHI nahi select karte — sirf label/status/creation date, same
    // security discipline jo worker ke logGeminiUsage() bhi follow karta hai (key
    // kabhi log/return nahi hoti, sirf uska human label).
    const { data } = await supabase.from("gemini_api_keys").select("id,label,is_active,created_at").order("created_at");
    setKeys(data || []);
    setKeysLoading(false);
  };

  async function loadQuotaToday() {
    // Google free-tier RPD resets at midnight Pacific Time — this is a FIXED
    // day boundary, independent of whatever dateFilter (Today/Yesterday/7days/
    // 30days) the person has selected above for browsing logs.
    const now = new Date();
    const pacificNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const pacificMidnight = new Date(pacificNow.getFullYear(), pacificNow.getMonth(), pacificNow.getDate());
    // Convert that Pacific midnight back to a real UTC instant for the query boundary.
    const offsetMs = now.getTime() - pacificNow.getTime();
    const utcBoundary = new Date(pacificMidnight.getTime() + offsetMs);

    const { data, error: fetchError } = await supabase
      .from("dev_monitoring_log")
      .select("id,created_at,action,status,details")
      .in("action", GEMINI_ACTIONS)
      .gte("created_at", utcBoundary.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);
    if (fetchError) { setQuotaError(fetchError.message); return; }
    setQuotaLogs(data || []);
  }

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
    // Har log row ko (naya batched ya purana single-attempt format) ek consistent
    // per-model-attempt "event" list mein flatten karte hain — stat cards/breakdowns
    // isi granularity pe pehle bhi kaam karte the (har model attempt apna row tha),
    // ab bhi wahi semantics rakhte hain, bas source ab kam rows se zyada events hain.
    const events = logs.flatMap(eventsFromLog);

    const total = events.length;
    const successCount = events.filter((e) => e.result === "success").length;
    const errorCount = events.filter((e) => e.result === "error").length;
    const skippedCount = events.filter((e) => e.result === "skipped").length;

    // key_label -> { totals: {success,error,skipped}, models: { model -> {success,error,skipped} } }
    const byKey = {};
    events.forEach((e) => {
      if (!byKey[e.key_label]) byKey[e.key_label] = { totals: { success: 0, error: 0, skipped: 0 }, models: {} };
      byKey[e.key_label].totals[e.result] = (byKey[e.key_label].totals[e.result] || 0) + 1;
      if (!byKey[e.key_label].models[e.model]) byKey[e.key_label].models[e.model] = { success: 0, error: 0, skipped: 0 };
      byKey[e.key_label].models[e.model][e.result] = (byKey[e.key_label].models[e.model][e.result] || 0) + 1;
    });

    const skipReasonMap = {};
    events.forEach((e) => {
      if (e.result !== "skipped") return;
      const reason = e.reason || "(unknown)";
      skipReasonMap[reason] = (skipReasonMap[reason] || 0) + 1;
    });

    const dayMap = {};
    events.forEach((e) => {
      const key = ymd(new Date(e.created_at));
      if (!dayMap[key]) dayMap[key] = { key, success: 0, error: 0, skipped: 0 };
      dayMap[key][e.result] = (dayMap[key][e.result] || 0) + 1;
    });
    const dailyBreakdown = Object.values(dayMap).sort((a, b) => (a.key < b.key ? -1 : 1));

    // Recent errors row-level rehta hai (ek call type ki terminal error message,
    // kisi individual skipped model ki nahi) — render terminalAttemptInfo() se
    // model/key nikalta hai, dono formats ke liye.
    const recentErrors = logs.filter((l) => l.status === "error").slice(0, 20);

    return { total, successCount, errorCount, skippedCount, byKey, skipReasonMap, dailyBreakdown, recentErrors };
  }, [logs]);

  // Per-key/per-model usage-against-limit, Pacific-day quotaLogs se (reuses
  // eventsFromLog() — same normalization as the main stats above, koi duplicate
  // logic nahi). Event count (success+skipped+error, sab) usage estimate ke taur pe
  // use karte hain — approximation hai, kyunke humein confirm nahi ke Google
  // 429/404 (skipped/error) attempts ko bhi RPD mein count karta hai ya nahi. Total
  // count hi safest upper-bound estimate hai (undercount karke real 429 hit karne se
  // behtar hai thoda overcount karna).
  const quotaStats = useMemo(() => {
    const events = quotaLogs.flatMap(eventsFromLog);
    const byKey = {};
    events.forEach((e) => {
      if (!QUOTA_MODELS.includes(e.model)) return;
      if (!byKey[e.key_label]) byKey[e.key_label] = {};
      byKey[e.key_label][e.model] = (byKey[e.key_label][e.model] || 0) + 1;
    });

    const activeKeyLabels = keys.filter((k) => k.is_active).map((k) => k.label);
    const allKeysTotal = {};
    QUOTA_MODELS.forEach((model) => {
      allKeysTotal[model] = activeKeyLabels.reduce((sum, label) => sum + (byKey[label]?.[model] || 0), 0);
    });
    const grandTotal = QUOTA_MODELS.reduce((sum, model) => sum + allKeysTotal[model], 0);

    return { byKey, allKeysTotal, grandTotal };
  }, [quotaLogs, keys]);

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

          {/* Quota Today — Pacific-time reset (loadQuotaToday, independent of the
              dateFilter buttons above), estimate from our own logs against Google's
              known 500 RPD free-tier limit per model per key — not live Google data,
              no public API exists for that. */}
          <div style={{ ...cardStyle, marginBottom: "0.75rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="zap" size={13} /> Quota Today (Pacific Time reset)
            </h2>
            {quotaError && (
              <div style={{ fontSize: 11, color: "var(--ne-danger)", marginBottom: 8 }}>{quotaError}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {keys.filter((k) => k.is_active).map((k) => (
                <div key={k.id}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ne-text)", marginBottom: 4 }}>{k.label}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {QUOTA_MODELS.map((model) => {
                      const used = quotaStats.byKey[k.label]?.[model] || 0;
                      const pct = Math.min(100, (used / DAILY_LIMIT) * 100);
                      const barColor = pct >= 90 ? "var(--ne-danger)" : pct >= 60 ? "var(--ne-warning)" : "var(--ne-success)";
                      return (
                        <div key={model} style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--ne-muted-2)", marginBottom: 2 }}>
                            <span style={{ fontFamily: "monospace" }}>{model}</span>
                            <span style={{ color: barColor, fontWeight: 700 }}>{used} / {DAILY_LIMIT}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 4, background: "var(--ne-bg)", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(() => {
                const activeCount = keys.filter((k) => k.is_active).length;
                const capacity = activeCount * DAILY_LIMIT * QUOTA_MODELS.length;
                const combinedPct = capacity ? Math.min(100, (quotaStats.grandTotal / capacity) * 100) : 0;
                const combinedColor = combinedPct >= 90 ? "var(--ne-danger)" : combinedPct >= 60 ? "var(--ne-warning)" : "var(--ne-success)";
                return (
                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--ne-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
                      <span>Combined (all active keys)</span>
                      <span style={{ color: combinedColor }}>{quotaStats.grandTotal} / {capacity}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: "var(--ne-bg)", overflow: "hidden", marginTop: 3 }}>
                      <div style={{ width: `${combinedPct}%`, height: "100%", background: combinedColor, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })()}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 10, color: "var(--ne-muted-2)", fontStyle: "italic" }}>
              Yeh estimate hamare apne logs se calculate hota hai, Google ki live quota se seedha nahi milta — asal availability thodi kam ho sakti hai agar Google kuch attempts ko RPD mein count na kare.
            </p>
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
                {stats.recentErrors.map((l) => {
                  const terminal = terminalAttemptInfo(l);
                  return (
                    <div key={l.id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, color: "var(--ne-danger)" }}>{l.action} · {terminal.key_label || "—"} · {terminal.model || "—"}</span>
                        <span style={{ color: "var(--ne-muted-2)", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                      <div style={{ color: "var(--ne-muted)" }}>{l.error_message || "—"}</div>
                      <div style={{ color: "var(--ne-muted-2)", marginTop: 2 }}>order_id: {l.details?.order_id || "—"} · step: {terminal.reason || "—"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
