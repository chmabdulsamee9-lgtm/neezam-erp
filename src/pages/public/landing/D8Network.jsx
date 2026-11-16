// Design 8 "Network": a living map of the business. Orders flow as light from Shopify / Store / TikTok into
// the eNeezam core and out to WhatsApp, Nex, Meta and profit. A particle field reacts to the cursor.
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { LPNav, Magnet, goSignup, CountUp } from "./shared";
import { AppWindow, useAutoScreen } from "./AppUI";
import { ContentShell, HomeTail, useHomeRoot } from "./ContentPage";
import { PAGES, PAGE_PATH, PAGE_ICONS, PAGE_ORDER } from "./pages";
import "./d8.css";

const IN = [["Shopify", 120], ["eNeezam Store", 260], ["TikTok", 400]];
const OUT = [["WhatsApp", 90, "whatsapp"], ["Nex courier", 200, "courier"], ["Meta Ads", 320, "ads"], ["Profit (PnL)", 430, "finance"]];
const pathIn = (y) => `M190 ${y} C 330 ${y}, 360 260, 470 260`;
const pathOut = (y) => `M530 260 C 640 260, 670 ${y}, 810 ${y}`;

function Particles() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    let w = 0, h = 0, raf = 0, run = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mouse = { x: -999, y: -999 };
    const N = window.innerWidth < 700 ? 40 : 80;
    const ps = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0006, vy: (Math.random() - .5) * .0006 }));
    const size = () => { const r = cv.getBoundingClientRect(); w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const move = (e) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        const px = p.x * w, py = p.y * h, dx = px - mouse.x, dy = py - mouse.y, d = Math.hypot(dx, dy);
        if (d < 120) { p.x += (dx / d) * .002; p.y += (dy / d) * .002; }
      }
      for (let i = 0; i < N; i++) {
        const a = ps[i], ax = a.x * w, ay = a.y * h;
        for (let j = i + 1; j < N; j++) {
          const b = ps[j], d = Math.hypot(ax - b.x * w, ay - b.y * h);
          if (d < 110) { ctx.strokeStyle = `rgba(124,92,250,${(1 - d / 110) * .35})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(b.x * w, b.y * h); ctx.stroke(); }
        }
        ctx.fillStyle = "rgba(165,180,252,.7)"; ctx.beginPath(); ctx.arc(ax, ay, 1.6, 0, 6.3); ctx.fill();
      }
      if (run) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => { run = e.isIntersecting; if (run) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } });
    size(); io.observe(cv);
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", move, { passive: true });
    return () => { run = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", size); window.removeEventListener("pointermove", move); };
  }, []);
  return <canvas ref={ref} className="d8-canvas" aria-hidden="true" />;
}

export default function D8Network({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d8" navClass="d8-nav" appTheme="dark" logoDark />;
  return <D8Home />;
}

function D8Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  const navigate = useNavigate();
  const P = PAGES[lang === "en" ? "en" : "ur"];
  const [screen, setScreen] = useAutoScreen(["orders", "whatsapp", "booked", "ads", "pnl"]);
  return (
    <div ref={root} className="lp-root d8">
      <LPNav c={c} lang={lang} setLang={setLang} className="d8-nav" logoDark />
      <section className="d8-hero">
        <Particles />
        <div className="lp-wrap d8-head">
          <span className="d8-k" data-rv="up"><i /> {lang === "en" ? "One system. Every connection." : "Ek system. Har connection."}</span>
          <h1 data-rv="blur" style={{ "--d": "80ms" }}>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h1>
          <p data-rv="up" style={{ "--d": "160ms" }}>{c.hero.sub}</p>
          <div data-rv="up" style={{ "--d": "240ms" }} className="d8-cta"><Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet></div>
        </div>
        <div className="d8-map" data-rv="scale" style={{ "--d": "200ms" }}>
          <svg viewBox="0 0 1000 520" role="img" aria-label="eNeezam connections">
            <defs>
              <linearGradient id="d8g" x1="0" x2="1"><stop offset="0" stopColor="#5C7CFA" /><stop offset="1" stopColor="#A855F7" /></linearGradient>
              <radialGradient id="d8core"><stop offset="0" stopColor="#A855F7" stopOpacity=".55" /><stop offset="1" stopColor="#A855F7" stopOpacity="0" /></radialGradient>
            </defs>
            {IN.map(([, y], i) => <path key={`i${i}`} id={`d8i${i}`} d={pathIn(y)} className="d8-line" />)}
            {OUT.map(([, y], i) => <path key={`o${i}`} id={`d8o${i}`} d={pathOut(y)} className="d8-line" />)}
            {IN.map((_, i) => [0, 1].map((k) => (
              <circle key={`pi${i}${k}`} r="4" className="d8-pkt"><animateMotion dur="2.6s" begin={`${i * 0.7 + k * 1.3}s`} repeatCount="indefinite"><mpath href={`#d8i${i}`} /></animateMotion></circle>
            )))}
            {OUT.map((_, i) => [0, 1].map((k) => (
              <circle key={`po${i}${k}`} r="4" className="d8-pkt out"><animateMotion dur="2.4s" begin={`${1.1 + i * 0.5 + k * 1.2}s`} repeatCount="indefinite"><mpath href={`#d8o${i}`} /></animateMotion></circle>
            )))}
            <circle cx="500" cy="260" r="120" fill="url(#d8core)" className="d8-halo" />
            <circle cx="500" cy="260" r="46" className="d8-core" />
            <g transform="translate(476 236) scale(1.5)"><path d="M6 24 L14 13 L20 18 L27 7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="24" r="3" fill="#fff" /><circle cx="14" cy="13" r="3" fill="#fff" /><circle cx="20" cy="18" r="3" fill="#fff" /><circle cx="27" cy="7" r="3" fill="#fff" /></g>
            {IN.map(([t, y]) => <g key={t} className="d8-node"><rect x="40" y={y - 22} width="150" height="44" rx="12" /><text x="115" y={y + 5}>{t}</text></g>)}
            {OUT.map(([t, y, k]) => <g key={t} className="d8-node out" onClick={() => navigate(PAGE_PATH[k])}><rect x="810" y={y - 22} width="160" height="44" rx="12" /><text x="890" y={y + 5}>{t}</text></g>)}
          </svg>
        </div>
        <div className="lp-wrap d8-counts">
          {[[1284, lang === "en" ? "orders flowing today (demo)" : "aaj ke orders (demo)"], [92, lang === "en" ? "% confirmed on WhatsApp" : "% WhatsApp par confirm"], [4, lang === "en" ? "steps automated per order" : "qadam har order par khud"]].map(([n, l], i) => (
            <div key={l} data-rv="up" style={{ "--d": `${i * 100}ms` }}><b><CountUp to={n} /></b><span>{l}</span></div>
          ))}
        </div>
      </section>

      <section className="lp-sec" id="how">
        <div className="lp-wrap d8-demo">
          <div className="lp-sec-head" data-rv="up"><h2>{lang === "en" ? "Inside the core" : "Core ke andar"}</h2><p>{lang === "en" ? "The real eNeezam app. Click the sidebar." : "Asal eNeezam app. Sidebar par click karein."}</p></div>
          <div data-rv="scale"><AppWindow screen={screen} onNav={setScreen} theme="dark" /></div>
        </div>
      </section>

      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{c.featuresTitle}</h2></div>
          <div className="d8-list">
            {PAGE_ORDER.map((k, i) => (
              <button key={k} className="d8-li" data-rv="up" style={{ "--d": `${(i % 3) * 70}ms` }} onClick={() => navigate(PAGE_PATH[k])}>
                <span className="d8-li-ic"><Icon name={PAGE_ICONS[k]} size={16} /></span>
                <div><b>{P[k].nav}</b><p>{P[k].sub}</p></div>
                <Icon name="arrowRight" size={14} />
              </button>
            ))}
          </div>
        </div>
      </section>
      <HomeTail c={c} logoDark />
    </div>
  );
}
