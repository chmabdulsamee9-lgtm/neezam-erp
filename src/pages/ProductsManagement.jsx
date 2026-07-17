import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { getCachedProducts, saveProductsBulk, upsertProduct, getProductsMeta, setProductsMeta } from "../productsCache";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const PAGE_SIZE = 500;
const PER_PAGE_OPTIONS = [20, 50, 100];
const BULK_FIELDS = ["vendor", "product_type", "tags", "status"];

const STATUS_META = {
  active: { color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
  draft: { color: "var(--ne-warning)", bg: "var(--ne-warning-soft)" },
  archived: { color: "var(--ne-muted)", bg: "var(--ne-muted-soft)" },
};

const firstVariant = (row) => row?.raw_data?.variants?.[0] || {};

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

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ title: "", vendor: "", product_type: "", tags: "", price: "", sku: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", vendor: "", product_type: "", tags: "", status: "active", price: "", sku: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkField, setBulkField] = useState("vendor");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkResults, setBulkResults] = useState(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId && eneezamId) loadProducts();
  }, [storeId, eneezamId]);

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

  const authedFetch = async (path, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${cfUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, ...(opts.headers || {}) },
    });
    return res.json();
  };

  const handleSyncToShopify = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError("");
    try {
      const data = await authedFetch("/shopify-products-sync", { method: "POST", body: JSON.stringify({ store_id: storeId }) });
      if (data.error) {
        setSyncResult({ success: false, error: data.error });
        setSyncing(false);
        return;
      }
      setSyncResult({ success: true, synced: data.synced, total: data.total });
      const all = await fetchAllProductsFromSupabase(storeId);
      setProducts(all);
      await saveProductsBulk(eneezamId, all);
      await setProductsMeta(`productsLastSyncedAt-${eneezamId}`, new Date().toISOString());
    } catch (err) {
      setSyncResult({ success: false, error: err.message });
    }
    setSyncing(false);
  };

  const resetNewProductForm = () => setNewProductForm({ title: "", vendor: "", product_type: "", tags: "", price: "", sku: "" });

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
        variants: [{ price: newProductForm.price || "0", sku: newProductForm.sku.trim() || undefined }],
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
      sku: v.sku || "",
    });
    setEditError("");
  };

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
        variants: [{ id: v.id, price: editForm.price, sku: editForm.sku }],
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

  const applyBulkEdit = async () => {
    setBulkApplying(true);
    setBulkProgress(0);
    const targets = products.filter((p) => selectedIds.has(p.shopify_product_id));
    const results = [];
    for (const p of targets) {
      try {
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
  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px" };

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
          <button onClick={handleSyncToShopify} disabled={syncing}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5, fontWeight: 700, cursor: syncing ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name={syncing ? "pending" : "refresh"} size={12} /> {syncing ? t("products.syncing") : t("products.syncToShopify")}
          </button>
          <button onClick={() => { resetNewProductForm(); setCreateError(""); setShowNewProductModal(true); }}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            {t("products.newProduct")}
          </button>
        </div>
      </div>

      {syncResult && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, display: "flex", alignItems: "center", gap: 6,
          background: syncResult.success ? "var(--ne-success-soft)" : "var(--ne-danger-soft)", color: syncResult.success ? "var(--ne-success)" : "var(--ne-danger)" }}>
          <Icon name={syncResult.success ? "check" : "error"} size={12} />
          {syncResult.success ? `${syncResult.synced}/${syncResult.total} ${t("products.syncedSuffix")}` : syncResult.error}
        </div>
      )}

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
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>{t("products.loading")}</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>
          {products.length === 0 ? t("products.noProducts") : t("products.noProductsFiltered")}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px" }}></th>
                <th style={{ padding: "6px 8px" }}></th>
                {[t("products.table.title"), t("products.table.vendor"), t("products.table.type"), t("products.table.sku"), t("products.table.price"), t("products.table.status"), t("products.table.syncedAt"), t("products.table.actions")].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map((p) => {
                const v = firstVariant(p);
                const status = p.raw_data?.status || "active";
                const meta = STATUS_META[status] || STATUS_META.active;
                const image = p.raw_data?.image?.src || p.raw_data?.images?.[0]?.src;
                const shopifyUrl = `https://${ordersStore?.shopify_url}/admin/products/${p.shopify_product_id}`;
                return (
                  <tr key={p.shopify_product_id} style={{ borderBottom: "1px solid var(--ne-border)" }}>
                    <td style={{ padding: "7px 8px" }}>
                      <input type="checkbox" checked={selectedIds.has(p.shopify_product_id)} onChange={() => toggleSelect(p.shopify_product_id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      {image ? (
                        <img src={image} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="package" size={14} style={{ color: "var(--ne-muted-2)" }} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.raw_data?.title || "—"}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted)" }}>{p.raw_data?.vendor || "—"}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted)" }}>{p.raw_data?.product_type || "—"}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted)", fontFamily: "monospace" }}>{v.sku || "—"}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-text)" }}>{v.price ? `Rs. ${Number(v.price).toLocaleString()}` : "—"}</td>
                    <td style={{ padding: "7px 8px" }}>
                      <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.color }}>
                        {t(`products.status.${status}`) || status}
                      </span>
                    </td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted-2)", fontSize: 10.5, whiteSpace: "nowrap" }}>
                      {p.synced_at ? new Date(p.synced_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                      <button onClick={() => openEditProduct(p)}
                        style={{ background: "transparent", border: "none", color: "var(--ne-accent)", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, marginRight: 10 }}>
                        <Icon name="edit" size={11} /> {t("products.edit")}
                      </button>
                      <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ne-muted)", fontSize: 11, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="link" size={11} /> {t("products.viewInShopify")}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
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
              <select value={bulkField} onChange={(e) => setBulkField(e.target.value)} style={inputStyle}>
                {BULK_FIELDS.map((f) => <option key={f} value={f}>{t(`products.field.${f}`)}</option>)}
              </select>
              {bulkField === "status" ? (
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  <option value="active">{t("products.status.active")}</option>
                  <option value="draft">{t("products.status.draft")}</option>
                  <option value="archived">{t("products.status.archived")}</option>
                </select>
              ) : (
                <input type="text" placeholder={t("products.valueLabel")} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} style={inputStyle} />
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={applyBulkEdit} disabled={bulkApplying || !bulkValue}
                  style={{ flex: 1, padding: "10px", background: (bulkApplying || !bulkValue) ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: (bulkApplying || !bulkValue) ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
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
