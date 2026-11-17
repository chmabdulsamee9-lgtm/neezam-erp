// Kahani K5 "Puzzle": the real eNeezam app is cut into 12 pieces scattered across the screen. Scrolling
// pulls them together; Neezi holds the last piece and places it when the visitor asks.
import { useRef, useState } from "react";
import Icon from "../../../components/Icon";
import { useScrollProgress, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import Neezi from "./Neezi";
import { makeKahani } from "./KShell";

const COLS = 4, ROWS = 3;
const rnd = (i, s) => (((i * 7919 + s * 104729) % 9973) / 9973) * 2 - 1;

function Story({ c, k, scroller }) {
  const sec = useRef(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  useScrollProgress(sec, scroller, (p) => {
    const r = p > 0.72;
    setReady((o) => (o === r ? o : r));
    if (p > 0.985) setDone(true);
  });
  const place = () => {
    setDone(true);
    const el = sec.current;
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: "smooth" });
  };
  const last = COLS * ROWS - 1;
  return (
    <section ref={sec} className={`k-story k5-story ${done ? "done" : ""}`}>
      <div className="k-stage k5-stage">
        <div className="k5-head">
          <h1>{done ? k.done : k.title}</h1>
          <p>{done ? c.story.after : k.sub}</p>
          {done && <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>}
        </div>
        <div className="k5-board">
          {Array.from({ length: COLS * ROWS }, (_, i) => {
            const col = i % COLS, row = Math.floor(i / COLS);
            return (
              <div key={i} className={`k5-tile ${i === last ? "last" : ""}`}
                style={{ "--col": col, "--row": row, "--sx": `${rnd(i, 1) * 60}vw`, "--sy": `${rnd(i, 2) * 45}vh`, "--sr": `${rnd(i, 3) * 40}deg`, "--i": i }}>
                <div className="k5-inner"><AppWindow screen="home" live={false} /></div>
              </div>
            );
          })}
        </div>
        <div className="k5-neezi"><Neezi size={140} pose={done ? "cheer" : ready ? "point" : "wave"} /></div>
        <button className="k-cta-btn k5-btn" onClick={place} tabIndex={ready && !done ? 0 : -1}>{k.btn} <Icon name="sparkle" size={15} /></button>
      </div>
    </section>
  );
}

export default makeKahani("k5", Story, ["stats", "kinetic", "network", "timeline", "features"]);
