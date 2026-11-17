// Design 2 "Kahani": a scroll story. SOCHO -> the scattered business -> split screen -> the visitor
// clicks "Neezam karo" and the pieces snap into the live eNeezam app. Then: features, the Neezi network,
// kinetic words, the order timeline, pricing and Neezi's CTA. Normal mouse cursor; effects follow it.
import { useRef, useState } from "react";
import Icon from "../../../components/Icon";
import { usePointerVars, useScrollProgress, LPNav, CountUp, Scramble, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import { ContentShell, useHomeRoot } from "./ContentPage";
import { FeatureGrid, NetworkFlow, KineticRows, Timeline, StoryTail, Marquee } from "./StoryKit";
import "./d2.css";

const PIECES = [
  { x: 14, y: 24, r: -8, z: 1.2, icon: "clipboard", k: 0 },
  { x: 84, y: 20, r: 7, z: 0.8, icon: "truck", k: 1 },
  { x: 10, y: 70, r: 6, z: 1, icon: "comment", k: 2 },
  { x: 88, y: 66, r: -6, z: 1.3, icon: "megaphone", k: 3 },
  { x: 30, y: 86, r: -4, z: 0.7, icon: "calculator", k: 4 },
  { x: 70, y: 88, r: 5, z: 0.9, icon: "undo", k: 5 },
  { x: 28, y: 12, r: 4, z: 0.6, icon: "shop", k: 6 },
  { x: 68, y: 9, r: -5, z: 1.1, icon: "cash", k: 7 },
];

export function Story({ c, scroller }) {
  const sec = useRef(null), stage = useRef(null);
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(false);
  usePointerVars(stage, "window");
  useScrollProgress(sec, scroller, (p) => {
    const ph = p < 0.22 ? 0 : p < 0.5 ? 1 : p < 0.7 ? 2 : 3;
    setPhase((o) => (o === ph ? o : ph));
    if (p > 0.985) setDone(true);
  });
  const neezam = () => {
    setDone(true);
    const el = sec.current;
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: "smooth" });
  };
  return (
    <section ref={sec} className={`d2-story ph${phase} ${done ? "done" : ""}`} id="top">
      <div ref={stage} className="d2-stage">
        <div className="d2-spot" />
        <div className="d2-imagine">
          <div className="d2-echo e1" aria-hidden="true">{c.story.imagine}</div>
          <div className="d2-echo e2" aria-hidden="true">{c.story.imagine}</div>
          <h1 className="d2-big"><Scramble text={c.story.imagine} /></h1>
          <p className="d2-imagine-sub">{c.story.imagineSub}</p>
        </div>
        <div className="d2-pieces" aria-hidden="true">
          {PIECES.map((p, i) => (
            <div key={i} className="d2-piece" style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--r": `${p.r}deg`, "--z": p.z, "--k": p.k }}>
              <Icon name={p.icon} size={15} /><span>{c.story.chaos[i]}</span>
            </div>
          ))}
        </div>
        <div className="d2-lines">
          <div className="d2-lines-k">{c.story.chaosTitle}</div>
          {c.story.chaosLines.map((l, i) => <p key={l} style={{ "--i": i }}>{l}</p>)}
        </div>
        <div className="d2-navy">
          <div className="d2-navy-in">
            <div className="d2-navy-k">{c.story.chaosTitle}</div>
            <div className="d2-navy-t">{c.story.barrier}</div>
          </div>
        </div>
        <button className="d2-break" onClick={neezam} tabIndex={phase >= 3 && !done ? 0 : -1}>
          <i className="wedge" aria-hidden="true" />
          <span className="s">{c.story.clickTo}</span>
          <span className="b">{c.story.break}</span>
        </button>
        <div className="d2-after">
          <div className="d2-after-head">
            <span className="lp-eyebrow">{c.hero.eyebrow}</span>
            <h2>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h2>
            <p>{c.story.after}</p>
            <div className="d2-after-cta">
              <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
            </div>
          </div>
          <div className="d2-after-dash"><AppWindow screen="home" theme="dark" compact /></div>
        </div>
        <div className="d2-scrollhint"><span>{c.story.scroll}</span><i /></div>
      </div>
    </section>
  );
}

export function Stats({ c }) {
  return (
    <section className="lp-sec d2-stats">
      <div className="lp-wrap d2-stats-in">
        {c.stats.map((s, i) => (
          <div key={s.l} data-rv="up" style={{ "--d": `${i * 90}ms` }}>
            <strong className="lp-grad-t">{/^\d+$/.test(s.n) ? <CountUp to={s.n} /> : s.n}</strong>
            <span>{s.l}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function D2Story({ page }) {
  if (page !== "home") return <ContentShell page={page} rootClass="d2" navClass="d2-nav" appTheme="dark" logoDark />;
  return <D2Home />;
}

function D2Home() {
  const { c, lang, setLang, root } = useHomeRoot();
  return (
    <div ref={root} className="lp-root d2">
      <LPNav c={c} lang={lang} setLang={setLang} className="d2-nav" logoDark />
      <Story c={c} scroller={root} />
      <Marquee />
      <Stats c={c} />
      <FeatureGrid c={c} />
      <NetworkFlow lang={lang} />
      <KineticRows scroller={root} />
      <Timeline c={c} scroller={root} />
      <StoryTail c={c} />
    </div>
  );
}
