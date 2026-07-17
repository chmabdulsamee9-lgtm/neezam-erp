import SolutionPageLayout from "./SolutionPageLayout";

const FEATURES = [
  { icon: "zap", titleKey: "mkt.sol.courier.f1.title", descKey: "mkt.sol.courier.f1.desc" },
  { icon: "close", titleKey: "mkt.sol.courier.f2.title", descKey: "mkt.sol.courier.f2.desc" },
  { icon: "printer", titleKey: "mkt.sol.courier.f3.title", descKey: "mkt.sol.courier.f3.desc" },
  { icon: "refresh", titleKey: "mkt.sol.courier.f4.title", descKey: "mkt.sol.courier.f4.desc" },
];

export default function CourierIntegration() {
  return (
    <SolutionPageLayout
      icon="truck"
      titleKey="mkt.sol.courier.title"
      subtitleKey="mkt.sol.courier.subtitle"
      features={FEATURES}
      noteKey="mkt.sol.courier.note"
    />
  );
}
