// Design 2 "Kahani": a scroll story. SOCHO -> the scattered business -> split screen -> the visitor
// clicks "Neezam karo" and the pieces snap into one live eNeezam dashboard. Custom cursor, spotlight,
// magnetic buttons, tilt, a pinned horizontal "journey of an order". Scroll-linked motion is driven by
// one CSS variable (--p) per section, so React does not re-render while scrolling.
import { useEffect, useRef, useState } from "react";
import Icon from "../../../components/Icon";
import {
  useLP, useReveal, usePointerVars, useScrollProgress, useHashScroll, finePointer,
  DashMock, LPNav, LPFooter, PricingBlock, CompareTable, Faq, CountUp, Scramble, Magnet, goSignup,
} from "./shared";
import { AppWindow } from "./AppUI";
import { ContentShell } from "./ContentPage";
import "./d2.css";

const PIECES = [
  { x: 14, y: 24, r: -8, z: 1.2, icon: "clipboard", k: 0 },
  { x: 84, y: 20, r: 7, z: 0.8, icon: "truck", k: 1 },
  { x: 10, y: 70, r: 6, z: 1, icon: "comment", k: 2 },
  { x: 88, y: 66, r: -6, z: 1.3, icon: "megaphone", k: 3 },
  { x: 30, y: 86, r: -4, z: 0.7, icon: "calculator", k: 4 },
  { x: 70, y: 88, r: 5, z: 0.9, icon: "undo", k: 5 },
  { x: 28, y: 12, r: 4, z: 0.6, icon: "shop", k: 6 },
  { x: 68, y: 9, r: -5, z: 1.1, icon: "cash", k: 7 },
];

const MARQUEE = ["Shopify", "Meta Ads", "Conversions API", "WhatsApp Cloud API", "Dex courier", "Nex", "Neezi AI", "Product catalogue", "PnL", "Supplier ledger"];

function Cursor({ c }) {
  const dot = useRef(null), ring = useRef(null);
  const [label, setLabel] = useState("");
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (!finePointer()) return;
    document.documentElement.classList.add("d2-nocursor");
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf;
    const move = (e) => {
      x = e.clientX; y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate(${x}px, ${y}px)`;
      const t = e.target.closest?.("[data-cursor], button, a");
      const l = t?.getAttribute?.("data-cursor");
      setLabel(l ? (c.cursor[l] || l) : "");
      setBig(!!t);
    };
    const loop = () => { rx += (x - rx) * 0.16; ry += (y - ry) * 0.16; if (ring.current) ring.current.style.transform = `translate(${rx}px, ${ry}px)`; raf = requestAnimationFrame(loop); };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); document.documentElement.classList.remove("d2-nocursor"); };
  }, [c]);
  if (typeof window !== "undefined" && !finePointer()) return null;
  return (
    <>
      <div ref={ring} className={`d2-ring ${big ? "big" : ""} ${label ? "lbl" : ""}`}><span>{label}</span></div>
      <div ref={dot} className="d2-dot" />
    </>
  );
}

function Story({ c, scroller }) {
  const sec = useRef(null), stage = useRef(null);
  const [phase, setPhase] = useState(0); // 0 imagine, 1 chaos, 2 split, 3 can break
  const [done, setDone] = useState(false);
  usePointerVars(stage, "window");
  useScrollProgress(sec, scroller, (p) => {
    const ph = p < 0.22 ? 0 : p < 0.5 ? 1 : p < 0.7 ? 2 : 3;
    setPhase((o) => (o === ph ? o : ph));
    if (p > 0.985) setDone(true);
  });
  const neezam = () => {
    setDone(true);
    // carry the visitor to the end of the story so the dashboard is centred
    const el = sec.current;
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: "smooth" });
  };
  return (
    <section ref={sec} className={`d2-story ph${phase} ${done ? "done" : ""}`} id="top">
      <div ref={stage} className="d2-stage">
        <div className="d2-spot" />
        <div className="d2-imagine">
          <div className="d2-echo e1" aria-hidden="true">{c.story.imagine}</div>
          <div className="d2-echo e2" aria-hidden="true">{c.story.imagine}</div>
          <h1 className="d2-big"><Scramble text={c.story.imagine} /></h1>
          <p className="d2-imagine-sub">{c.story.imagineSub}</p>
        </div>

        <div className="d2-pieces" aria-hidden="true">
          {PIECES.map((p, i) => (
            <div key={i} className="d2-piece" style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--r": `${p.r}deg`, "--z": p.z, "--k": p.k }}>
              <Icon name={p.icon} size={15} /><span>{c.story.chaos[i]}</span>
            </div>
          ))}
        </div>

        <div className="d2-lines">
          <div className="d2-lines-k">{c.story.chaosTitle}</div>
          {c.story.chaosLines.map((l, i) => <p key={l} style={{ "--i": i }}>{l}</p>)}
        </div>

        <div className="d2-navy">
          <div className="d2-navy-in">
            <div className="d2-navy-k">{c.story.chaosTitle}</div>
            <div className="d2-navy-t">{c.story.barrier}</div>
          </div>
        </div>

        <button className="d2-break" onClick={neezam} data-cursor="Neezam!" tabIndex={phase >= 3 && !done ? 0 : -1}>
          <i className="wedge" aria-hidden="true" />
          <span className="s">{c.story.clickTo}</span>
          <span className="b">{c.story.break}</span>
        </button>

        <div className="d2-after">
          <div className="d2-after-head">
            <span className="lp-eyebrow">{c.hero.eyebrow}</span>
            <h2>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h2>
            <p>{c.story.after}</p>
            <div className="d2-after-cta">
              <Magnet className="lp-btn" onClick={goSignup} data-cursor="start">{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
            </div>
          </div>
          <div className="d2-after-dash"><AppWindow screen="home" theme="dark" compact /></div>
        </div>

        <div className="d2-scrollhint"><span>{c.story.scroll}</span><i /></div>
      </div>
    </section>
  );
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

// tiny looping illustrations, pure CSS, play on hover (and when the card is in view on touch screens)
function FeatVis({ id }) {
  switch (id) {
    case "orders": return <div className="v-orders">{[0, 1, 2, 3].map((i) => <i key={i} style={{ "--i": i }} />)}</div>;
    case "nex": return <div className="v-nex"><span className="road" /><span className="truck"><Icon name="truck" size={14} /></span><span className="pin" /></div>;
    case "whatsapp": return <div className="v-wa"><span className="b1" /><span className="b2" /><span className="btns"><i>✓</i><i>✕</i><i>✎</i></span></div>;
    case "ads": return <div className="v-ads">{[40, 65, 50, 85, 70].map((h, i) => <i key={i} style={{ "--h": `${h}%`, "--i": i }} />)}<b>3.4x</b></div>;
    case "neezi": return <div className="v-neezi"><span className="orb" /><span className="r1" /><span className="r2" /></div>;
    case "store": return <div className="v-store"><span className="bar" /><span className="hero" /><span className="g"><i /><i /><i /></span></div>;
    case "meta": return <div className="v-meta"><i /><i /><i /><svg viewBox="0 0 100 40"><path d="M10 30 Q50 -5 90 30" /></svg></div>;
    default: return <div className="v-money"><svg viewBox="0 0 100 40"><path d="M2 34 L22 28 L38 31 L56 18 L72 21 L98 5" /></svg></div>;
  }
}

function Journey({ c, scroller }) {
  const sec = useRef(null);
  useScrollProgress(sec, scroller);
  return (
    <section ref={sec} className="d2-journey" id="how">
      <div className="d2-journey-pin">
        <div className="lp-wrap d2-journey-head">
          <span className="lp-eyebrow">05 steps</span>
          <h2>{c.flowTitle}</h2>
          <p>{c.flowSub}</p>
        </div>
        <div className="d2-track-wrap">
          <div className="d2-track">
            {c.flow.map((s, i) => (
              <div key={s.t} className="d2-step" style={{ "--i": i }}>
                <div className="d2-step-n">0{i + 1}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
          <div className="d2-progress"><i /></div>
        </div>
      </div>
    </section>
  );
}

export default function D2Story({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d2" navClass="d2-nav" appTheme="dark" logoDark />;
  return <D2Home page={page} />;
}

function D2Home({ page }) {
  const { c, lang, setLang } = useLP();
  const root = useRef(null);
  const cta = useRef(null);
  useReveal(root, [page, lang]);
  usePointerVars(cta);
  useHashScroll();
  const isHome = page !== "pricing";
  return (
    <div ref={root} className="lp-root d2">
      <Cursor c={c} />
      <LPNav c={c} lang={lang} setLang={setLang} className="d2-nav" />

      {isHome ? <Story c={c} scroller={root} /> : (
        <section className="d2-phead">
          <div className="lp-wrap">
            <span className="lp-eyebrow" data-rv="up">{c.nav.pricing}</span>
            <h1 data-rv="up" style={{ "--d": "80ms" }}>{c.pricingTitle}</h1>
            <p data-rv="up" style={{ "--d": "160ms" }}>{c.pricingSub}</p>
          </div>
        </section>
      )}

      {isHome && (
        <div className="d2-marquee" aria-hidden="true">
          <div>{[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>{m}<i>✦</i></span>)}</div>
        </div>
      )}

      {isHome && (
        <section className="lp-sec d2-stats">
          <div className="lp-wrap d2-stats-in">
            {c.stats.map((s, i) => (
              <div key={s.l} data-rv="up" style={{ "--d": `${i * 90}ms` }}>
                <strong className="lp-grad-t">{/^\d+$/.test(s.n) ? <CountUp to={s.n} /> : s.n}</strong>
                <span>{s.l}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {isHome && (
        <section className="lp-sec" id="features">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv="blur"><h2>{c.featuresTitle}</h2><p>{c.featuresSub}</p></div>
            <div className="d2-feats">{c.features.map((f, i) => <FeatureCard key={f.id} f={f} i={i} />)}</div>
          </div>
        </section>
      )}

      {isHome && <Journey c={c} scroller={root} />}

      <section className="lp-sec d2-pricing" id="pricing">
        <div className="lp-wrap">
          <PricingBlock c={c} withTitle={isHome} />
          {!isHome && <CompareTable c={c} />}
        </div>
      </section>

      <section className="lp-sec d2-faq">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{c.faqTitle}</h2></div>
          <Faq c={c} />
        </div>
      </section>

      <section ref={cta} className="d2-cta">
        <div className="d2-cta-glow" />
        <div className="lp-wrap d2-cta-in">
          <div className="d2-neezi" aria-hidden="true"><span className="eye l" /><span className="eye r" /></div>
          <h2 data-rv="blur">{c.ctaTitle}</h2>
          <p data-rv="up" style={{ "--d": "120ms" }}>{c.ctaSub}</p>
          <div data-rv="up" style={{ "--d": "220ms" }}>
            <Magnet className="lp-btn d2-cta-btn" strength={0.4} onClick={goSignup} data-cursor="start">{c.hero.cta} <Icon name="arrowRight" size={15} /></Magnet>
          </div>
        </div>
      </section>

      <LPFooter c={c} logoDark />
    </div>
  );
}
