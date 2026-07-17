import SolutionPageLayout from "./SolutionPageLayout";

const FEATURES = [
  { icon: "zap", titleKey: "mkt.sol.ads.f1.title", descKey: "mkt.sol.ads.f1.desc" },
  { icon: "megaphone", titleKey: "mkt.sol.ads.f2.title", descKey: "mkt.sol.ads.f2.desc" },
  { icon: "trending", titleKey: "mkt.sol.ads.f3.title", descKey: "mkt.sol.ads.f3.desc" },
];

export default function AIAds() {
  return (
    <SolutionPageLayout
      icon="megaphone"
      titleKey="mkt.sol.ads.title"
      subtitleKey="mkt.sol.ads.subtitle"
      features={FEATURES}
      noteKey="mkt.sol.ads.note"
    />
  );
}
