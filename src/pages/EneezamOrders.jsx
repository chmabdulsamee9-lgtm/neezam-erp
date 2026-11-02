import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useLanguage, useTranslation } from "../i18n";
import Icon from "../components/Icon";
import { workerFetch } from "../lib/storeApi";
import { formatStoreDate, useStoreTimeZone } from "../lib/dates";

// Orders placed on the eNeezam storefront (store_orders). Lives next to the untouched Shopify list as its own tab.
// The order number is a REAL link (<a href="/orders/<id>">): left click navigates in-app, middle click,
// ctrl/cmd click and "open in new tab" work like any link.

const LIMIT = 20;
const TABS = [
  { id: "all", query: {} },
  { id: "open", query: { status: "open" } },
  { id: "unfulfilled", query: { status: "open", fulfillment_status: "unfulfilled" } },
  { id: "unpaid", query: { status: "open", payment_status: "pending" } },
  { id: "fulfilled", query: { fulfillment_status: "fulfilled" } },
  { id: "cancelled", query: { status: "cancelled" } },
  { id: "archived", query: { status: "archived" } },
];

export const money = (n, currency = "PKR") => `${currency === "PKR" ? "Rs" : currency} ${Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export function Badge({ tone = "muted", children }) {
  const tones = {
    muted: ["var(--ne-surface)", "var(--ne-muted)"], success: ["var(--ne-success-soft)", "var(--ne-success)"],
    warning: ["var(--ne-warning-soft)", "var(--ne-warning)"], danger: ["rgba(239,68,68,.14)", "var(--ne-danger)"], accent: ["var(--ne-accent-soft)", "var(--ne-accent)"],
  };
  const [bg, fg] = tones[tone] || tones.muted;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>;
}

export function paymentBadge(o, t) {
  if (o.payment_status === "paid") return <Badge tone="success">{t("eneezamOrders.pay.paid")}</Badge>;
  if (o.payment_status === "refunded") return <Badge tone="muted">{t("eneezamOrders.pay.refunded")}</Badge>;
  if (o.payment_status === "voided") return <Badge tone="muted">{t("eneezamOrders.pay.voided")}</Badge>;
  if (Number(o.paid_total) > 0) return <Badge tone="warning">{t("eneezamOrders.pay.partial")}</Badge>;
  return <Badge tone="warning">{t("eneezamOrders.pay.pending")}</Badge>;
}
export function fulfillmentBadge(o, t) {
  if (o.fulfillment_status === "fulfilled") return <Badge tone="success">{t("eneezamOrders.ful.fulfilled")}</Badge>;
  if (o.fulfillment_status === "partial") return <Badge tone="warning">{t("eneezamOrders.ful.partial")}</Badge>;
  return <Badge tone="warning">{t("eneezamOrders.ful.unfulfilled")}</Badge>;
}
export function statusBadge(o, t) {
  if (o.status === "cancelled") return <Badge tone="danger">{t("eneezamOrders.status.cancelled")}</Badge>;
  if (o.status === "archived") return <Badge tone="muted">{t("eneezamOrders.status.archived")}</Badge>;
  return null;
}

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export default function EneezamOrders({ storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const tz = useStoreTimeZone(storeId, cfUrl);
  const [tab, setTab] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => { setPage(1); }, [tab, search]);
  useEffect(() => {
    const my = ++seq.current;
    (async () => {
      setLoading(true);
      setError("");
      const q = new URLSearchParams({ store_id: storeId, page: String(page), limit: String(LIMIT), ...(search ? { search } : {}), ...TABS.find((x) => x.id === tab).query });
      const { status, data } = await workerFetch(cfUrl, `/list-store-orders?${q}`);
      if (my !== seq.current) return;
      if (status === 403) setError(t("eneezamOrders.forbidden"));
      else if (status >= 400 || data.error) setError(data.error || t("eneezamOrders.errorLoad"));
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setLoading(false);
    })();
  }, [storeId, cfUrl, tab, search, page]);

  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const th = { textAlign: "left", fontSize: 10.5, color: "var(--ne-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", padding: "8px 10px", whiteSpace: "nowrap" };
  const td = { padding: "10px", borderTop: "1px solid var(--ne-border)", verticalAlign: "middle", fontSize: 12.5, color: "var(--ne-text)" };
  const link = { color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none" };
  const pageBtn = (disabled) => ({ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 });

  return (
    <div style={{ padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {TABS.map((x) => (
          <button key={x.id} type="button" onClick={() => setTab(x.id)}
            style={{ padding: "6px 13px", borderRadius: 18, border: "1px solid var(--ne-border)", fontSize: 12, fontWeight: 700, cursor: "pointer", background: tab === x.id ? "var(--ne-accent)" : "transparent", color: tab === x.id ? "#fff" : "var(--ne-text)" }}>
            {t(`eneezamOrders.tab.${x.id}`)}
          </button>
        ))}
      </div>
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 12 }}>
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("eneezamOrders.search")} aria-label={t("eneezamOrders.search")}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 12.5, boxSizing: "border-box" }} />
      </div>
      {error && <p style={{ color: "var(--ne-danger)", fontSize: 12.5 }}>{error}</p>}

      <div style={{ border: "1px solid var(--ne-border)", borderRadius: 12, overflowX: "auto", background: "var(--ne-surface-2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>{t("eneezamOrders.col.order")}</th><th style={th}>{t("eneezamOrders.col.date")}</th><th style={th}>{t("eneezamOrders.col.customer")}</th>
              <th style={th}>{t("eneezamOrders.col.payment")}</th><th style={th}>{t("eneezamOrders.col.fulfillment")}</th><th style={th}>{t("eneezamOrders.col.items")}</th><th style={{ ...th, textAlign: "right" }}>{t("eneezamOrders.col.total")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td style={td} colSpan={7}>{t("common.loading")}</td></tr>}
            {!loading && items.length === 0 && <tr><td style={{ ...td, color: "var(--ne-muted)" }} colSpan={7}>{t("eneezamOrders.empty")}</td></tr>}
            {!loading && items.map((o) => (
              <tr key={o.id}>
                <td style={td}>
                  <Link to={`/orders/${o.id}`} style={link}>{o.name}</Link>
                  <span style={{ marginLeft: 6 }}><Badge tone="accent">{t("eneezamOrders.badge")}</Badge></span>
                  {o.status !== "open" && <span style={{ marginLeft: 6 }}>{statusBadge(o, t)}</span>}
                </td>
                <td style={{ ...td, whiteSpace: "nowrap", color: "var(--ne-muted)" }}>{formatStoreDate(o.created_at, tz)}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                  <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>{[o.shipping_address?.city, o.shipping_address?.province].filter(Boolean).join(", ")}</div>
                </td>
                <td style={td}>{paymentBadge(o, t)}</td>
                <td style={td}>{fulfillmentBadge(o, t)}</td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {o.items_summary?.thumbnail ? <img src={o.items_summary.thumbnail} alt="" width={30} height={30} style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover" }} loading="lazy" /> : <Icon name="products" size={16} />}
                    <span style={{ fontSize: 11.5, color: "var(--ne-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.items_summary?.count ? `${o.items_summary.count} · ${o.items_summary.first_title || ""}` : "—"}
                    </span>
                  </div>
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{money(o.total, o.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>{total} {t("eneezamOrders.ordersCount")} · {page}/{pages}</span>
        <button type="button" style={pageBtn(page <= 1)} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("eneezamOrders.prev")}</button>
        <button type="button" style={pageBtn(page >= pages)} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("eneezamOrders.next")}</button>
      </div>
    </div>
  );
}
