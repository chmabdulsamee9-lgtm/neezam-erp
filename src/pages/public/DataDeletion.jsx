import { useLanguage, useTranslation } from "../../i18n";
import LegalLayout from "./LegalLayout";
import { LEGAL } from "./legal";

// Instructions page for Meta's "User data deletion" requirement. When Meta's deletion callback sends a person here with
// ?code=<confirmation code>, the page shows that the request was processed.
export default function DataDeletion() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const raw = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") || "" : "";
  const code = /^[A-Za-z0-9_-]{6,40}$/.test(raw) ? raw : "";
  const sections = [1, 2, 3].map((n) => ({ title: t(`mkt.dataDeletion.m${n}Title`), body: t(`mkt.dataDeletion.m${n}Body`) }));
  return (
    <LegalLayout title={t("mkt.dataDeletion.title")} updated={`${t("mkt.privacy.updatedPrefix")} ${LEGAL.lastUpdated}`} intro={t("mkt.dataDeletion.intro")} parts={[{ sections }]} icon="trash">
      {code && (
        <div role="status" style={{ background: "var(--ne-success-soft)", border: "1px solid var(--ne-success)", borderRadius: 14, padding: "1rem 1.25rem", marginBottom: "2rem" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, color: "var(--ne-success)" }}>{t("mkt.dataDeletion.statusTitle")}</p>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--ne-text)", lineHeight: 1.6 }}>{t("mkt.dataDeletion.statusBody")}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ne-muted)" }}>{t("mkt.dataDeletion.codeLabel")}: <strong dir="ltr">{code}</strong></p>
        </div>
      )}
    </LegalLayout>
  );
}
