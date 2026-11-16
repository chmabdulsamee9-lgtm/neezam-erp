// Landing redesign (2026-11): 5 candidate designs, picked on the dev site with a floating switch.
// Production keeps design 0 (the current Home / Pricing) until the owner chooses one.
// Each design is its own lazy chunk (JS + CSS), so a visitor only downloads the design they see.
import { lazy, Suspense, useEffect, useState } from "react";
import { isDevEnv } from "../../../App";

export const DESIGNS = [
  { n: 0, label: "Abhi wala" },
  { n: 1, label: "1 Classic+" },
  { n: 2, label: "2 Kahani" },
  { n: 3, label: "3 Live Tour" },
  { n: 4, label: "4 Dark" },
  { n: 5, label: "5 Neezi Guide" },
  { n: 6, label: "6 Neezi Chat" },
  { n: 7, label: "7 Neezi World" },
  { n: 8, label: "8 Network" },
  { n: 9, label: "9 Kinetic" },
  { n: 10, label: "10 Stack" },
];
const KEY = "ne_landing_design";
const EVT = "ne-landing-design";
// the design production shows; change this once the owner picks one
export const PRODUCTION_DESIGN = 0;

const loaders = {
  1: lazy(() => import("./D1Classic")),
  2: lazy(() => import("./D2Story")),
  3: lazy(() => import("./D3Tour")),
  4: lazy(() => import("./D4Dark")),
  5: lazy(() => import("./D5NeeziGuide")),
  6: lazy(() => import("./D6NeeziChat")),
  7: lazy(() => import("./D7NeeziWorld")),
  8: lazy(() => import("./D8Network")),
  9: lazy(() => import("./D9Kinetic")),
  10: lazy(() => import("./D10Stack")),
};
// design used for brand-new pages while production still shows the old site (design 0)
export const FALLBACK_DESIGN = 1;
const DARK = new Set([2, 4, 6, 8]);

function readDesign() {
  if (!isDevEnv()) return PRODUCTION_DESIGN;
  try {
    const q = new URLSearchParams(window.location.search).get("design");
    if (q !== null && DESIGNS.some((d) => String(d.n) === q)) { localStorage.setItem(KEY, q); return Number(q); }
    const s = localStorage.getItem(KEY);
    if (s !== null && DESIGNS.some((d) => String(d.n) === s)) return Number(s);
  } catch { /* storage blocked */ }
  return 2;
}

export function useLandingDesign() {
  const [d, setD] = useState(readDesign);
  useEffect(() => {
    const on = () => setD(readDesign());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return d;
}

function setDesign(n) {
  try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ }
  const u = new URL(window.location.href);
  u.searchParams.delete("design");
  window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  window.dispatchEvent(new Event(EVT));
}

export function DesignSwitch({ current }) {
  const [hidden, setHidden] = useState(false);
  // floating navs sit below the switch while it is open
  useEffect(() => {
    if (!isDevEnv()) return;
    document.documentElement.style.setProperty("--lp-dev", hidden ? "34px" : "48px");
    return () => document.documentElement.style.removeProperty("--lp-dev");
  }, [hidden]);
  if (!isDevEnv()) return null;
  if (hidden) return <button className="lp-switch-mini" onClick={() => setHidden(false)}>Design {current || "0"}</button>;
  return (
    <div className="lp-switch" role="toolbar" aria-label="Design">
      <span>DEV · Design</span>
      {DESIGNS.map((d) => <button key={d.n} className={d.n === current ? "on" : ""} onClick={() => setDesign(d.n)}>{d.label}</button>)}
      <button className="x" onClick={() => setHidden(true)} aria-label="Hide">✕</button>
    </div>
  );
}

let fontsAdded = false;
function useLandingFonts() {
  useEffect(() => {
    if (fontsAdded) return;
    fontsAdded = true;
    const add = (attrs) => { const l = document.createElement("link"); Object.assign(l, attrs); document.head.appendChild(l); };
    add({ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" });
    add({ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=Instrument+Serif:ital@0;1&display=swap" });
  }, []);
}

// page: "home" | "pricing" | "about" | "contact" | "p:<slug>"
export default function LandingPage({ design, page }) {
  useLandingFonts();
  const Design = loaders[design];
  return (
    <>
      <Suspense fallback={<div style={{ height: "100dvh", background: DARK.has(design) ? "#070A1A" : "#fff" }} />}>
        <Design page={page} />
      </Suspense>
      <DesignSwitch current={design} />
    </>
  );
}
