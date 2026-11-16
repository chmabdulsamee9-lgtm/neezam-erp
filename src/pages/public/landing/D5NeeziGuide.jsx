// Design 5 "Neezi Guide": Neezi (the mascot) greets you, leans towards your cursor, then walks along the
// bottom of the screen as you scroll, explaining each part of eNeezam in a speech bubble.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { LPNav, usePointerVars, Magnet, goSignup } from "./shared";
import { AppScreen } from "./AppUI";
import { ContentShell, HomeTail, useHomeRoot } from "./ContentPage";
import { PAGES, PAGE_PATH } from "./pages";
import "./d5.css";

const STOPS = ["orders", "whatsapp", "courier", "ads", "finance", "store"];
const TIPS = {
  ur: ["Yeh dekhein, saare orders ek jagah!", "Customer khud WhatsApp par confirm karta hai.", "Ek click, courier book. Main track karta hoon.", "Is ad ka asal munafa? Main bata deta hoon.", "Har rupay ka hisab, roz.", "Aur aap ka apna store, aap ke domain par."],
  en: ["Look, every order in one place!", "Customers confirm on WhatsApp themselves.", "One click, courier booked. I'll track it.", "This ad's real profit? I'll tell you.", "Every rupee, accounted daily.", "And your own store, on your domain."],
};

function Typed({ text }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), 28);
    return () => clearInterval(id);
  }, [text]);
  return <>{text.slice(0, n)}<i className="d5-caret" /></>;
}

export default function D5NeeziGuide({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d5" navClass="d5-nav" />;
  return <D5Home />;
}

function D5Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  const navigate = useNavigate();
  const hero = useRef(null);
  usePointerVars(hero);
  const P = PAGES[lang === "en" ? "en" : "ur"];
  const tips = TIPS[lang === "en" ? "en" : "ur"];
  const [stop, setStop] = useState(-1);
  const [walk, setWalk] = useState(0);
  const rows = useRef([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setStop(Number(e.target.dataset.i))), { rootMargin: "-40% 0px -40% 0px" });
    rows.current.forEach((el) => el && io.observe(el));
    const sc = root.current;
    let raf = 0;
    const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setWalk(sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight)); }); };
    sc.addEventListener("scroll", on, { passive: true });
    return () => { io.disconnect(); sc.removeEventListener("scroll", on); };
  }, [root]);
  const hello = lang === "en" ? "Hi! I'm Neezi. Let me show you around eNeezam." : "Assalam o Alaikum! Main Neezi hoon. Aaiye, eNeezam dikhata hoon.";
  return (
    <div ref={root} className="lp-root d5">
      <LPNav c={c} lang={lang} setLang={setLang} className="d5-nav" />
      <section ref={hero} className="d5-hero">
        <div className="lp-wrap d5-hero-in">
          <div className="d5-hero-txt">
            <div className="d5-bubble big" data-rv="up"><Typed text={hello} /></div>
            <h1 data-rv="up" style={{ "--d": "120ms" }}>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h1>
            <p data-rv="up" style={{ "--d": "200ms" }}>{c.hero.sub}</p>
            <div className="d5-cta" data-rv="up" style={{ "--d": "280ms" }}>
              <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
              <button className="lp-btn lp-btn-ghost" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>{lang === "en" ? "Take the tour" : "Tour shuru karein"}</button>
            </div>
          </div>
          <div className="d5-neezi-wrap" data-rv="scale">
            <div className="d5-glow" />
            <img className="d5-neezi" src="/brand/neezi/neezi-wave.webp" alt="Neezi" width="401" height="368" />
            <div className="d5-shadow" />
            {["package", "comment", "truck", "chart"].map((ic, i) => <span key={ic} className={`d5-orbit o${i}`}><Icon name={ic} size={16} /></span>)}
          </div>
        </div>
      </section>

      <section className="d5-tour" id="features">
        <div className="lp-wrap">
          {STOPS.map((k, i) => (
            <div key={k} ref={(el) => (rows.current[i] = el)} data-i={i} className={`d5-row ${i % 2 ? "rev" : ""} ${stop === i ? "on" : ""}`}>
              <div className="d5-row-txt" data-rv={i % 2 ? "right" : "left"}>
                <span className="d5-step">{String(i + 1).padStart(2, "0")} · {P[k].nav}</span>
                <h2>{P[k].title}</h2>
                <p>{P[k].sub}</p>
                <button className="d5-link" onClick={() => navigate(PAGE_PATH[k])}>{lang === "en" ? "See how it works" : "Tafseel dekhein"} <Icon name="arrowRight" size={12} /></button>
              </div>
              <div className="d5-row-app" data-rv="scale"><AppScreen screen={P[k].screen} /></div>
            </div>
          ))}
        </div>
      </section>

      <div id="how" />
      <HomeTail c={c} />

      <div className={`d5-walker ${stop >= 0 ? "show" : ""}`} style={{ "--w": walk }} aria-hidden="true">
        {stop >= 0 && <div className={`d5-bubble ${walk > 0.55 ? "flip" : ""}`}><Typed text={tips[stop]} /></div>}
        <img src="/brand/neezi/neezi-walk.webp" alt="" width="412" height="381" />
      </div>
    </div>
  );
}
