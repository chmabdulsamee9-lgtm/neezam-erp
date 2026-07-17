import SolutionPageLayout from "./SolutionPageLayout";

const FEATURES = [
  { icon: "refresh", titleKey: "mkt.sol.products.f1.title", descKey: "mkt.sol.products.f1.desc" },
  { icon: "edit", titleKey: "mkt.sol.products.f2.title", descKey: "mkt.sol.products.f2.desc" },
  { icon: "inventory", titleKey: "mkt.sol.products.f3.title", descKey: "mkt.sol.products.f3.desc" },
  { icon: "package", titleKey: "mkt.sol.products.f4.title", descKey: "mkt.sol.products.f4.desc" },
];

export default function ProductsInventory() {
  return (
    <SolutionPageLayout
      icon="inventory"
      titleKey="mkt.sol.products.title"
      subtitleKey="mkt.sol.products.subtitle"
      features={FEATURES}
      noteKey="mkt.sol.products.note"
    />
  );
}
