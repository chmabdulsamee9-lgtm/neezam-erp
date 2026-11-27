// Master Dashboard › Partners (eNeezam owner only): partner accounts for partners.eneezam.com, the revenue share,
// each partner's stores and earnings, codes, payouts and agreement PDF. Data: worker partners.js (+ billing promo-save for codes).
import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { partnerApi } from "../lib/partnerApi";
import { billingApi, rs, dayText } from "../lib/billingApi";

const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: 18 };
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box" };
const btn = (primary, danger) => ({ background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : danger ? "var(--ne-danger)" : "var(--ne-text)", border: primary ? "none" : `1px solid ${danger ? "var(--ne-danger)" : "var(--ne-border)"}`, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
const muted = { color: "var(--ne-muted)", fontSize: 12.5 };
const th = { textAlign: "left", fontSize: 11.5, color: "var(--ne-muted)", fontWeight: 600, padding: "6px 8px", borderBottom: "1px solid var(--ne-border)", whiteSpace: "nowrap" };
const td = { fontSize: 12.5, padding: "7px 8px", borderBottom: "1px solid var(--ne-border)", whiteSpace: "nowrap" };
const NEW = { name: "", email: "", password: "", phone: "", note: "" };

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: "var(--ne-muted)" }}>{label}{children}</label>;
}

function PartnerCard({ p, plans, busy, run, onMsg }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState({ name: p.name, phone: p.phone || "", note: p.note || "", y1_pct: p.y1_pct ?? "", y2_pct: p.y2_pct ?? "", active: p.active });
  const [pay, setPay] = useState({ amount: "", paid_on: new Date().toISOString().slice(0, 10), reference: "", note: "" });
  const [code, setCode] = useState({ code: "", kind: "trial", trial_days: 14, percent: 10, plan_id: "", max_uses: "" });
  const [pass, setPass] = useState("");
  const t = p.totals;
  const upload = async (file) => {
    if (!file) return;
    const f = new FormData(); f.append("partner_id", p.id); f.append("file", file);
    await run(() => partnerApi("admin/agreement", f), "Agreement upload ho gaya.");
  };
  const view = async () => {
    const w = window.open("", "_blank");
    const r = await partnerApi("admin/agreement-view", { partner_id: p.id });
    if (r.error) { w?.close(); onMsg(r.error); } else if (w) w.location.href = r.url;
  };
  return (
    <div style={{ ...card, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div><b style={{ fontSize: 15 }}>{p.name}</b>{!p.active && <span style={{ color: "var(--ne-danger)", fontSize: 12 }}> · Band</span>}<div style={muted}>{p.email}{p.phone ? ` · ${p.phone}` : ""} · {p.rates.y1}% / {p.rates.y2}%</div></div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
          <span>Stores <b>{t.clients}</b> ({t.paying} paying)</span><span>Revenue <b>{rs(t.revenue)}</b></span><span>Bana <b>{rs(t.earned)}</b></span><span>Diya <b>{rs(t.paid)}</b></span><span>Baqi <b style={{ color: t.balance > 0 ? "var(--ne-warning)" : "var(--ne-text)" }}>{rs(t.balance)}</b></span>
          <button style={btn(false)} onClick={() => setOpen(!open)}>{open ? "Band karein" : "Tafseel"}</button>
        </div>
      </div>
      {open && (
        <>
          <div style={{ overflowX: "auto" }}>
            {p.clients.length === 0 ? <p style={muted}>Abhi koi store nahi.</p> : (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{["Store", "Code", "Signup", "Subscription shuru", "Plan", "Payments", "Partner ka hissa"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{p.clients.map((c) => <tr key={c.store_id}><td style={{ ...td, fontWeight: 600 }}>{c.store_name}</td><td style={td}>{c.code}</td><td style={td}>{dayText(c.signed_up)}</td><td style={td}>{c.onboarded ? dayText(c.onboarded) : c.status === "trial" ? "Trial" : "-"}</td><td style={td}>{c.plan || "-"}</td><td style={td}>{rs(c.revenue)}</td><td style={{ ...td, fontWeight: 700 }}>{rs(c.earned)}</td></tr>)}</tbody>
              </table>
            )}
          </div>

          <div className="pa-two">
            <div style={{ display: "grid", gap: 8 }}>
              <b style={{ fontSize: 13 }}>Payment di (partner ko)</b>
              <div className="pa-g">
                <Field label="Raqam (Rs)"><input style={input} type="number" min={1} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                <Field label="Tareekh"><input style={input} type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></Field>
                <Field label="Reference / Transaction ID"><input style={input} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
                <Field label="Note"><input style={input} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
              </div>
              <div><button style={btn(true)} disabled={busy || !pay.amount} onClick={() => run(() => partnerApi("admin/payout", { partner_id: p.id, ...pay }), "Payment darj ho gayi.").then((ok) => ok && setPay({ ...pay, amount: "", reference: "", note: "" }))}>Darj karein</button></div>
              {p.payouts.map((x) => (
                <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, borderTop: "1px solid var(--ne-border)", paddingTop: 6 }}>
                  <span>{dayText(x.paid_on)} · <b>{rs(x.amount)}</b>{x.reference ? ` · ${x.reference}` : ""}</span>
                  <button style={btn(false, true)} disabled={busy} onClick={() => window.confirm(`${rs(x.amount)} wali entry hata dein?`) && run(() => partnerApi("admin/payout-delete", { partner_id: p.id, payout_id: x.id }), "Entry hat gayi.")}>Hatayein</button>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <b style={{ fontSize: 13 }}>Partner ka code banayein</b>
              <div className="pa-g">
                <Field label="Code"><input style={input} value={code.code} maxLength={30} onChange={(e) => setCode({ ...code, code: e.target.value.toUpperCase() })} placeholder="HASSAN" /></Field>
                <Field label="Qism"><select style={input} value={code.kind} onChange={(e) => setCode({ ...code, kind: e.target.value })}><option value="trial">Free trial</option><option value="percent">Discount %</option></select></Field>
                {code.kind === "trial"
                  ? <Field label="Din"><input style={input} type="number" min={1} max={90} value={code.trial_days} onChange={(e) => setCode({ ...code, trial_days: e.target.value })} /></Field>
                  : <Field label="Percent"><input style={input} type="number" min={1} max={90} value={code.percent} onChange={(e) => setCode({ ...code, percent: e.target.value })} /></Field>}
                <Field label="Plan"><select style={input} value={code.plan_id} onChange={(e) => setCode({ ...code, plan_id: e.target.value })}><option value="">Sab plans</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              </div>
              <div><button style={btn(true)} disabled={busy || !code.code} onClick={() => run(() => billingApi("admin/promo-save", { ...code, partner_id: p.id, note: `Partner: ${p.name}` }), `Code ${code.code} ban gaya.`).then((ok) => ok && setCode({ ...code, code: "" }))}>Code banayein</button></div>
              {p.codes.map((c) => <div key={c.id} style={{ fontSize: 12.5 }}><b>{c.code}</b> · {c.kind === "trial" ? `${c.trial_days} din trial` : `${c.percent}%`} · {c.used_count} use{!c.active && " · band"}</div>)}
            </div>
          </div>

          <div className="pa-two">
            <div style={{ display: "grid", gap: 8 }}>
              <b style={{ fontSize: 13 }}>Partner ki tafseel</b>
              <div className="pa-g">
                <Field label="Naam"><input style={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
                <Field label="Phone"><input style={input} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
                <Field label="Pehle 12 mahine % (khali = program wala)"><input style={input} type="number" min={0} max={100} value={edit.y1_pct} onChange={(e) => setEdit({ ...edit, y1_pct: e.target.value })} /></Field>
                <Field label="Agle 12 mahine % (khali = program wala)"><input style={input} type="number" min={0} max={100} value={edit.y2_pct} onChange={(e) => setEdit({ ...edit, y2_pct: e.target.value })} /></Field>
              </div>
              <Field label="Note"><input style={input} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
              <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active (band karne se partner login to karega magar kuch nahi dekh sakega)</label>
              <div><button style={btn(true)} disabled={busy} onClick={() => run(() => partnerApi("admin/update", { partner_id: p.id, ...edit }), "Save ho gaya.")}>Save</button></div>
            </div>
            <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
              <b style={{ fontSize: 13 }}>Agreement aur password</b>
              <Field label="Partner agreement PDF (partner portal par dikhega)"><input style={input} type="file" accept="application/pdf" onChange={(e) => upload(e.target.files?.[0])} /></Field>
              {p.agreement_path && <div><button style={btn(false)} onClick={view}><Icon name="eye" size={13} /> Agreement dekhein</button></div>}
              <Field label="Naya password (kam az kam 8 harf)"><input style={input} type="text" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
              <div><button style={btn(false)} disabled={busy || pass.length < 8} onClick={() => run(() => partnerApi("admin/password", { partner_id: p.id, password: pass }), "Password badal gaya.").then((ok) => ok && setPass(""))}>Password badlein</button></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PartnersAdmin({ onExit }) {
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(NEW);

  const load = useCallback(async () => {
    const [d, b] = await Promise.all([partnerApi("admin/overview"), billingApi("guest/info")]);
    if (d.error) { setMsg(d.error); return; }
    setData(d); setS(d.settings); setPlans(b.plans || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  /** runs a call, shows its answer, reloads; true when it worked */
  const run = async (call, okText) => {
    setBusy(true); setMsg("");
    const d = await call();
    setBusy(false);
    setMsg(d.error || okText);
    if (!d.error) load();
    return !d.error;
  };

  return (
    <div className="ne-app-shell ne-master" style={{ height: "100%", overflow: "auto" }}>
      <style>{".pa-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.pa-g{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:820px){.pa-two,.pa-g{grid-template-columns:1fr}}"}</style>
      <div style={{ padding: "20px 20px 50px", maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Partners</h1><p style={{ ...muted, margin: "4px 0 0" }}>Partner accounts (partners.eneezam.com), revenue share aur payouts.</p></div>
          <button style={btn(false)} onClick={onExit}>Master Dashboard</button>
        </div>
        {msg && <div role="status" style={{ ...card, padding: 10, fontSize: 13 }}>{msg} {!data && <button type="button" style={btn(false)} onClick={() => { setMsg(""); load(); }}>Dobara koshish karein</button>}</div>}
        {!data && !msg && <div style={card}>Load ho raha hai...</div>}

        {data && s && (
          <div style={{ ...card, display: "grid", gap: 10 }}>
            <b>Program ki settings</b>
            <div className="pa-g">
              <Field label="Pehle 12 mahine partner ka hissa (%)"><input style={input} type="number" min={0} max={100} value={s.partner_y1_pct} onChange={(e) => setS({ ...s, partner_y1_pct: e.target.value })} /></Field>
              <Field label="Agle 12 mahine partner ka hissa (%)"><input style={input} type="number" min={0} max={100} value={s.partner_y2_pct} onChange={(e) => setS({ ...s, partner_y2_pct: e.target.value })} /></Field>
              <Field label="Partner apne code par zyada se zyada trial (din)"><input style={input} type="number" min={0} max={90} value={s.partner_max_trial_days} onChange={(e) => setS({ ...s, partner_max_trial_days: e.target.value })} /></Field>
              <Field label="Partner apne code par zyada se zyada discount (%)"><input style={input} type="number" min={0} max={90} value={s.partner_max_percent} onChange={(e) => setS({ ...s, partner_max_percent: e.target.value })} /></Field>
            </div>
            <p style={{ ...muted, margin: 0 }}>Hissa har store ki pehli asli payment se ginta hai (free trial nahi), sirf mili hui subscription payments par. 24 mahine baad us store ka hissa khatam.</p>
            <div><button style={btn(true)} disabled={busy} onClick={() => run(() => partnerApi("admin/settings", s), "Settings save ho gayin.")}>Save</button></div>
          </div>
        )}

        {data && (
          <form style={{ ...card, display: "grid", gap: 10 }} onSubmit={(e) => { e.preventDefault(); run(() => partnerApi("admin/create", form), `Partner ban gaya. Woh partners.eneezam.com par ${form.email} aur yeh password se login karega.`).then((ok) => ok && setForm(NEW)); }}>
            <b>Naya partner</b>
            <div className="pa-g">
              <Field label="Naam"><input style={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Email (login)"><input style={input} required type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Password (kam az kam 8 harf)"><input style={input} required minLength={8} type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
              <Field label="Phone (optional)"><input style={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <div><button type="submit" style={btn(true)} disabled={busy}>Partner banayein</button></div>
          </form>
        )}

        {data && data.partners.length === 0 && <div style={card}><p style={{ ...muted, margin: 0 }}>Abhi koi partner nahi.</p></div>}
        {data && data.partners.map((p) => <PartnerCard key={p.id} p={p} plans={plans} busy={busy} run={run} onMsg={setMsg} />)}
      </div>
    </div>
  );
}
