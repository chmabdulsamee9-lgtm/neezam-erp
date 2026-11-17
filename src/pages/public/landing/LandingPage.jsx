// Landing redesign (2026-11): 5 candidate designs, picked on the dev site with a floating switch.
// Production keeps design 0 (the current Home / Pricing) until the owner chooses one.
// Each design is its own lazy chunk (JS + CSS), so a visitor only downloads the design they see.
import { lazy, Suspense, useEffect, useState } from "react";
import { isDevEnv } from "../../../App";

export const DESIGNS = [
  { n: 0, label: "Abhi wala" },
  { n: 2, label: "Kahani" },
  { n: 11, label: "K1 Neezi" },
  { n: 12, label: "K2 Raat-Din" },
  { n: 13, label: "K3 Safar" },
  { n: 14, label: "K4 Deewar" },
  { n: 15, label: "K5 Puzzle" },
];
const KEY = "ne_landing_design";
const EVT = "ne-landing-design";
// the design production shows; change this once the owner picks one
export const PRODUCTION_DESIGN = 0;

const loaders = {
  2: lazy(() => import("./D2Story")),
  11: lazy(() => import("./K1Neezi")),
  12: lazy(() => import("./K2Subah")),
  13: lazy(() => import("./K3Safar")),
  14: lazy(() => import("./K4Deewar")),
  15: lazy(() => import("./K5Puzzle")),
};
// design used for brand-new pages while production still shows the old site (design 0)
export const FALLBACK_DESIGN = 2;
const DARK = new Set([2, 11, 12, 13, 14, 15]);

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
