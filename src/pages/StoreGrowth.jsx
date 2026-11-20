// Online Store growth pages (Nov 2026): Collections, Menus, Campaigns & Upsell, Social proof, Reviews, the Theme
// library (5 themes x 4 versions with a live demo) and Neezi's store setup. All data goes through the worker
// (/growth/*); the storefront reads it from /store-extras (cached 60s).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { THEME_VERSIONS, getTheme, createDefaultConfig } from "../lib/themeV2/engine.generated";
import { buildNeeziConfig } from "../lib/neeziTheme";
import { useNeeziJob, getNeeziJob, startNeeziJob, patchNeeziJob, clearNeeziJob, setNeeziOpen, stepStart, stepDone, stepFailed, stepNote, creep, isNeeziBusy } from "../lib/neeziJob";

const CF = "https://neezam-erp.chmabdulsamee9.workers.dev";
const THEME_INFO = {
  glow: { name: "Aura", tag: "Beauty and skincare: soft cards, pack offers, bundles, benefit points, trust grid, tabs, floating cart", ref: "Skincare and personal care" },
  botanica: { name: "Bloom", tag: "Playful and colourful: best seller badges, Helps and Targets chips, sticky add to cart, pill tabs", ref: "Natural and K-beauty stores" },
  volt: { name: "Pulse", tag: "Bold tech and gadgets: % OFF, sale countdown, people viewing, colour options, warranty grid, spec tabs", ref: "Smart watches, earbuds, electronics" },
  luxe: { name: "Velour", tag: "Quiet and premium: big stacked images, thin serif, black buttons, accordions", ref: "Perfume, fashion, jewellery" },
  nova: { name: "Nova", tag: "Clean and simple, works for any store", ref: "eNeezam's original theme" },
};
const THEME_ORDER = ["glow", "botanica", "volt", "luxe", "nova"];

async function api(path, { method = "GET", body, timeout = 180000 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  let res;
  try {
    // every call has a time limit, so a request that never answers can't freeze Neezi's setup job
    res = await fetch(`${CF}${path}`, { method, headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    return { error: err?.name === "TimeoutError" ? "The server took too long to answer. Please try again." : "Network problem. Check the internet and try again." };
  }
  let data = {};
  try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
  if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
  return data;
}

/* ------------------------------------------------------------------ small UI kit */
const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: 18 };
const btn = (primary, disabled) => ({
  background: disabled ? "var(--ne-border)" : primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)",
  border: primary ? "none" : "1px solid var(--ne-border)", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
});
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box" };
const label = { fontSize: 11.5, fontWeight: 700, color: "var(--ne-muted)", marginBottom: 4, display: "block" };

function Page({ title, sub, actions, children }) {
  return (
    <div style={{ padding: "20px 24px 40px", maxWidth: 1180, margin: "0 auto", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{title}</h1>{sub && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ne-muted)", maxWidth: 720 }}>{sub}</p>}</div>
        <div style={{ display: "flex", gap: 8 }}>{actions}</div>
      </div>
      {children}
    </div>
  );
}
function Field({ l, children }) { return <label style={{ display: "block" }}><span style={label}>{l}</span>{children}</label>; }
function Toggle({ on, onChange, text }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "var(--ne-text)", fontSize: 13, padding: 0 }}>
      <span style={{ width: 34, height: 19, borderRadius: 99, background: on ? "#008060" : "#c9c9c9", position: "relative", flex: "none" }}><span style={{ position: "absolute", top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></span>{text}
    </button>
  );
}
function Note({ kind = "info", children }) {
  const c = kind === "error" ? ["#fee2e2", "#991b1b"] : kind === "ok" ? ["#dcfce7", "#166534"] : ["var(--ne-accent-soft)", "var(--ne-text)"];
  return <div style={{ background: c[0], color: c[1], borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>{children}</div>;
}
function Empty({ icon, text, action }) {
  return <div style={{ ...card, textAlign: "center", padding: 36, color: "var(--ne-muted)" }}><Icon name={icon} size={26} /><p style={{ margin: "10px 0 14px" }}>{text}</p>{action}</div>;
}

function useProducts(storeId) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    if (!storeId) return;
    fetch(`${CF}/get-store-products?store_id=${storeId}`).then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => setProducts([]));
  }, [storeId]);
  return products;
}

function useList(kind, storeId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const d = await api(`/growth/${kind}?store_id=${storeId}`);
    setItems(d.items || []); setError(d.error || ""); setLoading(false);
  }, [kind, storeId]);
  useEffect(() => { load(); }, [load]);
  const save = async (item) => { const d = await api(`/growth/${kind}`, { method: "POST", body: { store_id: storeId, item } }); if (!d.error) await load(); return d; };
  const remove = async (id) => { const d = await api(`/growth/${kind}`, { method: "DELETE", body: { store_id: storeId, id } }); if (!d.error) await load(); return d; };
  return { items, loading, error, save, remove, reload: load };
}

function ProductPicker({ products, value, onChange, max }) {
  const [q, setQ] = useState("");
  const list = products.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const set = new Set(value || []);
  return (
    <div style={{ border: "1px solid var(--ne-border)", borderRadius: 10, overflow: "hidden" }}>
      <input style={{ ...input, border: "none", borderBottom: "1px solid var(--ne-border)", borderRadius: 0 }} placeholder={`Search ${products.length} products`} value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {list.map((p) => (
          <label key={p.handle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderBottom: "1px solid var(--ne-border)", fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={set.has(p.handle)} disabled={!set.has(p.handle) && max && set.size >= max} onChange={(e) => onChange(e.target.checked ? [...(value || []), p.handle] : (value || []).filter((h) => h !== p.handle))} />
            {p.images?.[0] ? <img src={p.images[0]} alt="" width="32" height="32" style={{ borderRadius: 6, objectFit: "cover" }} /> : <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--ne-surface)" }} />}
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
            <span style={{ color: "var(--ne-muted)" }}>Rs {Number(p.variants?.[0]?.price || 0).toLocaleString("en-PK")}</span>
          </label>
        ))}
      </div>
      <div style={{ padding: "6px 10px", fontSize: 11.5, color: "var(--ne-muted)" }}>{set.size} selected</div>
    </div>
  );
}

/* ================================================================== Collections */
const RULE_FIELDS = [["title", "Title"], ["type", "Product type"], ["tag", "Tag"], ["vendor", "Vendor"], ["price", "Price"], ["text", "Title + description"]];
const RULE_OPS = { price: [["lt", "is less than"], ["gt", "is more than"], ["equals", "equals"]], other: [["contains", "contains"], ["equals", "is exactly"]] };

export function CollectionsPage({ storeId }) {
  const L = useList("collections", storeId);
  const products = useProducts(storeId);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const save = async () => {
    const d = await L.save(edit);
    if (d.error) setMsg({ kind: "error", text: d.error }); else { setMsg({ kind: "ok", text: "Collection saved. It shows on your store within a minute." }); setEdit(null); }
  };
  const countOf = (c) => {
    if (c.kind === "manual") return (c.product_handles || []).length;
    return "auto";
  };
  return (
    <Page title="Collections" sub="Group products (like Shopify): pick them by hand, or add rules and eNeezam keeps the collection up to date. Use them in menus, theme sections and campaigns." actions={<button style={btn(true)} onClick={() => setEdit({ title: "", handle: "", description: "", image_url: "", kind: "manual", product_handles: [], rules: [{ field: "title", op: "contains", value: "" }], match: "all", published: true })}><Icon name="plus" size={13} /> New collection</button>}>
      {msg && <Note kind={msg.kind}>{msg.text}</Note>}
      {edit && (
        <div style={{ ...card, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field l="Title"><input style={input} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Hair Care" /></Field>
            <Field l="Handle (link)"><input style={input} value={edit.handle} onChange={(e) => setEdit({ ...edit, handle: e.target.value })} placeholder="auto from title" /></Field>
          </div>
          <Field l="Description"><input style={input} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <Field l="Image URL (optional)"><input style={input} value={edit.image_url} onChange={(e) => setEdit({ ...edit, image_url: e.target.value })} placeholder="https://" /></Field>
          <div style={{ display: "flex", gap: 8 }}>
            {[["manual", "Pick products"], ["smart", "Automatic (rules)"]].map(([k, l]) => <button key={k} type="button" style={btn(edit.kind === k)} onClick={() => setEdit({ ...edit, kind: k })}>{l}</button>)}
          </div>
          {edit.kind === "manual" ? <ProductPicker products={products} value={edit.product_handles} onChange={(v) => setEdit({ ...edit, product_handles: v })} /> : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12.5 }}>Products must match <select style={{ ...input, width: "auto", display: "inline-block" }} value={edit.match} onChange={(e) => setEdit({ ...edit, match: e.target.value })}><option value="all">all rules</option><option value="any">any rule</option></select></div>
              {(edit.rules || []).map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr auto", gap: 8 }}>
                  <select style={input} value={r.field} onChange={(e) => { const rules = [...edit.rules]; rules[i] = { ...r, field: e.target.value, op: e.target.value === "price" ? "lt" : "contains" }; setEdit({ ...edit, rules }); }}>{RULE_FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <select style={input} value={r.op} onChange={(e) => { const rules = [...edit.rules]; rules[i] = { ...r, op: e.target.value }; setEdit({ ...edit, rules }); }}>{(r.field === "price" ? RULE_OPS.price : RULE_OPS.other).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <input style={input} value={r.value} onChange={(e) => { const rules = [...edit.rules]; rules[i] = { ...r, value: e.target.value }; setEdit({ ...edit, rules }); }} />
                  <button type="button" style={btn(false)} onClick={() => setEdit({ ...edit, rules: edit.rules.filter((_, j) => j !== i) })}><Icon name="trash" size={12} /></button>
                </div>
              ))}
              <div><button type="button" style={btn(false)} onClick={() => setEdit({ ...edit, rules: [...(edit.rules || []), { field: "title", op: "contains", value: "" }] })}><Icon name="plus" size={12} /> Add rule</button></div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Toggle on={edit.published} onChange={(v) => setEdit({ ...edit, published: v })} text="Visible on the store" />
            <div style={{ display: "flex", gap: 8 }}><button style={btn(false)} onClick={() => setEdit(null)}>Cancel</button><button style={btn(true, !edit.title)} disabled={!edit.title} onClick={save}>Save collection</button></div>
          </div>
        </div>
      )}
      {L.loading ? <p style={{ color: "var(--ne-muted)" }}>Loading…</p> : L.items.length === 0 ? <Empty icon="folder" text="No collections yet. Create one, or let Neezi make them from your products in Online Store › Themes." /> : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {L.items.map((c) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--ne-border)", fontSize: 13 }}>
              <div><b>{c.title}</b> <span style={{ color: "var(--ne-muted)", fontSize: 12 }}>/collection?c={c.handle}</span>{c.created_by === "neezi" && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "var(--ne-accent-soft)" }}>by Neezi</span>}</div>
              <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>{c.kind === "smart" ? "Automatic" : `${countOf(c)} products`}</span>
              <span style={{ fontSize: 12, color: c.published ? "#16a34a" : "var(--ne-muted)" }}>{c.published ? "Visible" : "Hidden"}</span>
              <span style={{ display: "flex", gap: 6 }}><button style={btn(false)} onClick={() => setEdit(c)}><Icon name="edit" size={12} /></button><button style={btn(false)} onClick={async () => { if (window.confirm(`Delete "${c.title}"?`)) await L.remove(c.id); }}><Icon name="trash" size={12} /></button></span>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ================================================================== Menus */
function LinkPicker({ value, onChange, collections, products }) {
  const options = [["/", "Home"], ["/collection", "Shop all"], ["/reviews", "Reviews"], ["/cart", "Cart"],
    ...collections.map((c) => [`/collection?c=${c.handle}`, `Collection: ${c.title}`]), ...products.slice(0, 80).map((p) => [`/product/${p.handle}`, `Product: ${p.title}`])];
  const known = options.some(([v]) => v === value);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select style={input} value={known ? value : "__custom"} onChange={(e) => onChange(e.target.value === "__custom" ? "" : e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}<option value="__custom">Custom link…</option>
      </select>
      {!known && <input style={input} value={value} placeholder="/page or https://" onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

export function MenusPage({ storeId }) {
  const L = useList("menus", storeId);
  const C = useList("collections", storeId);
  const products = useProducts(storeId);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const setItem = (i, patch, parent = null) => {
    const items = edit.items.map((x) => ({ ...x, children: [...(x.children || [])] }));
    if (parent === null) items[i] = { ...items[i], ...patch }; else items[parent].children[i] = { ...items[parent].children[i], ...patch };
    setEdit({ ...edit, items });
  };
  const move = (i, d) => { const items = [...edit.items]; const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; setEdit({ ...edit, items }); };
  const save = async () => { const d = await L.save(edit); if (d.error) setMsg({ kind: "error", text: d.error }); else { setMsg({ kind: "ok", text: "Menu saved." }); setEdit(null); } };
  return (
    <Page title="Menus" sub='Build your store navigation. "main-menu" is the header menu and "footer" the footer menu of the new themes (Header › Menu setting in the theme editor).' actions={<button style={btn(true)} onClick={() => setEdit({ title: "Main menu", handle: L.items.some((m) => m.handle === "main-menu") ? "" : "main-menu", items: [{ label: "Home", link: "/" }, { label: "Shop all", link: "/collection" }] })}><Icon name="plus" size={13} /> New menu</button>}>
      {msg && <Note kind={msg.kind}>{msg.text}</Note>}
      {edit && (
        <div style={{ ...card, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field l="Title"><input style={input} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field l="Handle"><input style={input} value={edit.handle} onChange={(e) => setEdit({ ...edit, handle: e.target.value })} placeholder="main-menu / footer / …" /></Field>
          </div>
          {(edit.items || []).map((it, i) => (
            <div key={i} style={{ border: "1px solid var(--ne-border)", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8 }}>
                <input style={input} value={it.label} placeholder="Label" onChange={(e) => setItem(i, { label: e.target.value })} />
                <LinkPicker value={it.link} onChange={(v) => setItem(i, { link: v })} collections={C.items} products={products} />
                <span style={{ display: "flex", gap: 4 }}>
                  <button type="button" style={btn(false)} onClick={() => move(i, -1)}>↑</button><button type="button" style={btn(false)} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" style={btn(false)} onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })}><Icon name="trash" size={12} /></button>
                </span>
              </div>
              {(it.children || []).map((ch, k) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8, paddingLeft: 24 }}>
                  <input style={input} value={ch.label} placeholder="Sub-item" onChange={(e) => setItem(k, { label: e.target.value }, i)} />
                  <LinkPicker value={ch.link} onChange={(v) => setItem(k, { link: v }, i)} collections={C.items} products={products} />
                  <button type="button" style={btn(false)} onClick={() => setItem(i, { children: it.children.filter((_, j) => j !== k) })}><Icon name="trash" size={12} /></button>
                </div>
              ))}
              <div style={{ paddingLeft: 24 }}><button type="button" style={{ ...btn(false), padding: "5px 10px" }} onClick={() => setItem(i, { children: [...(it.children || []), { label: "", link: "/collection" }] })}>+ Sub-item</button></div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button type="button" style={btn(false)} onClick={() => setEdit({ ...edit, items: [...(edit.items || []), { label: "", link: "/collection" }] })}><Icon name="plus" size={12} /> Add item</button>
            <div style={{ display: "flex", gap: 8 }}><button style={btn(false)} onClick={() => setEdit(null)}>Cancel</button><button style={btn(true, !edit.title)} disabled={!edit.title} onClick={save}>Save menu</button></div>
          </div>
        </div>
      )}
      {L.loading ? <p style={{ color: "var(--ne-muted)" }}>Loading…</p> : L.items.length === 0 ? <Empty icon="menu" text="No menus yet." /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
          {L.items.map((m) => (
            <div key={m.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><b>{m.title}</b><span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{m.handle}</span></div>
              <ul style={{ margin: "10px 0", paddingLeft: 18, fontSize: 12.5, color: "var(--ne-muted)" }}>{(m.items || []).slice(0, 8).map((x, i) => <li key={i}>{x.label}{x.children?.length ? ` (+${x.children.length})` : ""}</li>)}</ul>
              <div style={{ display: "flex", gap: 6 }}><button style={btn(false)} onClick={() => setEdit(m)}><Icon name="edit" size={12} /> Edit</button><button style={btn(false)} onClick={async () => { if (window.confirm(`Delete "${m.title}"?`)) await L.remove(m.id); }}><Icon name="trash" size={12} /></button></div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ================================================================== Campaigns & upsell */
const KIND = { sale: ["Sale (temporary discount)", "megaphone"], bogo: ["Buy X Get Y free", "tag"], bundle: ["Bundle / Frequently bought together", "package"], volume: ["Pack offers (buy more, save more)", "tag"] };
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
function campaignState(c) {
  const now = Date.now();
  if (!c.active) return ["Off", "var(--ne-muted)"];
  if (c.starts_at && Date.parse(c.starts_at) > now) return ["Scheduled", "#d97706"];
  if (!c.config?.renew && c.ends_at && Date.parse(c.ends_at) <= now) return ["Ended", "var(--ne-muted)"];
  return ["Live", "#16a34a"];
}

export function CampaignsPage({ storeId }) {
  const L = useList("campaigns", storeId);
  const C = useList("collections", storeId);
  const products = useProducts(storeId);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const blank = (kind) => ({ kind, title: kind === "sale" ? "Weekend sale" : kind === "bogo" ? "Buy 1 Get 1 Free" : kind === "volume" ? "Buy more, save more" : "Complete the routine", active: true, starts_at: null, ends_at: null, target: { scope: kind === "bundle" ? "products" : "all", handles: [], collection: "" }, value_type: "percent", value: kind === "bundle" ? 10 : kind === "volume" ? 0 : 20, config: kind === "bogo" ? { buy: 1, get: 1 } : kind === "volume" ? { tiers: [{ qty: 2, percent: 10 }, { qty: 3, percent: 15 }] } : {} });
  const save = async () => { const d = await L.save(edit); if (d.error) setMsg({ kind: "error", text: d.error }); else { setMsg({ kind: "ok", text: "Saved. Prices and badges update on the store within a minute; checkout applies the discount automatically." }); setEdit(null); } };
  const t = edit?.target || {};
  return (
    <Page title="Campaigns & Upsell" sub="Temporary discounts, Buy X Get Y free and bundles (frequently bought together). The store shows the offer and checkout applies it on the server, so nobody can change the price." actions={<>{Object.keys(KIND).map((k) => <button key={k} style={btn(k === "sale")} onClick={() => setEdit(blank(k))}><Icon name={KIND[k][1]} size={12} /> {k === "sale" ? "New sale" : k === "bogo" ? "Buy X Get Y" : k === "volume" ? "Pack offers" : "Bundle"}</button>)}</>}>
      {msg && <Note kind={msg.kind}>{msg.text}</Note>}
      {edit && (
        <div style={{ ...card, display: "grid", gap: 12 }}>
          <b>{KIND[edit.kind][0]}</b>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <Field l="Name (shoppers may see it)"><input style={input} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field l="Starts"><input type="datetime-local" style={input} value={toLocal(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: fromLocal(e.target.value) })} /></Field>
            <Field l="Ends (countdown shows on products)"><input type="datetime-local" style={input} value={toLocal(edit.ends_at)} disabled={!!edit.config?.renew} onChange={(e) => setEdit({ ...edit, ends_at: fromLocal(e.target.value) })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, alignItems: "end" }}>
            <Field l="Repeat (never ends)"><select style={input} value={edit.config?.renew || ""} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, renew: e.target.value || undefined } })}>
              <option value="">No, end on the date above</option><option value="hourly">Every hour (countdown to the next hour)</option><option value="daily">Every day (ends at midnight, starts again)</option><option value="weekly">Every week (ends Sunday midnight)</option>
            </select></Field>
            <Field l="Campaign banner on product pages (optional, wide picture)">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {edit.config?.banner_url && <img src={edit.config.banner_url} alt="" style={{ height: 40, borderRadius: 6 }} />}
                <label style={{ ...btn(false), cursor: "pointer" }}><Icon name="upload" size={12} /> {edit.config?.banner_url ? "Change" : "Upload"}<input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const { data: { session } } = await supabase.auth.getSession(); const r = await fetch(`${CF}/growth/upload-image?store_id=${storeId}&kind=banner`, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": file.type }, body: file }); const d = await r.json().catch(() => ({})); if (d.url) setEdit((x) => ({ ...x, config: { ...x.config, banner_url: d.url } })); else setMsg({ kind: "error", text: d.error || "Upload failed" }); }} /></label>
                {edit.config?.banner_url && <button type="button" style={btn(false)} onClick={() => setEdit({ ...edit, config: { ...edit.config, banner_url: undefined } })}>Remove</button>}
              </div>
            </Field>
          </div>
          {edit.kind === "sale" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field l="Discount"><select style={input} value={edit.value_type} onChange={(e) => setEdit({ ...edit, value_type: e.target.value })}><option value="percent">% off</option><option value="amount">Rs off each</option></select></Field>
              <Field l={edit.value_type === "percent" ? "Percent (max 90)" : "Rupees"}><input type="number" style={input} value={edit.value} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} /></Field>
            </div>
          )}
          {edit.kind === "bogo" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field l="Customer buys"><input type="number" min="1" style={input} value={edit.config.buy} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, buy: Number(e.target.value) } })} /></Field>
              <Field l="Gets free (cheapest units)"><input type="number" min="1" style={input} value={edit.config.get} onChange={(e) => setEdit({ ...edit, config: { ...edit.config, get: Number(e.target.value) } })} /></Field>
            </div>
          )}
          {edit.kind === "volume" && (
            <div style={{ display: "grid", gap: 8 }}>
              <span style={label}>Packs shown on the product page (e.g. Pack of 2: 10% off). Checkout gives the best pack the cart qualifies for.</span>
              {(edit.config.tiers || []).map((tier, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <Field l="Pack of (units)"><input type="number" min="2" max="99" style={input} value={tier.qty} onChange={(e) => setEdit({ ...edit, config: { tiers: edit.config.tiers.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)) } })} /></Field>
                  <Field l="% off the pack"><input type="number" min="1" max="90" style={input} value={tier.percent} onChange={(e) => setEdit({ ...edit, config: { tiers: edit.config.tiers.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)) } })} /></Field>
                  <button type="button" style={btn(false)} onClick={() => setEdit({ ...edit, config: { tiers: edit.config.tiers.filter((_, j) => j !== i) } })}><Icon name="trash" size={12} /></button>
                </div>
              ))}
              {(edit.config.tiers || []).length < 3 && <div><button type="button" style={btn(false)} onClick={() => setEdit({ ...edit, config: { tiers: [...(edit.config.tiers || []), { qty: ((edit.config.tiers || []).slice(-1)[0]?.qty || 1) + 1, percent: 10 }] } })}><Icon name="plus" size={12} /> Add pack</button></div>}
            </div>
          )}
          {edit.kind === "bundle" ? (
            <>
              <Field l="Bundle discount % (when all products are in the cart)"><input type="number" style={input} value={edit.value} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} /></Field>
              <span style={label}>Products in the bundle (2 to 4). Each product page shows the others as "Frequently bought together".</span>
              <ProductPicker products={products} max={4} value={t.handles} onChange={(v) => setEdit({ ...edit, target: { ...t, scope: "products", handles: v } })} />
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8 }}>{[["all", "All products"], ["collection", "A collection"], ["products", "Chosen products"]].map(([k, l]) => <button key={k} type="button" style={btn(t.scope === k)} onClick={() => setEdit({ ...edit, target: { ...t, scope: k } })}>{l}</button>)}</div>
              {t.scope === "collection" && <select style={input} value={t.collection} onChange={(e) => setEdit({ ...edit, target: { ...t, collection: e.target.value } })}><option value="">Choose a collection</option>{C.items.map((c) => <option key={c.id} value={c.handle}>{c.title}</option>)}</select>}
              {t.scope === "products" && <ProductPicker products={products} value={t.handles} onChange={(v) => setEdit({ ...edit, target: { ...t, handles: v } })} />}
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Toggle on={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} text="Active" />
            <div style={{ display: "flex", gap: 8 }}><button style={btn(false)} onClick={() => setEdit(null)}>Cancel</button><button style={btn(true)} onClick={save}>Save</button></div>
          </div>
        </div>
      )}
      {L.loading ? <p style={{ color: "var(--ne-muted)" }}>Loading…</p> : L.items.length === 0 ? <Empty icon="megaphone" text="No campaigns yet. Start a sale, a Buy 1 Get 1 or a bundle." /> : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {L.items.map((c) => {
            const [st, col] = campaignState(c);
            const what = c.kind === "sale" ? (c.value_type === "amount" ? `Rs ${c.value} off` : `${c.value}% off`) : c.kind === "bogo" ? `Buy ${c.config?.buy || 1} Get ${c.config?.get || 1}` : c.kind === "volume" ? (c.config?.tiers || []).map((x) => `${x.qty} for ${x.percent}% off`).join(" · ") : `${(c.target?.handles || []).length} products · ${c.value}% off`;
            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--ne-border)", fontSize: 13 }}>
                <Icon name={KIND[c.kind][1]} size={15} />
                <div><b>{c.title}</b> <span style={{ color: "var(--ne-muted)", fontSize: 12 }}>{what}{c.config?.renew ? ` · repeats ${c.config.renew === "hourly" ? "every hour" : c.config.renew === "daily" ? "every day" : "every week"}` : ""}{!c.config?.renew && c.ends_at ? ` · ends ${new Date(c.ends_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}` : ""}</span></div>
                <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{st}</span>
                <Toggle on={c.active} onChange={async (v) => { await L.save({ ...c, active: v }); }} />
                <span style={{ display: "flex", gap: 6 }}><button style={btn(false)} onClick={() => setEdit(c)}><Icon name="edit" size={12} /></button><button style={btn(false)} onClick={async () => { if (window.confirm(`Delete "${c.title}"?`)) await L.remove(c.id); }}><Icon name="trash" size={12} /></button></span>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

/* ================================================================== Social proof */
export function SocialProofPage({ storeId }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (storeId) api(`/growth/storefront-settings?store_id=${storeId}`).then((d) => setS(d.social || null)); }, [storeId]);
  const save = async () => { const d = await api("/growth/storefront-settings", { method: "POST", body: { store_id: storeId, social: s } }); setMsg(d.error ? { kind: "error", text: d.error } : { kind: "ok", text: "Saved. The store updates within a minute." }); };
  if (!s) return <Page title="Social proof"><p style={{ color: "var(--ne-muted)" }}>Loading…</p></Page>;
  return (
    <Page title="Social proof" sub='"Someone from Lahore just bought…" popups and "N bought today" on products. By default it uses your real orders: only the city and product, never a name or phone number.' actions={<button style={btn(true)} onClick={save}>Save</button>}>
      {msg && <Note kind={msg.kind}>{msg.text}</Note>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 16 }}>
        <div style={{ ...card, display: "grid", gap: 14 }}>
          <Toggle on={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} text="Show social proof on my store" />
          <div>
            <span style={label}>Data</span>
            {[["real", "Real orders (recommended)", "Recent orders on your store: city and product only."], ["mixed", "Real + random", "Real orders, topped up with random picks when there are few."], ["random", "Random", "Random cities and products. Use with care: shoppers may take it as real."]].map(([k, t, d]) => (
              <label key={k} style={{ display: "flex", gap: 10, padding: "8px 0", cursor: "pointer" }}><input type="radio" checked={s.mode === k} onChange={() => setS({ ...s, mode: k })} /><span><b style={{ fontSize: 13 }}>{t}</b><span style={{ display: "block", fontSize: 12, color: "var(--ne-muted)" }}>{d}</span></span></label>
            ))}
            {s.mode !== "real" && <Note>Random purchases are not real. Some ad platforms and shoppers see invented activity as misleading; "Real orders" is the safe default.</Note>}
          </div>
          <Toggle on={s.popup} onChange={(v) => setS({ ...s, popup: v })} text='Popup: "Someone from … bought …"' />
          {s.popup && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field l="Every (seconds)"><input type="number" min="5" max="120" style={input} value={s.popup_interval_s} onChange={(e) => setS({ ...s, popup_interval_s: Number(e.target.value) })} /></Field>
              <Field l="Position"><select style={input} value={s.popup_position} onChange={(e) => setS({ ...s, popup_position: e.target.value })}><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></Field>
            </div>
          )}
          <Toggle on={s.bought_today} onChange={(v) => setS({ ...s, bought_today: v })} text='"N bought today" on product cards and pages' />
          {s.bought_today && s.mode !== "real" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field l="Random number from"><input type="number" style={input} value={s.bought_min} onChange={(e) => setS({ ...s, bought_min: Number(e.target.value) })} /></Field>
              <Field l="to"><input type="number" style={input} value={s.bought_max} onChange={(e) => setS({ ...s, bought_max: Number(e.target.value) })} /></Field>
            </div>
          )}
        </div>
        <div style={{ ...card, background: "var(--ne-surface)" }}>
          <span style={label}>Preview</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#fff", color: "#111", border: "1px solid #e7e7ea", borderRadius: 14, padding: 10, boxShadow: "0 14px 34px rgba(0,0,0,.12)", marginTop: 10 }}>
            <span style={{ width: 52, height: 52, borderRadius: 10, background: "linear-gradient(135deg,#fde68a,#f59e0b)", flex: "none" }} />
            <span style={{ fontSize: 12.5, lineHeight: 1.35 }}><span style={{ color: "#666", display: "block" }}>Someone from Lahore bought</span><b>Vitamin C Serum</b><span style={{ color: "#666", display: "block", fontSize: 11.5 }}>4 min ago</span></span>
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "#dc2626", fontWeight: 700 }}>● 23 bought today</p>
        </div>
      </div>
    </Page>
  );
}

/* ================================================================== Reviews */
export function ReviewsPage({ storeId }) {
  const L = useList("reviews", storeId);
  const products = useProducts(storeId);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const avg = L.items.length ? (L.items.reduce((a, r) => a + r.rating, 0) / L.items.length).toFixed(1) : "0";
  const save = async () => { const d = await L.save(edit); if (d.error) setMsg({ kind: "error", text: d.error }); else { setMsg({ kind: "ok", text: "Review saved." }); setEdit(null); } };
  return (
    <Page title="Reviews" sub="Customer reviews for your store and products. They show in the Reviews section, on product pages (stars), and on your /reviews page. Add only real reviews from your customers." actions={<button style={btn(true)} onClick={() => setEdit({ product_handle: "", rating: 5, author: "", city: "", body: "", photo_url: "", status: "published", source: "manual" })}><Icon name="plus" size={13} /> Add review</button>}>
      {msg && <Note kind={msg.kind}>{msg.text}</Note>}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ ...card, flex: 1 }}><span style={label}>Average</span><b style={{ fontSize: 22 }}>{avg} ★</b></div>
        <div style={{ ...card, flex: 1 }}><span style={label}>Published</span><b style={{ fontSize: 22 }}>{L.items.filter((r) => r.status === "published").length}</b></div>
        <div style={{ ...card, flex: 1 }}><span style={label}>Hidden</span><b style={{ fontSize: 22 }}>{L.items.filter((r) => r.status !== "published").length}</b></div>
      </div>
      {edit && (
        <div style={{ ...card, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
            <Field l="Product (optional)"><select style={input} value={edit.product_handle} onChange={(e) => setEdit({ ...edit, product_handle: e.target.value })}><option value="">Whole store</option>{products.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}</select></Field>
            <Field l="Rating"><select style={input} value={edit.rating} onChange={(e) => setEdit({ ...edit, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select></Field>
            <Field l="Name"><input style={input} value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} placeholder="Ayesha K." /></Field>
            <Field l="City"><input style={input} value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} placeholder="Lahore" /></Field>
          </div>
          <Field l="Review"><textarea style={{ ...input, minHeight: 70 }} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
          <Field l="Photo URL (optional)"><input style={input} value={edit.photo_url} onChange={(e) => setEdit({ ...edit, photo_url: e.target.value })} placeholder="https://" /></Field>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Toggle on={edit.status === "published"} onChange={(v) => setEdit({ ...edit, status: v ? "published" : "hidden" })} text="Published" />
            <div style={{ display: "flex", gap: 8 }}><button style={btn(false)} onClick={() => setEdit(null)}>Cancel</button><button style={btn(true, !edit.body)} disabled={!edit.body} onClick={save}>Save review</button></div>
          </div>
        </div>
      )}
      {L.loading ? <p style={{ color: "var(--ne-muted)" }}>Loading…</p> : L.items.length === 0 ? <Empty icon="comment" text="No reviews yet." /> : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          {L.items.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--ne-border)", fontSize: 13 }}>
              <span style={{ color: "#f5a524" }}>{"★".repeat(r.rating)}</span>
              <div style={{ minWidth: 0 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.body}</div><div style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{[r.author, r.city, products.find((p) => p.handle === r.product_handle)?.title].filter(Boolean).join(" · ")}</div></div>
              <Toggle on={r.status === "published"} onChange={async (v) => { await L.save({ ...r, status: v ? "published" : "hidden" }); }} />
              <span style={{ display: "flex", gap: 6 }}><button style={btn(false)} onClick={() => setEdit(r)}><Icon name="edit" size={12} /></button><button style={btn(false)} onClick={async () => { if (window.confirm("Delete this review?")) await L.remove(r.id); }}><Icon name="trash" size={12} /></button></span>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ================================================================== Theme library + Neezi setup */
function DemoFrame({ src, height = 230 }) {
  const W = 1280;
  const [w, setW] = useState(300);
  return (
    <div ref={(el) => { if (el && el.clientWidth && el.clientWidth !== w) setW(el.clientWidth); }} style={{ position: "relative", height, overflow: "hidden", borderRadius: 10, border: "1px solid var(--ne-border)", background: "#fff" }}>
      <iframe title="Theme demo" src={src} loading="lazy" style={{ width: W, height: (height / w) * W, border: 0, transform: `scale(${w / W})`, transformOrigin: "0 0", pointerEvents: "none" }} />
    </div>
  );
}

export function ThemeLibrary({ store, liveUrl, onCreated, onOpenThemeEditor }) {
  const [theme, setTheme] = useState("glow");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const job = useNeeziJob();
  const base = liveUrl || "https://drglow.online";
  const versions = THEME_VERSIONS[theme] || [];
  const openNeezi = (themeId, versionId) => {
    const j = getNeeziJob();
    // a setup that is still running (or waiting for review) for this store is reopened, not restarted
    if (j && j.storeId === store.id && j.phase !== "done" && (isNeeziBusy(j) || j.phase === "review")) { setNeeziOpen(true); return; }
    startNeeziJob({ storeId: store.id, storeName: store.store_name, store, liveUrl: base, theme: themeId, version: versionId, auto: false, onCreated, onOpenThemeEditor });
  };
  useEffect(() => { if (job && job.storeId === store.id) patchNeeziJob({ onCreated, onOpenThemeEditor }); }, [store.id, onCreated, onOpenThemeEditor]); // eslint-disable-line react-hooks/exhaustive-deps
  const addVersion = async (v) => {
    setBusy(v.id); setMsg(null);
    const cfg = createDefaultConfig(theme, v.id);
    if (cfg) cfg.settings.store_name = store?.store_name || "";
    const d = await api("/create-store-theme", { method: "POST", body: { store_id: store.id, name: `${THEME_INFO[theme].name} · ${v.name}`, theme_config: cfg } });
    setBusy("");
    if (d.error || !d.theme) setMsg({ kind: "error", text: d.error || "Could not create the theme" });
    else { setMsg({ kind: "ok", text: `"${THEME_INFO[theme].name} · ${v.name}" was added to your themes as a draft. Customize it, then publish.` }); onCreated?.(d.theme); }
  };
  const running = job && job.storeId === store.id && isNeeziBusy(job);
  return (
    <div style={{ ...card, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Theme library</h2><p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ne-muted)" }}>5 themes, 4 versions each. Previews use sample products so you can see the look before you choose.</p></div>
        <button style={btn(true)} onClick={() => openNeezi(theme, versions[0]?.id)}><Icon name="sparkle" size={13} /> {running ? `Neezi is working · ${Math.round(job.percent)}%` : "Set up my store with Neezi"}</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{THEME_ORDER.filter((id) => getTheme(id)).map((id) => <button key={id} style={btn(theme === id)} onClick={() => setTheme(id)}>{THEME_INFO[id].name}</button>)}</div>
      <p style={{ margin: 0, fontSize: 12.5 }}><b>{THEME_INFO[theme].name}</b> · {THEME_INFO[theme].tag}</p>
      {msg && <Note kind={msg.kind}>{msg.text}</Note>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
        {versions.map((v) => (
          <div key={v.id} style={{ border: "1px solid var(--ne-border)", borderRadius: 12, padding: 10, display: "grid", gap: 8, background: "var(--ne-surface)" }}>
            <DemoFrame src={`${base}/__demo/${theme}/${v.id}`} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <b style={{ fontSize: 13 }}>{v.name}</b>
              <span style={{ display: "flex", gap: 3 }}>{(v.swatch || []).map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: "50%", background: c, border: "1px solid var(--ne-border)" }} />)}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <a style={{ ...btn(false), textDecoration: "none" }} href={`${base}/__demo/${theme}/${v.id}`} target="_blank" rel="noreferrer"><Icon name="eye" size={12} /> Preview</a>
              <button style={btn(false, !!busy)} disabled={!!busy} onClick={() => addVersion(v)}>{busy === v.id ? "Adding…" : "Use"}</button>
              <button style={btn(true)} onClick={() => openNeezi(theme, v.id)}><Icon name="sparkle" size={12} /> Neezi</button>
            </div>
          </div>
        ))}
      </div>
      {job && job.open && job.storeId === store.id && <NeeziSetup job={job} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Neezi setup job (runs outside React) */
const BANNER_PROMPTS = (j) => [
  `Premium hero banner for "${j.storeName}", an online store in Pakistan. ${j.res?.proposal?.home?.hero_heading || ""}. Product-style studio composition, soft light, empty space on the left for text, no text, no logos.`,
  `Sale promo banner background for "${j.storeName}", vibrant gradient, festive, product props, no text.`,
];
const tierOfJob = (j) => j.tier || j.plan?.tier || "essential";

async function neeziPropose() {
  const j = getNeeziJob();
  if (!j || isNeeziBusy(j)) return;
  patchNeeziJob({ phase: "thinking", error: "", timeline: [], percent: 2, res: null, banners: [], created: null });
  stepNote(`Started: ${THEME_INFO[j.theme]?.name} · ${(THEME_VERSIONS[j.theme] || []).find((v) => v.id === j.version)?.name || ""}${j.auto ? " · Neezi does everything" : ""}`);
  const s1 = stepStart("Reading all your products (titles and descriptions)", 4);
  const stop = creep(34, 1.6);
  const d = await api("/growth/neezi-setup", { method: "POST", body: { store_id: j.storeId, action: "propose", tier: j.plan?.is_creator ? j.tier : undefined } });
  stop();
  if (d.error) { stepFailed(s1, `Could not read products: ${d.error}`); patchNeeziJob({ phase: "choose", error: d.error }); return; }
  const eng = d.engine === "agnes" ? "Agnes AI" : d.engine === "gemini" ? "Gemini" : "keyword rules (AI busy)";
  stepDone(s1, `Read ${d.product_count} products with ${eng}`, 36);
  const p = d.proposal;
  stepNote(`Planned ${p.collections.length} collections: ${p.collections.map((c) => c.title).slice(0, 6).join(", ")}${p.collections.length > 6 ? "…" : ""}`, "done");
  stepNote(`Planned menus: header (${p.menus.main.length} links), footer (${p.menus.footer.length} links)`, "done");
  stepNote("Wrote homepage heading, text, announcement and FAQ", "done");
  patchNeeziJob({ res: d, picked: Object.fromEntries(p.collections.map((c) => [c.handle, true])), percent: 40, phase: "review" });
  const now = getNeeziJob();
  if (now.auto) {
    if (tierOfJob(now) !== "essential") await neeziBanners();
    await neeziApply();
  } else stepNote("Waiting for you to review Neezi's plan", "wait");
}

async function neeziBanners() {
  const j = getNeeziJob();
  if (!j || !j.res) return;
  const back = j.phase;
  patchNeeziJob({ phase: "banners", error: "" });
  const out = [];
  const prompts = BANNER_PROMPTS(j);
  for (let i = 0; i < prompts.length; i++) {
    const sid = stepStart(`Agnes is designing banner ${i + 1} of ${prompts.length}`);
    const stop = creep(40 + ((i + 1) * 25) / prompts.length, 0.6);
    const d = await api("/growth/neezi-banner", { method: "POST", body: { store_id: j.storeId, prompt: prompts[i], tier: j.plan?.is_creator ? j.tier : undefined } });
    stop();
    if (d.url) { out.push(d.url); stepDone(sid, `Banner ${i + 1} ready`); }
    else { stepFailed(sid, `Banner ${i + 1} failed: ${d.error || "unknown error"}. The theme keeps its built-in banners.`); patchNeeziJob({ error: d.error || "Banner failed" }); break; }
  }
  patchNeeziJob({ banners: out.length ? out : getNeeziJob().banners || [], phase: back === "banners" ? "review" : back, percent: Math.max(getNeeziJob().percent, 65) });
}

async function neeziApply() {
  const j = getNeeziJob();
  if (!j || !j.res) return;
  patchNeeziJob({ phase: "applying", error: "" });
  const proposal = { ...j.res.proposal, collections: j.res.proposal.collections.filter((c) => j.picked?.[c.handle]) };
  const s1 = stepStart(`Saving ${proposal.collections.length} collections and 2 menus`, Math.max(j.percent, 70));
  const stop = creep(84, 1.5);
  const a = await api("/growth/neezi-setup", { method: "POST", body: { store_id: j.storeId, action: "apply", proposal } });
  stop();
  if (a.error) { stepFailed(s1, `Saving failed: ${a.error}`); patchNeeziJob({ phase: "review", error: a.error }); return; }
  stepDone(s1, `Saved ${a.results?.collections ?? 0} collections and ${a.results?.menus ?? 0} menus`, 86);
  const s2 = stepStart("Building your theme: header, homepage sections, banners, FAQ", 88);
  const cfg = buildNeeziConfig({ themeId: j.theme, versionId: j.version, storeName: j.storeName, proposal, banners: j.banners || [] });
  const v = (THEME_VERSIONS[j.theme] || []).find((x) => x.id === j.version);
  const stop2 = creep(97, 2);
  const d = await api("/create-store-theme", { method: "POST", body: { store_id: j.storeId, name: `${THEME_INFO[j.theme].name} · ${v?.name || ""} · by Neezi`, theme_config: cfg } });
  stop2();
  if (d.error || !d.theme) { stepFailed(s2, `Theme could not be created: ${d.error || "unknown error"}`); patchNeeziJob({ phase: "review", error: d.error || "Theme could not be created" }); return; }
  stepDone(s2, `Draft theme "${d.theme.name}" created (not published)`, 100);
  stepNote("Done. Your live store does not change until you publish the theme.", "done");
  patchNeeziJob({ phase: "done", created: { theme: d.theme, results: a.results }, percent: 100 });
  try { getNeeziJob().onCreated?.(d.theme); } catch { /* page may be gone */ }
}

function Timeline({ items }) {
  if (!items?.length) return null;
  const dot = { done: ["#16a34a", "✓"], running: ["var(--ne-accent, #6366f1)", "•"], error: ["#dc2626", "!"], wait: ["#d97706", "…"], info: ["var(--ne-muted)", "•"] };
  return (
    <div style={{ display: "grid", gap: 0, maxHeight: 260, overflowY: "auto", padding: "4px 2px" }}>
      {items.map((s, i) => {
        const [c, ch] = dot[s.status] || dot.info;
        return (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
              <span className={s.status === "running" ? "neezi-pulse" : ""} style={{ width: 18, height: 18, borderRadius: "50%", background: c, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ch}</span>
              {i < items.length - 1 && <span style={{ flex: 1, width: 2, minHeight: 10, background: "var(--ne-border)" }} />}
            </div>
            <div style={{ fontSize: 12.5, paddingBottom: 10, color: s.status === "error" ? "#dc2626" : "var(--ne-text)" }}>{s.text}</div>
            <span style={{ fontSize: 11, color: "var(--ne-muted)", whiteSpace: "nowrap" }}>{s.status === "running" ? "working…" : s.ms ? `${(s.ms / 1000).toFixed(1)}s` : new Date(s.at).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" })}</span>
          </div>
        );
      })}
    </div>
  );
}

function NeeziSetup({ job }) {
  const { theme, version, plan, tier, res, picked = {}, banners = [], created, error, phase } = job;
  useEffect(() => {
    // always re-read: the plan is set in the master dashboard and can change between visits
    if (!isNeeziBusy(job)) api(`/growth/plan?store_id=${job.storeId}`).then((d) => { if (d && d.tier) patchNeeziJob({ plan: d, tier: d.tier }); });
  }, [job.storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const versions = THEME_VERSIONS[theme] || [];
  const effTier = plan?.tier || tier || "essential";
  const busy = isNeeziBusy(job);
  const close = () => setNeeziOpen(false);
  const setProposal = (patch) => patchNeeziJob((j) => ({ res: { ...j.res, proposal: { ...j.res.proposal, ...patch(j.res.proposal) } } }));
  const tierLabel = { essential: "Essential · Neezi AI Store Launch", grow: "Grow · Neezi AI Design Studio", advance: "Advance · Neezi AI Design Studio" }[effTier];
  const pct = Math.round(job.percent || 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,14,38,.55)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={close}>
      <style>{"@keyframes neeziPulse{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,.55)}50%{box-shadow:0 0 0 6px rgba(99,102,241,0)}}.neezi-pulse{animation:neeziPulse 1.4s infinite}"}</style>
      <div style={{ ...card, background: "var(--ne-surface-2)", width: "min(860px,100%)", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ width: 36, height: 36, borderRadius: 11, background: "var(--ne-grad)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="sparkle" size={17} /></span><div><b style={{ fontSize: 15 }}>Neezi store setup</b><div style={{ fontSize: 12, color: "var(--ne-muted)" }}>{tierLabel}</div></div></div>
          <button style={btn(false)} onClick={close} title={busy ? "Close: Neezi keeps working in the background" : "Close"}><Icon name="close" size={13} /></button>
        </div>
        {phase !== "choose" && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><b>{phase === "done" ? "Store setup complete" : phase === "review" ? "Plan ready: review it below" : "Neezi is setting up your store"}</b><b>{pct}%</b></div>
            <div style={{ height: 8, borderRadius: 99, background: "var(--ne-border)", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--ne-grad)", transition: "width .6s" }} /></div>
            {busy && <div style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>You can close this window or go to another page. Neezi keeps working and shows its progress in the corner.</div>}
            <Timeline items={job.timeline} />
          </div>
        )}
        {error && !busy && <Note kind="error">{error}</Note>}
        {phase === "choose" && (
          <>
            <p style={{ margin: 0, fontSize: 13 }}>Neezi reads all your products (titles and descriptions), then makes your <b>collections</b>, the <b>header and footer menus</b> and your <b>homepage text</b>, and builds a draft of the theme you pick. Nothing goes live until you publish it.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field l="Theme"><select style={input} value={theme} onChange={(e) => patchNeeziJob({ theme: e.target.value, version: (THEME_VERSIONS[e.target.value] || [])[0]?.id })}>{THEME_ORDER.map((id) => <option key={id} value={id}>{THEME_INFO[id].name}</option>)}</select></Field>
              <Field l="Version"><select style={input} value={version} onChange={(e) => patchNeeziJob({ version: e.target.value })}>{versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            </div>
            <DemoFrame src={`${job.liveUrl}/__demo/${theme}/${version}`} height={260} />
            {plan && (
              <div style={{ fontSize: 12, color: "var(--ne-muted)", background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 9, padding: "8px 10px" }}>
                Plan: <b style={{ color: "var(--ne-text)" }}>{plan.plan_name || "No plan set"}</b> · {effTier === "essential" ? "Neezi builds your store; AI banners and photos come with Grow and Advance." : "includes AI banners and product photos."}
                {plan.is_creator && <span> To test another plan, change it in Master Dashboard → Manage access.</span>}
              </div>
            )}
            <Toggle on={!!job.auto} onChange={(v) => patchNeeziJob({ auto: v })} text={`Let Neezi do everything without stopping for review${effTier === "essential" ? "" : " (including AI banners)"}`} />
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button style={btn(true)} onClick={neeziPropose}><Icon name="sparkle" size={13} /> {job.auto ? "Set up my store" : "Let Neezi read my products"}</button></div>
          </>
        )}
        {phase === "review" && res && (
          <>
            <Note>Neezi read {res.product_count} products{res.engine === "rules" ? " (AI was not available, so it grouped them by keywords; you can edit everything later)" : ` with ${res.engine === "agnes" ? "Agnes AI" : "Gemini"}`}. Untick anything you don't want.</Note>
            <div><span style={label}>Collections</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
                {res.proposal.collections.map((c) => (
                  <label key={c.handle} style={{ display: "flex", gap: 8, alignItems: "flex-start", border: "1px solid var(--ne-border)", borderRadius: 10, padding: 10, cursor: "pointer", fontSize: 12.5 }}>
                    <input type="checkbox" checked={!!picked[c.handle]} onChange={(e) => patchNeeziJob({ picked: { ...picked, [c.handle]: e.target.checked } })} />
                    <span><b>{c.title}</b><span style={{ display: "block", color: "var(--ne-muted)" }}>{c.count} products</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><span style={label}>Main menu</span><div style={{ fontSize: 12.5 }}>{res.proposal.menus.main.map((m) => m.label).join(" · ")}</div></div>
              <div><span style={label}>Footer menu</span><div style={{ fontSize: 12.5 }}>{res.proposal.menus.footer.map((m) => m.label).join(" · ")}</div></div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <Field l="Announcement"><input style={input} value={res.proposal.home.announcement} onChange={(e) => setProposal((p) => ({ home: { ...p.home, announcement: e.target.value } }))} /></Field>
              <Field l="Homepage heading"><input style={input} value={res.proposal.home.hero_heading} onChange={(e) => setProposal((p) => ({ home: { ...p.home, hero_heading: e.target.value } }))} /></Field>
              <Field l="Homepage text"><input style={input} value={res.proposal.home.hero_text} onChange={(e) => setProposal((p) => ({ home: { ...p.home, hero_text: e.target.value } }))} /></Field>
            </div>
            <div style={{ ...card, background: "var(--ne-surface)" }}>
              <b style={{ fontSize: 13 }}>AI banners (Agnes)</b>
              {effTier === "essential" ? <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ne-muted)" }}>Banners designed by AI are part of the Grow and Advance plans. Your theme uses its built-in banners for now.</p> : (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--ne-muted)" }}>Neezi asks Agnes to design a hero and a sale banner for your brand.</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{banners.map((u) => <img key={u} src={u} alt="" style={{ width: 220, height: 92, objectFit: "cover", borderRadius: 8 }} />)}</div>
                  <div><button style={btn(false)} onClick={neeziBanners}>{banners.length ? "Make new banners" : "Design my banners"}</button></div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><button style={btn(false)} onClick={() => patchNeeziJob({ phase: "choose", timeline: [], percent: 0, error: "" })}>Start over</button><button style={btn(true)} onClick={neeziApply}><Icon name="check" size={13} /> Create collections, menus and draft theme</button></div>
          </>
        )}
        {phase === "done" && created && (
          <>
            <Note kind="ok">Done: {created.results?.collections ?? 0} collections and {created.results?.menus ?? 0} menus were saved, and the draft theme "{created.theme.name}" is ready. Your live store does not change until you publish it.</Note>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btn(false)} onClick={clearNeeziJob}>Close</button>
              {job.onOpenThemeEditor && <button style={btn(true)} onClick={() => { const id = created.theme?.id; if (!id) return; job.onOpenThemeEditor(id); setTimeout(clearNeeziJob, 0); }}><Icon name="edit" size={13} /> Open in theme editor</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function StoreGrowthPage({ page, storeId }) {
  const P = useMemo(() => ({ collections: CollectionsPage, menus: MenusPage, campaigns: CampaignsPage, "social-proof": SocialProofPage, reviews: ReviewsPage }), []);
  const C = P[page] || CollectionsPage;
  return <C storeId={storeId} />;
}
