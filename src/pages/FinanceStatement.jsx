import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { SkelBar, SkelTable } from "../components/Skeletons";
import { useLanguage, useTranslation } from "../i18n";
import { csvEscapeCell, downloadCsv, sanitizeFilenamePart } from "../utils/csvExport";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const PERIODS_PER_PAGE = 10;

// Worker ke getDexStatementPeriod() ka EXACT wahi PKT (UTC+5, no DST) logic — dono taraf
// same boundaries banain zaroori hai, warna frontend jo period_start/period_end bhejega
// woh backend ke apne computed period se off-by-kuch-ghante ho sakta hai.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
function getDexStatementPeriod(date) {
  const pkt = new Date(date.getTime() + PKT_OFFSET_MS);
  const dayOfWeek = pkt.getUTCDay();
  const dayOfWeekMon = (dayOfWeek + 6) % 7;
  const pktMidnightUtcMs = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) - PKT_OFFSET_MS;
  let startOffsetDays, periodLengthDays;
  if (dayOfWeekMon <= 2) { startOffsetDays = -dayOfWeekMon; periodLengthDays = 3; }
  else { startOffsetDays = -(dayOfWeekMon - 3); periodLengthDays = 4; }
  const start = new Date(pktMidnightUtcMs + startOffsetDays * 86400000);
  const end = new Date(start.getTime() + periodLengthDays * 86400000);
  return { start, end };
}

// Current period se peeche walk karta hai — har dafa pichle period ke start se 1ms
// pehle jump karke wapas getDexStatementPeriod() call karta hai, taake guaranteed theek
// pichla period mile (koi date-arithmetic assumption nahi). Walks back until it reaches
// (or passes) sinceDate — i.e. ALL periods that could have real order data, not a fixed
// count — so pagination below pages through the full list rather than truncating it.
// sinceDate null/undefined (still loading, or store genuinely has no dated orders yet)
// -> just the current period, nothing to page through yet.
function getPeriodsSince(sinceDate) {
  if (!sinceDate) return [getDexStatementPeriod(new Date())];
  const periods = [];
  let cursor = new Date();
  while (true) {
    const p = getDexStatementPeriod(cursor);
    periods.push(p);
    if (p.start <= sinceDate) break;
    cursor = new Date(p.start.getTime() - 1);
    if (periods.length > 520) break; // safety cap (~10 years of periods) against a runaway loop
  }
  return periods;
}

const fmtDate = (d) => d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
const fmtMoney = (n) => `Rs. ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodKey = (p) => `${p.start.toISOString()}__${p.end.toISOString()}`;

// Plain "YYYY-MM-DD" in PKT, mirroring the worker's own toDateStrPKT() — used for the
// per-period CSV export's start_date/end_date query params.
const toDateStrPKT = (date) => {
  const pkt = new Date(date.getTime() + PKT_OFFSET_MS);
  return `${pkt.getUTCFullYear()}-${String(pkt.getUTCMonth() + 1).padStart(2, "0")}-${String(pkt.getUTCDate()).padStart(2, "0")}`;
};

// ---------- CSV export (client-side Blob + anchor download, no backend storage) ----------
// csvEscapeCell/downloadCsv/sanitizeFilenamePart relocated to ../utils/csvExport (imported
// above) so other pages can reuse them — identical implementations, zero functional change here.
const ORDER_EXPORT_HEADERS = ["Statement Period", "Order No.", "External Order No.", "Tracking No.", "Province", "City", "Courier Status", "COD Amount", "Shipping Fee", "VAT", "Income Tax", "Sales Tax", "Net Payable"];
const ORDER_EXPORT_KEYS = ["statement_period", "order_id", "external_order_no", "tracking_no", "province", "city", "courier_status", "cod_amount", "shipping_fee", "vat", "income_tax", "sales_tax", "net_payable"];
const buildOrdersCsv = (rows) => {
  const lines = [ORDER_EXPORT_HEADERS.map(csvEscapeCell).join(",")];
  rows.forEach((row) => {
    lines.push(ORDER_EXPORT_KEYS.map((k) => csvEscapeCell(row[k])).join(","));
  });
  return lines.join("\r\n");
};

const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px" };
const toolbarBtnStyle = {
  padding: "7px 14px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)",
  color: "var(--ne-text)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};
const iconBtnStyle = {
  background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-muted)", borderRadius: 7,
  padding: "5px 7px", display: "inline-flex", alignItems: "center", justifyContent: "center",
};

function StatementRow({ period, t, cfUrl, storeId, ordersStore }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // Collapsed header ko bhi Total Payable/counts/approximation-warning dikhani hai
  // (ab sirf expand karne pe nahi), isliye fetch ab mount pe hi ho jata hai — pehle
  // wala lazy-on-first-expand pattern is requirement se match nahi karta tha.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${cfUrl}/finance-statement?store_id=${encodeURIComponent(storeId)}&period_start=${encodeURIComponent(period.start.toISOString())}&period_end=${encodeURIComponent(period.end.toISOString())}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfUrl, storeId]);

  const toggle = () => setExpanded((e) => !e);
  const [exporting, setExporting] = useState(false);

  const exportThisPeriod = async (e) => {
    e.stopPropagation();
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const startStr = toDateStrPKT(period.start);
      const endStr = toDateStrPKT(new Date(period.end.getTime() - 1));
      const res = await fetch(`${cfUrl}/finance-statement-orders?store_id=${encodeURIComponent(storeId)}&start_date=${startStr}&end_date=${endStr}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (json.error) { setError(json.error); setExporting(false); return; }
      downloadCsv(`Statement_${sanitizeFilenamePart(ordersStore?.store_name)}_${startStr}_to_${endStr}.csv`, buildOrdersCsv(json.orders || []));
    } catch (err) {
      setError(err.message);
    }
    setExporting(false);
  };

  const lastDay = new Date(period.end.getTime() - 1);
  const approximatedCount = (data?.line_items || []).filter((li) => li.approximated_rate).length;
  const skippedCount = (data?.line_items || []).filter((li) => li.skipped).length;

  // Skipped rows (koi COD/shipping/vat waghera computed hi nahi, unmatched orphan
  // Delivered) averages se exclude — warna "—" ko 0 treat karke average galat neeche
  // khinch degi. Averages sirf un rows pe jinke liye asal numbers maujood hain.
  const costedItems = (data?.line_items || []).filter((li) => !li.skipped);
  const avgOf = (field) => (costedItems.length > 0 ? costedItems.reduce((s, li) => s + (Number(li[field]) || 0), 0) / costedItems.length : null);
  const averages = costedItems.length > 0 ? {
    cod_amount: avgOf("cod_amount"), shipping_fee: avgOf("shipping_fee"), vat: avgOf("vat"),
    income_tax: avgOf("income_tax"), sales_tax: avgOf("sales_tax"), total_deduction: avgOf("total_deduction"), payable: avgOf("payable"),
  } : null;

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden", marginBottom: 10 }}>
      <div onClick={toggle}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="calculator" size={15} style={{ color: "var(--ne-accent)" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{fmtDate(period.start)} — {fmtDate(lastDay)}</div>
            <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)" }}>{t("finance.periodDays")}: {Math.round((period.end - period.start) / 86400000)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {data && !loading && (
            <div style={{ fontSize: 13, fontWeight: 700, color: data.total_payable >= 0 ? "var(--ne-success)" : "var(--ne-danger)" }}>
              {fmtMoney(data.total_payable)}
            </div>
          )}
          <button onClick={exportThisPeriod} disabled={exporting} title={t("finance.downloadPeriodTooltip")}
            style={{ ...iconBtnStyle, opacity: exporting ? 0.6 : 1, cursor: exporting ? "default" : "pointer" }}>
            <Icon name="download" size={13} />
          </button>
          <button style={{ ...toolbarBtnStyle, padding: "5px 10px", fontSize: 10.5 }}>
            <Icon name={expanded ? "chevronDown" : "arrowRight"} size={10} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            {expanded ? t("finance.seeLess") : t("finance.seeMore")}
          </button>
        </div>
      </div>

      {/* Collapsed AND expanded dono mein visible — Period/Total Payable header ke
          upar, counts + approximation warning yahan, taake See More kholay bina bhi
          period ka pura summary dikhe. */}
      {loading ? (
        <SkelBar h={60} />
      ) : error ? (
        <div style={{ padding: "0 18px 12px", color: "var(--ne-danger)", fontSize: 11 }}>{error}</div>
      ) : data ? (
        <div style={{ padding: "0 18px 12px" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: "var(--ne-muted-2)", marginBottom: (approximatedCount > 0 || skippedCount > 0) ? 8 : 0 }}>
            <span>{t("finance.orderCount")}: <b style={{ color: "var(--ne-text)" }}>{data.order_count}</b></span>
            <span>{t("finance.matchedCount")}: <b style={{ color: "var(--ne-text)" }}>{data.matched_count}</b></span>
            <span>{t("finance.unmatchedCount")}: <b style={{ color: "var(--ne-warning)" }}>{data.unmatched_count}</b></span>
            {approximatedCount > 0 && <span>{t("finance.approximatedCount")}: <b style={{ color: "var(--ne-warning)" }}>{approximatedCount}</b></span>}
            {skippedCount > 0 && <span>{t("finance.skippedCount")}: <b style={{ color: "var(--ne-danger)" }}>{skippedCount}</b></span>}
          </div>
          {(approximatedCount > 0 || skippedCount > 0) && (
            <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 9, background: "var(--ne-warning-soft)", color: "var(--ne-warning)", fontSize: 10.5, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="warning" size={11} /> {t("finance.approximationNote")}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: "var(--ne-surface)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 8, fontWeight: 700 }}>{t("finance.codBlockTitle")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "var(--ne-muted-2)" }}>{t("finance.totalCod")}</span>
                <span style={{ color: "var(--ne-text)", fontWeight: 600 }}>{fmtMoney(data.total_cod)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--ne-muted-2)" }}>{t("finance.totalIncomeTax")}</span>
                <span style={{ color: "var(--ne-danger)" }}>-{fmtMoney(data.total_income_tax)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--ne-muted-2)" }}>{t("finance.totalSalesTax")}</span>
                <span style={{ color: "var(--ne-danger)" }}>-{fmtMoney(data.total_sales_tax)}</span>
              </div>
            </div>
            <div style={{ background: "var(--ne-surface)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 8, fontWeight: 700 }}>{t("finance.shippingBlockTitle")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "var(--ne-muted-2)" }}>{t("finance.totalShippingFee")}</span>
                <span style={{ color: "var(--ne-danger)" }}>-{fmtMoney(data.total_shipping_fee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--ne-muted-2)" }}>{t("finance.totalVat")}</span>
                <span style={{ color: "var(--ne-danger)" }}>-{fmtMoney(data.total_vat)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {expanded && data && (
        <div style={{ borderTop: "1px solid var(--ne-border)", padding: "14px 18px" }}>
          {data.line_items?.length > 0 && (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    {[t("finance.col.order"), t("finance.col.status"), t("finance.col.province"), t("finance.col.cod"), t("finance.col.shippingFee"), t("finance.col.vat"), t("finance.col.incomeTax"), t("finance.col.salesTax"), t("finance.col.totalDeduction"), t("finance.col.payable")].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 9.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.line_items.map((li, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--ne-border)", opacity: li.skipped ? 0.55 : 1 }}>
                      <td style={{ padding: "5px 8px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>
                        {li.order_id ? (
                          <a href={`https://${ordersStore?.shopify_url}/admin/orders/${li.order_id}`} target="_blank" rel="noreferrer"
                            style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none" }}>
                            {li.order_number || li.order_id}
                          </a>
                        ) : (li.order_number || "—")}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: 9.5, fontWeight: 700, background: li.status === "Delivered" ? "var(--ne-success-soft)" : "var(--ne-danger-soft)", color: li.status === "Delivered" ? "var(--ne-success)" : "var(--ne-danger)" }}>
                          {li.status}
                        </span>
                      </td>
                      <td style={{ padding: "5px 8px", color: "var(--ne-muted)" }}>
                        {li.province_used || "—"}{li.approximated_rate && <Icon name="warning" size={9} style={{ marginLeft: 4, color: "var(--ne-warning)" }} />}
                      </td>
                      <td style={{ padding: "5px 8px", color: "var(--ne-text)" }}>{li.skipped ? "—" : fmtMoney(li.cod_amount)}</td>
                      <td style={{ padding: "5px 8px", color: "var(--ne-text)" }}>{li.skipped ? "—" : fmtMoney(li.shipping_fee)}</td>
                      <td style={{ padding: "5px 8px", color: "var(--ne-text)" }}>{li.skipped ? "—" : fmtMoney(li.vat)}</td>
                      <td style={{ padding: "5px 8px", color: "var(--ne-text)" }}>{li.skipped ? "—" : fmtMoney(li.income_tax)}</td>
                      <td style={{ padding: "5px 8px", color: "var(--ne-text)" }}>{li.skipped ? "—" : fmtMoney(li.sales_tax)}</td>
                      <td style={{ padding: "5px 8px", color: "var(--ne-danger)", fontWeight: 600 }}>{li.skipped ? "—" : fmtMoney(li.total_deduction)}</td>
                      <td style={{ padding: "5px 8px", fontWeight: 700, color: li.skipped ? "var(--ne-muted-2)" : (li.payable >= 0 ? "var(--ne-success)" : "var(--ne-danger)") }}>
                        {li.skipped ? t("finance.skipped") : fmtMoney(li.payable)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {averages && (
                  <tfoot>
                    <tr style={{ background: "var(--ne-accent-soft)" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--ne-accent)" }}>{t("finance.averageRowLabel")}</td>
                      <td style={{ padding: "6px 8px" }}></td>
                      <td style={{ padding: "6px 8px" }}></td>
                      <td style={{ padding: "6px 8px", color: "var(--ne-accent)", fontWeight: 700 }}>{fmtMoney(averages.cod_amount)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--ne-accent)", fontWeight: 700 }}>{fmtMoney(averages.shipping_fee)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--ne-accent)", fontWeight: 700 }}>{fmtMoney(averages.vat)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--ne-accent)", fontWeight: 700 }}>{fmtMoney(averages.income_tax)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--ne-accent)", fontWeight: 700 }}>{fmtMoney(averages.sales_tax)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--ne-accent)", fontWeight: 700 }}>{fmtMoney(averages.total_deduction)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--ne-accent)", fontWeight: 700 }}>{fmtMoney(averages.payable)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RateCardModal({ t, cfUrl, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${cfUrl}/rate-card`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
        const json = await res.json();
        if (json.error) setError(json.error);
        else setRows(json.rows || []);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    })();
  }, [cfUrl]);

  const draftKey = (id, field) => `${id}::${field}`;
  const getValue = (row, field) => {
    const dk = draftKey(row.id, field);
    return dk in drafts ? drafts[dk] : row[field];
  };

  const commit = async (row, field) => {
    const dk = draftKey(row.id, field);
    if (!(dk in drafts)) return;
    const raw = drafts[dk];
    setDrafts((prev) => { const n = { ...prev }; delete n[dk]; return n; });
    const value = Number(raw);
    if (Number.isNaN(value)) return;
    if (Number(row[field]) === value) return;
    setSavingId(row.id);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/rate-card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id: row.id, [field]: value }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
      }
    } catch (err) {
      setError(err.message);
    }
    setSavingId(null);
  };

  const numInputStyle = { width: 64, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11.5, boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 560, maxWidth: "94vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="card" size={14} /> {t("finance.rateCardTitle")}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ne-muted)", cursor: "pointer", padding: 4, display: "flex" }}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
          {error && <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)" }}>{error}</div>}
          {loading ? (
            <SkelTable cols={4} rows={5} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  {[t("finance.col.province"), t("finance.col.shippingFee"), "VAT %", t("finance.col.incomeTaxPct"), t("finance.col.salesTaxPct")].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--ne-border)", opacity: savingId === row.id ? 0.6 : 1 }}>
                    <td style={{ padding: "6px 8px", color: "var(--ne-text)", fontWeight: 600, whiteSpace: "nowrap" }}>{row.province}</td>
                    {["shipping_fee", "vat_percent", "income_tax_percent", "sales_tax_percent"].map((field) => (
                      <td key={field} style={{ padding: "6px 8px" }}>
                        <input type="number" step="0.01" value={getValue(row, field)}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [draftKey(row.id, field)]: e.target.value }))}
                          onBlur={() => commit(row, field)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                          style={numInputStyle} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// Shared Previous/Next/numbered-page control — exact BookedOrders.jsx/Orders.jsx pattern,
// extracted here since both tabs need the identical widget.
function PageControls({ page, setPage, totalPages, totalCount, perPage, t }) {
  if (totalCount <= perPage) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
        {t("finance.showing")} {((page - 1) * perPage) + 1}–{Math.min(page * perPage, totalCount)} {t("finance.of")} {totalCount}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>«</button>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>‹</button>
        {[...Array(Math.min(5, totalPages))].map((_, idx) => {
          const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + idx;
          return <button key={p} onClick={() => setPage(p)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === p ? "var(--ne-grad)" : "var(--ne-surface-2)", color: page === p ? "#fff" : "var(--ne-muted)", fontSize: 11, cursor: "pointer", fontWeight: page === p ? 700 : 400 }}>{p}</button>;
        })}
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>›</button>
        <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>»</button>
      </div>
    </div>
  );
}

const PACKAGE_ROWS_PER_PAGE = 10;

function PackageOverviewTab({ storeId, cfUrl, ordersStore, t }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const qs = new URLSearchParams({ store_id: storeId });
        if (startDate) qs.set("start_date", startDate);
        if (endDate) qs.set("end_date", endDate);
        if (debouncedSearch) qs.set("search", debouncedSearch);
        const res = await fetch(`${cfUrl}/finance-statement-orders?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setOrders(json.orders || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeId, cfUrl, debouncedSearch, startDate, endDate]);

  useEffect(() => { setPage(1); }, [debouncedSearch, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(orders.length / PACKAGE_ROWS_PER_PAGE));
  const pagedOrders = orders.slice((page - 1) * PACKAGE_ROWS_PER_PAGE, page * PACKAGE_ROWS_PER_PAGE);
  const dateFilterApplied = !!(startDate || endDate);

  const exportCsv = () => {
    setExporting(true);
    const storePart = sanitizeFilenamePart(ordersStore?.store_name);
    const filename = dateFilterApplied
      ? `Statement_${storePart}_Filtered_${startDate || "start"}_to_${endDate || "end"}.csv`
      : `Statement_${storePart}_AllPeriods_${toDateStrPKT(new Date())}.csv`;
    downloadCsv(filename, buildOrdersCsv(orders));
    setExporting(false);
  };

  const inputStyle = { padding: "7px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "0.75rem", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" placeholder={t("finance.pkgSearchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: 200 }} />
          <label style={{ fontSize: 10.5, color: "var(--ne-muted)" }}>{t("finance.pkgStartDate")}</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          <label style={{ fontSize: 10.5, color: "var(--ne-muted)" }}>{t("finance.pkgEndDate")}</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={exportCsv} disabled={exporting || loading || orders.length === 0} style={toolbarBtnStyle}>
          <Icon name="download" size={12} /> {dateFilterApplied ? t("finance.exportFiltered") : t("finance.exportAll")}
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {error && <div style={{ padding: "10px 16px", color: "var(--ne-danger)", fontSize: 12 }}>{error}</div>}
        {loading ? (
          <div style={{ padding: 16 }}><SkelTable cols={10} rows={6} /></div>
        ) : orders.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12.5 }}>{t("finance.pkgNoOrders")}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  {[
                    t("finance.col.statementPeriod"), t("finance.col.internalOrderNo"), t("finance.col.externalOrderNo"), t("finance.col.trackingNo"),
                    t("finance.col.province"), t("finance.col.city"), t("finance.col.courierStatus"), t("finance.col.cod"),
                    t("finance.col.shippingFee"), t("finance.col.vat"), t("finance.col.incomeTax"), t("finance.col.salesTax"), t("finance.col.netPayable"),
                  ].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "7px 10px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 9.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((o, idx) => (
                  <tr key={`${o.order_id}-${idx}`} style={{ borderBottom: "1px solid var(--ne-border)" }}>
                    <td style={{ padding: "6px 10px", color: "var(--ne-muted)", whiteSpace: "nowrap" }}>{o.statement_period}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{o.order_id}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {o.order_id ? (
                        <a href={`https://${ordersStore?.shopify_url}/admin/orders/${o.order_id}`} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", textDecoration: "none" }}>
                          {o.external_order_no || o.order_id}
                        </a>
                      ) : (o.external_order_no || "—")}
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-muted)", whiteSpace: "nowrap" }}>{o.tracking_no || "—"}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{o.province || "—"}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{o.city || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: 9.5, fontWeight: 700, background: o.courier_status === "Delivered" ? "var(--ne-success-soft)" : "var(--ne-danger-soft)", color: o.courier_status === "Delivered" ? "var(--ne-success)" : "var(--ne-danger)" }}>
                        {o.courier_status}
                      </span>
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{fmtMoney(o.cod_amount)}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{fmtMoney(o.shipping_fee)}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{fmtMoney(o.vat)}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{fmtMoney(o.income_tax)}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ne-text)", whiteSpace: "nowrap" }}>{fmtMoney(o.sales_tax)}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 700, whiteSpace: "nowrap", color: o.net_payable >= 0 ? "var(--ne-success)" : "var(--ne-danger)" }}>{fmtMoney(o.net_payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PageControls page={page} setPage={setPage} totalPages={totalPages} totalCount={orders.length} perPage={PACKAGE_ROWS_PER_PAGE} t={t} />
    </div>
  );
}

export default function FinanceStatement({ storeId, ordersStore, cfUrl = CF_URL }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [showRateCard, setShowRateCard] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 900);
  const [earliestDate, setEarliestDate] = useState(undefined); // undefined = still loading, null = no dated orders yet
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'packages'
  const [exportingAll, setExportingAll] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Earliest real order activity for this store — bounds how far back getPeriodsSince()
  // walks, so pagination below pages through every period that could have real data
  // instead of an arbitrary fixed count.
  useEffect(() => {
    if (!storeId) return;
    setEarliestDate(undefined);
    setPage(1);
    (async () => {
      const [{ data: delivered }, { data: returned }] = await Promise.all([
        supabase.from("order_statuses").select("delivered_at").eq("store_id", storeId).not("delivered_at", "is", null).order("delivered_at", { ascending: true }).limit(1),
        supabase.from("order_statuses").select("return_success_at").eq("store_id", storeId).not("return_success_at", "is", null).order("return_success_at", { ascending: true }).limit(1),
      ]);
      const candidates = [delivered?.[0]?.delivered_at, returned?.[0]?.return_success_at].filter(Boolean).map((d) => new Date(d));
      setEarliestDate(candidates.length > 0 ? new Date(Math.min(...candidates.map((d) => d.getTime()))) : null);
    })();
  }, [storeId]);

  const periods = useMemo(() => getPeriodsSince(earliestDate), [earliestDate]);
  const totalPages = Math.max(1, Math.ceil(periods.length / PERIODS_PER_PAGE));
  const pagedPeriods = periods.slice((page - 1) * PERIODS_PER_PAGE, page * PERIODS_PER_PAGE);

  // Statement Overview tab has no date filter of its own (kept exactly as-is per the
  // "keep all current logic/pagination/filters unchanged" requirement), so this button is
  // always "Export All" — full history, one call to /finance-statement-orders with no
  // start_date/end_date, rather than looping once per period.
  const exportAllPeriods = async () => {
    setExportingAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/finance-statement-orders?store_id=${encodeURIComponent(storeId)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (json.error) { setExportingAll(false); return; }
      downloadCsv(`Statement_${sanitizeFilenamePart(ordersStore?.store_name)}_AllPeriods_${toDateStrPKT(new Date())}.csv`, buildOrdersCsv(json.orders || []));
    } catch { /* best-effort — export failures don't block the page */ }
    setExportingAll(false);
  };

  if (!ordersStore?.shopify_url) {
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="calculator" size={17} /> {t("finance.title")}</h1>
        <div style={{ ...cardStyle, marginTop: "1.5rem", textAlign: "center", color: "var(--ne-muted)" }}>
          {t("finance.connectStoreFirst")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="calculator" size={17} /> {t("finance.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.store_name} — {t("finance.subtitle")}</p>
        </div>
        <button onClick={() => setShowRateCard(true)} style={toolbarBtnStyle}>
          <Icon name="card" size={12} /> {t("finance.rateCardButton")}
        </button>
      </div>

      {/* Tabs — same pill-button style as BookedOrders.jsx's TAB_STRUCTURE */}
      <div style={{ display: "flex", gap: 7, marginBottom: "0.75rem", flexWrap: "wrap" }}>
        {[{ key: "overview", label: t("finance.tabOverview") }, { key: "packages", label: t("finance.tabPackages") }].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab.key ? "transparent" : "var(--ne-border)",
              background: activeTab === tab.key ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab.key ? "#fff" : "var(--ne-muted)" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.6rem" }}>
            <button onClick={exportAllPeriods} disabled={exportingAll} style={toolbarBtnStyle}>
              <Icon name="download" size={12} /> {exportingAll ? t("finance.exporting") : t("finance.exportAll")}
            </button>
          </div>

          <div>
            {pagedPeriods.map((p) => (
              <StatementRow key={periodKey(p)} period={p} t={t} cfUrl={cfUrl} storeId={storeId} ordersStore={ordersStore} />
            ))}
          </div>

          <PageControls page={page} setPage={setPage} totalPages={totalPages} totalCount={periods.length} perPage={PERIODS_PER_PAGE} t={t} />
        </>
      ) : (
        <PackageOverviewTab storeId={storeId} cfUrl={cfUrl} ordersStore={ordersStore} t={t} />
      )}

      {showRateCard && <RateCardModal t={t} cfUrl={cfUrl} onClose={() => setShowRateCard(false)} />}
    </div>
  );
}
