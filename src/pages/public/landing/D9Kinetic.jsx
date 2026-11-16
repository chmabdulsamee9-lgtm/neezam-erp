// Design 9 "Kinetic": giant type in motion. Rows of words slide against each other as you scroll; hover a
// feature name and its real app screen floats under the cursor, tilting with your movement.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { LPNav, Magnet, goSignup, useScrollProgress, finePointer } from "./shared";
import { AppScreen, AppWindow } from "./AppUI";
import { ContentShell, HomeTail, useHomeRoot } from "./ContentPage";
import { PAGES, PAGE_PATH, PAGE_ORDER } from "./pages";
import "./d9.css";

const WORDS = [["ORDERS", "WHATSAPP", "COURIER", "RETURNS"], ["ADS", "PROFIT", "STORE", "NEEZI"], ["SHOPIFY", "NEX", "META", "TEAM"]];

function Follower({ screen }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!finePointer()) return;
    let x = 0, y = 0, cx = 0, cy = 0, raf;
    const move = (e) => { x = e.clientX; y = e.clientY; };
    const loop = () => {
      const vx = x - cx; cx += vx * 0.14; cy += (y - cy) * 0.14;
      if (ref.current) ref.current.style.transform = `translate(${cx + 24}px, ${cy - 120}px) rotate(${Math.max(-12, Math.min(12, vx * 0.08))}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={ref} className={`d9-follow ${screen ? "on" : ""}`} aria-hidden="true">{screen && <AppScreen key={screen} screen={screen} />}</div>;
}

export default function D9Kinetic({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d9" navClass="d9-nav" />;
  return <D9Home />;
}

function D9Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  const navigate = useNavigate();
  const P = PAGES[lang === "en" ? "en" : "ur"];
  const rows = useRef(null);
  useScrollProgress(rows, root);
  const [hover, setHover] = useState(null);
  return (
    <div ref={root} className="lp-root d9">
      <LPNav c={c} lang={lang} setLang={setLang} className="d9-nav" />
      <section className="d9-hero">
        <div className="lp-wrap">
          <p className="d9-kicker" data-rv="up">eNeezam · {c.hero.eyebrow}</p>
          <h1 data-rv="up" style={{ "--d": "60ms" }}><span>{c.hero.title1}</span> <span className="lp-grad-t">{c.hero.title2}</span></h1>
          <div className="d9-hero-row" data-rv="up" style={{ "--d": "140ms" }}>
            <p>{c.hero.sub}</p>
            <Magnet className="lp-btn d9-btn" strength={0.45} onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={15} /></Magnet>
          </div>
        </div>
      </section>

      <section ref={rows} className="d9-rows" aria-hidden="true">
        {WORDS.map((r, i) => (
          <div key={i} className={`d9-row r${i}`} style={{ "--dir": i % 2 ? 1 : -1 }}>
            {[...r, ...r, ...r].map((w, j) => <span key={j} className={j % 4 === 1 ? "o" : ""}>{w}<i>✦</i></span>)}
          </div>
        ))}
      </section>

      <section className="lp-sec d9-app-sec"><div className="lp-wrap" data-rv="scale"><AppWindow screen="orders" /></div></section>

      <section className="d9-index" id="features" onMouseLeave={() => setHover(null)}>
        <div className="lp-wrap">
          <p className="d9-kicker">{lang === "en" ? "Index — hover to preview" : "Fehrist — mouse rakh kar dekhein"}</p>
          {PAGE_ORDER.map((k, i) => (
            <button key={k} className="d9-item" data-rv="up" style={{ "--d": `${(i % 4) * 50}ms` }}
              onMouseEnter={() => setHover(P[k].screen)} onFocus={() => setHover(P[k].screen)} onClick={() => navigate(PAGE_PATH[k])}>
              <span className="d9-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="d9-name">{P[k].nav}</span>
              <span className="d9-desc">{P[k].features[0].t}</span>
              <Icon name="arrowRight" size={22} />
            </button>
          ))}
        </div>
      </section>
      <Follower screen={hover} />
      <div id="how" />
      <HomeTail c={c} ctaClass="d9-final" />
    </div>
  );
}
