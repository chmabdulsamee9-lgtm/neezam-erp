import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// Shopify / Meta style asset dropdown: the chosen asset (avatar, name, id) on a button; the panel lists the options with
// a search box (when the list is long) and an optional "Create new" footer that asks for a name inline.
const initial = (s) => (String(s || "?").trim()[0] || "?").toUpperCase();

function Avatar({ option, size = 32 }) {
  if (option?.picture) return <img src={option.picture} alt="" width={size} height={size} className="ne-asset-avatar" style={{ width: size, height: size }} />;
  return <span className="ne-asset-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{option?.icon ? <Icon name={option.icon} size={size * 0.5} /> : initial(option?.name)}</span>;
}

export default function AssetPicker({ value, options, placeholder, onChange, onCreate, createLabel, createPlaceholder, createDefault, createButton, cancelLabel, searchLabel, emptyLabel, disabled, busy, label, footerExtra }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const list = (options || []).filter((o) => !q.trim() || `${o.name} ${o.sub || ""} ${o.id}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = () => { if (disabled) return; setOpen((v) => !v); setQ(""); setCreating(false); };
  const pick = (id) => { setOpen(false); if (!value || id !== value.id) onChange(id); };
  const submitCreate = (e) => { e.preventDefault(); const n = name.trim(); if (!n) return; setOpen(false); setCreating(false); onCreate(n); };

  return (
    <div className="ne-asset-picker" ref={root}>
      <button type="button" className={`ne-asset-button${open ? " open" : ""}`} onClick={toggle} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
        {value ? (
          <>
            <Avatar option={value} />
            <span className="ne-asset-text">
              <span className="ne-asset-name">{value.name || value.id}</span>
              {value.sub && <span className="ne-asset-sub" dir="ltr">{value.sub}</span>}
            </span>
          </>
        ) : (
          <span className="ne-asset-text"><span className="ne-asset-placeholder">{placeholder}</span></span>
        )}
        {busy ? <span className="ne-asset-spin" aria-hidden="true" /> : <Icon name="chevronDown" size={14} />}
      </button>
      {open && (
        <div className="ne-asset-panel" role="listbox" aria-label={label}>
          {(options || []).length > 6 && (
            <div className="ne-asset-search">
              <Icon name="search" size={13} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchLabel} aria-label={searchLabel} />
            </div>
          )}
          <div className="ne-asset-list">
            {list.length === 0 && <div className="ne-asset-empty">{emptyLabel}</div>}
            {list.map((o) => (
              <button type="button" role="option" aria-selected={value?.id === o.id} key={o.id} className={`ne-asset-option${value?.id === o.id ? " selected" : ""}`} onClick={() => pick(o.id)} disabled={o.disabled}>
                <Avatar option={o} size={28} />
                <span className="ne-asset-text">
                  <span className="ne-asset-name">{o.name || o.id}</span>
                  {o.sub && <span className="ne-asset-sub" dir="ltr">{o.sub}</span>}
                </span>
                {value?.id === o.id && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
          {onCreate && (
            creating ? (
              <form className="ne-asset-create" onSubmit={submitCreate}>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder={createPlaceholder} aria-label={createPlaceholder} />
                <div className="ne-asset-create-actions">
                  <button type="button" className="ne-asset-ghost" onClick={() => setCreating(false)}>{cancelLabel}</button>
                  <button type="submit" className="ne-asset-primary" disabled={!name.trim()}>{createButton}</button>
                </div>
              </form>
            ) : (
              <button type="button" className="ne-asset-footer" onClick={() => { setCreating(true); setName(createDefault || ""); }}>
                <Icon name="plus" size={14} /> {createLabel}
              </button>
            )
          )}
          {footerExtra}
        </div>
      )}
    </div>
  );
}
