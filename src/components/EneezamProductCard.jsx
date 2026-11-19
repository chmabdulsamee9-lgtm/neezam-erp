// eNeezam product card: the same three-zone layout as the Shopify products tab (header with vendor/type and the
// active toggle, one row per variant with SKU/price/compare/stock, footer with actions), editable in place.
// Changes stay on the card until "Save" (one /save-store-product call); the full editor opens from the pencil.
import { useState } from "react";
import Icon from "./Icon";
import { generateSku } from "../utils/skuGenerator";

const fieldLabel = { fontSize: 9.5, fontWeight: 700, color: "var(--ne-muted-2)", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 3 };
const cell = { padding: "5px 8px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11.5, boxSizing: "border-box" };
const iconBtn = (c) => ({ background: "transparent", border: "none", color: c, cursor: "pointer", padding: 4, borderRadius: 6, display: "inline-flex" });
const pill = (bg, fg) => ({ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" });

export default function EneezamProductCard({ p, selected, onSelect, onOpen, onDelete, onSave, storeUrl, allSkus, isMobile }) {
  const [d, setD] = useState(null); // draft: { title, vendor, product_type, status, variants }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const cur = d || { title: p.title, vendor: p.vendor || "", product_type: p.product_type || "", status: p.status, variants: (p.variants || []).map((v) => ({ ...v })) };
  const change = (patch) => setD({ ...cur, ...patch });
  const setVar = (i, k, v) => change({ variants: cur.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const save = async (over) => {
    const next = { ...cur, ...(over || {}) };
    setSaving(true); setErr("");
    const r = await onSave(p, {
      title: next.title, vendor: next.vendor, product_type: next.product_type, status: next.status,
      variants: next.variants.map((v) => ({
        ...v, price: Number(v.price) || 0, compare_at_price: v.compare_at_price === "" || v.compare_at_price === null || Number(v.compare_at_price) === 0 ? null : Number(v.compare_at_price),
        inventory_quantity: v.inventory_quantity === "" || v.inventory_quantity === null || v.inventory_quantity === undefined ? null : parseInt(v.inventory_quantity, 10),
      })),
    });
    setSaving(false);
    if (r?.error) setErr(r.error); else { setD(null); setEditTitle(false); }
  };
  const img = p.thumbnail;
  const url = storeUrl && p.handle ? `${storeUrl}/product/${p.handle}` : null;
  const pending = (p.pending_images || 0) + (p.failed_images || 0);

  const statusZone = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {d && <button type="button" onClick={() => save()} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--ne-accent)", color: "#fff", border: "none", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}><Icon name={saving ? "refresh" : "check"} size={11} />{saving ? "Saving…" : "Save"}</button>}
      {d && <button type="button" onClick={() => { setD(null); setErr(""); setEditTitle(false); }} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}><Icon name="close" size={11} />Discard</button>}
      <button type="button" title={cur.status === "active" ? "Active: on the store" : "Draft: hidden"} disabled={saving}
        onClick={() => save({ status: cur.status === "active" ? "draft" : "active" })}
        style={{ width: 34, height: 18, borderRadius: 10, border: "none", cursor: "pointer", position: "relative", background: cur.status === "active" ? "var(--ne-success)" : "var(--ne-border)", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 2, left: cur.status === "active" ? 17 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
      </button>
    </div>
  );

  return (
    <div style={{ background: "var(--ne-surface-2)", border: `1px solid ${selected ? "var(--ne-accent)" : "var(--ne-border)"}`, borderRadius: 14, padding: isMobile ? 12 : 16 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${p.title}`} style={{ cursor: "pointer", marginTop: 4, flexShrink: 0 }} />
        {img ? <img src={img} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, cursor: "pointer" }} onClick={onOpen} />
          : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="package" size={16} /></div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editTitle ? (
            <input autoFocus value={cur.title} maxLength={255} onChange={(e) => change({ title: e.target.value })} style={{ ...cell, width: "100%", fontSize: 13 }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {url ? <a href={url} target="_blank" rel="noreferrer" title="View on store" style={{ color: "var(--ne-text)", textDecoration: "none", fontWeight: 700, fontSize: 13.5 }}>{cur.title}</a> : <span style={{ fontWeight: 700, fontSize: 13.5 }}>{cur.title}</span>}
              <span role="button" tabIndex={0} title="Edit title" onClick={() => setEditTitle(true)} onKeyDown={(e) => { if (e.key === "Enter") setEditTitle(true); }} style={{ cursor: "pointer", color: "var(--ne-muted-2)", display: "inline-flex" }}><Icon name="edit" size={10} /></span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "flex-end" }}>
            <div><span style={fieldLabel}>Vendor</span><input value={cur.vendor} placeholder="Vendor" onChange={(e) => change({ vendor: e.target.value })} style={{ ...cell, width: isMobile ? 140 : 110 }} /></div>
            <div><span style={fieldLabel}>Type</span><input value={cur.product_type} placeholder="Product Type" onChange={(e) => change({ product_type: e.target.value })} style={{ ...cell, width: isMobile ? 140 : 110 }} /></div>
            {(p.details?.card_points || []).length > 0 && <div style={{ display: "flex", gap: 4, paddingBottom: 4 }}>{p.details.card_points.map((c) => <span key={c} style={pill("var(--ne-accent-soft)", "var(--ne-accent)")}>{c}</span>)}</div>}
            {isMobile && statusZone}
          </div>
        </div>
        {!isMobile && statusZone}
      </div>
      {err && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ne-danger)" }}>{err}</p>}

      {/* variants */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 8 }}>
        {cur.variants.map((v, i) => {
          const vt = v.title && v.title !== "Default" && v.title !== "Default Title" ? v.title : "";
          return (
            <div key={v.id || i} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "8px 10px" }}>
              <div style={isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } : { display: "grid", gridTemplateColumns: "minmax(110px,1.2fr) 130px 90px 90px 100px auto", gap: 8, alignItems: "end" }}>
                <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", fontWeight: 600, alignSelf: "center", gridColumn: isMobile ? "1 / -1" : undefined }}>{vt}</div>
                <div>
                  <span style={fieldLabel}>SKU</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input value={v.sku || ""} placeholder="Enter SKU" onChange={(e) => setVar(i, "sku", e.target.value)} style={{ ...cell, width: "100%", fontFamily: "monospace" }} />
                    {!v.sku && <button type="button" title="Auto generate SKU" onClick={() => setVar(i, "sku", generateSku({ productTitle: cur.title, variantTitle: v.title, existingProductBaseCode: null, existingStoreSkuSet: allSkus }))} style={{ ...iconBtn("var(--ne-warning)"), border: "1px solid var(--ne-border)", borderRadius: 7 }}><Icon name="refresh" size={11} /></button>}
                  </div>
                </div>
                <div><span style={fieldLabel}>Price</span><input inputMode="decimal" value={v.price ?? ""} onChange={(e) => setVar(i, "price", e.target.value.replace(/[^\d.]/g, ""))} style={{ ...cell, width: "100%" }} /></div>
                <div><span style={fieldLabel}>Compare at</span><input inputMode="decimal" value={v.compare_at_price ?? ""} placeholder="0.00" onChange={(e) => setVar(i, "compare_at_price", e.target.value.replace(/[^\d.]/g, ""))} style={{ ...cell, width: "100%" }} /></div>
                <div><span style={fieldLabel}>Stock</span><input inputMode="numeric" value={v.inventory_quantity ?? ""} placeholder="Not tracked" onChange={(e) => setVar(i, "inventory_quantity", e.target.value.replace(/[^\d-]/g, ""))} style={{ ...cell, width: "100%" }} /></div>
                <label title="Keep selling when stock is 0" style={{ fontSize: 10.5, color: "var(--ne-muted)", display: "inline-flex", alignItems: "center", gap: 4, paddingBottom: 6, whiteSpace: "nowrap" }}><input type="checkbox" checked={!!v.continue_selling} onChange={(e) => setVar(i, "continue_selling", e.target.checked)} />Sell at 0</label>
              </div>
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ne-border)", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 10.5, color: "var(--ne-muted-2)", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          Updated: {p.updated_at ? new Date(p.updated_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "—"}
          <span style={pending ? pill("var(--ne-warning-soft)", "var(--ne-warning)") : pill("var(--ne-success-soft)", "var(--ne-success)")}>{p.image_count || 0} pictures{pending ? ` · ${pending} not saved` : ""}</span>
          {p.source === "shopify_copy" && <span style={pill("var(--ne-surface)", "var(--ne-muted)")}>Copied from Shopify</span>}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" onClick={onOpen} title="Edit everything (description, pictures, variants, Neezi)" style={iconBtn("var(--ne-accent)")}><Icon name="edit" size={13} /></button>
          {url && <a href={url} target="_blank" rel="noreferrer" title="View on store" style={iconBtn("var(--ne-muted)")}><Icon name="link" size={13} /></a>}
          <button type="button" onClick={onDelete} title="Delete" style={iconBtn("var(--ne-danger)")}><Icon name="trash" size={13} /></button>
        </div>
      </div>
    </div>
  );
}
