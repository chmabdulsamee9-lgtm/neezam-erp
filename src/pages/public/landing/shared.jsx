// Shared building blocks for the 5 landing designs. Everything is styled through --lp-* CSS
// variables that each design sets on its root, so one component looks native in every design.
// No animation library: IntersectionObserver + CSS transitions, rAF-throttled pointer/scroll vars.
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Monogram, Wordmark } from "../../../components/Logo";
import Icon from "../../../components/Icon";
import { useLanguage } from "../../../i18n";
import { isDevEnv } from "../../../App";
import { CONTENT, PLANS, COMPARE } from "./content";
import { PAGES, PAGE_ORDER, PAGE_ICONS, PAGE_PATH } from "./pages";
import Neezi from "./Neezi";
import "./landing.css";

export function useLP() {
  const [lang, setLang] = useLanguage();
  const c = CONTENT[lang === "en" ? "en" : "ur"];
  return { lang, setLang, c };
}

export const goSignup = () => { window.location.href = isDevEnv() ? "/signup" : "https://portal.eneezam.com/signup"; };
export const goLogin = () => { window.location.href = isDevEnv() ? "/login" : "https://portal.eneezam.com/login"; };

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

// [data-rv] elements inside root get class "in" once they scroll into view (one-shot).
export function useReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll("[data-rv]:not(.in)");
    if (!("IntersectionObserver" in window) || reduceMotion()) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useInView(ref, threshold = 0.2) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setV(true); return; }
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return v;
}

// Writes --mx/--my (0..1) and --px/--py (pixels) on el while the pointer moves over target.
export function usePointerVars(ref, target = "self") {
  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer()) return;
    const src = target === "window" ? window : el;
    let raf = 0, x = 0, y = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--px", `${x - r.left}px`);
      el.style.setProperty("--py", `${y - r.top}px`);
      el.style.setProperty("--mx", ((x - r.left) / r.width).toFixed(3));
      el.style.setProperty("--my", ((y - r.top) / r.height).toFixed(3));
    };
    const onMove = (e) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(apply); };
    src.addEventListener("pointermove", onMove, { passive: true });
    return () => { src.removeEventListener("pointermove", onMove); if (raf) cancelAnimationFrame(raf); };
  }, [ref, target]);
}

// Progress (0..1) of a tall section scrolling past: written to --p on the section; onChange optional.
export function useScrollProgress(sectionRef, scrollerRef, onChange) {
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; });
  useEffect(() => {
    const el = sectionRef.current, sc = scrollerRef.current;
    if (!el || !sc) return;
    let raf = 0;
    const calc = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = r.height - vh;
      // tall (pinned) sections: 0..1 while pinned; short sections: 0..1 across their pass through the viewport
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      el.style.setProperty("--p", p.toFixed(4));
      cb.current?.(p);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    sc.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    calc();
    return () => { sc.removeEventListener("scroll", on); window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, [sectionRef, scrollerRef]);
}

export function CountUp({ to, dur = 1400, prefix = "", suffix = "" }) {
  const ref = useRef(null);
  const seen = useInView(ref, 0.4);
  const [n, setN] = useState(0);
  const num = Number(String(to).replace(/[^\d.]/g, ""));
  useEffect(() => {
    if (!seen || !Number.isFinite(num)) return;
    let raf, t0;
    if (reduceMotion()) { raf = requestAnimationFrame(() => setN(num)); return () => cancelAnimationFrame(raf); }
    const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / dur); setN(Math.round(num * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, num, dur]);
  if (!Number.isFinite(num)) return <span ref={ref}>{to}</span>;
  return <span ref={ref}>{prefix}{n.toLocaleString("en-PK")}{suffix}</span>;
}

// Text that scrambles into place when it comes into view (and on hover).
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&";
export function Scramble({ text, className }) {
  const ref = useRef(null);
  const [out, setOut] = useState(text);
  const run = useCallback(() => {
    if (reduceMotion()) return;
    let f = 0; const total = 18;
    const id = setInterval(() => {
      f++;
      setOut(text.split("").map((ch, i) => (ch === " " || i < (f / total) * text.length ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join(""));
      if (f >= total) { clearInterval(id); setOut(text); }
    }, 38);
  }, [text]);
  const seen = useInView(ref, 0.6);
  useEffect(() => { if (seen) run(); }, [seen, run]);
  return <span ref={ref} className={className} onMouseEnter={run}>{out}</span>;
}

// Magnetic hover: the element leans towards the pointer.
export function useMagnet(ref, strength = 0.3) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer() || reduceMotion()) return;
    const move = (e) => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`; };
    const leave = () => { el.style.transform = ""; };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, [ref, strength]);
}

export function Magnet({ as: Tag = "button", strength, className, children, ...rest }) {
  const ref = useRef(null);
  useMagnet(ref, strength);
  return <Tag ref={ref} className={`lp-magnet ${className || ""}`} {...rest}>{children}</Tag>;
}

// ---------- live dashboard mock (pure CSS + a ticking feed while visible) ----------
const CITIES = ["Karachi", "Lahore", "Islamabad", "Multan", "Faisalabad", "Peshawar", "Sialkot", "Hyderabad", "Quetta", "Gujranwala"];
const STAGES = ["wa", "nex", "done"];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const mkOrder = (id) => ({ id, city: CITIES[rnd(0, CITIES.length - 1)], amt: rnd(18, 69) * 100 - 1, stage: 0 });

export function DashMock({ c, className = "", tilt = false, still = false }) {
  const ref = useRef(null);
  const visible = useInView(ref, 0.15);
  const [s, setS] = useState(() => ({ orders: 128, confirmed: 104, booked: 97, profit: 84250, roas: 3.4, next: 3176, feed: [mkOrder(3175), mkOrder(3174), mkOrder(3173), mkOrder(3172)].map((o, i) => ({ ...o, stage: Math.min(2, i) })) }));
  useEffect(() => {
    if (!visible || still || reduceMotion()) return;
    const id = setInterval(() => {
      setS((p) => {
        const feed = [mkOrder(p.next), ...p.feed.slice(0, 3).map((o) => ({ ...o, stage: Math.min(2, o.stage + 1) }))];
        return { ...p, next: p.next + 1, orders: p.orders + 1, confirmed: p.confirmed + (Math.random() > 0.2 ? 1 : 0), booked: p.booked + (Math.random() > 0.3 ? 1 : 0), profit: p.profit + rnd(4, 11) * 100, roas: Math.round((3 + Math.random() * 0.9) * 10) / 10, feed };
      });
    }, 2200);
    return () => clearInterval(id);
  }, [visible, still]);
  const bars = [38, 52, 44, 61, 57, 70, 64, 78, 72, 86, 80, 94];
  const chip = { wa: "WhatsApp ✓", nex: "Nex booked", done: "Delivered" };
  return (
    <div ref={ref} className={`lp-dm ${tilt ? "lp-dm-tilt" : ""} ${visible || still ? "on" : ""} ${className}`} aria-hidden="true">
      <div className="lp-dm-top">
        <span className="lp-dm-dots"><i /><i /><i /></span>
        <span className="lp-dm-title"><Monogram size={14} /> eNeezam · {c.dash.title}</span>
        <span className="lp-dm-live"><b />{c.dash.live}</span>
      </div>
      <div className="lp-dm-body">
        <div className="lp-dm-side">{["package", "truck", "comment", "megaphone", "chart", "zap"].map((n, i) => <span key={n} className={i === 0 ? "act" : ""}><Icon name={n} size={12} /></span>)}</div>
        <div className="lp-dm-main">
          <div className="lp-dm-kpis">
            <div><span>{c.dash.orders}</span><strong>{s.orders}</strong></div>
            <div><span>{c.dash.confirmed}</span><strong>{s.confirmed}</strong></div>
            <div><span>{c.dash.booked}</span><strong>{s.booked}</strong></div>
            <div className="hi"><span>{c.dash.profit}</span><strong>Rs {s.profit.toLocaleString("en-PK")}</strong></div>
          </div>
          <div className="lp-dm-grid">
            <div className="lp-dm-chart">
              <div className="lp-dm-ch-h"><span>{c.dash.roas}</span><b>{s.roas.toFixed(1)}x</b></div>
              <div className="lp-dm-bars">{bars.map((h, i) => <i key={i} style={{ "--h": `${h}%`, "--i": i }} />)}</div>
            </div>
            <div className="lp-dm-feed">
              {s.feed.map((o) => (
                <div key={o.id} className="lp-dm-row">
                  <span className="id">#T{o.id}</span>
                  <span className="city">{o.city}</span>
                  <span className="amt">Rs {o.amt.toLocaleString("en-PK")}</span>
                  <span className={`chip ${STAGES[o.stage]}`}>{chip[STAGES[o.stage]]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- nav / footer ----------
export function LPNav({ c, lang, setLang, className = "", logoDark = false, onPricing }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [ddOpen, setDdOpen] = useState(false);
  const PL = PAGES[lang === "en" ? "en" : "ur"];
  const toSection = (id) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    else navigate(`/#${id}`);
  };
  const go = (p) => { setOpen(false); setDdOpen(false); if (p === "/pricing" && onPricing) onPricing(); else navigate(p); };
  return (
    <header className={`lp-nav ${open ? "open" : ""} ${className}`}>
      <div className="lp-nav-in">
        <button className="lp-nav-logo" onClick={() => go("/")} aria-label="eNeezam">
          <Monogram size={26} /><Wordmark size={17} dark={logoDark} />
        </button>
        <nav className="lp-nav-links">
          <div className={`lp-nav-dd ${ddOpen ? "open" : ""}`}>
            <button onClick={() => setDdOpen((o) => !o)}>{c.nav.product} <Icon name="chevronDown" size={11} /></button>
            <div className="lp-nav-menu"><div className="lp-nav-menu-in">
              {PAGE_ORDER.map((s) => <button key={s} onClick={() => go(PAGE_PATH[s])}><span><Icon name={PAGE_ICONS[s]} size={13} /></span>{PL[s].nav}</button>)}
            </div></div>
          </div>
          <button onClick={() => toSection("how")}>{c.nav.how}</button>
          <button onClick={() => go("/pricing")}>{c.nav.pricing}</button>
          <button onClick={() => go("/about")}>{c.footer.about}</button>
          <button onClick={() => go("/contact")}>{c.nav.contact}</button>
        </nav>
        <div className="lp-nav-act">
          <button className="lp-nav-lang" onClick={() => setLang(lang === "en" ? "ur" : "en")} title="Language">{lang === "en" ? "اردو" : "EN"}</button>
          <button className="lp-nav-login" onClick={goLogin}>{c.nav.login}</button>
          <button className="lp-btn lp-btn-sm" onClick={goSignup}>{c.nav.signup}</button>
          <button className="lp-nav-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icon name={open ? "close" : "menu"} size={18} /></button>
        </div>
      </div>
    </header>
  );
}

export function LPFooter({ c, logoDark = false }) {
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  return (
    <footer className="lp-foot">
      <div className="lp-foot-in">
        <div className="lp-foot-brand">
          <div className="lp-foot-logo"><Monogram size={24} /><Wordmark size={16} dark={logoDark} /></div>
          <p>{c.footer.blurb}</p>
          <p className="lp-foot-contact">support@eneezam.com · 03152433123</p>
        </div>
        <div><h4>{c.footer.product}</h4>
          {PAGE_ORDER.slice(0, 8).map((s) => <button key={s} onClick={() => navigate(PAGE_PATH[s])}>{PAGES[c === CONTENT.en ? "en" : "ur"][s].nav}</button>)}
          <button onClick={() => navigate("/pricing")}>{c.nav.pricing}</button>
        </div>
        <div><h4>{c.footer.company}</h4>
          <button onClick={() => navigate("/about")}>{c.footer.about}</button>
          <button onClick={() => navigate("/contact")}>{c.nav.contact}</button>
          <button onClick={() => navigate("/tracking")}>{c.nav.tracking}</button>
        </div>
        <div><h4>{c.footer.legal}</h4>
          <button onClick={() => navigate("/terms")}>{c.footer.terms}</button>
          <button onClick={() => navigate("/privacy")}>{c.footer.privacy}</button>
          <button onClick={() => navigate("/data-deletion")}>{c.footer.deletion}</button>
        </div>
      </div>
      <div className="lp-foot-bot">© {year} eNeezam. {c.footer.rights}</div>
    </footer>
  );
}

// ---------- pricing ----------
const rs = (n) => `Rs ${Number(n).toLocaleString("en-PK")}`;

export function PriceCards({ c }) {
  return (
    <div className="lp-plans">
      {PLANS.map((p, i) => (
        <div key={p.id} className={`lp-plan pid-${p.id} ${p.popular ? "pop" : ""}`} data-rv="up" style={{ "--d": `${i * 90}ms` }}>
          {p.popular && <span className="lp-plan-badge">{c.popular}</span>}
          <div className="lp-plan-name">{c.planName[p.id]}</div>
          <div className="lp-plan-tag">{c.planTag[p.id]}</div>
          <div className="lp-plan-price">{rs(p.price)}<small> {c.perMonth}</small></div>
          {p.alt && <div className="lp-plan-alt">{c.shopifyOnly}</div>}
          <div className="lp-plan-lims">
            <div><span>{c.limit.staff}</span><b>{p.limits.staff}</b></div>
            <div><span>{c.limit.ads}</span><b>{p.limits.ads}</b></div>
            <div><span>{c.limit.budget}</span><b>{rs(p.limits.budget)}</b></div>
            <div><span>{c.limit.wa}</span><b>{p.limits.wa.toLocaleString("en-PK")}</b></div>
          </div>
          <ul className="lp-plan-feat">{c.planHi[p.id].map((f) => <li key={f}><Icon name="check" size={12} />{f}</li>)}</ul>
          <button className={`lp-btn ${p.popular ? "" : "lp-btn-ghost"}`} onClick={goSignup}>{c.choose}</button>
        </div>
      ))}
    </div>
  );
}

export function PlanNotes({ c }) {
  return (
    <div className="lp-plan-notes" data-rv="up">
      <div className="lp-brandbox"><img src="/brand/nex-logo.svg" alt="" width="44" height="44" loading="lazy" /><div><b>{c.nexTitle}</b><p>{c.nexBody}</p></div></div>
      <div className="lp-brandbox"><Neezi size={46} pose="wave" look={false} /><div><b>{c.neeziTitle}</b><p>{c.neeziBody}</p></div></div>
      <p className="lp-fine">{c.budgetNote}<br />{c.waNote}</p>
    </div>
  );
}

export function CompareTable({ c }) {
  return (
    <div className="lp-cmp-wrap" data-rv="up">
      <table className="lp-cmp">
        <thead><tr><th>{c.compareTitle}</th>{PLANS.map((p) => <th key={p.id} className={p.popular ? "pop" : ""}>{c.planName[p.id]}<small>{rs(p.price)}</small></th>)}</tr></thead>
        <tbody>
          {COMPARE.map(([k, ...v]) => v.length === 0
            ? <tr key={k} className="grp"><td colSpan={4}>{c.rows[k]}</td></tr>
            : <tr key={k}><td>{c.rows[k]}</td>{v.map((x, i) => <td key={i} className={PLANS[i].popular ? "pop" : ""}>{x === true ? <span className="lp-ok"><Icon name="check" size={11} /></span> : x === false ? <span className="lp-no">—</span> : x}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Faq({ c }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="lp-faq">
      {c.faq.map((f, i) => (
        <div key={f.q} className={`lp-faq-i ${open === i ? "open" : ""}`} data-rv="up" style={{ "--d": `${i * 60}ms` }}>
          <button onClick={() => setOpen(open === i ? -1 : i)}>{f.q}<Icon name="chevronDown" size={14} /></button>
          <div className="lp-faq-a"><p>{f.a}</p></div>
        </div>
      ))}
    </div>
  );
}

// the full pricing block (cards + notes + table + faq), used on "/" and "/pricing"
export function PricingBlock({ c, withTitle = true }) {
  return (
    <>
      {withTitle && <div className="lp-sec-head" data-rv="up"><h2>{c.pricingTitle}</h2><p>{c.pricingSub}</p></div>}
      <PriceCards c={c} />
      <PlanNotes c={c} />
    </>
  );
}

// scroll to #hash once the design is on screen (nav links from /pricing land on "/#features")
export function useHashScroll() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 120);
    return () => clearTimeout(t);
  }, []);
}
