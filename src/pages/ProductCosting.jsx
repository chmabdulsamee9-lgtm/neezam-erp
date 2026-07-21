import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { getCachedProducts, upsertProduct } from "../productsCache";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const PER_PAGE_OPTIONS = [10, 20, 50];
const DEFAULT_COMPONENT_KEYS = ["component_1", "component_2", "component_3"];
const DEFAULT_LABELS = { component_1: "Raw Material", component_2: "Packaging", component_3: "Other" };

const firstVariant = (row) => row?.raw_data?.variants?.[0] || {};

const extraKeysForSku = (componentsForSku) =>
  Object.keys(componentsForSku || {})
    .filter((k) => /^extra_\d+$/.test(k))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));

export default function ProductCosting({ storeId, ordersStore, cfUrl = CF_URL }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const eneezamId = ordersStore?.eneezam_id;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 900);

  // components: { [sku]: { [component_name]: number } } — from product_cost_components
  const [components, setComponents] = useState({});
  // legacyCosts: { [sku]: number } — from product_costs, used as Total fallback when no components exist yet
  const [legacyCosts, setLegacyCosts] = useState({});
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [extraCounts, setExtraCounts] = useState({}); // { [sku]: number } — min visible extra-slots for that row

  // Transient in-progress typing, keyed by `${sku}::${componentKey}` — falls back to saved value once cleared
  const [drafts, setDrafts] = useState({});
  const [skuDrafts, setSkuDrafts] = useState({});
  const [savingSkuIds, setSavingSkuIds] = useState(new Set());

  const [editingLabelKey, setEditingLabelKey] = useState(null);
  const [labelDraft, setLabelDraft] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId && eneezamId) loadCostingData();
  }, [storeId, eneezamId]);

  const loadCostingData = async () => {
    setLoading(true);
    setError("");
    try {
      const cachedProducts = await getCachedProducts(eneezamId);
      setProducts(cachedProducts);

      const [{ data: costRows, error: costErr }, { data: componentRows, error: compErr }, { data: labelRows, error: labelErr }] = await Promise.all([
        supabase.from("product_costs").select("*").eq("store_id", storeId),
        supabase.from("product_cost_components").select("*").eq("store_id", storeId),
        supabase.from("cost_component_labels").select("*").eq("store_id", storeId),
      ]);
      if (costErr) throw costErr;
      if (compErr) throw compErr;
      if (labelErr) throw labelErr;

      const legacyMap = {};
      (costRows || []).forEach((r) => { legacyMap[r.sku] = Number(r.cost_price); });
      setLegacyCosts(legacyMap);

      const compMap = {};
      (componentRows || []).forEach((r) => {
        if (!compMap[r.sku]) compMap[r.sku] = {};
        compMap[r.sku][r.component_name] = Number(r.cost_price);
      });
      setComponents(compMap);

      const labelMap = { ...DEFAULT_LABELS };
      (labelRows || []).forEach((r) => { labelMap[r.component_key] = r.label; });
      setLabels(labelMap);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const authedFetch = async (path, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${cfUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, ...(opts.headers || {}) },
    });
    return res.json();
  };

  const rowTotal = (sku) => {
    if (!sku) return 0;
    const compMap = components[sku];
    if (compMap && Object.keys(compMap).length > 0) {
      return Object.values(compMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
    }
    return legacyCosts[sku] ?? 0;
  };

  const saveComponentValue = async (sku, componentKey, rawValue) => {
    if (!sku) return;
    const trimmed = String(rawValue ?? "").trim();
    const value = trimmed === "" ? 0 : Number(trimmed);
    const currentSkuMap = components[sku] || {};
    const nextSkuMap = { ...currentSkuMap };
    if (!trimmed || value === 0) {
      delete nextSkuMap[componentKey];
    } else {
      nextSkuMap[componentKey] = value;
    }
    setComponents((prev) => ({ ...prev, [sku]: nextSkuMap }));

    const total = Object.values(nextSkuMap).reduce((sum, v) => sum + (Number(v) || 0), 0);

    try {
      if (!trimmed || value === 0) {
        const { error: delErr } = await supabase.from("product_cost_components").delete()
          .eq("store_id", storeId).eq("sku", sku).eq("component_name", componentKey);
        if (delErr) throw delErr;
      } else {
        const { error: upErr } = await supabase.from("product_cost_components").upsert({
          store_id: storeId, sku, component_name: componentKey, cost_price: value, updated_at: new Date().toISOString(),
        }, { onConflict: "store_id,sku,component_name" });
        if (upErr) throw upErr;
      }
      const { error: totalErr } = await supabase.from("product_costs").upsert({
        store_id: storeId, sku, cost_price: total, updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,sku" });
      if (totalErr) throw totalErr;
      setLegacyCosts((prev) => ({ ...prev, [sku]: total }));
    } catch (err) {
      setError(err.message);
    }
  };

  const draftKey = (sku, componentKey) => `${sku}::${componentKey}`;

  const getInputValue = (sku, componentKey) => {
    const dk = draftKey(sku, componentKey);
    if (Object.prototype.hasOwnProperty.call(drafts, dk)) return drafts[dk];
    const v = components[sku]?.[componentKey];
    return v != null ? String(v) : "";
  };

  const handleDraftChange = (sku, componentKey, val) => {
    setDrafts((prev) => ({ ...prev, [draftKey(sku, componentKey)]: val }));
  };

  const commitDraft = (sku, componentKey) => {
    const dk = draftKey(sku, componentKey);
    const val = drafts[dk];
    setDrafts((prev) => {
      const n = { ...prev };
      delete n[dk];
      return n;
    });
    if (val === undefined) return;
    saveComponentValue(sku, componentKey, val);
  };

  const handleComponentPaste = (e, rowIndexOnPage, colIndex) => {
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    e.preventDefault();
    const rows = text.replace(/\r/g, "").split("\n").filter((r) => r !== "");
    rows.forEach((rowText, rOffset) => {
      const cells = rowText.split("\t");
      cells.forEach((cellText, cOffset) => {
        const targetRow = rowIndexOnPage + rOffset;
        const targetCol = colIndex + cOffset;
        if (targetCol > 2 || targetRow >= pagedProducts.length) return;
        const targetSku = firstVariant(pagedProducts[targetRow]).sku;
        if (!targetSku) return;
        const componentKey = DEFAULT_COMPONENT_KEYS[targetCol];
        const dk = draftKey(targetSku, componentKey);
        setDrafts((prev) => {
          const n = { ...prev };
          delete n[dk];
          return n;
        });
        saveComponentValue(targetSku, componentKey, cellText.trim());
      });
    });
  };

  const startMoreForSku = (sku) => {
    setExtraCounts((prev) => ({ ...prev, [sku]: Math.max(prev[sku] || 0, 1) }));
  };

  const addAnotherExtra = (sku) => {
    const existing = extraKeysForSku(components[sku]).length;
    setExtraCounts((prev) => ({ ...prev, [sku]: Math.max(prev[sku] || 0, existing) + 1 }));
  };

  const saveLabel = async (componentKey, newLabel) => {
    const trimmed = newLabel.trim();
    setEditingLabelKey(null);
    if (!trimmed || trimmed === labels[componentKey]) return;
    setLabels((prev) => ({ ...prev, [componentKey]: trimmed }));
    try {
      const { error: labelErr } = await supabase.from("cost_component_labels").upsert({
        store_id: storeId, component_key: componentKey, label: trimmed, updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,component_key" });
      if (labelErr) throw labelErr;
    } catch (err) {
      setError(err.message);
    }
  };

  const getSkuInputValue = (product) => skuDrafts[product.shopify_product_id] ?? "";

  const saveSku = async (product) => {
    const draft = (skuDrafts[product.shopify_product_id] || "").trim();
    if (!draft) return;
    setSavingSkuIds((prev) => new Set(prev).add(product.shopify_product_id));
    setError("");
    try {
      const v = firstVariant(product);
      const data = await authedFetch("/shopify-product-update", {
        method: "POST",
        body: JSON.stringify({
          store_id: storeId,
          product_id: product.shopify_product_id,
          updates: { variants: [{ id: v.id, sku: draft }] },
        }),
      });
      if (data.error) {
        setError(data.error);
      } else {
        const row = { store_id: storeId, shopify_product_id: String(data.product.id), raw_data: data.product, synced_at: new Date().toISOString() };
        setProducts((prev) => prev.map((p) => (p.shopify_product_id === row.shopify_product_id ? row : p)));
        await upsertProduct(eneezamId, row);
        setSkuDrafts((prev) => {
          const n = { ...prev };
          delete n[product.shopify_product_id];
          return n;
        });
      }
    } catch (err) {
      setError(err.message);
    }
    setSavingSkuIds((prev) => {
      const n = new Set(prev);
      n.delete(product.shopify_product_id);
      return n;
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const title = (p.raw_data?.title || "").toLowerCase();
      const sku = (firstVariant(p).sku || "").toLowerCase();
      return !q || title.includes(q) || sku.includes(q);
    });
  }, [products, search]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pagedProducts = filtered.slice((page - 1) * perPage, page * perPage);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px" };
  const cellInputStyle = {
    width: 78, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11.5, boxSizing: "border-box",
  };

  if (!ordersStore?.shopify_url) {
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="calculator" size={17} /> {t("costing.title")}</h1>
        <div style={{ ...cardStyle, marginTop: "1.5rem", textAlign: "center", color: "var(--ne-muted)" }}>
          {t("costing.connectStoreFirst")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="calculator" size={17} /> {t("costing.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.store_name} — {filtered.length}</p>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="error" size={12} /> {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Icon name="search" size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ne-muted-2)" }} />
          <input type="text" placeholder={t("costing.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 27px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        </div>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} {t("costing.perPageSuffix")}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>{t("costing.loading")}</div>
      ) : products.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>
          {t("costing.cacheEmpty")}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>
          {t("costing.noProductsFiltered")}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px" }}></th>
                <th style={{ padding: "6px 8px" }}></th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t("costing.table.title")}</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t("costing.table.sku")}</th>
                {DEFAULT_COMPONENT_KEYS.map((key) => (
                  <th key={key} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {editingLabelKey === key ? (
                      <input autoFocus value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
                        onBlur={() => saveLabel(key, labelDraft)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                        style={{ width: 90, padding: "3px 5px", borderRadius: 5, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 10.5, textTransform: "none" }} />
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {labels[key]}
                        <Icon name="edit" size={9} style={{ cursor: "pointer", flexShrink: 0 }}
                          onClick={() => { setEditingLabelKey(key); setLabelDraft(labels[key]); }} />
                      </span>
                    )}
                  </th>
                ))}
                <th style={{ padding: "6px 8px" }}></th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t("costing.table.total")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map((p, rowIndex) => {
                const v = firstVariant(p);
                const sku = v.sku || "";
                const image = p.raw_data?.image?.src || p.raw_data?.images?.[0]?.src;
                const skuComponents = sku ? components[sku] : null;
                const extraKeys = extraKeysForSku(skuComponents);
                const slotCount = Math.max(extraCounts[sku] || 0, extraKeys.length);
                const isSavingSku = savingSkuIds.has(p.shopify_product_id);
                return (
                  <Fragment key={p.shopify_product_id}>
                    <tr style={{ borderBottom: slotCount > 0 ? "none" : "1px solid var(--ne-border)" }}>
                      <td style={{ padding: "7px 8px" }}>
                        <input type="checkbox" checked={selectedIds.has(p.shopify_product_id)} onChange={() => toggleSelect(p.shopify_product_id)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "7px 8px" }}>
                        {image ? (
                          <img src={image} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon name="package" size={13} style={{ color: "var(--ne-muted-2)" }} />
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.raw_data?.title || "—"}</td>
                      <td style={{ padding: "7px 8px" }}>
                        {sku ? (
                          <span style={{ color: "var(--ne-muted)", fontFamily: "monospace" }}>{sku}</span>
                        ) : (
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input type="text" placeholder={t("costing.skuPlaceholder")} value={getSkuInputValue(p)}
                              onChange={(e) => setSkuDrafts((prev) => ({ ...prev, [p.shopify_product_id]: e.target.value }))}
                              style={{ width: 90, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11 }} />
                            <button onClick={() => saveSku(p)} disabled={isSavingSku || !getSkuInputValue(p).trim()}
                              style={{ padding: "5px 9px", borderRadius: 7, border: "none", background: isSavingSku ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 10.5, fontWeight: 700, cursor: isSavingSku ? "default" : "pointer", whiteSpace: "nowrap" }}>
                              {isSavingSku ? t("costing.savingSku") : t("costing.saveSku")}
                            </button>
                          </div>
                        )}
                      </td>
                      {DEFAULT_COMPONENT_KEYS.map((key, colIndex) => (
                        <td key={key} style={{ padding: "7px 8px" }}>
                          <input type="number" step="0.01" disabled={!sku} value={getInputValue(sku, key)}
                            onChange={(e) => handleDraftChange(sku, key, e.target.value)}
                            onBlur={() => commitDraft(sku, key)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            onPaste={(e) => handleComponentPaste(e, rowIndex, colIndex)}
                            style={{ ...cellInputStyle, opacity: sku ? 1 : 0.5 }} />
                        </td>
                      ))}
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                        {sku && slotCount === 0 && (
                          <button onClick={() => startMoreForSku(sku)}
                            style={{ background: "transparent", border: "1px solid var(--ne-border)", borderRadius: 7, color: "var(--ne-muted)", cursor: "pointer", fontSize: 10.5, padding: "5px 8px" }}>
                            {t("costing.more")}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 700 }}>
                        Rs. {rowTotal(sku).toLocaleString()}
                      </td>
                    </tr>
                    {slotCount > 0 && (
                      <tr style={{ borderBottom: "1px solid var(--ne-border)" }}>
                        <td></td>
                        <td colSpan={7} style={{ padding: "4px 8px 10px" }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: "var(--ne-surface)", borderRadius: 9, padding: "8px 10px" }}>
                            {[...Array(slotCount)].map((_, idx) => {
                              const n = idx + 1;
                              const key = `extra_${n}`;
                              return (
                                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span style={{ fontSize: 9.5, color: "var(--ne-muted-2)", textTransform: "uppercase", fontWeight: 600 }}>{t("costing.extraPrefix")} {n}</span>
                                  <input type="number" step="0.01" value={getInputValue(sku, key)}
                                    onChange={(e) => handleDraftChange(sku, key, e.target.value)}
                                    onBlur={() => commitDraft(sku, key)}
                                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                                    style={cellInputStyle} />
                                </div>
                              );
                            })}
                            <button onClick={() => addAnotherExtra(sku)}
                              style={{ background: "transparent", border: "1px dashed var(--ne-border)", borderRadius: 7, color: "var(--ne-accent)", cursor: "pointer", fontSize: 10.5, padding: "5px 8px", alignSelf: "flex-end" }}>
                              {t("costing.addAnother")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
            {t("costing.showing")} {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} {t("costing.of")} {filtered.length}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>‹</button>
            {[...Array(Math.min(5, totalPages))].map((_, idx) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + idx;
              return <button key={p} onClick={() => setPage(p)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === p ? "var(--ne-grad)" : "var(--ne-surface-2)", color: page === p ? "#fff" : "var(--ne-muted)", fontSize: 11, cursor: "pointer", fontWeight: page === p ? 700 : 400 }}>{p}</button>;
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
