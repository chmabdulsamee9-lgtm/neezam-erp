import { useLanguage, useTranslation } from "../../i18n";
import LegalLayout from "./LegalLayout";
import { LEGAL } from "./legal";

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Draft in plain language. The owner must read and edit it before relying on it (it is not legal advice).
export default function Privacy() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const sections = KEYS.map((n) => ({ title: t(`mkt.privacy.s${n}Title`), body: t(`mkt.privacy.s${n}Body`) }));
  return <LegalLayout title={t("mkt.privacy.title")} updated={`${t("mkt.privacy.updatedPrefix")} ${LEGAL.lastUpdated}`} intro={t("mkt.privacy.intro")} parts={[{ sections }]} />;
}
