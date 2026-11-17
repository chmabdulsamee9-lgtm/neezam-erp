// Neezi, eNeezam's mascot, drawn in code (SVG) so it stays sharp at any size and can move:
// eyes follow the cursor, blinks, waves, walks, cheers. Matches the mascot sheet (purple cube, dark
// forehead panel with the eNeezam line logo, round white eyes, short arms and legs).
import { useEffect, useId, useRef } from "react";
import "./neezi.css";

// pose: "wave" | "walk" | "idle" | "cheer" | "point"
export default function Neezi({ size = 200, pose = "wave", look = true, className = "", style }) {
  const uid = useId().replace(/:/g, "");
  const svg = useRef(null);
  const pl = useRef(null), pr = useRef(null);
  useEffect(() => {
    if (!look) return;
    const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    if (!fine || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, x = 0, y = 0;
    const apply = () => {
      raf = 0;
      const r = svg.current?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.42;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 260) * 4.2;
      const t = `translate(${((dx / d) * k).toFixed(2)}px, ${((dy / d) * k).toFixed(2)}px)`;
      if (pl.current) pl.current.style.transform = t;
      if (pr.current) pr.current.style.transform = t;
    };
    const move = (e) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); if (raf) cancelAnimationFrame(raf); };
  }, [look]);
  const g = (n) => `nz-${n}-${uid}`;
  return (
    <svg ref={svg} className={`neezi pose-${pose} ${className}`} style={style} width={size} height={size * 1.1} viewBox="0 0 200 220" role="img" aria-label="Neezi">
      <defs>
        <linearGradient id={g("body")} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B65CF3" />
          <stop offset=".55" stopColor="#7C6BF6" />
          <stop offset="1" stopColor="#4F6EF6" />
        </linearGradient>
        <radialGradient id={g("shine")} cx=".28" cy=".22" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".32" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("shade")} x1="0" y1="0" x2="1" y2="1">
          <stop offset=".55" stopColor="#1b1450" stopOpacity="0" />
          <stop offset="1" stopColor="#1b1450" stopOpacity=".28" />
        </linearGradient>
        <linearGradient id={g("limb")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6368F2" />
          <stop offset="1" stopColor="#4C5BE8" />
        </linearGradient>
        <filter id={g("glow")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      <ellipse className="nz-shadow" cx="100" cy="210" rx="52" ry="7" fill="#1b1450" opacity=".18" />

      <g className="nz-bounce">
        {/* legs */}
        <g className="nz-leg nz-leg-l"><rect x="70" y="150" width="20" height="44" rx="10" fill={`url(#${g("limb")})`} /><ellipse cx="78" cy="196" rx="15" ry="8" fill="#4C5BE8" /></g>
        <g className="nz-leg nz-leg-r"><rect x="110" y="150" width="20" height="44" rx="10" fill={`url(#${g("limb")})`} /><ellipse cx="122" cy="196" rx="15" ry="8" fill="#4C5BE8" /></g>

        {/* left arm (hangs, swings when walking) */}
        <g className="nz-arm-l"><path d="M38 96 Q16 122 22 150" fill="none" stroke={`url(#${g("limb")})`} strokeWidth="15" strokeLinecap="round" /><ellipse cx="23" cy="153" rx="9" ry="10" fill="#5562EE" /></g>

        {/* body */}
        <rect x="28" y="18" width="144" height="140" rx="36" fill={`url(#${g("body")})`} />
        <rect x="28" y="18" width="144" height="140" rx="36" fill={`url(#${g("shade")})`} />
        <rect x="28" y="18" width="144" height="140" rx="36" fill={`url(#${g("shine")})`} />

        {/* forehead panel with the eNeezam line logo */}
        <path d="M80 19 H120 V48 Q120 60 108 60 H92 Q80 60 80 48 Z" fill="#1F1A4E" />
        <g filter={`url(#${g("glow")})`} className="nz-logo">
          <path d="M88 50 L96 40 L103 45 L112 33" fill="none" stroke="#8CE6FF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="88" cy="50" r="2.4" fill="#8CE6FF" /><circle cx="96" cy="40" r="2.4" fill="#8CE6FF" /><circle cx="103" cy="45" r="2.4" fill="#8CE6FF" /><circle cx="112" cy="33" r="2.4" fill="#8CE6FF" />
        </g>

        {/* face */}
        <path d="M66 76 Q76 69 86 74" fill="none" stroke="#1B1640" strokeWidth="3" strokeLinecap="round" />
        <path d="M114 74 Q124 69 134 76" fill="none" stroke="#1B1640" strokeWidth="3" strokeLinecap="round" />
        <g className="nz-eyes">
          <circle cx="77" cy="94" r="12.5" fill="#fff" />
          <circle cx="123" cy="94" r="12.5" fill="#fff" />
          <g ref={pl} className="nz-pupil"><circle cx="77" cy="95" r="7" fill="#1B1640" /><circle cx="74.5" cy="92.2" r="2.2" fill="#fff" /></g>
          <g ref={pr} className="nz-pupil"><circle cx="123" cy="95" r="7" fill="#1B1640" /><circle cx="120.5" cy="92.2" r="2.2" fill="#fff" /></g>
        </g>
        <path className="nz-mouth" d="M84 120 Q100 133 116 120" fill="none" stroke="#1B1640" strokeWidth="4" strokeLinecap="round" />

        {/* right arm (waves / points / cheers) */}
        <g className="nz-arm-r">
          <path d="M164 98 Q188 84 188 58" fill="none" stroke={`url(#${g("limb")})`} strokeWidth="15" strokeLinecap="round" />
          <ellipse cx="188" cy="50" rx="10" ry="11" fill="#5562EE" />
          <ellipse cx="179" cy="56" rx="4" ry="6" fill="#5562EE" transform="rotate(-30 179 56)" />
        </g>
      </g>
    </svg>
  );
}
