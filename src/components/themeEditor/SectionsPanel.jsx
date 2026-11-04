import { useEffect, useRef, useState } from "react";
import Icon from "../Icon";
import { groupSections, isLocked, canMove, pickerTypes, categoryOf, SECTION_CATEGORIES } from "../../lib/themeEditor/layout";
import { sectionLabel, sectionSummary } from "../../lib/themeEditor/labels";
import { inputStyle } from "./controlStyles";

// The section tree of the selected page: groups, rows (drag handle, name, hide/show, menu) and the add-section popup.

function useOutsideClose(ref, onClose, active) {
  useEffect(() => {
    if (!active) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [ref, onClose, active]);
}

export function RowMenu({ t, section, template, sections, onDuplicate, onMove, onDelete, onClose }) {
  const ref = useRef(null);
  useOutsideClose(ref, onClose, true);
  const item = (label, icon, onClick, { disabled, danger } = {}) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => { onClick(); onClose(); }}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", background: "transparent", border: "none", textAlign: "start", fontSize: 13, color: danger ? "var(--ne-danger)" : "var(--ne-text)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}>
      <Icon name={icon} size={14} />{label}
    </button>
  );
  return (
    <div ref={ref} role="menu" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", insetInlineEnd: 4, top: "100%", zIndex: 30, minWidth: 176, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.35)", padding: "5px 0" }}>
      {item(t("themeEditor.duplicate"), "copy", () => onDuplicate(section.id))}
      {item(t("themeEditor.moveUp"), "arrowUp", () => onMove(section.id, -1), { disabled: !canMove(sections, section.id, -1, template) })}
      {item(t("themeEditor.moveDown"), "arrowDown", () => onMove(section.id, 1), { disabled: !canMove(sections, section.id, 1, template) })}
      <div style={{ height: 1, background: "var(--ne-border)", margin: "4px 0" }} />
      {item(t("themeEditor.delete"), "trash", () => onDelete(section.id), { danger: true })}
    </div>
  );
}

function SectionRow({ t, section, template, sections, selected, dropEdge, readOnly, handlers }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const locked = isLocked(section.type);
  const hidden = section.enabled === false;
  const summary = sectionSummary(section);
  const btn = { background: "transparent", border: "none", color: "var(--ne-muted)", width: 28, height: 28, borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" };
  return (
    <div
      className={`te-row${selected ? " sel" : ""}${dropEdge ? ` drop-${dropEdge}` : ""}`}
      style={{ opacity: hidden ? 0.55 : 1 }}
      draggable={!locked && !readOnly}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", section.id); handlers.onDragStart(section.id); }}
      onDragOver={(e) => { if (!handlers.dragging) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); handlers.onDragOver(section.id, e.clientY > r.top + r.height / 2 ? "after" : "before"); }}
      onDrop={(e) => { e.preventDefault(); handlers.onDrop(); }}
      onDragEnd={handlers.onDragEnd}
      onClick={() => handlers.onSelect(section.id)}
      onMouseEnter={() => handlers.onHover(section.id)}
      onMouseLeave={() => handlers.onHover(null)}
    >
      <span className="te-grip" aria-hidden="true" style={{ color: "var(--ne-muted-2)", cursor: locked ? "default" : "grab", display: "inline-flex", width: 16, justifyContent: "center", visibility: locked ? "hidden" : "visible" }}><Icon name="grip" size={14} /></span>
      <button type="button" aria-label={sectionLabel(t, section.type)} onKeyDown={(e) => { if (e.key === "Enter") handlers.onSelect(section.id); }}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, background: "transparent", border: "none", padding: "8px 0", textAlign: "start", color: "var(--ne-text)", fontSize: 13, cursor: "pointer" }}>
        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{sectionLabel(t, section.type)}</span>
        {summary && <span style={{ color: "var(--ne-muted)", fontStyle: "italic", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{summary}</span>}
      </button>
      {locked ? (
        <span title={t("themeEditor.lockedHint")} style={{ ...btn, cursor: "default" }}><Icon name="key" size={13} /></span>
      ) : (
        <>
          <button type="button" style={btn} className="te-act" disabled={readOnly} title={hidden ? t("themeEditor.show") : t("themeEditor.hide")} aria-label={hidden ? t("themeEditor.show") : t("themeEditor.hide")}
            onClick={(e) => { e.stopPropagation(); handlers.onToggle(section.id); }}>
            <Icon name={hidden ? "eyeOff" : "eye"} size={15} />
          </button>
          <button type="button" style={btn} className="te-act" disabled={readOnly} title={t("themeEditor.more")} aria-label={t("themeEditor.more")} aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}>
            <Icon name="moreHorizontal" size={15} />
          </button>
          {menuOpen && <RowMenu t={t} section={section} template={template} sections={sections} onDuplicate={handlers.onDuplicate} onMove={handlers.onMove} onDelete={handlers.onDelete} onClose={() => setMenuOpen(false)} />}
        </>
      )}
    </div>
  );
}

export function AddSectionPopup({ t, template, themeId, onPick, onClose }) {
  const ref = useRef(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  useOutsideClose(ref, onClose, true);
  const all = pickerTypes(template, themeId);
  const cats = [...SECTION_CATEGORIES.map((c) => c.key), "theme"].filter((k) => all.some((m) => categoryOf(m.type) === k));
  const needle = q.trim().toLowerCase();
  const shown = all.filter((m) => (cat === "all" || categoryOf(m.type) === cat) && (!needle || sectionLabel(t, m.type).toLowerCase().includes(needle)));
  const chip = (key, label) => (
    <button key={key} type="button" onClick={() => setCat(key)} aria-pressed={cat === key}
      style={{ padding: "5px 11px", borderRadius: 20, border: "1px solid var(--ne-border)", fontSize: 12, fontWeight: 600, cursor: "pointer", background: cat === key ? "var(--ne-accent-soft)" : "transparent", color: cat === key ? "var(--ne-accent)" : "var(--ne-text)" }}>{label}</button>
  );
  return (
    <div ref={ref} role="dialog" aria-label={t("themeEditor.addSection")}
      style={{ position: "absolute", insetInline: 6, bottom: 6, top: 6, zIndex: 40, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 14, boxShadow: "0 14px 40px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: 10, borderBottom: "1px solid var(--ne-border)" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", insetInlineStart: 10, top: 9, color: "var(--ne-muted)", display: "inline-flex" }}><Icon name="search" size={14} /></span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("themeEditor.searchSections")} aria-label={t("themeEditor.searchSections")}
            style={{ ...inputStyle, paddingInlineStart: 32 }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {chip("all", t("themeEditor.cat.all"))}
          {cats.map((k) => chip(k, t(`themeEditor.cat.${k}`)))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {shown.length === 0 && <p style={{ margin: 12, fontSize: 12.5, color: "var(--ne-muted)" }}>{t("themeEditor.noSectionsFound")}</p>}
        {shown.map((m) => (
          <button key={m.type} type="button" onClick={() => onPick(m.type)} className="te-pick"
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, background: "transparent", border: "none", color: "var(--ne-text)", fontSize: 13, textAlign: "start", cursor: "pointer" }}>
            <Icon name="layout" size={15} />
            <span style={{ flex: 1 }}>{sectionLabel(t, m.type)}</span>
            <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{t(`themeEditor.cat.${categoryOf(m.type)}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SectionsPanel({ t, template, sections, selectedId, readOnly, onSelect, onHover, onToggle, onDuplicate, onDelete, onMove, onReorder, onAdd, onOpenAdd }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { id, edge }
  const groups = groupSections(sections, template);

  const handlers = {
    dragging: !!dragId,
    onDragStart: setDragId,
    onDragOver: (id, edge) => { if (id !== dragId) setOver((o) => (o && o.id === id && o.edge === edge ? o : { id, edge })); },
    onDrop: () => { if (dragId && over) onReorder(dragId, over.id, over.edge); setDragId(null); setOver(null); },
    onDragEnd: () => { setDragId(null); setOver(null); },
    onSelect, onHover, onToggle, onDuplicate, onDelete, onMove,
  };

  return (
    <div style={{ position: "relative" }}>
      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 14 }}>
          <div style={{ padding: "6px 6px 6px", fontSize: 11.5, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t(`themeEditor.group.${g.key}`)}
          </div>
          {g.items.length === 0 && <p style={{ margin: "2px 8px 6px", fontSize: 12.5, color: "var(--ne-muted)" }}>{t("themeEditor.emptyGroup")}</p>}
          {g.items.map((s) => (
            <SectionRow key={s.id} t={t} section={s} template={template} sections={sections} selected={selectedId === s.id}
              dropEdge={over && over.id === s.id ? over.edge : null} readOnly={readOnly} handlers={handlers} />
          ))}
          {!readOnly && (g.key === "header" ? (
            <button type="button" className="te-add" onClick={() => onAdd("announcement-bar")}><Icon name="plus" size={14} />{t("themeEditor.addAnnouncement")}</button>
          ) : (
            <button type="button" className="te-add" onClick={onOpenAdd}><Icon name="plus" size={14} />{t("themeEditor.addSection")}</button>
          ))}
        </div>
      ))}
    </div>
  );
}
