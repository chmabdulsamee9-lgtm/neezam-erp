import { useState } from "react";
import Icon from "../../components/Icon";
import { useLanguage, useTranslation } from "../../i18n";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

// NOTE (dev-flag): Koi public/anonymous tracking-endpoint abhi worker mein
// exist nahi karta — "/dex-track-shipment" hai lekin woh authenticated
// store-owner session + store_id maangta hai (public visitor ke paas nahi
// hota). Yeh page abhi sirf UI hai; asal lookup ke liye ek NAYA public
// endpoint chahiye hoga (jo tracking_number se order dhoond kar sirf
// status/timeline return kare, koi customer-PII nahi) — backend kaam hai,
// is phase ke scope se bahar.
export default function Tracking() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!trackingNumber.trim()) { setMessage(t("mkt.tracking.numberRequired")); return; }
    setLoading(true);
    setMessage("");
    setHasSearched(true);
    try {
      const res = await fetch(`${CF_URL}/track-shipment-public?tracking_number=${encodeURIComponent(trackingNumber.trim())}`);
      const data = await res.json().catch(() => null);
      if (!data || data.error || !data.status) {
        setMessage(t("mkt.tracking.notAvailable"));
      } else {
        setMessage(t("mkt.tracking.notAvailable"));
      }
    } catch {
      setMessage(t("mkt.tracking.notAvailable"));
    }
    setLoading(false);
  };

  return (
    <div style={{ height: "100dvh", overflowY: "auto", boxSizing: "border-box", color: "var(--ne-text)" }}>
      <PublicHeader />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "3.5rem 1.25rem 5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Icon name="truck" size={26} />
          </div>
          <h1 style={{ fontSize: "clamp(24px, 4vw, 30px)", fontWeight: 800, margin: "0 0 8px" }}>{t("mkt.tracking.title")}</h1>
          <p style={{ color: "var(--ne-muted)", fontSize: 14, maxWidth: 420, margin: "0 auto" }}>{t("mkt.tracking.subtitle")}</p>
        </div>

        <form onSubmit={handleTrack} style={{ display: "flex", gap: 8, marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ne-muted-2)" }} />
            <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder={t("mkt.tracking.placeholder")}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px 12px 34px", borderRadius: 10, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 14 }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: loading ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", whiteSpace: "nowrap" }}>
            {loading ? t("mkt.tracking.tracking") : t("mkt.tracking.trackButton")}
          </button>
        </form>

        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)", fontSize: 13, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {message || (hasSearched ? "" : t("mkt.tracking.emptyPrompt"))}
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
