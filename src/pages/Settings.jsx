import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const isValidPhone = (p) => /^\d{11}$/.test(String(p || "").trim());

export default function Settings({ profile, onProfileUpdated }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  // ---- Profile details (TASK 9) ----
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  // ---- Password change (TASK 9) ----
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // ---- Add new brand (TASK 13) ----
  const [brandName, setBrandName] = useState("");
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [brandSuccess, setBrandSuccess] = useState(false);

  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cardStyle = {
    background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14,
    padding: isMobile ? "1rem" : "1.5rem", marginBottom: "1.5rem",
  };
  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10,
  };
  const labelStyle = { color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 4, fontWeight: 600 };

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess(false);
    if (!fullName.trim()) {
      setProfileError(t("settings.nameRequired"));
      return;
    }
    if (!isValidPhone(phone)) {
      setProfileError(t("settings.phoneError"));
      return;
    }
    setProfileSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName.trim(),
      phone: phone.trim(),
    }).eq("id", profile.id);
    if (error) {
      setProfileError(error.message);
      setProfileSaving(false);
      return;
    }
    setProfileSuccess(true);
    setProfileSaving(false);
    onProfileUpdated?.({ ...profile, full_name: fullName.trim(), phone: phone.trim() });
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError(t("settings.passwordMinError"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("settings.passwordsDontMatch"));
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(error.message);
      setPasswordSaving(false);
      return;
    }
    setPasswordSuccess(true);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaving(false);
  };

  const addBrand = async (e) => {
    e.preventDefault();
    setBrandError("");
    setBrandSuccess(false);
    if (!brandName.trim()) {
      setBrandError(t("settings.brandNameRequired"));
      return;
    }
    setBrandSaving(true);
    try {
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .insert({ store_name: brandName.trim(), shopify_url: null, api_token: null })
        .select()
        .single();
      if (storeError) {
        setBrandError(storeError.message);
        setBrandSaving(false);
        return;
      }
      const { error: linkError } = await supabase.from("user_stores").insert({
        user_id: profile.id,
        store_id: storeData.id,
      });
      if (linkError) {
        setBrandError(linkError.message);
        setBrandSaving(false);
        return;
      }
      setBrandName("");
      setBrandSuccess(true);
    } catch (err) {
      setBrandError(err.message);
    }
    setBrandSaving(false);
  };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", maxWidth: 600, margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="settings" size={18} /> {t("settings.title")}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ne-muted)" }}>{t("settings.subtitle")}</p>
      </div>

      {/* ---------- MY PROFILE ---------- */}
      <div style={cardStyle}>
        <h2 style={{ margin: "0 0 1rem", fontSize: 15, color: "var(--ne-text)", fontWeight: 700 }}>{t("settings.myProfile")}</h2>
        <form onSubmit={saveProfile}>
          <label style={labelStyle}>{t("settings.nameLabel")}</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>{t("settings.phoneLabel")}</label>
          <input type="tel" value={phone} maxLength={11}
            onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} style={inputStyle} />
          {phone.length > 0 && !isValidPhone(phone) && (
            <p style={{ color: "var(--ne-danger)", fontSize: 11, margin: "-6px 0 10px" }}>{t("settings.phoneError")}</p>
          )}

          <label style={labelStyle}>{t("settings.emailLabel")}</label>
          <input type="email" value={profile?.email || ""} disabled style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} />

          {profileError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{profileError}</p>}
          {profileSuccess && <p style={{ color: "var(--ne-success)", fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("settings.profileUpdated")}</p>}

          <button type="submit" disabled={profileSaving}
            style={{ padding: "10px 20px", background: profileSaving ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: profileSaving ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {profileSaving ? t("settings.saving") : (<><Icon name="check" size={13} /> {t("settings.saveProfile")}</>)}
          </button>
        </form>
      </div>

      {/* ---------- CHANGE PASSWORD ---------- */}
      <div style={cardStyle}>
        <h2 style={{ margin: "0 0 1rem", fontSize: 15, color: "var(--ne-text)", fontWeight: 700 }}>{t("settings.changePassword")}</h2>
        <form onSubmit={changePassword}>
          <label style={labelStyle}>{t("settings.newPasswordLabel")}</label>
          <input type="password" placeholder={t("settings.min6chars")} value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>{t("settings.confirmPasswordLabel")}</label>
          <input type="password" placeholder={t("settings.retypePassword")} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inputStyle} />
          {confirmPassword.length > 0 && newPassword !== confirmPassword && (
            <p style={{ color: "var(--ne-danger)", fontSize: 11, margin: "-6px 0 10px" }}>{t("settings.passwordMismatch")}</p>
          )}

          {passwordError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{passwordError}</p>}
          {passwordSuccess && <p style={{ color: "var(--ne-success)", fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("settings.passwordChanged")}</p>}

          <button type="submit" disabled={passwordSaving}
            style={{ padding: "10px 20px", background: passwordSaving ? "var(--ne-border)" : "var(--ne-warning)", color: "#1A1300", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: passwordSaving ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {passwordSaving ? t("settings.changing") : (<><Icon name="key" size={13} /> {t("settings.changePasswordButton")}</>)}
          </button>
        </form>
      </div>

      {/* ---------- ADD NEW BRAND (sirf admin) ---------- */}
      {profile?.role === "admin" && (
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 1rem", fontSize: 15, color: "var(--ne-text)", fontWeight: 700 }}>{t("settings.addNewBrand")}</h2>
          <p style={{ fontSize: 12, color: "var(--ne-muted)", margin: "0 0 10px" }}>
            {t("settings.addBrandHint")}
          </p>
          <form onSubmit={addBrand}>
            <label style={labelStyle}>{t("settings.brandNameLabel")}</label>
            <input type="text" placeholder={t("settings.brandNamePlaceholder")} value={brandName} onChange={e => setBrandName(e.target.value)} style={inputStyle} />

            {brandError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{brandError}</p>}
            {brandSuccess && <p style={{ color: "var(--ne-success)", fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("settings.brandAdded")}</p>}

            <button type="submit" disabled={brandSaving}
              style={{ padding: "10px 20px", background: brandSaving ? "var(--ne-border)" : "var(--ne-success)", color: brandSaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: brandSaving ? "default" : "pointer" }}>
              {brandSaving ? t("settings.addingBrand") : t("settings.addBrandButton")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
