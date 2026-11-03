import { useTranslation, useLanguage } from "../i18n";

// Small channel icon shown next to an order number: Shopify (inline SVG) or eNeezam (the app favicon).
// Fixed 16x16 box so rows never shift.
export default function OrderSourceIcon({ native, size = 16 }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const label = native ? t("orders.eneezamOrder") : t("orders.shopifyOrder");
  const box = { width: size, height: size, flexShrink: 0, display: "inline-block", verticalAlign: "middle" };
  if (native) return <img src="/favicon.svg" width={size} height={size} alt={label} title={label} aria-label={label} style={box} />;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={label} style={box}>
      <title>{label}</title>
      <path fill="#95BF47" d="M5.2 6.6c0-.2.1-.4.3-.4h13c.2 0 .4.2.4.4l1 12.4c0 .3-.2.5-.4.5H4.6c-.2 0-.4-.2-.4-.5z" />
      <path fill="none" stroke="#5E8E3E" strokeWidth="1.6" strokeLinecap="round" d="M8.7 8.4V6.6a3.3 3.3 0 0 1 6.6 0v1.8" />
      <text x="12" y="17" textAnchor="middle" fontSize="9.5" fontWeight="700" fontFamily="Arial, sans-serif" fill="#fff">S</text>
    </svg>
  );
}
