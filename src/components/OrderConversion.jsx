// Order > Conversion (native orders), like Shopify's conversion summary: fraud risk from the connection's location,
// the customer's sessions before the order, the first session's source, landing page, time and UTM parameters, with
// "Conversion details" and per-session "Session details" popups. Data: store_orders.attribution (journey + ip_geo),
// written by the storefront and the worker at checkout.
import { useState } from "react";
import Icon from "./Icon";

const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 };
const DAY = 86400000;

// networks whose IP addresses are registered in Karachi / Islamabad whatever the customer's real city
const UNRELIABLE_IP_NETWORKS = /optix|jazz|mobilink|pakistan mobile|zong|cmpak|china mobile|telenor|ufone|pak telecom mobile|ptml|warid|scom/i;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ordinal = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const utmOf = (v) => [["Campaign", v.utm_campaign], ["Source", v.utm_source], ["Medium", v.utm_medium], ["Content", v.utm_content], ["Term", v.utm_term]].filter(([, x]) => x);

/** where a session came from: Facebook, Instagram, Google, TikTok, WhatsApp, YouTube, another site, or Direct */
function sourceOf(v) {
  const hay = `${v.utm_source || ""} ${v.referrer || ""}`.toLowerCase();
  if (/instagram|\big\b/.test(hay)) return "Instagram";
  if (/facebook|fb\.com|\bfb\b|meta/.test(hay) || v.has_fbclid) return "Facebook";
  if (/google/.test(hay) || v.has_gclid) return "Google";
  if (/tiktok/.test(hay) || v.has_ttclid) return "TikTok";
  if (/whatsapp|wa\.me/.test(hay)) return "WhatsApp";
  if (/youtube|youtu\.be/.test(hay)) return "YouTube";
  if (v.utm_source) return v.utm_source;
  if (v.referrer) { try { return new URL(v.referrer).hostname.replace(/^www\./, ""); } catch { return v.referrer; } }
  return "Direct";
}
const viaOf = (v) => (utmOf(v).length ? "Via UTM" : v.has_fbclid || v.has_gclid || v.has_ttclid ? "Via ad click" : v.referrer ? "Via referral" : "Direct visit");

/** fraud signal from the IP location vs the delivery city */
function ipRisk(attr, address) {
  const ip = attr?.ip_geo;
  const city = address?.city || "";
  if (!ip || (!ip.city && !ip.region)) return { level: "na", text: "Not available" };
  const where = [ip.city, ip.region].filter(Boolean).join(", ");
  if (UNRELIABLE_IP_NETWORKS.test(ip.isp || "")) return { level: "low", text: "Low", note: `IP shows ${where} (${ip.isp}). This network's IP location is not reliable, so it is not used as a risk.` };
  if (city && norm(ip.city) && (norm(ip.city) === norm(city) || norm(city).includes(norm(ip.city)) || norm(ip.city).includes(norm(city)))) return { level: "low", text: "Low", note: `IP location (${where}) matches the delivery city.` };
  if (!city) return { level: "na", text: "Not available", note: `IP shows ${where}.` };
  return { level: "medium", text: "Check", note: `IP location is ${where} but the delivery city is ${city}. Confirm the order on the phone.` };
}

function Row({ icon, label, value, title, tone }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "20px auto minmax(0,1fr)", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5 }}>
      <Icon name={icon} size={14} />
      <span style={{ color: "var(--ne-text)" }}>{label}</span>
      <span title={title || (typeof value === "string" ? value : "")} style={{ textAlign: "right", color: tone || "var(--ne-muted)", fontWeight: tone ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function Modal({ title, onClose, onBack, children }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(640px,100%)", maxHeight: "88vh", overflowY: "auto", background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 18, boxShadow: "0 30px 70px -20px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 6px" }}>
          {onBack && <button type="button" onClick={onBack} aria-label="Back" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ne-text)", fontSize: 18, padding: 0 }}>←</button>}
          <b style={{ flex: 1, fontSize: 16 }}>{title}</b>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: "10px 20px 18px" }}>{children}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 20px 18px" }}>
          <button type="button" onClick={onClose} style={{ padding: "7px 16px", borderRadius: 10, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontWeight: 700, cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function OrderConversion({ order, fmtDate, storeUrl }) {
  const [open, setOpen] = useState(null); // null | "list" | index of a session
  const [more, setMore] = useState(false);
  const attr = order?.attribution || null;
  const journey = Array.isArray(attr?.journey) && attr.journey.length ? attr.journey : attr && (attr.landing_path || attr.referrer || attr.utm_source) ? [{ ...attr, start: order.created_at, last: order.created_at, pages: 1 }] : [];
  const risk = ipRisk(attr, order?.shipping_address);
  const first = journey[0];
  const last = journey[journey.length - 1];
  const days = first ? Math.max(1, Math.ceil((Date.parse(order.created_at) - Date.parse(first.start)) / DAY)) : 0;
  const riskTone = risk.level === "medium" ? "var(--ne-warning)" : risk.level === "low" ? "var(--ne-success)" : undefined;
  const pageLink = (p) => (storeUrl ? <a href={`${storeUrl}${p}`} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)" }}>{p}</a> : p);

  return (
    <div style={card}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>Conversion</div>
      <Row icon="shield" label="Fraud risk" value={risk.text} tone={riskTone} title={risk.note} />
      {risk.note && risk.level !== "na" && <div style={{ fontSize: 11.5, color: risk.level === "medium" ? "var(--ne-warning)" : "var(--ne-muted)", margin: "0 0 4px 28px", lineHeight: 1.45 }}>{risk.note}</div>}
      {!first ? (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ne-muted)" }}>No visit details were recorded for this order.</p>
      ) : (
        <>
          <Row icon="chart" label="Sessions" value={`${journey.length} session${journey.length === 1 ? "" : "s"} over ${days} day${days === 1 ? "" : "s"}`} />
          <Row icon="eye" label="First session" value={sourceOf(first)} />
          {more && (
            <>
              <Row icon="link" label="Source" value={sourceOf(last)} />
              <Row icon="layout" label="Landing page" value={first.landing_path || "/"} />
              <Row icon="calendar" label="Visited" value={fmtDate(first.start)} />
              <Row icon="clipboard" label="UTM" value={utmOf(first).length ? `${utmOf(first).length} parameters` : "None"} />
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setMore((m) => !m)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{more ? "View less details ▲" : "View more details ▼"}</button>
            <button type="button" onClick={() => setOpen("list")} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Conversion details</button>
          </div>
        </>
      )}

      {open === "list" && (
        <Modal title="Conversion details" onClose={() => setOpen(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div><div style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>Total sessions</div><div style={{ fontSize: 24, fontWeight: 800 }}>{journey.length}</div></div>
            <div><div style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>Days to conversion</div><div style={{ fontSize: 24, fontWeight: 800 }}>{days}</div></div>
          </div>
          {journey.map((v, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--ne-border)" : "none" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", border: "1.5px solid var(--ne-text)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{ordinal(i + 1)} session from {sourceOf(v)}</div>
                <div style={{ fontSize: 12, color: "var(--ne-muted)" }}>{fmtDate(v.start)}</div>
                <div style={{ fontSize: 12, color: "var(--ne-muted)" }}>{viaOf(v)}</div>
              </div>
              <button type="button" onClick={() => setOpen(i)} style={{ padding: "6px 12px", borderRadius: 9, border: "none", background: "var(--ne-surface)", color: "var(--ne-text)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>View details</button>
            </div>
          ))}
        </Modal>
      )}

      {typeof open === "number" && journey[open] && (() => {
        const v = journey[open];
        const utm = utmOf(v);
        return (
          <Modal title="Session details" onClose={() => setOpen(null)} onBack={() => setOpen("list")}>
            <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
              <div style={{ display: "flex", gap: 10 }}><Icon name="link" size={14} />Visited your store from {sourceOf(v)}{v.referrer && sourceOf(v) !== v.referrer ? <span style={{ color: "var(--ne-muted)" }}>({v.referrer})</span> : null}</div>
              <div style={{ display: "flex", gap: 10 }}><Icon name="layout" size={14} />The first page they visited was {pageLink(v.landing_path || "/")}</div>
              <div style={{ display: "flex", gap: 10 }}><Icon name="calendar" size={14} />Visited on {fmtDate(v.start)}</div>
              <div style={{ display: "flex", gap: 10 }}><Icon name="eye" size={14} />{v.pages || 1} page{(v.pages || 1) === 1 ? "" : "s"} viewed in this session</div>
            </div>
            {utm.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 6px" }}>UTM Parameters</div>
                {utm.map(([k, val]) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 10, padding: "8px 0", borderTop: "1px solid var(--ne-border)", fontSize: 13 }}>
                    <b>{k}</b><span style={{ overflowWrap: "anywhere" }}>{val}</span>
                  </div>
                ))}
              </>
            )}
          </Modal>
        );
      })()}
    </div>
  );
}
