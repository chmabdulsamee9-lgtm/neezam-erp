import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const PAGE_SIZE = 500;
const PER_PAGE_OPTIONS = [20, 50, 100];

async function fetchAll(table, storeId, select = "*") {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
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

export default function InventoryManagement({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);

  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ product_id: "", variant_sku: "", quantity: "0", location_name: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const [editingRow, setEditingRow] = useState(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editSku, setEditSku] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) loadData();
  }, [storeId]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [productRows, inventoryRows] = await Promise.all([
        fetchAll("products_cache", storeId, "id, shopify_product_id, raw_data"),
        fetchAll("inventory_levels", storeId, "*"),
      ]);
      setProducts(productRows);
      setRows(inventoryRows);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadInventoryOnly = async () => {
    try {
      const inventoryRows = await fetchAll("inventory_levels", storeId, "*");
      setRows(inventoryRows);
    } catch (err) {
      setError(err.message);
    }
  };

  const productMap = useMemo(() => {
    const map = {};
    products.forEach((p) => { map[p.id] = p; });
    return map;
  }, [products]);

  const resetAddForm = () => setAddForm({ product_id: "", variant_sku: "", quantity: "0", location_name: "" });

  const addInventoryRow = async (e) => {
    e.preventDefault();
    setAddError("");
    if (!addForm.product_id) { setAddError(t("inventory.productRequired")); return; }
    setAdding(true);
    const { error } = await supabase.from("inventory_levels").insert({
      store_id: storeId,
      product_id: addForm.product_id,
      variant_sku: addForm.variant_sku.trim() || null,
      quantity: Number(addForm.quantity) || 0,
      location_name: addForm.location_name.trim() || null,
    });
    setAdding(false);
    if (error) { setAddError(error.message); return; }
    setShowAddModal(false);
    resetAddForm();
    loadInventoryOnly();
  };

  const openEdit = (row) => {
    setEditingRow(row);
    setEditQuantity(String(row.quantity ?? 0));
    setEditLocation(row.location_name || "");
    setEditSku(row.variant_sku || "");
    setEditError("");
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditError("");
    setSaving(true);
    const { error } = await supabase.from("inventory_levels").update({
      quantity: Number(editQuantity) || 0,
      location_name: editLocation.trim() || null,
      variant_sku: editSku.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", editingRow.id);
    setSaving(false);
    if (error) { setEditError(error.message); return; }
    setRows((prev) => prev.map((r) => (r.id === editingRow.id
      ? { ...r, quantity: Number(editQuantity) || 0, location_name: editLocation.trim() || null, variant_sku: editSku.trim() || null }
      : r
    )));
    setEditingRow(null);
  };

  const deleteRow = async (row) => {
    if (!window.confirm(t("inventory.deleteConfirm"))) return;
    const { error } = await supabase.from("inventory_levels").delete().eq("id", row.id);
    if (!error) setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const availableLocations = useMemo(() => {
    return ["All", ...new Set(rows.map((r) => r.location_name).filter(Boolean))].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const product = productMap[r.product_id];
      const title = (product?.raw_data?.title || "").toLowerCase();
      const sku = (r.variant_sku || "").toLowerCase();
      const location = (r.location_name || "").toLowerCase();
      const matchSearch = !q || title.includes(q) || sku.includes(q) || location.includes(q);
      const matchLocation = locationFilter === "All" || r.location_name === locationFilter;
      return matchSearch && matchLocation;
    });
  }, [rows, productMap, search, locationFilter]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10,
  };
  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px" };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="inventory" size={17} /> {t("inventory.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{filtered.length}</p>
        </div>
        <button onClick={() => { resetAddForm(); setAddError(""); setShowAddModal(true); }} disabled={products.length === 0}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: products.length === 0 ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: products.length === 0 ? "default" : "pointer" }}>
          {t("inventory.addInventory")}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 9, fontSize: 12, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="error" size={12} /> {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Icon name="search" size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ne-muted-2)" }} />
          <input type="text" placeholder={t("inventory.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 27px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        </div>
        <select value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {availableLocations.map((l) => <option key={l} value={l}>{l === "All" ? t("inventory.allLocations") : l}</option>)}
        </select>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>{t("inventory.loading")}</div>
      ) : products.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("inventory.noProductsYet")}</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>
          {rows.length === 0 ? t("inventory.noInventory") : t("inventory.noInventoryFiltered")}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr>
                {[t("inventory.table.product"), t("inventory.table.variantSku"), t("inventory.table.location"), t("inventory.table.quantity"), t("inventory.table.updatedAt"), t("inventory.table.actions")].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const product = productMap[r.product_id];
                const image = product?.raw_data?.image?.src || product?.raw_data?.images?.[0]?.src;
                const lowStock = Number(r.quantity) <= 0;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--ne-border)" }}>
                    <td style={{ padding: "7px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {image ? (
                          <img src={image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Icon name="package" size={12} style={{ color: "var(--ne-muted-2)" }} />
                          </div>
                        )}
                        <span style={{ color: "var(--ne-text)", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {product?.raw_data?.title || t("inventory.unknownProduct")}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted)", fontFamily: "monospace" }}>{r.variant_sku || "—"}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted)" }}>{r.location_name || "—"}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700, color: lowStock ? "var(--ne-danger)" : "var(--ne-text)" }}>{r.quantity ?? 0}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted-2)", fontSize: 10.5, whiteSpace: "nowrap" }}>
                      {r.updated_at ? new Date(r.updated_at).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                      <button onClick={() => openEdit(r)}
                        style={{ background: "transparent", border: "none", color: "var(--ne-accent)", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, marginRight: 10 }}>
                        <Icon name="edit" size={11} /> {t("inventory.edit")}
                      </button>
                      <button onClick={() => deleteRow(r)}
                        style={{ background: "transparent", border: "none", color: "var(--ne-danger)", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="trash" size={11} /> {t("inventory.delete")}
                      </button>
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
            {t("inventory.showing")} {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} {t("inventory.of")} {filtered.length}
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

      {/* Add Inventory Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 400, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("inventory.addModalTitle")}</h2>
            </div>
            <form onSubmit={addInventoryRow} style={{ padding: "16px 18px" }}>
              <label style={{ color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("inventory.productLabel")}</label>
              <select value={addForm.product_id} onChange={(e) => setAddForm((f) => ({ ...f, product_id: e.target.value }))} style={inputStyle}>
                <option value="">{t("inventory.selectProduct")}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.raw_data?.title || p.shopify_product_id}</option>)}
              </select>
              <input type="text" placeholder={t("inventory.variantSkuPlaceholder")} value={addForm.variant_sku}
                onChange={(e) => setAddForm((f) => ({ ...f, variant_sku: e.target.value }))} style={inputStyle} />
              <input type="number" placeholder={t("inventory.quantityPlaceholder")} value={addForm.quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))} style={inputStyle} />
              <input type="text" placeholder={t("inventory.locationPlaceholder")} value={addForm.location_name}
                onChange={(e) => setAddForm((f) => ({ ...f, location_name: e.target.value }))} style={inputStyle} />

              {addError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{addError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={adding}
                  style={{ flex: 1, padding: "10px", background: adding ? "var(--ne-border)" : "var(--ne-success)", color: adding ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: adding ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {adding ? t("inventory.adding") : (<><Icon name="check" size={13} /> {t("inventory.add")}</>)}
                </button>
                <button type="button" onClick={() => setShowAddModal(false)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("inventory.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Inventory Modal */}
      {editingRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="edit" size={13} /> {t("inventory.editModalTitle")}</h2>
            </div>
            <form onSubmit={saveEdit} style={{ padding: "16px 18px" }}>
              <input type="text" placeholder={t("inventory.variantSkuPlaceholder")} value={editSku}
                onChange={(e) => setEditSku(e.target.value)} style={inputStyle} />
              <input type="number" placeholder={t("inventory.quantityPlaceholder")} value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)} style={inputStyle} />
              <input type="text" placeholder={t("inventory.locationPlaceholder")} value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)} style={inputStyle} />

              {editError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{editError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: "10px", background: saving ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {saving ? t("inventory.saving") : (<><Icon name="check" size={13} /> {t("inventory.save")}</>)}
                </button>
                <button type="button" onClick={() => setEditingRow(null)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("inventory.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
