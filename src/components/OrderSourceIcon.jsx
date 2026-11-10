import { useTranslation, useLanguage } from "../i18n";

// Small channel icon shown next to an order number: Shopify (/shopify-icon.png) or eNeezam (the app favicon).
// Fixed square box so rows never shift. The tooltip carries the name; the image itself is decorative (alt="").
export default function OrderSourceIcon({ native, size = 16 }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const label = native ? t("orders.eneezamOrder") : t("orders.shopifyOrder");
  const box = { width: size, height: size, flexShrink: 0, display: "inline-block", verticalAlign: "middle", objectFit: "contain" };
  return <img src={native ? "/favicon.svg" : "/shopify-icon.png"} width={size} height={size} alt="" title={label} aria-label={label} style={box} />;
}
