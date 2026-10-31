import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import InitialsAvatar from "../components/InitialsAvatar";
import { SettingsCard, settingsInputStyle, settingsLabelStyle } from "../components/SettingsUI";
import { useLanguage, useTranslation } from "../i18n";

const isValidPhone = (p) => /^\d{11}$/.test(String(p || "").trim());

// Admin UI overhaul, Part C — Settings is now a Shopify-style shell: a client-side-filtered
// "Search settings" list on the left/top, a store-identity block, and a bottom-fixed user
// row. "My Profile"/"Change Password"/"Add New Brand" are local sections rendered inline
// (same forms/behavior as before, just one-at-a-time via `activeSection`). WhatsApp,
// Courier Connect, Meta Connect, Team, and Activity Log were moved out of the main sidebar
// nav (Part A4/A5) into this list — clicking them calls the same onNavigate(id) the
// sidebar used to call directly, which reuses App.jsx's existing render blocks and
// hasAccess/role gating completely unchanged (C3): this shell never re-implements that
// gating, it only relocates the entry point.
export default function Settings({ profile, onProfileUpdated, onNavigate, onBack, hasAccess, currentStoreInfo, userEmail }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [backHover, setBackHover] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");
  const [search, setSearch] = useState("");

  // ---- Profile details ----
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  // ---- Password change ----
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // ---- Add new brand ----
  const [brandName, setBrandName] = useState("");
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [brandSuccess, setBrandSuccess] = useState(false);

  const isPrivileged = profile?.role === "admin" || profile?.role === "creator";

  const localSections = useMemo(() => {
    const items = [
      { id: "profile", label: t("settings.myProfile"), icon: "team" },
      { id: "password", label: t("settings.changePassword"), icon: "key" },
    ];
    if (profile?.role === "admin") items.push({ id: "brand", label: t("settings.addNewBrand"), icon: "store" });
    return items;
  }, [profile?.role, t]);

  // Moved here from the main sidebar nav (A4/A5) — same hasAccess/role gating as before,
  // just a different entry point. Navigating away reuses App.jsx's unchanged render blocks.
  const externalSections = useMemo(() => {
    const items = [];
    if (hasAccess?.("whatsapp")) items.push({ id: "whatsapp", label: t("nav.whatsapp"), icon: "comment" });
    if (hasAccess?.("courier-connect")) items.push({ id: "courier-connect", label: t("nav.courier-connect"), icon: "truck" });
    if (hasAccess?.("meta-connect")) items.push({ id: "meta-connect", label: t("nav.meta-connect"), icon: "chart" });
    if (isPrivileged) {
      items.push({ id: "team", label: t("nav.team"), icon: "team" });
      items.push({ id: "activity-log", label: t("nav.activity-log"), icon: "activity-log" });
    }
    return items;
  }, [hasAccess, isPrivileged, t]);

  const allSections = [...localSections, ...externalSections];
  const filteredSections = search.trim()
    ? allSections.filter((s) => s.label.toLowerCase().includes(search.trim().toLowerCase()))
    : allSections;

  const selectSection = (item) => {
    if (externalSections.some((s) => s.id === item.id)) {
      onNavigate?.(item.id);
    } else {
      setActiveSection(item.id);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess(false);
    if (!fullName.trim()) { setProfileError(t("settings.nameRequired")); return; }
    if (!isValidPhone(phone)) { setProfileError(t("settings.phoneError")); return; }
    setProfileSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName.trim(),
      phone: phone.trim(),
    }).eq("id", profile.id);
    if (error) { setProfileError(error.message); setProfileSaving(false); return; }
    setProfileSuccess(true);
    setProfileSaving(false);
    onProfileUpdated?.({ ...profile, full_name: fullName.trim(), phone: phone.trim() });
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword.length < 6) { setPasswordError(t("settings.passwordMinError")); return; }
    if (newPassword !== confirmPassword) { setPasswordError(t("settings.passwordsDontMatch")); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordError(error.message); setPasswordSaving(false); return; }
    setPasswordSuccess(true);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaving(false);
  };

  const addBrand = async (e) => {
    e.preventDefault();
    setBrandError("");
    setBrandSuccess(false);
    if (!brandName.trim()) { setBrandError(t("settings.brandNameRequired")); return; }
    setBrandSaving(true);
    try {
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .insert({ store_name: brandName.trim(), shopify_url: null, api_token: null })
        .select()
        .single();
      if (storeError) { setBrandError(storeError.message); setBrandSaving(false); return; }
      const { error: linkError } = await supabase.from("user_stores").insert({
        user_id: profile.id,
        store_id: storeData.id,
      });
      if (linkError) { setBrandError(linkError.message); setBrandSaving(false); return; }
      setBrandName("");
      setBrandSuccess(true);
    } catch (err) {
      setBrandError(err.message);
    }
    setBrandSaving(false);
  };

  return (
    <div className="ne-settings-shell">
      <div className="ne-settings-nav">
        <button className="ne-settings-back" onClick={() => onBack?.()}
          onMouseEnter={() => setBackHover(true)} onMouseLeave={() => setBackHover(false)}>
          <Icon name="chevronLeft" size={15} />
          <span>{backHover ? t("action.back") : t("settings.title")}</span>
        </button>
        {currentStoreInfo && (
          <div className="ne-settings-storeblock">
            <Icon name="store" size={13} /> {currentStoreInfo.store_name}
          </div>
        )}
        <div className="ne-settings-search">
          <Icon name="search" size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("settings.searchPlaceholder")} />
        </div>
        <div className="ne-settings-navlist">
          {filteredSections.map((s) => (
            <div key={s.id}
              className={`ne-settings-navitem${activeSection === s.id && !externalSections.some((e) => e.id === s.id) ? ' active' : ''}`}
              onClick={() => selectSection(s)}>
              <Icon name={s.icon} size={14} /> {s.label}
            </div>
          ))}
          {filteredSections.length === 0 && (
            <div className="ne-settings-navempty">{t("settings.noMatch")}</div>
          )}
        </div>
        <div className="ne-settings-userrow">
          <InitialsAvatar name={profile?.full_name || userEmail} size={30} />
          <div className="ne-settings-userrow-text">
            <div className="ne-settings-userrow-name">{profile?.full_name || "—"}</div>
            <div className="ne-settings-userrow-email">{userEmail}</div>
          </div>
        </div>
      </div>

      <div className="ne-settings-body">
        {activeSection === "profile" && (
          <SettingsCard>
            <h2 style={{ margin: "0 0 1rem", fontSize: 15, color: "var(--ne-text)", fontWeight: 700 }}>{t("settings.myProfile")}</h2>
            <form onSubmit={saveProfile}>
              <label style={settingsLabelStyle}>{t("settings.nameLabel")}</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} style={settingsInputStyle} />

              <label style={settingsLabelStyle}>{t("settings.phoneLabel")}</label>
              <input type="tel" value={phone} maxLength={11}
                onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} style={settingsInputStyle} />
              {phone.length > 0 && !isValidPhone(phone) && (
                <p style={{ color: "var(--ne-danger)", fontSize: 11, margin: "-6px 0 10px" }}>{t("settings.phoneError")}</p>
              )}

              <label style={settingsLabelStyle}>{t("settings.emailLabel")}</label>
              <input type="email" value={profile?.email || ""} disabled style={{ ...settingsInputStyle, opacity: 0.6, cursor: "not-allowed" }} />

              {profileError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{profileError}</p>}
              {profileSuccess && <p style={{ color: "var(--ne-success)", fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("settings.profileUpdated")}</p>}

              <button type="submit" disabled={profileSaving}
                style={{ padding: "10px 20px", background: profileSaving ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: profileSaving ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {profileSaving ? t("settings.saving") : (<><Icon name="check" size={13} /> {t("settings.saveProfile")}</>)}
              </button>
            </form>
          </SettingsCard>
        )}

        {activeSection === "password" && (
          <SettingsCard>
            <h2 style={{ margin: "0 0 1rem", fontSize: 15, color: "var(--ne-text)", fontWeight: 700 }}>{t("settings.changePassword")}</h2>
            <form onSubmit={changePassword}>
              <label style={settingsLabelStyle}>{t("settings.newPasswordLabel")}</label>
              <input type="password" placeholder={t("settings.min6chars")} value={newPassword} onChange={e => setNewPassword(e.target.value)} style={settingsInputStyle} />

              <label style={settingsLabelStyle}>{t("settings.confirmPasswordLabel")}</label>
              <input type="password" placeholder={t("settings.retypePassword")} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={settingsInputStyle} />
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
          </SettingsCard>
        )}

        {activeSection === "brand" && profile?.role === "admin" && (
          <SettingsCard>
            <h2 style={{ margin: "0 0 1rem", fontSize: 15, color: "var(--ne-text)", fontWeight: 700 }}>{t("settings.addNewBrand")}</h2>
            <p style={{ fontSize: 12, color: "var(--ne-muted)", margin: "0 0 10px" }}>{t("settings.addBrandHint")}</p>
            <form onSubmit={addBrand}>
              <label style={settingsLabelStyle}>{t("settings.brandNameLabel")}</label>
              <input type="text" placeholder={t("settings.brandNamePlaceholder")} value={brandName} onChange={e => setBrandName(e.target.value)} style={settingsInputStyle} />

              {brandError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{brandError}</p>}
              {brandSuccess && <p style={{ color: "var(--ne-success)", fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("settings.brandAdded")}</p>}

              <button type="submit" disabled={brandSaving}
                style={{ padding: "10px 20px", background: brandSaving ? "var(--ne-border)" : "var(--ne-success)", color: brandSaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: brandSaving ? "default" : "pointer" }}>
                {brandSaving ? t("settings.addingBrand") : t("settings.addBrandButton")}
              </button>
            </form>
          </SettingsCard>
        )}
      </div>
    </div>
  );
}
