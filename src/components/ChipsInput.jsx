import { useState } from "react";
import Icon from "./Icon";

const MAX_ENTRIES = 100;
const MAX_ENTRY_LEN = 60;
const norm = (s) => String(s || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** chips + type-ahead. options: suggestions; allowFree: Enter adds the typed text as-is */
export default function ChipsInput({ values, onChange, options = [], allowFree, placeholder, hint, t }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const q = norm(query);
  const have = new Set(values.map(norm));
  const suggestions = options.filter((o) => !have.has(norm(o)) && (!q || norm(o).includes(q))).slice(0, 60);
  const add = (v) => {
    const text = String(v).replace(/\s+/g, " ").trim();
    if (!text || text.length > MAX_ENTRY_LEN || have.has(norm(text)) || values.length >= MAX_ENTRIES) return;
    onChange([...values, text]);
    setQuery("");
  };
  const onKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const exact = options.find((o) => norm(o) === q);
    if (exact) add(exact);
    else if (suggestions.length === 1 && !allowFree) add(suggestions[0]);
    else if (allowFree) add(query);
  };
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "6px 8px", border: "1px solid var(--ne-border)", borderRadius: 9, background: "var(--ne-bg)", minHeight: 36, alignItems: "center" }}>
        {values.map((v) => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, background: "var(--ne-accent-soft)", color: "var(--ne-text)", fontSize: 11.5, fontWeight: 600 }}>
            {v}
            <button type="button" aria-label={`${t("action.delete")} ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} style={{ border: "none", background: "transparent", color: "var(--ne-muted)", cursor: "pointer", padding: 0, display: "inline-flex" }}><Icon name="close" size={10} /></button>
          </span>
        ))}
        <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
          placeholder={values.length ? "" : placeholder} maxLength={MAX_ENTRY_LEN}
          style={{ flex: 1, minWidth: 110, border: "none", outline: "none", background: "transparent", color: "var(--ne-text)", fontSize: 12.5 }} />
      </div>
      {open && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 2, maxHeight: 200, overflowY: "auto", background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 9, boxShadow: "0 8px 30px rgba(0,0,0,.35)" }}>
          {suggestions.map((o) => (
            <div key={o} onMouseDown={(e) => { e.preventDefault(); add(o); }} style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", color: "var(--ne-text)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ne-accent-soft)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{o}</div>
          ))}
        </div>
      )}
      {hint && <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
