// Design 4 "Dark Premium": near-black, a soft glow that trails the cursor, a typed headline with a
// blinking cursor, a tilted 3D wall of live eNeezam tiles that leans with the mouse and drifts on scroll,
// glass bento cards. Medium motion.
import { useEffect, useRef, useState } from "react";
import Icon from "../../../components/Icon";
import {
  useLP, useReveal, usePointerVars, useScrollProgress, useHashScroll,
  LPNav, LPFooter, PricingBlock, CompareTable, Faq, Magnet, goSignup,
} from "./shared";
import "./d4.css";

function Typed({ words }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { const r = requestAnimationFrame(() => setN(words[0].length)); return () => cancelAnimationFrame(r); }
    const w = words[i % words.length];
    const t = setTimeout(() => {
      if (!del && n < w.length) setN(n + 1);
      else if (!del) setDel(true);
      else if (n > 0) setN(n - 1);
      else { setDel(false); setI(i + 1); }
    }, !del && n === w.length ? 1700 : del ? 34 : 70);
    return () => clearTimeout(t);
  }, [i, n, del, words]);
  return <span className="d4-typed"><span className="lp-grad-t">{words[i % words.length].slice(0, n)}</span><i>_</i></span>;
}

function Wall({ c, scroller }) {
  const sec = useRef(null);
  useScrollProgress(sec, scroller);
  const t = c.dash;
  return (
    <div ref={sec} className="d4-wall-sec" aria-hidden="true">
      <div className="d4-wall">
        <div className="d4-tile kpi"><span>{t.orders}</span><b>1,284</b><em>+18%</em></div>
        <div className="d4-tile chat"><span className="bub l">Order #T3176 confirm karein?</span><span className="bub r">✓ Confirm</span><span className="bub l">Shukriya! Kal dispatch hoga.</span></div>
        <div className="d4-tile kpi hi"><span>{t.profit}</span><b>Rs 8.4L</b><em>{t.roas} 3.6x</em></div>
        <div className="d4-tile bars">{[30, 48, 40, 62, 55, 78, 70, 90].map((h, i) => <i key={i} style={{ "--h": `${h}%`, "--i": i }} />)}</div>
        <div className="d4-tile track"><span>Nex · #DX88213</span><div className="dots"><i className="on" /><i className="on" /><i className="on" /><i /></div><b>Out for delivery</b></div>
        <div className="d4-tile kpi"><span>{t.confirmed}</span><b>92%</b><em>WhatsApp</em></div>
        <div className="d4-tile list">{["Karachi", "Lahore", "Multan", "Sialkot"].map((x, i) => <div key={x}><span>#T31{70 + i}</span><span>{x}</span><b>Rs {(2 + i) * 1150}</b></div>)}</div>
        <div className="d4-tile neezi"><span className="orb" /><p>Neezi: "Campaign B ka ROAS break-even se neeche hai, budget 20% kam karein?"</p></div>
        <div className="d4-tile kpi"><span>{t.booked}</span><b>1,127</b><em>Nex</em></div>
      </div>
    </div>
  );
}

export default function D4Dark({ page }) {
  const { c, lang, setLang } = useLP();
  const root = useRef(null);
  useReveal(root, [page, lang]);
  usePointerVars(root, "window");
  useHashScroll();
  const isHome = page !== "pricing";
  const words = [c.hero.title2, ...c.features.slice(0, 4).map((f) => f.t)];
  return (
    <div ref={root} className="lp-root d4">
      <div className="d4-glow" aria-hidden="true"><i className="g1" /><i className="g2" /></div>
      <div className="d4-gridbg" aria-hidden="true" />
      <LPNav c={c} lang={lang} setLang={setLang} className="d4-nav" logoDark />

      {isHome ? (
        <section className="d4-hero">
          <div className="lp-wrap d4-hero-in">
            <span className="d4-badge" data-rv="up"><b /> {c.hero.eyebrow}</span>
            <h1 data-rv="blur" style={{ "--d": "80ms" }}>{c.hero.title1}<br /><Typed words={words} /></h1>
            <p data-rv="up" style={{ "--d": "180ms" }}>{c.hero.sub}</p>
            <div className="d4-cta" data-rv="up" style={{ "--d": "260ms" }}>
              <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
              <button className="lp-btn lp-btn-ghost" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>{c.hero.cta2}</button>
            </div>
            <div className="d4-chips" data-rv="up" style={{ "--d": "340ms" }}>
              {["Shopify", "Meta", "WhatsApp", "Dex", "Nex", "Neezi AI"].map((x) => <span key={x}>{x}</span>)}
            </div>
          </div>
          <Wall c={c} scroller={root} />
        </section>
      ) : (
        <section className="d4-phead">
          <div className="lp-wrap">
            <span className="d4-badge" data-rv="up"><b /> {c.nav.pricing}</span>
            <h1 data-rv="blur">{c.pricingTitle}</h1>
            <p data-rv="up">{c.pricingSub}</p>
          </div>
        </section>
      )}

      {isHome && (
        <section className="lp-sec" id="features">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv="blur"><h2>{c.featuresTitle}</h2><p>{c.featuresSub}</p></div>
            <div className="d4-bento">
              {c.features.map((f, i) => (
                <div key={f.id} className={`d4-card b${i}`} data-rv="up" style={{ "--d": `${(i % 3) * 80}ms` }}>
                  <span className="d4-card-ic"><Icon name={f.icon} size={18} /></span>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {isHome && (
        <section className="lp-sec d4-how" id="how">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv="blur"><h2>{c.flowTitle}</h2><p>{c.flowSub}</p></div>
            <div className="d4-steps">
              <svg className="d4-steps-line" viewBox="0 0 1000 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10 H1000" /></svg>
              {c.flow.map((s, i) => (
                <div key={s.t} className="d4-step" data-rv="up" style={{ "--d": `${i * 120}ms` }}>
                  <span className="d4-step-n">{i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="lp-sec" id="pricing">
        <div className="lp-wrap">
          <PricingBlock c={c} withTitle={isHome} />
          {!isHome && <CompareTable c={c} />}
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="blur"><h2>{c.faqTitle}</h2></div>
          <Faq c={c} />
        </div>
      </section>

      <section className="d4-final">
        <div className="lp-wrap">
          <h2 data-rv="blur">{c.ctaTitle}</h2>
          <p data-rv="up">{c.ctaSub}</p>
          <div data-rv="up" style={{ "--d": "120ms" }}><Magnet className="lp-btn d4-final-btn" strength={0.4} onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={15} /></Magnet></div>
        </div>
      </section>

      <LPFooter c={c} logoDark />
    </div>
  );
}
