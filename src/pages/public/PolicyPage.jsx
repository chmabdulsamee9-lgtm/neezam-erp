import { useLanguage } from "../../i18n";
import LegalLayout from "./LegalLayout";
import { LEGAL } from "./legal";
import { POLICIES } from "./policies";

// Refund / Shipping / FAQ pages: same layout as Privacy and Terms, text from policies.js.
function PolicyPage({ kind, icon }) {
  const [lang] = useLanguage();
  const p = POLICIES[lang === "en" ? "en" : "ur"][kind];
  const updated = `${lang === "en" ? "Last updated:" : "Aakhri tabdeeli:"} ${LEGAL.lastUpdated}`;
  return <LegalLayout title={p.title} updated={updated} intro={p.intro} parts={[{ sections: p.sections }]} icon={icon} />;
}

export const RefundPolicy = () => <PolicyPage kind="refund" icon="undo" />;
export const ShippingPolicy = () => <PolicyPage kind="shipping" icon="truck" />;
export const FaqPage = () => <PolicyPage kind="faq" icon="comment" />;
