// Design 3 "Minimal": no motion at all (fastest). Big type, serif accent words, hairlines, lots of air.
import { useRef } from "react";
import Icon from "../../../components/Icon";
import { useLP, useHashScroll, DashMock, LPNav, LPFooter, PricingBlock, CompareTable, Faq, goSignup } from "./shared";
import "./d3.css";

export default function D3Minimal({ page }) {
  const { c, lang, setLang } = useLP();
  const root = useRef(null);
  useHashScroll();
  const isHome = page !== "pricing";
  const [w1, ...rest1] = c.hero.title1.split(" ");
  return (
    <div ref={root} className="lp-root d3 lp-static">
      <LPNav c={c} lang={lang} setLang={setLang} className="d3-nav" />

      {isHome ? (
        <section className="d3-hero">
          <div className="lp-wrap">
            <div className="d3-kicker">{c.hero.eyebrow}</div>
            <h1><span className="lp-serif lp-grad-t">{w1}</span> {rest1.join(" ")}<br />{c.hero.title2}</h1>
            <div className="d3-hero-row">
              <p>{c.hero.sub}</p>
              <div className="d3-hero-cta">
                <button className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></button>
                <span>{c.hero.trust}</span>
              </div>
            </div>
            <div className="d3-dash"><DashMock c={c} still /></div>
          </div>
        </section>
      ) : (
        <section className="d3-hero d3-phead">
          <div className="lp-wrap">
            <div className="d3-kicker">{c.nav.pricing}</div>
            <h1>{c.pricingTitle}</h1>
            <p className="d3-sub">{c.pricingSub}</p>
          </div>
        </section>
      )}

      {isHome && (
        <section className="d3-sec" id="features">
          <div className="lp-wrap">
            <div className="d3-sec-head"><span>01</span><h2>{c.featuresTitle}</h2><p>{c.featuresSub}</p></div>
            <div className="d3-list">
              {c.features.map((f, i) => (
                <div key={f.id} className="d3-item">
                  <span className="d3-n">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {isHome && (
        <section className="d3-sec" id="how">
          <div className="lp-wrap">
            <div className="d3-sec-head"><span>02</span><h2>{c.flowTitle}</h2><p>{c.flowSub}</p></div>
            <div className="d3-flow">
              {c.flow.map((s, i) => (
                <div key={s.t}><span className="d3-n">{i + 1}</span><h3>{s.t}</h3><p>{s.d}</p></div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="d3-sec" id="pricing">
        <div className="lp-wrap">
          {isHome && <div className="d3-sec-head"><span>03</span><h2>{c.pricingTitle}</h2><p>{c.pricingSub}</p></div>}
          <PricingBlock c={c} withTitle={false} />
          {!isHome && <CompareTable c={c} />}
        </div>
      </section>

      <section className="d3-sec">
        <div className="lp-wrap">
          <div className="d3-sec-head"><span>{isHome ? "04" : "—"}</span><h2>{c.faqTitle}</h2></div>
          <Faq c={c} />
        </div>
      </section>

      <section className="d3-final">
        <div className="lp-wrap">
          <h2>{c.ctaTitle.split(" ").slice(0, -1).join(" ")} <span className="lp-serif lp-grad-t">{c.ctaTitle.split(" ").slice(-1)}</span></h2>
          <button className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></button>
        </div>
      </section>

      <LPFooter c={c} />
    </div>
  );
}
