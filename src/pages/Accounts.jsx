import { useState } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import InitialsAvatar from "../components/InitialsAvatar";
import { Monogram } from "../components/Logo";
import { SettingsCard, settingsInputStyle, settingsLabelStyle } from "../components/SettingsUI";
import { useLanguage, useTranslation } from "../i18n";

const isValidPhone = (p) => /^\d{11}$/.test(String(p || "").trim());

// profiles.full_name stays a single column; first/last are a UI split joined back on save.
const splitName = (full) => {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  return [parts[0] || "", parts.slice(1).join(" ")];
};

const TABS = [
  { id: "general", labelKey: "accounts.general" },
  { id: "security", labelKey: "accounts.security" },
];

export default function Accounts({ profile, userEmail, emailVerified, onProfileUpdated, onExit }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [tab, setTab] = useState("general");

  const [initialFirst, initialLast] = splitName(profile?.full_name);
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [phone, setPhone] = useState(profile?.phone || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess(false);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!fullName) { setProfileError(t("settings.nameRequired")); return; }
    if (!isValidPhone(phone)) { setProfileError(t("settings.phoneError")); return; }
    setProfileSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName,
      phone: phone.trim(),
    }).eq("id", profile.id);
    if (error) { setProfileError(error.message); setProfileSaving(false); return; }
    setProfileSuccess(true);
    setProfileSaving(false);
    onProfileUpdated?.({ ...profile, full_name: fullName, phone: phone.trim() });
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

  const displayName = profile?.full_name || userEmail;

  return (
    <div className="ne-app-shell ne-accounts-shell">
      <header className="ne-accounts-header">
        <button className="ne-accounts-brand" onClick={onExit} title={t("accounts.backToAdmin")} aria-label={t("accounts.backToAdmin")}>
          <Monogram size={24} />
          <span>{t("accounts.title")}</span>
        </button>
        <div className="ne-accounts-user">
          <InitialsAvatar name={displayName} size={30} />
          <span>{displayName}</span>
        </div>
      </header>

      <div className="ne-accounts-body">
        <nav className="ne-accounts-nav">
          {TABS.map((tb) => (
            <button key={tb.id} className={`ne-accounts-tab${tab === tb.id ? " active" : ""}`} onClick={() => setTab(tb.id)}>
              {t(tb.labelKey)}
            </button>
          ))}
        </nav>

        <main className="ne-accounts-main">
          {tab === "general" && (
            <SettingsCard>
              <h2 className="ne-accounts-cardtitle">{t("settings.myProfile")}</h2>
              <form onSubmit={saveProfile}>
                <div className="ne-accounts-row">
                  <div>
                    <label style={settingsLabelStyle}>{t("accounts.firstName")}</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={settingsInputStyle} />
                  </div>
                  <div>
                    <label style={settingsLabelStyle}>{t("accounts.lastName")}</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={settingsInputStyle} />
                  </div>
                </div>

                <label style={settingsLabelStyle}>{t("settings.phoneLabel")}</label>
                <input type="tel" value={phone} maxLength={11}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} style={settingsInputStyle} />
                {phone.length > 0 && !isValidPhone(phone) && (
                  <p style={{ color: "var(--ne-danger)", fontSize: 11, margin: "-6px 0 10px" }}>{t("settings.phoneError")}</p>
                )}

                <label style={{ ...settingsLabelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  {t("settings.emailLabel")}
                  {emailVerified && (
                    <span className="ne-accounts-verified"><Icon name="check" size={10} /> {t("accounts.verified")}</span>
                  )}
                </label>
                <input type="email" value={userEmail || ""} disabled style={{ ...settingsInputStyle, opacity: 0.6, cursor: "not-allowed" }} />

                {profileError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{profileError}</p>}
                {profileSuccess && <p style={{ color: "var(--ne-success)", fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("settings.profileUpdated")}</p>}

                <button type="submit" disabled={profileSaving}
                  style={{ padding: "10px 20px", background: profileSaving ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: profileSaving ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {profileSaving ? t("settings.saving") : (<><Icon name="check" size={13} /> {t("settings.saveProfile")}</>)}
                </button>
              </form>
            </SettingsCard>
          )}

          {tab === "security" && (
            <SettingsCard>
              <h2 className="ne-accounts-cardtitle">{t("settings.changePassword")}</h2>
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
        </main>
      </div>
    </div>
  );
}
