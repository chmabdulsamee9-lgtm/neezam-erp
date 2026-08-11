import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const RECENT_PERIODS_COUNT = 10;

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

// Current period se peeche N periods walk karta hai — har dafa pichle period ke start
// se 1ms pehle jump karke wapas getDexStatementPeriod() call karta hai, taake guaranteed
// theek pichla period mile (koi date-arithmetic assumption nahi).
function getRecentPeriods(count) {
  const periods = [];
  let cursor = new Date();
  for (let i = 0; i < count; i++) {
    const p = getDexStatementPeriod(cursor);
    periods.push(p);
    cursor = new Date(p.start.getTime() - 1);
  }
  return periods;
}

const fmtDate = (d) => d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
const fmtMoney = (n) => `Rs. ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const periodKey = (p) => `${p.start.toISOString()}__${p.end.toISOString()}`;

const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px" };
const toolbarBtnStyle = {
  padding: "7px 14px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)",
  color: "var(--ne-text)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
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
        <div style={{ padding: "0 18px 12px", fontSize: 10.5, color: "var(--ne-muted-2)" }}>{t("finance.loading")}</div>
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
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)" }}>{t("finance.loading")}</div>
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

export default function FinanceStatement({ storeId, ordersStore, cfUrl = CF_URL }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [showRateCard, setShowRateCard] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 900);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Ek dafa compute karte hain (page ke life mein periods badalte nahi, sirf naya
  // page-load/refresh pe hi "current period" shift hoga — useMemo yahan zaroori nahi
  // (component mount pe ek hi baar chalta hai), lekin re-render safe rehne ke liye rakha.
  const periods = useMemo(() => getRecentPeriods(RECENT_PERIODS_COUNT), []);

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

      <div>
        {periods.map((p) => (
          <StatementRow key={periodKey(p)} period={p} t={t} cfUrl={cfUrl} storeId={storeId} ordersStore={ordersStore} />
        ))}
      </div>

      {showRateCard && <RateCardModal t={t} cfUrl={cfUrl} onClose={() => setShowRateCard(false)} />}
    </div>
  );
}
