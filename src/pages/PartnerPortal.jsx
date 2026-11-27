// partners.eneezam.com: a partner signs in with the email and password eNeezam gave it and sees its codes, the stores that
// used them, when each started paying, the revenue share earned and what eNeezam has paid. Data: worker partners.js.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { Monogram, Wordmark } from "../components/Logo";
import { partnerApi } from "../lib/partnerApi";
import { rs, dayText } from "../lib/billingApi";

const card = { background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 16, padding: 18 };
const input = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 14, boxSizing: "border-box" };
const btn = (primary) => ({ padding: "10px 16px", borderRadius: 10, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" });
const muted = { color: "var(--ne-muted)", fontSize: 13, lineHeight: 1.6, margin: 0 };
const th = { textAlign: "left", fontSize: 12, color: "var(--ne-muted)", fontWeight: 600, padding: "8px 10px", borderBottom: "1px solid var(--ne-border)", whiteSpace: "nowrap" };
const td = { fontSize: 13, padding: "9px 10px", borderBottom: "1px solid var(--ne-border)", whiteSpace: "nowrap" };

function Shell({ children, onSignOut }) {
  return (
    <div className="ne-app-shell ne-master" style={{ height: "100dvh", overflow: "auto" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Monogram size={26} /><Wordmark size={19} /><span style={{ fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>Partners</span></div>
          {onSignOut && <button style={btn(false)} onClick={onSignOut}><Icon name="logout" size={13} /> Logout</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (err) setError("Email ya password galat hai");
  };
  return (
    <Shell>
      <form onSubmit={submit} style={{ ...card, maxWidth: 400, width: "100%", margin: "40px auto 0", display: "grid", gap: 12, boxSizing: "border-box" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Partner login</h1>
        <p style={muted}>eNeezam ki taraf se mila email aur password likhein.</p>
        <label style={{ fontSize: 13 }}>Email<input style={{ ...input, marginTop: 4 }} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label style={{ fontSize: 13 }}>Password<input style={{ ...input, marginTop: 4 }} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div role="alert" style={{ color: "var(--ne-danger)", fontSize: 13 }}>{error}</div>}
        <button type="submit" style={btn(true)} disabled={busy}>{busy ? "..." : "Login"}</button>
      </form>
    </Shell>
  );
}

const Stat = ({ label, value, sub }) => (
  <div style={{ ...card, padding: 14 }}>
    <div style={{ fontSize: 12, color: "var(--ne-muted)" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, color: "var(--ne-muted)", marginTop: 2 }}>{sub}</div>}
  </div>
);

function Dashboard({ onSignOut }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState({ code: "", kind: "trial", trial_days: 14, percent: 10, max_uses: "" });

  const load = useCallback(async () => {
    const r = await partnerApi("me");
    if (r.error) { setError(r.error); return; }
    setError(""); setD(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveCode = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    const r = await partnerApi("code-save", code);
    setBusy(false);
    if (r.error) { setMsg(r.error); return; }
    setMsg(`Code ${code.code} ban gaya.`); setCode({ ...code, code: "" }); load();
  };
  const toggle = async (c) => { setBusy(true); await partnerApi("code-toggle", { id: c.id, active: !c.active }); setBusy(false); load(); };
  const agreement = async () => {
    const w = window.open("", "_blank");
    const r = await partnerApi("agreement");
    if (r.error) { w?.close(); setMsg(r.error); } else if (w) w.location.href = r.url;
  };

  if (error) return <Shell onSignOut={onSignOut}><div role="alert" style={{ ...card, color: "var(--ne-danger)" }}>{error} <button style={btn(false)} onClick={load}>Dobara koshish karein</button></div></Shell>;
  if (!d) return <Shell onSignOut={onSignOut}><div style={card}><p style={muted}>Load ho raha hai...</p></div></Shell>;
  const t = d.totals;
  return (
    <Shell onSignOut={onSignOut}>
      <style>{".pp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.pp-g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-items:end}@media(max-width:820px){.pp-stats,.pp-g{grid-template-columns:1fr 1fr}}"}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <div><h1 style={{ margin: 0, fontSize: 22 }}>Assalam o Alaikum, {d.partner.name}</h1><p style={muted}>Aap ka hissa: pehle 12 mahine {d.rates.y1}%, agle 12 mahine {d.rates.y2}% (har store ki pehli payment se).</p></div>
        {d.partner.has_agreement && <button style={btn(false)} onClick={agreement}><Icon name="clipboard" size={13} /> Partner agreement (PDF)</button>}
      </div>
      {msg && <div role="status" style={{ ...card, padding: 10, fontSize: 13 }}>{msg}</div>}

      <div className="pp-stats">
        <Stat label="Stores" value={t.clients} sub={`${t.paying} payment kar rahe hain`} />
        <Stat label="Un ki subscription payments" value={rs(t.revenue)} />
        <Stat label="Aap ka revenue bana" value={rs(t.earned)} />
        <Stat label="eNeezam ne pay kar diya" value={rs(t.paid)} sub={`Baqi: ${rs(t.balance)}`} />
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "14px 16px 6px" }}><b>Aap ke stores</b><p style={muted}>Sirf woh stores jinhon ne aap ka code lagaya.</p></div>
        {d.clients.length === 0 ? <p style={{ ...muted, padding: "0 16px 16px" }}>Abhi koi store nahi. Code share karein: signup ke baad plan page par "Promo / trial code" mein lagta hai.</p> : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["Store", "Code", "Signup", "Subscription shuru", "Plan", "Payments", "Aap ka hissa", "Hissa kab tak"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{d.clients.map((c) => (
              <tr key={c.store_id}>
                <td style={{ ...td, fontWeight: 600 }}>{c.store_name}</td><td style={td}>{c.code}</td><td style={td}>{dayText(c.signed_up)}</td>
                <td style={td}>{c.onboarded ? dayText(c.onboarded) : <span style={{ color: "var(--ne-muted)" }}>{c.status === "trial" ? "Trial chal raha" : "Abhi payment nahi"}</span>}</td>
                <td style={td}>{c.plan || "-"}</td><td style={td}>{rs(c.revenue)}</td><td style={{ ...td, fontWeight: 700 }}>{rs(c.earned)}</td><td style={td}>{c.share_ends ? dayText(c.share_ends) : "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div style={{ ...card, display: "grid", gap: 12 }}>
        <b>Aap ke codes</b>
        {d.codes.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13, borderBottom: "1px solid var(--ne-border)", paddingBottom: 8 }}>
            <span><b>{c.code}</b> · {c.kind === "trial" ? `${c.trial_days} din free trial` : `${c.percent}% discount`} · {c.used_count} dafa use{c.max_uses ? ` / ${c.max_uses}` : ""}</span>
            <button style={btn(false)} disabled={busy} onClick={() => toggle(c)}>{c.active ? "Active" : "Band"}</button>
          </div>
        ))}
        <form onSubmit={saveCode} className="pp-g">
          <label style={{ fontSize: 12.5 }}>Naya code<input style={{ ...input, marginTop: 4 }} required maxLength={30} value={code.code} onChange={(e) => setCode({ ...code, code: e.target.value.toUpperCase() })} placeholder="ALI14" /></label>
          <label style={{ fontSize: 12.5 }}>Qism<select style={{ ...input, marginTop: 4 }} value={code.kind} onChange={(e) => setCode({ ...code, kind: e.target.value })}><option value="trial">Free trial</option><option value="percent">Discount %</option></select></label>
          {code.kind === "trial"
            ? <label style={{ fontSize: 12.5 }}>Din (max {d.limits.trial_days})<input style={{ ...input, marginTop: 4 }} type="number" min={1} max={d.limits.trial_days} value={code.trial_days} onChange={(e) => setCode({ ...code, trial_days: e.target.value })} /></label>
            : <label style={{ fontSize: 12.5 }}>Percent (max {d.limits.percent})<input style={{ ...input, marginTop: 4 }} type="number" min={1} max={d.limits.percent} value={code.percent} onChange={(e) => setCode({ ...code, percent: e.target.value })} /></label>}
          <button type="submit" style={btn(true)} disabled={busy}>Code banayein</button>
        </form>
        <p style={muted}>Discount sirf pehli payment par lagta hai. Har store ek hi code use kar sakta hai.</p>
      </div>

      <div style={{ ...card, display: "grid", gap: 8 }}>
        <b>eNeezam ki payments aap ko</b>
        {d.payouts.length === 0 && <p style={muted}>Abhi koi payment nahi.</p>}
        {d.payouts.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13, borderBottom: "1px solid var(--ne-border)", paddingBottom: 8 }}>
            <span>{dayText(p.paid_on)}{p.reference ? ` · Ref: ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</span><b>{rs(p.amount)}</b>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export default function PartnerPortal() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Shell><div style={card}><p style={muted}>Load ho raha hai...</p></div></Shell>;
  if (!session) return <SignIn />;
  return <Dashboard key={session.user.id} onSignOut={() => supabase.auth.signOut()} />;
}
