import { useNavigate } from "react-router-dom";
import PublicHeader from "../PublicHeader";
import PublicFooter from "../PublicFooter";
import Icon from "../../../components/Icon";
import { useLanguage, useTranslation } from "../../../i18n";

// Shared scaffolding for all 6 "/solutions/*" pages — icon+title+subtitle
// header, an optional feature-card grid, optional custom children (jaise
// Courier Network ke partner-logos/dono-options), aur ek closing cross-link
// "note" banner + CTA. Har page apna content sirf i18n keys ke through deta hai.
export default function SolutionPageLayout({ icon, titleKey, subtitleKey, features, noteKey, children }) {
  const navigate = useNavigate();
  const [lang] = useLanguage();
  const t = useTranslation(lang);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 8 };

  return (
    <div style={{ height: "100dvh", overflowY: "auto", boxSizing: "border-box", color: "var(--ne-text)" }}>
      <PublicHeader />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.25rem 4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={icon} size={24} />
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800 }}>{t(titleKey)}</h1>
        </div>
        <p style={{ fontSize: 14.5, color: "var(--ne-muted)", lineHeight: 1.7, maxWidth: 660, marginBottom: "2.25rem" }}>{t(subtitleKey)}</p>

        {features && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: "2.25rem" }}>
            {features.map((f) => (
              <div key={f.titleKey} style={cardStyle}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={f.icon} size={16} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t(f.titleKey)}</div>
                <div style={{ fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.6 }}>{t(f.descKey)}</div>
              </div>
            ))}
          </div>
        )}

        {children}

        {noteKey && (
          <div style={{ background: "var(--ne-accent-soft)", border: "1px solid var(--ne-accent)", borderRadius: 12, padding: "1rem 1.25rem", fontSize: 13, color: "var(--ne-text)", display: "flex", gap: 10, alignItems: "flex-start", marginTop: "1.5rem" }}>
            <Icon name="link" size={15} style={{ color: "var(--ne-accent)", flexShrink: 0, marginTop: 2 }} />
            <span style={{ lineHeight: 1.6 }}>{t(noteKey)}</span>
          </div>
        )}

        <div style={{ marginTop: "2.25rem" }}>
          <button onClick={() => navigate("/signup")}
            style={{ padding: "12px 26px", borderRadius: 10, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {t("mkt.sol.startNow")}
          </button>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
