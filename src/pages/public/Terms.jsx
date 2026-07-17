import Icon from "../../components/Icon";
import { useLanguage, useTranslation } from "../../i18n";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

const SECTIONS = [
  { titleKey: "mkt.terms.s1Title", bodyKey: "mkt.terms.s1Body" },
  { titleKey: "mkt.terms.s2Title", bodyKey: "mkt.terms.s2Body" },
  { titleKey: "mkt.terms.s3Title", bodyKey: "mkt.terms.s3Body" },
  { titleKey: "mkt.terms.s4Title", bodyKey: "mkt.terms.s4Body" },
  { titleKey: "mkt.terms.s5Title", bodyKey: "mkt.terms.s5Body" },
  { titleKey: "mkt.terms.s6Title", bodyKey: "mkt.terms.s6Body" },
  { titleKey: "mkt.terms.s7Title", bodyKey: "mkt.terms.s7Body" },
  { titleKey: "mkt.terms.s8Title", bodyKey: "mkt.terms.s8Body" },
  { titleKey: "mkt.terms.s9Title", bodyKey: "mkt.terms.s9Body" },
];

// "Aakhri update" date yahan sirf ek baar hardcode hai — jab bhi terms ka
// koi material section badle, isay bhi update karna hoga.
const LAST_UPDATED = "16 July 2026";

export default function Terms() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);

  return (
    <div style={{ height: "100dvh", overflowY: "auto", boxSizing: "border-box", color: "var(--ne-text)" }}>
      <PublicHeader />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.25rem 4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="shield" size={20} />
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 800 }}>{t("mkt.terms.title")}</h1>
        </div>
        <p style={{ fontSize: 12, color: "var(--ne-muted-2)", marginBottom: "1.75rem" }}>{t("mkt.terms.updatedPrefix")} {LAST_UPDATED}</p>

        <p style={{ fontSize: 13.5, color: "var(--ne-muted)", lineHeight: 1.75, marginBottom: "2rem" }}>{t("mkt.terms.intro")}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {SECTIONS.map((s) => (
            <div key={s.titleKey}>
              <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 8px" }}>{t(s.titleKey)}</h2>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ne-muted)", lineHeight: 1.75 }}>{t(s.bodyKey)}</p>
            </div>
          ))}
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
