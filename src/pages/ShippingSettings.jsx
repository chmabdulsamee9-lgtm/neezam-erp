import { useState, useEffect, useMemo } from "react";
import { useLanguage, useTranslation } from "../i18n";
import Icon from "../components/Icon";
import { SettingsCard, settingsInputStyle, settingsLabelStyle } from "../components/SettingsUI";
import { workerFetch, publicFetch, logStoreActivity } from "../lib/storeApi";
import ChipsInput from "../components/ChipsInput";
import { gramsToUnit, unitToGrams } from "../lib/units";

// Settings > Shipping and delivery. Flat fee, free-shipping threshold and ordered conditional
// rules (subtotal / weight / province / city / area). The worker validates and evaluates; the
// "Test" box calls /preview-shipping with the unsaved draft so what you see is what checkout uses.

const MAX_RULES = 20;
const MAX_ENTRIES = 100;
const MAX_ENTRY_LEN = 60;
const norm = (s) => String(s || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const numStr = (v) => (v === null || v === undefined ? "" : String(v));
const gramsToDisp = (g, unit) => { const v = gramsToUnit(g, unit); return v === null ? "" : String(v); };
// "" -> null; a number string -> number; anything else is passed through so the server rejects it with a message
const parseNum = (s) => { const x = String(s ?? "").trim(); if (x === "") return null; const n = Number(x); return Number.isFinite(n) ? n : x; };
const dispToGrams = (s, unit) => { const v = parseNum(s); return typeof v === "number" ? unitToGrams(v, unit) : v; };

function fromServer(s, unit) {
  return {
    defaultWeightKg: gramsToDisp(s.default_weight_grams, unit),
    flatFee: numStr(s.flat_fee),
    freeEnabled: !!s.free_shipping?.enabled,
    freeMin: numStr(s.free_shipping?.min_subtotal),
    rules: (s.rules || []).map((r) => ({
      id: r.id, name: r.name || "", enabled: r.enabled !== false, fee: numStr(r.fee),
      subtotalMin: numStr(r.conditions?.subtotal_min), subtotalMax: numStr(r.conditions?.subtotal_max),
      weightMinKg: gramsToDisp(r.conditions?.weight_min_grams, unit), weightMaxKg: gramsToDisp(r.conditions?.weight_max_grams, unit),
      provinces: r.conditions?.provinces || [], cities: r.conditions?.cities || [], areas: r.conditions?.areas || [],
    })),
  };
}

function toServer(d, unit) {
  return {
    version: 1,
    default_weight_grams: dispToGrams(d.defaultWeightKg, unit),
    flat_fee: parseNum(d.flatFee) ?? 0,
    free_shipping: { enabled: d.freeEnabled, min_subtotal: parseNum(d.freeMin) ?? 0 },
    rules: d.rules.map((r) => ({
      id: r.id, name: r.name.trim(), enabled: r.enabled, fee: parseNum(r.fee) ?? 0,
      conditions: {
        subtotal_min: parseNum(r.subtotalMin), subtotal_max: parseNum(r.subtotalMax),
        weight_min_grams: dispToGrams(r.weightMinKg, unit), weight_max_grams: dispToGrams(r.weightMaxKg, unit),
        provinces: r.provinces, cities: r.cities, areas: r.areas,
      },
    })),
  };
}

const newRule = () => ({ id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`), name: "", enabled: true, fee: "0", subtotalMin: "", subtotalMax: "", weightMinKg: "", weightMaxKg: "", provinces: [], cities: [], areas: [] });

const toggleStyle = (on) => ({ width: 34, height: 19, borderRadius: 10, border: "none", padding: 2, cursor: "pointer", background: on ? "var(--ne-accent)" : "var(--ne-border)", display: "inline-flex", alignItems: "center", justifyContent: on ? "flex-end" : "flex-start", flexShrink: 0 });
const Toggle = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={toggleStyle(on)}>
    <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff", display: "block" }} />
  </button>
);

function RuleCard({ rule, index, total, geo, currency, unit, onChange, onMove, onDelete, cfUrl, t }) {
  const [open, setOpen] = useState(!rule.name);
  const set = (patch) => onChange({ ...rule, ...patch });

  // option lists derived from the geo data
  const provinceOptions = geo.map((p) => p.name);
  const cityOptions = useMemo(() => {
    const picked = geo.filter((p) => rule.provinces.some((n) => norm(n) === norm(p.name) || (p.aliases || []).some((a) => norm(a) === norm(n))));
    const pool = picked.length ? picked : geo;
    const seen = new Set();
    const out = [];
    for (const p of pool) for (const c of p.cities) if (!seen.has(norm(c.name))) { seen.add(norm(c.name)); out.push(c.name); }
    return out;
  }, [geo, rule.provinces]);

  // areas for the chosen cities (a few at most), fetched from the public geo endpoint
  const [areaOptions, setAreaOptions] = useState([]);
  const citiesKey = rule.cities.join("|") + "#" + rule.provinces.join("|");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!rule.cities.length) { setAreaOptions([]); return; }
      const prov = rule.provinces.length === 1 ? rule.provinces[0] : "";
      const results = await Promise.all(rule.cities.slice(0, 5).map((c) => publicFetch(cfUrl, `/get-geo-areas?city=${encodeURIComponent(c)}${prov ? `&province=${encodeURIComponent(prov)}` : ""}`)));
      if (!alive) return;
      const seen = new Set();
      const out = [];
      for (const r of results) for (const a of r.data?.areas || []) if (!seen.has(norm(a))) { seen.add(norm(a)); out.push(a); }
      setAreaOptions(out);
    })();
    return () => { alive = false; };
  }, [citiesKey]);

  const label = settingsLabelStyle;
  const inp = { ...settingsInputStyle, marginBottom: 0, padding: "7px 10px", fontSize: 12.5 };
  const iconBtn = (disabled) => ({ border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", borderRadius: 7, padding: "4px 7px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, display: "inline-flex" });
  const summary = [
    rule.subtotalMin !== "" || rule.subtotalMax !== "" ? `${t("shippingSettings.subtotal")} ${rule.subtotalMin || "0"}–${rule.subtotalMax || "∞"}` : "",
    rule.weightMinKg !== "" || rule.weightMaxKg !== "" ? `${rule.weightMinKg || "0"}–${rule.weightMaxKg || "∞"} ${unit}` : "",
    rule.provinces.join(", "), rule.cities.join(", "), rule.areas.join(", "),
  ].filter(Boolean).join(" · ");

  return (
    <div style={{ border: "1px solid var(--ne-border)", borderRadius: 11, marginBottom: 10, background: "var(--ne-surface-2)", opacity: rule.enabled ? 1 : 0.65 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ne-muted)", minWidth: 18 }}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{rule.name.trim() || t("shippingSettings.unnamedRule").replace("{n}", index + 1)}</div>
          <div style={{ fontSize: 11, color: "var(--ne-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary || t("shippingSettings.matchesAll")}</div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)", whiteSpace: "nowrap" }}>{Number(rule.fee) === 0 ? t("shippingSettings.free") : `${currency} ${rule.fee}`}</span>
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Toggle on={rule.enabled} onChange={(v) => set({ enabled: v })} label={t("shippingSettings.ruleEnabled")} />
          <button type="button" style={iconBtn(index === 0)} disabled={index === 0} title={t("shippingSettings.moveUp")} aria-label={t("shippingSettings.moveUp")} onClick={() => onMove(-1)}><Icon name="arrowUp" size={12} /></button>
          <button type="button" style={iconBtn(index === total - 1)} disabled={index === total - 1} title={t("shippingSettings.moveDown")} aria-label={t("shippingSettings.moveDown")} onClick={() => onMove(1)}><Icon name="arrowDown" size={12} /></button>
          <button type="button" style={iconBtn(false)} title={t("action.delete")} aria-label={t("action.delete")} onClick={onDelete}><Icon name="trash" size={12} /></button>
        </div>
      </div>
      {open && (
        <div style={{ padding: "4px 12px 14px", borderTop: "1px solid var(--ne-border)", display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 10 }}>
            <div><label style={label}>{t("shippingSettings.ruleName")}</label><input style={inp} maxLength={60} value={rule.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div><label style={label}>{t("shippingSettings.ruleFee")} ({currency})</label><input style={inp} inputMode="decimal" value={rule.fee} onChange={(e) => set({ fee: e.target.value })} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div><label style={label}>{t("shippingSettings.subtotalMin")}</label><input style={inp} inputMode="decimal" value={rule.subtotalMin} onChange={(e) => set({ subtotalMin: e.target.value })} /></div>
            <div><label style={label}>{t("shippingSettings.subtotalMax")}</label><input style={inp} inputMode="decimal" value={rule.subtotalMax} onChange={(e) => set({ subtotalMax: e.target.value })} /></div>
            <div><label style={label}>{t("shippingSettings.weightMin")} ({unit})</label><input style={inp} inputMode="decimal" value={rule.weightMinKg} onChange={(e) => set({ weightMinKg: e.target.value })} /></div>
            <div><label style={label}>{t("shippingSettings.weightMax")} ({unit})</label><input style={inp} inputMode="decimal" value={rule.weightMaxKg} onChange={(e) => set({ weightMaxKg: e.target.value })} /></div>
          </div>
          <div><label style={label}>{t("shippingSettings.provinces")}</label>
            <ChipsInput t={t} values={rule.provinces} options={provinceOptions} allowFree={provinceOptions.length === 0} placeholder={t("shippingSettings.anyProvince")} onChange={(v) => set({ provinces: v })} /></div>
          <div><label style={label}>{t("shippingSettings.cities")}</label>
            <ChipsInput t={t} values={rule.cities} options={cityOptions} allowFree={cityOptions.length === 0} placeholder={t("shippingSettings.anyCity")} onChange={(v) => set({ cities: v })} /></div>
          <div><label style={label}>{t("shippingSettings.areas")}</label>
            <ChipsInput t={t} values={rule.areas} options={areaOptions} allowFree placeholder={t("shippingSettings.anyArea")}
              hint={rule.cities.length && !areaOptions.length ? t("shippingSettings.areaFree") : t("shippingSettings.areaHint")} onChange={(v) => set({ areas: v })} /></div>
        </div>
      )}
    </div>
  );
}

export default function ShippingSettings({ storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [currency, setCurrency] = useState("PKR");
  const [unit, setUnit] = useState("kg"); // display unit from General settings; storage is always grams
  const [geo, setGeo] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  // Test box
  const [test, setTest] = useState({ subtotal: "2000", weightKg: "0.5", province: "", city: "", area: "" });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [s, g] = await Promise.all([workerFetch(cfUrl, `/get-shipping-settings?store_id=${storeId}`), publicFetch(cfUrl, "/get-geo-data")]);
      if (!alive) return;
      if (s.status !== 200 || !s.data.settings) {
        setLoadError(s.data.error || t("shippingSettings.errorLoad"));
      } else {
        if (s.data.error) setLoadError(s.data.error);
        const u = s.data.weight_unit === "g" ? "g" : "kg";
        const d = fromServer(s.data.settings, u);
        setUnit(u);
        setTest((x) => ({ ...x, weightKg: u === "g" ? "500" : "0.5" }));
        setSaved(d);
        setDraft(d);
        if (s.data.currency) setCurrency(s.data.currency);
      }
      setGeo(Array.isArray(g.data?.provinces) ? g.data.provinces : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [storeId, cfUrl]);

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setRule = (i, rule) => setDraft((d) => ({ ...d, rules: d.rules.map((r, idx) => (idx === i ? rule : r)) }));
  const moveRule = (i, dir) => setDraft((d) => {
    const rules = [...d.rules];
    const j = i + dir;
    if (j < 0 || j >= rules.length) return d;
    [rules[i], rules[j]] = [rules[j], rules[i]];
    return { ...d, rules };
  });

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const { status, data } = await workerFetch(cfUrl, "/save-shipping-settings", { method: "POST", body: JSON.stringify({ store_id: storeId, settings: toServer(draft, unit) }) });
    if (status === 200 && data.success) {
      const d = fromServer(data.settings, unit);
      setSaved(d);
      setDraft(d);
      setNotice({ type: "ok", text: t("shippingSettings.saved") });
      logStoreActivity(storeId, "shipping_settings_saved", { rules: data.settings.rules.length, flat_fee: data.settings.flat_fee, free_shipping: data.settings.free_shipping.enabled });
    } else {
      setNotice({ type: "error", text: data.error || t("shippingSettings.errorSave") });
    }
    setSaving(false);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const { status, data } = await workerFetch(cfUrl, "/preview-shipping", {
      method: "POST",
      body: JSON.stringify({ store_id: storeId, subtotal: parseNum(test.subtotal) ?? 0, weight_grams: dispToGrams(test.weightKg, unit) ?? 0, province: test.province, city: test.city, area: test.area, settings: toServer(draft, unit) }),
    });
    setTestResult(status === 200 && typeof data.fee === "number" ? { ok: true, ...data } : { ok: false, error: data.error || t("shippingSettings.errorTest") });
    setTesting(false);
  };

  const inp = { ...settingsInputStyle, marginBottom: 0, padding: "7px 10px", fontSize: 12.5 };
  const btn = (primary, disabled) => ({ padding: "8px 18px", borderRadius: 9, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, display: "inline-flex", alignItems: "center", gap: 6 });
  const h3 = { margin: "0 0 10px", fontSize: 14, color: "var(--ne-text)" };

  if (loading) return <p style={{ padding: "1.5rem", margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;
  if (!draft) return <div style={{ padding: "1.5rem" }}><p style={{ color: "var(--ne-danger)", fontSize: 13 }}>{loadError}</p></div>;

  const testProvince = geo.find((p) => norm(p.name) === norm(test.province));
  const testCities = (testProvince ? testProvince.cities : geo.flatMap((p) => p.cities)).map((c) => c.name);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--ne-text)" }}>{t("shippingSettings.title")}</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.5 }}>{t("shippingSettings.intro")}</p>
      {loadError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{loadError}</p>}

      <SettingsCard>
        <h3 style={h3}>{t("shippingSettings.generalTitle")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <div>
            <label style={settingsLabelStyle}>{t("shippingSettings.defaultWeight")} ({unit})</label>
            <input style={inp} inputMode="decimal" value={draft.defaultWeightKg} onChange={(e) => set({ defaultWeightKg: e.target.value })} />
            <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 3 }}>{t("shippingSettings.defaultWeightHint")}</div>
          </div>
          <div>
            <label style={settingsLabelStyle}>{t("shippingSettings.flatFee")} ({currency})</label>
            <input style={inp} inputMode="decimal" value={draft.flatFee} onChange={(e) => set({ flatFee: e.target.value })} />
            <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 3 }}>{t("shippingSettings.flatFeeHint")}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Toggle on={draft.freeEnabled} onChange={(v) => set({ freeEnabled: v })} label={t("shippingSettings.freeShipping")} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{t("shippingSettings.freeShipping")}</span>
          {draft.freeEnabled && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <label style={{ ...settingsLabelStyle, marginBottom: 0 }}>{t("shippingSettings.freeMin")} ({currency})</label>
              <input style={{ ...inp, width: 130 }} inputMode="decimal" value={draft.freeMin} onChange={(e) => set({ freeMin: e.target.value })} />
            </span>
          )}
        </div>
      </SettingsCard>

      <SettingsCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <h3 style={{ ...h3, margin: 0 }}>{t("shippingSettings.rulesTitle")}</h3>
          <button type="button" style={btn(false, draft.rules.length >= MAX_RULES)} disabled={draft.rules.length >= MAX_RULES} onClick={() => set({ rules: [...draft.rules, newRule()] })}>
            <Icon name="plus" size={12} /> {t("shippingSettings.addRule")}
          </button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ne-muted)", lineHeight: 1.55 }}>{t("shippingSettings.evalOrder")}</p>
        {draft.rules.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ne-muted)", margin: 0 }}>{t("shippingSettings.noRules")}</p>}
        {draft.rules.map((r, i) => (
          <RuleCard key={r.id} rule={r} index={i} total={draft.rules.length} geo={geo} currency={currency} unit={unit} cfUrl={cfUrl} t={t}
            onChange={(rule) => setRule(i, rule)} onMove={(dir) => moveRule(i, dir)} onDelete={() => set({ rules: draft.rules.filter((_, idx) => idx !== i) })} />
        ))}
        {draft.rules.length >= MAX_RULES && <p style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{t("shippingSettings.maxRules")}</p>}
      </SettingsCard>

      {notice && <p style={{ color: notice.type === "ok" ? "var(--ne-success)" : "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{notice.text}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <button type="button" style={btn(true, !dirty || saving)} disabled={!dirty || saving} onClick={save}>{saving ? t("shippingSettings.saving") : t("action.save")}</button>
        <button type="button" style={btn(false, !dirty || saving)} disabled={!dirty || saving} onClick={() => { setDraft(saved); setNotice(null); setTestResult(null); }}>{t("checkoutSettings.discard")}</button>
        {dirty && <span style={{ alignSelf: "center", fontSize: 11.5, color: "var(--ne-warning)" }}>{t("checkoutSettings.unsaved")}</span>}
      </div>

      <SettingsCard>
        <h3 style={h3}>{t("shippingSettings.testTitle")}</h3>
        <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("shippingSettings.testHint")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <div><label style={settingsLabelStyle}>{t("shippingSettings.testSubtotal")} ({currency})</label><input style={inp} inputMode="decimal" value={test.subtotal} onChange={(e) => setTest({ ...test, subtotal: e.target.value })} /></div>
          <div><label style={settingsLabelStyle}>{t("shippingSettings.testWeight")} ({unit})</label><input style={inp} inputMode="decimal" value={test.weightKg} onChange={(e) => setTest({ ...test, weightKg: e.target.value })} /></div>
          <div><label style={settingsLabelStyle}>{t("shippingSettings.testProvince")}</label>
            <input style={inp} list="ship-test-provinces" value={test.province} onChange={(e) => setTest({ ...test, province: e.target.value })} />
            <datalist id="ship-test-provinces">{geo.map((p) => <option key={p.code} value={p.name} />)}</datalist></div>
          <div><label style={settingsLabelStyle}>{t("shippingSettings.testCity")}</label>
            <input style={inp} list="ship-test-cities" value={test.city} onChange={(e) => setTest({ ...test, city: e.target.value })} />
            <datalist id="ship-test-cities">{testCities.slice(0, 800).map((c, i) => <option key={`${c}-${i}`} value={c} />)}</datalist></div>
          <div><label style={settingsLabelStyle}>{t("shippingSettings.testArea")}</label><input style={inp} value={test.area} maxLength={60} onChange={(e) => setTest({ ...test, area: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" style={btn(false, testing)} disabled={testing} onClick={runTest}>{testing ? t("common.loading") : t("shippingSettings.testRun")}</button>
          {testResult && (testResult.ok ? (
            <span style={{ fontSize: 13, color: "var(--ne-text)" }}>
              <b>{testResult.fee === 0 ? t("shippingSettings.free") : `${currency} ${testResult.fee}`}</b>
              {" — "}
              {testResult.applied === "free_shipping" ? t("shippingSettings.appliedFree") : testResult.applied === "rule" ? t("shippingSettings.appliedRule").replace("{name}", testResult.rule?.name || t("shippingSettings.unnamedRule").replace("{n}", draft.rules.findIndex((r) => r.id === testResult.rule?.id) + 1)) : t("shippingSettings.appliedFlat")}
            </span>
          ) : <span style={{ fontSize: 12.5, color: "var(--ne-danger)" }}>{testResult.error}</span>)}
        </div>
      </SettingsCard>
    </div>
  );
}
