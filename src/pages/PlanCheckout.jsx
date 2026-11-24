// Plan checkout (merchant): choose a plan, promo / trial code, pay online or by bank transfer with a screenshot.
// Shown to a new account that is not active yet, on /billing, and when a plan has ended.
import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { Monogram, Wordmark } from "../components/Logo";
import { billingApi, rs, dayText, signupChoice, clearSignupChoice } from "../lib/billingApi";

const card = { background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 16, padding: 20 };
const input = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 14, boxSizing: "border-box" };
const btn = (primary, off) => ({ padding: "11px 18px", borderRadius: 10, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 14, fontWeight: 700, cursor: off ? "default" : "pointer", opacity: off ? 0.55 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 });
const muted = { color: "var(--ne-muted)", fontSize: 13, lineHeight: 1.6, margin: 0 };
const PLAN_POINTS = {
  essential: ["Neezi AI Store Launch", "3 ads, Rs 15,000 / din", "2,000 WhatsApp messages", "1 staff"],
  grow: ["Neezi AI Design Studio", "10 ads, Rs 50,000 / din", "10,000 WhatsApp messages", "3 staff"],
  advance: ["Neezi AI Design Studio", "20 ads, Rs 1.5 lakh / din", "30,000 WhatsApp messages", "5 staff"],
};
const STATUS = { pending: "Payment ka intezar", submitted: "Check ho rahi hai", paid: "Paid", failed: "Nahi hui", rejected: "Reject", review: "Check ho rahi hai" };

export default function PlanCheckout({ storeId, locked, onExit, onSignOut, onActivated }) {
  const [state, setState] = useState(null);
  const [planId, setPlanId] = useState("");
  const [codeText, setCodeText] = useState(() => signupChoice().code);
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState(null);
  const [method, setMethod] = useState("");
  const [proof, setProof] = useState(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(() => new URLSearchParams(window.location.search).get("payment"));
  const [payNote, setPayNote] = useState("");

  const load = useCallback(async () => {
    const d = await billingApi("state", storeId ? { store_id: storeId } : {});
    if (d.error) { setError(d.error); return; }
    setError("");
    setState(d);
    setPlanId((cur) => {
      if (cur) return cur;
      const want = signupChoice().plan;
      return d.billing?.plan_id || d.plans.find((p) => p.name.toLowerCase() === want)?.id || d.plans.find((p) => p.name === "Grow")?.id || d.plans[0]?.id || "";
    });
    setMethod((cur) => cur || (d.methods.rapid ? "rapid" : d.methods.bank ? "bank" : ""));
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  const sid = state?.store?.id;
  const open = (state?.payments || []).find((p) => p.status === "submitted");

  // back from the payment page: the verified webhook decides, so keep asking for a while
  useEffect(() => {
    if (!waiting || !sid) return undefined;
    let tries = 0, timer, stop = false;
    const ask = async () => {
      const d = await billingApi("payment-status", { store_id: sid, payment_id: waiting });
      if (stop) return;
      const st = d.payment?.status;
      if (st === "paid") {
        if (d.payment.environment === "TEST") { setPayNote("Test payment kamyab. Yeh sandbox thi, is liye plan active nahi hua."); setWaiting(null); load(); return; }
        clearSignupChoice(); onActivated(); return;
      }
      if (st === "failed") { setWaiting(null); setError("Payment nahi hui. Dobara koshish karein ya bank transfer karein."); load(); return; }
      if (st === "review") { setWaiting(null); setPayNote("Payment mil gayi, hamari team isay check kar rahi hai."); load(); return; }
      if (++tries >= 40) { setWaiting(null); setPayNote("Payment ki confirmation abhi nahi aayi. Jaise hi aayegi plan khud active ho jayega aur email aayegi."); load(); return; }
      timer = setTimeout(ask, 3000);
    };
    ask();
    return () => { stop = true; clearTimeout(timer); };
  }, [waiting, sid, load, onActivated]);

  // a bank transfer being checked: look again every 20 seconds
  useEffect(() => {
    if (!open) return undefined;
    const id = open.id;
    const timer = setInterval(async () => {
      const d = await billingApi("payment-status", { store_id: sid, payment_id: id });
      if (d.payment?.status === "paid") { clearSignupChoice(); onActivated(); } else if (d.payment?.status === "rejected") load();
    }, 20000);
    return () => clearInterval(timer);
  }, [open, sid, load, onActivated]);

  const plan = state?.plans.find((p) => p.id === planId);
  const choosePlan = (id) => { setPlanId(id); setQuote(null); setCode(""); setError(""); };

  const applyCode = async () => {
    setBusy("code"); setError("");
    const c = codeText.trim().toUpperCase();
    const d = await billingApi("quote", { store_id: sid, plan_id: planId, code: c });
    setBusy("");
    if (d.error) { setQuote(null); setCode(""); setError(d.error); return; }
    setQuote(d); setCode(c);
  };
  const startTrial = async () => {
    setBusy("trial"); setError("");
    const d = await billingApi("start-trial", { store_id: sid, plan_id: planId, code });
    setBusy("");
    if (d.error) { setError(d.error); return; }
    clearSignupChoice(); onActivated();
  };
  const payOnline = async () => {
    setBusy("pay"); setError("");
    const d = await billingApi("pay-rapid", { store_id: sid, plan_id: planId, code });
    if (d.error) { setBusy(""); setError(d.error); return; }
    window.location.href = d.redirect_url;
  };
  const submitBank = async () => {
    if (!proof) { setError("Payment ka screenshot lagayein"); return; }
    if (proof.size > 5 * 1024 * 1024) { setError("File 5 MB se chhoti honi chahiye"); return; }
    setBusy("bank"); setError("");
    const f = new FormData();
    f.append("store_id", sid); f.append("plan_id", planId); f.append("code", code); f.append("reference", reference); f.append("proof", proof);
    const d = await billingApi("bank-submit", f);
    setBusy("");
    if (d.error) { setError(d.error); return; }
    setProof(null); load();
  };

  const bank = state?.methods.bank;
  const isTrial = quote?.kind === "trial";
  const amount = quote ? quote.amount : plan?.monthly_price;
  const a = state?.access;

  return (
    <div className="ne-app-shell ne-master" style={{ height: "100%", overflow: "auto" }}>
      <style>{`.pc-wrap{max-width:1040px;margin:0 auto;padding:20px 16px 60px;display:grid;gap:16px}.pc-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.pc-cols{display:grid;grid-template-columns:1.3fr 1fr;gap:16px;align-items:start}@media(max-width:820px){.pc-plans,.pc-cols{grid-template-columns:1fr}}`}</style>
      <div className="pc-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Monogram size={26} /><Wordmark size={19} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            {onExit && !locked && <button style={btn(false)} onClick={onExit}>Wapas</button>}
            <button style={btn(false)} onClick={onSignOut}><Icon name="logout" size={13} /> Logout</button>
          </div>
        </div>

        {error && <div role="alert" style={{ ...card, padding: 12, borderColor: "var(--ne-danger)", color: "var(--ne-danger)", fontSize: 13.5, display: "flex", justifyContent: "space-between", gap: 10 }}><span>{error}</span>{!state && <button style={btn(false)} onClick={load}>Dobara</button>}</div>}
        {payNote && <div style={{ ...card, padding: 12, fontSize: 13.5 }}>{payNote}</div>}
        {!state && !error && <div style={{ ...card, textAlign: "center" }}><p style={muted}>Load ho raha hai...</p></div>}

        {state && waiting && <div style={{ ...card, textAlign: "center" }}><Icon name="clock" size={30} /><h2 style={{ margin: "10px 0 6px", fontSize: 18 }}>Payment confirm ho rahi hai</h2><p style={muted}>Yeh page band na karein, aam tor par chand second lagte hain.</p></div>}

        {state && !waiting && (
          <>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{locked ? "Aapka plan khatam ho gaya" : state.billing ? "Plan aur payment" : "Apna plan chunein"}</h1>
              <p style={{ ...muted, marginTop: 4 }}>
                {state.store?.store_name}
                {state.billing && ` · ${state.billing.status === "trial" ? "Trial" : "Plan"} ${a.state === "grace" || a.state === "locked" ? "khatam hua" : "chalega"}: ${dayText(state.billing.period_end)}`}
              </p>
            </div>

            {!state.can_pay ? <div style={card}><p style={muted}>Plan sirf store owner le sakta hai. Unhein bata dein.</p></div> : open ? (
              <div style={{ ...card, textAlign: "center" }}>
                <Icon name="clock" size={30} />
                <h2 style={{ margin: "10px 0 6px", fontSize: 18 }}>Screenshot mil gaya, check ho raha hai</h2>
                <p style={muted}>{rs(open.amount)} ki bank transfer verify hote hi plan khud active ho jayega aur email aayegi. Support rozana 10 AM se 10 PM.</p>
              </div>
            ) : (
              <>
                <div className="pc-plans">
                  {state.plans.map((p) => {
                    const on = p.id === planId;
                    return (
                      <button key={p.id} onClick={() => choosePlan(p.id)} aria-pressed={on} style={{ ...card, textAlign: "left", cursor: "pointer", color: "var(--ne-text)", font: "inherit", borderColor: on ? "var(--ne-accent)" : "var(--ne-border)", boxShadow: on ? "0 0 0 2px var(--ne-accent)" : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 16 }}>{p.name}</b>{on && <Icon name="check" size={16} />}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 8px" }}>{rs(p.monthly_price)}<span style={{ fontSize: 12, fontWeight: 500, color: "var(--ne-muted)" }}> / mahina</span></div>
                        {(PLAN_POINTS[p.name.toLowerCase()] || []).map((x) => <div key={x} style={{ fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.8 }}>{x}</div>)}
                      </button>
                    );
                  })}
                </div>

                <div className="pc-cols">
                  <div style={{ ...card, display: "grid", gap: 14 }}>
                    {isTrial ? (
                      <>
                        <b style={{ fontSize: 16 }}>{quote.trial_days} din ka free trial</b>
                        <p style={muted}>Koi payment method lagane ki zaroorat nahi. Trial ke baad jari rakhna ho to payment kar dein.</p>
                        <button style={btn(true, busy)} disabled={Boolean(busy)} onClick={startTrial}>{busy === "trial" ? "Shuru ho raha hai..." : "Trial shuru karein"}</button>
                      </>
                    ) : (
                      <>
                        <b style={{ fontSize: 16 }}>Payment ka tareeqa</b>
                        {!state.methods.rapid && !bank && <p style={muted}>Payment abhi band hai. Trial code ho to lagayein, warna support@eneezam.com par likhein.</p>}
                        {state.methods.rapid && (
                          <label style={{ ...card, padding: 14, cursor: "pointer", display: "flex", gap: 10, borderColor: method === "rapid" ? "var(--ne-accent)" : "var(--ne-border)" }}>
                            <input type="radio" name="method" checked={method === "rapid"} onChange={() => setMethod("rapid")} />
                            <span><b style={{ fontSize: 14 }}>Online payment {state.methods.rapid_test && "(TEST)"}</b><span style={{ ...muted, display: "block" }}>Card, JazzCash, easypaisa, bank ya Raast. Plan foran active.</span></span>
                          </label>
                        )}
                        {bank && (
                          <label style={{ ...card, padding: 14, cursor: "pointer", display: "flex", gap: 10, borderColor: method === "bank" ? "var(--ne-accent)" : "var(--ne-border)" }}>
                            <input type="radio" name="method" checked={method === "bank"} onChange={() => setMethod("bank")} />
                            <span><b style={{ fontSize: 14 }}>Bank transfer</b><span style={{ ...muted, display: "block" }}>Transfer karke screenshot lagayein. Verify hone par plan active.</span></span>
                          </label>
                        )}
                        {method === "bank" && bank && (
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ background: "var(--ne-surface-2)", borderRadius: 12, padding: 14, display: "grid", gap: 6, fontSize: 13.5 }}>
                              {[["Bank", bank.bank], ["Account title", bank.title], ["Account number", bank.account], ["IBAN", bank.iban], ["Raqam", rs(amount)]].filter(([, v]) => v).map(([k, v]) => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                  <span style={{ color: "var(--ne-muted)" }}>{k}</span>
                                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600, wordBreak: "break-all" }}>{v}{(k === "IBAN" || k === "Account number") && <button aria-label={`${k} copy`} onClick={() => navigator.clipboard?.writeText(v)} style={{ background: "none", border: "none", color: "var(--ne-accent)", cursor: "pointer", padding: 2 }}><Icon name="copy" size={13} /></button>}</span>
                                </div>
                              ))}
                              {bank.note && <p style={muted}>{bank.note}</p>}
                            </div>
                            <label style={{ fontSize: 13 }}>Payment ka screenshot (JPG, PNG, WebP ya PDF, 5 MB tak)
                              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProof(e.target.files?.[0] || null)} style={{ ...input, marginTop: 4 }} />
                            </label>
                            <input style={input} maxLength={80} placeholder="Transaction ID (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
                          </div>
                        )}
                        {method === "rapid" && state.methods.rapid && <button style={btn(true, busy)} disabled={Boolean(busy)} onClick={payOnline}>{busy === "pay" ? "Payment page khul raha hai..." : `${rs(amount)} pay karein`}</button>}
                        {method === "bank" && bank && <button style={btn(true, busy)} disabled={Boolean(busy)} onClick={submitBank}>{busy === "bank" ? "Bhej rahe hain..." : "Screenshot bhejein"}</button>}
                      </>
                    )}
                  </div>

                  <div style={{ ...card, display: "grid", gap: 12 }}>
                    <b style={{ fontSize: 16 }}>Summary</b>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span>{plan?.name} plan, 1 mahina</span><span>{rs(plan?.monthly_price)}</span></div>
                    {quote?.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--ne-success)" }}><span>{code} ({quote.percent}%)</span><span>- {rs(quote.discount)}</span></div>}
                    {isTrial && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--ne-success)" }}><span>{code}</span><span>{quote.trial_days} din free</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, borderTop: "1px solid var(--ne-border)", paddingTop: 10 }}><span>Aaj ki payment</span><span>{isTrial ? "Rs 0" : rs(amount)}</span></div>
                    <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (codeText.trim()) applyCode(); }}>
                      <input style={input} aria-label="Promo ya trial code" placeholder="Promo / trial code" value={codeText} maxLength={30} onChange={(e) => { setCodeText(e.target.value.toUpperCase()); setQuote(null); setCode(""); }} />
                      <button type="submit" style={btn(false, !codeText.trim() || busy)} disabled={!codeText.trim() || Boolean(busy)}>{busy === "code" ? "..." : "Lagayein"}</button>
                    </form>
                    <p style={{ ...muted, fontSize: 12 }}>Payment se aap <a href="/refund-policy" target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)" }}>Refund Policy</a> aur <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)" }}>Terms</a> se mutafiq hain.</p>
                  </div>
                </div>
              </>
            )}

            {state.payments.length > 0 && (
              <div style={card}>
                <b style={{ fontSize: 15 }}>Pichli payments</b>
                {state.payments.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--ne-border)" }}>
                    <span>{dayText(p.created_at)} · {state.plans.find((x) => x.id === p.plan_id)?.name || ""} · {p.method === "bank" ? "Bank transfer" : "Online"}{p.environment === "TEST" ? " (TEST)" : ""}{p.status === "rejected" && p.note ? ` · ${p.note}` : ""}</span>
                    <span><b>{rs(p.amount)}</b> · {STATUS[p.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
