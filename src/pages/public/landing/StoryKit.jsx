// Building blocks shared by "Kahani" and its versions: Neezi network, kinetic word rows, the order
// timeline that lights up while scrolling, feature cards with mini animations, Neezi CTA, page tail.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { usePointerVars, useScrollProgress, PricingBlock, Faq, LPFooter, Magnet, goSignup, CountUp } from "./shared";
import { PAGE_PATH } from "./pages";
import Neezi from "./Neezi";
import "./d2.css";
import "./storykit.css";

// ---------- particle field (reacts to the cursor, pauses off-screen) ----------
export function Particles({ color = "124,92,250" }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    let w = 0, h = 0, raf = 0, run = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mouse = { x: -999, y: -999 };
    const N = window.innerWidth < 700 ? 36 : 70;
    const ps = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0006, vy: (Math.random() - .5) * .0006 }));
    const size = () => { const r = cv.getBoundingClientRect(); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const move = (e) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        const dx = p.x * w - mouse.x, dy = p.y * h - mouse.y, d = Math.hypot(dx, dy);
        if (d < 120 && d > 0) { p.x += (dx / d) * .002; p.y += (dy / d) * .002; }
      }
      for (let i = 0; i < N; i++) {
        const a = ps[i], ax = a.x * w, ay = a.y * h;
        for (let j = i + 1; j < N; j++) {
          const b = ps[j], d = Math.hypot(ax - b.x * w, ay - b.y * h);
          if (d < 110) { ctx.strokeStyle = `rgba(${color},${(1 - d / 110) * .32})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(b.x * w, b.y * h); ctx.stroke(); }
        }
        ctx.fillStyle = `rgba(${color},.75)`; ctx.beginPath(); ctx.arc(ax, ay, 1.6, 0, 6.3); ctx.fill();
      }
      if (run) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => { run = e.isIntersecting; cancelAnimationFrame(raf); if (run) raf = requestAnimationFrame(draw); });
    size(); io.observe(cv);
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", move, { passive: true });
    return () => { run = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", size); window.removeEventListener("pointermove", move); };
  }, [color]);
  return <canvas ref={ref} className="sk-canvas" aria-hidden="true" />;
}

// ---------- network: sources -> Neezi -> outcomes ----------
const IN = [["Shopify", 120], ["eNeezam Store", 260], ["TikTok", 400]];
const OUT = [["WhatsApp", 90, "whatsapp"], ["Nex courier", 200, "courier"], ["Meta Ads", 320, "ads"], ["Profit (PnL)", 430, "finance"]];
const pIn = (y) => `M190 ${y} C 330 ${y}, 360 260, 450 260`;
const pOut = (y) => `M550 260 C 640 260, 670 ${y}, 810 ${y}`;

export function NetworkFlow({ lang, title, sub, light = false }) {
  const navigate = useNavigate();
  return (
    <section className={`sk-net ${light ? "light" : ""}`} id="network">
      <Particles color={light ? "92,124,250" : "124,92,250"} />
      <div className="lp-wrap sk-net-head">
        <h2 data-rv="up">{title || (lang === "en" ? "Every order flows through Neezi" : "Har order Neezi se ho kar guzarta hai")}</h2>
        <p data-rv="up" style={{ "--d": "100ms" }}>{sub || (lang === "en" ? "Shopify, your store and TikTok in. WhatsApp, courier, ads and profit out. All automatic." : "Shopify, store aur TikTok se andar. WhatsApp, courier, ads aur profit bahar. Sab khud.")}</p>
      </div>
      <div className="sk-net-map" data-rv="scale">
        <svg viewBox="0 0 1000 520" role="img" aria-label="eNeezam network">
          <defs>
            <linearGradient id="skg" x1="0" x2="1"><stop offset="0" stopColor="#5C7CFA" /><stop offset="1" stopColor="#A855F7" /></linearGradient>
            <radialGradient id="skcore"><stop offset="0" stopColor="#A855F7" stopOpacity=".5" /><stop offset="1" stopColor="#A855F7" stopOpacity="0" /></radialGradient>
          </defs>
          {IN.map(([, y], i) => <path key={`i${i}`} id={`ski${i}`} d={pIn(y)} className="sk-line" />)}
          {OUT.map(([, y], i) => <path key={`o${i}`} id={`sko${i}`} d={pOut(y)} className="sk-line" />)}
          {IN.map((_, i) => [0, 1].map((k) => <circle key={`pi${i}${k}`} r="4" className="sk-pkt"><animateMotion dur="2.6s" begin={`${i * 0.7 + k * 1.3}s`} repeatCount="indefinite"><mpath href={`#ski${i}`} /></animateMotion></circle>))}
          {OUT.map((_, i) => [0, 1].map((k) => <circle key={`po${i}${k}`} r="4" className="sk-pkt out"><animateMotion dur="2.4s" begin={`${1.1 + i * 0.5 + k * 1.2}s`} repeatCount="indefinite"><mpath href={`#sko${i}`} /></animateMotion></circle>))}
          <circle cx="500" cy="262" r="150" fill="url(#skcore)" className="sk-halo" />
          <g transform="translate(430 178)"><Neezi size={140} pose="wave" /></g>
          {IN.map(([t, y]) => <g key={t} className="sk-node"><rect x="40" y={y - 22} width="150" height="44" rx="12" /><text x="115" y={y + 5}>{t}</text></g>)}
          {OUT.map(([t, y, k]) => <g key={t} className="sk-node out" onClick={() => navigate(PAGE_PATH[k])}><rect x="810" y={y - 22} width="160" height="44" rx="12" /><text x="890" y={y + 5}>{t}</text></g>)}
        </svg>
      </div>
      <div className="lp-wrap sk-net-counts">
        {[[1284, lang === "en" ? "orders flowing today (demo)" : "aaj ke orders (demo)"], [92, lang === "en" ? "% confirmed on WhatsApp" : "% WhatsApp par confirm"], [4, lang === "en" ? "steps automated per order" : "qadam har order par khud"]].map(([n, l], i) => (
          <div key={l} data-rv="up" style={{ "--d": `${i * 100}ms` }}><b><CountUp to={n} /></b><span>{l}</span></div>
        ))}
      </div>
    </section>
  );
}

// ---------- kinetic word rows (slide against each other with scroll) ----------
const WORDS = [["ORDERS", "WHATSAPP", "COURIER", "RETURNS"], ["ADS", "PROFIT", "STORE", "NEEZI"], ["SHOPIFY", "NEX", "META", "TEAM"]];
export function KineticRows({ scroller, light = false }) {
  const ref = useRef(null);
  useScrollProgress(ref, scroller);
  return (
    <section ref={ref} className={`sk-kin ${light ? "light" : ""}`} aria-hidden="true">
      {WORDS.map((r, i) => (
        <div key={i} className={`sk-kin-row r${i}`} style={{ "--dir": i % 2 ? 1 : -1 }}>
          {[...r, ...r, ...r].map((w, j) => <span key={j} className={j % 4 === 1 ? "o" : ""}>{w}<i>✦</i></span>)}
        </div>
      ))}
    </section>
  );
}

// ---------- the journey of one order: lights up step by step ----------
export function Timeline({ c, scroller, light = false }) {
  const sec = useRef(null);
  const [active, setActive] = useState(0);
  useScrollProgress(sec, scroller, (p) => {
    const a = Math.min(c.flow.length - 1, Math.floor(p * c.flow.length * 1.05));
    setActive((o) => (o === a ? o : a));
  });
  return (
    <section ref={sec} className={`sk-tl-sec ${light ? "light" : ""}`} id="how">
      <div className="sk-tl-pin">
        <div className="lp-wrap sk-tl-in">
          <div className="sk-tl-head">
            <span className="lp-eyebrow">{c.nav.how}</span>
            <h2>{c.flowTitle}</h2>
            <p>{c.flowSub}</p>
            <div className="sk-tl-neezi"><Neezi size={120} pose={active >= c.flow.length - 1 ? "cheer" : "point"} /></div>
          </div>
          <ol className="sk-tl">
            <span className="sk-tl-line"><i /></span>
            {c.flow.map((s, i) => (
              <li key={s.t} className={i <= active ? "on" : ""}>
                <span className="sk-tl-n">{i + 1}</span>
                <div><h3>{s.t}</h3><p>{s.d}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ---------- feature cards with tiny looping animations ----------
function FeatVis({ id }) {
  switch (id) {
    case "orders": return <div className="v-orders">{[0, 1, 2, 3].map((i) => <i key={i} style={{ "--i": i }} />)}</div>;
    case "nex": return <div className="v-nex"><span className="road" /><span className="truck"><Icon name="truck" size={14} /></span><span className="pin" /></div>;
    case "whatsapp": return <div className="v-wa"><span className="b1" /><span className="b2" /><span className="btns"><i>✓</i><i>✕</i><i>✎</i></span></div>;
    case "ads": return <div className="v-ads">{[40, 65, 50, 85, 70].map((h, i) => <i key={i} style={{ "--h": `${h}%`, "--i": i }} />)}<b>3.4x</b></div>;
    case "neezi": return <div className="v-neezi-svg"><Neezi size={70} pose="wave" look={false} /></div>;
    case "store": return <div className="v-store"><span className="bar" /><span className="hero" /><span className="g"><i /><i /><i /></span></div>;
    case "meta": return <div className="v-meta"><i /><i /><i /><svg viewBox="0 0 100 40"><path d="M10 30 Q50 -5 90 30" /></svg></div>;
    default: return <div className="v-money"><svg viewBox="0 0 100 40"><path d="M2 34 L22 28 L38 31 L56 18 L72 21 L98 5" /></svg></div>;
  }
}
function FeatureCard({ f, i }) {
  const ref = useRef(null);
  usePointerVars(ref);
  return (
    <div ref={ref} className={`d2-feat f-${f.id}`} data-rv="up" style={{ "--d": `${(i % 4) * 80}ms` }}>
      <div className="d2-feat-vis" aria-hidden="true"><FeatVis id={f.id} /></div>
      <div className="d2-feat-ic"><Icon name={f.icon} size={16} /></div>
      <h3>{f.t}</h3>
      <p>{f.d}</p>
    </div>
  );
}
export function FeatureGrid({ c }) {
  return (
    <section className="lp-sec" id="features">
      <div className="lp-wrap">
        <div className="lp-sec-head" data-rv="blur"><h2>{c.featuresTitle}</h2><p>{c.featuresSub}</p></div>
        <div className="d2-feats">{c.features.map((f, i) => <FeatureCard key={f.id} f={f} i={i} />)}</div>
      </div>
    </section>
  );
}

// ---------- Neezi CTA ----------
export function NeeziCTA({ c, pose = "wave" }) {
  const ref = useRef(null);
  usePointerVars(ref);
  return (
    <section ref={ref} className="d2-cta">
      <div className="d2-cta-glow" />
      <div className="lp-wrap d2-cta-in">
        <div className="d2-neezi-svg" data-rv="scale"><Neezi size={170} pose={pose} /></div>
        <h2 data-rv="blur">{c.ctaTitle}</h2>
        <p data-rv="up" style={{ "--d": "120ms" }}>{c.ctaSub}</p>
        <div data-rv="up" style={{ "--d": "220ms" }}>
          <Magnet className="lp-btn d2-cta-btn" strength={0.4} onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={15} /></Magnet>
        </div>
      </div>
    </section>
  );
}

// pricing + faq + Neezi CTA + footer
export function StoryTail({ c, logoDark = true }) {
  return (
    <>
      <section className="lp-sec d2-pricing" id="pricing"><div className="lp-wrap"><PricingBlock c={c} /></div></section>
      <section className="lp-sec d2-faq"><div className="lp-wrap"><div className="lp-sec-head" data-rv="up"><h2>{c.faqTitle}</h2></div><Faq c={c} /></div></section>
      <NeeziCTA c={c} />
      <LPFooter c={c} logoDark={logoDark} />
    </>
  );
}

export const MARQUEE = ["Shopify", "Meta Ads", "Conversions API", "WhatsApp Cloud API", "Dex courier", "Nex", "Neezi AI", "Product catalogue", "PnL", "Supplier ledger"];
export function Marquee() {
  return (
    <div className="d2-marquee" aria-hidden="true">
      <div>{[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>{m}<i>✦</i></span>)}</div>
    </div>
  );
}
