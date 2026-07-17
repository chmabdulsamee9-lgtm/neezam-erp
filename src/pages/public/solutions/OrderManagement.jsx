import SolutionPageLayout from "./SolutionPageLayout";

const FEATURES = [
  { icon: "refresh", titleKey: "mkt.sol.orders.f1.title", descKey: "mkt.sol.orders.f1.desc" },
  { icon: "check", titleKey: "mkt.sol.orders.f2.title", descKey: "mkt.sol.orders.f2.desc" },
  { icon: "edit", titleKey: "mkt.sol.orders.f3.title", descKey: "mkt.sol.orders.f3.desc" },
  { icon: "comment", titleKey: "mkt.sol.orders.f4.title", descKey: "mkt.sol.orders.f4.desc" },
  { icon: "activity-log", titleKey: "mkt.sol.orders.f5.title", descKey: "mkt.sol.orders.f5.desc" },
];

export default function OrderManagement() {
  return (
    <SolutionPageLayout
      icon="package"
      titleKey="mkt.sol.orders.title"
      subtitleKey="mkt.sol.orders.subtitle"
      features={FEATURES}
      noteKey="mkt.sol.orders.note"
    />
  );
}
