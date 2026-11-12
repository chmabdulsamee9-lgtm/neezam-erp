import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { PAGE_PROPS, pageValue, slugify } from "../lib/themeTokens";
import { EDIT_FRAME_NAME } from "../lib/editMode";

// UI Editor > Page editor: the real app runs in a frame; click anything on the page to change its colours,
// text, spacing, corners or hide it, for this one element or for all similar items (e.g. every order card).
// Colours can be saved under a name and reused; changing a named colour changes it everywhere.

const PAGES = [
  ["home", "Home"], ["orders", "Orders"], ["courier", "Booked Orders"], ["returns", "Returns"], ["products", "Products"],
  ["dashboard", "Dashboard"], ["courier-dashboard", "Courier Dashboard"], ["pnl", "Income Statement"], ["ledger", "Supplier Ledger"],
  ["finance-statement", "Courier Payments"], ["online-store", "Online Store"], ["store-connect", "Store Connect"], ["settings", "Settings"],
];

export default function PageEditor({ theme, setTheme }) {
  const frameRef = useRef(null);
  const [page, setPage] = useState("orders");
  const [framePage, setFramePage] = useState("");
  const [mobile, setMobile] = useState(false);
  const [picking, setPicking] = useState(true);
  const [picked, setPicked] = useState(null); // { page, selector, general, label, styles }
  const [scopeAll, setScopeAll] = useState(true);
  const [newColor, setNewColor] = useState({ name: "", value: "#5C7CFA" });
  const origin = window.location.origin;

  const post = (msg) => frameRef.current?.contentWindow?.postMessage(msg, origin);
  // live preview: every change goes straight into the frame
  useEffect(() => { post({ type: "ne-theme", theme }); }, [theme]);
  useEffect(() => { post({ type: "ne-pick-mode", on: picking }); }, [picking]);
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data || {};
      if (d.type === "ne-ready") { post({ type: "ne-theme", theme }); post({ type: "ne-pick-mode", on: picking }); }
      if (d.type === "ne-page") setFramePage(d.page);
      if (d.type === "ne-pick") setPicked(d);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  const palette = theme.palette || [];
  const rules = (theme.pages && theme.pages[framePage]) || [];
  const selector = picked ? (scopeAll ? picked.general : picked.selector) : null;
  const rule = picked ? rules.find((r) => r.selector === selector) : null;
  const valueOf = (prop) => (rule && rule.styles[prop] !== undefined ? rule.styles[prop] : picked?.styles?.[prop] ?? "");

  const writeRule = (mutate) => {
    if (!picked) return;
    setTheme((prev) => {
      const pages = { ...(prev.pages || {}) };
      const list = [...(pages[picked.page] || [])];
      const i = list.findIndex((r) => r.selector === selector);
      const current = i >= 0 ? { ...list[i], styles: { ...list[i].styles } } : { selector, label: picked.label + (scopeAll ? " (all similar)" : ""), styles: {} };
      mutate(current.styles);
      if (Object.keys(current.styles).length === 0) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = current; else list.push(current);
      pages[picked.page] = list;
      if (!list.length) delete pages[picked.page];
      return { ...prev, pages };
    });
  };
  const setProp = (prop, value) => writeRule((s) => { if (value === "" || value === null) delete s[prop]; else s[prop] = value; });
  const clearRule = () => writeRule((s) => { for (const k of Object.keys(s)) delete s[k]; });
  const removeRuleAt = (sel) => setTheme((prev) => {
    const pages = { ...(prev.pages || {}) };
    pages[framePage] = (pages[framePage] || []).filter((r) => r.selector !== sel);
    if (!pages[framePage].length) delete pages[framePage];
    return { ...prev, pages };
  });

  const addColor = (value, name) => {
    const n = String(name || "").trim();
    if (!n || !/^#[0-9a-f]{6}$/i.test(value)) return null;
    const slug = slugify(n);
    setTheme((prev) => ({ ...prev, palette: [...(prev.palette || []).filter((c) => c.slug !== slug), { name: n, slug, value }] }));
    return `var(--ne-c-${slug})`;
  };
  const updateColor = (slug, patch) => setTheme((prev) => ({ ...prev, palette: (prev.palette || []).map((c) => (c.slug === slug ? { ...c, ...patch } : c)) }));
  const removeColor = (slug) => setTheme((prev) => ({ ...prev, palette: (prev.palette || []).filter((c) => c.slug !== slug) }));
  const colorOf = (v) => { const m = /^var\(--ne-c-([a-z0-9-]+)\)$/.exec(v || ""); return m ? palette.find((c) => c.slug === m[1])?.value || "#000000" : /^#[0-9a-f]{6}$/i.test(v || "") ? v : "#000000"; };

  const control = (p) => {
    const v = valueOf(p.prop);
    const changed = rule && rule.styles[p.prop] !== undefined;
    return (
      <div key={p.prop} className="ne-pe-prop">
        <div className="ne-uie-label"><span>{p.label}</span>{changed && <button type="button" title="Back to the page's own value" onClick={() => setProp(p.prop, "")}><Icon name="undo" size={11} /></button>}</div>
        {p.kind === "color" && (
          <div className="ne-uie-color">
            <input type="color" value={colorOf(v)} onChange={(e) => setProp(p.prop, e.target.value)} />
            <select value={/^var\(/.test(v) ? v : ""} onChange={(e) => e.target.value && setProp(p.prop, e.target.value)}>
              <option value="">{/^#/.test(v) ? v : "Pick a named colour"}</option>
              {palette.map((c) => <option key={c.slug} value={`var(--ne-c-${c.slug})`}>{c.name}</option>)}
            </select>
            {/^#/.test(v) && changed && (
              <button type="button" className="ne-pe-mini" title="Save this colour with a name" onClick={() => { const name = window.prompt("Name for this colour (e.g. Brand Blue)"); const ref = addColor(v, name); if (ref) setProp(p.prop, ref); }}>Name it</button>
            )}
          </div>
        )}
        {(p.kind === "px" || p.kind === "num") && (
          <div className="ne-uie-range">
            <input type="range" min={p.min} max={p.max} step={p.step || 1} value={Number(v) || 0} onChange={(e) => setProp(p.prop, Number(e.target.value))} />
            <span>{pageValue(p.prop, v) || "—"}</span>
          </div>
        )}
        {p.kind === "enum" && (
          <div className="ne-uie-seg">
            {p.options.map((o) => <button key={o || "show"} type="button" className={String(v) === o ? "on" : ""} onClick={() => setProp(p.prop, o)}>{o === "" ? "show" : o === "none" && p.prop === "display" ? "hide" : o}</button>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ne-pe">
      <div className="ne-pe-stage">
        <div className="ne-uie-stagebar">
          <select value={page} onChange={(e) => { setPage(e.target.value); setPicked(null); }}>
            {PAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <div className="ne-uie-seg">
            <button type="button" className={!mobile ? "on" : ""} onClick={() => setMobile(false)}>Desktop</button>
            <button type="button" className={mobile ? "on" : ""} onClick={() => setMobile(true)}>Mobile</button>
          </div>
          <div className="ne-uie-seg">
            <button type="button" className={picking ? "on" : ""} onClick={() => setPicking(true)}>Select</button>
            <button type="button" className={!picking ? "on" : ""} onClick={() => setPicking(false)}>Use the page</button>
          </div>
          <span>{picking ? "Click anything on the page to edit it" : "Clicks work normally (open tabs, filters...)"}</span>
        </div>
        <div className="ne-pe-framewrap">
          <iframe ref={frameRef} name={EDIT_FRAME_NAME} title="Page preview" src={`/${page}`} key={page}
            style={{ width: mobile ? 390 : "100%", height: "100%" }} />
        </div>
      </div>

      <aside className="ne-uie-panel ne-pe-panel">
        {!picked ? (
          <p className="ne-pe-hint">Pick an element on the page. Then change its colour, text size, spacing, corners, or hide it. Changes show live; Save draft or Publish live at the top.</p>
        ) : (
          <>
            <div className="ne-pe-picked">
              <b>{picked.label}</b>
              <div className="ne-uie-seg ne-uie-modes">
                <button type="button" className={!scopeAll ? "on" : ""} onClick={() => setScopeAll(false)}>Only this one</button>
                <button type="button" className={scopeAll ? "on" : ""} onClick={() => setScopeAll(true)}>All similar</button>
              </div>
              <code title={selector}>{selector}</code>
            </div>
            {PAGE_PROPS.map(control)}
            {rule && <button type="button" className="ne-pe-danger" onClick={clearRule}><Icon name="undo" size={12} /> Remove my changes here</button>}
          </>
        )}

        <h3>Changes on this page ({rules.length})</h3>
        {rules.length === 0 && <p className="ne-pe-hint">No changes yet.</p>}
        {rules.map((r) => (
          <div key={r.selector} className="ne-pe-rule">
            <span title={r.selector}>{r.label || r.selector}</span>
            <small>{Object.keys(r.styles).join(", ")}</small>
            <button type="button" onClick={() => removeRuleAt(r.selector)} title="Remove"><Icon name="close" size={10} /></button>
          </div>
        ))}

        <h3>Named colours</h3>
        {palette.map((c) => (
          <div key={c.slug} className="ne-pe-color">
            <input type="color" value={c.value} onChange={(e) => updateColor(c.slug, { value: e.target.value })} />
            <input type="text" value={c.name} onChange={(e) => updateColor(c.slug, { name: e.target.value })} />
            <button type="button" onClick={() => removeColor(c.slug)} title="Delete"><Icon name="close" size={10} /></button>
          </div>
        ))}
        <div className="ne-pe-color">
          <input type="color" value={newColor.value} onChange={(e) => setNewColor((s) => ({ ...s, value: e.target.value }))} />
          <input type="text" placeholder="New colour name" value={newColor.name} onChange={(e) => setNewColor((s) => ({ ...s, name: e.target.value }))} />
          <button type="button" onClick={() => { if (addColor(newColor.value, newColor.name)) setNewColor({ name: "", value: newColor.value }); }} title="Add"><Icon name="check" size={11} /></button>
        </div>
      </aside>
    </div>
  );
}
