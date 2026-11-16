import { useState, useEffect, useCallback, useRef } from "react";
import Icon from "../components/Icon";
import { useLanguage } from "../i18n";
import { workerFetch } from "../lib/storeApi";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

// Strings live here (not in i18n.js) so this page does not collide with other work on the shared dictionary.
const S = {
  en: {
    title: "WhatsApp", sub: "Order confirmation and delivery updates on WhatsApp (official Meta Cloud API).",
    connTitle: "WhatsApp number", ownTitle: "Your own WhatsApp number (recommended)",
    ownHelp: "Connect your business WhatsApp number with Meta (takes about 3 minutes). Messages go out in your store's name and Meta bills your card directly.",
    ownBtn: "Connect with Facebook", sharedTitle: "eNeezam's WhatsApp number",
    sharedHelp: "No setup: messages go from eNeezam's number with your store name in the text.", sharedBtn: "Use eNeezam's number",
    sharedNone: "eNeezam's shared number is not ready yet.", esNotReady: "Connecting your own number is not open yet (waiting for Meta approval).",
    connected: "Connected", pending: "Pending", disconnect: "Disconnect", disconnectAsk: "Disconnect WhatsApp from this store?",
    on: "WhatsApp messages are ON", off: "WhatsApp messages are OFF", turnOn: "Turn on", turnOff: "Turn off",
    eventsTitle: "Messages", ev_order_confirm: "New order: Confirm / Cancel / Edit address",
    ev_order_confirm_d: "Confirm approves the order, Cancel cancels it, Edit address asks the customer for the new address and saves it.",
    ev_dispatched: "Dispatched (with tracking number)", ev_dispatched_d: "When the courier picks up the parcel.",
    ev_out_for_delivery: "Out for delivery", ev_out_for_delivery_d: "The rider will call today; keep cash ready.",
    ev_delivery_failed: "Failed delivery: Re-attempt / Cancel / Reason",
    ev_delivery_failed_d: "The customer's answer is written into the order's remarks and you get a notification.",
    usage: "This month", of: "of", messages: "messages", plan: "Plan", unlimited: "Unlimited",
    limitHit: "Monthly limit reached: no more messages this month.",
    templates: "Message templates (Meta review)", refresh: "Refresh", tplNone: "Templates are created when a number is connected.",
    test: "Send a test", testHelp: "Sends the new-order message for one order to any phone (for example your own).",
    orderId: "Order ID (from the Orders list)", phone: "Phone 03xx-xxxxxxx", send: "Send", sent: "Sent",
    log: "Recent messages", logEmpty: "No messages yet.", out: "Sent", in: "Received",
    sqlMissing: "WhatsApp tables are not created in the database yet.", loading: "Loading…", error: "Something went wrong",
    cost: "Meta charges about Rs 4.2 per utility message in Pakistan (Oct 2026 rate), billed by Meta to the number's owner.",
  },
  ur: {
    title: "WhatsApp", sub: "Order confirmation aur delivery updates WhatsApp par (Meta ka official Cloud API).",
    connTitle: "WhatsApp number", ownTitle: "Apna WhatsApp number (behtar)",
    ownHelp: "Apna business WhatsApp number Meta ke zariye connect karein (taqreeban 3 minute). Messages aap ke store ke naam se jayenge aur Meta aap ke card se charge karega.",
    ownBtn: "Facebook se connect karein", sharedTitle: "eNeezam ka WhatsApp number",
    sharedHelp: "Koi setup nahi: messages eNeezam ke number se jayenge, text mein aap ke store ka naam hoga.", sharedBtn: "eNeezam ka number use karein",
    sharedNone: "eNeezam ka shared number abhi tayyar nahi.", esNotReady: "Apna number connect karna abhi band hai (Meta approval ka intezar).",
    connected: "Connected", pending: "Pending", disconnect: "Disconnect", disconnectAsk: "Is store se WhatsApp disconnect karein?",
    on: "WhatsApp messages ON hain", off: "WhatsApp messages OFF hain", turnOn: "On karein", turnOff: "Off karein",
    eventsTitle: "Messages", ev_order_confirm: "Naya order: Confirm / Cancel / Edit address",
    ev_order_confirm_d: "Confirm se order Approved, Cancel se Cancelled; Edit address par customer naya address bhejta hai jo order mein save ho jata hai.",
    ev_dispatched: "Dispatch (tracking number ke saath)", ev_dispatched_d: "Jab courier parcel utha le.",
    ev_out_for_delivery: "Out for delivery", ev_out_for_delivery_d: "Rider aaj call karega, cash tayyar rakhein.",
    ev_delivery_failed: "Delivery fail: Dobara / Cancel / Wajah",
    ev_delivery_failed_d: "Customer ka jawab order ke remarks mein likha jata hai aur aap ko notification milti hai.",
    usage: "Is mahine", of: "mein se", messages: "messages", plan: "Plan", unlimited: "Unlimited",
    limitHit: "Mahine ki limit poori: is mahine mazeed messages nahi jayenge.",
    templates: "Message templates (Meta review)", refresh: "Refresh", tplNone: "Number connect hone par templates ban jate hain.",
    test: "Test bhejein", testHelp: "Kisi bhi order ka naya-order message kisi bhi number par bhejein (jaise apne number par).",
    orderId: "Order ID (Orders list se)", phone: "Phone 03xx-xxxxxxx", send: "Bhejein", sent: "Bhej diya",
    log: "Haal ke messages", logEmpty: "Abhi koi message nahi.", out: "Bheja", in: "Aaya",
    sqlMissing: "WhatsApp ke tables database mein abhi nahi bane.", loading: "Load ho raha hai…", error: "Kuch ghalat ho gaya",
    cost: "Pakistan mein Meta har utility message ka taqreeban Rs 4.2 leta hai (Oct 2026 rate), number ke maalik se.",
  },
};

const EVENTS = ["order_confirm", "dispatched", "out_for_delivery", "delivery_failed"];
const PLANS = ["essential", "grow", "advance", "unlimited"];

function loadFbSdk(appId) {
  return new Promise((resolve, reject) => {
    if (window.FB) { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v27.0" }); return resolve(window.FB); }
    window.fbAsyncInit = () => { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v27.0" }); resolve(window.FB); };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Facebook SDK could not load"));
    document.body.appendChild(s);
  });
}

export default function WhatsApp({ storeId, role }) {
  const [lang] = useLanguage();
  const L = S[lang] || S.en;
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // { kind, text }
  const [test, setTest] = useState({ order: "", phone: "" });
  const session = useRef({});

  const call = useCallback((path, body) => workerFetch(CF_URL, path, body ? { method: "POST", body: JSON.stringify({ store_id: storeId, ...body }) } : {}), [storeId]);

  const load = useCallback(async (refresh) => {
    if (!storeId) return;
    const { data } = await call(`/whatsapp/status?store_id=${storeId}${refresh ? "&refresh=1" : ""}`);
    setSt(data || {});
  }, [storeId, call]);
  useEffect(() => { setSt(null); load(); }, [load]);

  // Embedded Signup tells us the WABA and phone number id through a postMessage from facebook.com
  useEffect(() => {
    const onMsg = (e) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(e.origin).hostname)) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d && d.type === "WA_EMBEDDED_SIGNUP" && d.data) session.current = { ...session.current, ...d.data, event: d.event };
      } catch { /* not ours */ }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const run = async (key, fn) => {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ kind: "error", text: e.message || L.error }); }
    setBusy("");
  };

  const connectOwn = () => run("own", async () => {
    const su = st?.signup || {};
    const FB = await loadFbSdk(su.app_id);
    session.current = {};
    const code = await new Promise((resolve, reject) => FB.login((r) => (r.authResponse && r.authResponse.code ? resolve(r.authResponse.code) : reject(new Error(lang === "ur" ? "Connect cancel ho gaya" : "Connection cancelled"))), {
      config_id: su.config_id, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    }));
    const { data } = await call("/whatsapp/connect", { code, waba_id: session.current.waba_id, phone_number_id: session.current.phone_number_id, business_id: session.current.business_id });
    if (!data?.ok) throw new Error(data?.error || L.error);
    setMsg({ kind: "success", text: `${L.connected}${data.warnings?.length ? " — " + data.warnings.join(" | ") : ""}` });
    await load();
  });
  const useShared = () => run("shared", async () => { const { data } = await call("/whatsapp/use-shared", {}); if (!data?.ok) throw new Error(data?.error || L.error); await load(); });
  const save = (patch, key = "save") => run(key, async () => { const { data } = await call("/whatsapp/settings", patch); if (!data?.ok) throw new Error(data?.error || L.error); await load(); });
  const disconnect = () => { if (window.confirm(L.disconnectAsk)) run("disconnect", async () => { await call("/whatsapp/disconnect", {}); await load(); }); };
  const sendTest = () => run("test", async () => {
    const { data } = await call("/whatsapp/send-order", { order_id: test.order.trim().replace(/^#/, ""), to: test.phone.trim(), kind: "order_confirm" });
    if (!data?.sent) throw new Error(data?.error || data?.reason || L.error);
    setMsg({ kind: "success", text: L.sent }); await load();
  });

  if (!st) return <div className="ne-acc-empty">{L.loading}</div>;
  const acc = st.account;
  const live = acc && acc.status !== "disconnected" && (acc.mode === "shared" || acc.phone_number_id);
  const used = st.usage?.used || 0;
  const limit = st.usage?.limit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tpls = acc?.templates?.templates || {};
  const fmt = (d) => new Date(d).toLocaleString(lang === "ur" ? "en-PK" : undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
      <div className="ne-acc-header">
        <span className="ne-acc-logo"><Icon name="comment" size={20} /></span>
        <div><h1>{L.title}</h1><p>{L.sub}</p></div>
      </div>
      {st.setup_missing === "sql" && <p className="ne-assets-warn">{L.sqlMissing}</p>}
      {st.error && <p className="ne-assets-warn">{st.error}</p>}
      {msg && <p className={msg.kind === "error" ? "ne-assets-warn" : "ne-acc-note"} style={msg.kind === "success" ? { color: "var(--ne-success)" } : undefined}>{msg.text}</p>}

      <div className="ne-acc-item"><div className="ne-acc-body" style={{ paddingTop: 16 }}>
        <div className="ne-acc-sublabel">{L.connTitle}</div>
        {live ? (
          <div className="ne-acc-list">
            <div className="ne-acc-row active">
              <span className="ne-acc-avatar"><Icon name="comment" size={15} /></span>
              <span className="ne-acc-row-text">
                <span className="ne-acc-row-name">{acc.mode === "shared" ? L.sharedTitle : (acc.verified_name || L.ownTitle)}</span>
                <span className="ne-acc-row-sub" dir="ltr">{acc.mode === "shared" ? (st.shared_display || "") : (acc.display_phone || acc.phone_number_id)}</span>
              </span>
              <span className="ne-acc-tag" style={acc.status === "connected" ? undefined : { background: "var(--ne-surface)", color: "var(--ne-muted)" }}>{acc.status === "connected" ? L.connected : L.pending}</span>
            </div>
          </div>
        ) : (
          <div className="ne-share-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="ne-share-opt">
              <span className="ne-share-name">{L.ownTitle}</span>
              <span className="ne-share-desc">{L.ownHelp}</span>
              {st.signup?.config_id
                ? <button className="ne-acc-primary" style={{ marginTop: 6, alignSelf: "flex-start" }} disabled={!!busy} onClick={connectOwn}><Icon name="link" size={13} /> {busy === "own" ? "…" : L.ownBtn}</button>
                : <span className="ne-share-desc" style={{ fontStyle: "italic" }}>{L.esNotReady}</span>}
            </div>
            <div className="ne-share-opt">
              <span className="ne-share-name">{L.sharedTitle}</span>
              <span className="ne-share-desc">{L.sharedHelp}</span>
              {st.shared_available
                ? <button className="ne-acc-outline" style={{ marginTop: 6, alignSelf: "flex-start" }} disabled={!!busy} onClick={useShared}>{busy === "shared" ? "…" : L.sharedBtn}</button>
                : <span className="ne-share-desc" style={{ fontStyle: "italic" }}>{L.sharedNone}</span>}
            </div>
          </div>
        )}
        {acc?.last_error && <p className="ne-assets-warn" style={{ marginTop: 8 }}>{acc.last_error}</p>}
        {live && (
          <div className="ne-acc-actions">
            <button className={acc.enabled ? "ne-acc-outline" : "ne-acc-primary"} disabled={!!busy} onClick={() => save({ enabled: !acc.enabled }, "toggle")}>{acc.enabled ? L.turnOff : L.turnOn}</button>
            <span style={{ fontSize: 13, fontWeight: 650, color: acc.enabled ? "var(--ne-success)" : "var(--ne-muted)" }}>{acc.enabled ? L.on : L.off}</span>
            <button type="button" className="ne-asset-link danger" style={{ marginInlineStart: "auto" }} disabled={!!busy} onClick={disconnect}>{L.disconnect}</button>
          </div>
        )}
        <p className="ne-acc-note"><Icon name="cash" size={12} /> {L.cost}</p>
      </div></div>

      {live && (
        <div className="ne-acc-item"><div className="ne-acc-body" style={{ paddingTop: 16 }}>
          <div className="ne-acc-sublabel">{L.eventsTitle}</div>
          <div className="ne-acc-list">
            {EVENTS.map((k) => (
              <label key={k} className="ne-acc-row" style={{ cursor: "pointer" }}>
                <span className="ne-acc-row-text">
                  <span className="ne-acc-row-name" style={{ whiteSpace: "normal" }}>{L[`ev_${k}`]}</span>
                  <span className="ne-acc-row-sub">{L[`ev_${k}_d`]}{tpls[k] ? ` · ${tpls[k].status}` : ""}</span>
                </span>
                <input type="checkbox" style={{ width: 18, height: 18, accentColor: "var(--ne-accent)" }} checked={!!acc.events?.[k]} disabled={!!busy} onChange={(e) => save({ events: { [k]: e.target.checked } }, `ev-${k}`)} />
              </label>
            ))}
          </div>
        </div></div>
      )}

      <div className="ne-acc-item"><div className="ne-acc-body" style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="ne-acc-sublabel" style={{ margin: 0 }}>{L.usage}: {used.toLocaleString()} {limit ? `${L.of} ${limit.toLocaleString()}` : ""} {L.messages}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            {L.plan}:{" "}
            {role === "creator" && acc
              ? <select value={acc.plan} disabled={!!busy} onChange={(e) => save({ plan: e.target.value }, "plan")} style={{ padding: "4px 8px", borderRadius: 8 }}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              : <strong style={{ textTransform: "capitalize" }}>{acc?.plan || "essential"}</strong>}
          </div>
        </div>
        {limit ? <div style={{ height: 8, borderRadius: 99, background: "var(--ne-surface)", marginTop: 10, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--ne-danger, #ef4444)" : pct > 80 ? "#F2A83E" : "var(--ne-success)" }} /></div> : null}
        {limit && used >= limit ? <p className="ne-assets-warn" style={{ marginTop: 8 }}>{L.limitHit}</p> : null}
      </div></div>

      {live && (
        <div className="ne-acc-item"><div className="ne-acc-body" style={{ paddingTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="ne-acc-sublabel">{L.templates}</div>
            <button type="button" className="ne-asset-link" disabled={!!busy} onClick={() => run("refresh", () => load(true))}><Icon name="refresh" size={12} /> {L.refresh}</button>
          </div>
          {Object.keys(tpls).length === 0 ? <div className="ne-acc-empty">{L.tplNone}</div> : (
            <div className="ne-acc-list">
              {EVENTS.filter((k) => tpls[k]).map((k) => (
                <div key={k} className="ne-acc-row">
                  <span className="ne-acc-row-text"><span className="ne-acc-row-name" dir="ltr">{tpls[k].name}</span>{tpls[k].reason && <span className="ne-acc-row-sub">{tpls[k].reason}</span>}</span>
                  <span className="ne-acc-tag" style={tpls[k].status === "APPROVED" ? undefined : { background: "var(--ne-surface)", color: tpls[k].status === "REJECTED" || tpls[k].status === "ERROR" ? "#ef4444" : "var(--ne-muted)" }}>{tpls[k].status}</span>
                </div>
              ))}
            </div>
          )}
          <div className="ne-acc-sublabel" style={{ marginTop: 16 }}>{L.test}</div>
          <p className="ne-acc-help">{L.testHelp}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="ne-input" style={{ flex: "1 1 160px", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)" }} placeholder={L.orderId} value={test.order} onChange={(e) => setTest({ ...test, order: e.target.value })} />
            <input className="ne-input" style={{ flex: "1 1 160px", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)" }} placeholder={L.phone} value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} inputMode="tel" />
            <button className="ne-acc-primary" disabled={!!busy || !test.order.trim() || !test.phone.trim()} onClick={sendTest}>{busy === "test" ? "…" : L.send}</button>
          </div>
        </div></div>
      )}

      <div className="ne-acc-item"><div className="ne-acc-body" style={{ paddingTop: 16 }}>
        <div className="ne-acc-sublabel">{L.log}</div>
        {!(st.messages || []).length ? <div className="ne-acc-empty">{L.logEmpty}</div> : (
          <div className="ne-acc-list">
            {st.messages.map((m) => (
              <div key={m.id} className="ne-acc-row" style={{ alignItems: "flex-start" }}>
                <span className="ne-acc-avatar" style={m.direction === "in" ? { background: "var(--ne-success-soft)", color: "var(--ne-success)" } : undefined}><Icon name={m.direction === "in" ? "comment" : "send"} size={13} /></span>
                <span className="ne-acc-row-text">
                  <span className="ne-acc-row-name" style={{ whiteSpace: "normal" }}>{m.direction === "in" ? L.in : L.out} · {m.kind || "-"} <span dir="ltr" style={{ fontWeight: 500, color: "var(--ne-muted)" }}>+{m.phone}</span></span>
                  <span className="ne-acc-row-sub" style={{ whiteSpace: "pre-wrap" }}>{m.body || ""}{m.error ? `\n⚠ ${m.error}` : ""}</span>
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ne-muted)", textAlign: "end", whiteSpace: "nowrap" }}>{fmt(m.created_at)}<br />{m.status}</span>
              </div>
            ))}
          </div>
        )}
      </div></div>
    </div>
  );
}
