import { useLanguage, useTranslation } from "../../i18n";
import LegalLayout from "./LegalLayout";
import { LEGAL } from "./legal";

const COURIER_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const GENERAL_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

// Part A: general platform terms. Part B: the original courier-booking terms (kept word for word).
// The owner must read and edit Part A before relying on it (it is not legal advice).
export default function Terms() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const parts = [
    { heading: t("mkt.terms.generalTitle"), intro: t("mkt.terms.generalIntro"), sections: GENERAL_SECTIONS.map((n) => ({ title: t(`mkt.terms.g${n}Title`), body: t(`mkt.terms.g${n}Body`) })) },
    { heading: t("mkt.terms.courierTitle"), intro: t("mkt.terms.intro"), sections: COURIER_SECTIONS.map((n) => ({ title: t(`mkt.terms.s${n}Title`), body: t(`mkt.terms.s${n}Body`) })) },
  ];
  return <LegalLayout title={t("mkt.terms.title")} updated={`${t("mkt.terms.updatedPrefix")} ${LEGAL.lastUpdated}`} parts={parts} />;
}
