import { useState, useEffect, useMemo, Fragment } from "react";
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
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [dateFilter, setDateFilter] = useState("today");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentsError, setDeploymentsError] = useState("");

  const [brandFilter, setBrandFilter] = useState("");
  const [endpointFilter, setEndpointFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const storeMap = useMemo(() => {
    const map = {};
    (allStores || []).forEach((s) => { map[s.id] = s.store_name; });
    return map;
  }, [allStores]);

  useEffect(() => { loadLogs(); }, [dateFilter]);
  useEffect(() => { loadDeployments(); }, []);

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
          .select("*")
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

  return (
    <div style={{ ...cardStyle, padding: "1.25rem" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="database" size={16} /> Dev Monitor — Detailed
      </h1>
      <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ne-muted)" }}>Raw logs, filters, aur recent deployments.</p>

      <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
        {["today", "yesterday", "7days", "30days"].map((f) => (
          <button key={f} style={dateBtnStyle(f)} onClick={() => setDateFilter(f)}>{t(DATE_FILTER_LABEL_KEYS[f])}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={controlStyle}>
          <option value="">Sab Brands</option>
          {(allStores || []).map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
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

      {error && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)" }}>{t("devMonitor.loading")}</div>
      ) : filteredLogs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted-2)", fontSize: 12 }}>Koi log match nahi hui.</div>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr>
                {["", "Time", "Brand", "Endpoint", "Status", "HTTP", "Order ID", "Error"].map((h) => (
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
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ padding: "10px 12px", background: "var(--ne-surface)", borderBottom: "1px solid var(--ne-border)" }}>
                          <div style={{ display: "grid", gap: 8 }}>
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
