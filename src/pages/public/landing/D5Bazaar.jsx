// Design 5 "Bazaar": warm, friendly, rounded. Pastel logo-gradient panels, orbiting discs, floating
// cards that drift with the mouse (parallax), line drawings that draw themselves, counting numbers.
import { useRef } from "react";
import Icon from "../../../components/Icon";
import {
  useLP, useReveal, usePointerVars, useHashScroll,
  DashMock, LPNav, LPFooter, PricingBlock, CompareTable, Faq, CountUp, Magnet, goSignup,
} from "./shared";
import "./d5.css";

export default function D5Bazaar({ page }) {
  const { c, lang, setLang } = useLP();
  const root = useRef(null), hero = useRef(null);
  useReveal(root, [page, lang]);
  usePointerVars(hero);
  useHashScroll();
  const isHome = page !== "pricing";
  return (
    <div ref={root} className="lp-root d5">
      <LPNav c={c} lang={lang} setLang={setLang} className="d5-nav" />

      {isHome ? (
        <section ref={hero} className="d5-hero">
          <div className="d5-panel">
            <div className="d5-orbits" aria-hidden="true">
              <span className="o1"><i /></span><span className="o2"><i /></span><span className="o3"><i /></span>
            </div>
            <div className="d5-hero-in">
              <div className="d5-hero-txt">
                <h1 data-rv="up">{c.hero.title1} <span>{c.hero.title2}</span></h1>
                <p data-rv="up" style={{ "--d": "100ms" }}>{c.hero.sub}</p>
                <div className="d5-cta" data-rv="up" style={{ "--d": "200ms" }}>
                  <Magnet className="lp-btn d5-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
                </div>
              </div>
              <div className="d5-hero-art" aria-hidden="true">
                <div className="d5-float f1" style={{ "--z": 1.4 }}><Icon name="comment" size={14} /> {c.features[2].t} <b>✓</b></div>
                <div className="d5-float f2" style={{ "--z": 0.8 }}><Icon name="truck" size={14} /> Nex · Delivered</div>
                <div className="d5-float f3" style={{ "--z": 1.1 }}><Icon name="chart" size={14} /> {c.dash.profit} <b>+Rs 1,450</b></div>
                <div className="d5-art-dash" style={{ "--z": 0.4 }}><DashMock c={c} /></div>
              </div>
            </div>
          </div>
          <div className="lp-wrap d5-stats">
            {c.stats.map((s, i) => (
              <div key={s.l} data-rv="up" style={{ "--d": `${i * 90}ms` }}>
                <strong>{/^\d+$/.test(s.n) ? <CountUp to={s.n} /> : s.n}</strong><span>{s.l}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="d5-hero">
          <div className="d5-panel d5-panel-sm">
            <div className="d5-orbits" aria-hidden="true"><span className="o1"><i /></span><span className="o2"><i /></span></div>
            <div className="d5-phead"><h1 data-rv="up">{c.pricingTitle}</h1><p data-rv="up" style={{ "--d": "100ms" }}>{c.pricingSub}</p></div>
          </div>
        </section>
      )}

      {isHome && (
        <section className="lp-sec" id="features">
          <div className="lp-wrap">
            <div className="lp-sec-head" data-rv="up"><h2>{c.featuresTitle}</h2><p>{c.featuresSub}</p></div>
            <div className="d5-feats">
              {c.features.map((f, i) => (
                <div key={f.id} className={`d5-feat t${i % 4}`} data-rv="up" style={{ "--d": `${(i % 4) * 80}ms` }}>
                  <svg className="d5-feat-line" viewBox="0 0 120 60" aria-hidden="true"><path d="M4 50 C 30 10, 60 70, 116 12" /></svg>
                  <span className="d5-feat-ic"><Icon name={f.icon} size={20} /></span>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {isHome && (
        <section className="lp-sec d5-how" id="how">
          <div className="lp-wrap">
            <div className="d5-how-card">
              <div className="d5-how-head" data-rv="left"><h2>{c.flowTitle}</h2><p>{c.flowSub}</p></div>
              <ol className="d5-steps">
                {c.flow.map((s, i) => (
                  <li key={s.t} data-rv="right" style={{ "--d": `${i * 110}ms`, "--i": i }}>
                    <span className="d5-step-n">0{i + 1}</span>
                    <div><h3>{s.t}</h3><p>{s.d}</p></div>
                  </li>
                ))}
              </ol>
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
          <div className="lp-sec-head" data-rv="up"><h2>{c.faqTitle}</h2></div>
          <Faq c={c} />
        </div>
      </section>

      <section className="d5-final">
        <div className="d5-panel d5-panel-cta" data-rv="scale">
          <div className="d5-orbits" aria-hidden="true"><span className="o1"><i /></span><span className="o3"><i /></span></div>
          <h2>{c.ctaTitle}</h2>
          <p>{c.ctaSub}</p>
          <Magnet className="lp-btn d5-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
        </div>
      </section>

      <LPFooter c={c} />
    </div>
  );
}
