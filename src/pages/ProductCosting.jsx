import { useState, useEffect, useMemo, Fragment } from "react";
import Papa from "papaparse";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { getCachedProducts, upsertProduct } from "../productsCache";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const PER_PAGE_OPTIONS = [10, 20, 50];
const DEFAULT_COMPONENT_KEYS = ["component_1", "component_2", "component_3"];
const DEFAULT_LABELS = { component_1: "Raw Material", component_2: "Packaging", component_3: "Other" };

const firstVariant = (row) => row?.raw_data?.variants?.[0] || {};

// Case/whitespace/underscore-insensitive header comparison, used for both matching
// an uploaded CSV/Excel header against the current component labels and for
// recognizing "SKU"/"Return Value" columns regardless of exact casing.
const norm = (s) => String(s || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

// Turns an unrecognized header into a stable component_name key, so re-uploading
// the same file always maps back to the same DB row instead of creating duplicates.
const slugify = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const humanizeKey = (key, extraLabel) => {
  const m = /^extra_(\d+)$/.exec(key);
  if (m) return `${extraLabel} ${m[1]}`;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

// Every non-default key for a SKU — both manually-added "extra_N" slots and any
// dynamically-named components created by a bulk upload's unrecognized headers.
const extraKeysForSku = (componentsForSku) => {
  const keys = Object.keys(componentsForSku || {}).filter((k) => !DEFAULT_COMPONENT_KEYS.includes(k));
  const numbered = keys.filter((k) => /^extra_\d+$/.test(k)).sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));
  const named = keys.filter((k) => !/^extra_\d+$/.test(k)).sort();
  return [...numbered, ...named];
};

const csvEscape = (val) => {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

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
  // legacyCosts: { [sku]: number } — from product_costs.cost_price, used as Total fallback when no components exist yet
  const [legacyCosts, setLegacyCosts] = useState({});
  const [returnValues, setReturnValues] = useState({}); // { [sku]: number } — product_costs.return_value
  const [supplierAssignments, setSupplierAssignments] = useState({}); // { [sku]: supplier_id }
  const [suppliers, setSuppliers] = useState([]);
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [extraCounts, setExtraCounts] = useState({}); // { [sku]: number } — min visible numbered extra-slots for that row

  // Transient in-progress typing, keyed by `${sku}::${componentKey}` (or a reserved
  // "__return_value__" key) — falls back to saved value once cleared
  const [drafts, setDrafts] = useState({});
  const [skuDrafts, setSkuDrafts] = useState({});
  const [savingSkuIds, setSavingSkuIds] = useState(new Set());

  const [editingLabelKey, setEditingLabelKey] = useState(null);
  const [labelDraft, setLabelDraft] = useState("");

  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // all | skuMissing | rateMissing
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showBulkSupplierModal, setShowBulkSupplierModal] = useState(false);
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [bulkSupplierApplying, setBulkSupplierApplying] = useState(false);

  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadResult, setBulkUploadResult] = useState(null);

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

      const [
        { data: costRows, error: costErr },
        { data: componentRows, error: compErr },
        { data: labelRows, error: labelErr },
        { data: supplierRows, error: supplierErr },
      ] = await Promise.all([
        supabase.from("product_costs").select("*").eq("store_id", storeId),
        supabase.from("product_cost_components").select("*").eq("store_id", storeId),
        supabase.from("cost_component_labels").select("*").eq("store_id", storeId),
        supabase.from("suppliers").select("id, name").eq("store_id", storeId).order("name"),
      ]);
      if (costErr) throw costErr;
      if (compErr) throw compErr;
      if (labelErr) throw labelErr;
      if (supplierErr) throw supplierErr;

      const legacyMap = {};
      const returnMap = {};
      const supplierMap = {};
      (costRows || []).forEach((r) => {
        legacyMap[r.sku] = Number(r.cost_price);
        if (r.return_value != null) returnMap[r.sku] = Number(r.return_value);
        if (r.supplier_id) supplierMap[r.sku] = r.supplier_id;
      });
      setLegacyCosts(legacyMap);
      setReturnValues(returnMap);
      setSupplierAssignments(supplierMap);
      setSuppliers(supplierRows || []);

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

  // Applies one or more component changes to a single SKU atomically — a single-cell
  // onBlur/Enter save, a multi-cell paste, and bulk-upload rows all funnel through
  // here, so a change that touches several columns of the SAME row computes its next
  // component-map/total from one consistent base instead of clobbering itself via a
  // stale `components[sku]` closure snapshot. Returns {success,error} so bulk-upload
  // can build an accurate per-row result summary without relying on exceptions.
  const saveComponentValues = async (sku, changes) => {
    if (!sku) return { success: false, error: "No SKU" };
    const currentSkuMap = components[sku] || {};
    const nextSkuMap = { ...currentSkuMap };
    const toDelete = [];
    const toUpsert = [];
    Object.entries(changes).forEach(([componentKey, rawValue]) => {
      const trimmed = String(rawValue ?? "").trim();
      const value = trimmed === "" ? 0 : Number(trimmed);
      if (!trimmed || value === 0) {
        delete nextSkuMap[componentKey];
        toDelete.push(componentKey);
      } else {
        nextSkuMap[componentKey] = value;
        toUpsert.push({ store_id: storeId, sku, component_name: componentKey, cost_price: value, updated_at: new Date().toISOString() });
      }
    });
    setComponents((prev) => ({ ...prev, [sku]: nextSkuMap }));

    const total = Object.values(nextSkuMap).reduce((sum, v) => sum + (Number(v) || 0), 0);

    try {
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase.from("product_cost_components").delete()
          .eq("store_id", storeId).eq("sku", sku).in("component_name", toDelete);
        if (delErr) throw delErr;
      }
      if (toUpsert.length > 0) {
        const { error: upErr } = await supabase.from("product_cost_components").upsert(toUpsert, { onConflict: "store_id,sku,component_name" });
        if (upErr) throw upErr;
      }
      const { error: totalErr } = await supabase.from("product_costs").upsert({
        store_id: storeId, sku, cost_price: total, updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,sku" });
      if (totalErr) throw totalErr;
      setLegacyCosts((prev) => ({ ...prev, [sku]: total }));
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const saveComponentValue = (sku, componentKey, rawValue) => saveComponentValues(sku, { [componentKey]: rawValue });

  const saveReturnValue = async (sku, rawValue) => {
    if (!sku) return { success: false, error: "No SKU" };
    const trimmed = String(rawValue ?? "").trim();
    const value = trimmed === "" ? 0 : Number(trimmed);
    setReturnValues((prev) => ({ ...prev, [sku]: value }));
    try {
      const { error: rvErr } = await supabase.from("product_costs").upsert({
        store_id: storeId, sku, return_value: value, updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,sku" });
      if (rvErr) throw rvErr;
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const saveSupplier = async (sku, supplierId) => {
    if (!sku) return { success: false, error: "No SKU" };
    setSupplierAssignments((prev) => ({ ...prev, [sku]: supplierId || null }));
    try {
      const { error: supErr } = await supabase.from("product_costs").upsert({
        store_id: storeId, sku, supplier_id: supplierId || null, updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,sku" });
      if (supErr) throw supErr;
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const draftKey = (sku, componentKey) => `${sku}::${componentKey}`;
  const returnDraftKey = (sku) => `${sku}::__return_value__`;

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

  const getReturnInputValue = (sku) => {
    const dk = returnDraftKey(sku);
    if (Object.prototype.hasOwnProperty.call(drafts, dk)) return drafts[dk];
    const v = returnValues[sku];
    return v != null ? String(v) : "";
  };

  const handleReturnDraftChange = (sku, val) => {
    setDrafts((prev) => ({ ...prev, [returnDraftKey(sku)]: val }));
  };

  const commitReturnDraft = (sku) => {
    const dk = returnDraftKey(sku);
    const val = drafts[dk];
    setDrafts((prev) => {
      const n = { ...prev };
      delete n[dk];
      return n;
    });
    if (val === undefined) return;
    saveReturnValue(sku, val);
  };

  const handleComponentPaste = (e, rowIndexOnPage, colIndex) => {
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    e.preventDefault();
    const rows = text.replace(/\r/g, "").split("\n").filter((r) => r !== "");

    // Group every pasted cell by target SKU first, so a block that fills multiple
    // columns of the same row gets applied as one saveComponentValues() call.
    const changesBySku = {};
    rows.forEach((rowText, rOffset) => {
      const cells = rowText.split("\t");
      cells.forEach((cellText, cOffset) => {
        const targetRow = rowIndexOnPage + rOffset;
        const targetCol = colIndex + cOffset;
        if (targetCol > 2 || targetRow >= pagedProducts.length) return;
        const targetSku = firstVariant(pagedProducts[targetRow]).sku;
        if (!targetSku) return;
        const componentKey = DEFAULT_COMPONENT_KEYS[targetCol];
        if (!changesBySku[targetSku]) changesBySku[targetSku] = {};
        changesBySku[targetSku][componentKey] = cellText.trim();
      });
    });

    Object.entries(changesBySku).forEach(([sku, changes]) => {
      Object.keys(changes).forEach((componentKey) => {
        const dk = draftKey(sku, componentKey);
        setDrafts((prev) => {
          if (!(dk in prev)) return prev;
          const n = { ...prev };
          delete n[dk];
          return n;
        });
      });
      saveComponentValues(sku, changes);
    });
  };

  const startMoreForSku = (sku) => {
    setExtraCounts((prev) => ({ ...prev, [sku]: Math.max(prev[sku] || 0, 1) }));
  };

  const addAnotherExtra = (sku) => {
    const existing = extraKeysForSku(components[sku]).filter((k) => /^extra_\d+$/.test(k)).length;
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

  const applyBulkSupplier = async () => {
    if (!bulkSupplierId) return;
    const targets = products.filter((p) => selectedIds.has(p.shopify_product_id));
    const skuList = [...new Set(targets.map((p) => firstVariant(p).sku).filter(Boolean))];
    if (skuList.length === 0) { setShowBulkSupplierModal(false); return; }
    setBulkSupplierApplying(true);
    try {
      const payload = skuList.map((sku) => ({ store_id: storeId, sku, supplier_id: bulkSupplierId, updated_at: new Date().toISOString() }));
      const { error: bulkErr } = await supabase.from("product_costs").upsert(payload, { onConflict: "store_id,sku" });
      if (bulkErr) throw bulkErr;
      setSupplierAssignments((prev) => {
        const n = { ...prev };
        skuList.forEach((sku) => { n[sku] = bulkSupplierId; });
        return n;
      });
      setSelectedIds(new Set());
      setBulkSupplierId("");
      setShowBulkSupplierModal(false);
    } catch (err) {
      setError(err.message);
    }
    setBulkSupplierApplying(false);
  };

  const downloadTemplate = () => {
    const rowsWithSku = products.filter((p) => firstVariant(p).sku);
    const header = ["SKU", labels.component_1, labels.component_2, labels.component_3, "Return Value"];
    const lines = [header.map(csvEscape).join(",")];
    rowsWithSku.forEach((p) => {
      const sku = firstVariant(p).sku;
      const compMap = components[sku] || {};
      lines.push([
        sku,
        compMap.component_1 ?? "",
        compMap.component_2 ?? "",
        compMap.component_3 ?? "",
        returnValues[sku] ?? "",
      ].map(csvEscape).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product_costing_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsvRows = (file) => new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });

  const parseXlsxRows = async (file) => {
    // Dynamic import — exceljs (~1MB) sirf yahan, upload ke actual waqt load hoti hai
    const { default: ExcelJS } = await import("exceljs");
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headerByCol = {};
    sheet.getRow(1).eachCell((cell, colNumber) => { headerByCol[colNumber] = String(cell.value ?? "").trim(); });
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = headerByCol[colNumber];
        if (!header) return;
        obj[header] = cell.value != null ? String(cell.value) : "";
      });
      if (Object.keys(obj).length > 0) rows.push(obj);
    });
    return rows;
  };

  // Row-by-row, reuses the exact same upsert logic as the single-cell save
  // (saveComponentValues/saveReturnValue) — just looped, with a result recorded
  // per row instead of relying on exceptions.
  const processBulkUpload = async (rows) => {
    setBulkUploading(true);
    setBulkUploadResult(null);
    let updated = 0;
    const skipped = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const headerKeys = Object.keys(row);
      const skuHeader = headerKeys.find((h) => norm(h) === "sku");
      const sku = skuHeader ? String(row[skuHeader] ?? "").trim() : "";
      if (!sku) { skipped.push({ row: i + 2, reason: t("costing.bulkSkipNoSku") }); continue; }

      const returnValueHeader = headerKeys.find((h) => norm(h) === "returnvalue");
      const changes = {};
      headerKeys.forEach((h) => {
        if (h === skuHeader || h === returnValueHeader) return;
        const trimmedVal = String(row[h] ?? "").trim();
        if (trimmedVal === "") return;
        const headerNorm = norm(h);
        if (headerNorm === "") {
          // Truly blank header with data — last-resort fallback into "Other"
          changes.component_3 = trimmedVal;
          return;
        }
        const matchedDefaultKey = DEFAULT_COMPONENT_KEYS.find((k) => norm(labels[k]) === headerNorm);
        if (matchedDefaultKey) { changes[matchedDefaultKey] = trimmedVal; return; }
        // Unrecognized-but-named header — accept as its own new dynamic component
        const dynamicKey = slugify(h);
        if (dynamicKey) changes[dynamicKey] = trimmedVal;
      });

      let returnVal;
      if (returnValueHeader) {
        const rv = String(row[returnValueHeader] ?? "").trim();
        if (rv !== "") returnVal = rv;
      }

      if (Object.keys(changes).length === 0 && returnVal === undefined) {
        skipped.push({ row: i + 2, reason: t("costing.bulkSkipNoData") });
        continue;
      }

      let rowFailed = false;
      if (Object.keys(changes).length > 0) {
        const res = await saveComponentValues(sku, changes);
        if (!res.success) { skipped.push({ row: i + 2, reason: res.error }); rowFailed = true; }
      }
      if (!rowFailed && returnVal !== undefined) {
        const res2 = await saveReturnValue(sku, returnVal);
        if (!res2.success) { skipped.push({ row: i + 2, reason: res2.error }); rowFailed = true; }
      }
      if (!rowFailed) updated++;
    }
    setBulkUploading(false);
    setBulkUploadResult({ total: rows.length, updated, skipped });
  };

  const handleBulkFileSelected = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const rows = /\.xlsx$/i.test(file.name) ? await parseXlsxRows(file) : await parseCsvRows(file);
      await processBulkUpload(rows);
    } catch (err) {
      setError(err.message);
      setBulkUploading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const title = (p.raw_data?.title || "").toLowerCase();
      const sku = firstVariant(p).sku || "";
      const matchSearch = !q || title.includes(q) || sku.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (filterMode === "skuMissing") return !sku;
      if (filterMode === "rateMissing") return sku && rowTotal(sku) === 0;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, filterMode, components, legacyCosts]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pagedProducts = filtered.slice((page - 1) * perPage, page * perPage);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px" };
  const cellInputStyle = {
    width: 78, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11.5, boxSizing: "border-box",
  };
  const toolbarBtnStyle = {
    padding: "7px 14px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)",
    color: "var(--ne-text)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
  };
  const filterBtnStyle = (active) => ({
    padding: "6px 12px", borderRadius: 8, border: "1px solid " + (active ? "var(--ne-accent)" : "var(--ne-border)"),
    background: active ? "var(--ne-accent-soft)" : "var(--ne-surface-2)", color: active ? "var(--ne-accent)" : "var(--ne-muted)",
    fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  });

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
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={downloadTemplate} style={toolbarBtnStyle}>
            <Icon name="download" size={12} /> {t("costing.downloadTemplate")}
          </button>
          <label style={{ ...toolbarBtnStyle, cursor: bulkUploading ? "default" : "pointer", opacity: bulkUploading ? 0.6 : 1 }}>
            <input type="file" accept=".csv,.xlsx" onChange={handleBulkFileSelected} disabled={bulkUploading} style={{ display: "none" }} />
            <Icon name="upload" size={12} /> {bulkUploading ? t("costing.bulkUploading") : t("costing.bulkUpload")}
          </label>
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
        <button onClick={() => { setFilterMode((m) => (m === "skuMissing" ? "all" : "skuMissing")); setPage(1); }} style={filterBtnStyle(filterMode === "skuMissing")}>
          {t("costing.filterSkuMissing")}
        </button>
        <button onClick={() => { setFilterMode((m) => (m === "rateMissing" ? "all" : "rateMissing")); setPage(1); }} style={filterBtnStyle(filterMode === "rateMissing")}>
          {t("costing.filterRateMissing")}
        </button>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} {t("costing.perPageSuffix")}</option>)}
        </select>
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--ne-muted)", fontWeight: 600 }}>{selectedIds.size} {t("costing.selectedSuffix")}</span>
            <button onClick={() => setShowBulkSupplierModal(true)}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="team" size={12} /> {t("costing.assignSupplier")}
            </button>
          </div>
        )}
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
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t("costing.table.returnValue")}</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t("costing.table.supplier")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map((p, rowIndex) => {
                const v = firstVariant(p);
                const sku = v.sku || "";
                const image = p.raw_data?.image?.src || p.raw_data?.images?.[0]?.src;
                const skuComponents = sku ? components[sku] : null;
                const extraKeys = extraKeysForSku(skuComponents);
                const numberedExtraKeys = extraKeys.filter((k) => /^extra_\d+$/.test(k));
                const namedExtraKeys = extraKeys.filter((k) => !/^extra_\d+$/.test(k));
                const slotCount = Math.max(extraCounts[sku] || 0, numberedExtraKeys.length);
                const hasExpandedContent = slotCount > 0 || namedExtraKeys.length > 0;
                const isSavingSku = savingSkuIds.has(p.shopify_product_id);
                const variationTitle = v.title && v.title !== "Default Title" ? v.title : "";
                return (
                  <Fragment key={p.shopify_product_id}>
                    <tr style={{ borderBottom: hasExpandedContent ? "none" : "1px solid var(--ne-border)" }}>
                      <td style={{ padding: "7px 8px" }}>
                        <input type="checkbox" checked={selectedIds.has(p.shopify_product_id)} onChange={() => toggleSelect(p.shopify_product_id)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "7px 8px" }}>
                        {image ? (
                          <img src={image} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", display: "block", cursor: "zoom-in", transition: "transform .15s ease" }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(3)"; e.currentTarget.style.position = "relative"; e.currentTarget.style.zIndex = "50"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.4)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }} />
                        ) : (
                          <div style={{ width: 30, height: 30, borderRadius: 6, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon name="package" size={13} style={{ color: "var(--ne-muted-2)" }} />
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", maxWidth: 220, whiteSpace: "normal", wordWrap: "break-word", overflowWrap: "break-word" }}>
                        {p.raw_data?.handle ? (
                          <a href={`https://${ordersStore?.shopify_url}/products/${p.raw_data.handle}`} target="_blank" rel="noreferrer" title={t("costing.viewOnStorefront")}
                            style={{ fontWeight: 600, color: "var(--ne-text)", textDecoration: "none" }}>
                            {p.raw_data?.title || "—"}
                          </a>
                        ) : (
                          <div style={{ fontWeight: 600 }}>{p.raw_data?.title || "—"}</div>
                        )}
                        {variationTitle && (
                          <div style={{ fontSize: 10, color: "var(--ne-muted-2)", fontWeight: 400, marginTop: 1 }}>{variationTitle}</div>
                        )}
                      </td>
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
                        {sku && !hasExpandedContent && (
                          <button onClick={() => startMoreForSku(sku)}
                            style={{ background: "transparent", border: "1px solid var(--ne-border)", borderRadius: 7, color: "var(--ne-muted)", cursor: "pointer", fontSize: 10.5, padding: "5px 8px" }}>
                            {t("costing.more")}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 700 }}>
                        Rs. {rowTotal(sku).toLocaleString()}
                      </td>
                      <td style={{ padding: "7px 8px" }}>
                        <input type="number" step="0.01" disabled={!sku} value={getReturnInputValue(sku)}
                          onChange={(e) => handleReturnDraftChange(sku, e.target.value)}
                          onBlur={() => commitReturnDraft(sku)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                          style={{ ...cellInputStyle, opacity: sku ? 1 : 0.5 }} />
                      </td>
                      <td style={{ padding: "7px 8px" }}>
                        <select disabled={!sku} value={supplierAssignments[sku] || ""} onChange={(e) => saveSupplier(sku, e.target.value)}
                          style={{ ...cellInputStyle, width: 120, opacity: sku ? 1 : 0.5 }}>
                          <option value="">{t("costing.noSupplierOption")}</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                    </tr>
                    {hasExpandedContent && (
                      <tr style={{ borderBottom: "1px solid var(--ne-border)" }}>
                        <td></td>
                        <td colSpan={10} style={{ padding: "4px 8px 10px" }}>
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
                            {namedExtraKeys.map((key) => (
                              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 9.5, color: "var(--ne-muted-2)", textTransform: "uppercase", fontWeight: 600 }}>{humanizeKey(key, t("costing.extraPrefix"))}</span>
                                <input type="number" step="0.01" value={getInputValue(sku, key)}
                                  onChange={(e) => handleDraftChange(sku, key, e.target.value)}
                                  onBlur={() => commitDraft(sku, key)}
                                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                                  style={cellInputStyle} />
                              </div>
                            ))}
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

      {showBulkSupplierModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "92vw", padding: "20px" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 15, color: "var(--ne-text)" }}>{t("costing.assignSupplier")}</h3>
            <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--ne-muted)" }}>{selectedIds.size} {t("costing.selectedSuffix")}</p>
            <select value={bulkSupplierId} onChange={(e) => setBulkSupplierId(e.target.value)}
              style={{ width: "100%", padding: "9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}>
              <option value="">{t("costing.selectSupplierPlaceholder")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowBulkSupplierModal(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 13, cursor: "pointer" }}>
                {t("action.cancel")}
              </button>
              <button onClick={applyBulkSupplier} disabled={bulkSupplierApplying || !bulkSupplierId}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: (bulkSupplierApplying || !bulkSupplierId) ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {bulkSupplierApplying ? t("costing.applying") : t("costing.apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkUploadResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000001 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "94vw", maxHeight: "75vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("costing.bulkResultTitle")}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} /> {bulkUploadResult.updated} {t("costing.bulkUpdatedSuffix")}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="close" size={11} /> {bulkUploadResult.skipped.length} {t("costing.bulkSkippedSuffix")}</span>
              </p>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {bulkUploadResult.skipped.map((s, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 6, alignItems: "flex-start" }}>
                  <Icon name="close" size={11} style={{ color: "var(--ne-danger)", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ color: "var(--ne-muted)" }}>{t("costing.rowPrefix")} {s.row}: {s.reason}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setBulkUploadResult(null)}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {t("costing.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
