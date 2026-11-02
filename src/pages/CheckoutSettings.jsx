import { useState, useEffect, useMemo } from "react";
import { useLanguage, useTranslation } from "../i18n";
import { SettingsCard, settingsInputStyle } from "../components/SettingsUI";
import { workerFetch, logStoreActivity } from "../lib/storeApi";

// Settings > Checkout. Which fields the storefront checkout shows / requires and their text.
// The server (worker /save-checkout-settings) is the source of truth for validation; the
// inline checks here only give instant feedback.

const FIELD_ORDER = ["full_name", "email", "phone", "province", "city", "area", "subarea", "address", "address2", "postal_code", "order_notes"];
const LOCKED = ["full_name", "province", "city", "address"]; // always shown + required
const MAX_TEXT = 80;
// mirrors the storefront's built-in texts (shown as the hint when a label/placeholder is blank)
const DEFAULT_LABELS = {
  full_name: "Full name", email: "Email", phone: "Mobile number", province: "Province", city: "City", area: "Area", subarea: "Subarea",
  address: "Street address", address2: "Apartment, floor (optional)", postal_code: "Postal code", order_notes: "Delivery notes (optional)",
};
const DEFAULT_PLACEHOLDERS = {
  full_name: "e.g. Ayesha Khan", email: "you@example.com", phone: "03XXXXXXXXX", province: "Search province…", city: "Search city…",
  area: "Search area…", subarea: "Search subarea…", address: "House, street, landmark…", address2: "Apartment, floor, building", postal_code: "e.g. 54000", order_notes: "e.g. Leave with the guard",
};

const toggleStyle = (on, disabled) => ({
  width: 34, height: 19, borderRadius: 10, border: "none", padding: 2, cursor: disabled ? "not-allowed" : "pointer",
  background: on ? "var(--ne-accent)" : "var(--ne-border)", opacity: disabled ? 0.55 : 1, display: "inline-flex", alignItems: "center",
  justifyContent: on ? "flex-end" : "flex-start", transition: "background .15s",
});
const knob = { width: 15, height: 15, borderRadius: "50%", background: "#fff", display: "block" };

function Toggle({ on, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => !disabled && onChange(!on)} style={toggleStyle(on, disabled)}>
      <span style={knob} />
    </button>
  );
}

export default function CheckoutSettings({ storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(null);   // last loaded/saved fields
  const [draft, setDraft] = useState(null);   // editable fields
  const [defaults, setDefaults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "ok" | "error", text }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      const { status, data } = await workerFetch(cfUrl, `/get-checkout-settings?store_id=${storeId}`);
      if (!alive) return;
      if (status !== 200 || !data.settings) {
        setLoadError(data.error || t("checkoutSettings.errorLoad"));
      } else {
        if (data.error) setLoadError(data.error);
        setSaved(data.settings.fields);
        setDraft(data.settings.fields);
        setDefaults(data.defaults.fields);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [storeId, cfUrl]);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const setField = (name, patch) => setDraft((d) => {
    const next = { ...d[name], ...patch };
    if (patch.required === true) next.visible = true;
    if (patch.visible === false) next.required = false;
    return { ...d, [name]: next };
  });

  const contactOk = !!draft && ((draft.phone.visible && draft.phone.required) || (draft.email.visible && draft.email.required));
  const tooLong = !!draft && FIELD_ORDER.some((n) => (draft[n].label || "").length > MAX_TEXT || (draft[n].placeholder || "").length > MAX_TEXT);
  const canSave = dirty && contactOk && !tooLong && !saving;

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const payload = {};
    for (const n of FIELD_ORDER) {
      payload[n] = LOCKED.includes(n)
        ? { label: draft[n].label.trim(), placeholder: draft[n].placeholder.trim() }
        : { visible: draft[n].visible, required: draft[n].required, label: draft[n].label.trim(), placeholder: draft[n].placeholder.trim() };
    }
    payload.location_picker = { enabled: draft.location_picker?.enabled !== false };
    const { status, data } = await workerFetch(cfUrl, "/save-checkout-settings", { method: "POST", body: JSON.stringify({ store_id: storeId, settings: { version: 1, fields: payload } }) });
    if (status === 200 && data.success) {
      setSaved(data.settings.fields);
      setDraft(data.settings.fields);
      setNotice({ type: "ok", text: t("checkoutSettings.saved") });
      const changed = [...FIELD_ORDER, "location_picker"].filter((n) => JSON.stringify(saved[n]) !== JSON.stringify(data.settings.fields[n]));
      logStoreActivity(storeId, "checkout_settings_saved", { changed_fields: changed });
    } else {
      setNotice({ type: "error", text: data.error || t("checkoutSettings.errorSave") });
    }
    setSaving(false);
  };

  const th = { textAlign: "left", fontSize: 10.5, color: "var(--ne-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", padding: "6px 8px", whiteSpace: "nowrap" };
  const td = { padding: "8px", verticalAlign: "middle", borderTop: "1px solid var(--ne-border)" };
  const inp = { ...settingsInputStyle, marginBottom: 0, padding: "7px 10px", fontSize: 12.5, minWidth: 130 };
  const btn = (primary, disabled) => ({ padding: "8px 18px", borderRadius: 9, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 });

  if (loading) return <p style={{ padding: "1.5rem", margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;
  if (!draft) return <div style={{ padding: "1.5rem" }}><p style={{ color: "var(--ne-danger)", fontSize: 13 }}>{loadError}</p></div>;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 980, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--ne-text)" }}>{t("checkoutSettings.title")}</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.5 }}>{t("checkoutSettings.intro")}</p>
      {loadError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{loadError}</p>}

      <SettingsCard style={{ padding: "0.5rem 0.75rem", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>{t("checkoutSettings.colField")}</th>
              <th style={th}>{t("checkoutSettings.colVisible")}</th>
              <th style={th}>{t("checkoutSettings.colRequired")}</th>
              <th style={th}>{t("checkoutSettings.colLabel")}</th>
              <th style={th}>{t("checkoutSettings.colPlaceholder")}</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_ORDER.map((n) => {
              const f = draft[n];
              const locked = LOCKED.includes(n);
              return (
                <tr key={n}>
                  <td style={{ ...td, minWidth: 150 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{t(`checkoutSettings.field.${n}`)}</div>
                    {locked && <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 2 }}>{t(n === "province" ? "checkoutSettings.provinceNote" : "checkoutSettings.lockedNote")}</div>}
                    {n === "subarea" && <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 2 }}>{t("checkoutSettings.subareaNote")}</div>}
                  </td>
                  <td style={td}><Toggle on={locked ? true : f.visible} disabled={locked} label={`${t("checkoutSettings.colVisible")}: ${t(`checkoutSettings.field.${n}`)}`} onChange={(v) => setField(n, { visible: v })} /></td>
                  <td style={td}><Toggle on={locked ? true : f.required} disabled={locked} label={`${t("checkoutSettings.colRequired")}: ${t(`checkoutSettings.field.${n}`)}`} onChange={(v) => setField(n, { required: v })} /></td>
                  <td style={td}><input style={inp} maxLength={MAX_TEXT} value={f.label} placeholder={DEFAULT_LABELS[n]} onChange={(e) => setField(n, { label: e.target.value })} /></td>
                  <td style={td}><input style={inp} maxLength={MAX_TEXT} value={f.placeholder} placeholder={DEFAULT_PLACEHOLDERS[n]} onChange={(e) => setField(n, { placeholder: e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ margin: "8px 8px 4px", fontSize: 11, color: "var(--ne-muted)" }}>{t("checkoutSettings.labelHint")}</p>
      </SettingsCard>

      <SettingsCard>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Toggle on={draft.location_picker?.enabled !== false} label={t("checkoutSettings.locationPicker")} onChange={(v) => setDraft((d) => ({ ...d, location_picker: { enabled: v } }))} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{t("checkoutSettings.locationPicker")}</div>
            <div style={{ fontSize: 11.5, color: "var(--ne-muted)", marginTop: 2, lineHeight: 1.5 }}>{t("checkoutSettings.locationPickerHelp")}</div>
          </div>
        </div>
      </SettingsCard>

      {!contactOk && <p style={{ color: "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{t("checkoutSettings.contactRule")}</p>}
      {notice && <p style={{ color: notice.type === "ok" ? "var(--ne-success)" : "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{notice.text}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <button type="button" style={btn(true, !canSave)} disabled={!canSave} onClick={save}>{saving ? t("checkoutSettings.saving") : t("action.save")}</button>
        <button type="button" style={btn(false, !dirty || saving)} disabled={!dirty || saving} onClick={() => { setDraft(saved); setNotice(null); }}>{t("checkoutSettings.discard")}</button>
        <button type="button" style={btn(false, saving)} disabled={saving} onClick={() => { setDraft(defaults); setNotice(null); }}>{t("checkoutSettings.resetDefaults")}</button>
        {dirty && <span style={{ alignSelf: "center", fontSize: 11.5, color: "var(--ne-warning)" }}>{t("checkoutSettings.unsaved")}</span>}
      </div>

      <SettingsCard>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>{t("checkoutSettings.previewTitle")}</div>
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          {FIELD_ORDER.filter((n) => LOCKED.includes(n) || draft[n].visible).map((n) => {
            const req = LOCKED.includes(n) || draft[n].required;
            return (
              <div key={n}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ne-muted)", marginBottom: 4 }}>
                  {draft[n].label.trim() || DEFAULT_LABELS[n]}{req ? " *" : ""}
                </div>
                <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-muted-2)", fontSize: 12.5 }}>
                  {draft[n].placeholder.trim() || DEFAULT_PLACEHOLDERS[n]}
                </div>
              </div>
            );
          })}
          {draft.location_picker?.enabled !== false && (
            <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", color: "var(--ne-text)", fontSize: 12.5, fontWeight: 700, textAlign: "center" }}>{t("checkoutSettings.previewLocateButton")}</div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
