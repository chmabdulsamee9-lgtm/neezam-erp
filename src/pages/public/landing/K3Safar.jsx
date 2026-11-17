// Kahani K3 "Parcel ka Safar": one parcel travels a winding road as you scroll, from the order to the
// customer's door, with Neezi walking behind it. Each stop lights up; at the end the profit lands with Neezi.
import { useRef, useState } from "react";
import Icon from "../../../components/Icon";
import { useScrollProgress, Magnet, goSignup } from "./shared";
import { AppWindow } from "./AppUI";
import Neezi from "./Neezi";
import { makeKahani } from "./KShell";

const ROAD = "M60 430 C 200 430, 230 170, 380 175 S 560 430, 690 400 S 860 150, 950 170";
const STOPS = [0, 0.26, 0.5, 0.74, 1];
const STOP_ICONS = ["package", "comment", "truck", "home", "cash"];

function Story({ c, k, scroller }) {
  const sec = useRef(null), road = useRef(null), parcel = useRef(null), walker = useRef(null);
  const [lit, setLit] = useState(0);
  const [done, setDone] = useState(false);
  const [pts, setPts] = useState(null);
  const ptsSet = useRef(false);
  useScrollProgress(sec, scroller, (p) => {
    const path = road.current;
    if (!path) return;
    const len = path.getTotalLength();
    if (!ptsSet.current) { ptsSet.current = true; setPts(STOPS.map((s) => { const q = path.getPointAtLength(s * len); return [q.x, q.y]; })); }
    const t = Math.min(1, Math.max(0, (p - 0.08) / 0.82));
    const a = path.getPointAtLength(t * len), b = path.getPointAtLength(Math.max(0, t - 0.06) * len);
    parcel.current?.setAttribute("transform", `translate(${a.x - 22} ${a.y - 44})`);
    walker.current?.setAttribute("transform", `translate(${b.x - 40} ${b.y - 96})`);
    const n = STOPS.filter((s) => t >= s - 0.01).length;
    setLit((o) => (o === n ? o : n));
    if (p > 0.985) setDone(true);
  });
  const deliver = () => {
    setDone(true);
    const el = sec.current;
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight, behavior: "smooth" });
  };
  return (
    <section ref={sec} className={`k-story k3-story ${done ? "done" : ""}`}>
      <div className="k-stage k3-stage">
        <div className="k3-head">
          <span className="lp-eyebrow">{k.title}</span>
          <h1>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h1>
        </div>
        <svg className="k3-map" viewBox="0 0 1000 560" aria-hidden="true">
          <path d={ROAD} className="k3-road-bg" />
          <path ref={road} d={ROAD} className="k3-road" />
          {pts && pts.map(([x, y], i) => (
            <g key={i} className={`k3-stop ${i < lit ? "on" : ""}`} transform={`translate(${x} ${y})`}>
              <circle r="26" className="k3-stop-c" />
              <foreignObject x="-12" y="-12" width="24" height="24"><div className="k3-stop-ic"><Icon name={STOP_ICONS[i]} size={16} /></div></foreignObject>
              <text y={i % 2 ? 56 : -42} className="k3-stop-t">{k.stops[i]}</text>
            </g>
          ))}
          <g ref={walker} transform="translate(20 334)"><Neezi size={80} pose={done ? "cheer" : "walk"} /></g>
          <g ref={parcel} transform="translate(38 386)" className="k3-parcel">
            <rect width="44" height="38" rx="6" /><path d="M0 12 H44 M22 0 V38" /><rect x="15" y="-2" width="14" height="10" rx="2" className="tape" />
          </g>
        </svg>
        <button className="k-cta-btn k3-btn" onClick={deliver} tabIndex={done ? -1 : 0}>{k.btn} <Icon name="truck" size={15} /></button>
        <div className="k-after">
          <div className="k-after-head">
            <span className="k3-done">{k.done}</span>
            <h2>{c.hero.title1} <span className="lp-grad-t">{c.hero.title2}</span></h2>
            <Magnet className="lp-btn" onClick={goSignup}>{c.hero.cta} <Icon name="arrowRight" size={14} /></Magnet>
          </div>
          <div className="k-after-app"><AppWindow screen="booked" theme="dark" compact /></div>
        </div>
        <div className="k3-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</div>
      </div>
    </section>
  );
}

export default makeKahani("k3", Story, ["network", "timeline", "kinetic", "features"]);
