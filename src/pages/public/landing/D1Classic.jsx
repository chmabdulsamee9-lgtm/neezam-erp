// Design 1 "Classic+": today's light theme made premium. Soft gradient blob that follows the cursor,
// hand-drawn underline, tilted live dashboard, a timeline that lights up step by step as you scroll.
import { useRef, useState } from "react";
import Icon from "../../../components/Icon";
import {
  useLP, useReveal, usePointerVars, useScrollProgress, useHashScroll,
  DashMock, LPNav, LPFooter, PricingBlock, CompareTable, Faq, Magnet, goSignup,
} from "./shared";
import { AppWindow, useAutoScreen } from "./AppUI";
import { ContentShell } from "./ContentPage";
import "./d1.css";

function Timeline({ c, scroller }) {
  const sec = useRef(null);
  const [active, setActive] = useState(0);
  useScrollProgress(sec, scroller, (p) => {
    const a = Math.min(c.flow.length - 1, Math.floor(p * c.flow.length * 1.05));
    setActive((o) => (o === a ? o : a));
  });
  return (
    <section ref={sec} className="d1-how" id="how">
      <div className="d1-how-pin">
        <div className="lp-wrap d1-how-in">
          <div className="d1-how-head">
            <span className="lp-eyebrow">{c.nav.how}</span>
            <h2>{c.flowTitle}</h2>
            <p>{c.flowSub}</p>
          </div>
          <ol className="d1-tl">
            <span className="d1-tl-line"><i /></span>
            {c.flow.map((s, i) => (
              <li key={s.t} className={i <= active ? "on" : ""}>
                <span className="d1-tl-n">{i + 1}</span>
                <div><h3>{s.t}</h3><p>{s.d}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default function D1Classic({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d1" navClass="d1-nav" />;
  return <D1Home page={page} />;
}

const TOUR = ["home", "orders", "whatsapp", "booked", "ads", "pnl"];

function D1Home({ page }) {
  const [screen, setScreen] = useAutoScreen(TOUR);
  const { c, lang, setLang } = useLP();
  const root = useRef(null), hero = useRef(null);
  useReveal(root, [page, lang]);
  usePointerVars(hero);
  useHashScroll();
  const isHome = page !== "pricing";
  return (
    <div ref={root} className="lp-root d1">
      <LPNav c={c} lang={lang} setLang={setLang} className="d1-nav" />

      {isHome ? (
        <section ref={hero} className="d1-hero">
          <div className="d1-blob" aria-hidden="true" />
          <div className="d1-grain" aria-hidden="true" />
          <div className="lp-wrap d1-hero-in">
            <div className="d1-hero-txt">
              <span className="d1-pill" data-rv="up"><b>Nex</b> + <b>Neezi AI</b> + WhatsApp · 2026</span>
              <h1 data-rv="up" style={{ "--d": "80ms" }}>
                {c.hero.title1}{" "}
                <span className="d1-ul">{c.hero.title2}
                  <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M4 14 C 60 4, 140 4, 296 10" /></svg>
                </span>
              </h1>
              <p data-rv="up" style={{ "--d": "160ms" }}>{c.hero.sub}</p>
              <div className="d1-cta" data-rv="up" style={{ "--d": "240ms" }}>
                <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
                <button className="lp-btn lp-btn-ghost" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>{c.hero.cta2}</button>
              </div>
              <div className="d1-trust" data-rv="up" style={{ "--d": "320ms" }}><Icon name="check" size={13} /> {c.hero.trust}</div>
            </div>
            <div className="d1-hero-dash" data-rv="scale" style={{ "--d": "200ms" }}><AppWindow screen={screen} onNav={setScreen} /></div>
          </div>
        </section>
      ) : (
        <section className="d1-phead">
          <div className="d1-blob" aria-hidden="true" />
          <div className="lp-wrap">
            <h1 data-rv="up">{c.pricingTitle}</h1>
            <p data-rv="up" style={{ "--d": "100ms" }}>{c.pricingSub}</p>
          </div>
        </section>
      )}

      {isHome && (
        <section className="lp-sec d1-feats-sec" id="features">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv="up"><h2>{c.featuresTitle}</h2><p>{c.featuresSub}</p></div>
            <div className="d1-feats">
              {c.features.map((f, i) => (
                <div key={f.id} className="d1-feat" data-rv="up" style={{ "--d": `${(i % 4) * 70}ms` }}>
                  <span className="d1-feat-ic"><Icon name={f.icon} size={17} /></span>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {isHome && <Timeline c={c} scroller={root} />}

      <section className="lp-sec" id="pricing">
        <div className="lp-wrap">
          <PricingBlock c={c} withTitle={isHome} />
          {!isHome && <CompareTable c={c} />}
        </div>
      </section>

      <section className="lp-sec d1-faq">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{c.faqTitle}</h2></div>
          <Faq c={c} />
        </div>
      </section>

      <section className="d1-final">
        <div className="lp-wrap">
          <div className="d1-final-card" data-rv="scale">
            <h2>{c.ctaTitle}</h2>
            <p>{c.ctaSub}</p>
            <Magnet className="lp-btn d1-final-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
          </div>
        </div>
      </section>

      <LPFooter c={c} />
    </div>
  );
}
