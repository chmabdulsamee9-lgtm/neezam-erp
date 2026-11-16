// Route wrapper: on the dev site (or once a design is live) a public page renders in the chosen design;
// otherwise the old page component stays, and pages that never existed use FALLBACK_DESIGN.
import LandingPage, { useLandingDesign, DesignSwitch, FALLBACK_DESIGN } from "./LandingPage";

export function withLanding(Old, page) {
  return function LandingRoute() {
    const design = useLandingDesign();
    if (design) return <LandingPage design={design} page={page} />;
    if (!Old) return <LandingPage design={FALLBACK_DESIGN} page={page} />;
    return (<><Old /><DesignSwitch current={0} /></>);
  };
}
