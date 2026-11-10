import { useState, useEffect, useMemo } from "react";
import { useLanguage, useTranslation } from "../i18n";
import Icon from "../components/Icon";
import { SettingsCard, settingsInputStyle, settingsLabelStyle } from "../components/SettingsUI";
import Toggle from "../components/Toggle";
import ChipsInput from "../components/ChipsInput";
import { workerFetch, publicFetch, logStoreActivity } from "../lib/storeApi";

// Settings > Taxes and duties. Taxes are added ON TOP of prices. The worker validates and computes;
// the Test box calls /preview-shipping with the unsaved draft so it matches checkout exactly.

const MAX_TAXES = 10;
const BASES = ["subtotal", "shipping", "subtotal_shipping"];
const numStr = (v) => (v === null || v === undefined ? "" : String(v));
// "" -> 0; a number string -> number; anything else is passed through so the server rejects it with a message
const parseRate = (s) => { const x = String(s ?? "").trim(); if (x === "") return 0; const n = Number(x); return Number.isFinite(n) ? n : x; };

const fromServer = (s) => ({
  taxes: (s.taxes || []).map((x) => ({
    id: x.id, name: x.name, enabled: !!x.enabled, base: x.base, rate: numStr(x.rate_percent),
    provinceRates: (x.province_rates || []).map((r) => ({ province: r.province, rate: numStr(r.rate_percent) })),
    only: x.only_provinces || [],
  })),
});
const toServer = (d) => ({
  version: 1,
  taxes: d.taxes.map((x) => ({
    id: x.id, name: x.name.trim(), enabled: x.enabled, base: x.base, rate_percent: parseRate(x.rate),
    province_rates: x.provinceRates.filter((r) => r.province).map((r) => ({ province: r.province, rate_percent: parseRate(r.rate) })),
    only_provinces: x.only,
  })),
});
const newTax = () => ({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, name: "", enabled: false, base: "subtotal", rate: "0", provinceRates: [], only: [] });

function TaxCard({ tax, index, geoNames, currency, onChange, onDelete, t }) {
  const [open, setOpen] = useState(!tax.name);
  const set = (patch) => onChange({ ...tax, ...patch });
  const inp = { ...settingsInputStyle, marginBottom: 0, padding: "7px 10px", fontSize: 12.5 };
  const label = settingsLabelStyle;
  const baseLabel = (b) => t(b === "subtotal" ? "taxes.baseSubtotal" : b === "shipping" ? "taxes.baseShipping" : "taxes.baseBoth");
  const iconBtn = { border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", borderRadius: 7, padding: "4px 7px", cursor: "pointer", display: "inline-flex" };
  const isTemplate = String(tax.id).startsWith("tpl-");
  return (
    <div style={{ border: "1px solid var(--ne-border)", borderRadius: 11, marginBottom: 10, background: "var(--ne-surface-2)", opacity: tax.enabled ? 1 : 0.8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{tax.name.trim() || t("storeTaxes.unnamed").replace("{n}", index + 1)}</div>
          <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>{baseLabel(tax.base)} · {tax.rate || 0}%{tax.provinceRates.length ? ` · ${tax.provinceRates.length} ${t("storeTaxes.overridesCount")}` : ""}</div>
        </div>
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Toggle on={tax.enabled} label={t("storeTaxes.enabled")} onChange={(v) => set({ enabled: v })} />
          <button type="button" style={iconBtn} title={t("action.delete")} aria-label={t("action.delete")} onClick={onDelete}><Icon name="trash" size={12} /></button>
        </div>
      </div>
      {open && (
        <div style={{ padding: "4px 12px 14px", borderTop: "1px solid var(--ne-border)", display: "grid", gap: 12 }}>
          {isTemplate && <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--ne-warning)" }}>{t("storeTaxes.templateNote")}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginTop: 10 }}>
            <div><label style={label}>{t("storeTaxes.name")}</label><input style={inp} maxLength={60} value={tax.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div><label style={label}>{t("storeTaxes.rate")}</label><input style={inp} inputMode="decimal" value={tax.rate} onChange={(e) => set({ rate: e.target.value })} /></div>
          </div>
          <div>
            <label style={label}>{t("storeTaxes.base")}</label>
            <select style={inp} value={tax.base} onChange={(e) => set({ base: e.target.value })}>
              {BASES.map((b) => <option key={b} value={b}>{baseLabel(b)}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>{t("storeTaxes.provinceRates")}</label>
            <div style={{ fontSize: 10.5, color: "var(--ne-muted)", margin: "0 0 6px" }}>{t("storeTaxes.provinceRatesHelp")}</div>
            {tax.provinceRates.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <select style={{ ...inp, flex: "1 1 160px" }} value={r.province} onChange={(e) => set({ provinceRates: tax.provinceRates.map((x, j) => (j === i ? { ...x, province: e.target.value } : x)) })}>
                  <option value="">{t("storeTaxes.provincePick")}</option>
                  {[...new Set([...geoNames, r.province].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input style={{ ...inp, width: 90 }} inputMode="decimal" aria-label={t("storeTaxes.rate")} value={r.rate} onChange={(e) => set({ provinceRates: tax.provinceRates.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)) })} />
                <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>%</span>
                <button type="button" style={iconBtn} aria-label={t("action.delete")} onClick={() => set({ provinceRates: tax.provinceRates.filter((_, j) => j !== i) })}><Icon name="trash" size={12} /></button>
              </div>
            ))}
            <button type="button" style={{ ...iconBtn, padding: "6px 10px", fontSize: 12, gap: 5, alignItems: "center" }} onClick={() => set({ provinceRates: [...tax.provinceRates, { province: "", rate: "0" }] })}><Icon name="plus" size={11} /> {t("storeTaxes.addProvinceRate")}</button>
          </div>
          <div>
            <label style={label}>{t("storeTaxes.onlyProvinces")}</label>
            <ChipsInput t={t} values={tax.only} options={geoNames} allowFree={geoNames.length === 0} placeholder={t("storeTaxes.anyProvince")} hint={t("storeTaxes.onlyHelp")} onChange={(v) => set({ only: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaxSettings({ storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [currency, setCurrency] = useState("PKR");
  const [geoNames, setGeoNames] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [test, setTest] = useState({ subtotal: "2000", shipping: "200", province: "" });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [s, g] = await Promise.all([workerFetch(cfUrl, `/get-tax-settings?store_id=${storeId}`), publicFetch(cfUrl, "/get-geo-data")]);
      if (!alive) return;
      if (s.status !== 200 || !s.data.settings) setLoadError(s.data.error || t("storeTaxes.errorLoad"));
      else {
        if (s.data.error) setLoadError(s.data.error);
        const d = fromServer(s.data.settings);
        setSaved(d);
        setDraft(d);
        if (s.data.currency) setCurrency(s.data.currency);
      }
      setGeoNames((Array.isArray(g.data?.provinces) ? g.data.provinces : []).map((p) => p.name));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [storeId, cfUrl]);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const setTax = (i, tax) => setDraft((d) => ({ ...d, taxes: d.taxes.map((x, j) => (j === i ? tax : x)) }));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const { status, data } = await workerFetch(cfUrl, "/save-tax-settings", { method: "POST", body: JSON.stringify({ store_id: storeId, settings: toServer(draft) }) });
    if (status === 200 && data.success) {
      const d = fromServer(data.settings);
      setSaved(d);
      setDraft(d);
      setNotice({ type: "ok", text: t("storeTaxes.saved") });
      logStoreActivity(storeId, "tax_settings_saved", { taxes: data.settings.taxes.length, enabled: data.settings.taxes.filter((x) => x.enabled).length });
    } else {
      setNotice({ type: "error", text: data.error || t("storeTaxes.errorSave") });
    }
    setSaving(false);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const { status, data } = await workerFetch(cfUrl, "/preview-shipping", {
      method: "POST",
      body: JSON.stringify({ store_id: storeId, subtotal: Number(test.subtotal) || 0, shipping_fee: Number(test.shipping) || 0, province: test.province, tax_settings: toServer(draft) }),
    });
    setTestResult(status === 200 && Array.isArray(data.taxes) ? { ok: true, ...data } : { ok: false, error: data.error || t("storeTaxes.errorTest") });
    setTesting(false);
  };

  const inp = { ...settingsInputStyle, marginBottom: 0, padding: "7px 10px", fontSize: 12.5 };
  const btn = (primary, disabled) => ({ padding: "8px 18px", borderRadius: 9, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, display: "inline-flex", alignItems: "center", gap: 6 });
  const money = (n) => `${currency} ${Number(n).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

  if (loading) return <p style={{ padding: "1.5rem", margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;
  if (!draft) return <div style={{ padding: "1.5rem" }}><p style={{ color: "var(--ne-danger)", fontSize: 13 }}>{loadError}</p></div>;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--ne-text)" }}>{t("storeTaxes.title")}</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.5 }}>{t("storeTaxes.intro")}</p>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--ne-warning)", lineHeight: 1.5 }}>{t("storeTaxes.accountant")}</p>
      {loadError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{loadError}</p>}

      <SettingsCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14, color: "var(--ne-text)" }}>{t("storeTaxes.listTitle")}</h3>
          <button type="button" style={btn(false, draft.taxes.length >= MAX_TAXES)} disabled={draft.taxes.length >= MAX_TAXES} onClick={() => setDraft((d) => ({ ...d, taxes: [...d.taxes, newTax()] }))}><Icon name="plus" size={12} /> {t("storeTaxes.addTax")}</button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ne-muted)", lineHeight: 1.55 }}>{t("storeTaxes.evalHelp")}</p>
        {draft.taxes.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ne-muted)", margin: 0 }}>{t("storeTaxes.noTaxes")}</p>}
        {draft.taxes.map((tx, i) => (
          <TaxCard key={tx.id} tax={tx} index={i} geoNames={geoNames} currency={currency} t={t} onChange={(x) => setTax(i, x)} onDelete={() => setDraft((d) => ({ ...d, taxes: d.taxes.filter((_, j) => j !== i) }))} />
        ))}
        {draft.taxes.length >= MAX_TAXES && <p style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{t("storeTaxes.maxTaxes")}</p>}
      </SettingsCard>

      {notice && <p style={{ color: notice.type === "ok" ? "var(--ne-success)" : "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{notice.text}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <button type="button" style={btn(true, !dirty || saving)} disabled={!dirty || saving} onClick={save}>{saving ? t("checkoutSettings.saving") : t("action.save")}</button>
        <button type="button" style={btn(false, !dirty || saving)} disabled={!dirty || saving} onClick={() => { setDraft(saved); setNotice(null); setTestResult(null); }}>{t("checkoutSettings.discard")}</button>
        {dirty && <span style={{ alignSelf: "center", fontSize: 11.5, color: "var(--ne-warning)" }}>{t("checkoutSettings.unsaved")}</span>}
      </div>

      <SettingsCard>
        <h3 style={{ margin: "0 0 6px", fontSize: 14, color: "var(--ne-text)" }}>{t("storeTaxes.testTitle")}</h3>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("storeTaxes.testHint")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <div><label style={settingsLabelStyle}>{t("storeTaxes.testSubtotal")} ({currency})</label><input style={inp} inputMode="decimal" value={test.subtotal} onChange={(e) => setTest({ ...test, subtotal: e.target.value })} /></div>
          <div><label style={settingsLabelStyle}>{t("storeTaxes.testShipping")} ({currency})</label><input style={inp} inputMode="decimal" value={test.shipping} onChange={(e) => setTest({ ...test, shipping: e.target.value })} /></div>
          <div><label style={settingsLabelStyle}>{t("storeTaxes.testProvince")}</label>
            <select style={inp} value={test.province} onChange={(e) => setTest({ ...test, province: e.target.value })}>
              <option value="">{t("storeTaxes.provincePick")}</option>
              {geoNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" style={btn(false, testing)} disabled={testing} onClick={runTest}>{testing ? t("common.loading") : t("storeTaxes.testRun")}</button>
        </div>
        {testResult && (testResult.ok ? (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--ne-text)" }}>
            {testResult.tax_pending_province && <div style={{ color: "var(--ne-muted)" }}>{t("storeTaxes.testPending")}</div>}
            {!testResult.tax_pending_province && testResult.taxes.length === 0 && <div style={{ color: "var(--ne-muted)" }}>{t("storeTaxes.testNone")}</div>}
            {testResult.taxes.map((x) => (
              <div key={x.id} style={{ display: "flex", justifyContent: "space-between", maxWidth: 420, padding: "3px 0" }}><span>{x.name} ({x.rate_percent}%)</span><b>{money(x.amount)}</b></div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 420, padding: "6px 0 0", borderTop: "1px solid var(--ne-border)", marginTop: 6 }}><span>{t("storeTaxes.testTotal")}</span><b>{money(testResult.total)}</b></div>
          </div>
        ) : <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--ne-danger)" }}>{testResult.error}</p>)}
      </SettingsCard>
    </div>
  );
}
