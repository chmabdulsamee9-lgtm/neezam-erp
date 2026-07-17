import { useNavigate } from "react-router-dom";
import { Monogram, Wordmark } from "../../components/Logo";
import Icon from "../../components/Icon";
import { useLanguage, useTranslation } from "../../i18n";
import { SOLUTIONS_LINKS } from "./solutionsLinks";

export default function PublicFooter() {
  const navigate = useNavigate();
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const year = new Date().getFullYear();

  const colTitleStyle = { fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)", marginBottom: 12, textTransform: "uppercase", letterSpacing: ".03em" };
  const linkStyle = { display: "block", background: "none", border: "none", padding: "5px 0", textAlign: "left", cursor: "pointer", fontSize: 12.5, color: "var(--ne-muted)" };

  return (
    <footer style={{ borderTop: "1px solid var(--ne-border)", background: "var(--ne-surface-2)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2.5rem 1.25rem 1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Monogram size={24} />
            <Wordmark size={15} />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.6, maxWidth: 260, margin: 0 }}>{t("mkt.footer.aboutBlurb")}</p>
        </div>

        <div>
          <div style={colTitleStyle}>{t("mkt.footer.quickLinks")}</div>
          {SOLUTIONS_LINKS.map((s) => (
            <button key={s.path} onClick={() => navigate(s.path)} style={linkStyle}>{t(s.labelKey)}</button>
          ))}
        </div>

        <div>
          <div style={colTitleStyle}>{t("mkt.footer.company")}</div>
          <button onClick={() => navigate("/about")} style={linkStyle}>{t("mkt.nav.about")}</button>
          <button onClick={() => navigate("/contact")} style={linkStyle}>{t("mkt.nav.contact")}</button>
          <button onClick={() => navigate("/pricing")} style={linkStyle}>{t("mkt.nav.pricing")}</button>
          <button onClick={() => navigate("/terms")} style={linkStyle}>{t("mkt.footer.terms")}</button>
        </div>

        <div>
          <div style={colTitleStyle}>{t("mkt.footer.contactTitle")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ne-muted)", marginBottom: 8 }}>
            <Icon name="send" size={12} /> support@eneezam.com
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ne-muted)" }}>
            <Icon name="comment" size={12} /> 03152433123
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--ne-border)", padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, maxWidth: 1200, margin: "0 auto" }}>
        <span style={{ fontSize: 11.5, color: "var(--ne-muted-2)" }}>© {year} eNeezam. {t("mkt.footer.copyright")}</span>
        <button onClick={() => navigate("/terms")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: "var(--ne-muted-2)", textDecoration: "underline" }}>
          {t("mkt.footer.terms")}
        </button>
      </div>
    </footer>
  );
}
