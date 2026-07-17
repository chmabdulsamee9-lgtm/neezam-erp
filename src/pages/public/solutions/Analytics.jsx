import SolutionPageLayout from "./SolutionPageLayout";

const FEATURES = [
  { icon: "trending", titleKey: "mkt.sol.analytics.f1.title", descKey: "mkt.sol.analytics.f1.desc" },
  { icon: "map", titleKey: "mkt.sol.analytics.f2.title", descKey: "mkt.sol.analytics.f2.desc" },
  { icon: "chart", titleKey: "mkt.sol.analytics.f3.title", descKey: "mkt.sol.analytics.f3.desc" },
  { icon: "truck", titleKey: "mkt.sol.analytics.f4.title", descKey: "mkt.sol.analytics.f4.desc" },
];

export default function Analytics() {
  return (
    <SolutionPageLayout
      icon="chart"
      titleKey="mkt.sol.analytics.title"
      subtitleKey="mkt.sol.analytics.subtitle"
      features={FEATURES}
      noteKey="mkt.sol.analytics.note"
    />
  );
}
