import Icon from "../../components/Icon";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";
import { withContact as fill, LEGAL } from "./legal";
import { useLanguage } from "../../i18n";

// Shared layout of the public legal pages: a title, a short intro and numbered sections. `parts` is a list of
// { heading?, intro?, sections: [{ title, body }] } so one page can hold several parts (the Terms have two).
export default function LegalLayout({ title, updated, intro, parts, children, icon = "shield" }) {
  const [lang] = useLanguage();
  const en = lang === "en";
  const withContact = (text) => fill(text, lang);
  const contactRows = [
    ["send", en ? "Email" : "Email", LEGAL.contactEmail],
    ["comment", "Phone / WhatsApp", LEGAL.phone],
    ["clock", en ? "Support hours" : "Support ke auqaat", LEGAL.hours[en ? "en" : "ur"]],
    ["pin", en ? "Address" : "Pata", LEGAL.address],
  ];
  return (
    <div style={{ height: "100dvh", overflowY: "auto", boxSizing: "border-box", color: "var(--ne-text)" }}>
      <PublicHeader />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.25rem 4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={icon} size={20} />
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 800 }}>{title}</h1>
        </div>
        {updated && <p style={{ fontSize: 12, color: "var(--ne-muted-2)", marginBottom: "1.75rem" }}>{updated}</p>}
        {intro && <p style={{ fontSize: 13.5, color: "var(--ne-muted)", lineHeight: 1.75, marginBottom: "2rem" }}>{withContact(intro)}</p>}
        {children}
        {(parts || []).map((part, i) => (
          <div key={i} style={{ marginBottom: "2.25rem" }}>
            {part.heading && <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 10px" }}>{part.heading}</h2>}
            {part.intro && <p style={{ fontSize: 13.5, color: "var(--ne-muted)", lineHeight: 1.75, margin: "0 0 1.25rem" }}>{withContact(part.intro)}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
              {part.sections.map((s) => (
                <div key={s.title}>
                  <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: "0 0 8px" }}>{s.title}</h2>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--ne-muted)", lineHeight: 1.75 }}>{withContact(s.body)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.1rem 1.25rem", display: "grid", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{en ? "Contact eNeezam" : "eNeezam se rabta"}</div>
          {contactRows.map(([ic, label, value]) => (
            <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
              <span style={{ color: "var(--ne-accent)", marginTop: 2 }}><Icon name={ic} size={14} /></span>
              <span style={{ color: "var(--ne-muted)", minWidth: 120 }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
