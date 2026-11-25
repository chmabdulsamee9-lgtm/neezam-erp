// Buy a plan without an account: name, email, mobile, pay. The account is made afterwards with the same email (worker billing.js, guest).
import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";
import Icon from "../../components/Icon";

const CF = "https://neezam-erp.chmabdulsamee9.workers.dev";
const rs = (n) => `Rs ${Number(n || 0).toLocaleString("en-PK")}`;
async function api(path, body = {}) {
  try {
    const res = await fetch(`${CF}/billing/guest/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json().catch(() => null)) || { error: "offline" };
  } catch { return { error: "offline" }; }
}
const T = {
  en: {
    title: "Checkout", sub: "No account or sign-up needed. Choose a plan, enter your details and pay.", month: "/ month", details: "Your details", name: "Full name", business: "Business name (optional)", email: "Email", phone: "Mobile number",
    summary: "Order summary", total: "Total", pay: "Pay", place: "Place order", method: "Payment method", online: "Card, JazzCash, easypaisa, bank account or Raast, on a secure payment page.",
    soon: "Online payment is being activated. Place your order now and we will contact you with the payment details. Nothing is charged today.",
    agree: "By ordering you agree to our", terms: "Terms", and: "and", refund: "Refund Policy", busy: "Please wait...", load: "Loading...", retry: "Try again", offline: "Connection problem. Please try again.",
    bad: { name: "Enter your full name", email: "Enter a valid email", phone: "Enter a mobile number like 03001234567", plan: "Choose a plan" },
    placed: "Order received", placedText: "We will contact you with the payment details. Order number:", paid: "Payment received", paidText: "Thank you! We have emailed you the link to set up your account. Use the same email and your plan becomes active.", setup: "Set up account",
    wait: "Confirming your payment", waitText: "This usually takes a few seconds. Keep this page open.", late: "The confirmation has not arrived yet. We will email you when it does.", failed: "The payment did not go through. You can try again.", review: "Our team is checking your payment.",
  },
  ur: {
    title: "Checkout", sub: "Account ya sign-up ki zaroorat nahi. Plan chunein, apni tafseel likhein aur payment karein.", month: "/ mahina", details: "Aap ki tafseel", name: "Poora naam", business: "Business ka naam (optional)", email: "Email", phone: "Mobile number",
    summary: "Order", total: "Total", pay: "Pay karein:", place: "Order karein", method: "Payment ka tareeqa", online: "Card, JazzCash, easypaisa, bank account ya Raast, mehfooz payment page par.",
    soon: "Online payment activate ho rahi hai. Abhi order kar dein, hum payment ki tafseel bhej denge. Aaj koi paisa nahi katega.",
    agree: "Order karne se aap hamari", terms: "Terms", and: "aur", refund: "Refund Policy", busy: "Thora intezar karein...", load: "Load ho raha hai...", retry: "Dobara koshish karein", offline: "Connection ka masla. Dobara koshish karein.",
    bad: { name: "Poora naam likhein", email: "Sahi email likhein", phone: "Mobile number aise likhein: 03001234567", plan: "Plan chunein" },
    placed: "Order mil gaya", placedText: "Hum payment ki tafseel ke liye raabta karenge. Order number:", paid: "Payment mil gayi", paidText: "Shukriya! Account banane ka link email kar diya hai. Isi email se account banayein, plan active ho jayega.", setup: "Account banayein",
    wait: "Payment confirm ho rahi hai", waitText: "Aam taur par chand second lagte hain. Yeh page khula rakhein.", late: "Confirmation abhi nahi aayi. Jaise hi aayegi hum email kar denge.", failed: "Payment nahi hui. Dobara koshish kar sakte hain.", review: "Hamari team payment check kar rahi hai.",
  },
};
const card = { background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 16, padding: 18 };
const input = { width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 16, boxSizing: "border-box", marginTop: 4 };
const muted = { color: "var(--ne-muted)", fontSize: 13, lineHeight: 1.6, margin: 0 };
const btn = { width: "100%", padding: "13px 18px", borderRadius: 10, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", boxSizing: "border-box", display: "block" };

export default function PlanBuy() {
  const [lang] = useLanguage();
  const t = T[lang === "en" ? "en" : "ur"];
  const [q] = useState(() => new URLSearchParams(window.location.search));
  const [info, setInfo] = useState(null);
  const [planId, setPlanId] = useState("");
  const [f, setF] = useState({ name: "", business: "", email: "", phone: "" });
  const [bad, setBad] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(() => (q.get("order") ? { kind: "wait" } : null));
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let off = false;
    api("info").then((d) => {
      if (off) return;
      if (!d.plans) { setError("offline"); return; }
      setError(""); setInfo(d);
      const want = (q.get("plan") || "").toLowerCase();
      setPlanId((d.plans.find((p) => p.name.toLowerCase() === want) || d.plans.find((p) => p.name === "Grow") || d.plans[0])?.id || "");
    });
    return () => { off = true; };
  }, [q, again]);

  // back from the payment page: the signed webhook decides, the address bar never does
  useEffect(() => {
    const id = q.get("order");
    if (!id) return undefined;
    let tries = 0, timer, stop = false;
    const ask = async () => {
      const d = await api("status", { order_id: id });
      if (stop) return;
      if (d.status === "paid" || d.status === "review") { setDone({ kind: d.status, plan: d.plan }); return; }
      if (d.status === "failed") { setDone(null); setError("failed"); return; }
      if (++tries >= 40) { setDone({ kind: "late" }); return; }
      timer = setTimeout(ask, 3000);
    };
    ask();
    return () => { stop = true; clearTimeout(timer); };
  }, [q]);

  const plan = info?.plans.find((p) => p.id === planId);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setBad(""); setError("");
    const d = await api("order", { ...f, plan_id: planId });
    if (d.redirect_url) { window.location.href = d.redirect_url; return; }
    setBusy(false);
    if (d.field) { setBad(d.field); return; }
    if (d.error) { setError(lang === "en" ? d.error_en || "offline" : d.error); return; }
    setDone({ kind: "placed", id: d.order_id });
  };
  const field = (k, type, auto) => (
    <label style={{ fontSize: 13 }}>{t[k]}
      <input style={{ ...input, borderColor: bad === k ? "var(--ne-danger)" : "var(--ne-border)" }} name={k} type={type} autoComplete={auto} maxLength={k === "email" ? 254 : 80} value={f[k]} aria-invalid={bad === k} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {bad === k && <span role="alert" style={{ color: "var(--ne-danger)", fontSize: 12.5 }}>{t.bad[k]}</span>}
    </label>
  );
  const msg = done && { wait: [t.wait, t.waitText], placed: [t.placed, `${t.placedText} ${(done.id || "").slice(0, 8).toUpperCase()}`], paid: [t.paid, t.paidText], review: [t.paid, t.review], late: [t.wait, t.late] }[done.kind];

  return (
    <div style={{ height: "100dvh", overflowY: "auto", boxSizing: "border-box", color: "var(--ne-text)" }}>
      <PublicHeader />
      <style>{".pb-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.pb-cols{display:grid;grid-template-columns:1.3fr 1fr;gap:16px;align-items:start}@media(max-width:760px){.pb-plans,.pb-cols{grid-template-columns:1fr}}"}</style>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "2.5rem 1rem 4rem", display: "grid", gap: 16 }}>
        <div><h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{t.title}</h1><p style={{ ...muted, marginTop: 4 }}>{t.sub}</p></div>
        {error && <div role="alert" style={{ ...card, padding: 12, borderColor: "var(--ne-danger)", color: "var(--ne-danger)", fontSize: 13.5 }}>{t[error] || error} {!info && <button type="button" onClick={() => setAgain(again + 1)}>{t.retry}</button>}</div>}
        {msg ? (
          <div style={{ ...card, textAlign: "center" }} role="status">
            <Icon name={done.kind === "wait" || done.kind === "late" ? "clock" : "check"} size={30} />
            <h2 style={{ margin: "10px 0 6px", fontSize: 19 }}>{msg[0]}</h2><p style={muted}>{msg[1]}</p>
            {done.kind === "paid" && <a style={{ ...btn, maxWidth: 260, margin: "14px auto 0" }} href={`https://portal.eneezam.com/signup?plan=${encodeURIComponent((done.plan || "").toLowerCase())}`}>{t.setup}</a>}
          </div>
        ) : !info ? (!error && <div style={{ ...card, textAlign: "center" }}><p style={muted}>{t.load}</p></div>) : (
          <form onSubmit={submit} noValidate style={{ display: "grid", gap: 16 }}>
            <div className="pb-plans" role="radiogroup" aria-label="Plan">
              {info.plans.map((p) => (
                <button type="button" role="radio" aria-checked={p.id === planId} key={p.id} onClick={() => setPlanId(p.id)} style={{ ...card, textAlign: "left", cursor: "pointer", color: "var(--ne-text)", font: "inherit", borderColor: p.id === planId ? "var(--ne-accent)" : "var(--ne-border)", boxShadow: p.id === planId ? "0 0 0 1px var(--ne-accent)" : "none" }}>
                  <b>{p.name}</b><div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{rs(p.monthly_price)} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ne-muted)" }}>{t.month}</span></div>
                </button>
              ))}
            </div>
            <div className="pb-cols">
              <div style={{ ...card, display: "grid", gap: 12 }}><b>{t.details}</b>
                {field("name", "text", "name")}{field("email", "email", "email")}{field("phone", "tel", "tel")}{field("business", "text", "organization")}
              </div>
              <div style={{ ...card, display: "grid", gap: 12 }}><b>{t.summary}</b>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>eNeezam {plan?.name}</span><span>{rs(plan?.monthly_price)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 17, borderTop: "1px solid var(--ne-border)", paddingTop: 10 }}><span>{t.total}</span><span>{rs(plan?.monthly_price)}</span></div>
                <div><b style={{ fontSize: 13.5 }}>{t.method}</b><p style={muted}>{info.online ? t.online : t.soon}</p></div>
                <button type="submit" style={btn} disabled={busy}>{busy ? t.busy : info.online ? `${t.pay} ${rs(plan?.monthly_price)}` : t.place}</button>
                <p style={{ ...muted, fontSize: 12 }}>{t.agree} <a href="/terms" style={{ color: "var(--ne-accent)" }}>{t.terms}</a> {t.and} <a href="/refund-policy" style={{ color: "var(--ne-accent)" }}>{t.refund}</a>.</p>
              </div>
            </div>
          </form>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
