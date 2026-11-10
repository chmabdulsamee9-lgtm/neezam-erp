import { useState, useEffect, useMemo } from "react";
import { useLanguage, useTranslation } from "../i18n";
import InitialsAvatar from "../components/InitialsAvatar";
import { SettingsCard, settingsInputStyle, settingsLabelStyle } from "../components/SettingsUI";
import { workerFetch, publicFetch, logStoreActivity } from "../lib/storeApi";
import { formatOrderId } from "../lib/units";

// Settings > General: store name + domain, business details, contact, defaults and order ID format.
// The store NAME stays in stores.store_name (the same value the brand switcher shows); everything else
// is stores.general_settings. Weight unit is display only (storage is grams everywhere).

const OFFSET_RE = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/;
const FALLBACK_ZONES = ["Asia/Karachi", "UTC", "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Riyadh", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

/** [{ id, label, minutes }] sorted by offset: "(GMT+05:00) Asia/Karachi" */
function buildZones(current) {
  let ids = FALLBACK_ZONES;
  try { if (typeof Intl.supportedValuesOf === "function") ids = Intl.supportedValuesOf("timeZone"); } catch { /* fallback list */ }
  if (!ids.includes("UTC")) ids = [...ids, "UTC"];
  if (current && !ids.includes(current)) ids = [...ids, current];
  const now = new Date();
  return ids.map((id) => {
    let minutes = 0;
    try {
      const part = new Intl.DateTimeFormat("en", { timeZone: id, timeZoneName: "longOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value || "GMT";
      const m = OFFSET_RE.exec(part);
      if (m) minutes = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
    } catch { /* offset unknown */ }
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    return { id, minutes, label: `(GMT${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}) ${id.replace(/_/g, " ")}` };
  }).sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id));
}

const emptyDraft = (settings, storeName, nextOrder) => ({
  storeName: storeName || "",
  legal_name: settings.business.legal_name, address1: settings.business.address1, address2: settings.business.address2, city: settings.business.city,
  province: settings.business.province, postal_code: settings.business.postal_code,
  email: settings.contact.email, phone: settings.contact.phone,
  weight_unit: settings.defaults.weight_unit, time_zone: settings.defaults.time_zone,
  prefix: settings.order_id.prefix, suffix: settings.order_id.suffix, nextOrder: String(nextOrder),
});

export default function GeneralSettings({ storeId, cfUrl, canEdit, onOpenOnlineStore, onSaved }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [info, setInfo] = useState({ domain: null, source: null });
  const [provinces, setProvinces] = useState([]);
  const [zoneFilter, setZoneFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [g, geo] = await Promise.all([workerFetch(cfUrl, `/get-general-settings?store_id=${storeId}`), publicFetch(cfUrl, "/get-geo-data")]);
      if (!alive) return;
      if (g.status !== 200 || !g.data.settings) setLoadError(g.data.error || t("storeGeneral.errorLoad"));
      else {
        if (g.data.error) setLoadError(g.data.error);
        const d = emptyDraft(g.data.settings, g.data.store_name, g.data.next_order_number);
        setSaved(d);
        setDraft(d);
        setInfo({ domain: g.data.primary_domain, source: g.data.primary_domain_source });
      }
      setProvinces((Array.isArray(geo.data?.provinces) ? geo.data.provinces : []).map((p) => p.name));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [storeId, cfUrl]);

  const zones = useMemo(() => buildZones(draft?.time_zone), [draft?.time_zone]);
  const visibleZones = useMemo(() => {
    const q = zoneFilter.trim().toLowerCase();
    const list = q ? zones.filter((z) => z.label.toLowerCase().includes(q)) : zones;
    const cur = zones.find((z) => z.id === draft?.time_zone);
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }, [zones, zoneFilter, draft?.time_zone]);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const nextNum = Number(draft?.nextOrder);
  const previewOk = Number.isInteger(nextNum) && nextNum >= 1;
  const preview = previewOk ? [0, 1, 2].map((i) => formatOrderId(draft.prefix, draft.suffix, nextNum + i)).join(", ") + ", ..." : "";

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const body = {
      store_id: storeId,
      settings: {
        business: { legal_name: draft.legal_name, address1: draft.address1, address2: draft.address2, city: draft.city, province: draft.province, postal_code: draft.postal_code, country: "Pakistan" },
        contact: { email: draft.email, phone: draft.phone },
        defaults: { unit_system: "metric", weight_unit: draft.weight_unit, time_zone: draft.time_zone, currency: "PKR" },
        order_id: { prefix: draft.prefix, suffix: draft.suffix },
      },
    };
    if (draft.storeName.trim() !== saved.storeName) body.store_name = draft.storeName.trim();
    if (draft.nextOrder !== saved.nextOrder) body.next_order_number = draft.nextOrder.trim() === "" ? null : Number(draft.nextOrder);
    const { status, data } = await workerFetch(cfUrl, "/save-general-settings", { method: "POST", body: JSON.stringify(body) });
    if (status === 200 && data.success) {
      const d = emptyDraft(data.settings, data.store_name, data.next_order_number);
      const changed = Object.keys(d).filter((k) => d[k] !== saved[k]);
      setSaved(d);
      setDraft(d);
      setNotice({ type: "ok", text: t("storeGeneral.saved") });
      logStoreActivity(storeId, "general_settings_saved", { changed_fields: changed });
      onSaved?.({ storeName: data.store_name });
    } else {
      setNotice({ type: "error", text: data.error || t("storeGeneral.errorSave") });
    }
    setSaving(false);
  };

  const inp = { ...settingsInputStyle, marginBottom: 0 };
  const lab = settingsLabelStyle;
  const help = { fontSize: 10.5, color: "var(--ne-muted)", marginTop: 4, lineHeight: 1.45 };
  const h3 = { margin: "0 0 12px", fontSize: 14, color: "var(--ne-text)" };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 };
  const btn = (primary, disabled) => ({ padding: "8px 18px", borderRadius: 9, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 });
  const ro = !canEdit;

  if (loading) return <p style={{ padding: "1.5rem", margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;
  if (!draft) return <div style={{ padding: "1.5rem" }}><p style={{ color: "var(--ne-danger)", fontSize: 13 }}>{loadError}</p></div>;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 820, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--ne-text)" }}>{t("storeGeneral.title")}</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--ne-muted)" }}>{ro ? t("storeGeneral.readOnlyNote") : t("storeGeneral.intro")}</p>
      {loadError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{loadError}</p>}

      <SettingsCard>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <InitialsAvatar name={draft.storeName || "S"} size={56} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={lab}>{t("storeGeneral.storeName")}</label>
            <input style={inp} maxLength={80} disabled={ro} value={draft.storeName} onChange={(e) => set({ storeName: e.target.value })} />
            <div style={{ ...help, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{t("storeGeneral.domain")}: <b style={{ color: "var(--ne-text)" }}>{info.domain || t("storeGeneral.domainNone")}</b>{info.source === "subdomain" ? ` (${t("storeGeneral.domainSubdomain")})` : ""}</span>
              {onOpenOnlineStore && <button type="button" onClick={onOpenOnlineStore} style={{ border: "none", background: "transparent", color: "var(--ne-accent)", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0, textDecoration: "underline" }}>{t("storeGeneral.openOnlineStore")}</button>}
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <h3 style={h3}>{t("storeGeneral.businessTitle")}</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={lab}>{t("storeGeneral.legalName")}</label><input style={inp} maxLength={120} disabled={ro} value={draft.legal_name} onChange={(e) => set({ legal_name: e.target.value })} /></div>
          <div style={grid}>
            <div><label style={lab}>{t("storeGeneral.country")}</label><input style={{ ...inp, opacity: 0.7 }} disabled value="Pakistan" readOnly /></div>
            <div><label style={lab}>{t("storeGeneral.address1")}</label><input style={inp} maxLength={120} disabled={ro} value={draft.address1} onChange={(e) => set({ address1: e.target.value })} /></div>
          </div>
          <div><label style={lab}>{t("storeGeneral.address2")}</label><input style={inp} maxLength={120} disabled={ro} value={draft.address2} onChange={(e) => set({ address2: e.target.value })} /></div>
          <div style={grid}>
            <div><label style={lab}>{t("storeGeneral.city")}</label><input style={inp} maxLength={120} disabled={ro} value={draft.city} onChange={(e) => set({ city: e.target.value })} /></div>
            <div><label style={lab}>{t("storeGeneral.province")}</label>
              <select style={inp} disabled={ro} value={draft.province} onChange={(e) => set({ province: e.target.value })}>
                <option value="">{t("storeGeneral.provincePick")}</option>
                {[...new Set([...provinces, draft.province].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
              </select></div>
            <div><label style={lab}>{t("storeGeneral.postal")}</label><input style={inp} maxLength={10} disabled={ro} value={draft.postal_code} onChange={(e) => set({ postal_code: e.target.value })} /></div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <h3 style={h3}>{t("storeGeneral.contactTitle")}</h3>
        <div style={grid}>
          <div><label style={lab}>{t("storeGeneral.email")}</label><input style={inp} type="email" maxLength={254} disabled={ro} value={draft.email} onChange={(e) => set({ email: e.target.value })} /></div>
          <div><label style={lab}>{t("storeGeneral.phone")}</label><input style={inp} inputMode="tel" maxLength={20} disabled={ro} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
        </div>
        <div style={help}>{t("storeGeneral.emailHelp")}</div>
      </SettingsCard>

      <SettingsCard>
        <h3 style={h3}>{t("storeGeneral.defaultsTitle")}</h3>
        <div style={grid}>
          <div><label style={lab}>{t("storeGeneral.currency")}</label><input style={{ ...inp, opacity: 0.7 }} disabled readOnly value={t("storeGeneral.currencyValue")} /><div style={help}>{t("storeGeneral.currencyHelp")}</div></div>
          <div><label style={lab}>{t("storeGeneral.unitSystem")}</label>
            <select style={inp} disabled value="metric" onChange={() => {}}><option value="metric">{t("storeGeneral.unitMetric")}</option></select></div>
          <div><label style={lab}>{t("storeGeneral.weightUnit")}</label>
            <select style={inp} disabled={ro} value={draft.weight_unit} onChange={(e) => set({ weight_unit: e.target.value })}>
              <option value="kg">{t("storeGeneral.weightKg")}</option><option value="g">{t("storeGeneral.weightG")}</option>
            </select></div>
        </div>
        <div style={help}>{t("storeGeneral.weightHelp")}</div>
        <div style={{ marginTop: 14 }}>
          <label style={lab}>{t("storeGeneral.timeZone")}</label>
          <input style={{ ...inp, marginBottom: 6 }} disabled={ro} placeholder={t("storeGeneral.timeZoneFilter")} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} />
          <select style={inp} disabled={ro} value={draft.time_zone} onChange={(e) => set({ time_zone: e.target.value })}>
            {visibleZones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
          <div style={help}>{t("storeGeneral.timeZoneHelp")}</div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <h3 style={h3}>{t("storeGeneral.orderIdTitle")}</h3>
        <div style={grid}>
          <div><label style={lab}>{t("storeGeneral.prefix")}</label><input style={inp} maxLength={10} disabled={ro} value={draft.prefix} onChange={(e) => set({ prefix: e.target.value })} /></div>
          <div><label style={lab}>{t("storeGeneral.suffix")}</label><input style={inp} maxLength={10} disabled={ro} value={draft.suffix} onChange={(e) => set({ suffix: e.target.value })} /></div>
          <div><label style={lab}>{t("storeGeneral.nextOrder")}</label><input style={inp} inputMode="numeric" disabled={ro} value={draft.nextOrder} onChange={(e) => set({ nextOrder: e.target.value.replace(/[^\d]/g, "") })} /><div style={help}>{t("storeGeneral.nextOrderHelp")}</div></div>
        </div>
        <div style={help}>{t("storeGeneral.orderIdHelp")}</div>
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--ne-text)" }}>
          {previewOk ? t("storeGeneral.orderIdPreview").replace("{preview}", preview) : <span style={{ color: "var(--ne-danger)" }}>{t("storeGeneral.nextOrderInvalid")}</span>}
        </div>
      </SettingsCard>

      {notice && <p style={{ color: notice.type === "ok" ? "var(--ne-success)" : "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{notice.text}</p>}
      {!ro && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={btn(true, !dirty || saving || !previewOk)} disabled={!dirty || saving || !previewOk} onClick={save}>{saving ? t("checkoutSettings.saving") : t("action.save")}</button>
          <button type="button" style={btn(false, !dirty || saving)} disabled={!dirty || saving} onClick={() => { setDraft(saved); setNotice(null); }}>{t("checkoutSettings.discard")}</button>
          {dirty && <span style={{ alignSelf: "center", fontSize: 11.5, color: "var(--ne-warning)" }}>{t("checkoutSettings.unsaved")}</span>}
        </div>
      )}
    </div>
  );
}
