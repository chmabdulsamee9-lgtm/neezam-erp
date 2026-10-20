import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { ProductsSkeleton } from "../components/Skeletons";
import { useLanguage, useTranslation } from "../i18n";
import { getCachedProducts, saveProductsBulk, upsertProduct, getProductsMeta, setProductsMeta } from "../productsCache";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const PAGE_SIZE = 500;
const PER_PAGE_OPTIONS = [20, 50, 100];
const BULK_FIELDS = ["vendor", "product_type", "tags", "status", "collection"];
const CREATE_NEW_COLLECTION = "__create_new__";

// Costing — ported from ProductCosting.jsx (merged into the unified card)
const DEFAULT_COMPONENT_KEYS = ["component_1", "component_2", "component_3"];
const DEFAULT_COMPONENT_LABELS = { component_1: "Raw Material", component_2: "Packaging", component_3: "Other" };
const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const extraKeysForSku = (componentsForSku) => {
  const keys = Object.keys(componentsForSku || {}).filter((k) => !DEFAULT_COMPONENT_KEYS.includes(k));
  const numbered = keys.filter((k) => /^extra_\d+$/.test(k)).sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));
  const named = keys.filter((k) => !/^extra_\d+$/.test(k)).sort();
  return [...numbered, ...named];
};
const humanizeKey = (key, extraLabel) => {
  const m = /^extra_(\d+)$/.exec(key);
  if (m) return `${extraLabel} ${m[1]}`;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const firstVariant = (row) => row?.raw_data?.variants?.[0] || {};

const draftKey = (productId, fieldKey) => `${productId}::${fieldKey}`;

// Reusable inline-editable cell — every plain text/number cell (vendor, product_type,
// sku, price, compare_at_price, and each expanded variant's own copies) goes through
// this so drafts/commit-on-blur/Enter-to-save stay consistent everywhere.
// Defined at module scope (NOT inside ProductsManagement's body) so its component
// identity is stable across re-renders — defining it inside the parent's render body
// would give React a brand-new component type every keystroke, forcing it to unmount
// and remount the underlying <input> (and its focus) on every single character typed.
function EditableCell({ drafts, setFieldDraft, clearFieldDraft, productId, fieldKey, initialValue, onCommit, type = "text", disabled, style, placeholder }) {
  const dk = draftKey(productId, fieldKey);
  const value = Object.prototype.hasOwnProperty.call(drafts, dk) ? drafts[dk] : (initialValue != null ? String(initialValue) : "");
  return (
    <input type={type} step={type === "number" ? "0.01" : undefined} disabled={disabled} value={value} placeholder={placeholder}
      onChange={(e) => setFieldDraft(productId, fieldKey, e.target.value)}
      onBlur={() => {
        const dv = drafts[dk];
        clearFieldDraft(productId, fieldKey);
        if (dv === undefined) return;
        onCommit(dv);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
      style={style} />
  );
}

async function fetchAllProductsFromSupabase(storeId) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products_cache")
      .select("*")
      .eq("store_id", storeId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

async function fetchProductsDelta(storeId, since) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products_cache")
      .select("*")
      .eq("store_id", storeId)
      .gt("synced_at", since)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

export default function ProductsManagement({ storeId, ordersStore, cfUrl = CF_URL }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const eneezamId = ordersStore?.eneezam_id;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ title: "", vendor: "", product_type: "", tags: "", price: "", compare_at_price: "", sku: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", vendor: "", product_type: "", tags: "", status: "active", price: "", compare_at_price: "", sku: "", body_html: "", images: [] });
  const [newImageUrl, setNewImageUrl] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkField, setBulkField] = useState("vendor");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkResults, setBulkResults] = useState(null);
  const [newBulkCollectionTitle, setNewBulkCollectionTitle] = useState("");
  const [bulkCollectionCreating, setBulkCollectionCreating] = useState(false);

  // ---- Collections (Phase 1 endpoints) ----
  const [storeCollections, setStoreCollections] = useState([]); // [{shopify_collection_id, title, ...}]
  const [productCollections, setProductCollections] = useState({}); // { [shopify_product_id]: [shopify_collection_id,...] }

  // ---- Inline-edit / sync-status plumbing ----
  const [drafts, setDrafts] = useState({}); // `${productId}::${fieldKey}` -> in-progress string
  const [syncStatus, setSyncStatus] = useState({}); // { [productId]: 'pending' | 'synced' }
  const syncTimeoutsRef = useRef({});
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({}); // { [shopify_product_id]: { fields: {title?, vendor?, product_type?}, variants: { [variantId]: {sku?, price?, compare_at_price?} } } }
  const [archivedVariants, setArchivedVariants] = useState({}); // { [shopify_product_id]: [{id, variant_data, archived_at}, ...] }

  // ---- Inventory (merged from InventoryManagement.jsx) ----
  const [inventoryLevels, setInventoryLevels] = useState([]); // [{id, product_id (products_cache.id), variant_sku, quantity, location_name}]
  const [stockDrafts, setStockDrafts] = useState({}); // sku -> draft qty string
  const [savingStockSku, setSavingStockSku] = useState(null);

  // ---- Costing (merged from ProductCosting.jsx) ----
  const [costComponents, setCostComponents] = useState({}); // { [sku]: { [component_name]: number } }
  const [costRates, setCostRates] = useState({}); // { [sku]: { id, cost_price, return_value, supplier_id, effective_from } } — current effective row
  const [costLabels, setCostLabels] = useState(DEFAULT_COMPONENT_LABELS);
  const [suppliers, setSuppliers] = useState([]);
  const [expandedCostSku, setExpandedCostSku] = useState(null); // which variant's cost breakdown is expanded
  const [costExtraCounts, setCostExtraCounts] = useState({}); // { [sku]: n } — min visible numbered extra-slots

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId && eneezamId) loadProducts();
  }, [storeId, eneezamId]);

  useEffect(() => {
    if (storeId) loadCollections();
  }, [storeId]);

  useEffect(() => {
    if (storeId) loadArchivedVariants();
  }, [storeId]);

  useEffect(() => {
    if (storeId) loadInventoryAndCosting();
  }, [storeId]);

  useEffect(() => {
    const timeouts = syncTimeoutsRef.current;
    return () => {
      Object.values(timeouts).forEach((id) => clearTimeout(id));
    };
  }, []);

  // BookedOrders.jsx/Orders.jsx wala established pattern: cache mein data ho to turant
  // dikhao (spinner ke bina), phir background mein delta-sync karo (synced_at se) —
  // yeh sirf products_cache (Supabase) refresh karta hai, "Sync to Shopify" button
  // alag/explicit action hai jo asal Shopify API se naye products khींchta hai.
  const loadProducts = async () => {
    setError("");
    try {
      const cached = await getCachedProducts(eneezamId);
      if (cached.length > 0) {
        setProducts(cached);
        setLoading(false);
        const metaKey = `productsLastSyncedAt-${eneezamId}`;
        const lastSyncedAt = (await getProductsMeta(metaKey)) || "2000-01-01T00:00:00Z";
        const loadStartTime = new Date().toISOString();
        fetchProductsDelta(storeId, lastSyncedAt)
          .then(async (deltaRows) => {
            if (deltaRows.length > 0) {
              await saveProductsBulk(eneezamId, deltaRows);
              setProducts((prev) => {
                const map = {};
                prev.forEach((p) => { map[p.shopify_product_id] = p; });
                deltaRows.forEach((p) => { map[p.shopify_product_id] = p; });
                return Object.values(map);
              });
            }
            await setProductsMeta(metaKey, loadStartTime);
          })
          .catch((err) => console.log("Products delta sync error:", err.message));
        return;
      }

      setLoading(true);
      const loadStartTime = new Date().toISOString();
      const all = await fetchAllProductsFromSupabase(storeId);
      setProducts(all);
      await saveProductsBulk(eneezamId, all);
      await setProductsMeta(`productsLastSyncedAt-${eneezamId}`, loadStartTime);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadCollections = async () => {
    try {
      const [{ data: collRows }, { data: assocRows }] = await Promise.all([
        supabase.from("store_collections").select("*").eq("store_id", storeId),
        supabase.from("product_collections").select("*").eq("store_id", storeId),
      ]);
      setStoreCollections(collRows || []);
      const map = {};
      (assocRows || []).forEach((r) => {
        if (!map[r.shopify_product_id]) map[r.shopify_product_id] = [];
        map[r.shopify_product_id].push(r.shopify_collection_id);
      });
      setProductCollections(map);
    } catch (err) {
      console.log("Collections load error:", err.message);
    }
  };

  const loadArchivedVariants = async () => {
    try {
      const { data, error } = await supabase.from("product_variant_archive").select("*").eq("store_id", storeId).is("restored_at", null);
      if (error) throw error;
      const map = {};
      (data || []).forEach((row) => {
        if (!map[row.shopify_product_id]) map[row.shopify_product_id] = [];
        map[row.shopify_product_id].push(row);
      });
      setArchivedVariants(map);
    } catch (err) {
      console.log("Archived variants load error:", err.message);
    }
  };

  // Inventory + Costing — merged in from InventoryManagement.jsx / ProductCosting.jsx.
  // Both join to products purely by SKU text (inventory_levels.variant_sku, product_costs.sku) —
  // there's no real foreign key to a Shopify variant_id, so matching happens at render time.
  const loadInventoryAndCosting = async () => {
    try {
      const [
        { data: invRows, error: invErr },
        { data: costRows, error: costErr },
        { data: compRows, error: compErr },
        { data: labelRows, error: labelErr },
        { data: supplierRows, error: supplierErr },
      ] = await Promise.all([
        supabase.from("inventory_levels").select("*").eq("store_id", storeId),
        supabase.from("product_costs").select("*").eq("store_id", storeId),
        supabase.from("product_cost_components").select("*").eq("store_id", storeId),
        supabase.from("cost_component_labels").select("*").eq("store_id", storeId),
        supabase.from("suppliers").select("id, name").eq("store_id", storeId).order("name"),
      ]);
      if (invErr) throw invErr;
      if (costErr) throw costErr;
      if (compErr) throw compErr;
      if (labelErr) throw labelErr;
      if (supplierErr) throw supplierErr;

      setInventoryLevels(invRows || []);

      // product_costs is versioned (multiple rows per SKU, one per effective_from) — pick each
      // SKU's most recent row whose effective_from <= today, same rule as ProductCosting.jsx.
      const todayStr = toDateStr(new Date());
      const sorted = [...(costRows || [])].sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
      const rateMap = {};
      sorted.forEach((r) => {
        const ef = r.effective_from || "0000-01-01";
        if (ef > todayStr) return;
        if (rateMap[r.sku]) return;
        rateMap[r.sku] = { id: r.id, cost_price: Number(r.cost_price) || 0, return_value: r.return_value != null ? Number(r.return_value) : null, supplier_id: r.supplier_id || null, effective_from: ef };
      });
      setCostRates(rateMap);

      const compMap = {};
      (compRows || []).forEach((r) => {
        if (!compMap[r.sku]) compMap[r.sku] = {};
        compMap[r.sku][r.component_name] = Number(r.cost_price);
      });
      setCostComponents(compMap);

      const labelMap = { ...DEFAULT_COMPONENT_LABELS };
      (labelRows || []).forEach((r) => { labelMap[r.component_key] = r.label; });
      setCostLabels(labelMap);

      setSuppliers(supplierRows || []);
    } catch (err) {
      console.log("Inventory/costing load error:", err.message);
    }
  };

  // sku -> [{id, quantity, location_name}] — a SKU can have rows at multiple locations
  const inventoryRowsForSku = (sku) => (sku ? inventoryLevels.filter((r) => r.variant_sku === sku) : []);
  const stockTotalForSku = (sku) => inventoryRowsForSku(sku).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

  // sku -> total cost: sum of components if any exist, else fall back to the legacy single cost_price
  const costTotalForSku = (sku) => {
    if (!sku) return 0;
    const compMap = costComponents[sku];
    if (compMap && Object.keys(compMap).length > 0) {
      return Object.values(compMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
    }
    return costRates[sku]?.cost_price ?? 0;
  };

  const getCostInputValue = (sku, key) => {
    const dk = draftKey(sku, `cost-${key}`);
    if (Object.prototype.hasOwnProperty.call(drafts, dk)) return drafts[dk];
    return costComponents[sku]?.[key] != null ? String(costComponents[sku][key]) : "";
  };

  // Writes one component's value, recomputes the total, and upserts today's product_costs row
  // (preserving return_value/supplier_id) — same pattern as ProductCosting.jsx's applyCostVersion,
  // simplified to always apply immediately (no "apply from a future date" scheduling here).
  const saveCostComponent = async (sku, key, rawValue) => {
    if (!sku) return;
    const trimmed = String(rawValue ?? "").trim();
    const value = trimmed === "" ? 0 : Number(trimmed);
    const currentMap = costComponents[sku] || {};
    const nextMap = { ...currentMap };
    try {
      if (!trimmed || value === 0) {
        delete nextMap[key];
        await supabase.from("product_cost_components").delete().eq("store_id", storeId).eq("sku", sku).eq("component_name", key);
      } else {
        nextMap[key] = value;
        await supabase.from("product_cost_components").upsert(
          { store_id: storeId, sku, component_name: key, cost_price: value, updated_at: new Date().toISOString() },
          { onConflict: "store_id,sku,component_name" }
        );
      }
      const total = Object.values(nextMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
      await upsertCostRate(sku, { cost_price: total });
      setCostComponents((prev) => ({ ...prev, [sku]: nextMap }));
    } catch (err) {
      setError(err.message);
    }
  };

  // Shared helper — updates (or creates) today's product_costs row for a SKU, carrying forward
  // whichever fields aren't explicitly overridden.
  const upsertCostRate = async (sku, overrides) => {
    const existing = costRates[sku];
    const todayStr = toDateStr(new Date());
    const payload = {
      cost_price: overrides.cost_price ?? existing?.cost_price ?? 0,
      return_value: overrides.return_value !== undefined ? overrides.return_value : (existing?.return_value ?? null),
      supplier_id: overrides.supplier_id !== undefined ? overrides.supplier_id : (existing?.supplier_id ?? null),
      updated_at: new Date().toISOString(),
    };
    let saved;
    if (existing && existing.effective_from === todayStr) {
      const { data, error } = await supabase.from("product_costs").update(payload).eq("id", existing.id).select().single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase.from("product_costs")
        .upsert({ store_id: storeId, sku, effective_from: todayStr, ...payload }, { onConflict: "store_id,sku,effective_from" })
        .select().single();
      if (error) throw error;
      saved = data;
    }
    setCostRates((prev) => ({ ...prev, [sku]: { id: saved.id, cost_price: Number(saved.cost_price) || 0, return_value: saved.return_value != null ? Number(saved.return_value) : null, supplier_id: saved.supplier_id || null, effective_from: saved.effective_from } }));
  };

  const saveReturnValue = async (sku, rawValue) => {
    if (!sku) return;
    const trimmed = String(rawValue ?? "").trim();
    const value = trimmed === "" ? null : Number(trimmed);
    try {
      await upsertCostRate(sku, { return_value: value });
    } catch (err) {
      setError(err.message);
    }
  };

  const saveSupplierForSku = async (sku, supplierId) => {
    if (!sku) return;
    try {
      await upsertCostRate(sku, { supplier_id: supplierId || null });
    } catch (err) {
      setError(err.message);
    }
  };

  const addAnotherCostExtra = (sku) => {
    setCostExtraCounts((prev) => ({ ...prev, [sku]: (prev[sku] || 0) + 1 }));
  };

  // Stock — if a SKU has exactly 0 or 1 inventory_levels row, inline-edit writes straight to it
  // (creating one if none exists, product_id = this product's products_cache.id — the products_cache
  // table's OWN primary key, not shopify_product_id, matching InventoryManagement.jsx's convention).
  // If a SKU has rows at 2+ locations, the total isn't directly editable here (ambiguous which
  // location to adjust) — it's shown as a read-only total with a per-location breakdown tooltip.
  const saveStock = async (product, sku, rawValue) => {
    if (!sku) return;
    const trimmed = String(rawValue ?? "").trim();
    const value = trimmed === "" ? 0 : Number(trimmed) || 0;
    setSavingStockSku(sku);
    try {
      const rows = inventoryRowsForSku(sku);
      if (rows.length === 1) {
        const { error } = await supabase.from("inventory_levels").update({ quantity: value, updated_at: new Date().toISOString() }).eq("id", rows[0].id);
        if (error) throw error;
        setInventoryLevels((prev) => prev.map((r) => (r.id === rows[0].id ? { ...r, quantity: value } : r)));
      } else {
        const { data, error } = await supabase.from("inventory_levels").insert({
          store_id: storeId, product_id: product.id, variant_sku: sku, quantity: value, location_name: null,
        }).select().single();
        if (error) throw error;
        setInventoryLevels((prev) => [...prev, data]);
      }
    } catch (err) {
      setError(err.message);
    }
    setSavingStockSku(null);
  };

  const collectionTitlesForProduct = (productId) => {
    const ids = productCollections[productId] || [];
    return ids.map((id) => storeCollections.find((c) => c.shopify_collection_id === id)?.title).filter(Boolean);
  };

  const authedFetch = async (path, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${cfUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, ...(opts.headers || {}) },
    });
    return res.json();
  };

  // ---------- Generic per-product Shopify save (used by every inline cell, the
  // status toggle, and the edit modal) — drives the sync-pending/synced badge. ----------
  const saveProductUpdate = async (product, updates) => {
    const productId = product.shopify_product_id;
    if (syncTimeoutsRef.current[productId]) {
      clearTimeout(syncTimeoutsRef.current[productId]);
      delete syncTimeoutsRef.current[productId];
    }
    setSyncStatus((prev) => ({ ...prev, [productId]: "pending" }));
    try {
      const data = await authedFetch("/shopify-product-update", {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, product_id: productId, updates }),
      });
      if (data.error) {
        setError(data.error);
        setSyncStatus((prev) => { const n = { ...prev }; delete n[productId]; return n; });
        return { success: false };
      }
      const row = { store_id: storeId, shopify_product_id: String(data.product.id), raw_data: data.product, synced_at: new Date().toISOString() };
      setProducts((prev) => prev.map((p) => (p.shopify_product_id === row.shopify_product_id ? row : p)));
      await upsertProduct(eneezamId, row);
      setSyncStatus((prev) => ({ ...prev, [productId]: "synced" }));
      syncTimeoutsRef.current[productId] = setTimeout(() => {
        setSyncStatus((prev) => { const n = { ...prev }; delete n[productId]; return n; });
        delete syncTimeoutsRef.current[productId];
      }, 2500);
      return { success: true, product: data.product };
    } catch (err) {
      setError(err.message);
      setSyncStatus((prev) => { const n = { ...prev }; delete n[productId]; return n; });
      return { success: false };
    }
  };

  const setFieldDraft = (productId, fieldKey, val) => setDrafts((prev) => ({ ...prev, [draftKey(productId, fieldKey)]: val }));
  const clearFieldDraft = (productId, fieldKey) => setDrafts((prev) => {
    const dk = draftKey(productId, fieldKey);
    if (!(dk in prev)) return prev;
    const n = { ...prev };
    delete n[dk];
    return n;
  });

  const commitProductField = (product, field, rawValue) => {
    const current = product.raw_data?.[field] || "";
    const productId = product.shopify_product_id;
    setPendingChanges((prev) => {
      const existing = prev[productId] || { fields: {}, variants: {} };
      const fields = { ...existing.fields };
      if (rawValue === current) delete fields[field]; else fields[field] = rawValue;
      const stillHasVariants = Object.keys(existing.variants).length > 0;
      if (Object.keys(fields).length === 0 && !stillHasVariants) {
        const n = { ...prev }; delete n[productId]; return n;
      }
      return { ...prev, [productId]: { ...existing, fields } };
    });
  };

  const commitVariantField = (product, variant, field, rawValue) => {
    const current = variant[field] != null ? String(variant[field]) : "";
    const productId = product.shopify_product_id;
    setPendingChanges((prev) => {
      const existing = prev[productId] || { fields: {}, variants: {} };
      const variants = { ...existing.variants };
      const vExisting = { ...(variants[variant.id] || {}) };
      if (String(rawValue ?? "") === current) delete vExisting[field]; else vExisting[field] = rawValue;
      if (Object.keys(vExisting).length === 0) delete variants[variant.id]; else variants[variant.id] = vExisting;
      const stillHasFields = Object.keys(existing.fields).length > 0;
      if (Object.keys(variants).length === 0 && !stillHasFields) {
        const n = { ...prev }; delete n[productId]; return n;
      }
      return { ...prev, [productId]: { ...existing, variants } };
    });
  };

  const pushProductChanges = async (product) => {
    const productId = product.shopify_product_id;
    const pending = pendingChanges[productId];
    if (!pending) return;
    const updates = { ...pending.fields };
    if (Object.keys(pending.variants).length > 0) {
      updates.variants = Object.entries(pending.variants).map(([variantId, fields]) => ({ id: variantId, ...fields }));
    }
    const result = await saveProductUpdate(product, updates);
    if (result.success) {
      setPendingChanges((prev) => { const n = { ...prev }; delete n[productId]; return n; });
    }
  };

  const toggleStatus = (product) => {
    const current = product.raw_data?.status || "active";
    const next = current === "active" ? "draft" : "active";
    saveProductUpdate(product, { status: next });
  };

  const archiveVariant = async (product, variant) => {
    const productId = product.shopify_product_id;
    setSyncStatus((prev) => ({ ...prev, [productId]: "pending" }));
    try {
      const data = await authedFetch("/shopify-variant-archive", {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, product_id: productId, variant }),
      });
      if (data.error) {
        setError(data.error);
        setSyncStatus((prev) => { const n = { ...prev }; delete n[productId]; return n; });
        return;
      }
      const all = await fetchAllProductsFromSupabase(storeId);
      setProducts(all);
      await saveProductsBulk(eneezamId, all);
      await loadArchivedVariants();
    } catch (err) {
      setError(err.message);
    }
    setSyncStatus((prev) => { const n = { ...prev }; delete n[productId]; return n; });
  };

  const restoreVariant = async (product, archiveRow) => {
    const productId = product.shopify_product_id;
    setSyncStatus((prev) => ({ ...prev, [productId]: "pending" }));
    try {
      const data = await authedFetch("/shopify-variant-restore", {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, product_id: productId, archive_id: archiveRow.id }),
      });
      if (data.error) {
        setError(data.error);
        setSyncStatus((prev) => { const n = { ...prev }; delete n[productId]; return n; });
        return;
      }
      const all = await fetchAllProductsFromSupabase(storeId);
      setProducts(all);
      await saveProductsBulk(eneezamId, all);
      await loadArchivedVariants();
    } catch (err) {
      setError(err.message);
    }
    setSyncStatus((prev) => { const n = { ...prev }; delete n[productId]; return n; });
  };

  const resetNewProductForm = () => setNewProductForm({ title: "", vendor: "", product_type: "", tags: "", price: "", compare_at_price: "", sku: "" });

  const createNewProduct = async (e) => {
    e.preventDefault();
    setCreateError("");
    if (!newProductForm.title.trim()) { setCreateError(t("products.titleRequired")); return; }
    setCreating(true);
    try {
      const productPayload = {
        title: newProductForm.title.trim(),
        vendor: newProductForm.vendor.trim() || undefined,
        product_type: newProductForm.product_type.trim() || undefined,
        tags: newProductForm.tags.trim() || undefined,
        variants: [{ price: newProductForm.price || "0", compare_at_price: newProductForm.compare_at_price || undefined, sku: newProductForm.sku.trim() || undefined }],
      };
      const data = await authedFetch("/shopify-product-create", { method: "POST", body: JSON.stringify({ store_id: storeId, product: productPayload }) });
      if (data.error) { setCreateError(data.error); setCreating(false); return; }
      const row = { store_id: storeId, shopify_product_id: String(data.product.id), raw_data: data.product, synced_at: new Date().toISOString() };
      setProducts((prev) => [row, ...prev]);
      await upsertProduct(eneezamId, row);
      setShowNewProductModal(false);
      resetNewProductForm();
    } catch (err) {
      setCreateError(err.message);
    }
    setCreating(false);
  };

  const openEditProduct = (row) => {
    const v = firstVariant(row);
    setEditingProduct(row);
    setEditForm({
      title: row.raw_data?.title || "",
      vendor: row.raw_data?.vendor || "",
      product_type: row.raw_data?.product_type || "",
      tags: row.raw_data?.tags || "",
      status: row.raw_data?.status || "active",
      price: v.price || "",
      compare_at_price: v.compare_at_price || "",
      sku: v.sku || "",
      body_html: row.raw_data?.body_html || "",
      images: (row.raw_data?.images || []).map((img) => ({ id: img.id, src: img.src })),
    });
    setNewImageUrl("");
    setEditError("");
  };

  const addEditImage = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    setEditForm((f) => ({ ...f, images: [...f.images, { src: url }] }));
    setNewImageUrl("");
  };

  const removeEditImage = (idx) => setEditForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const saveEditProduct = async (e) => {
    e.preventDefault();
    setEditError("");
    setSavingEdit(true);
    try {
      const v = firstVariant(editingProduct);
      const updates = {
        title: editForm.title.trim(),
        vendor: editForm.vendor.trim(),
        product_type: editForm.product_type.trim(),
        tags: editForm.tags.trim(),
        status: editForm.status,
        body_html: editForm.body_html,
        images: editForm.images.map((img) => (img.id ? { id: img.id } : { src: img.src })),
        variants: [{ id: v.id, price: editForm.price, compare_at_price: editForm.compare_at_price, sku: editForm.sku }],
      };
      const data = await authedFetch("/shopify-product-update", {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, product_id: editingProduct.shopify_product_id, updates }),
      });
      if (data.error) { setEditError(data.error); setSavingEdit(false); return; }
      const row = { store_id: storeId, shopify_product_id: String(data.product.id), raw_data: data.product, synced_at: new Date().toISOString() };
      setProducts((prev) => prev.map((p) => (p.shopify_product_id === row.shopify_product_id ? row : p)));
      await upsertProduct(eneezamId, row);
      setEditingProduct(null);
    } catch (err) {
      setEditError(err.message);
    }
    setSavingEdit(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const createBulkCollection = async () => {
    const title = newBulkCollectionTitle.trim();
    if (!title) return;
    setBulkCollectionCreating(true);
    try {
      const data = await authedFetch("/shopify-collection-create", { method: "POST", body: JSON.stringify({ store_id: storeId, title }) });
      if (data.error) {
        setError(data.error);
      } else {
        const newRow = { shopify_collection_id: String(data.collection.id), title: data.collection.title, handle: data.collection.handle, collection_type: "custom" };
        setStoreCollections((prev) => [...prev, newRow]);
        setBulkValue(newRow.shopify_collection_id);
        setNewBulkCollectionTitle("");
      }
    } catch (err) {
      setError(err.message);
    }
    setBulkCollectionCreating(false);
  };

  const applyBulkEdit = async () => {
    setBulkApplying(true);
    setBulkProgress(0);
    const targets = products.filter((p) => selectedIds.has(p.shopify_product_id));
    const results = [];
    for (const p of targets) {
      try {
        if (bulkField === "collection") {
          const data = await authedFetch("/shopify-product-collections-update", {
            method: "POST",
            body: JSON.stringify({ store_id: storeId, product_id: p.shopify_product_id, add_collection_ids: [bulkValue], remove_collection_ids: [] }),
          });
          if (data.error) {
            results.push({ id: p.shopify_product_id, name: p.raw_data?.title, success: false, error: data.error });
          } else {
            setProductCollections((prev) => {
              const n = { ...prev };
              const list = n[p.shopify_product_id] || [];
              n[p.shopify_product_id] = list.includes(bulkValue) ? list : [...list, bulkValue];
              return n;
            });
            results.push({ id: p.shopify_product_id, name: p.raw_data?.title, success: true });
          }
        } else {
          const updates = { [bulkField]: bulkValue };
          const data = await authedFetch("/shopify-product-update", {
            method: "POST",
            body: JSON.stringify({ store_id: storeId, product_id: p.shopify_product_id, updates }),
          });
          if (data.error) {
            results.push({ id: p.shopify_product_id, name: p.raw_data?.title, success: false, error: data.error });
          } else {
            const row = { store_id: storeId, shopify_product_id: String(data.product.id), raw_data: data.product, synced_at: new Date().toISOString() };
            setProducts((prev) => prev.map((x) => (x.shopify_product_id === row.shopify_product_id ? row : x)));
            await upsertProduct(eneezamId, row);
            results.push({ id: p.shopify_product_id, name: p.raw_data?.title, success: true });
          }
        }
      } catch (err) {
        results.push({ id: p.shopify_product_id, name: p.raw_data?.title, success: false, error: err.message });
      }
      setBulkProgress((c) => c + 1);
    }
    setBulkApplying(false);
    setShowBulkEditModal(false);
    setBulkResults(results);
    setSelectedIds(new Set());
    setBulkValue("");
    setNewBulkCollectionTitle("");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const title = (p.raw_data?.title || "").toLowerCase();
      const vendor = (p.raw_data?.vendor || "").toLowerCase();
      const sku = (p.raw_data?.variants || []).map((v) => (v.sku || "").toLowerCase()).join(" ");
      const matchSearch = !q || title.includes(q) || vendor.includes(q) || sku.includes(q);
      const matchStatus = statusFilter === "All" || p.raw_data?.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [products, search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pagedProducts = filtered.slice((page - 1) * perPage, page * perPage);

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10,
  };
  // Single shared card padding — previously `cardStyle` declared "18px 20px" but the real product
  // cards hardcoded a different "14px 16px", so the two never actually agreed. One value now, used
  // by both the empty-state card and the real product cards.
  const CARD_PADDING = "16px 18px";
  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: CARD_PADDING };
  const cellInputStyle = {
    width: 90, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11.5, boxSizing: "border-box",
  };
  const numCellInputStyle = { ...cellInputStyle, width: 68 };
  const badgeStyle = { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 9.5, fontWeight: 700, whiteSpace: "nowrap" };
  const fieldLabelStyle = { fontSize: 9.5, color: "var(--ne-muted-2)", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700, display: "block", marginBottom: 2 };
  const iconBtnStyle = (color) => ({ background: "transparent", border: "none", color, cursor: "pointer", padding: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6 });

  if (!ordersStore?.shopify_url) {
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="products" size={17} /> {t("products.title")}</h1>
        <div style={{ ...cardStyle, marginTop: "1.5rem", textAlign: "center", color: "var(--ne-muted)" }}>
          {t("products.connectStoreFirst")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="products" size={17} /> {t("products.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.store_name} — {filtered.length}</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => { resetNewProductForm(); setCreateError(""); setShowNewProductModal(true); }}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            {t("products.newProduct")}
          </button>
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
          <input type="text" placeholder={t("products.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 27px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          <option value="All">{t("products.allStatus")}</option>
          <option value="active">{t("products.status.active")}</option>
          <option value="draft">{t("products.status.draft")}</option>
          <option value="archived">{t("products.status.archived")}</option>
        </select>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--ne-muted)", fontWeight: 600 }}>{selectedIds.size} {t("products.selectedSuffix")}</span>
            <button onClick={() => setShowBulkEditModal(true)}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="edit" size={12} /> {t("products.bulkEdit")}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <ProductsSkeleton />
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>
          {products.length === 0 ? t("products.noProducts") : t("products.noProductsFiltered")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pagedProducts.map((p) => {
            const status = p.raw_data?.status || "active";
            const image = p.raw_data?.image?.src || p.raw_data?.images?.[0]?.src;
            const shopifyAdminUrl = `https://${ordersStore?.shopify_url}/admin/products/${p.shopify_product_id}`;
            const shopifyStorefrontUrl = p.raw_data?.handle ? `https://${ordersStore?.shopify_url}/products/${p.raw_data.handle}` : null;
            const productId = p.shopify_product_id;
            const variants = p.raw_data?.variants || [];
            const collectionTitles = collectionTitlesForProduct(productId);
            const status2 = syncStatus[productId];
            const archived = archivedVariants[productId] || [];

            const statusZone = (
              <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", alignItems: isMobile ? "center" : "flex-end", gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggleStatus(p)} disabled={status2 === "pending"} title={t(`products.status.${status}`) || status}
                  style={{ width: 34, height: 18, borderRadius: 10, border: "none", cursor: status2 === "pending" ? "default" : "pointer", position: "relative", background: status === "active" ? "var(--ne-success)" : "var(--ne-border)", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 2, left: status === "active" ? 17 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                </button>
                {status2 === "pending" && (
                  <span style={{ ...badgeStyle, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
                    <Icon name="refresh" size={9} /> {t("products.syncPending")}
                  </span>
                )}
                {status2 === "synced" && (
                  <span style={{ ...badgeStyle, background: "var(--ne-success-soft)", color: "var(--ne-success)" }}>
                    <Icon name="check" size={9} /> {t("products.synced")}
                  </span>
                )}
              </div>
            );

            return (
              <div key={productId} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: CARD_PADDING }}>
                {/* ===== ZONE 1 — Header: identity + status ===== */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <input type="checkbox" checked={selectedIds.has(productId)} onChange={() => toggleSelect(productId)} style={{ cursor: "pointer", marginTop: 4, flexShrink: 0 }} />
                  {image ? (
                    <img src={image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name="package" size={16} style={{ color: "var(--ne-muted-2)" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingTitleId === productId ? (
                      <div>
                        <span style={fieldLabelStyle}>{t("products.titleLabel")}</span>
                        <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={productId} fieldKey="title" initialValue={pendingChanges[productId]?.fields?.title ?? p.raw_data?.title}
                          placeholder={t("products.titlePlaceholder")}
                          onCommit={(val) => { commitProductField(p, "title", val); setEditingTitleId(null); }}
                          style={{ ...cellInputStyle, width: "100%", fontSize: 13 }} />
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {shopifyStorefrontUrl ? (
                          <a href={shopifyStorefrontUrl} target="_blank" rel="noreferrer" title={t("products.viewOnStorefront")}
                            style={{ color: "var(--ne-text)", textDecoration: "none", fontWeight: 700, fontSize: 13.5 }}>
                            {p.raw_data?.title || "—"}
                          </a>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ne-text)" }}>{p.raw_data?.title || "—"}</span>
                        )}
                        <Icon name="edit" size={10} style={{ cursor: "pointer", flexShrink: 0, color: "var(--ne-muted-2)" }}
                          onClick={() => setEditingTitleId(productId)} />
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: isMobile ? "stretch" : "flex-end" }}>
                      <div style={{ width: isMobile ? "100%" : "auto" }}>
                        <span style={fieldLabelStyle}>{t("products.vendorLabel")}</span>
                        <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={productId} fieldKey="vendor" initialValue={pendingChanges[productId]?.fields?.vendor ?? p.raw_data?.vendor}
                          placeholder={t("products.vendorPlaceholder")}
                          onCommit={(val) => commitProductField(p, "vendor", val)} style={{ ...cellInputStyle, width: isMobile ? "100%" : 90 }} />
                      </div>
                      <div style={{ width: isMobile ? "100%" : "auto" }}>
                        <span style={fieldLabelStyle}>{t("products.typeLabel")}</span>
                        <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={productId} fieldKey="product_type" initialValue={pendingChanges[productId]?.fields?.product_type ?? p.raw_data?.product_type}
                          placeholder={t("products.typePlaceholder")}
                          onCommit={(val) => commitProductField(p, "product_type", val)} style={{ ...cellInputStyle, width: isMobile ? "100%" : 90 }} />
                      </div>
                      {isMobile && statusZone}
                    </div>
                    {collectionTitles.length > 0 && (
                      <div style={{ fontSize: 10, color: "var(--ne-muted-2)", marginTop: 4 }}>{collectionTitles.join(", ")}</div>
                    )}
                  </div>
                  {!isMobile && statusZone}
                </div>

                {/* ===== ZONE 2 — Variants: SKU/price + inventory + costing, per variant ===== */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {variants.map((variant) => {
                    const sku = variant.sku || "";
                    const variantTitle = variant.title && variant.title !== "Default Title" ? variant.title : null;
                    const invRows = inventoryRowsForSku(sku);
                    const stockTotal = stockTotalForSku(sku);
                    const stockTooltip = invRows.length > 1 ? invRows.map((r) => `${r.location_name || t("products.noLocationLabel")}: ${r.quantity ?? 0}`).join(", ") : undefined;
                    const costTotal = costTotalForSku(sku);
                    const rate = costRates[sku];
                    const compMap = costComponents[sku] || {};
                    const extraKeys = extraKeysForSku(compMap);
                    const numberedExtraKeys = extraKeys.filter((k) => /^extra_\d+$/.test(k));
                    const namedExtraKeys = extraKeys.filter((k) => !/^extra_\d+$/.test(k));
                    const slotCount = Math.max(costExtraCounts[sku] || 0, numberedExtraKeys.length);
                    const isExpanded = expandedCostSku === sku;

                    return (
                      <div key={variant.id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flexWrap: "wrap", gap: 8, alignItems: isMobile ? "stretch" : "flex-end" }}>
                          {variantTitle && (
                            <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", fontWeight: 600, width: isMobile ? "100%" : "auto", alignSelf: isMobile ? "flex-start" : "center" }}>{variantTitle}</div>
                          )}
                          <div style={{ width: isMobile ? "100%" : "auto" }}>
                            <span style={fieldLabelStyle}>{t("products.skuLabel")}</span>
                            <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={productId} fieldKey={`sku-${variant.id}`} initialValue={pendingChanges[productId]?.variants?.[variant.id]?.sku ?? variant.sku}
                              placeholder={t("products.skuEnterPlaceholder")}
                              onCommit={(val) => commitVariantField(p, variant, "sku", val)} style={{ ...cellInputStyle, width: isMobile ? "100%" : 90, fontFamily: "monospace" }} />
                          </div>
                          <div style={{ width: isMobile ? "100%" : "auto" }}>
                            <span style={fieldLabelStyle}>{t("products.priceLabel")}</span>
                            <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={productId} fieldKey={`price-${variant.id}`} type="number" initialValue={pendingChanges[productId]?.variants?.[variant.id]?.price ?? variant.price}
                              placeholder="0.00"
                              onCommit={(val) => commitVariantField(p, variant, "price", val)} style={{ ...numCellInputStyle, width: isMobile ? "100%" : 68 }} />
                          </div>
                          <div style={{ width: isMobile ? "100%" : "auto" }}>
                            <span style={fieldLabelStyle}>{t("products.compareAtLabel")}</span>
                            <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={productId} fieldKey={`cap-${variant.id}`} type="number" initialValue={pendingChanges[productId]?.variants?.[variant.id]?.compare_at_price ?? variant.compare_at_price}
                              placeholder="0.00"
                              onCommit={(val) => commitVariantField(p, variant, "compare_at_price", val)} style={{ ...numCellInputStyle, width: isMobile ? "100%" : 68 }} />
                          </div>

                          {sku ? (
                            <>
                              <div style={{ width: isMobile ? "100%" : "auto" }}>
                                <span style={fieldLabelStyle}>{t("products.stockLabel")}</span>
                                {invRows.length > 1 ? (
                                  <span title={stockTooltip} style={{ ...numCellInputStyle, width: isMobile ? "100%" : 68, display: "inline-block", textAlign: "center", cursor: "help" }}>{stockTotal}</span>
                                ) : (
                                  <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={`stock-${sku}`} fieldKey="qty" type="number" initialValue={stockTotal}
                                    placeholder="0" disabled={savingStockSku === sku}
                                    onCommit={(val) => saveStock(p, sku, val)} style={{ ...numCellInputStyle, width: isMobile ? "100%" : 68 }} />
                                )}
                              </div>
                              <div style={{ width: isMobile ? "100%" : "auto" }}>
                                <span style={fieldLabelStyle}>{t("products.costLabel")}</span>
                                <div onClick={() => setExpandedCostSku(isExpanded ? null : sku)} title={t("products.costExpandTooltip")}
                                  style={{ ...numCellInputStyle, width: isMobile ? "100%" : 80, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                                  <span>Rs. {costTotal.toLocaleString()}</span>
                                  <Icon name={isExpanded ? "chevronDown" : "chevronRight"} size={9} />
                                </div>
                              </div>
                              <div style={{ width: isMobile ? "100%" : "auto" }}>
                                <span style={fieldLabelStyle}>{t("products.supplierLabel")}</span>
                                <select value={rate?.supplier_id || ""} onChange={(e) => saveSupplierForSku(sku, e.target.value)}
                                  style={{ ...cellInputStyle, width: isMobile ? "100%" : 110 }}>
                                  <option value="">{t("products.noSupplierOption")}</option>
                                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </div>
                              <div style={{ width: isMobile ? "100%" : "auto" }}>
                                <span style={fieldLabelStyle}>{t("products.returnValueLabel")}</span>
                                <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={`return-${sku}`} fieldKey="rv" type="number" initialValue={rate?.return_value}
                                  placeholder="0.00"
                                  onCommit={(val) => saveReturnValue(sku, val)} style={{ ...numCellInputStyle, width: isMobile ? "100%" : 68 }} />
                              </div>
                            </>
                          ) : (
                            <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 6, background: "var(--ne-warning-soft)", color: "var(--ne-warning)", borderRadius: 7, padding: "5px 9px", fontSize: 10.5 }}>
                              <Icon name="warning" size={11} />
                              {t("products.setSkuPrompt")}
                            </div>
                          )}

                          <button onClick={() => archiveVariant(p, variant)} disabled={status2 === "pending"} title={t("products.archiveVariantTooltip")}
                            style={{ ...iconBtnStyle("var(--ne-muted)"), marginLeft: isMobile ? 0 : "auto", alignSelf: isMobile ? "flex-end" : "center", cursor: status2 === "pending" ? "default" : "pointer" }}>
                            <Icon name="trash" size={12} />
                          </button>
                        </div>

                        {sku && isExpanded && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--ne-border)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                            {DEFAULT_COMPONENT_KEYS.map((key) => (
                              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={fieldLabelStyle}>{costLabels[key]}</span>
                                <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={`cost-${sku}`} fieldKey={key} type="number" initialValue={getCostInputValue(sku, key)}
                                  placeholder={t("products.costComponentPlaceholder")}
                                  onCommit={(val) => saveCostComponent(sku, key, val)} style={numCellInputStyle} />
                              </div>
                            ))}
                            {[...Array(slotCount)].map((_, idx) => {
                              const n = idx + 1;
                              const key = `extra_${n}`;
                              return (
                                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span style={fieldLabelStyle}>{t("products.extraPrefix")} {n}</span>
                                  <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={`cost-${sku}`} fieldKey={key} type="number" initialValue={getCostInputValue(sku, key)}
                                    placeholder={t("products.costComponentPlaceholder")}
                                    onCommit={(val) => saveCostComponent(sku, key, val)} style={numCellInputStyle} />
                                </div>
                              );
                            })}
                            {namedExtraKeys.map((key) => (
                              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={fieldLabelStyle}>{humanizeKey(key, t("products.extraPrefix"))}</span>
                                <EditableCell drafts={drafts} setFieldDraft={setFieldDraft} clearFieldDraft={clearFieldDraft} productId={`cost-${sku}`} fieldKey={key} type="number" initialValue={getCostInputValue(sku, key)}
                                  placeholder={t("products.costComponentPlaceholder")}
                                  onCommit={(val) => saveCostComponent(sku, key, val)} style={numCellInputStyle} />
                              </div>
                            ))}
                            <button onClick={() => addAnotherCostExtra(sku)}
                              style={{ background: "transparent", border: "1px dashed var(--ne-border)", borderRadius: 7, color: "var(--ne-accent)", cursor: "pointer", fontSize: 10.5, padding: "5px 8px" }}>
                              {t("products.addAnotherComponent")}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {archived.length > 0 && (
                    <div style={{ marginTop: 2, paddingTop: 8, borderTop: "1px dashed var(--ne-border)" }}>
                      <div style={{ fontSize: 10, color: "var(--ne-muted-2)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{t("products.archivedVariants")}</div>
                      {archived.map((row) => (
                        <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.55, marginTop: 4 }}>
                          <span style={{ fontSize: 10.5, color: "var(--ne-muted-2)", minWidth: 90, flexShrink: 0 }}>
                            {row.variant_data?.title && row.variant_data.title !== "Default Title" ? row.variant_data.title : t("products.defaultVariant")}
                          </span>
                          <span style={{ fontSize: 10.5, color: "var(--ne-muted-2)", fontFamily: "monospace" }}>{row.variant_data?.sku || "—"}</span>
                          <span style={{ fontSize: 10.5, color: "var(--ne-muted-2)" }}>{row.variant_data?.price ?? "—"}</span>
                          <button onClick={() => restoreVariant(p, row)} disabled={status2 === "pending"} title={t("products.restoreVariantTooltip")}
                            style={{ ...iconBtnStyle("var(--ne-success)"), marginLeft: "auto", cursor: status2 === "pending" ? "default" : "pointer" }}>
                            <Icon name="undo" size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ===== ZONE 3 — Footer: actions ===== */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ne-border)", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ne-muted-2)" }}>
                    {t("products.table.syncedAt")}: {p.synced_at ? new Date(p.synced_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => openEditProduct(p)} title={t("products.edit")} style={iconBtnStyle("var(--ne-accent)")}>
                      <Icon name="edit" size={13} />
                    </button>
                    {pendingChanges[productId] && (
                      <button onClick={() => pushProductChanges(p)} disabled={status2 === "pending"} title={t("products.pushToShopify")}
                        style={{ ...iconBtnStyle("var(--ne-warning)"), cursor: status2 === "pending" ? "default" : "pointer" }}>
                        <Icon name="refresh" size={13} />
                      </button>
                    )}
                    <a href={shopifyAdminUrl} target="_blank" rel="noreferrer" title={t("products.viewInShopify")} style={iconBtnStyle("var(--ne-muted)")}>
                      <Icon name="link" size={13} />
                    </a>
                    {shopifyStorefrontUrl && (
                      <a href={shopifyStorefrontUrl} target="_blank" rel="noreferrer" title={t("products.viewOnStorefront")} style={iconBtnStyle("var(--ne-muted)")}>
                        <Icon name="shop" size={13} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
            {t("products.showing")} {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} {t("products.of")} {filtered.length}
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

      {/* New Product Modal */}
      {showNewProductModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("products.newProductTitle")}</h2>
            </div>
            <form onSubmit={createNewProduct} style={{ padding: "16px 18px" }}>
              <input type="text" placeholder={t("products.titlePlaceholder")} value={newProductForm.title}
                onChange={(e) => setNewProductForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.vendorPlaceholder")} value={newProductForm.vendor}
                onChange={(e) => setNewProductForm((f) => ({ ...f, vendor: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.typePlaceholder")} value={newProductForm.product_type}
                onChange={(e) => setNewProductForm((f) => ({ ...f, product_type: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.tagsPlaceholder")} value={newProductForm.tags}
                onChange={(e) => setNewProductForm((f) => ({ ...f, tags: e.target.value }))} style={inputStyle} />
              <input type="number" step="0.01" placeholder={t("products.compareAtPricePlaceholder")} value={newProductForm.compare_at_price}
                onChange={(e) => setNewProductForm((f) => ({ ...f, compare_at_price: e.target.value }))} style={inputStyle} />
              <input type="number" step="0.01" placeholder={t("products.pricePlaceholder")} value={newProductForm.price}
                onChange={(e) => setNewProductForm((f) => ({ ...f, price: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.skuPlaceholder")} value={newProductForm.sku}
                onChange={(e) => setNewProductForm((f) => ({ ...f, sku: e.target.value }))} style={inputStyle} />

              {createError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{createError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={creating}
                  style={{ flex: 1, padding: "10px", background: creating ? "var(--ne-border)" : "var(--ne-success)", color: creating ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: creating ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {creating ? t("products.creating") : (<><Icon name="check" size={13} /> {t("products.create")}</>)}
                </button>
                <button type="button" onClick={() => setShowNewProductModal(false)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("products.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 480, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="edit" size={13} /> {t("products.editProductTitle")}</h2>
            </div>
            <form onSubmit={saveEditProduct} style={{ padding: "16px 18px" }}>
              <input type="text" placeholder={t("products.titlePlaceholder")} value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.vendorPlaceholder")} value={editForm.vendor}
                onChange={(e) => setEditForm((f) => ({ ...f, vendor: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.typePlaceholder")} value={editForm.product_type}
                onChange={(e) => setEditForm((f) => ({ ...f, product_type: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.tagsPlaceholder")} value={editForm.tags}
                onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))} style={inputStyle} />
              <input type="number" step="0.01" placeholder={t("products.compareAtPricePlaceholder")} value={editForm.compare_at_price}
                onChange={(e) => setEditForm((f) => ({ ...f, compare_at_price: e.target.value }))} style={inputStyle} />
              <input type="number" step="0.01" placeholder={t("products.pricePlaceholder")} value={editForm.price}
                onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("products.skuPlaceholder")} value={editForm.sku}
                onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value }))} style={inputStyle} />
              <label style={{ color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("products.statusLabel")}</label>
              <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
                <option value="active">{t("products.status.active")}</option>
                <option value="draft">{t("products.status.draft")}</option>
                <option value="archived">{t("products.status.archived")}</option>
              </select>

              <label style={{ color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("products.descriptionLabel")}</label>
              <textarea rows={4} placeholder={t("products.descriptionPlaceholder")} value={editForm.body_html}
                onChange={(e) => setEditForm((f) => ({ ...f, body_html: e.target.value }))} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

              <label style={{ color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 6, fontWeight: 600 }}>{t("products.imagesLabel")}</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {editForm.images.map((img, idx) => (
                  <div key={img.id || img.src} style={{ position: "relative" }}>
                    <img src={img.src} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid var(--ne-border)" }} />
                    <button type="button" onClick={() => removeEditImage(idx)} title={t("products.removeImage")}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", border: "none", background: "var(--ne-danger)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="close" size={9} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input type="text" placeholder={t("products.imageUrlPlaceholder")} value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                <button type="button" onClick={addEditImage}
                  style={{ padding: "0 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {t("products.addImage")}
                </button>
              </div>

              {editError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{editError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={savingEdit}
                  style={{ flex: 1, padding: "10px", background: savingEdit ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: savingEdit ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {savingEdit ? t("products.saving") : (<><Icon name="check" size={13} /> {t("products.save")}</>)}
                </button>
                <button type="button" onClick={() => setEditingProduct(null)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("products.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="edit" size={13} /> {t("products.bulkEditTitle")}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{selectedIds.size} {t("products.bulkEditHintPrefix")}</p>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <label style={{ color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("products.fieldLabel")}</label>
              <select value={bulkField} onChange={(e) => { setBulkField(e.target.value); setBulkValue(""); }} style={inputStyle}>
                {BULK_FIELDS.map((f) => <option key={f} value={f}>{t(`products.field.${f}`)}</option>)}
              </select>
              {bulkField === "status" ? (
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  <option value="active">{t("products.status.active")}</option>
                  <option value="draft">{t("products.status.draft")}</option>
                  <option value="archived">{t("products.status.archived")}</option>
                </select>
              ) : bulkField === "collection" ? (
                <>
                  <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={inputStyle}>
                    <option value="">—</option>
                    {storeCollections.map((c) => <option key={c.shopify_collection_id} value={c.shopify_collection_id}>{c.title}</option>)}
                    <option value={CREATE_NEW_COLLECTION}>{t("products.createNewCollection")}</option>
                  </select>
                  {bulkValue === CREATE_NEW_COLLECTION && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                      <input type="text" placeholder={t("products.newCollectionNamePlaceholder")} value={newBulkCollectionTitle}
                        onChange={(e) => setNewBulkCollectionTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                      <button type="button" onClick={createBulkCollection} disabled={bulkCollectionCreating || !newBulkCollectionTitle.trim()}
                        style={{ padding: "0 14px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {bulkCollectionCreating ? "..." : t("products.create")}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <input type="text" placeholder={t("products.valueLabel")} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={inputStyle} />
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={applyBulkEdit} disabled={bulkApplying || !bulkValue || bulkValue === CREATE_NEW_COLLECTION}
                  style={{ flex: 1, padding: "10px", background: (bulkApplying || !bulkValue || bulkValue === CREATE_NEW_COLLECTION) ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: (bulkApplying || !bulkValue) ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {bulkApplying ? `${t("products.applying")} ${bulkProgress}/${selectedIds.size}` : (<><Icon name="check" size={13} /> {t("products.apply")}</>)}
                </button>
                <button type="button" onClick={() => setShowBulkEditModal(false)} disabled={bulkApplying}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("products.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Result Modal */}
      {bulkResults && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000001 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "94vw", maxHeight: "75vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("products.bulkResultTitle")}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} /> {bulkResults.filter((r) => r.success).length} {t("products.successSuffix")}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="close" size={11} /> {bulkResults.filter((r) => !r.success).length} {t("products.failedSuffix")}</span>
              </p>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {bulkResults.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ display: "flex", alignItems: "center" }}><Icon name={r.success ? "check" : "close"} size={11} /></span>
                  <div>
                    <div style={{ color: "var(--ne-text)", fontWeight: 600 }}>{r.name}</div>
                    {!r.success && <div style={{ color: "var(--ne-danger)" }}>{r.error}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setBulkResults(null)}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {t("products.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
