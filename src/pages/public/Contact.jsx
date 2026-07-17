import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import Icon from "../../components/Icon";
import { useLanguage, useTranslation } from "../../i18n";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";

// NOTE: "contact_submissions" table abhi Supabase mein nahi bani — is form
// ka insert() tabhi kaam karega jab woh table + insert-policy bann jaye
// (SQL user ko is phase ke chat-summary mein pehle dikhaya gaya hai, khud
// se nahi chalaya gaya).
export default function Contact() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--ne-border)",
    background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 13.5, boxSizing: "border-box", marginBottom: 12,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError(t("mkt.contact.allFieldsRequired"));
      return;
    }
    setSending(true);
    const { error: insertError } = await supabase.from("contact_submissions").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
    });
    setSending(false);
    if (insertError) { setError(insertError.message); return; }
    setSuccess(true);
    setForm({ name: "", email: "", message: "" });
  };

  return (
    <div style={{ color: "var(--ne-text)" }}>
      <PublicHeader />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "3.5rem 1.25rem 4rem", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.2fr) minmax(0,1fr)", gap: "2.5rem" }}>
        <div>
          <h1 style={{ fontSize: "clamp(24px, 4vw, 30px)", fontWeight: 800, margin: "0 0 10px" }}>{t("mkt.contact.title")}</h1>
          <p style={{ color: "var(--ne-muted)", fontSize: 14, marginBottom: "1.75rem", lineHeight: 1.6 }}>{t("mkt.contact.subtitle")}</p>

          <form onSubmit={handleSubmit}>
            <input type="text" placeholder={t("mkt.contact.namePlaceholder")} value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
            <input type="email" placeholder={t("mkt.contact.emailPlaceholder")} value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle} />
            <textarea placeholder={t("mkt.contact.messagePlaceholder")} rows={5} value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

            {error && <p style={{ color: "var(--ne-danger)", fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
            {success && (
              <p style={{ color: "var(--ne-success)", fontSize: 12.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={13} /> {t("mkt.contact.success")}
              </p>
            )}

            <button type="submit" disabled={sending}
              style={{ padding: "12px 26px", borderRadius: 10, border: "none", background: sending ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: sending ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="send" size={14} /> {sending ? t("mkt.contact.sending") : t("mkt.contact.send")}
            </button>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="send" size={17} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ne-muted)", fontWeight: 600, textTransform: "uppercase" }}>{t("mkt.contact.emailLabel")}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>support@eneezam.com</div>
            </div>
          </div>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="comment" size={17} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ne-muted)", fontWeight: 600, textTransform: "uppercase" }}>{t("mkt.contact.phoneLabel")}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>03152433123</div>
            </div>
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
