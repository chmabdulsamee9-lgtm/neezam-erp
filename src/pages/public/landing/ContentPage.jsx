// Product / About / Contact pages, shared by every design (styled through the design's --lp-* tokens).
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { useLP, useReveal, useHashScroll, usePointerVars, LPNav, LPFooter, Faq, PricingBlock, CompareTable, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import { PAGES, PAGE_ORDER, PAGE_ICONS, PAGE_PATH, ABOUT, CONTACT } from "./pages";
import Neezi from "./Neezi";
import { LEGAL } from "../legal";
import "./pages.css";

export const isContentPage = (page) => page !== "home";

function ProductPage({ slug, c, lang, appTheme }) {
  const navigate = useNavigate();
  const p = (PAGES[lang === "en" ? "en" : "ur"])[slug];
  const hero = useRef(null);
  usePointerVars(hero);
  if (!p) return null;
  const others = PAGE_ORDER.filter((s) => s !== slug);
  const L = PAGES[lang === "en" ? "en" : "ur"];
  return (
    <>
      <section ref={hero} className="pg-hero">
        <div className="lp-wrap pg-hero-in">
          <div className="pg-hero-txt">
            <span className="pg-eyebrow" data-rv="up"><Icon name={PAGE_ICONS[slug]} size={13} /> {p.nav}</span>
            <h1 data-rv="up" style={{ "--d": "80ms" }}>{p.title}</h1>
            <p data-rv="up" style={{ "--d": "160ms" }}>{p.sub}</p>
            <div className="pg-cta" data-rv="up" style={{ "--d": "240ms" }}>
              <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
              <button className="lp-btn lp-btn-ghost" onClick={() => navigate("/pricing")}>{c.hero.cta2}</button>
            </div>
          </div>
          <div className="pg-hero-app" data-rv="scale" style={{ "--d": "200ms" }}><AppWindow screen={p.screen} theme={appTheme} compact /></div>
        </div>
      </section>

      <section className="lp-sec pg-problem">
        <div className="lp-wrap pg-problem-in">
          <h2 data-rv="up">{p.problem.t}</h2>
          <ul>{p.problem.points.map((x, i) => <li key={x} data-rv="up" style={{ "--d": `${i * 90}ms` }}><span className="pg-x">✕</span>{x}</li>)}</ul>
        </div>
      </section>

      <section className="lp-sec pg-feats-sec">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{lang === "en" ? "What you get" : "Aap ko kya milta hai"}</h2></div>
          <div className="pg-feats">
            {p.features.map((f, i) => (
              <div key={f.t} className="pg-feat" data-rv="up" style={{ "--d": `${(i % 3) * 80}ms` }}>
                <span className="pg-feat-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{f.t}</h3><p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec pg-steps-sec">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{c.nav.how}</h2></div>
          <div className="pg-steps">
            {p.steps.map((s, i) => (
              <div key={s.t} className="pg-step" data-rv="up" style={{ "--d": `${i * 120}ms` }}>
                <span>{i + 1}</span><h3>{s.t}</h3><p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec pg-faq-sec">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{c.faqTitle}</h2></div>
          <div className="lp-faq">
            {p.faq.map((f, i) => (
              <details key={f.q} className="pg-qa" data-rv="up" style={{ "--d": `${i * 60}ms` }} open={i === 0}>
                <summary>{f.q}<Icon name="chevronDown" size={14} /></summary><p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec pg-more">
        <div className="lp-wrap">
          <div className="lp-sec-head" data-rv="up"><h2>{lang === "en" ? "All of eNeezam" : "eNeezam mein aur bhi"}</h2></div>
          <div className="pg-more-grid">
            {others.map((s, i) => (
              <button key={s} className="pg-more-i" data-rv="up" style={{ "--d": `${(i % 6) * 50}ms` }} onClick={() => navigate(PAGE_PATH[s])}>
                <span><Icon name={PAGE_ICONS[s]} size={15} /></span>{L[s].nav}<Icon name="arrowRight" size={12} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function AboutPage({ lang }) {
  const a = ABOUT[lang === "en" ? "en" : "ur"];
  return (
    <>
      <section className="pg-hero pg-hero-c">
        <div className="lp-wrap">
          <h1 data-rv="up">{a.title}</h1>
          <p data-rv="up" style={{ "--d": "100ms" }}>{a.sub}</p>
          <div className="pg-about-neezi" data-rv="scale"><Neezi size={190} pose="wave" /></div>
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap pg-story">{a.story.map((s, i) => <p key={i} data-rv="up" style={{ "--d": `${i * 100}ms` }}><span>0{i + 1}</span>{s}</p>)}</div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="pg-steps">{a.values.map((v, i) => <div key={v.t} className="pg-step" data-rv="up" style={{ "--d": `${i * 100}ms` }}><span>{i + 1}</span><h3>{v.t}</h3><p>{v.d}</p></div>)}</div>
          <div className="pg-mission" data-rv="scale"><b>{a.missionT}</b><p>{a.mission}</p></div>
        </div>
      </section>
    </>
  );
}

function ContactPage({ lang }) {
  const k = CONTACT[lang === "en" ? "en" : "ur"];
  return (
    <section className="pg-hero pg-hero-c pg-contact">
      <div className="lp-wrap">
        <h1 data-rv="up">{k.title}</h1>
        <p data-rv="up" style={{ "--d": "100ms" }}>{k.sub}</p>
        <div className="pg-contact-grid">
          <a className="pg-contact-i" href="mailto:support@eneezam.com" data-rv="up"><Icon name="send" size={18} /><b>{k.email}</b><span>support@eneezam.com</span></a>
          <a className="pg-contact-i" href={LEGAL.whatsappLink} target="_blank" rel="noreferrer" data-rv="up" style={{ "--d": "100ms" }}><Icon name="comment" size={18} /><b>{k.phone}</b><span>{LEGAL.phone}</span></a>
          <div className="pg-contact-i" data-rv="up" style={{ "--d": "200ms" }}><Icon name="clock" size={18} /><b>{k.hours}</b><span>{LEGAL.hours[lang === "en" ? "en" : "ur"]}</span></div>
          <div className="pg-contact-i" data-rv="up" style={{ "--d": "300ms" }}><Icon name="pin" size={18} /><b>{k.address}</b><span>{LEGAL.address}</span></div>
        </div>
      </div>
    </section>
  );
}

function PricingPage({ c }) {
  return (
    <>
      <section className="pg-hero pg-hero-c"><div className="lp-wrap"><h1 data-rv="up">{c.pricingTitle}</h1><p data-rv="up" style={{ "--d": "100ms" }}>{c.pricingSub}</p></div></section>
      <section className="lp-sec" style={{ paddingTop: 20 }}><div className="lp-wrap"><PricingBlock c={c} withTitle={false} /><CompareTable c={c} /></div></section>
      <section className="lp-sec"><div className="lp-wrap"><div className="lp-sec-head" data-rv="up"><h2>{c.faqTitle}</h2></div><Faq c={c} /></div></section>
    </>
  );
}

// The whole non-home page for a design: its root class, nav class and app theme come from the design.
export function ContentShell({ page, rootClass, navClass, appTheme = "light", logoDark = false, children }) {
  const { c, lang, setLang } = useLP();
  const root = useRef(null);
  useReveal(root, [page, lang]);
  useHashScroll();
  let body;
  if (page === "pricing") body = <PricingPage c={c} />;
  else if (page === "about") body = <AboutPage lang={lang} />;
  else if (page === "contact") body = <ContactPage lang={lang} />;
  else body = <ProductPage slug={page.replace(/^p:/, "")} c={c} lang={lang} appTheme={appTheme} />;
  return (
    <div ref={root} className={`lp-root ${rootClass} pg`}>
      {children}
      <LPNav c={c} lang={lang} setLang={setLang} className={navClass} logoDark={logoDark} />
      {body}
      <section className="pg-final">
        <div className="lp-wrap">
          <h2 data-rv="up">{c.ctaTitle}</h2>
          <p data-rv="up">{c.ctaSub}</p>
          <div data-rv="up"><Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet></div>
        </div>
      </section>
      <LPFooter c={c} logoDark={logoDark} />
    </div>
  );
}

// pricing + faq + final CTA + footer: the shared end of every new design's home page
export function HomeTail({ c, logoDark = false, ctaClass = "" }) {
  return (
    <>
      <section className="lp-sec" id="pricing">
        <div className="lp-wrap"><PricingBlock c={c} /></div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap"><div className="lp-sec-head" data-rv="up"><h2>{c.faqTitle}</h2></div><Faq c={c} /></div>
      </section>
      <section className={`pg-final ${ctaClass}`}>
        <div className="lp-wrap">
          <h2 data-rv="up">{c.ctaTitle}</h2>
          <p data-rv="up">{c.ctaSub}</p>
          <div data-rv="up"><Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet></div>
        </div>
      </section>
      <LPFooter c={c} logoDark={logoDark} />
    </>
  );
}

// common hooks for a design's home root
export function useHomeRoot(deps = []) {
  const lp = useLP();
  const root = useRef(null);
  useReveal(root, [lp.lang, ...deps]);
  useHashScroll();
  return { ...lp, root };
}
