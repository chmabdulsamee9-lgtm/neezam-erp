// Public marketing site (Nov 2026): the "Kahani" design (D2Story) on every public page.
// PRODUCTION_DESIGN 0 would bring back the old Home / Pricing / About pages.
import { lazy, Suspense, useEffect } from "react";

export const PRODUCTION_DESIGN = 2;
export const FALLBACK_DESIGN = 2;

const loaders = {
  2: lazy(() => import("./D2Story")),
};

export function useLandingDesign() {
  return PRODUCTION_DESIGN;
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
  const Design = loaders[design] || loaders[FALLBACK_DESIGN];
  return (
    <Suspense fallback={<div style={{ height: "100dvh", background: "#070A1A" }} />}>
      <Design page={page} />
    </Suspense>
  );
}
