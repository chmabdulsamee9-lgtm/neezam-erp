// Kahani K1 "Neezi ki Kahani": Neezi walks in, the business's scattered work rains down around him,
// the visitor asks Neezi to handle it, and everything flies into the live eNeezam app.
import { useRef, useState } from "react";
import Icon from "../../../components/Icon";
import { usePointerVars, useScrollProgress, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import Neezi from "./Neezi";
import { makeKahani } from "./KShell";

const ICONS = ["clipboard", "truck", "comment", "undo", "megaphone", "cash"];
const SPOTS = [[16, 30, -9], [80, 26, 8], [24, 58, 6], [74, 56, -7], [40, 22, 4], [60, 34, -4]];

function Story({ c, k, scroller }) {
  const sec = useRef(null), stage = useRef(null);
  const [ph, setPh] = useState(0);
  const [done, setDone] = useState(false);
  usePointerVars(stage, "window");
  useScrollProgress(sec, scroller, (p) => {
    const n = p < 0.3 ? 0 : p < 0.62 ? 1 : 2;
    setPh((o) => (o === n ? o : n));
    if (p > 0.985) setDone(true);
  });
  const handle = () => {
    setDone(true);
    const el = sec.current;
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: "smooth" });
  };
  const say = done ? k.done : ph === 0 ? k.hi : k.worry;
  return (
    <section ref={sec} className={`k-story k1-story ph${ph} ${done ? "done" : ""}`}>
      <div ref={stage} className="k-stage k1-stage">
        <div className="k-spot" />
        <div className="k1-title">
          <span className="lp-eyebrow">{c.hero.eyebrow}</span>
          <h1>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h1>
        </div>
        <div className="k1-rain" aria-hidden="true">
          {k.rain.map((r, i) => (
            <div key={r} className="k1-drop" style={{ "--i": i, "--x": `${SPOTS[i][0]}%`, "--y": `${SPOTS[i][1]}%`, "--r": `${SPOTS[i][2]}deg` }}>
              <Icon name={ICONS[i]} size={15} />{r}
            </div>
          ))}
        </div>
        <div className="k1-hero">
          <div className="k-bubble" key={say}>{say}</div>
          <Neezi size={190} pose={done ? "cheer" : ph === 0 ? "walk" : ph === 1 ? "idle" : "point"} />
        </div>
        <button className="k-cta-btn k1-btn" onClick={handle} tabIndex={ph === 2 && !done ? 0 : -1}>{k.btn} <Icon name="zap" size={15} /></button>
        <div className="k-after">
          <div className="k-after-head">
            <h2>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h2>
            <p>{c.story.after}</p>
            <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
          </div>
          <div className="k-after-app"><AppWindow screen="home" theme="dark" compact /></div>
        </div>
        <div className="d2-scrollhint"><span>{c.story.scroll}</span><i /></div>
      </div>
    </section>
  );
}

export default makeKahani("k1", Story, ["stats", "network", "features", "kinetic", "timeline"]);
