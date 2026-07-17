import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Monogram, Wordmark } from "../../components/Logo";
import Icon from "../../components/Icon";
import { SunIcon, MoonIcon, GlobeIcon } from "../../components/Icons";
import { useLanguage, useTranslation } from "../../i18n";
import { SOLUTIONS_LINKS } from "./solutionsLinks";
import { isDevEnv } from "../../App";

// Public site apna standalone theme-state rakhta hai (App.jsx ke andar wale
// theme-state se instance alag hai, kyunke public pages App() ke logged-in
// shell se pehle hi render ho jate hain) — LEKIN same localStorage key
// ("neezam_theme") aur same data-theme attribute use karta hai, isliye theme.css
// ke saare --ne-* vars aur toggle dono jagah consistent rehte hain.
export default function PublicHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lang, setLang] = useLanguage();
  const t = useTranslation(lang);
  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("neezam_theme")) || "light");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 900);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("neezam_theme", theme);
  }, [theme]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const go = (path) => {
    navigate(path);
    setMobileOpen(false);
    setMobileSolutionsOpen(false);
    setSolutionsOpen(false);
  };

  const isActive = (path) => location.pathname === path;

  const navLinkStyle = (path) => ({
    background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
    color: isActive(path) ? "var(--ne-accent)" : "var(--ne-text)", padding: "6px 2px",
  });

  const iconBtnStyle = {
    width: 34, height: 34, borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface)",
    color: "var(--ne-text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  };

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 1000, background: "var(--ne-surface-2)", borderBottom: "1px solid var(--ne-border)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0.85rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", flexShrink: 0 }} onClick={() => go("/")}>
          <Monogram size={28} />
          {!isMobile && <Wordmark size={17} />}
        </div>

        {!isMobile && (
          <nav style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <button onClick={() => go("/")} style={navLinkStyle("/")}>{t("mkt.nav.home")}</button>

            <div style={{ position: "relative" }}
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}>
              <button style={{ ...navLinkStyle("/solutions"), display: "flex", alignItems: "center", gap: 4 }}>
                {t("mkt.nav.solutions")} <Icon name="chevronDown" size={11} />
              </button>
              {solutionsOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, paddingTop: 10, zIndex: 1001 }}>
                  <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: 6, minWidth: 220, boxShadow: "0 12px 30px rgba(0,0,0,.25)" }}>
                    {SOLUTIONS_LINKS.map((s) => (
                      <div key={s.path} onClick={() => go(s.path)}
                        style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: isActive(s.path) ? "var(--ne-accent)" : "var(--ne-text)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ne-surface)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <Icon name={s.icon} size={13} /> {t(s.labelKey)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => go("/pricing")} style={navLinkStyle("/pricing")}>{t("mkt.nav.pricing")}</button>
            <button onClick={() => go("/tracking")} style={navLinkStyle("/tracking")}>{t("mkt.nav.tracking")}</button>
            <button onClick={() => go("/about")} style={navLinkStyle("/about")}>{t("mkt.nav.about")}</button>
            <button onClick={() => go("/contact")} style={navLinkStyle("/contact")}>{t("mkt.nav.contact")}</button>
          </nav>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setLang(lang === "ur" ? "en" : "ur")} title={t("lang.switch")} style={iconBtnStyle}>
            <GlobeIcon style={{ width: 15, height: 15 }} />
          </button>
          <button onClick={() => setTheme((th) => (th === "dark" ? "light" : "dark"))} title={t("theme.toggle")} style={iconBtnStyle}>
            {theme === "dark" ? <SunIcon style={{ width: 15, height: 15 }} /> : <MoonIcon style={{ width: 15, height: 15 }} />}
          </button>
          {!isMobile && (
            <>
              <button onClick={() => {
                if (isDevEnv()) {
                  window.location.href = "/login";
                } else {
                  window.location.href = "https://portal.eneezam.com/login";
                }
              }}
                style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {t("mkt.nav.login")}
              </button>
              <button onClick={() => {
                if (isDevEnv()) {
                  window.location.href = "/signup";
                } else {
                  window.location.href = "https://portal.eneezam.com/signup";
                }
              }}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {t("mkt.nav.signup")}
              </button>
            </>
          )}
          {isMobile && (
            <button onClick={() => setMobileOpen((o) => !o)} style={iconBtnStyle}>
              <Icon name={mobileOpen ? "close" : "menu"} size={16} />
            </button>
          )}
        </div>
      </div>

      {isMobile && mobileOpen && (
        <div style={{ borderTop: "1px solid var(--ne-border)", padding: "0.75rem 1.25rem 1.25rem", display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => go("/")} style={{ ...navLinkStyle("/"), textAlign: "left", padding: "10px 4px" }}>{t("mkt.nav.home")}</button>

          <div onClick={() => setMobileSolutionsOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--ne-text)" }}>
            {t("mkt.nav.solutions")} <Icon name="chevronDown" size={12} style={{ transform: mobileSolutionsOpen ? "rotate(180deg)" : "none" }} />
          </div>
          {mobileSolutionsOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 14, marginBottom: 6 }}>
              {SOLUTIONS_LINKS.map((s) => (
                <div key={s.path} onClick={() => go(s.path)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 4px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: isActive(s.path) ? "var(--ne-accent)" : "var(--ne-muted)" }}>
                  <Icon name={s.icon} size={12} /> {t(s.labelKey)}
                </div>
              ))}
            </div>
          )}

          <button onClick={() => go("/pricing")} style={{ ...navLinkStyle("/pricing"), textAlign: "left", padding: "10px 4px" }}>{t("mkt.nav.pricing")}</button>
          <button onClick={() => go("/tracking")} style={{ ...navLinkStyle("/tracking"), textAlign: "left", padding: "10px 4px" }}>{t("mkt.nav.tracking")}</button>
          <button onClick={() => go("/about")} style={{ ...navLinkStyle("/about"), textAlign: "left", padding: "10px 4px" }}>{t("mkt.nav.about")}</button>
          <button onClick={() => go("/contact")} style={{ ...navLinkStyle("/contact"), textAlign: "left", padding: "10px 4px" }}>{t("mkt.nav.contact")}</button>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => {
              if (isDevEnv()) {
                window.location.href = "/login";
              } else {
                window.location.href = "https://portal.eneezam.com/login";
              }
            }}
              style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {t("mkt.nav.login")}
            </button>
            <button onClick={() => {
              if (isDevEnv()) {
                window.location.href = "/signup";
              } else {
                window.location.href = "https://portal.eneezam.com/signup";
              }
            }}
              style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {t("mkt.nav.signup")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
