// Master Dashboard › Payments (eNeezam owner only): bank transfers to approve, payment methods on / off, promo and trial codes.
import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { billingApi, rs, dayText } from "../lib/billingApi";

const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: 18 };
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box" };
const btn = (primary, danger) => ({ background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : danger ? "var(--ne-danger)" : "var(--ne-text)", border: primary ? "none" : `1px solid ${danger ? "var(--ne-danger)" : "var(--ne-border)"}`, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });
const muted = { color: "var(--ne-muted)", fontSize: 12.5 };
const STATUS = { pending: "Gateway par", submitted: "Verify karein", paid: "Paid", failed: "Fail", rejected: "Reject", review: "Raqam farq, dekhein" };
const EMPTY = { code: "", kind: "percent", percent: 10, trial_days: 14, plan_id: "", max_uses: "", expires_at: "", note: "" };

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "var(--ne-muted)" }}>{label}{children}</label>;
}

export default function BillingAdmin({ onExit }) {
  const [data, setData] = useState(null);
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("payments");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [promo, setPromo] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await billingApi("admin/overview");
    if (d.error) { setMsg(d.error); return; }
    setData(d); setS(d.settings);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (path, body, okText) => {
    setBusy(true); setMsg("");
    const d = await billingApi(`admin/${path}`, body);
    setBusy(false);
    setMsg(d.error || okText);
    if (!d.error) load();
    return d;
  };
  const showProof = async (id) => {
    const w = window.open("", "_blank");
    const d = await billingApi("admin/proof", { payment_id: id });
    if (d.error) { w?.close(); setMsg(d.error); } else if (w) w.location.href = d.url;
  };
  const approve = (p) => { if (window.confirm(`${p.stores?.store_name}: ${rs(p.amount)} bank mein aa gaye? Plan ${p.plans?.name} active ho jayega.`)) run("review", { payment_id: p.id, action: "approve" }, "Approve ho gaya, email bhej di."); };
  const reject = (p) => { const note = window.prompt("Reject ki wajah (merchant ko email mein jayegi):"); if (note?.trim()) run("review", { payment_id: p.id, action: "reject", note }, "Reject ho gaya, email bhej di."); };
  const savePromo = async (e) => {
    e.preventDefault();
    const d = await run("promo-save", { ...promo, expires_at: promo.expires_at ? `${promo.expires_at}T23:59:59+05:00` : "" }, "Code ban gaya.");
    if (!d.error) setPromo(EMPTY);
  };

  const payments = (data?.payments || []).filter((p) => !onlyOpen || p.status === "submitted" || p.status === "review");
  const bank = s?.bank_details || {};
  const setBank = (k, v) => setS({ ...s, bank_details: { ...bank, [k]: v } });
  const sec = data?.secrets || {};

  return (
    <div className="ne-app-shell ne-master" style={{ height: "100%", overflow: "auto" }}>
      <style>{".ba-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.ba-g{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:820px){.ba-two,.ba-g{grid-template-columns:1fr}}"}</style>
      <div style={{ padding: "20px 20px 50px", maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Payments</h1><p style={{ ...muted, margin: "4px 0 0" }}>Plan ki payments, payment methods aur promo codes.</p></div>
          <button style={btn(false)} onClick={onExit}>Master Dashboard</button>
        </div>
        {msg && <div role="status" style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["payments", "Payments"], ["methods", "Payment methods"], ["promos", "Promo codes"], ["stores", "Plans ki muddat"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} style={btn(tab === id)} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        {!data && !msg && <div style={card}>Load ho raha hai...</div>}

        {data && tab === "payments" && (
          <div style={{ ...card, display: "grid", gap: 10 }}>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Sirf jo verify karni hain</label>
            {payments.length === 0 && <p style={{ ...muted, margin: 0 }}>Koi payment nahi.</p>}
            {payments.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--ne-border)", paddingTop: 10 }}>
                <div style={{ fontSize: 13 }}>
                  <b>{p.stores?.store_name}</b> · {p.plans?.name} · <b>{rs(p.amount)}</b>{p.discount > 0 && ` (${p.promo_code}, - ${rs(p.discount)})`}
                  <div style={muted}>{dayText(p.created_at)} · {p.method === "bank" ? "Bank transfer" : `Rapid ${p.environment}`} · {STATUS[p.status]}{p.reference && ` · Ref: ${p.reference}`}{p.gateway_ref && ` · ${p.gateway_ref}`}{p.note && ` · ${p.note}`}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {p.proof_path && <button style={btn(false)} onClick={() => showProof(p.id)}><Icon name="eye" size={13} /> Screenshot</button>}
                  {(p.status === "submitted" || p.status === "review") && <><button disabled={busy} style={btn(true)} onClick={() => approve(p)}>Approve</button><button disabled={busy} style={btn(false, true)} onClick={() => reject(p)}>Reject</button></>}
                </div>
              </div>
            ))}
          </div>
        )}

        {data && s && tab === "methods" && (
          <>
            <div className="ba-two">
              <div style={{ ...card, display: "grid", gap: 10 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={s.rapid_enabled} onChange={(e) => setS({ ...s, rapid_enabled: e.target.checked })} /> Rapid Gateway</label>
                <div className="ba-g">
                  <Field label="Mode"><select style={input} value={s.rapid_mode} onChange={(e) => setS({ ...s, rapid_mode: e.target.value })}><option value="TEST">TEST (sirf aap ko dikhega)</option><option value="LIVE">LIVE</option></select></Field>
                  <Field label="Merchant ID"><input style={input} inputMode="numeric" value={s.rapid_merchant_id || ""} onChange={(e) => setS({ ...s, rapid_merchant_id: e.target.value })} /></Field>
                </div>
                <Field label="Webhook URL (Rapid › Settings › Webhooks, TEST aur LIVE dono mein)"><input style={input} readOnly value={data.webhook_url} onFocus={(e) => e.target.select()} /></Field>
                <div style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
                  {[["Client secret (LIVE)", sec.rapid_client], ["Webhook secret (LIVE)", sec.rapid_webhook], ["Webhook secret (TEST)", sec.rapid_webhook_test], ["Email (Resend)", sec.email]].map(([k, ok]) => <div key={k} style={{ color: ok ? "var(--ne-success)" : "var(--ne-warning)" }}>{ok ? "✓" : "✕"} {k}</div>)}
                </div>
                <p style={{ ...muted, margin: 0 }}>LIVE tab hi merchant ko dikhta hai jab client secret aur webhook secret dono lage hon.</p>
              </div>
              <div style={{ ...card, display: "grid", gap: 10 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={s.bank_enabled} onChange={(e) => setS({ ...s, bank_enabled: e.target.checked })} /> Bank transfer</label>
                <div className="ba-g">
                  <Field label="Bank"><input style={input} value={bank.bank || ""} onChange={(e) => setBank("bank", e.target.value)} /></Field>
                  <Field label="Account title"><input style={input} value={bank.title || ""} onChange={(e) => setBank("title", e.target.value)} /></Field>
                  <Field label="Account number"><input style={input} value={bank.account || ""} onChange={(e) => setBank("account", e.target.value)} /></Field>
                  <Field label="IBAN"><input style={input} value={bank.iban || ""} onChange={(e) => setBank("iban", e.target.value)} /></Field>
                </div>
                <Field label="Hidayat (optional)"><textarea style={input} rows={2} value={bank.note || ""} onChange={(e) => setBank("note", e.target.value)} /></Field>
              </div>
            </div>
            <div style={{ ...card, display: "grid", gap: 10 }}>
              <div className="ba-g">
                <Field label="Naye bank transfer ki email kahan aaye"><input style={input} type="email" value={s.notify_email} onChange={(e) => setS({ ...s, notify_email: e.target.value })} /></Field>
                <Field label="Plan khatam hone ke baad kitne din khula rahe"><input style={input} type="number" min={0} max={30} value={s.grace_days} onChange={(e) => setS({ ...s, grace_days: e.target.value })} /></Field>
              </div>
              <div><button disabled={busy} style={btn(true)} onClick={() => run("settings", s, "Settings save ho gayin.")}>Save</button></div>
            </div>
          </>
        )}

        {data && tab === "promos" && (
          <>
            <form style={{ ...card, display: "grid", gap: 10 }} onSubmit={savePromo}>
              <b>Naya code</b>
              <div className="ba-g">
                <Field label="Code"><input style={input} required maxLength={30} value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value.toUpperCase() })} placeholder="TRIAL14" /></Field>
                <Field label="Qism"><select style={input} value={promo.kind} onChange={(e) => setPromo({ ...promo, kind: e.target.value })}><option value="percent">Discount %</option><option value="trial">Free trial (bina payment)</option></select></Field>
                {promo.kind === "trial"
                  ? <Field label="Kitne din"><input style={input} type="number" min={1} max={90} value={promo.trial_days} onChange={(e) => setPromo({ ...promo, trial_days: e.target.value })} /></Field>
                  : <Field label="Kitne percent"><input style={input} type="number" min={1} max={90} value={promo.percent} onChange={(e) => setPromo({ ...promo, percent: e.target.value })} /></Field>}
                <Field label="Plan"><select style={input} value={promo.plan_id} onChange={(e) => setPromo({ ...promo, plan_id: e.target.value })}><option value="">Sab plans</option>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <Field label="Zyada se zyada kitne store (khali = koi had nahi)"><input style={input} type="number" min={1} value={promo.max_uses} onChange={(e) => setPromo({ ...promo, max_uses: e.target.value })} /></Field>
                <Field label="Aakhri tareekh (optional)"><input style={input} type="date" value={promo.expires_at} onChange={(e) => setPromo({ ...promo, expires_at: e.target.value })} /></Field>
              </div>
              <Field label="Note (sirf aap ke liye)"><input style={input} value={promo.note} onChange={(e) => setPromo({ ...promo, note: e.target.value })} /></Field>
              <div><button type="submit" disabled={busy} style={btn(true)}>Code banayein</button></div>
              <p style={{ ...muted, margin: 0 }}>Har store ek code ek hi dafa use kar sakta hai. Discount sirf us ek payment par lagta hai.</p>
            </form>
            <div style={{ ...card, display: "grid", gap: 8 }}>
              {data.promos.length === 0 && <p style={{ ...muted, margin: 0 }}>Abhi koi code nahi.</p>}
              {data.promos.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13, borderBottom: "1px solid var(--ne-border)", paddingBottom: 8 }}>
                  <div><b>{c.code}</b> · {c.kind === "trial" ? `${c.trial_days} din trial` : `${c.percent}% off`} · {data.plans.find((p) => p.id === c.plan_id)?.name || "Sab plans"}<div style={muted}>Use: {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}{c.expires_at && ` · ${dayText(c.expires_at)} tak`}{c.note && ` · ${c.note}`}</div></div>
                  <button disabled={busy} style={btn(false)} onClick={() => run("promo-toggle", { id: c.id, active: !c.active }, "Ho gaya.")}>{c.active ? "Active" : "Band"}</button>
                </div>
              ))}
            </div>
          </>
        )}

        {data && tab === "stores" && (
          <div style={{ ...card, display: "grid", gap: 8 }}>
            <p style={{ ...muted, margin: 0 }}>Sirf woh stores jinhon ne is checkout se plan ya trial liya. Purane stores par koi asar nahi.</p>
            {data.billing.map((b) => (
              <div key={b.store_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13, borderTop: "1px solid var(--ne-border)", paddingTop: 8 }}>
                <span><b>{b.stores?.store_name}</b> · {b.plans?.name}{b.status === "trial" && " (trial)"}</span>
                <span style={{ color: new Date(b.period_end) < new Date() ? "var(--ne-danger)" : "var(--ne-text)" }}>{dayText(b.period_end)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
