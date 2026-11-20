// Shopify-style product editor for eNeezam products (2026-11): full page, two columns.
// Left: title, rich description, media (drag to reorder, upload, Neezi photos), options + variants, details
// (3 key points, 2 card points, benefits, ingredients, how to use). Right: status, organization, Neezi writer.
// Saves through the worker (/save-store-product), which re-checks every limit and sanitizes the HTML.
import { useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import Icon from "./Icon";
import RichTextEditor from "./RichTextEditor";
import { htmlText } from "../lib/richtext";

const LIM = { title: 90, subtitle: 60, key: 70, card: 18, benefit: 40, benefits: 6, text: 1200, optName: 30, optValues: 30 };
const STYLES = [["studio", "Clean studio"], ["pastel", "Pastel colour (beauty)"], ["lifestyle", "Lifestyle"], ["dark", "Dark tech"], ["marble", "Marble luxury"]];
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const textToHtml = (t) => String(t || "").split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
const words2 = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
const combos = (opts) => { let out = [[]]; for (const o of opts) out = out.flatMap((c) => o.values.map((v) => [...c, v])); return opts.length ? out.slice(0, 100) : []; };
const blankVariant = () => ({ title: "Default", price: "", compare_at_price: "", sku: "", inventory_quantity: "", continue_selling: false, weight_grams: "", options: [] });

function fromProduct(p) {
  const d = p?.details || {};
  return {
    title: p?.title || "",
    html: p?.description_html || textToHtml(p?.description || ""),
    status: p?.status || (p ? "draft" : "active"), vendor: p?.vendor || "", product_type: p?.product_type || "", tags: p?.tags || [],
    images: (p?.images || []).map((i) => (typeof i === "string" ? { url: i, mirrored: false } : i)),
    options: (p?.options || []).map((o) => ({ name: o.name, values: [...o.values] })),
    variants: (p?.variants?.length ? p.variants : [blankVariant()]).map((v) => ({
      id: v.id, title: v.title || "Default", price: v.price ?? "", compare_at_price: v.compare_at_price ?? "", sku: v.sku || "",
      inventory_quantity: v.inventory_quantity ?? "", continue_selling: !!v.continue_selling, weight_grams: v.weight_grams ?? "", options: v.options || [],
    })),
    subtitle: d.subtitle || "", key_points: [...(d.key_points || []), "", "", ""].slice(0, 3), card_points: [...(d.card_points || []), "", ""].slice(0, 2),
    benefits: d.benefits || [], ingredients: d.ingredients || "", how_to_use: d.how_to_use || "",
  };
}

export default function ProductEditor({ storeId, cfUrl, product, onClose, onSaved, onListOnShopify }) {
  const [f, setF] = useState(() => fromProduct(product));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState("");
  const [style, setStyle] = useState("studio");
  const [suggest, setSuggest] = useState(null);
  const [dragI, setDragI] = useState(null);
  const [benefitDraft, setBenefitDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const fileRef = useRef(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const dirty = useRef(false);
  const upd = (k, v) => { dirty.current = true; set(k, v); };

  const api = async (path, body, method = "POST") => {
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${cfUrl}${path}`, { method, headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(180000) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok && !d.error) d.error = `HTTP ${res.status}`;
      return d;
    } catch (e) { return { error: e?.name === "TimeoutError" ? "Took too long, please try again." : "Network problem, please try again." }; }
  };

  /* ---------------- media ---------------- */
  const upload = async (files) => {
    const list = [...(files || [])].filter((x) => x.type.startsWith("image/")).slice(0, 10);
    if (!list.length) return;
    setBusy("upload"); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    let before = 0, after = 0, n = 0;
    for (const file of list) {
      const res = await fetch(`${cfUrl}/growth/upload-image?store_id=${storeId}&kind=product`, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": file.type }, body: file });
      const d = await res.json().catch(() => ({}));
      if (!d.url) { setMsg({ kind: "error", text: d.error || "Upload failed" }); break; }
      before += d.before || file.size; after += d.after || file.size; n++;
      setF((x) => ({ ...x, images: [...x.images, { url: d.url, mirrored: true, alt: "" }] }));
    }
    dirty.current = true;
    if (n) setMsg({ kind: "ok", text: `${n} picture${n > 1 ? "s" : ""} added as WebP (${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB).` });
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
  };
  const neeziPhoto = async (i) => {
    setBusy(`ai-${i}`); setMsg({ kind: "info", text: "Neezi is making a brand photo (20 to 60 seconds)…" });
    const d = await api("/growth/neezi-product-photo", { store_id: storeId, image_url: f.images[i]?.url, title: f.title, style });
    if (d.url) { upd("images", [...f.images, { url: d.url, mirrored: true, alt: "" }]); setMsg({ kind: "ok", text: "Neezi photo added at the end. Drag it to the first place to make it the main photo." }); }
    else setMsg({ kind: "error", text: d.error || "Neezi could not make the photo" });
    setBusy("");
  };
  const toWebp = async (i) => {
    setBusy(`webp-${i}`);
    const d = await api("/growth/convert-image", { store_id: storeId, url: f.images[i]?.url, kind: "product" });
    if (d.url) upd("images", f.images.map((im, j) => (j === i ? { ...im, url: d.url, mirrored: true } : im)));
    else setMsg({ kind: "error", text: d.error || "Could not convert" });
    setBusy("");
  };
  const drop = (to) => {
    if (dragI === null || dragI === to) return;
    const imgs = [...f.images];
    const [m] = imgs.splice(dragI, 1);
    imgs.splice(to, 0, m);
    upd("images", imgs);
    setDragI(null);
  };

  /* ---------------- options / variants ---------------- */
  const rebuild = (options) => {
    const clean = options.map((o) => ({ name: o.name.trim(), values: o.values.filter(Boolean) })).filter((o) => o.name && o.values.length);
    const list = combos(clean);
    setF((x) => {
      if (!list.length) return { ...x, options, variants: x.variants.length ? [{ ...x.variants[0], title: "Default", options: [] }] : [blankVariant()] };
      const base = x.variants[0] || blankVariant();
      const byKey = new Map(x.variants.map((v) => [(v.options || []).join(" / "), v]));
      const variants = list.map((vals) => {
        const key = vals.join(" / ");
        const old = byKey.get(key) || x.variants.find((v) => v.title === key);
        return old ? { ...old, title: key, options: vals } : { ...blankVariant(), price: base.price, compare_at_price: base.compare_at_price, continue_selling: base.continue_selling, title: key, options: vals };
      });
      return { ...x, options, variants };
    });
    dirty.current = true;
  };
  const setOpt = (i, patch) => rebuild(f.options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setVar = (i, k, v) => upd("variants", f.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setAllVar = (k, v) => upd("variants", f.variants.map((x) => ({ ...x, [k]: v })));

  /* ---------------- Neezi writer ---------------- */
  const neeziWrite = async () => {
    setBusy("write"); setMsg({ kind: "info", text: "Neezi is reading your product and your other listings…" });
    const d = await api("/growth/neezi-product-copy", { store_id: storeId, product: { title: f.title, description: htmlText(f.html), vendor: f.vendor, product_type: f.product_type, tags: f.tags, variants: f.variants } });
    setBusy("");
    if (d.copy) { setSuggest(d.copy); setMsg({ kind: "ok", text: "Neezi wrote a new listing. Check it on the right and apply what you like." }); }
    else setMsg({ kind: "error", text: d.error || "Neezi could not write right now" });
  };
  const applySuggest = (which = "all") => {
    const c = suggest; if (!c) return;
    setF((x) => ({
      ...x,
      ...(which === "all" || which === "title" ? { title: c.title } : {}),
      ...(which === "all" || which === "description" ? { html: c.description_html } : {}),
      ...(which === "all" || which === "details" ? {
        subtitle: c.details.subtitle || x.subtitle,
        key_points: [...c.details.key_points, "", "", ""].slice(0, 3), card_points: [...c.details.card_points, "", ""].slice(0, 2),
        benefits: c.details.benefits.length ? c.details.benefits : x.benefits,
        ingredients: c.details.ingredients || x.ingredients, how_to_use: c.details.how_to_use || x.how_to_use,
      } : {}),
    }));
    dirty.current = true;
    if (which === "all") setSuggest(null);
  };

  /* ---------------- save ---------------- */
  const errors = useMemo(() => {
    const e = [];
    if (!f.title.trim()) e.push("Title is required");
    if (f.title.length > LIM.title) e.push(`Title is longer than ${LIM.title} characters`);
    f.variants.forEach((v, i) => { if (v.price === "" || !(Number(v.price) >= 0)) e.push(`${f.variants.length > 1 ? `Variant ${i + 1}: ` : ""}price is required`); });
    if (htmlText(f.html).length > 6000) e.push("Description is too long");
    return e;
  }, [f]);
  const save = async () => {
    if (errors.length) { setMsg({ kind: "error", text: errors[0] }); return; }
    setSaving(true); setMsg(null);
    const body = {
      store_id: storeId,
      product: {
        ...(product?.id ? { id: product.id } : {}),
        title: f.title.trim(), description_html: f.html, status: f.status, vendor: f.vendor.trim(), product_type: f.product_type.trim(), tags: f.tags,
        images: f.images,
        options: f.options.filter((o) => o.name && o.values.length),
        details: { subtitle: f.subtitle, key_points: f.key_points.filter(Boolean), card_points: f.card_points.map(words2).filter(Boolean), benefits: f.benefits, ingredients: f.ingredients, how_to_use: f.how_to_use },
        variants: f.variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}), title: v.title || "Default", price: Number(v.price), compare_at_price: v.compare_at_price === "" || v.compare_at_price === null ? null : Number(v.compare_at_price),
          sku: String(v.sku || "").trim(), inventory_quantity: v.inventory_quantity === "" || v.inventory_quantity === null ? null : parseInt(v.inventory_quantity, 10),
          continue_selling: !!v.continue_selling, weight_grams: v.weight_grams === "" ? undefined : Number(v.weight_grams), options: v.options,
        })),
      },
    };
    const d = await api("/save-store-product", body);
    setSaving(false);
    if (d.error || !d.product) { setMsg({ kind: "error", text: d.error || "Could not save" }); return; }
    dirty.current = false;
    setMsg({ kind: "ok", text: "Saved. The store shows it within a minute." });
    onSaved?.(d.product);
  };
  const close = () => { if (!dirty.current || window.confirm("Leave without saving your changes?")) onClose(); };

  /* ---------------- UI ---------------- */
  const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: 16, display: "grid", gap: 12 };
  const input = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
  const label = { fontSize: 12, fontWeight: 700, color: "var(--ne-text)", display: "flex", justifyContent: "space-between", marginBottom: 5 };
  const hint = { fontSize: 11.5, color: "var(--ne-muted)", margin: 0 };
  const btn = (p, dis) => ({ padding: "8px 14px", borderRadius: 9, border: p ? "none" : "1px solid var(--ne-border)", background: dis ? "var(--ne-border)" : p ? "var(--ne-grad)" : "transparent", color: p ? "#fff" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: dis ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" });
  const count = (s, n) => <span style={{ fontWeight: 600, color: String(s || "").length > n ? "var(--ne-danger)" : "var(--ne-muted)" }}>{String(s || "").length}/{n}</span>;
  const chip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", fontSize: 12 };
  const multi = f.options.some((o) => o.name && o.values.length);
  const handle = (f.title || "product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "var(--ne-bg)", overflowY: "auto", color: "var(--ne-text)" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--ne-bg)", borderBottom: "1px solid var(--ne-border)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={close} style={btn(false)} aria-label="Back"><Icon name="chevronLeft" size={13} /></button>
          <b style={{ fontSize: 16, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product?.id ? f.title || "Edit product" : "Add product"}</b>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: f.status === "active" ? "var(--ne-success-soft)" : "var(--ne-warning-soft)", color: f.status === "active" ? "var(--ne-success)" : "var(--ne-warning)" }}>{f.status === "active" ? "Active" : f.status === "draft" ? "Draft" : "Archived"}</span>
          <button type="button" onClick={neeziWrite} disabled={!!busy} style={btn(false, !!busy)}><Icon name="sparkle" size={13} /> {busy === "write" ? "Neezi is writing…" : "Write with Neezi"}</button>
          <button type="button" onClick={save} disabled={saving} style={btn(true, saving)}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 20px 60px" }}>
        {msg && <div style={{ ...card, padding: 10, marginBottom: 14, fontSize: 12.5, borderColor: msg.kind === "error" ? "var(--ne-danger)" : msg.kind === "ok" ? "var(--ne-success)" : "var(--ne-border)", color: msg.kind === "error" ? "var(--ne-danger)" : "var(--ne-text)" }}>{msg.text}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 18, alignItems: "start" }} className="ne-pe-grid">
          <style>{"@media(max-width:900px){.ne-pe-grid{grid-template-columns:1fr!important}}"}</style>
          {/* ================= left ================= */}
          <div style={{ display: "grid", gap: 16 }}>
            <div style={card}>
              <div><label style={label}>Title {count(f.title, LIM.title)}</label><input style={input} value={f.title} maxLength={120} placeholder="e.g. Glow Vitamin C Serum 30ml" onChange={(e) => upd("title", e.target.value)} /></div>
              <div><label style={label}>Description</label><RichTextEditor value={f.html} onChange={(h) => upd("html", h)} placeholder="What it is, key benefits, how to use…" /></div>
            </div>

            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 13.5 }}>Media</b>
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <select style={{ ...input, width: "auto", padding: "6px 8px" }} value={style} onChange={(e) => setStyle(e.target.value)} title="Neezi photo style (use the same style for all products so the store looks like one brand)">{STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <button type="button" style={btn(false, !!busy || !f.images.length)} disabled={!!busy || !f.images.length} onClick={() => neeziPhoto(0)}><Icon name="sparkle" size={12} /> {busy === "ai-0" ? "Designing…" : "Neezi brand photo"}</button>
                </span>
              </div>
              <div onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
                {f.images.map((im, i) => (
                  <div key={`${im.url}-${i}`} draggable onDragStart={() => setDragI(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(i); }}
                    style={{ position: "relative", gridColumn: i === 0 ? "span 2" : undefined, gridRow: i === 0 ? "span 2" : undefined, aspectRatio: "1", borderRadius: 12, overflow: "hidden", border: dragI === i ? "2px dashed var(--ne-accent)" : "1px solid var(--ne-border)", background: "var(--ne-surface)", cursor: "grab" }}>
                    <img src={im.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
                    {i === 0 && <span style={{ position: "absolute", left: 8, top: 8, fontSize: 10.5, fontWeight: 800, background: "rgba(0,0,0,.65)", color: "#fff", padding: "2px 8px", borderRadius: 999 }}>Main</span>}
                    <span style={{ position: "absolute", right: 6, bottom: 6, display: "flex", gap: 4 }}>
                      {!/\.webp(\?|$)/i.test(im.url) && <button type="button" title="Make a small WebP copy" onClick={() => toWebp(i)} style={{ ...btn(false), padding: "3px 6px", fontSize: 10.5, background: "var(--ne-bg)" }}>{busy === `webp-${i}` ? "…" : "WebP"}</button>}
                      {i > 0 && <button type="button" title="Neezi brand photo from this picture" onClick={() => neeziPhoto(i)} disabled={!!busy} style={{ ...btn(false), padding: "3px 6px", background: "var(--ne-bg)" }}><Icon name="sparkle" size={11} /></button>}
                      <button type="button" title="Remove" onClick={() => upd("images", f.images.filter((_, j) => j !== i))} style={{ ...btn(false), padding: "3px 6px", background: "var(--ne-bg)", color: "var(--ne-danger)" }}><Icon name="trash" size={11} /></button>
                    </span>
                  </div>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} style={{ aspectRatio: "1", borderRadius: 12, border: "1.5px dashed var(--ne-border)", background: "transparent", color: "var(--ne-muted)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>
                  <span><Icon name="upload" size={18} /><br />{busy === "upload" ? "Uploading…" : "Add pictures"}<br /><span style={{ fontWeight: 500, fontSize: 11 }}>or drop files here</span></span>
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => upload(e.target.files)} />
              <div style={{ display: "flex", gap: 6 }}>
                <input style={input} placeholder="…or paste a picture link (https://)" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} />
                <button type="button" style={btn(false)} onClick={() => { if (/^https?:\/\/\S+$/.test(urlDraft)) { upd("images", [...f.images, { url: urlDraft.trim(), mirrored: false }]); setUrlDraft(""); } }}>Add</button>
              </div>
              <p style={hint}>Drag pictures to change the order. The first one is the main picture. Every upload is saved as a small WebP automatically.</p>
            </div>

            <div style={card}>
              <b style={{ fontSize: 13.5 }}>Variants</b>
              {f.options.map((o, i) => (
                <div key={i} style={{ border: "1px solid var(--ne-border)", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={input} placeholder="Option name, e.g. Size or Colour" maxLength={LIM.optName} value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} />
                    <button type="button" style={{ ...btn(false), color: "var(--ne-danger)" }} onClick={() => rebuild(f.options.filter((_, j) => j !== i))}><Icon name="trash" size={12} /></button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {o.values.map((v, j) => <span key={j} style={chip}>{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => setOpt(i, { values: o.values.filter((_, k) => k !== j) })} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ne-muted)" }}>×</button></span>)}
                    <input style={{ ...input, width: 180 }} placeholder="Add value, press Enter" onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const v = e.currentTarget.value.trim().slice(0, 40); if (v && !o.values.includes(v) && o.values.length < LIM.optValues) setOpt(i, { values: [...o.values, v] }); e.currentTarget.value = ""; } }} />
                  </div>
                </div>
              ))}
              {f.options.length < 3 && <div><button type="button" style={btn(false)} onClick={() => rebuild([...f.options, { name: f.options.length ? "Colour" : "Size", values: [] }])}><Icon name="plus" size={12} /> Add option like size or colour</button></div>}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
                  <thead><tr style={{ color: "var(--ne-muted)", textAlign: "left" }}>{[multi ? "Variant" : "", "Price (Rs)", "Compare at", "SKU", "Stock", "Sell when 0", "Weight (g)"].map((h) => <th key={h} style={{ padding: "6px 6px", fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {f.variants.map((v, i) => (
                      <tr key={v.id || v.title || i} style={{ borderTop: "1px solid var(--ne-border)" }}>
                        <td style={{ padding: 6, fontWeight: 700, whiteSpace: "nowrap" }}>{multi ? v.title : ""}</td>
                        <td style={{ padding: 6 }}><input style={input} inputMode="decimal" value={v.price} onChange={(e) => setVar(i, "price", e.target.value.replace(/[^\d.]/g, ""))} /></td>
                        <td style={{ padding: 6 }}><input style={input} inputMode="decimal" value={v.compare_at_price ?? ""} onChange={(e) => setVar(i, "compare_at_price", e.target.value.replace(/[^\d.]/g, ""))} /></td>
                        <td style={{ padding: 6 }}><input style={input} value={v.sku} onChange={(e) => setVar(i, "sku", e.target.value)} /></td>
                        <td style={{ padding: 6 }}><input style={input} inputMode="numeric" placeholder="Not tracked" value={v.inventory_quantity ?? ""} onChange={(e) => setVar(i, "inventory_quantity", e.target.value.replace(/[^\d-]/g, ""))} /></td>
                        <td style={{ padding: 6, textAlign: "center" }}><input type="checkbox" checked={!!v.continue_selling} onChange={(e) => setVar(i, "continue_selling", e.target.checked)} title="Keep selling when stock is 0" /></td>
                        <td style={{ padding: 6 }}><input style={input} inputMode="numeric" value={v.weight_grams ?? ""} onChange={(e) => setVar(i, "weight_grams", e.target.value.replace(/[^\d]/g, ""))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {f.variants.length > 1 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={btn(false)} onClick={() => { const p = window.prompt("Price for all variants (Rs)"); if (p && Number(p) >= 0) setAllVar("price", p); }}>Set all prices</button>
                <button type="button" style={btn(false)} onClick={() => setAllVar("continue_selling", !f.variants.every((v) => v.continue_selling))}>{f.variants.every((v) => v.continue_selling) ? "Stop selling at 0 for all" : "Sell at 0 stock for all"}</button>
              </div>}
              <p style={hint}>Leave stock empty if you don't count stock (it keeps selling). Tick "Sell when 0" to keep taking orders when stock runs out.</p>
            </div>

            <div style={card}>
              <b style={{ fontSize: 13.5 }}>Product details</b>
              <div><label style={label}>Subtitle (under the title) {count(f.subtitle, LIM.subtitle)}</label><input style={input} maxLength={LIM.subtitle} value={f.subtitle} placeholder="e.g. Brightens tone, fades dark spots" onChange={(e) => upd("subtitle", e.target.value)} /></div>
              <div><label style={label}>Key points on the product page (max 3)</label>
                <div style={{ display: "grid", gap: 6 }}>{f.key_points.map((k, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: "var(--ne-success)" }}>✓</span><input style={input} maxLength={LIM.key} value={k} placeholder={["Brightens skin and fades dark spots", "Boosts collagen for firmer skin", "Lightweight, absorbs in seconds"][i]} onChange={(e) => upd("key_points", f.key_points.map((x, j) => (j === i ? e.target.value : x)))} />{count(k, LIM.key)}</div>)}</div>
              </div>
              <div><label style={label}>Card tags on product cards (max 2, one or two words)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{f.card_points.map((k, i) => <input key={i} style={input} maxLength={LIM.card} value={k} placeholder={["Vegan", "40h battery"][i]} onChange={(e) => upd("card_points", f.card_points.map((x, j) => (j === i ? e.target.value.split(/\s+/).slice(0, 2).join(" ") : x)))} />)}</div>
              </div>
              <div><label style={label}>Benefits (chips, max {LIM.benefits}) </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {f.benefits.map((b, i) => <span key={i} style={chip}>{b}<button type="button" aria-label={`Remove ${b}`} onClick={() => upd("benefits", f.benefits.filter((_, j) => j !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ne-muted)" }}>×</button></span>)}
                  {f.benefits.length < LIM.benefits && <input style={{ ...input, width: 220 }} maxLength={LIM.benefit} value={benefitDraft} placeholder="e.g. Even skin tone, Enter" onChange={(e) => setBenefitDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = benefitDraft.trim(); if (v) upd("benefits", [...f.benefits, v]); setBenefitDraft(""); } }} />}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={label}>Ingredients {count(f.ingredients, LIM.text)}</label><textarea style={{ ...input, minHeight: 90, resize: "vertical" }} maxLength={LIM.text} value={f.ingredients} onChange={(e) => upd("ingredients", e.target.value)} placeholder="Water, Niacinamide 5%, …" /></div>
                <div><label style={label}>How to use {count(f.how_to_use, LIM.text)}</label><textarea style={{ ...input, minHeight: 90, resize: "vertical" }} maxLength={LIM.text} value={f.how_to_use} onChange={(e) => upd("how_to_use", e.target.value)} placeholder="Apply 2 to 3 drops on clean skin…" /></div>
              </div>
            </div>
          </div>

          {/* ================= right ================= */}
          <div style={{ display: "grid", gap: 16, position: "sticky", top: 70 }}>
            <div style={card}>
              <label style={label}>Status</label>
              <select style={input} value={f.status} onChange={(e) => upd("status", e.target.value)}><option value="active">Active (on the store)</option><option value="draft">Draft (hidden)</option><option value="archived">Archived</option></select>
            </div>
            <div style={card}>
              <b style={{ fontSize: 13.5 }}>Organization</b>
              <div><label style={label}>Product type</label><input style={input} value={f.product_type} placeholder="e.g. Serum" onChange={(e) => upd("product_type", e.target.value)} /></div>
              <div><label style={label}>Vendor / brand</label><input style={input} value={f.vendor} onChange={(e) => upd("vendor", e.target.value)} /></div>
              <div><label style={label}>Tags</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {f.tags.map((t, i) => <span key={i} style={chip}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => upd("tags", f.tags.filter((_, j) => j !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ne-muted)" }}>×</button></span>)}
                  <input style={input} value={tagDraft} placeholder="Add tag, Enter (bestseller = Best seller badge)" onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const v = tagDraft.trim(); if (v && !f.tags.includes(v)) upd("tags", [...f.tags, v]); setTagDraft(""); } }} />
                </div>
              </div>
            </div>
            <div style={{ ...card, borderColor: suggest ? "var(--ne-accent)" : "var(--ne-border)" }}>
              <b style={{ fontSize: 13.5, display: "flex", gap: 6, alignItems: "center" }}><Icon name="sparkle" size={14} /> Neezi</b>
              {!suggest ? <>
                <p style={hint}>Neezi rewrites the title, description, key points, card tags and benefits in the same style as your other products, like top Pakistani brands do. Nothing changes until you apply it.</p>
                <button type="button" style={btn(true, !!busy)} disabled={!!busy} onClick={neeziWrite}>{busy === "write" ? "Writing…" : "Write with Neezi"}</button>
              </> : <>
                <div style={{ fontSize: 12.5 }}><b>{suggest.title}</b>{suggest.details.subtitle && <div style={{ color: "var(--ne-muted)" }}>{suggest.details.subtitle}</div>}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{suggest.details.key_points.map((k) => <li key={k}>{k}</li>)}</ul>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{suggest.details.card_points.map((k) => <span key={k} style={chip}>{k}</span>)}</div>
                <div style={{ maxHeight: 160, overflowY: "auto", fontSize: 12, border: "1px solid var(--ne-border)", borderRadius: 8, padding: 8 }} dangerouslySetInnerHTML={{ __html: suggest.description_html }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" style={btn(true)} onClick={() => applySuggest("all")}>Apply all</button>
                  <button type="button" style={btn(false)} onClick={() => applySuggest("title")}>Title</button>
                  <button type="button" style={btn(false)} onClick={() => applySuggest("description")}>Description</button>
                  <button type="button" style={btn(false)} onClick={() => applySuggest("details")}>Points</button>
                  <button type="button" style={btn(false)} onClick={() => setSuggest(null)}>Discard</button>
                </div>
              </>}
            </div>
            <div style={card}>
              <b style={{ fontSize: 13.5 }}>Search preview</b>
              <div style={{ fontSize: 12 }}><div style={{ color: "#1a0dab", fontSize: 14 }}>{f.title || "Product title"}</div><div style={{ color: "#006621" }}>/product/{product?.handle || handle}</div><div style={{ color: "var(--ne-muted)" }}>{(f.subtitle || htmlText(f.html)).slice(0, 150)}</div></div>
            </div>
            {!product?.id && onListOnShopify && <button type="button" style={{ ...btn(false), justifyContent: "center" }} onClick={onListOnShopify}>List this on Shopify instead</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
