// Shared "Solutions" sub-nav definition — PublicHeader (dropdown), PublicFooter
// (Quick Links column), aur Home.jsx (preview cards) teeno isi ek list ko reuse
// karte hain taake naya solution add karte waqt sirf ek jagah update karni pade.
export const SOLUTIONS_LINKS = [
  { path: "/solutions/orders", labelKey: "mkt.nav.solutions.orders", icon: "package" },
  { path: "/solutions/courier", labelKey: "mkt.nav.solutions.courier", icon: "truck" },
  { path: "/solutions/courier-network", labelKey: "mkt.nav.solutions.courierNetwork", icon: "map" },
  { path: "/solutions/analytics", labelKey: "mkt.nav.solutions.analytics", icon: "chart" },
  { path: "/solutions/products", labelKey: "mkt.nav.solutions.products", icon: "inventory" },
  { path: "/solutions/ads", labelKey: "mkt.nav.solutions.ads", icon: "megaphone" },
  // Data-driven solution: no component needed. `page` feeds DataSolution (solutions/DataSolution.jsx) and App.jsx builds the route from it.
  {
    path: "/solutions/meta", labelKey: "mkt.nav.solutions.meta", icon: "megaphone", blurbKey: "mkt.home.solution.meta.blurb",
    page: {
      titleKey: "mkt.sol.meta.title", subtitleKey: "mkt.sol.meta.subtitle", noteKey: "mkt.sol.meta.note",
      features: [
        { icon: "link", titleKey: "mkt.sol.meta.f1.title", descKey: "mkt.sol.meta.f1.desc" },
        { icon: "chart", titleKey: "mkt.sol.meta.f2.title", descKey: "mkt.sol.meta.f2.desc" },
        { icon: "zap", titleKey: "mkt.sol.meta.f3.title", descKey: "mkt.sol.meta.f3.desc" },
      ],
      infoTitleKey: "mkt.sol.meta.permTitle", infoBodyKey: "mkt.sol.meta.permBody",
      links: [{ path: "/privacy", labelKey: "mkt.footer.privacy" }, { path: "/data-deletion", labelKey: "mkt.footer.dataDeletion" }],
    },
  },
];
