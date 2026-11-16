// Design 10 "Stack": the app window zooms up from a 3D tilt, then each module arrives as a card that
// stacks over the previous one while it shrinks back (sticky stacking cards).
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { LPNav, Magnet, goSignup, useScrollProgress } from "./shared";
import { AppWindow, AppScreen } from "./AppUI";
import { ContentShell, HomeTail, useHomeRoot } from "./ContentPage";
import { PAGES, PAGE_PATH } from "./pages";
import "./d10.css";

const CARDS = ["orders", "whatsapp", "courier", "returns", "ads", "finance", "store", "neezi"];

export default function D10Stack({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d10" navClass="d10-nav" />;
  return <D10Home />;
}

function D10Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  const navigate = useNavigate();
  const P = PAGES[lang === "en" ? "en" : "ur"];
  const zoom = useRef(null), stack = useRef(null);
  useScrollProgress(zoom, root);
  useScrollProgress(stack, root);
  return (
    <div ref={root} className="lp-root d10">
      <LPNav c={c} lang={lang} setLang={setLang} className="d10-nav" />
      <section className="d10-hero">
        <div className="lp-wrap d10-head">
          <h1 data-rv="up">{c.hero.title1}<br /><span className="lp-grad-t">{c.hero.title2}</span></h1>
          <div className="d10-hero-row" data-rv="up" style={{ "--d": "120ms" }}>
            <p>{c.hero.sub}</p>
            <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
          </div>
        </div>
      </section>
      <section ref={zoom} className="d10-zoom">
        <div className="d10-zoom-pin"><div className="d10-zoom-app"><AppWindow screen="home" /></div></div>
      </section>

      <section ref={stack} className="d10-stack" id="features" style={{ "--n": CARDS.length }}>
        {CARDS.map((k, i) => (
          <div key={k} className="d10-card" style={{ "--i": i }}>
            <div className="d10-card-in">
              <div className="d10-card-txt">
                <span className="d10-num">{String(i + 1).padStart(2, "0")} / {String(CARDS.length).padStart(2, "0")}</span>
                <h2>{P[k].title}</h2>
                <p>{P[k].sub}</p>
                <ul>{P[k].features.slice(0, 3).map((f) => <li key={f.t}><Icon name="check" size={12} />{f.t}</li>)}</ul>
                <button className="d10-link" onClick={() => navigate(PAGE_PATH[k])}>{P[k].nav} <Icon name="arrowRight" size={12} /></button>
              </div>
              <div className="d10-card-app"><AppScreen screen={P[k].screen} /></div>
            </div>
          </div>
        ))}
      </section>
      <div id="how" />
      <HomeTail c={c} />
    </div>
  );
}
