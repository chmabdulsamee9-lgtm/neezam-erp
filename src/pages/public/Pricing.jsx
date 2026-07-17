import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabase";
import Icon from "../../components/Icon";
import { useLanguage, useTranslation } from "../../i18n";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

const MODULE_LABEL_KEYS = {
  orders: "mkt.pricing.module.orders",
  dashboard: "mkt.pricing.module.dashboard",
  courier: "mkt.pricing.module.courier",
  finance: "mkt.pricing.module.finance",
  ads: "mkt.pricing.module.ads",
  whatsapp: "mkt.pricing.module.whatsapp",
};

const fmtRs = (n) => `Rs. ${Number(n).toLocaleString()}`;

export default function Pricing() {
  const navigate = useNavigate();
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [plans, setPlans] = useState([]);
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 900);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: planRows }, { data: addonRows }] = await Promise.all([
        supabase.from("plans").select("*").order("display_order", { ascending: true }),
        supabase.from("addons").select("*"),
      ]);
      setPlans(planRows || []);
      setAddons(addonRows || []);
      setLoading(false);
    })();
  }, []);

  // Saare plans/addons ke union mein jitne bhi modules hain, comparison-table ki rows wahi hain
  const allModuleKeys = [...new Set(plans.flatMap((p) => p.included_modules || []))];

  const cardStyle = {
    background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16,
    padding: "1.5rem", display: "flex", flexDirection: "column", gap: 12,
  };

  return (
    <div style={{ color: "var(--ne-text)" }}>
      <PublicHeader />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "2rem 1rem" : "3rem 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h1 style={{ fontSize: isMobile ? 26 : 34, fontWeight: 800, margin: "0 0 10px" }}>{t("mkt.pricing.title")}</h1>
          <p style={{ color: "var(--ne-muted)", fontSize: 15, maxWidth: 480, margin: "0 auto" }}>{t("mkt.pricing.subtitle")}</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("mkt.pricing.loading")}</div>
        ) : (
          <>
            {/* Plan Cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: "2.5rem" }}>
              {plans.map((p) => {
                const illustrativeMax = p.order_range_max ? fmtRs(p.rate_per_order * p.order_range_max) : null;
                return (
                  <div key={p.id} style={cardStyle}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ne-muted)", marginTop: 2 }}>
                        {p.order_range_max ? `${t("mkt.pricing.upToUsersPrefix")} ${p.order_range_max.toLocaleString()} ${t("mkt.pricing.upToOrdersSuffix")}` : `${p.order_range_min.toLocaleString()}${t("mkt.pricing.ordersPlusSuffix")}`}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 26, fontWeight: 800 }}>{fmtRs(p.rate_per_order)}</span>
                      <span style={{ fontSize: 12, color: "var(--ne-muted)" }}> {t("mkt.pricing.perOrder")}</span>
                    </div>
                    {illustrativeMax && (
                      <div style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>{t("mkt.pricing.maxVolumePrefix")} {illustrativeMax} {t("mkt.pricing.maxVolumeSuffix")}</div>
                    )}
                    <div style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 10, fontSize: 12.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="team" size={13} /> {t("mkt.pricing.upToUsersPrefix")} {p.max_users === 9999 ? t("mkt.pricing.unlimited") : p.max_users} {t("mkt.pricing.usersSuffix")}
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                      {(p.included_modules || []).map((m) => (
                        <li key={m} style={{ color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon name="check" size={11} style={{ color: "var(--ne-success)" }} /> {t(MODULE_LABEL_KEYS[m]) || m}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => navigate("/signup")}
                      style={{ marginTop: "auto", padding: "9px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {t("mkt.pricing.getStarted")}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add-ons */}
            {addons.length > 0 && (
              <div style={{ marginBottom: "2.5rem" }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>{t("mkt.pricing.addonsTitle")}</h2>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12 }}>
                  {addons.map((a) => (
                    <div key={a.id} style={{ ...cardStyle, padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ne-accent)" }}>{fmtRs(a.monthly_price)}<span style={{ fontSize: 11, color: "var(--ne-muted)", fontWeight: 500 }}>{t("mkt.pricing.perMoSuffix")}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comparison Table */}
            {allModuleKeys.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>{t("mkt.pricing.comparePlansTitle")}</h2>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--ne-border)", fontSize: 12, color: "var(--ne-muted)" }}>{t("mkt.pricing.moduleColumn")}</th>
                      {plans.map((p) => (
                        <th key={p.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--ne-border)", fontSize: 13, fontWeight: 700 }}>{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allModuleKeys.map((m) => (
                      <tr key={m}>
                        <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--ne-border)", fontSize: 12.5, color: "var(--ne-text)" }}>{t(MODULE_LABEL_KEYS[m]) || m}</td>
                        {plans.map((p) => (
                          <td key={p.id} style={{ padding: "9px 12px", borderBottom: "1px solid var(--ne-border)", textAlign: "center" }}>
                            {(p.included_modules || []).includes(m)
                              ? <Icon name="check" size={13} style={{ color: "var(--ne-success)" }} />
                              : <span style={{ color: "var(--ne-muted-2)" }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <PublicFooter />
    </div>
  );
}
