// Design 7 "Neezi World": Neezi stands in the middle of a 3D ring of eNeezam's features. Scroll (and the
// mouse) spins the ring; click any feature to open its real app screen.
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../../components/Icon";
import { LPNav, Magnet, goSignup, useScrollProgress, usePointerVars } from "./shared";
import { AppScreen } from "./AppUI";
import { ContentShell, HomeTail, useHomeRoot } from "./ContentPage";
import { PAGES, PAGE_PATH, PAGE_ICONS } from "./pages";
import "./d7.css";

const RING = ["orders", "whatsapp", "courier", "returns", "ads", "finance", "store", "neezi"];

export default function D7NeeziWorld({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d7" navClass="d7-nav" />;
  return <D7Home />;
}

function D7Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  const navigate = useNavigate();
  const P = PAGES[lang === "en" ? "en" : "ur"];
  const world = useRef(null);
  const [front, setFront] = useState(0);
  const [open, setOpen] = useState(null);
  usePointerVars(world, "window");
  useScrollProgress(world, root, (p) => {
    const f = ((Math.round(p * RING.length * 1.0) % RING.length) + RING.length) % RING.length;
    setFront((o) => { if (o !== f) setOpen(null); return f; });
  });
  const k = open || RING[front];
  return (
    <div ref={root} className="lp-root d7">
      <LPNav c={c} lang={lang} setLang={setLang} className="d7-nav" />
      <section ref={world} className="d7-world" id="features">
        <div className="d7-pin">
          <div className="d7-sky" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className="d7-title">
            <h1>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h1>
            <p>{lang === "en" ? "Scroll to spin Neezi's world. Click any part to open it." : "Scroll karein, Neezi ki duniya ghoomegi. Kisi bhi hisse par click karein."}</p>
          </div>
          <div className="d7-stage">
            <div className="d7-ring">
              {RING.map((r, i) => (
                <button key={r} className={`d7-card ${RING[front] === r ? "front" : ""}`} style={{ "--i": i }} onClick={() => setOpen(r)}>
                  <span><Icon name={PAGE_ICONS[r]} size={18} /></span><b>{P[r].nav}</b>
                </button>
              ))}
            </div>
            <img className="d7-neezi" src="/brand/neezi/neezi-wave.webp" alt="Neezi" width="401" height="368" />
            <div className="d7-floor" />
          </div>
          <div className="d7-panel" key={k}>
            <div className="d7-panel-txt">
              <span>{P[k].nav}</span>
              <h2>{P[k].title}</h2>
              <div className="d7-panel-act">
                <Magnet className="lp-btn lp-btn-sm" onClick={goSignup}>{c.hero.cta}</Magnet>
                <button className="d7-link" onClick={() => navigate(PAGE_PATH[k])}>{lang === "en" ? "Details" : "Tafseel"} <Icon name="arrowRight" size={12} /></button>
              </div>
            </div>
            <div className="d7-panel-app"><AppScreen screen={P[k].screen} /></div>
          </div>
        </div>
      </section>
      <div id="how" />
      <HomeTail c={c} />
    </div>
  );
}
