// Kahani K2 "Raat se Din": 2am, red alerts everywhere. As you scroll, Neezi rises like the sun, the night
// fades to morning and every alert turns into a solved task. Click "Subah karo" to jump to the morning.
import { useRef, useState } from "react";
import Icon from "../../../components/Icon";
import { usePointerVars, useScrollProgress, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import Neezi from "./Neezi";
import { makeKahani } from "./KShell";

function Story({ c, k, scroller }) {
  const sec = useRef(null), stage = useRef(null);
  const [fixed, setFixed] = useState(0);
  const [done, setDone] = useState(false);
  usePointerVars(stage, "window");
  useScrollProgress(sec, scroller, (p) => {
    const n = Math.max(0, Math.min(4, Math.floor((p - 0.25) / 0.11)));
    setFixed((o) => (o === n ? o : n));
    if (p > 0.985) setDone(true);
  });
  const morning = () => {
    setDone(true); setFixed(4);
    const el = sec.current;
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: "smooth" });
  };
  return (
    <section ref={sec} className={`k-story k2-story ${done ? "done" : ""}`}>
      <div ref={stage} className="k-stage k2-stage">
        <div className="k2-day" />
        <div className="k2-night"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="k-spot" />
        <h1 className="k2-h night">{k.night}</h1>
        <h1 className="k2-h day">{k.day} <span className="lp-grad-t">{c.hero.title2}</span></h1>
        <ul className="k2-alerts">
          {k.alerts.map((a, i) => (
            <li key={a} className={i < fixed ? "ok" : ""}>
              <span className="k2-ic"><Icon name={i < fixed ? "check" : "warning"} size={13} /></span>{i < fixed ? k.fixed[i] : a}
            </li>
          ))}
        </ul>
        <div className="k2-sun">
          <div className="k2-rays" />
          <Neezi size={200} pose={done || fixed >= 4 ? "cheer" : "wave"} />
        </div>
        <button className="k-cta-btn k2-btn" onClick={morning} tabIndex={done ? -1 : 0}>{k.btn} <Icon name="sparkle" size={15} /></button>
        <div className="k-after">
          <div className="k-after-head">
            <h2>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h2>
            <p>{c.story.after}</p>
            <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
          </div>
          <div className="k-after-app"><AppWindow screen="home" theme="dark" compact /></div>
        </div>
        <div className="d2-scrollhint k2-hint"><span>{c.story.scroll}</span><i /></div>
      </div>
    </section>
  );
}

export default makeKahani("k2", Story, ["kinetic", "network", "features", "timeline"]);
