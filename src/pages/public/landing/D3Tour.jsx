// Design 3 "Live Tour": the real eNeezam app is the hero. It rises from a 3D tilt as you scroll, then
// a sticky app window follows the story: each chapter you scroll to opens that screen of the app.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { LPNav, useScrollProgress, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import { ContentShell, HomeTail, useHomeRoot } from "./ContentPage";
import { PAGES, PAGE_PATH } from "./pages";
import "./d3.css";

const CHAPTERS = ["orders", "whatsapp", "courier", "returns", "ads", "finance", "store", "neezi"];

export default function D3Tour({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d3" navClass="d3-nav" />;
  return <D3Home />;
}

function D3Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  const navigate = useNavigate();
  const rise = useRef(null);
  useScrollProgress(rise, root);
  const P = PAGES[lang === "en" ? "en" : "ur"];
  const [active, setActive] = useState(0);
  const [clicked, setClicked] = useState(null);
  const refs = useRef([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setActive(Number(e.target.dataset.i)); setClicked(null); } }), { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const screen = clicked || P[CHAPTERS[active]].screen;
  return (
    <div ref={root} className="lp-root d3">
      <LPNav c={c} lang={lang} setLang={setLang} className="d3-nav" />
      <section ref={rise} className="d3-rise">
        <div className="d3-rise-pin">
          <div className="lp-wrap d3-head">
            <span className="d3-badge" data-rv="up"><b>LIVE</b> {lang === "en" ? "This is the real eNeezam. Click around." : "Yeh asal eNeezam hai. Khud chala kar dekhein."}</span>
            <h1 data-rv="up" style={{ "--d": "80ms" }}>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h1>
            <p data-rv="up" style={{ "--d": "160ms" }}>{c.hero.sub}</p>
            <div className="d3-cta" data-rv="up" style={{ "--d": "240ms" }}>
              <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
            </div>
          </div>
          <div className="d3-app3d"><AppWindow screen="home" /></div>
        </div>
      </section>

      <section className="d3-tour" id="how">
        <div className="lp-wrap d3-tour-in">
          <div className="d3-chapters">
            {CHAPTERS.map((k, i) => (
              <div key={k} ref={(el) => (refs.current[i] = el)} data-i={i} className={`d3-ch ${i === active ? "on" : ""}`} id={i === 0 ? "features" : undefined}>
                <span className="d3-ch-n">{String(i + 1).padStart(2, "0")} · {P[k].nav}</span>
                <h2>{P[k].title}</h2>
                <p>{P[k].sub}</p>
                <ul>{P[k].features.slice(0, 3).map((f) => <li key={f.t}><Icon name="check" size={12} /> {f.t}</li>)}</ul>
                <button className="d3-more" onClick={() => navigate(PAGE_PATH[k])}>{lang === "en" ? "Learn more" : "Tafseel dekhein"} <Icon name="arrowRight" size={12} /></button>
              </div>
            ))}
          </div>
          <div className="d3-sticky">
            <AppWindow screen={screen} onNav={setClicked} />
            <div className="d3-dots">{CHAPTERS.map((k, i) => <i key={k} className={i === active ? "on" : ""} />)}</div>
          </div>
        </div>
      </section>

      <HomeTail c={c} />
    </div>
  );
}
