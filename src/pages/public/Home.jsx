import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";
import Icon from "../../components/Icon";
import { useLanguage, useTranslation } from "../../i18n";
import { SOLUTIONS_LINKS } from "./solutionsLinks";

const BLURB_KEYS = {
  orders: "mkt.home.solution.orders.blurb",
  courier: "mkt.home.solution.courier.blurb",
  "courier-network": "mkt.home.solution.courierNetwork.blurb",
  analytics: "mkt.home.solution.analytics.blurb",
  products: "mkt.home.solution.products.blurb",
  ads: "mkt.home.solution.ads.blurb",
};

const FLOW_STEPS = [
  { icon: "package", titleKey: "mkt.home.flow.step1", descKey: "mkt.home.flow.step1desc" },
  { icon: "check", titleKey: "mkt.home.flow.step2", descKey: "mkt.home.flow.step2desc" },
  { icon: "truck", titleKey: "mkt.home.flow.step3", descKey: "mkt.home.flow.step3desc" },
  { icon: "chart", titleKey: "mkt.home.flow.step4", descKey: "mkt.home.flow.step4desc" },
];

// Placeholder/sample data — visual completeness ke liye abhi dummy hai, asal
// numbers/testimonials review ke baad replace honge.
const STATS = [
  { numberKey: "mkt.home.stat1Number", labelKey: "mkt.home.stat1Label" },
  { numberKey: "mkt.home.stat2Number", labelKey: "mkt.home.stat2Label" },
  { numberKey: "mkt.home.stat3Number", labelKey: "mkt.home.stat3Label" },
  { numberKey: "mkt.home.stat4Number", labelKey: "mkt.home.stat4Label" },
];

const TESTIMONIALS = [
  { quoteKey: "mkt.home.testimonial1Quote", nameKey: "mkt.home.testimonial1Name", roleKey: "mkt.home.testimonial1Role", initials: "AM", color: "#5C7CFA" },
  { quoteKey: "mkt.home.testimonial2Quote", nameKey: "mkt.home.testimonial2Name", roleKey: "mkt.home.testimonial2Role", initials: "BA", color: "#34D88E" },
  { quoteKey: "mkt.home.testimonial3Quote", nameKey: "mkt.home.testimonial3Name", roleKey: "mkt.home.testimonial3Role", initials: "HR", color: "#F2A83E" },
];

export default function Home() {
  const navigate = useNavigate();
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, padding: "1.5rem" };

  return (
    <div style={{ height: "100dvh", overflowY: "auto", boxSizing: "border-box", color: "var(--ne-text)" }}>
      <PublicHeader />

      {/* Hero */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "4rem 1.25rem 3rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, margin: "0 0 16px", lineHeight: 1.2 }}>{t("mkt.home.heroTitle")}</h1>
        <p style={{ fontSize: 16, color: "var(--ne-muted)", maxWidth: 560, margin: "0 auto 28px", lineHeight: 1.6 }}>{t("mkt.home.heroSubtitle")}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate("/signup")}
            style={{ padding: "12px 26px", borderRadius: 10, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 24px rgba(92,124,250,.3)" }}>
            {t("mkt.home.getStarted")}
          </button>
          <button onClick={() => navigate("/pricing")}
            style={{ padding: "12px 26px", borderRadius: 10, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
            {t("mkt.home.seePricing")}
          </button>
        </div>
      </div>

      {/* Connected-flow */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem 1.25rem 3.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>{t("mkt.home.flowTitle")}</h2>
          <p style={{ color: "var(--ne-muted)", fontSize: 13.5, maxWidth: 480, margin: "0 auto" }}>{t("mkt.home.flowSubtitle")}</p>
        </div>
        <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          {FLOW_STEPS.map((step, i) => (
            <div key={step.titleKey} style={{ display: "flex", alignItems: "center", flex: isMobile ? "1 1 100%" : 1, gap: 8 }}>
              <div style={{ ...cardStyle, flex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={step.icon} size={20} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t(step.titleKey)}</div>
                <div style={{ fontSize: 11.5, color: "var(--ne-muted)", lineHeight: 1.5 }}>{t(step.descKey)}</div>
              </div>
              {!isMobile && i < FLOW_STEPS.length - 1 && (
                <Icon name="arrowRight" size={16} style={{ color: "var(--ne-muted-2)", flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Solutions preview */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.25rem 3.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>{t("mkt.home.solutionsTitle")}</h2>
          <p style={{ color: "var(--ne-muted)", fontSize: 13.5 }}>{t("mkt.home.solutionsSubtitle")}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {SOLUTIONS_LINKS.map((s) => {
            const key = s.path.split("/").pop();
            return (
              <div key={s.path} onClick={() => navigate(s.path)} style={{ ...cardStyle, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={s.icon} size={18} />
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t(s.labelKey)}</div>
                <div style={{ fontSize: 12, color: "var(--ne-muted)", lineHeight: 1.5, flex: 1 }}>{t(BLURB_KEYS[key])}</div>
                <div style={{ fontSize: 12, color: "var(--ne-accent)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  {t("mkt.home.learnMore")} <Icon name="arrowRight" size={11} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div style={{ background: "var(--ne-grad)", padding: "2.5rem 1.25rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 20, textAlign: "center" }}>
          {STATS.map((s) => (
            <div key={s.labelKey}>
              <div style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, color: "#fff" }}>{t(s.numberKey)}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", fontWeight: 600, marginTop: 4 }}>{t(s.labelKey)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "3.5rem 1.25rem" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 1.75rem", textAlign: "center" }}>{t("mkt.home.testimonialsTitle")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
          {TESTIMONIALS.map((tm) => (
            <div key={tm.nameKey} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ne-text)", lineHeight: 1.65, fontStyle: "italic" }}>&ldquo;{t(tm.quoteKey)}&rdquo;</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: tm.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
                  {tm.initials}
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)" }}>{t(tm.nameKey)}</div>
                  <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>{t(tm.roleKey)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
