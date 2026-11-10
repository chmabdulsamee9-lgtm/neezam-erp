import { useState, useEffect, useMemo } from "react";
import { useLanguage, useTranslation } from "../i18n";
import { SettingsCard, settingsInputStyle, settingsLabelStyle } from "../components/SettingsUI";
import Toggle from "../components/Toggle";
import { workerFetch, logStoreActivity } from "../lib/storeApi";

// Settings > Payments. Only Cash on Delivery exists today; the list shape is ready for more methods.
export default function PaymentSettings({ storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { status, data } = await workerFetch(cfUrl, `/get-payment-settings?store_id=${storeId}`);
      if (!alive) return;
      if (status !== 200 || !data.settings) setLoadError(data.error || t("storePayments.errorLoad"));
      else {
        if (data.error) setLoadError(data.error);
        setSaved(data.settings);
        setDraft(data.settings);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [storeId, cfUrl]);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const setMethod = (key, patch) => setDraft((d) => ({ ...d, methods: d.methods.map((m) => (m.key === key ? { ...m, ...patch } : m)) }));
  const anyEnabled = !!draft && draft.methods.some((m) => m.enabled);
  const canSave = dirty && anyEnabled && !saving;

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const { status, data } = await workerFetch(cfUrl, "/save-payment-settings", { method: "POST", body: JSON.stringify({ store_id: storeId, settings: { version: 1, methods: draft.methods } }) });
    if (status === 200 && data.success) {
      setSaved(data.settings);
      setDraft(data.settings);
      setNotice({ type: "ok", text: t("storePayments.saved") });
      logStoreActivity(storeId, "payment_settings_saved", { methods: data.settings.methods.filter((m) => m.enabled).map((m) => m.key) });
    } else {
      setNotice({ type: "error", text: data.error || t("storePayments.errorSave") });
    }
    setSaving(false);
  };

  const inp = { ...settingsInputStyle, marginBottom: 0 };
  const btn = (primary, disabled) => ({ padding: "8px 18px", borderRadius: 9, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 });

  if (loading) return <p style={{ padding: "1.5rem", margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;
  if (!draft) return <div style={{ padding: "1.5rem" }}><p style={{ color: "var(--ne-danger)", fontSize: 13 }}>{loadError}</p></div>;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 760, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--ne-text)" }}>{t("storePayments.title")}</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.5 }}>{t("storePayments.intro")}</p>
      {loadError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{loadError}</p>}

      {draft.methods.map((m) => (
        <SettingsCard key={m.key}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: m.enabled ? 14 : 0 }}>
            <Toggle on={m.enabled} label={t("storePayments.enable")} onChange={(v) => setMethod(m.key, { enabled: v })} />
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ne-text)" }}>{t(`storePayments.method.${m.key}`)}</div>
          </div>
          {m.enabled && (
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={settingsLabelStyle}>{t("storePayments.label")}</label>
                <input style={inp} maxLength={40} value={m.label} onChange={(e) => setMethod(m.key, { label: e.target.value })} />
              </div>
              <div>
                <label style={settingsLabelStyle}>{t("storePayments.instructions")}</label>
                <textarea style={{ ...inp, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} maxLength={300} value={m.instructions} onChange={(e) => setMethod(m.key, { instructions: e.target.value })} />
                <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 3 }}>{t("storePayments.instructionsHelp")} ({m.instructions.length}/300)</div>
              </div>
            </div>
          )}
        </SettingsCard>
      ))}

      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ne-muted)" }}>{t("storePayments.onlineNote")}</p>
      {!anyEnabled && <p style={{ color: "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{t("storePayments.mustEnable")}</p>}
      {notice && <p style={{ color: notice.type === "ok" ? "var(--ne-success)" : "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{notice.text}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={btn(true, !canSave)} disabled={!canSave} onClick={save}>{saving ? t("checkoutSettings.saving") : t("action.save")}</button>
        <button type="button" style={btn(false, !dirty || saving)} disabled={!dirty || saving} onClick={() => { setDraft(saved); setNotice(null); }}>{t("checkoutSettings.discard")}</button>
        {dirty && <span style={{ alignSelf: "center", fontSize: 11.5, color: "var(--ne-warning)" }}>{t("checkoutSettings.unsaved")}</span>}
      </div>
    </div>
  );
}
