import { useState } from "react";
import Icon from "../Icon";
import Toggle from "../Toggle";
import { isHex, toSixHex, linkProblem } from "../../lib/themeV2/inputs";
import { inputStyle } from "./controlStyles";

// Form controls shared by every panel of the theme editor. All of them are controlled: the parent owns the value and
// receives the new value in onChange(value). Styling uses the ERP tokens only.

const labelStyle = { display: "block", marginBottom: 5, fontSize: 12, fontWeight: 600, color: "var(--ne-text)" };
const hintStyle = { margin: "4px 0 0", fontSize: 11.5, color: "var(--ne-muted)", lineHeight: 1.4 };
const errStyle = { margin: "4px 0 0", fontSize: 11.5, color: "var(--ne-danger)" };

export function Field({ label, hint, error, children, id }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label htmlFor={id} style={labelStyle}>{label}</label>}
      {children}
      {error ? <p style={errStyle}>{error}</p> : hint ? <p style={hintStyle}>{hint}</p> : null}
    </div>
  );
}

export function TextControl({ label, value, onChange, placeholder, maxLength, multiline, hint, mono, id }) {
  const common = { id, value: value ?? "", placeholder, maxLength, onChange: (e) => onChange(e.target.value), style: { ...inputStyle, ...(mono ? { fontFamily: "monospace", fontSize: 12 } : null) } };
  return (
    <Field label={label} hint={hint} id={id}>
      {multiline ? <textarea {...common} rows={mono ? 7 : 3} style={{ ...common.style, resize: "vertical", minHeight: 64 }} /> : <input type="text" {...common} />}
    </Field>
  );
}

export function NumberControl({ label, value, onChange, min, max, step, hint, id }) {
  return (
    <Field label={label} hint={hint} id={id}>
      <input id={id} type="number" min={min} max={max} step={step} value={value ?? ""} style={inputStyle}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
    </Field>
  );
}

export function SelectControl({ label, value, onChange, options, hint, id }) {
  return (
    <Field label={label} hint={hint} id={id}>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function ToggleControl({ label, checked, onChange, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ ...labelStyle, margin: 0 }}>{label}</span>
        <Toggle on={!!checked} onChange={onChange} label={label} />
      </div>
      {hint && <p style={hintStyle}>{hint}</p>}
    </div>
  );
}

export function RangeControl({ label, value, onChange, min = 0, max = 100, step = 1, unit = "", hint }) {
  const v = value === "" || value == null ? min : Number(value);
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="range" min={min} max={max} step={step} value={v} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--ne-accent)" }} />
        <input type="number" min={min} max={max} step={step} value={v} aria-label={label} style={{ ...inputStyle, width: 70, textAlign: "center" }}
          onChange={(e) => onChange(e.target.value === "" ? min : Number(e.target.value))} />
        {unit && <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>{unit}</span>}
      </div>
    </Field>
  );
}

/** swatch (native picker) + hex input. A half-typed or invalid hex never reaches the draft. */
export function ColorControl({ label, value, onChange, fallback = "#000000", hint, onReset, t, compact }) {
  const shown = value || "";
  const [text, setText] = useState(shown);
  const [prevShown, setPrevShown] = useState(shown);
  if (prevShown !== shown) { setPrevShown(shown); setText(shown); } // follow undo / redo / reset from outside
  const invalid = text !== "" && !isHex(text);
  const swatch = toSixHex(value || fallback, "#000000");
  const body = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="color" value={swatch} aria-label={label} onChange={(e) => onChange(e.target.value)}
        style={{ width: 38, height: 34, padding: 2, border: "1px solid var(--ne-border)", borderRadius: 10, background: "var(--ne-bg)", cursor: "pointer", flex: "none" }} />
      <input type="text" value={text} placeholder={fallback} aria-label={`${label} hex`} spellCheck={false}
        style={{ ...inputStyle, flex: 1, fontFamily: "monospace", borderColor: invalid ? "var(--ne-danger)" : "var(--ne-border)" }}
        onChange={(e) => {
          let v = e.target.value.trim();
          if (v && v[0] !== "#") v = `#${v}`;
          setText(v);
          if (isHex(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => { if (invalid) setText(shown); }} />
      {value && onReset && (
        <button type="button" onClick={onReset} title={t ? t("themeEditor.reset") : "Reset"} aria-label={t ? t("themeEditor.reset") : "Reset"}
          style={{ background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-muted)", borderRadius: 10, width: 34, height: 34, cursor: "pointer", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="refresh" size={13} />
        </button>
      )}
    </div>
  );
  if (compact) return body;
  return <Field label={label} hint={hint} error={invalid && t ? t("themeEditor.invalidHex") : null}>{body}</Field>;
}

/** The storefront takes image URLs (there is no store-image upload yet), so the picker is a URL field with a preview. */
export function ImageControl({ label, value, onChange, hint, t }) {
  const [broken, setBroken] = useState(false);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) { setPrevValue(value); setBroken(false); }
  const url = String(value || "");
  const absolute = /^https?:\/\//i.test(url);
  const bad = url && !absolute && !url.startsWith("/");
  return (
    <Field label={label} hint={hint} error={bad ? t("themeEditor.invalidImage") : null}>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <div aria-hidden="true" style={{ width: 52, height: 52, flex: "none", borderRadius: 10, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ne-muted)" }}>
          {absolute && !broken
            ? <img src={url} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Icon name="image" size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="text" value={url} placeholder="https://..." onChange={(e) => onChange(e.target.value)} style={inputStyle} aria-label={label} />
          {url && (
            <button type="button" onClick={() => onChange("")}
              style={{ alignSelf: "flex-start", background: "transparent", border: "none", padding: 0, color: "var(--ne-muted)", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>
              {t("themeEditor.removeImage")}
            </button>
          )}
        </div>
      </div>
      {broken && absolute && <p style={errStyle}>{t("themeEditor.imageLoadFailed")}</p>}
    </Field>
  );
}

export function LinkControl({ label, value, onChange, hint, t }) {
  const bad = linkProblem(value);
  return (
    <Field label={label} hint={hint || t("themeEditor.linkHint")} error={bad ? t("themeEditor.invalidLink") : null}>
      <input type="text" value={value ?? ""} placeholder="/collection" onChange={(e) => onChange(e.target.value)} aria-label={label}
        style={{ ...inputStyle, borderColor: bad ? "var(--ne-danger)" : "var(--ne-border)" }} />
    </Field>
  );
}

/** a collapsible group used by the theme-settings panel */
export function Group({ title, open, onToggle, children }) {
  return (
    <div style={{ borderBottom: "1px solid var(--ne-border)" }}>
      <button type="button" aria-expanded={open} onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 6px", background: "transparent", border: "none", color: "var(--ne-text)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", textAlign: "start" }}>
        <span>{title}</span>
        <Icon name={open ? "chevronUp" : "chevronDown"} size={14} />
      </button>
      {open && <div style={{ padding: "4px 6px 8px" }}>{children}</div>}
    </div>
  );
}
