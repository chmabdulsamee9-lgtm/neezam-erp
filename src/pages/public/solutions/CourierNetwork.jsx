import { useLanguage, useTranslation } from "../../../i18n";
import Icon from "../../../components/Icon";
import SolutionPageLayout from "./SolutionPageLayout";

const COURIER_PARTNERS = [
  { name: "Daraz Express (Dex)", color: "#5C7CFA" },
  { name: "BlueEx", color: "#3B82F6" },
  { name: "TCS", color: "#FB923C" },
  { name: "Leopards", color: "#34D88E" },
  { name: "PostEx", color: "#A855F7" },
  { name: "M&P", color: "#F472B6" },
  { name: "Trax", color: "#F2A83E" },
];

export default function CourierNetwork() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);

  return (
    <SolutionPageLayout
      icon="map"
      titleKey="mkt.sol.courierNetwork.title"
      subtitleKey="mkt.sol.courierNetwork.subtitle"
      noteKey="mkt.sol.courierNetwork.note"
    >
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 12 }}>
          {t("mkt.sol.courierNetwork.partnersTitle")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {COURIER_PARTNERS.map((c) => (
            <div key={c.name} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${c.color}55`, background: `${c.color}18`, color: c.color, fontSize: 13, fontWeight: 700 }}>
              {c.name}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: "1rem" }}>
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="link" size={16} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{t("mkt.sol.courierNetwork.haveAccountTitle")}</div>
          <div style={{ fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.6 }}>{t("mkt.sol.courierNetwork.haveAccountDesc")}</div>
        </div>
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="truck" size={16} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{t("mkt.sol.courierNetwork.noAccountTitle")}</div>
          <div style={{ fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.6 }}>{t("mkt.sol.courierNetwork.noAccountDesc")}</div>
        </div>
      </div>
    </SolutionPageLayout>
  );
}
