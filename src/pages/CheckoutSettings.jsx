import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLanguage, useTranslation } from "../i18n";
import { SettingsCard, settingsInputStyle } from "../components/SettingsUI";
import { workerFetch, logStoreActivity } from "../lib/storeApi";
import CheckoutCanvas from "../components/CheckoutCanvas";
import { SPANS } from "../lib/checkoutLayout";

// Settings > Checkout. Which fields the storefront checkout shows / requires, their text, and their layout
// (order, width, spacing, height) per device, edited on a live preview in the published theme's colours.
// The server (worker /save-checkout-settings) is the source of truth for validation.

const FIELD_ORDER = ["full_name", "email", "phone", "province", "city", "area", "subarea", "address", "address2", "postal_code", "order_notes"];
const LOCKED = ["full_name", "province", "city", "address"]; // always shown + required
const MAX_TEXT = 80;
// mirrors the storefront's built-in texts (shown as the hint when a label/placeholder is blank)
const DEFAULT_LABELS = {
  full_name: "Full name", email: "Email", phone: "Mobile number", province: "Province", city: "City", area: "Area / Sub Area", subarea: "Subarea",
  address: "Street address", address2: "Apartment, floor (optional)", postal_code: "Postal code", order_notes: "Delivery notes (optional)",
};
const DEFAULT_PLACEHOLDERS = {
  full_name: "e.g. Ayesha Khan", email: "you@example.com", phone: "03XXXXXXXXX", province: "Search province…", city: "Search city…",
  area: "Search area or sub area…", subarea: "Search subarea…", address: "House, street, landmark…", address2: "Apartment, floor, building", postal_code: "e.g. 54000", order_notes: "e.g. Leave with the guard",
};
const DEFAULT_LAYOUT = () => {
  const one = () => ({ order: [...FIELD_ORDER], span: Object.fromEntries(FIELD_ORDER.map((n) => [n, 12])), gap: 20, input_height: 44, title_size: 100 });
  return { mobile: one(), desktop: one() };
};
const SPAN_NAME = { 3: "1/4", 4: "1/3", 6: "1/2", 8: "2/3", 9: "3/4", 12: "Full" };

const toggleStyle = (on, disabled) => ({
  width: 34, height: 19, borderRadius: 10, border: "none", padding: 2, cursor: disabled ? "not-allowed" : "pointer",
  background: on ? "var(--ne-accent)" : "var(--ne-border)", opacity: disabled ? 0.55 : 1, display: "inline-flex", alignItems: "center",
  justifyContent: on ? "flex-end" : "flex-start", transition: "background .15s", flexShrink: 0,
});
const knob = { width: 15, height: 15, borderRadius: "50%", background: "#fff", display: "block" };

function Toggle({ on, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled} onClick={() => !disabled && onChange(!on)} style={toggleStyle(on, disabled)}>
      <span style={knob} />
    </button>
  );
}

/** the published theme's checkout look (colours, fonts, radius) for the preview */
function themeLook(cfg, storeName, host) {
  const s = cfg?.settings || {};
  const sc = s.checkout_scheme || s.body_scheme || "scheme_1";
  const c = (k, d) => s[`${sc}_${k}`] || d;
  const fam = (key) => (key && key !== "system" ? key.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "");
  // the checkout template's own heading ("Cash on delivery" + "Checkout"), and the logo shown in place of the removed header
  const co = Object.values(cfg?.templates?.checkout?.sections || {}).find((x) => x?.type === "main-checkout")?.settings || {};
  const logo = s.checkout_logo?.url || s.logo?.url || "";
  return {
    title: typeof co.title === "string" ? co.title : "Checkout", subtitle: typeof co.subtitle === "string" ? co.subtitle : "Cash on delivery", showTitle: co.show_title !== false,
    logoUrl: logo, hScale: (Number(s.type_heading_scale) || 115) / 100, hWeight: Number(s.type_heading_weight) || 700, hUpper: !!s.type_heading_uppercase,
    bg: c("bg", "#ffffff"), text: c("text", "#141414"), muted: c("muted", "#5f5f66"), border: c("border", "#e4e4e7"),
    surface: c("surface", "#f6f6f4"), inputBg: c("bg", "#ffffff"), button: c("button", "#141414"), buttonText: c("button_text", "#ffffff"),
    accentUi: "#6366f1", radius: Number(s.input_radius ?? 10), fontBody: fam(s.font_body || "inter"), fontHeading: fam(s.font_heading || ""),
    storeName: s.store_name || storeName || "Your store", host: host || "yourstore.com",
  };
}

export default function CheckoutSettings({ storeId, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(null);   // last loaded/saved { fields, layout }
  const [draft, setDraft] = useState(null);   // editable { fields, layout }
  const [defaults, setDefaults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "ok" | "error", text }
  const [device, setDevice] = useState("mobile");
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [look, setLook] = useState(() => themeLook(null));
  const cardRef = useRef(null);
  const [cardH, setCardH] = useState(0);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 1180);

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1180);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  // mobile mode: the phone preview is exactly as tall as the details card (its width follows the phone's ratio)
  useEffect(() => {
    if (loading || device === "desktop") return undefined;
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => { const h = Math.round(el.getBoundingClientRect().height); setCardH((p) => (Math.abs(p - h) >= 2 ? h : p)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, device, narrow]);

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
        const v = { fields: data.settings.fields, layout: data.settings.layout || DEFAULT_LAYOUT() };
        setSaved(v);
        setDraft(v);
        setDefaults({ fields: data.defaults.fields, layout: data.defaults.layout || DEFAULT_LAYOUT() });
      }
      setLoading(false);
    })();
    // the published theme: the preview uses its colours, fonts and corner radius
    (async () => {
      const list = await workerFetch(cfUrl, `/list-store-themes?store_id=${storeId}`);
      const pub = (list.data?.themes || []).find((x) => x.status === "published") || (list.data?.themes || [])[0];
      if (!pub || !alive) return;
      const th = await workerFetch(cfUrl, `/get-store-theme?theme_id=${pub.id}`);
      if (!alive || !th.data?.theme) return;
      const st = await workerFetch(cfUrl, `/get-general-settings?store_id=${storeId}`).catch(() => ({}));
      const lk = themeLook(th.data.theme.theme_config, st?.data?.store_name, st?.data?.primary_domain);
      setLook(lk);
      // load the theme fonts so the preview reads like the store
      const fams = [lk.fontBody, lk.fontHeading].filter(Boolean);
      if (fams.length && !document.getElementById("ne-co-fonts")) {
        const l = document.createElement("link");
        l.id = "ne-co-fonts";
        l.rel = "stylesheet";
        l.href = `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700;800`).join("&")}&display=swap`;
        document.head.appendChild(l);
      }
    })();
    return () => { alive = false; };
  }, [storeId, cfUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const F = draft?.fields;

  const setField = (name, patch) => setDraft((d) => {
    const next = { ...d.fields[name], ...patch };
    if (patch.required === true) next.visible = true;
    if (patch.visible === false) next.required = false;
    return { ...d, fields: { ...d.fields, [name]: next } };
  });
  // layout edits keep an undo history
  const setLayout = useCallback((dev, next) => {
    setDraft((d) => {
      setHistory((h) => [...h.slice(-30), d.layout]);
      return { ...d, layout: { ...d.layout, [dev]: next } };
    });
  }, []);
  const undo = () => setHistory((h) => {
    if (!h.length) return h;
    setDraft((d) => ({ ...d, layout: h[h.length - 1] }));
    return h.slice(0, -1);
  });

  const contactOk = !!F && ((F.phone.visible && F.phone.required) || (F.email.visible && F.email.required));
  const tooLong = !!F && FIELD_ORDER.some((n) => (F[n].label || "").length > MAX_TEXT || (F[n].placeholder || "").length > MAX_TEXT);
  const canSave = dirty && contactOk && !tooLong && !saving;

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const payload = {};
    for (const n of FIELD_ORDER) {
      payload[n] = LOCKED.includes(n)
        ? { label: F[n].label.trim(), placeholder: F[n].placeholder.trim() }
        : { visible: F[n].visible, required: F[n].required, label: F[n].label.trim(), placeholder: F[n].placeholder.trim() };
    }
    payload.location_picker = { enabled: F.location_picker?.enabled !== false };
    const { status, data } = await workerFetch(cfUrl, "/save-checkout-settings", { method: "POST", body: JSON.stringify({ store_id: storeId, settings: { version: 1, fields: payload, layout: draft.layout } }) });
    if (status === 200 && data.success) {
      const v = { fields: data.settings.fields, layout: data.settings.layout || draft.layout };
      setSaved(v);
      setDraft(v);
      setHistory([]);
      setNotice({ type: "ok", text: t("checkoutSettings.saved") });
      const changed = [...FIELD_ORDER, "location_picker"].filter((n) => JSON.stringify(saved.fields[n]) !== JSON.stringify(v.fields[n]));
      logStoreActivity(storeId, "checkout_settings_saved", { changed_fields: changed, layout_changed: JSON.stringify(saved.layout) !== JSON.stringify(v.layout) });
    } else {
      setNotice({ type: "error", text: data.error || t("checkoutSettings.errorSave") });
    }
    setSaving(false);
  };

  const btn = (primary, disabled) => ({ padding: "8px 16px", borderRadius: 9, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 });
  const inp = { ...settingsInputStyle, marginBottom: 0, padding: "7px 10px", fontSize: 12.5, minWidth: 0 };
  const th = { fontSize: 10.5, color: "var(--ne-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" };

  if (loading) return <p style={{ padding: "1.5rem", margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("common.loading")}</p>;
  if (!draft) return <div style={{ padding: "1.5rem" }}><p style={{ color: "var(--ne-danger)", fontSize: 13 }}>{loadError}</p></div>;

  const desktop = device === "desktop";
  const lay = draft.layout[device];
  const shown = (n) => LOCKED.includes(n) || F[n].visible;
  const sel = selected && shown(selected) ? selected : null;
  const PHONE_RATIO = 9 / 19.5;
  const phoneH = cardH || 720;
  const phoneW = Math.max(260, Math.min(420, Math.round(phoneH * PHONE_RATIO)));
  const RAIL_W = 190;
  // wide: details | controls | preview. narrow: controls above, details | preview (desktop mode stacks)
  const COLS = narrow
    ? (desktop ? "minmax(0,1fr)" : `minmax(0,1fr) ${phoneW}px`)
    : (desktop ? `260px ${RAIL_W}px minmax(0,1fr)` : `minmax(0,1fr) ${RAIL_W}px ${phoneW}px`);
  const ROW = desktop ? "minmax(0,1fr) 34px 34px" : "minmax(0,1fr) minmax(0,1fr) 34px 34px";
  const sliderRow = (label, min, max, step, value, unit, onChange) => (
    <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--ne-muted)" }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>{label}<b style={{ color: "var(--ne-text)" }}>{value}{unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
    </label>
  );
  // controls: device, undo / reset, spacing, field height, heading size, width of the selected field
  const rail = (
    <div style={{ display: "flex", flexDirection: narrow ? "row" : "column", flexWrap: "wrap", gap: 12, padding: 12, border: "1px solid var(--ne-border)", borderRadius: 14, background: "var(--ne-surface-2)", minWidth: 0, alignItems: narrow ? "flex-start" : "stretch", marginBottom: narrow ? 14 : 0 }}>
      <div style={{ display: "flex", flexDirection: narrow ? "row" : "column", gap: 4, border: "1px solid var(--ne-border)", borderRadius: 10, padding: 3, background: "var(--ne-surface)" }}>
        {[["mobile", "📱 Mobile"], ["desktop", "🖥 Desktop"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setDevice(k); setSelected(null); }} style={{ border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left", background: device === k ? "var(--ne-grad)" : "transparent", color: device === k ? "#fff" : "var(--ne-text)" }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: narrow ? "row" : "column", gap: 6 }}>
        <button type="button" title="Undo" style={{ ...btn(false, !history.length), textAlign: "left" }} disabled={!history.length} onClick={undo}>↶ Undo</button>
        <button type="button" style={{ ...btn(false), textAlign: "left" }} onClick={() => { setLayout(device, defaults.layout[device]); setSelected(null); }}>Reset layout</button>
      </div>
      <div style={{ display: "grid", gap: 12, minWidth: narrow ? 180 : 0, flex: narrow ? "1 1 180px" : undefined }}>
        {sliderRow("Space between fields", 4, 40, 1, lay.gap, "px", (v) => setLayout(device, { ...lay, gap: v }))}
        {sliderRow("Field height", 34, 64, 1, lay.input_height, "px", (v) => setLayout(device, { ...lay, input_height: v }))}
        {sliderRow("Heading size", 50, 130, 5, lay.title_size ?? 100, "%", (v) => setLayout(device, { ...lay, title_size: v }))}
      </div>
      <div style={{ minWidth: 0, flex: narrow ? "1 1 200px" : undefined }}>
        {sel ? (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ne-text)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{F[sel].label.trim() || DEFAULT_LABELS[sel]} · width</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
              {SPANS.map((sp) => (
                <button key={sp} type="button" onClick={() => setLayout(device, { ...lay, span: { ...lay.span, [sel]: sp } })}
                  style={{ border: "1px solid var(--ne-border)", borderRadius: 7, padding: "5px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: lay.span[sel] === sp ? "var(--ne-grad)" : "transparent", color: lay.span[sel] === sp ? "#fff" : "var(--ne-text)" }}>{SPAN_NAME[sp]}</button>
              ))}
            </div>
          </>
        ) : <span style={{ fontSize: 11.5, color: "var(--ne-muted)", lineHeight: 1.5 }}>Tap a field in the preview to move or resize it.</span>}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "1.5rem" }}>
      <style>{`
        @keyframes neSwipeLeft { from { transform: translateX(120px); opacity: .4 } to { transform: none; opacity: 1 } }
        @keyframes neSwipeRight { from { transform: translateX(-120px); opacity: .4 } to { transform: none; opacity: 1 } }
        .ne-co-cols { transition: grid-template-columns .5s cubic-bezier(.2,.8,.2,1); }
        .ne-co-swipe-desktop { animation: neSwipeLeft .5s cubic-bezier(.2,.8,.2,1); }
        .ne-co-swipe-mobile { animation: neSwipeRight .5s cubic-bezier(.2,.8,.2,1); }
        .ne-co-row { transition: grid-template-columns .45s cubic-bezier(.2,.8,.2,1); }
        .ne-co-text { transition: opacity .25s; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--ne-text)" }}>{t("checkoutSettings.title")}</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.5, maxWidth: 620 }}>{t("checkoutSettings.intro")} Drag the fields in the preview to arrange them; drag the handle on the right to make a field narrower so 2, 3 or 4 fit in one row.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {dirty && <span style={{ fontSize: 11.5, color: "var(--ne-warning)" }}>{t("checkoutSettings.unsaved")}</span>}
          <button type="button" style={btn(false, !dirty || saving)} disabled={!dirty || saving} onClick={() => { setDraft(saved); setHistory([]); setNotice(null); }}>{t("checkoutSettings.discard")}</button>
          <button type="button" style={btn(true, !canSave)} disabled={!canSave} onClick={save}>{saving ? t("checkoutSettings.saving") : t("action.save")}</button>
        </div>
      </div>
      {loadError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{loadError}</p>}
      {!contactOk && <p style={{ color: "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{t("checkoutSettings.contactRule")}</p>}
      {notice && <p style={{ color: notice.type === "ok" ? "var(--ne-success)" : "var(--ne-danger)", fontSize: 12.5, margin: "0 0 12px" }}>{notice.text}</p>}

      {narrow && rail}
      <div className="ne-co-cols" style={{ display: "grid", gridTemplateColumns: COLS, gap: 18, alignItems: desktop ? "stretch" : "start" }}>
        {/* fields: label, placeholder, visible, required (desktop: name + toggles only) */}
        <div ref={cardRef} style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <SettingsCard style={{ padding: "0.75rem", marginBottom: 0, minWidth: 0, flex: 1 }}>
          <div className="ne-co-row" style={{ display: "grid", gridTemplateColumns: ROW, gap: 8, padding: "4px 4px 8px" }}>
            <span style={th}>{desktop ? "Field" : t("checkoutSettings.colLabel")}</span>
            {!desktop && <span style={th}>{t("checkoutSettings.colPlaceholder")}</span>}
            <span style={{ ...th, textAlign: "center" }} title={t("checkoutSettings.colVisible")}>Show</span>
            <span style={{ ...th, textAlign: "center" }} title={t("checkoutSettings.colRequired")}>Req.</span>
          </div>
          {lay.order.filter((n) => n !== "subarea").map((n) => {
            const f = F[n];
            const locked = LOCKED.includes(n);
            const isSel = sel === n;
            return (
              <div key={n} className="ne-co-row" onClick={() => shown(n) && setSelected(n)}
                style={{ display: "grid", gridTemplateColumns: ROW, gap: 8, alignItems: "center", padding: "6px 4px", borderTop: "1px solid var(--ne-border)", borderRadius: 8, background: isSel ? "var(--ne-surface)" : "transparent", cursor: shown(n) ? "pointer" : "default" }}>
                {desktop
                  ? <span style={{ fontSize: 12.5, fontWeight: 600, color: shown(n) ? "var(--ne-text)" : "var(--ne-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={locked ? t("checkoutSettings.lockedNote") : ""}>{f.label.trim() || DEFAULT_LABELS[n]}{locked ? " 🔒" : ""}</span>
                  : <input className="ne-co-text" style={inp} maxLength={MAX_TEXT} value={f.label} placeholder={DEFAULT_LABELS[n]} title={locked ? `${DEFAULT_LABELS[n]}: ${t("checkoutSettings.lockedNote")}` : DEFAULT_LABELS[n]} onChange={(e) => setField(n, { label: e.target.value })} onFocus={() => shown(n) && setSelected(n)} />}
                {!desktop && <input className="ne-co-text" style={inp} maxLength={MAX_TEXT} value={f.placeholder} placeholder={DEFAULT_PLACEHOLDERS[n]} onChange={(e) => setField(n, { placeholder: e.target.value })} onFocus={() => shown(n) && setSelected(n)} />}
                <span style={{ display: "flex", justifyContent: "center" }}><Toggle on={locked ? true : f.visible} disabled={locked} label={`${t("checkoutSettings.colVisible")}: ${DEFAULT_LABELS[n]}`} onChange={(v) => { setField(n, { visible: v }); if (n === "area") setField("subarea", { visible: v }); }} /></span>
                <span style={{ display: "flex", justifyContent: "center" }}><Toggle on={locked ? true : f.required} disabled={locked} label={`${t("checkoutSettings.colRequired")}: ${DEFAULT_LABELS[n]}`} onChange={(v) => setField(n, { required: v })} /></span>
              </div>
            );
          })}
          <p style={{ margin: "8px 4px 2px", fontSize: 11, color: "var(--ne-muted)" }}>{desktop ? "Switch to Mobile to edit the labels and placeholders." : t("checkoutSettings.labelHint")}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px 2px", borderTop: "1px solid var(--ne-border)", marginTop: 8 }}>
            <Toggle on={F.location_picker?.enabled !== false} label={t("checkoutSettings.locationPicker")} onChange={(v) => setDraft((d) => ({ ...d, fields: { ...d.fields, location_picker: { enabled: v } } }))} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)" }}>{t("checkoutSettings.locationPicker")}</div>
              {!desktop && <div style={{ fontSize: 11, color: "var(--ne-muted)", lineHeight: 1.45 }}>{t("checkoutSettings.locationPickerHelp")}</div>}
            </div>
          </div>
        </SettingsCard>
        </div>

        {!narrow && rail}

        {/* live, editable preview: same height as the details card (mobile: width from the phone ratio) */}
        <div key={device} className={desktop ? "ne-co-swipe-desktop" : "ne-co-swipe-mobile"} style={{ minWidth: 0, position: "relative", ...(desktop ? { minHeight: 560, height: narrow ? 560 : undefined } : { height: phoneH }) }}>
          <CheckoutCanvas
            device={device}
            layout={lay}
            fields={F}
            names={FIELD_ORDER.filter((n) => shown(n) && n !== "subarea")}
            labelOf={(n) => F[n].label.trim() || DEFAULT_LABELS[n].replace(/ \(optional\)$/, "")}
            placeholderOf={(n) => F[n].placeholder.trim() || DEFAULT_PLACEHOLDERS[n]}
            required={(n) => LOCKED.includes(n) || F[n].required}
            theme={look}
            onChange={(next) => setLayout(device, next)}
            selected={sel}
            onSelect={setSelected}
          />
        </div>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--ne-muted)" }}>{desktop ? "Desktop checkout (wide screens)." : "Mobile checkout (phones and small screens)."} Mobile and desktop are arranged separately. The real checkout uses this exact grid; it has no header or announcement bar, so the form gets all the room.</p>
    </div>
  );
}
