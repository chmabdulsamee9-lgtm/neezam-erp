import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const TX_PER_PAGE = 20;

// Response ke exact field names verified nahi hain — jo bhi mile usi se best-match karo,
// na mile to "—" dikhao (crash kabhi nahi)
const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
};

const asRows = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.data || data.list || data.result || data.items || [];
};

const money = (v) => (v === null || v === undefined ? "—" : `Rs. ${Number(v).toLocaleString()}`);

// Dex externalOrderId format: "PREFIX[-VARIANT]_shopifyId_suffix" (jaise DWK2366_7859021644086_362,
// DWK2265-F1_6105674187062_264) — Shopify order name ("#DWK2366") sirf prefix (variant/suffix
// hataa kar) hota hai, isliye Shopify orders se match/display karne ke liye hamesha yehi extract karte hain.
const extractOrderRef = (externalOrderId) => {
  if (!externalOrderId) return null;
  const beforeUnderscore = String(externalOrderId).split("_")[0];
  const prefix = beforeUnderscore.split("-")[0];
  return prefix ? `#${prefix}` : null;
};

export default function Payments({ storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [activeTab, setActiveTab] = useState("statement");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [payoutData, setPayoutData] = useState(null);
  const [loadingPayout, setLoadingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);

  const [transactionsData, setTransactionsData] = useState(null);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState("");
  const [expandedTxRow, setExpandedTxRow] = useState(null);
  const [txFilters, setTxFilters] = useState({ statementNo: "", search: "", dateFrom: "", dateTo: "" });
  const [txPage, setTxPage] = useState(1);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId && activeTab === "statement" && payoutData === null) fetchPayout();
  }, [storeId, activeTab]);

  useEffect(() => {
    if (storeId && activeTab === "package" && transactionsData === null) fetchTransactions();
  }, [storeId, activeTab]);

  const fetchPayout = async () => {
    setLoadingPayout(true);
    setPayoutError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ store_id: storeId }).toString();
      const res = await fetch(`${cfUrl}/dex-finance-payout?${qs}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const data = await res.json();
      if (data.error) { setPayoutError(data.error); setLoadingPayout(false); return; }
      setPayoutData(data);
    } catch (err) {
      setPayoutError(err.message);
    }
    setLoadingPayout(false);
  };

  const fetchTransactions = async () => {
    setLoadingTx(true);
    setTxError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ store_id: storeId }).toString();
      const res = await fetch(`${cfUrl}/dex-finance-transactions?${qs}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const data = await res.json();
      if (data.error) { setTxError(data.error); setLoadingTx(false); return; }
      setTransactionsData(data);
    } catch (err) {
      setTxError(err.message);
    }
    setLoadingTx(false);
  };

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" };
  const inputStyle = { padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 };

  // ---------- TAB 1: STATEMENT OVERVIEW ----------
  const payoutRows = asRows(payoutData);

  const renderStatementOverview = () => {
    if (loadingPayout) return <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("payments.loading")}</div>;
    if (payoutError) return <div style={{ ...cardStyle, color: "var(--ne-danger)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="error" size={13} /> {payoutError}</div>;
    if (payoutRows.length === 0) return <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("payments.noStatements")}</div>;

    return (
      <div style={{ display: "grid", gap: 8 }}>
        {payoutRows.map((row, i) => {
          const period = pick(row, ["statementPeriod", "period", "billingPeriod"]);
          const statementNo = pick(row, ["statementNo", "statementNumber", "statement_no"]);
          const totalFees = pick(row, ["totalFee", "totalFees", "fee"]);
          const codFee = pick(row, ["codFee", "codFees", "cod_fee"]);
          const shippingFee = pick(row, ["shippingFee", "shippingFees", "shipping_fee"]);
          const payable = pick(row, ["totalPayableAmount", "payableAmount", "totalAmount"]);
          const expanded = expandedRow === i;
          return (
            <div key={i} style={cardStyle}>
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ne-text)" }}>{period ?? "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>{t("payments.statementNoPrefix")} {statementNo ?? "—"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-danger)" }}>{money(totalFees)}</div>
                    <div style={{ fontSize: 10, color: "var(--ne-muted)" }}>{t("payments.totalFees")}</div>
                  </div>
                  <button onClick={() => setExpandedRow(expanded ? null : i)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-accent)", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {expanded ? t("payments.seeLess") : t("payments.seeMore")}
                  </button>
                </div>
              </div>
              {expanded && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--ne-muted)" }}>{t("payments.codFee")}</span>
                    <span style={{ color: "var(--ne-danger)", fontWeight: 600 }}>{money(codFee)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--ne-muted)" }}>{t("payments.shippingFee")}</span>
                    <span style={{ color: "var(--ne-danger)", fontWeight: 600 }}>{money(shippingFee)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--ne-border)", paddingTop: 6 }}>
                    <span style={{ color: "var(--ne-text)", fontWeight: 700 }}>{t("payments.totalPayableAmount")}</span>
                    <span style={{ color: "var(--ne-success)", fontWeight: 700 }}>{money(payable)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ---------- TAB 2: PACKAGE OVERVIEW ----------
  const txRows = asRows(transactionsData);
  const filteredTxRows = txRows.filter(row => {
    const orderNo = pick(row, ["orderNo", "order_no", "orderId"]);
    const externalOrderNo = pick(row, ["externalOrderNo", "externalOrderId", "external_order_no"]);
    const trackingNo = pick(row, ["trackingNo", "trackingNumber", "tracking_no"]);
    const statementNo = pick(row, ["statementNo", "statementNumber"]);
    const rowDate = pick(row, ["date", "transactionDate", "createdAt"]);

    const matchStatement = !txFilters.statementNo || String(statementNo || "").toLowerCase().includes(txFilters.statementNo.toLowerCase());
    const matchSearch = !txFilters.search || [orderNo, externalOrderNo, extractOrderRef(externalOrderNo), trackingNo].some(v => String(v || "").toLowerCase().includes(txFilters.search.toLowerCase()));
    const matchFrom = !txFilters.dateFrom || (rowDate && new Date(rowDate) >= new Date(txFilters.dateFrom));
    const matchTo = !txFilters.dateTo || (rowDate && new Date(rowDate) <= new Date(txFilters.dateTo + "T23:59:59"));
    return matchStatement && matchSearch && matchFrom && matchTo;
  });
  const txTotalPages = Math.ceil(filteredTxRows.length / TX_PER_PAGE) || 1;
  const pagedTxRows = filteredTxRows.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE);

  const renderPackageOverview = () => {
    if (loadingTx) return <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("payments.loading")}</div>;
    if (txError) return <div style={{ ...cardStyle, color: "var(--ne-danger)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="error" size={13} /> {txError}</div>;

    return (
      <>
        <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <input type="text" placeholder={t("payments.statementNoPlaceholder")} value={txFilters.statementNo}
            onChange={e => { setTxFilters(f => ({ ...f, statementNo: e.target.value })); setTxPage(1); }} style={inputStyle} />
          <div style={{ position: "relative" }}>
            <Icon name="search" size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--ne-muted-2)" }} />
            <input type="text" placeholder={t("payments.searchPlaceholder")} value={txFilters.search}
              onChange={e => { setTxFilters(f => ({ ...f, search: e.target.value })); setTxPage(1); }} style={{ ...inputStyle, minWidth: 160, paddingLeft: 24 }} />
          </div>
          <input type="date" value={txFilters.dateFrom}
            onChange={e => { setTxFilters(f => ({ ...f, dateFrom: e.target.value })); setTxPage(1); }} style={inputStyle} />
          <input type="date" value={txFilters.dateTo}
            onChange={e => { setTxFilters(f => ({ ...f, dateTo: e.target.value })); setTxPage(1); }} style={inputStyle} />
          {(txFilters.statementNo || txFilters.search || txFilters.dateFrom || txFilters.dateTo) && (
            <button onClick={() => { setTxFilters({ statementNo: "", search: "", dateFrom: "", dateTo: "" }); setTxPage(1); }}
              style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--ne-danger)", background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontSize: 11, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="close" size={9} /> {t("payments.clear")}
            </button>
          )}
        </div>

        {filteredTxRows.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("payments.noPackages")}</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {pagedTxRows.map((row, i) => {
              const orderNo = pick(row, ["orderNo", "order_no", "orderId"]);
              const externalOrderNo = pick(row, ["externalOrderNo", "externalOrderId", "external_order_no"]);
              const trackingNo = pick(row, ["trackingNo", "trackingNumber", "tracking_no"]);
              const totalFees = pick(row, ["totalFee", "totalFees", "fee"]);
              const codFee = pick(row, ["codFee", "codFees", "cod_fee"]);
              const shippingFee = pick(row, ["shippingFee", "shippingFees", "shipping_fee"]);
              const expanded = expandedTxRow === i;
              return (
                <div key={i} style={cardStyle}>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ne-text)" }}>{orderNo ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>{t("payments.extOrderPrefix")} {extractOrderRef(externalOrderNo) ?? "—"} · {t("payments.trackingPrefix")} {trackingNo ?? "—"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-danger)" }}>{money(totalFees)}</div>
                        <div style={{ fontSize: 10, color: "var(--ne-muted)" }}>{t("payments.totalFees")}</div>
                      </div>
                      <button onClick={() => setExpandedTxRow(expanded ? null : i)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-accent)", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {expanded ? t("payments.seeLess") : t("payments.seeMore")}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--ne-muted)" }}>{t("payments.codFee")}</span>
                        <span style={{ color: "var(--ne-danger)", fontWeight: 600 }}>{money(codFee)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--ne-muted)" }}>{t("payments.shippingFee")}</span>
                        <span style={{ color: "var(--ne-danger)", fontWeight: 600 }}>{money(shippingFee)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
            {t("payments.showing")} {filteredTxRows.length === 0 ? 0 : ((txPage - 1) * TX_PER_PAGE) + 1}–{Math.min(txPage * TX_PER_PAGE, filteredTxRows.length)} {t("payments.of")} {filteredTxRows.length}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setTxPage(1)} disabled={txPage === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: txPage === 1 ? "transparent" : "var(--ne-surface-2)", color: txPage === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: txPage === 1 ? "default" : "pointer" }}>«</button>
            <button onClick={() => setTxPage(p => Math.max(1, p - 1))} disabled={txPage === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: txPage === 1 ? "transparent" : "var(--ne-surface-2)", color: txPage === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: txPage === 1 ? "default" : "pointer" }}>‹</button>
            {[...Array(Math.min(5, txTotalPages))].map((_, idx) => {
              const p = Math.max(1, Math.min(txPage - 2, txTotalPages - 4)) + idx;
              return <button key={p} onClick={() => setTxPage(p)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: txPage === p ? "var(--ne-grad)" : "var(--ne-surface-2)", color: txPage === p ? "#fff" : "var(--ne-muted)", fontSize: 11, cursor: "pointer", fontWeight: txPage === p ? 700 : 400 }}>{p}</button>;
            })}
            <button onClick={() => setTxPage(p => Math.min(txTotalPages, p + 1))} disabled={txPage === txTotalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: txPage === txTotalPages ? "transparent" : "var(--ne-surface-2)", color: txPage === txTotalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: txPage === txTotalPages ? "default" : "pointer" }}>›</button>
            <button onClick={() => setTxPage(txTotalPages)} disabled={txPage === txTotalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: txPage === txTotalPages ? "transparent" : "var(--ne-surface-2)", color: txPage === txTotalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: txPage === txTotalPages ? "default" : "pointer" }}>»</button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="card" size={17} /> {t("payments.title")}</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("payments.subtitle")}</p>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: 4, width: "fit-content" }}>
        <button onClick={() => setActiveTab("statement")}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
            background: activeTab === "statement" ? "var(--ne-grad)" : "transparent", color: activeTab === "statement" ? "#fff" : "var(--ne-muted)" }}>
          {t("payments.statementTab")}
        </button>
        <button onClick={() => setActiveTab("package")}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
            background: activeTab === "package" ? "var(--ne-grad)" : "transparent", color: activeTab === "package" ? "#fff" : "var(--ne-muted)" }}>
          {t("payments.packageTab")}
        </button>
      </div>

      {activeTab === "statement" ? renderStatementOverview() : renderPackageOverview()}
    </div>
  );
}
