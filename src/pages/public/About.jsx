import Icon from "../../components/Icon";
import { useLanguage, useTranslation } from "../../i18n";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

// Team-section abhi generic placeholder-cards use karta hai (avatar-icon +
// designation) — real team-photos/bios baad mein review ke baad add honge.
const TEAM_ROLE_KEYS = ["mkt.about.team.role1", "mkt.about.team.role2", "mkt.about.team.role3", "mkt.about.team.role4"];
const AVATAR_COLORS = ["#5C7CFA", "#34D88E", "#F2A83E", "#A855F7"];

export default function About() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem" };

  return (
    <div style={{ color: "var(--ne-text)" }}>
      <PublicHeader />

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "3.5rem 1.25rem 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "clamp(26px, 4vw, 34px)", fontWeight: 800, margin: "0 0 10px" }}>{t("mkt.about.title")}</h1>
        <p style={{ color: "var(--ne-muted)", fontSize: 14.5, maxWidth: 520, margin: "0 auto" }}>{t("mkt.about.subtitle")}</p>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 1.25rem 3rem", display: "flex", flexDirection: "column", gap: 14, fontSize: 14, color: "var(--ne-text)", lineHeight: 1.75 }}>
        <p style={{ margin: 0 }}>{t("mkt.about.storyP1")}</p>
        <p style={{ margin: 0 }}>{t("mkt.about.storyP2")}</p>
        <p style={{ margin: 0 }}>{t("mkt.about.storyP3")}</p>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 1.25rem 3rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Icon name="zap" size={19} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t("mkt.about.missionTitle")}</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ne-muted)", lineHeight: 1.65 }}>{t("mkt.about.missionText")}</p>
        </div>
        <div style={cardStyle}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Icon name="trending" size={19} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t("mkt.about.visionTitle")}</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ne-muted)", lineHeight: 1.65 }}>{t("mkt.about.visionText")}</p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 1.25rem 4rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>{t("mkt.about.teamTitle")}</h2>
          <p style={{ color: "var(--ne-muted)", fontSize: 13.5 }}>{t("mkt.about.teamSubtitle")}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          {TEAM_ROLE_KEYS.map((roleKey, i) => (
            <div key={roleKey} style={{ ...cardStyle, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${AVATAR_COLORS[i]}22`, color: AVATAR_COLORS[i], display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="team" size={24} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)" }}>{t(roleKey)}</div>
            </div>
          ))}
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
