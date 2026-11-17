// Kahani K4 "Deewar": brick by brick, the problems build a wall as you scroll; cracks appear; the visitor
// tells Neezi to break it, the bricks fly apart and the live eNeezam app is behind it.
import { useRef, useState } from "react";
import Icon from "../../../components/Icon";
import { usePointerVars, useScrollProgress, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import Neezi from "./Neezi";
import { makeKahani } from "./KShell";

const rnd = (i, s) => (((i * 9301 + s * 49297) % 233280) / 233280) * 2 - 1;

function Story({ c, k, scroller }) {
  const sec = useRef(null), stage = useRef(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  usePointerVars(stage, "window");
  useScrollProgress(sec, scroller, (p) => {
    const r = p > 0.6;
    setReady((o) => (o === r ? o : r));
    if (p > 0.985) setDone(true);
  });
  const smash = () => {
    setDone(true);
    const el = sec.current;
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: "smooth" });
  };
  return (
    <section ref={sec} className={`k-story k4-story ${done ? "done" : ""}`}>
      <div ref={stage} className="k-stage k4-stage">
        <div className="k-spot" />
        <h1 className="k4-title">{k.title}</h1>
        <div className="k4-zone">
          <div className="k4-behind"><AppWindow screen="orders" theme="dark" compact /></div>
          <div className="k4-wall">
            {k.bricks.map((b, i) => (
              <div key={b} className="k4-brick" style={{ "--i": i, "--ex": `${rnd(i, 1) * 70}vw`, "--ey": `${rnd(i, 2) * 70}vh`, "--er": `${rnd(i, 3) * 160}deg` }}>{b}</div>
            ))}
            <svg className="k4-cracks" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true">
              <path d="M200 0 L188 50 L214 92 L190 140 L210 240" /><path d="M188 50 L130 70 L96 120" /><path d="M214 92 L280 110 L330 90" /><path d="M190 140 L140 180" />
            </svg>
          </div>
        </div>
        <div className="k4-neezi"><Neezi size={150} pose={done ? "cheer" : ready ? "point" : "idle"} /></div>
        <button className="k-cta-btn k4-btn" onClick={smash} tabIndex={ready && !done ? 0 : -1}>{k.btn} <Icon name="zap" size={15} /></button>
        <div className="k4-after">
          <span>{k.done}</span>
          <h2>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h2>
          <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
        </div>
        <div className="d2-scrollhint"><span>{c.story.scroll}</span><i /></div>
      </div>
    </section>
  );
}

export default makeKahani("k4", Story, ["marquee", "features", "kinetic", "network", "timeline"]);
