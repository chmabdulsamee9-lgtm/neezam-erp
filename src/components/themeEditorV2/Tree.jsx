import { useRef, useState } from "react";
import Icon from "../Icon";
import { inputStyle } from "../themeEditor/controlStyles";
import { useOutsideClose } from "./useOutsideClose";
import { listSections, listBlocks, sectionDef, addableSections, addableBlocks, canMoveSection, canMoveBlock } from "../../lib/themeV2/engine.generated";

// Section tree of the v2 editor: Header group, page template and Footer group. Sections expand to their blocks.
// Drag and drop reorders sections (within a group) and blocks (within a section); the "..." menu offers the same moves
// for keyboard users.

const CATEGORY_ICON = { banner: "image", products: "products", content: "layout", header: "menu", footer: "menu", main: "home" };


export function Menu({ items, onClose }) {
  const ref = useRef(null);
  useOutsideClose(ref, onClose);
  return (
    <div ref={ref} role="menu" className="te2-menu" onClick={(e) => e.stopPropagation()}>
      {items.map((it, i) => it === "sep" ? <div key={`sep-${i}`} className="te2-sep" /> : (
        <button key={it.key} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? "danger" : ""}
          onClick={() => { it.onClick(); onClose(); }}>
          <Icon name={it.icon} size={14} />{it.label}
        </button>
      ))}
    </div>
  );
}

/** a short summary of a section/block for its row: its first text-like setting */
function summaryOf(settings) {
  for (const k of ["heading", "text", "title", "label", "question", "author"]) {
    const v = settings?.[k];
    if (typeof v === "string" && v.trim()) return v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);
  }
  return "";
}

function Row({ level, selected, hovered, hidden, dropEdge, draggable, onDragStart, onDragOver, onDrop, onDragEnd, onClick, onHover, children }) {
  return (
    <div className={`te-row te2-row${selected ? " sel" : ""}${hovered ? " hov" : ""}${dropEdge ? ` drop-${dropEdge}` : ""}`}
      style={{ paddingInlineStart: 4 + level * 18, opacity: hidden ? 0.55 : 1 }}
      draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      onClick={onClick} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {children}
    </div>
  );
}

function SectionNode({ ctx, scope, section, expanded }) {
  const { cfg, theme, t, sl, sel, hov, readOnly, drag, setDrag, act } = ctx;
  const def = sectionDef(theme, section.type);
  const locked = !!def?.locked;
  const hasBlocks = !!def?.blocks?.length;
  const blocks = listBlocks(section);
  const [menu, setMenu] = useState(false);
  const [blockMenu, setBlockMenu] = useState(null);
  const [addBlock, setAddBlock] = useState(false);
  const addRef = useRef(null);
  useOutsideClose(addRef, () => setAddBlock(false), addBlock);
  const isSel = sel && sel.sectionId === section.id && !sel.blockId;
  const isHov = hov && hov.sectionId === section.id && !hov.blockId;
  const sectionDragOn = drag && drag.kind === "section" && drag.scope === scope;
  const blockDragOn = drag && drag.kind === "block" && drag.sectionId === section.id;
  const edgeOf = (e) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientY > r.top + r.height / 2 ? "after" : "before"; };
  const name = sl(`s.${section.type}`);
  const summary = summaryOf(section.settings);
  const iconBtn = { className: "te-ibtn te2-act" };

  return (
    <div>
      <Row level={0} selected={isSel} hovered={isHov} hidden={section.hidden}
        dropEdge={sectionDragOn && drag.over === section.id ? drag.edge : null}
        draggable={!readOnly}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", section.id); setDrag({ kind: "section", scope, id: section.id, over: null, edge: null }); }}
        onDragOver={(e) => { if (!sectionDragOn || drag.id === section.id) return; e.preventDefault(); const edge = edgeOf(e); if (drag.over !== section.id || drag.edge !== edge) setDrag({ ...drag, over: section.id, edge }); }}
        onDrop={(e) => { e.preventDefault(); if (sectionDragOn && drag.over) act.reorderSection(scope, drag.id, drag.over, drag.edge); setDrag(null); }}
        onDragEnd={() => setDrag(null)}
        onClick={() => act.select({ scope, sectionId: section.id, blockId: null }, true)}
        onHover={(on) => act.hover(on ? { scope, sectionId: section.id, blockId: null } : null)}>
        <span className="te2-grip" aria-hidden="true" style={{ visibility: readOnly ? "hidden" : "visible" }}><Icon name="grip" size={14} /></span>
        {hasBlocks ? (
          <button type="button" {...iconBtn} style={{ width: 22, height: 22 }} aria-expanded={expanded} aria-label={expanded ? t("themeEditor.v2.collapse") : t("themeEditor.v2.expand")}
            onClick={(e) => { e.stopPropagation(); act.toggleExpand(section.id); }}>
            <Icon name={expanded ? "chevronDown" : "chevronRight"} size={13} />
          </button>
        ) : <span style={{ width: 22, flex: "none" }} />}
        <span className="te2-ico" aria-hidden="true"><Icon name={CATEGORY_ICON[def?.category] || "layout"} size={14} /></span>
        <button type="button" className="te2-name" aria-label={name} onKeyDown={(e) => { if (e.key === "Enter") act.select({ scope, sectionId: section.id, blockId: null }, true); }}>
          <span className="te2-title">{name}</span>{summary && <span className="te2-sum">{summary}</span>}
        </button>
        {locked ? (
          <span className="te-ibtn" title={t("themeEditor.lockedHint")} style={{ cursor: "default", color: "var(--ne-muted)" }}><Icon name="key" size={13} /></span>
        ) : !readOnly && (
          <>
            <button type="button" {...iconBtn} title={section.hidden ? t("themeEditor.show") : t("themeEditor.hide")} aria-label={section.hidden ? t("themeEditor.show") : t("themeEditor.hide")}
              onClick={(e) => { e.stopPropagation(); act.toggleSection(scope, section.id); }}><Icon name={section.hidden ? "eyeOff" : "eye"} size={15} /></button>
            <span style={{ position: "relative" }}>
              <button type="button" {...iconBtn} aria-haspopup="menu" aria-expanded={menu} title={t("themeEditor.more")} aria-label={t("themeEditor.more")}
                onClick={(e) => { e.stopPropagation(); setMenu((v) => !v); }}><Icon name="moreHorizontal" size={15} /></button>
              {menu && <Menu onClose={() => setMenu(false)} items={[
                { key: "dup", icon: "copy", label: t("themeEditor.duplicate"), onClick: () => act.duplicateSection(scope, section.id) },
                { key: "up", icon: "arrowUp", label: t("themeEditor.moveUp"), disabled: !canMoveSection(cfg, scope, section.id, -1), onClick: () => act.moveSection(scope, section.id, -1) },
                { key: "down", icon: "arrowDown", label: t("themeEditor.moveDown"), disabled: !canMoveSection(cfg, scope, section.id, 1), onClick: () => act.moveSection(scope, section.id, 1) },
                "sep",
                { key: "del", icon: "trash", label: t("themeEditor.delete"), danger: true, onClick: () => act.removeSection(scope, section.id) },
              ]} />}
            </span>
          </>
        )}
        {locked && !readOnly && (
          <span style={{ position: "relative" }}>
            <button type="button" {...iconBtn} aria-haspopup="menu" aria-expanded={menu} title={t("themeEditor.more")} aria-label={t("themeEditor.more")}
              onClick={(e) => { e.stopPropagation(); setMenu((v) => !v); }}><Icon name="moreHorizontal" size={15} /></button>
            {menu && <Menu onClose={() => setMenu(false)} items={[
              { key: "up", icon: "arrowUp", label: t("themeEditor.moveUp"), disabled: !canMoveSection(cfg, scope, section.id, -1), onClick: () => act.moveSection(scope, section.id, -1) },
              { key: "down", icon: "arrowDown", label: t("themeEditor.moveDown"), disabled: !canMoveSection(cfg, scope, section.id, 1), onClick: () => act.moveSection(scope, section.id, 1) },
            ]} />}
          </span>
        )}
      </Row>

      {hasBlocks && expanded && (
        <div>
          {blocks.map((b) => {
            const bSel = sel && sel.sectionId === section.id && sel.blockId === b.id;
            const bHov = hov && hov.sectionId === section.id && hov.blockId === b.id;
            const bName = sl(`b.${b.type}`);
            const bSum = summaryOf(b.settings);
            return (
              <Row key={b.id} level={1} selected={bSel} hovered={bHov} hidden={b.hidden}
                dropEdge={blockDragOn && drag.over === b.id ? drag.edge : null}
                draggable={!readOnly}
                onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); setDrag({ kind: "block", scope, sectionId: section.id, id: b.id, over: null, edge: null }); }}
                onDragOver={(e) => { if (!blockDragOn || drag.id === b.id) return; e.preventDefault(); e.stopPropagation(); const edge = edgeOf(e); if (drag.over !== b.id || drag.edge !== edge) setDrag({ ...drag, over: b.id, edge }); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (blockDragOn && drag.over) act.reorderBlock(scope, section.id, drag.id, drag.over, drag.edge); setDrag(null); }}
                onDragEnd={() => setDrag(null)}
                onClick={() => act.select({ scope, sectionId: section.id, blockId: b.id }, true)}
                onHover={(on) => act.hover(on ? { scope, sectionId: section.id, blockId: b.id } : null)}>
                <span className="te2-grip" aria-hidden="true" style={{ visibility: readOnly ? "hidden" : "visible" }}><Icon name="grip" size={13} /></span>
                <button type="button" className="te2-name" aria-label={bName} onKeyDown={(e) => { if (e.key === "Enter") act.select({ scope, sectionId: section.id, blockId: b.id }, true); }}>
                  <span className="te2-title" style={{ fontWeight: 500 }}>{bName}</span>{bSum && <span className="te2-sum">{bSum}</span>}
                </button>
                {!readOnly && (
                  <>
                    <button type="button" {...iconBtn} title={b.hidden ? t("themeEditor.show") : t("themeEditor.hide")} aria-label={b.hidden ? t("themeEditor.show") : t("themeEditor.hide")}
                      onClick={(e) => { e.stopPropagation(); act.toggleBlock(scope, section.id, b.id); }}><Icon name={b.hidden ? "eyeOff" : "eye"} size={14} /></button>
                    <span style={{ position: "relative" }}>
                      <button type="button" {...iconBtn} aria-haspopup="menu" aria-expanded={blockMenu === b.id} title={t("themeEditor.more")} aria-label={t("themeEditor.more")}
                        onClick={(e) => { e.stopPropagation(); setBlockMenu((v) => (v === b.id ? null : b.id)); }}><Icon name="moreHorizontal" size={14} /></button>
                      {blockMenu === b.id && <Menu onClose={() => setBlockMenu(null)} items={[
                        { key: "dup", icon: "copy", label: t("themeEditor.duplicate"), disabled: !addableBlocks(cfg, scope, section.id).some((x) => x.type === b.type), onClick: () => act.duplicateBlock(scope, section.id, b.id) },
                        { key: "up", icon: "arrowUp", label: t("themeEditor.moveUp"), disabled: !canMoveBlock(cfg, scope, section.id, b.id, -1), onClick: () => act.moveBlock(scope, section.id, b.id, -1) },
                        { key: "down", icon: "arrowDown", label: t("themeEditor.moveDown"), disabled: !canMoveBlock(cfg, scope, section.id, b.id, 1), onClick: () => act.moveBlock(scope, section.id, b.id, 1) },
                        "sep",
                        { key: "del", icon: "trash", label: t("themeEditor.delete"), danger: true, onClick: () => act.removeBlock(scope, section.id, b.id) },
                      ]} />}
                    </span>
                  </>
                )}
              </Row>
            );
          })}
          {blocks.length === 0 && <p className="te2-empty" style={{ paddingInlineStart: 26 }}>{t("themeEditor.v2.noBlocks")}</p>}
          {!readOnly && (
            <div ref={addRef} style={{ position: "relative", paddingInlineStart: 22 }}>
              {(() => {
                const options = addableBlocks(cfg, scope, section.id);
                return (
                  <>
                    <button type="button" className="te-add" disabled={!options.length} style={{ opacity: options.length ? 1 : 0.5 }} onClick={() => setAddBlock((v) => !v)} aria-haspopup="menu" aria-expanded={addBlock}>
                      <Icon name="plus" size={13} />{options.length ? t("themeEditor.v2.addBlock") : t("themeEditor.v2.blockLimit")}
                    </button>
                    {addBlock && (
                      <div role="menu" className="te2-menu" style={{ left: 22, right: "auto", top: "100%" }}>
                        {options.map((bd) => (
                          <button key={bd.type} type="button" role="menuitem" onClick={() => { setAddBlock(false); act.addBlock(scope, section.id, bd.type); }}>
                            <Icon name="plus" size={13} />{sl(`b.${bd.type}`)}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** the "..." menu in the settings header for the selected section or block */
export function SelectionMenu({ cfg, sel, isBlock, act, t, open, setOpen }) {
  const { scope, sectionId, blockId } = sel;
  const items = isBlock ? [
    { key: "dup", icon: "copy", label: t("themeEditor.duplicate"), onClick: () => act.duplicateBlock(scope, sectionId, blockId) },
    { key: "up", icon: "arrowUp", label: t("themeEditor.moveUp"), disabled: !canMoveBlock(cfg, scope, sectionId, blockId, -1), onClick: () => act.moveBlock(scope, sectionId, blockId, -1) },
    { key: "down", icon: "arrowDown", label: t("themeEditor.moveDown"), disabled: !canMoveBlock(cfg, scope, sectionId, blockId, 1), onClick: () => act.moveBlock(scope, sectionId, blockId, 1) },
    "sep",
    { key: "del", icon: "trash", label: t("themeEditor.delete"), danger: true, onClick: () => act.removeBlock(scope, sectionId, blockId) },
  ] : [
    { key: "dup", icon: "copy", label: t("themeEditor.duplicate"), onClick: () => act.duplicateSection(scope, sectionId) },
    { key: "up", icon: "arrowUp", label: t("themeEditor.moveUp"), disabled: !canMoveSection(cfg, scope, sectionId, -1), onClick: () => act.moveSection(scope, sectionId, -1) },
    { key: "down", icon: "arrowDown", label: t("themeEditor.moveDown"), disabled: !canMoveSection(cfg, scope, sectionId, 1), onClick: () => act.moveSection(scope, sectionId, 1) },
    "sep",
    { key: "del", icon: "trash", label: t("themeEditor.delete"), danger: true, onClick: () => act.removeSection(scope, sectionId) },
  ];
  return (
    <span style={{ position: "relative" }}>
      <button className="te-ibtn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title={t("themeEditor.more")} aria-label={t("themeEditor.more")}><Icon name="moreHorizontal" size={16} /></button>
      {open && <Menu items={items} onClose={() => setOpen(false)} />}
    </span>
  );
}

export function AddSectionPopup({ cfg, theme, scope, t, sl, onPick, onClose }) {
  const ref = useRef(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  useOutsideClose(ref, onClose);
  const all = addableSections(cfg, scope);
  const cats = theme.categories.filter((c) => all.some((d) => d.category === c));
  const needle = q.trim().toLowerCase();
  const shown = all.filter((d) => (cat === "all" || d.category === cat) && (!needle || sl(`s.${d.type}`).toLowerCase().includes(needle)));
  return (
    <div ref={ref} role="dialog" aria-label={t("themeEditor.addSection")} className="te2-addpop">
      <div style={{ padding: 10, borderBottom: "1px solid var(--ne-border)" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", insetInlineStart: 10, top: 9, color: "var(--ne-muted)", display: "inline-flex" }}><Icon name="search" size={14} /></span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("themeEditor.searchSections")} aria-label={t("themeEditor.searchSections")} style={{ ...inputStyle, paddingInlineStart: 32 }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {["all", ...cats].map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className="te2-chip">{c === "all" ? t("themeEditor.cat.all") : sl(`cat.${c}`)}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {shown.length === 0 && <p className="te2-empty">{t("themeEditor.noSectionsFound")}</p>}
        {shown.map((d) => (
          <button key={d.type} type="button" className="te-popitem" onClick={() => onPick(d.type)}>
            <Icon name={CATEGORY_ICON[d.category] || "layout"} size={15} />
            <span style={{ flex: 1 }}>{sl(`s.${d.type}`)}</span>
            <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{sl(`cat.${d.category}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Tree(props) {
  const { cfg, page, t, readOnly, expanded, onOpenAdd } = props;
  const groups = [
    { scope: "header", title: t("themeEditor.v2.headerGroup") },
    { scope: page, title: t("themeEditor.v2.templateGroup") },
    { scope: "footer", title: t("themeEditor.v2.footerGroup") },
  ];
  return (
    <div>
      {groups.map((g) => {
        const sections = listSections(cfg, g.scope);
        const canAdd = addableSections(cfg, g.scope).length > 0;
        return (
          <section key={g.scope} aria-label={g.title} style={{ marginBottom: 14 }}>
            <h3 className="te2-group">{g.title}</h3>
            {sections.length === 0 && <p className="te2-empty">{t("themeEditor.emptyGroup")}</p>}
            {sections.map((s) => <SectionNode key={s.id} ctx={props} scope={g.scope} section={s} expanded={expanded.has(s.id)} />)}
            {!readOnly && canAdd && (
              <button type="button" className="te-add" onClick={() => onOpenAdd(g.scope)}><Icon name="plus" size={14} />{t("themeEditor.addSection")}</button>
            )}
          </section>
        );
      })}
    </div>
  );
}
