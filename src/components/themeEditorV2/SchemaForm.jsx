import { useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { Field, TextControl, NumberControl, SelectControl, ToggleControl, RangeControl, ColorControl, Group } from "../themeEditor/controls";
import { inputStyle } from "../themeEditor/controlStyles";
import { safeHref, safeImageUrl, sanitizeRichtext, sanitizeCss } from "../../lib/themeV2/engine.generated";

// Settings form generated from a v2 schema field list. Every control is controlled: values come from the draft and
// each change calls onChange(fieldId, value). Labels are schema keys resolved through `sl` (ur/en).

const hint = { margin: "4px 0 0", fontSize: 11.5, color: "var(--ne-muted)", lineHeight: 1.4 };
const err = { margin: "4px 0 0", fontSize: 11.5, color: "var(--ne-danger)" };

function SchemeControl({ id, label, value, options, onChange, sl, settings }) {
  return (
    <Field label={label}>
      <div role="radiogroup" aria-label={label} style={{ display: "grid", gap: 6 }}>
        {options.map((o) => {
          const n = o.value.split("_")[1];
          const bg = settings?.[`scheme_${n}_bg`] || "#fff";
          const tx = settings?.[`scheme_${n}_text`] || "#000";
          const bt = settings?.[`scheme_${n}_button`] || "#000";
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} id={on ? id : undefined} onClick={() => onChange(o.value)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, border: `1px solid ${on ? "var(--ne-accent)" : "var(--ne-border)"}`, background: on ? "var(--ne-accent-soft)" : "transparent", color: "var(--ne-text)", cursor: "pointer", textAlign: "start", fontSize: 12.5 }}>
              <span aria-hidden="true" style={{ width: 34, height: 24, borderRadius: 6, background: bg, border: "1px solid var(--ne-border)", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, flex: "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: tx }} /><span style={{ width: 10, height: 6, borderRadius: 2, background: bt }} />
              </span>
              {sl(o.label)}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function ImageV2Control({ label, value, onChange, t }) {
  const v = value && typeof value === "object" ? value : { url: "", alt: "" };
  const [broken, setBroken] = useState(false);
  const [prev, setPrev] = useState(v.url);
  if (prev !== v.url) { setPrev(v.url); setBroken(false); }
  const bad = v.url && !safeImageUrl(v.url);
  return (
    <Field label={label} error={bad ? t("themeEditor.invalidImage") : null}>
      <div style={{ display: "flex", gap: 10 }}>
        <div aria-hidden="true" style={{ width: 56, height: 56, flex: "none", borderRadius: 10, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ne-muted)" }}>
          {v.url && !bad && !broken ? <img src={v.url} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="image" size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <input type="text" value={v.url} placeholder="https://..." aria-label={label} onChange={(e) => onChange({ ...v, url: e.target.value })} style={inputStyle} />
          <input type="text" value={v.alt} placeholder={t("themeEditor.v2.altText")} aria-label={`${label}: ${t("themeEditor.v2.altText")}`} maxLength={200} onChange={(e) => onChange({ ...v, alt: e.target.value })} style={inputStyle} />
          {v.url && <button type="button" onClick={() => onChange({ url: "", alt: "" })} style={{ justifySelf: "start", background: "none", border: "none", padding: 0, color: "var(--ne-muted)", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>{t("themeEditor.removeImage")}</button>}
        </div>
      </div>
      {broken && <p style={err}>{t("themeEditor.imageLoadFailed")}</p>}
      <p style={hint}>{t("themeEditor.v2.uploadLater")}</p>
    </Field>
  );
}

/** link: free text plus quick picks (store pages, categories, products) */
function LinkV2Control({ label, value, onChange, t, catalog, external }) {
  const bad = value && (!safeHref(value) || (external && !/^https?:\/\//i.test(value)));
  const picks = useMemo(() => {
    if (external) return [];
    const cats = [...new Set(catalog.map((p) => p.category).filter(Boolean))];
    return [
      { value: "/", label: t("themeEditor.v2.linkHome") },
      { value: "/collection", label: t("themeEditor.v2.linkShopAll") },
      { value: "/cart", label: t("themeEditor.v2.linkCart") },
      ...cats.map((c) => ({ value: `/collection?category=${encodeURIComponent(c)}`, label: `${t("themeEditor.v2.category")}: ${c}` })),
      ...catalog.slice(0, 40).map((p) => ({ value: `/product/${encodeURIComponent(p.handle)}`, label: `${t("themeEditor.v2.product")}: ${p.title}` })),
    ];
  }, [catalog, t, external]);
  return (
    <Field label={label} error={bad ? t("themeEditor.invalidLink") : null}>
      <input type="text" value={value ?? ""} placeholder={external ? "https://" : "/collection"} aria-label={label} onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, borderColor: bad ? "var(--ne-danger)" : "var(--ne-border)" }} />
      {picks.length > 0 && (
        <select value="" aria-label={t("themeEditor.v2.linkPick")} onChange={(e) => { if (e.target.value) onChange(e.target.value); }} style={{ ...inputStyle, marginTop: 6, color: "var(--ne-muted)" }}>
          <option value="">{t("themeEditor.v2.linkPick")}</option>
          {picks.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      )}
    </Field>
  );
}

function PickerControl({ label, value, onChange, options, t }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => !needle || o.label.toLowerCase().includes(needle)).slice(0, 60);
  const current = options.find((o) => o.value === value);
  return (
    <Field label={label}>
      <input type="search" value={q} placeholder={t("themeEditor.v2.search")} aria-label={`${label}: ${t("themeEditor.v2.search")}`} onChange={(e) => setQ(e.target.value)} style={inputStyle} />
      <select value={value || ""} aria-label={label} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
        <option value="">{t("themeEditor.v2.none")}</option>
        {current && !shown.includes(current) && <option value={current.value}>{current.label}</option>}
        {shown.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

const RT_TOOLS = [
  { key: "bold", text: "B", open: "<strong>", close: "</strong>" },
  { key: "italic", text: "I", open: "<em>", close: "</em>" },
  { key: "paragraph", text: "P", open: "<p>", close: "</p>" },
  { key: "heading", text: "H", open: "<h3>", close: "</h3>" },
  { key: "list", text: "•", open: "<ul><li>", close: "</li></ul>" },
  { key: "link", icon: "link", open: '<a href="/collection">', close: "</a>" },
];

/** simple rich text: a textarea with buttons that wrap the selection; the value is sanitized like the storefront does */
function RichTextControl({ label, value, onChange, t }) {
  const ref = useRef(null);
  const wrap = (open, close) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const v = value || "";
    onChange(v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e));
  };
  const cleaned = sanitizeRichtext(value || "");
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        {RT_TOOLS.map((tool) => (
          <button key={tool.key} type="button" onClick={() => wrap(tool.open, tool.close)} title={t(`themeEditor.v2.rt.${tool.key}`)} aria-label={t(`themeEditor.v2.rt.${tool.key}`)}
            style={{ minWidth: 30, height: 28, padding: "0 6px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            {tool.icon ? <Icon name={tool.icon} size={13} /> : tool.text}
          </button>
        ))}
      </div>
      <textarea ref={ref} value={value || ""} rows={4} aria-label={label} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, resize: "vertical", minHeight: 80, fontSize: 12.5 }} />
      {cleaned !== (value || "") && <p style={hint}>{t("themeEditor.v2.richtextCleaned")}</p>}
    </Field>
  );
}

export function FieldControl({ field: f, value, onChange, sl, t, catalog, theme, settings }) {
  const label = sl(f.label || `f.${f.id}`);
  const id = `f-${f.id}`;
  switch (f.type) {
    case "header":
      return <p style={{ margin: "14px 0 10px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ne-muted)" }}>{label}</p>;
    case "info":
      return <p style={{ ...hint, margin: "0 0 12px" }}>{label}</p>;
    case "text":
      return <TextControl id={id} label={label} value={value} maxLength={f.maxLength || 500} onChange={onChange} />;
    case "textarea":
      return <TextControl id={id} label={label} value={value} maxLength={f.maxLength || 3000} multiline onChange={onChange} />;
    case "richtext":
      return <RichTextControl label={label} value={value} onChange={onChange} t={t} />;
    case "css": {
      const cleaned = sanitizeCss(value || "");
      return (
        <>
          <TextControl id={id} label={label} value={value} maxLength={20000} multiline mono onChange={onChange} />
          {cleaned !== (value || "").trim() && <p style={{ ...hint, marginTop: -8 }}>{t("themeEditor.v2.cssCleaned")}</p>}
        </>
      );
    }
    case "select":
      if (f.id === "color_scheme" || f.options.every((o) => /^scheme_\d$/.test(o.value))) {
        return <SchemeControl id={id} label={label} value={value} options={f.options} onChange={onChange} sl={sl} settings={settings} />;
      }
      return <SelectControl id={id} label={label} value={value} onChange={onChange} options={f.options.map((o) => ({ value: o.value, label: sl(o.label) }))} />;
    case "checkbox":
      return <ToggleControl label={label} checked={!!value} onChange={onChange} />;
    case "range":
      return <RangeControl label={label} value={value} min={f.min} max={f.max} step={f.step} unit={f.unit} onChange={onChange} />;
    case "number":
      return <NumberControl id={id} label={label} value={value} min={f.min} max={f.max} step={f.step} onChange={(v) => onChange(v === "" ? f.min ?? 0 : v)} />;
    case "color":
      return <ColorControl label={label} value={value} fallback={f.default} t={t} onChange={onChange} />;
    case "image":
      return <ImageV2Control label={label} value={value} onChange={onChange} t={t} />;
    case "link":
      return <LinkV2Control label={label} value={value} onChange={onChange} t={t} catalog={catalog} />;
    case "url":
      return <LinkV2Control label={label} value={value} onChange={onChange} t={t} catalog={catalog} external />;
    case "font":
      return <SelectControl id={id} label={label} value={value} onChange={onChange} options={theme.fonts.map((x) => ({ value: x.key, label: x.family || t("themeEditor.v2.systemFont") }))} />;
    case "product":
      return <PickerControl label={label} value={value} onChange={onChange} t={t} options={catalog.map((p) => ({ value: p.handle, label: p.title }))} />;
    case "collection":
      return <PickerControl label={label} value={value} onChange={onChange} t={t} options={[...new Set(catalog.map((p) => p.category).filter(Boolean))].map((c) => ({ value: c, label: c }))} />;
    case "datetime":
      return (
        <Field label={label} id={id}>
          <input id={id} type="datetime-local" value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
        </Field>
      );
    default:
      return null;
  }
}

/** all fields of a section or block */
export function SchemaFields({ fields, values, onChange, sl, t, catalog, theme, settings }) {
  return (
    <div>
      {fields.map((f) => (
        <FieldControl key={f.id} field={f} value={values?.[f.id]} onChange={(v) => onChange(f.id, v)} sl={sl} t={t} catalog={catalog} theme={theme} settings={settings} />
      ))}
    </div>
  );
}

/** theme settings: one collapsible group per schema group; the first group starts open */
export function ThemeSettingsV2({ theme, settings, onChange, sl, t, catalog }) {
  const [open, setOpen] = useState(() => new Set([theme.settingsSchema[0]?.id]));
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div>
      {theme.settingsSchema.map((g) => (
        <Group key={g.id} title={sl(`g.${g.id}`)} open={open.has(g.id)} onToggle={() => toggle(g.id)}>
          <SchemaFields fields={g.fields} values={settings} onChange={onChange} sl={sl} t={t} catalog={catalog} theme={theme} settings={settings} />
        </Group>
      ))}
    </div>
  );
}
