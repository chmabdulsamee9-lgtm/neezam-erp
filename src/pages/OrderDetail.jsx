import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage, useTranslation } from "../i18n";
import Icon from "../components/Icon";
import ChipsInput from "../components/ChipsInput";
import { workerFetch, publicFetch, logStoreActivity } from "../lib/storeApi";
import { formatStoreDate, useStoreTimeZone } from "../lib/dates";
import { toWhatsAppPhone } from "../lib/phone";
import { supabase } from "../supabase";
import dexLogo from "../assets/couriers/dex.png";
import { getOrderSource } from "../lib/orderSource";
import OrderSourceIcon from "../components/OrderSourceIcon";
import { money } from "../lib/orderUi";
import { STATUSES } from "../lib/orderStatuses";

// Order detail for orders placed on the eNeezam storefront, at the real route /orders/:id.
// Every change goes through POST /update-store-order with the updated_at this screen last saw; the server
// recomputes all money and answers 409 "stale" if someone else changed the order in the meantime.

const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 };
const h3 = { margin: "0 0 10px", fontSize: 13.5, color: "var(--ne-text)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const input = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 12.5, boxSizing: "border-box", width: "100%" };
const lab = { fontSize: 11, color: "var(--ne-muted)", fontWeight: 700, display: "block", marginBottom: 4 };
const btn = (primary, danger, disabled) => ({ padding: "7px 14px", borderRadius: 8, border: primary ? "none" : `1px solid ${danger ? "var(--ne-danger)" : "var(--ne-border)"}`, background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : danger ? "var(--ne-danger)" : "var(--ne-text)", fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, display: "inline-flex", alignItems: "center", gap: 6 });
const linkBtn = { border: "none", background: "transparent", color: "var(--ne-accent)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: 0 };

function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000, padding: 12 }}>
      <div style={{ ...card, width: 460, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", marginBottom: 0 }}>
        <h3 style={{ ...h3, fontSize: 15 }}>{title}</h3>
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, flexWrap: "wrap" }}>{footer}</div>
      </div>
    </div>
  );
}

export default function OrderDetail({ orderId, storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const navigate = useNavigate();
  const tz = useStoreTimeZone(storeId, cfUrl);
  const [load, setLoad] = useState({ state: "loading", error: "" }); // loading | ok | notfound | forbidden | error
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [agent, setAgent] = useState({ agent_status: null, tracking_number: null, courier_status: null, traffic: null }); // the Orders list status and DEX booking of this order
  const [dexCities, setDexCities] = useState(null);
  const [pickups, setPickups] = useState([]);
  const [booking, setBooking] = useState(false);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [modal, setModal] = useState(null); // { type, ... }
  const [modalError, setModalError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const fetchOrder = async () => {
    const { status, data } = await workerFetch(cfUrl, `/get-store-order?store_id=${storeId}&id=${orderId}`);
    if (status === 403) { setLoad({ state: "forbidden", error: "" }); return false; }
    if (status === 404) { setLoad({ state: "notfound", error: "" }); return false; }
    if (status !== 200 || data.error || !data.order) { setLoad({ state: "error", error: data.error || t("orderDetail.errorLoad") }); return false; }
    setOrder(data.order); setItems(data.items || []); setEvents(data.events || []);
    setAgent({ agent_status: data.agent_status || null, tracking_number: data.tracking_number || null, courier_status: data.courier_status || null, traffic: data.traffic || null });
    setLoad({ state: "ok", error: "" });
    return true;
  };
  useEffect(() => { setLoad({ state: "loading", error: "" }); setEditMode(false); setBanner(null); fetchOrder(); }, [orderId, storeId]);
  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, pk] = await Promise.all([
        supabase.from("dex_serviceable_cities").select("city"),
        supabase.from("pickup_addresses").select("*").eq("store_id", storeId).order("created_at"),
      ]);
      if (!alive) return;
      setDexCities(new Set((c.data || []).map((r) => (r.city || "").trim().toLowerCase()).filter(Boolean)));
      setPickups(pk.data || []);
    })();
    return () => { alive = false; };
  }, [storeId]);

  const bookWithDex = async () => {
    setBooking(true);
    const { data: { session } } = await supabase.auth.getSession();
    const pickup = pickups.find((a) => a.is_default) || pickups[0];
    try {
      const res = await fetch(`${cfUrl}/dex-book-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: storeId, order_id: orderId, pickup_address_id: pickup?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) { setBanner({ type: "error", text: `${t("orderDetail.bookFailed")}: ${data.error}` }); logStoreActivity(storeId, "booking_failed", { order: order.name, error: data.error }); }
      else { await fetchOrder(); setBanner({ type: "ok", text: t("orderDetail.booked") }); logStoreActivity(storeId, "booking_success", { order: order.name, trackingNumber: data.trackingNumber }); }
    } catch (err) {
      setBanner({ type: "error", text: `${t("orderDetail.bookFailed")}: ${err.message}` });
    }
    setBooking(false);
  };

  /** one place for every change: sends the version we saw, handles stale (409) and shows the result */
  const act = async (action, payload = {}, { okText, keepModal } = {}) => {
    setBusy(true);
    setModalError("");
    const { status, data } = await workerFetch(cfUrl, "/update-store-order", { method: "POST", body: JSON.stringify({ store_id: storeId, id: orderId, action, expected_updated_at: order.updated_at, ...payload }) });
    setBusy(false);
    if (status === 409 && data.error === "stale") {
      await fetchOrder();
      setModal(null); setEditMode(false);
      setBanner({ type: "warn", text: t("orderDetail.stale") });
      return { ok: false };
    }
    if (data.success) {
      setOrder(data.order); setItems(data.items || []); setEvents(data.events || []);
      setAgent({ agent_status: data.agent_status || null, tracking_number: data.tracking_number || null, courier_status: data.courier_status || null, traffic: data.traffic || null });
      if (!keepModal) setModal(null);
      setBanner({ type: "ok", text: okText || t("orderDetail.saved") });
      logStoreActivity(storeId, `store_order_${action}`, { order: data.order.name });
      return { ok: true, data };
    }
    const msg = data.fields ? Object.values(data.fields).join(" ") : data.error || t("orderDetail.errorSave");
    if (modal) setModalError(msg); else setBanner({ type: "error", text: msg });
    return { ok: false, error: msg, fields: data.fields };
  };

  const readOnlyAll = order && order.status === "cancelled";
  const locked = order && order.status !== "open"; // cancelled or archived: money / lines / address are not editable
  const statusDef = STATUSES.find((x) => x.label === (agent.agent_status || (order?.status === "cancelled" ? "Cancelled" : "")));

  if (load.state === "loading") return <p style={{ padding: "1.5rem", fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;
  if (load.state !== "ok") {
    const msg = load.state === "notfound" ? t("orderDetail.notFound") : load.state === "forbidden" ? t("orderDetail.forbidden") : load.error;
    return (
      <div style={{ padding: "2rem 1.25rem" }}>
        <button type="button" style={btn(false)} onClick={() => navigate("/orders")}><Icon name="chevronLeft" size={13} /> {t("orderDetail.backToOrders")}</button>
        <p style={{ marginTop: 16, fontSize: 14, color: "var(--ne-text)" }}>{msg}</p>
      </div>
    );
  }

  const sl = order.shipping_line || {};
  const shippingHint = sl.mode === "manual" ? `${t("orderDetail.manual")}${sl.reason ? `: ${sl.reason}` : ""}` : sl.rule?.name ? `${t("orderDetail.rule")}: ${sl.rule.name}` : sl.applied === "free_shipping" ? t("orderDetail.freeShippingApplied") : t("orderDetail.flatRate");
  const phone = order.customer_phone || "";
  const wa = toWhatsAppPhone(phone);

  return (
    <div style={{ padding: "1rem 1.25rem 3rem", maxWidth: 1180, margin: "0 auto" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" aria-label={t("orderDetail.backToOrders")} title={t("orderDetail.backToOrders")} style={{ ...btn(false), padding: "6px 8px" }} onClick={() => navigate("/orders")}><Icon name="chevronLeft" size={14} /></button>
        <h2 style={{ margin: 0, fontSize: 20, color: "var(--ne-text)" }}>{order.name}</h2>
        <OrderSourceIcon native size={18} />
        <select aria-label={t("orders.setStatus")} value={statusDef?.label || ""} disabled={busy || order.status === "archived"}
          onChange={(e) => { const v = e.target.value; if (v === "Cancelled") { setModalError(""); setModal({ type: "cancel", reason: "" }); } else if (v) act("set_status", { status: v }, { okText: t("orderDetail.statusSaved") }); }}
          style={{ padding: "3px 9px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: statusDef?.bg || "var(--ne-surface-2)", color: statusDef?.color || "var(--ne-muted-2)" }}>
          {!statusDef && <option value="">{t("orders.setStatus")}</option>}
          {STATUSES.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!locked && <button type="button" style={btn(editMode, false, busy)} disabled={busy} onClick={() => setEditMode((v) => !v)}><Icon name="edit" size={12} /> {editMode ? t("orderDetail.doneEditing") : t("orderDetail.edit")}</button>}
          <div style={{ position: "relative" }} ref={menuRef}>
            <button type="button" style={btn(false)} onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>{t("orderDetail.moreActions")} <Icon name="chevronDown" size={11} /></button>
            {menuOpen && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50, minWidth: 190, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.35)", padding: 4 }}>
                {order.status === "open" && <button role="menuitem" type="button" style={{ ...linkBtn, display: "block", width: "100%", textAlign: "left", padding: "9px 12px", color: "var(--ne-text)" }} onClick={() => { setMenuOpen(false); act("archive", {}, { okText: t("orderDetail.archived") }); }}>{t("orderDetail.archive")}</button>}
                {order.status === "archived" && <button role="menuitem" type="button" style={{ ...linkBtn, display: "block", width: "100%", textAlign: "left", padding: "9px 12px", color: "var(--ne-text)" }} onClick={() => { setMenuOpen(false); act("unarchive", {}, { okText: t("orderDetail.unarchived") }); }}>{t("orderDetail.unarchive")}</button>}
                {!readOnlyAll && <button role="menuitem" type="button" style={{ ...linkBtn, display: "block", width: "100%", textAlign: "left", padding: "9px 12px", color: "var(--ne-danger)" }} onClick={() => { setMenuOpen(false); setModalError(""); setModal({ type: "cancel", reason: "" }); }}>{t("orderDetail.cancelOrder")}</button>}
              </div>
            )}
          </div>
        </div>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ne-muted)" }}>{formatStoreDate(order.created_at, tz)} · {t("orderDetail.fromOnlineStore")} · {getOrderSource(agent.traffic || {})}</p>
      {banner && <div role="status" style={{ ...card, padding: "9px 12px", color: banner.type === "ok" ? "var(--ne-success)" : banner.type === "warn" ? "var(--ne-warning)" : "var(--ne-danger)", fontSize: 12.5 }}>{banner.text}</div>}
      {order.status === "cancelled" && <div style={{ ...card, padding: "9px 12px", fontSize: 12.5, color: "var(--ne-danger)" }}>{t("orderDetail.cancelledNote")}{order.cancel_reason ? `: ${order.cancel_reason}` : ""}</div>}
      {order.status === "archived" && <div style={{ ...card, padding: "9px 12px", fontSize: 12.5, color: "var(--ne-muted)" }}>{t("orderDetail.archivedNote")}</div>}

      <div className="ne-order-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <style>{`@media (min-width: 980px) { .ne-order-grid { grid-template-columns: minmax(0, 1.75fr) minmax(280px, 1fr) !important; } }`}</style>
        <div style={{ minWidth: 0 }}>
          <ItemsCard order={order} items={items} editMode={editMode && !locked} busy={busy} t={t} storeId={storeId} cfUrl={cfUrl}
            onSave={async (lines) => { const r = await act("set_items", { lines }, { okText: t("orderDetail.itemsSaved") }); if (r.ok) setEditMode(false); return r; }} onCancelEdit={() => setEditMode(false)} />

          <CourierCard order={order} agent={agent} dexCities={dexCities} pickups={pickups} booking={booking} busy={busy} onBook={bookWithDex} t={t} />

          <div style={card}>
            <h3 style={h3}><span>{t("orderDetail.totals")}</span></h3>
            <div style={{ display: "grid", gap: 6, fontSize: 12.5, color: "var(--ne-text)" }}>
              <Row l={t("orderDetail.subtotal")} v={money(order.subtotal, order.currency)} />
              <Row l={<span>{t("orderDetail.discount")}{order.discount_reason ? <span style={{ color: "var(--ne-muted)" }}> ({order.discount_reason})</span> : null}{editMode && !locked && <> <button type="button" style={linkBtn} onClick={() => { setModalError(""); setModal({ type: "discount", amount: String(order.discount_total || 0), reason: order.discount_reason || "" }); }}>{t("orderDetail.editLink")}</button></>}</span>} v={Number(order.discount_total) > 0 ? `-${money(order.discount_total, order.currency)}` : money(0, order.currency)} />
              <Row l={<span>{t("orderDetail.shipping")} <span style={{ color: "var(--ne-muted)", fontSize: 11 }}>({shippingHint})</span>{editMode && !locked && <> <button type="button" style={linkBtn} onClick={() => { setModalError(""); setModal({ type: "shipping", mode: sl.mode === "manual" ? "manual" : "recompute", amount: String(order.shipping_total || 0), reason: sl.reason || "" }); }}>{t("orderDetail.editLink")}</button></>}</span>} v={money(order.shipping_total, order.currency)} />
              {(order.tax_lines || []).map((tx) => <Row key={tx.id} l={`${tx.name} (${tx.rate_percent}%)`} v={money(tx.amount, order.currency)} />)}
              <div style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 8 }}><Row l={<b>{t("orderDetail.total")}</b>} v={<b>{money(order.total, order.currency)}</b>} /></div>
            </div>
          </div>

          <Timeline events={events} tz={tz} t={t} busy={busy} onPost={async (message) => {
            const { status, data } = await workerFetch(cfUrl, "/add-store-order-comment", { method: "POST", body: JSON.stringify({ store_id: storeId, id: orderId, message }) });
            if (status === 200 && data.success) { setEvents((ev) => [data.event, ...ev]); logStoreActivity(storeId, "store_order_comment", { order: order.name }); return { ok: true }; }
            return { ok: false, error: data.error || t("orderDetail.errorSave") };
          }} />
        </div>

        <div style={{ minWidth: 0 }}>
          <NotesCard order={order} t={t} busy={busy} onSave={(note) => act("update_note", { note }, { okText: t("orderDetail.noteSaved") })} />
          <CustomerCard order={order} phone={phone} wa={wa} locked={readOnlyAll} t={t} busy={busy} onSave={(p) => act("update_customer", p, { okText: t("orderDetail.customerSaved") })} />
          <AddressCard order={order} locked={locked} t={t} busy={busy} cfUrl={cfUrl} onSave={(address) => act("update_address", { address }, { okText: t("orderDetail.addressSaved") })} />
          <div style={card}>
            <h3 style={h3}><span>{t("orderDetail.tags")}</span></h3>
            <ChipsInput t={t} values={order.tags || []} options={[]} allowFree placeholder={t("orderDetail.addTag")} onChange={(tags) => act("update_tags", { tags }, { okText: t("orderDetail.tagsSaved") })} />
          </div>
        </div>
      </div>

      {modal?.type === "cancel" && (
        <Modal title={t("orderDetail.cancelOrder")} onClose={() => setModal(null)} footer={<>
          <button type="button" style={btn(false)} onClick={() => setModal(null)}>{t("orderDetail.keepOrder")}</button>
          <button type="button" style={btn(true, false, busy || !modal.reason.trim())} disabled={busy || !modal.reason.trim()} onClick={() => act("cancel", { reason: modal.reason }, { okText: t("orderDetail.cancelled"), keepModal: false })}>{t("orderDetail.confirmCancel")}</button></>}>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ne-muted)" }}>{t("orderDetail.cancelWarn")}</p>
          <label style={lab}>{t("orderDetail.cancelReason")}</label>
          <input style={input} maxLength={200} value={modal.reason} onChange={(e) => setModal({ ...modal, reason: e.target.value })} autoFocus />
          {modalError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{modalError}</p>}
        </Modal>
      )}
      {modal?.type === "discount" && (
        <Modal title={t("orderDetail.editDiscount")} onClose={() => setModal(null)} footer={<>
          <button type="button" style={btn(false)} onClick={() => setModal(null)}>{t("action.cancel")}</button>
          <button type="button" style={btn(true, false, busy)} disabled={busy} onClick={() => act("set_discount", { amount: Number(modal.amount || 0), reason: modal.reason }, { okText: t("orderDetail.discountSaved") })}>{t("action.save")}</button></>}>
          <label style={lab}>{t("orderDetail.amount")} ({t("orderDetail.maxSubtotal").replace("{max}", money(order.subtotal, order.currency))})</label>
          <input style={{ ...input, marginBottom: 10 }} inputMode="decimal" value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} />
          <label style={lab}>{t("orderDetail.reason")}</label>
          <input style={input} maxLength={200} value={modal.reason} onChange={(e) => setModal({ ...modal, reason: e.target.value })} />
          {modalError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{modalError}</p>}
        </Modal>
      )}
      {modal?.type === "shipping" && (
        <Modal title={t("orderDetail.editShipping")} onClose={() => setModal(null)} footer={<>
          <button type="button" style={btn(false)} onClick={() => setModal(null)}>{t("action.cancel")}</button>
          <button type="button" style={btn(true, false, busy)} disabled={busy} onClick={() => act("set_shipping", modal.mode === "manual" ? { mode: "manual", amount: Number(modal.amount || 0), reason: modal.reason } : { mode: "recompute" }, { okText: t("orderDetail.shippingSaved") })}>{t("action.save")}</button></>}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8, color: "var(--ne-text)" }}><input type="radio" checked={modal.mode === "recompute"} onChange={() => setModal({ ...modal, mode: "recompute" })} /> {t("orderDetail.shippingRecompute")}</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 10, color: "var(--ne-text)" }}><input type="radio" checked={modal.mode === "manual"} onChange={() => setModal({ ...modal, mode: "manual" })} /> {t("orderDetail.shippingManual")}</label>
          {modal.mode === "manual" && (<>
            <label style={lab}>{t("orderDetail.amount")}</label>
            <input style={{ ...input, marginBottom: 10 }} inputMode="decimal" value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} />
            <label style={lab}>{t("orderDetail.reason")}</label>
            <input style={input} maxLength={200} value={modal.reason} onChange={(e) => setModal({ ...modal, reason: e.target.value })} />
          </>)}
          {modalError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{modalError}</p>}
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------ courier ------------------------------ */
function CourierCard({ order, agent, dexCities, pickups, booking, busy, onBook, t }) {
  const city = String(order.shipping_address?.city || "").trim().toLowerCase();
  const serviceable = !!dexCities && !!city && dexCities.has(city);
  const closed = order.status !== "open" || agent.agent_status === "Cancelled";
  return (
    <div style={card}>
      <h3 style={h3}><span>{t("orderDetail.courierPanel")}</span><img src={dexLogo} alt="DEX" style={{ height: 14, width: "auto" }} /></h3>
      {agent.tracking_number ? (
        <div style={{ fontSize: 12.5, color: "var(--ne-text)", display: "grid", gap: 4 }}>
          <a href={`https://www.dex.com.pk/tracking?references=${encodeURIComponent(agent.tracking_number)}`} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", textDecoration: "underline", overflowWrap: "anywhere" }}>{agent.tracking_number}</a>
          {agent.courier_status && <span style={{ color: "var(--ne-muted)" }}>{String(agent.courier_status).replace(/_/g, " ")}</span>}
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: serviceable ? "var(--ne-accent)" : "var(--ne-muted)" }}>{serviceable ? t("orderDetail.dexRecommended") : t("orderDetail.dexNotListed")}</p>
          {pickups.length === 0 && <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--ne-warning)" }}>{t("orderDetail.noPickup")}</p>}
          <button type="button" style={btn(true, false, booking || busy || closed || pickups.length === 0)} disabled={booking || busy || closed || pickups.length === 0} onClick={onBook}>{booking ? t("common.loading") : t("orderDetail.bookDex")}</button>
        </>
      )}
    </div>
  );
}

const Row = ({ l, v }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "var(--ne-muted)" }}>{l}</span><span>{v}</span></div>;

/* ------------------------------ items ------------------------------ */
function ItemsCard({ order, items, editMode, busy, t, storeId, cfUrl, onSave, onCancelEdit }) {
  const [draft, setDraft] = useState([]);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [q, setQ] = useState("");
  const [priceOpen, setPriceOpen] = useState({});
  useEffect(() => {
    if (!editMode) return;
    setDraft(items.map((i) => ({ key: i.id, item_id: i.id, title: i.title, variant_title: i.variant_title, sku: i.sku, image_url: i.image_url, price: String(i.price), orig: Number(i.price), quantity: i.quantity })));
    setError(""); setQ(""); setPriceOpen({});
    if (!catalog) publicFetch(cfUrl, `/get-store-products?store_id=${storeId}`).then(({ data }) => setCatalog(Array.isArray(data.products) ? data.products : []));
  }, [editMode, items]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !catalog) return [];
    const out = [];
    for (const p of catalog) for (const v of p.variants) if (`${p.title} ${v.title} ${v.sku}`.toLowerCase().includes(s)) out.push({ p, v });
    return out.slice(0, 8);
  }, [q, catalog]);

  const setLine = (key, patch) => setDraft((d) => d.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addVariant = ({ p, v }) => {
    setDraft((d) => {
      const ex = d.find((l) => String(l.variant_id) === String(v.id) || (l.item_id && items.find((i) => i.id === l.item_id)?.variant_id === String(v.id)));
      if (ex) return d.map((l) => (l.key === ex.key ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l));
      return [...d, { key: `new-${v.id}-${Date.now()}`, variant_id: String(v.id), title: p.title, variant_title: v.title, sku: v.sku, image_url: p.images?.[0] || null, price: String(v.price), orig: Number(v.price), quantity: 1, isNew: true }];
    });
    setQ("");
  };
  const save = async () => {
    setError("");
    const lines = draft.map((l) => {
      const base = l.item_id ? { item_id: l.item_id } : { variant_id: l.variant_id };
      const priceChanged = Number(l.price) !== l.orig;
      return { ...base, quantity: l.quantity, ...(priceChanged ? { unit_price: Number(l.price) } : {}) };
    });
    const r = await onSave(lines);
    if (!r.ok) setError(r.error || "");
  };
  const lines = editMode ? draft : items.map((i) => ({ key: i.id, title: i.title, variant_title: i.variant_title, sku: i.sku, image_url: i.image_url, price: String(i.price), quantity: i.quantity }));

  return (
    <div style={card}>
      <h3 style={h3}><span>{t("orderDetail.items")}</span>{editMode && <span style={{ fontSize: 11, color: "var(--ne-warning)" }}>{t("orderDetail.editingItems")}</span>}</h3>
      {lines.map((l) => (
        <div key={l.key} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--ne-border)", flexWrap: "wrap" }}>
          {l.image_url ? <img src={l.image_url} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} loading="lazy" /> : <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--ne-surface)", flexShrink: 0 }} />}
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ne-text)", overflowWrap: "anywhere" }}>{l.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{[l.variant_title && l.variant_title !== "Default Title" ? l.variant_title : "", l.sku ? `SKU ${l.sku}` : ""].filter(Boolean).join(" · ")}</div>
          </div>
          {editMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--ne-border)", borderRadius: 8 }}>
                <button type="button" aria-label={t("orderDetail.decrease")} style={{ ...linkBtn, padding: "6px 10px", color: "var(--ne-text)", fontSize: 15 }} disabled={l.quantity <= 1} onClick={() => setLine(l.key, { quantity: l.quantity - 1 })}>−</button>
                <span style={{ minWidth: 26, textAlign: "center", fontSize: 13, color: "var(--ne-text)" }}>{l.quantity}</span>
                <button type="button" aria-label={t("orderDetail.increase")} style={{ ...linkBtn, padding: "6px 10px", color: "var(--ne-text)", fontSize: 15 }} disabled={l.quantity >= 99} onClick={() => setLine(l.key, { quantity: l.quantity + 1 })}>+</button>
              </div>
              {priceOpen[l.key] ? (
                <input style={{ ...input, width: 90 }} inputMode="decimal" aria-label={t("orderDetail.unitPrice")} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
              ) : (
                <span style={{ fontSize: 12.5, color: "var(--ne-text)" }}>{money(l.price, order.currency)} <button type="button" style={linkBtn} onClick={() => setPriceOpen((p) => ({ ...p, [l.key]: true }))}>{t("orderDetail.editPrice")}</button></span>
              )}
              <button type="button" aria-label={t("orderDetail.removeItem")} title={t("orderDetail.removeItem")} style={{ ...btn(false, true), padding: "5px 8px" }} disabled={draft.length <= 1} onClick={() => setDraft((d) => d.filter((x) => x.key !== l.key))}><Icon name="trash" size={12} /></button>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--ne-text)", display: "flex", gap: 14, alignItems: "baseline" }}>
              <span style={{ color: "var(--ne-muted)" }}>{money(l.price, order.currency)} × {l.quantity}</span>
              <b style={{ minWidth: 80, textAlign: "right" }}>{money(Number(l.price) * l.quantity, order.currency)}</b>
            </div>
          )}
        </div>
      ))}
      {editMode && (
        <div style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 12, position: "relative" }}>
          <label style={lab}>{t("orderDetail.addProduct")}</label>
          <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("orderDetail.searchProducts")} />
          {results.length > 0 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 30, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 9, boxShadow: "0 10px 30px rgba(0,0,0,.35)", maxHeight: 260, overflowY: "auto" }}>
              {results.map((r) => (
                <div key={r.v.id} role="button" tabIndex={0} onClick={() => addVariant(r)} onKeyDown={(e) => { if (e.key === "Enter") addVariant(r); }} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12.5, color: "var(--ne-text)", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ overflowWrap: "anywhere" }}>{r.p.title}{r.v.title && r.v.title !== "Default Title" ? ` — ${r.v.title}` : ""}</span><b style={{ whiteSpace: "nowrap" }}>{money(r.v.price, order.currency)}</b>
                </div>
              ))}
            </div>
          )}
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("orderDetail.itemsHint")}</p>
          {error && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={btn(true, false, busy || draft.length === 0)} disabled={busy || draft.length === 0} onClick={save}>{busy ? t("common.loading") : t("orderDetail.saveItems")}</button>
            <button type="button" style={btn(false)} onClick={onCancelEdit}>{t("action.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ notes / customer / address ------------------------------ */
function NotesCard({ order, t, busy, onSave }) {
  const [note, setNote] = useState(order.internal_note || "");
  useEffect(() => setNote(order.internal_note || ""), [order.internal_note]);
  const dirty = note !== (order.internal_note || "");
  return (
    <div style={card}>
      <h3 style={h3}><span>{t("orderDetail.notes")}</span></h3>
      {order.customer_note && <div style={{ fontSize: 12, color: "var(--ne-muted)", marginBottom: 10 }}><b>{t("orderDetail.customerNote")}:</b> {order.customer_note}</div>}
      <textarea style={{ ...input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} maxLength={2000} value={note} placeholder={t("orderDetail.notesPlaceholder")} onChange={(e) => setNote(e.target.value)} />
      {dirty && <button type="button" style={{ ...btn(true, false, busy), marginTop: 8 }} disabled={busy} onClick={() => onSave(note)}>{t("action.save")}</button>}
    </div>
  );
}

function CustomerCard({ order, phone, wa, locked, t, busy, onSave }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ customer_name: "", customer_phone: "", customer_email: "" });
  const [err, setErr] = useState("");
  useEffect(() => setF({ customer_name: order.customer_name || "", customer_phone: order.customer_phone || "", customer_email: order.customer_email || "" }), [order.customer_name, order.customer_phone, order.customer_email, edit]);
  const save = async () => { setErr(""); const r = await onSave(f); if (r.ok) setEdit(false); else setErr(r.error || ""); };
  return (
    <div style={card}>
      <h3 style={h3}><span>{t("orderDetail.customer")}</span>{!locked && <button type="button" style={linkBtn} onClick={() => setEdit((v) => !v)}>{edit ? t("action.cancel") : t("orderDetail.editLink")}</button>}</h3>
      {!edit ? (
        <div style={{ fontSize: 12.5, color: "var(--ne-text)", display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>{order.customer_name}</div>
          {phone && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a href={`tel:${phone}`} style={{ color: "var(--ne-accent)", textDecoration: "none" }}>{phone}</a>
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...linkBtn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="comment" size={11} /> {t("orderDetail.whatsapp")}</a>}
            </div>
          )}
          {order.customer_email ? <a href={`mailto:${order.customer_email}`} style={{ color: "var(--ne-accent)", textDecoration: "none", overflowWrap: "anywhere" }}>{order.customer_email}</a> : <span style={{ color: "var(--ne-muted)" }}>{t("orderDetail.noEmail")}</span>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div><label style={lab}>{t("orderDetail.name")}</label><input style={input} maxLength={120} value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></div>
          <div><label style={lab}>{t("orderDetail.phone")}</label><input style={input} inputMode="numeric" maxLength={11} value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} /></div>
          <div><label style={lab}>{t("orderDetail.email")}</label><input style={input} maxLength={254} value={f.customer_email} onChange={(e) => setF({ ...f, customer_email: e.target.value })} /></div>
          {err && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: 0 }}>{err}</p>}
          <div><button type="button" style={btn(true, false, busy)} disabled={busy} onClick={save}>{t("action.save")}</button></div>
        </div>
      )}
    </div>
  );
}

function AddressCard({ order, locked, t, busy, cfUrl, onSave }) {
  const a = order.shipping_address || {};
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(a);
  const [geo, setGeo] = useState([]);
  const [areas, setAreas] = useState([]);
  const [subareas, setSubareas] = useState([]);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  useEffect(() => { if (edit) { setF({ ...a }); setErr(""); if (!geo.length) publicFetch(cfUrl, "/get-geo-data").then(({ data }) => setGeo(Array.isArray(data.provinces) ? data.provinces : [])); } }, [edit]);
  const prov = geo.find((p) => p.name.toLowerCase() === String(f.province || "").toLowerCase());
  const cityNames = prov ? prov.cities.map((c) => c.name) : [];
  useEffect(() => {
    const my = ++seq.current;
    setAreas([]); setSubareas([]);
    if (!edit || !f.province || !f.city) return;
    publicFetch(cfUrl, `/get-geo-areas?province=${encodeURIComponent(f.province)}&city=${encodeURIComponent(f.city)}`).then(({ data }) => { if (my === seq.current) setAreas(Array.isArray(data.areas) ? data.areas : []); });
    if (f.area) publicFetch(cfUrl, `/get-geo-subareas?province=${encodeURIComponent(f.province)}&city=${encodeURIComponent(f.city)}&area=${encodeURIComponent(f.area)}`).then(({ data }) => { if (my === seq.current) setSubareas(Array.isArray(data.subareas) ? data.subareas : []); });
  }, [edit, f.province, f.city, f.area]);
  const save = async () => { setErr(""); const r = await onSave({ province: f.province, city: f.city, area: f.area, subarea: f.subarea, address1: f.address1, address2: f.address2, postal_code: f.postal_code }); if (r.ok) setEdit(false); else setErr(r.error || ""); };
  const line = [a.address1, a.address2, a.subarea, a.area, a.city, a.province, a.postal_code].filter(Boolean);
  return (
    <div style={card}>
      <h3 style={h3}><span>{t("orderDetail.shippingAddress")}</span>{!locked && <button type="button" style={linkBtn} onClick={() => setEdit((v) => !v)}>{edit ? t("action.cancel") : t("orderDetail.editLink")}</button>}</h3>
      {!edit ? (
        <div style={{ fontSize: 12.5, color: "var(--ne-text)", lineHeight: 1.6 }}>
          {line.length ? line.map((x, i) => <div key={i}>{x}</div>) : <span style={{ color: "var(--ne-muted)" }}>—</span>}
          {a.lat !== undefined && a.lng !== undefined && <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" style={{ ...linkBtn, textDecoration: "none", display: "inline-block", marginTop: 6 }}>{t("orderDetail.viewMap")}</a>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div><label style={lab}>{t("orderDetail.province")}</label>
            <select style={input} value={f.province || ""} onChange={(e) => setF({ ...f, province: e.target.value, city: "", area: "", subarea: "" })}>
              <option value="">{t("orderDetail.selectProvince")}</option>
              {[...new Set([...geo.map((p) => p.name), f.province].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
            </select></div>
          <div><label style={lab}>{t("orderDetail.city")}</label>
            <input style={input} list="od-cities" maxLength={120} value={f.city || ""} onChange={(e) => setF({ ...f, city: e.target.value, area: "", subarea: "" })} />
            <datalist id="od-cities">{cityNames.map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label style={lab}>{t("orderDetail.area")}</label>
            <input style={input} list="od-areas" maxLength={120} value={f.area || ""} onChange={(e) => setF({ ...f, area: e.target.value, subarea: "" })} />
            <datalist id="od-areas">{areas.map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label style={lab}>{t("orderDetail.subarea")}</label>
            <input style={input} list="od-subareas" maxLength={120} value={f.subarea || ""} onChange={(e) => setF({ ...f, subarea: e.target.value })} />
            <datalist id="od-subareas">{subareas.map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label style={lab}>{t("orderDetail.address1")}</label><textarea style={{ ...input, minHeight: 56, fontFamily: "inherit" }} maxLength={300} value={f.address1 || ""} onChange={(e) => setF({ ...f, address1: e.target.value })} /></div>
          <div><label style={lab}>{t("orderDetail.address2")}</label><input style={input} maxLength={200} value={f.address2 || ""} onChange={(e) => setF({ ...f, address2: e.target.value })} /></div>
          <div><label style={lab}>{t("orderDetail.postal")}</label><input style={input} maxLength={10} value={f.postal_code || ""} onChange={(e) => setF({ ...f, postal_code: e.target.value })} /></div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--ne-muted)" }}>{t("orderDetail.addressRecalc")}</p>
          {err && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: 0 }}>{err}</p>}
          <div><button type="button" style={btn(true, false, busy)} disabled={busy} onClick={save}>{t("action.save")}</button></div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ timeline ------------------------------ */
function Timeline({ events, tz, t, busy, onPost }) {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [posting, setPosting] = useState(false);
  const post = async () => {
    if (!msg.trim() || posting) return;
    setPosting(true); setErr("");
    const r = await onPost(msg);
    setPosting(false);
    if (r.ok) setMsg(""); else setErr(r.error || "");
  };
  return (
    <div style={card}>
      <h3 style={h3}><span>{t("orderDetail.timeline")}</span></h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input style={{ ...input, flex: "1 1 220px", width: "auto" }} maxLength={2000} value={msg} placeholder={t("orderDetail.commentPlaceholder")} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") post(); }} />
        <button type="button" style={btn(true, false, posting || !msg.trim() || busy)} disabled={posting || !msg.trim() || busy} onClick={post}>{t("orderDetail.postComment")}</button>
      </div>
      {err && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}
      {events.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ne-muted)", margin: 0 }}>{t("orderDetail.noEvents")}</p>}
      <div style={{ display: "grid", gap: 0 }}>
        {events.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--ne-border)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: e.type === "comment" ? "var(--ne-accent)" : "var(--ne-border)" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: "var(--ne-text)", overflowWrap: "anywhere", whiteSpace: "pre-line" }}>{e.message}</div>
              <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>{formatStoreDate(e.created_at, tz)}{e.actor_name ? ` · ${e.actor_name}` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
