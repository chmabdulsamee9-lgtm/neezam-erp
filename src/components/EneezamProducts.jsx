import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import Icon from "./Icon";
import { useLanguage, useTranslation } from "../i18n";
import { upsertProduct } from "../productsCache";
import ProductEditor from "./ProductEditor";
import EneezamProductCard from "./EneezamProductCard";

// eNeezam-native catalog (store_products) for stores with a connected custom domain.
// Talks only to the worker's admin endpoints; never reads store_products directly.

const LIMIT = 20;
const STATUSES = ["all", "active", "draft", "archived"];

const normalizeImage = (img) =>
  typeof img === "string"
    ? { url: img, source_url: null, mirrored: false, alt: "", error: null }
    : { url: img?.url || "", source_url: img?.source_url ?? null, mirrored: !!img?.mirrored, alt: img?.alt || "", error: img?.error ?? null };

const fmt = (t, key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), t(key));
const money = (n) => (n === null || n === undefined || n === "" ? "" : `Rs ${Number(n).toLocaleString("en-PK")}`);
const emptyVariant = () => ({ id: undefined, title: "", price: "", compare_at_price: "", sku: "", inventory_quantity: "" });
const emptyForm = () => ({ title: "", description: "", vendor: "", product_type: "", tags: "", status: "draft", images: [], variants: [emptyVariant()] });

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export default function EneezamProducts({ storeId, ordersStore, cfUrl, storeUrl = "", isMobile = false, hasShopify = true }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const eneezamId = ordersStore?.eneezam_id;

  const api = async (path, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${cfUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, ...(opts.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, data };
  };

  const logActivity = async (actionType, details) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("activity_log").insert({
        store_id: storeId, user_id: user.id, user_name: user.email,
        action_type: actionType, order_id: null, details: details || null,
      });
    } catch { /* best-effort */ }
  };

  // ---------- list ----------
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [catalogSource, setCatalogSource] = useState("shopify");
  const [pendingTotal, setPendingTotal] = useState(0);

  const listSeq = useRef(0);
  const loadList = async () => {
    const seq = ++listSeq.current;
    setLoading(true);
    setListError("");
    const qs = new URLSearchParams({ store_id: storeId, status: statusFilter, search, page: String(page), limit: String(LIMIT) });
    const { status, data } = await api(`/list-store-products?${qs}`);
    if (seq !== listSeq.current) return; // a newer request superseded this one
    if (status >= 400 || data.error) setListError(data.error || t("products.eneezam.errorGeneric"));
    setItems(Array.isArray(data.items) ? data.items : []);
    setTotal(Number(data.total) || 0);
    if (data.catalog_source) setCatalogSource(data.catalog_source);
    setPendingTotal((Array.isArray(data.items) ? data.items : []).reduce((s, p) => s + (p.pending_images || 0) + (p.failed_images || 0), 0));
    setLoading(false);
  };

  useEffect(() => { setPage(1); }, [search, statusFilter]);
  useEffect(() => { if (storeId) loadList(); }, [storeId, search, statusFilter, page]);

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  // ---------- image mirror loop (shared by the page button and the copy modal) ----------
  const runMirrorLoop = async ({ retryFailed = false, shouldContinue = () => true, onProgress }) => {
    let mirrored = 0, failed = 0, remaining = 0, totalImgs = null, first = true;
    while (shouldContinue()) {
      const body = { store_id: storeId };
      if (first && retryFailed) body.retry_failed = true;
      const { status, data } = await api("/mirror-store-product-images", { method: "POST", body: JSON.stringify(body) });
      if (status >= 400 || data.error) return { error: data.error || t("products.eneezam.errorGeneric"), mirrored, failed, remaining };
      mirrored += data.mirrored_images || 0;
      failed += data.failed_images || 0;
      remaining = data.remaining_pending || 0;
      if (totalImgs === null) totalImgs = remaining + mirrored + failed;
      onProgress?.({ done: mirrored + failed, total: Math.max(totalImgs, mirrored + failed + remaining), mirrored, failed, remaining });
      first = false;
      if (remaining === 0) break;
      if ((data.processed_products || 0) === 0 && (data.mirrored_images || 0) === 0) break; // no-progress guard
    }
    if (mirrored || failed) logActivity("product_images_mirror", { mirrored, failed, remaining });
    return { mirrored, failed, remaining };
  };

  const [mirrorState, setMirrorState] = useState(null); // {running, done, total, result?, error?}
  const runPageMirror = async () => {
    setMirrorState({ running: true, done: 0, total: 0 });
    const res = await runMirrorLoop({ retryFailed: true, onProgress: (p) => setMirrorState({ running: true, ...p }) });
    setMirrorState({ running: false, ...res });
    loadList();
  };

  // ---------- storefront source switch ----------
  const [confirmSource, setConfirmSource] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const doSwitchSource = async () => {
    const target = confirmSource;
    setSwitching(true);
    setSourceError("");
    const { status, data } = await api("/set-catalog-source", { method: "POST", body: JSON.stringify({ store_id: storeId, catalog_source: target }) });
    setSwitching(false);
    setConfirmSource(null);
    if (status >= 400 || data.error || !data.success) { setSourceError(data.error || t("products.eneezam.errorGeneric")); return; }
    setCatalogSource(data.catalog_source || target);
    logActivity("catalog_source_switch", { catalog_source: data.catalog_source || target });
  };

  // ---------- delete ----------
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const doDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    const { status, data } = await api("/delete-store-product", { method: "POST", body: JSON.stringify({ store_id: storeId, id: deleteTarget.id }) });
    setDeleting(false);
    if (status >= 400 || data.error || !data.success) { setDeleteError(data.error || t("products.eneezam.errorGeneric")); return; }
    logActivity("product_delete", { product_id: deleteTarget.id, title: deleteTarget.title, source: "eneezam", removed_files: data.removed_files ?? 0 });
    setDeleteTarget(null);
    loadList();
  };

  // ---------- bulk Neezi (selected products, one at a time so each result is checked) ----------
  const [picked, setPicked] = useState(new Set());
  const [bulk, setBulk] = useState(null); // { kind, done, total, ok, failed, log: [] }
  const [bulkStyle, setBulkStyle] = useState("studio");
  const [bulkMain, setBulkMain] = useState(false);
  const togglePick = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const productPayload = (p, patch = {}) => ({
    id: p.id, title: p.title, description_html: p.description_html || undefined, description: p.description, status: p.status, vendor: p.vendor, product_type: p.product_type, tags: p.tags,
    images: (p.images || []).map(normalizeImage), options: p.options || [], details: p.details || {}, variants: p.variants, ...patch,
  });
  const runBulk = async (kind) => {
    const list = items.filter((p) => picked.has(p.id));
    if (!list.length) return;
    const state = { kind, done: 0, total: list.length, ok: 0, failed: 0, log: [] };
    setBulk({ ...state });
    for (const p of list) {
      let line;
      if (kind === "copy") {
        const { data } = await api("/growth/neezi-product-copy", { method: "POST", body: JSON.stringify({ store_id: storeId, product: { title: p.title, description: p.description, vendor: p.vendor, product_type: p.product_type, tags: p.tags, variants: p.variants } }) });
        if (data.copy) {
          const c = data.copy;
          const save = await api("/save-store-product", { method: "POST", body: JSON.stringify({ store_id: storeId, product: productPayload(p, { title: c.title, description_html: c.description_html, details: { ...(p.details || {}), ...c.details } }) }) });
          if (save.data?.product) { state.ok++; line = `✓ ${c.title}`; } else { state.failed++; line = `✗ ${p.title}: ${save.data?.error || "save failed"}`; }
        } else { state.failed++; line = `✗ ${p.title}: ${data.error || "Neezi failed"}`; }
      } else {
        const ref = (p.images || [])[0];
        const { data } = await api("/growth/neezi-product-photo", { method: "POST", body: JSON.stringify({ store_id: storeId, image_url: typeof ref === "string" ? ref : ref?.url, title: p.title, style: bulkStyle }) });
        if (data.url) {
          const img = { url: data.url, source_url: null, mirrored: true, alt: p.title, error: null };
          const imgs = (p.images || []).map(normalizeImage);
          const save = await api("/save-store-product", { method: "POST", body: JSON.stringify({ store_id: storeId, product: productPayload(p, { images: bulkMain ? [img, ...imgs] : [...imgs, img] }) }) });
          if (save.data?.product) { state.ok++; line = `✓ ${p.title}`; } else { state.failed++; line = `✗ ${p.title}: ${save.data?.error || "save failed"}`; }
        } else { state.failed++; line = `✗ ${p.title}: ${data.error || "photo failed"}`; }
      }
      state.done++;
      state.log = [line, ...state.log].slice(0, 30);
      setBulk({ ...state });
    }
    setBulk({ ...state, finished: true });
    logActivity(kind === "copy" ? "neezi_bulk_copy" : "neezi_bulk_photos", { ok: state.ok, failed: state.failed });
    loadList();
  };

  // ---------- add / edit form ----------
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [listOn, setListOn] = useState("eneezam");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [imgBusy, setImgBusy] = useState(""); // "" | "upload" | "ai-<i>" | "webp-<i>"
  const [imgNote, setImgNote] = useState("");
  const fileRef = useRef(null);
  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const savedImg = (url) => ({ url, source_url: null, mirrored: true, alt: "", error: null });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setListOn("eneezam"); setNewImageUrl(""); setFormError(""); setFormOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      title: p.title || "", description: p.description || "", vendor: p.vendor || "", product_type: p.product_type || "",
      tags: (p.tags || []).join(", "), status: p.status || "draft",
      images: (p.images || []).map(normalizeImage),
      variants: (p.variants && p.variants.length ? p.variants : [emptyVariant()]).map((v) => ({
        id: v.id, title: v.title || "", price: v.price ?? "", compare_at_price: v.compare_at_price ?? "", sku: v.sku || "", inventory_quantity: v.inventory_quantity ?? "",
      })),
    });
    setListOn("eneezam");
    setNewImageUrl("");
    setFormError("");
    setFormOpen(true);
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setVariant = (i, k, v) => setForm((f) => ({ ...f, variants: f.variants.map((row, j) => (j === i ? { ...row, [k]: v } : row)) }));
  const moveImage = (i, dir) => setForm((f) => {
    const imgs = [...f.images]; const j = i + dir;
    if (j < 0 || j >= imgs.length) return f;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    return { ...f, images: imgs };
  });
  const addImage = () => {
    const url = newImageUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) { setFormError(t("products.eneezam.imageUrlInvalid")); return; }
    setForm((f) => ({ ...f, images: [...f.images, { url, source_url: null, mirrored: false, alt: "", error: null }] }));
    setNewImageUrl("");
    setFormError("");
  };

  // Upload from the computer: the worker resizes and saves every picture as WebP (images.js in the worker).
  const uploadFiles = async (files) => {
    const list = [...(files || [])].slice(0, 10);
    if (!list.length) return;
    setImgBusy("upload"); setFormError(""); setImgNote("");
    const { data: { session } } = await supabase.auth.getSession();
    let before = 0, after = 0, added = 0;
    for (const file of list) {
      const res = await fetch(`${cfUrl}/growth/upload-image?store_id=${storeId}&kind=product`, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": file.type || "image/jpeg" }, body: file });
      let d = {}; try { d = await res.json(); } catch { /* */ }
      if (!d.url) { setFormError(d.error || `Upload failed (HTTP ${res.status})`); break; }
      before += d.before || file.size; after += d.after || file.size; added++;
      setForm((f) => ({ ...f, images: [...f.images, savedImg(d.url)] }));
    }
    if (added) setImgNote(`${added} picture${added > 1 ? "s" : ""} saved as WebP: ${kb(before)} → ${kb(after)}`);
    setImgBusy("");
    if (fileRef.current) fileRef.current.value = "";
  };
  // Neezi photo (Agnes, Grow/Advance): a clean studio shot made from this picture; added as a new image.
  const aiPhoto = async (i, style = "studio") => {
    setImgBusy(`ai-${i}`); setFormError(""); setImgNote("Neezi is designing a studio photo (about 20 to 60 seconds)…");
    const { data } = await api("/growth/neezi-product-photo", { method: "POST", body: JSON.stringify({ store_id: storeId, image_url: form.images[i]?.url, title: form.title, style }) });
    if (data.url) { setForm((f) => ({ ...f, images: [...f.images, savedImg(data.url)] })); setImgNote(`Neezi photo added (WebP, ${kb(data.after || 0)}). Move it up to make it the main picture.`); }
    else { setImgNote(""); setFormError(data.error || "Neezi could not make the photo"); }
    setImgBusy("");
  };
  // Convert an existing (Shopify / external / PNG) picture to a WebP copy in eNeezam storage.
  const toWebp = async (i) => {
    setImgBusy(`webp-${i}`); setFormError(""); setImgNote("");
    const { data } = await api("/growth/convert-image", { method: "POST", body: JSON.stringify({ store_id: storeId, url: form.images[i]?.url, kind: "product" }) });
    if (data.url) { setForm((f) => ({ ...f, images: f.images.map((img, j) => (j === i ? { ...img, ...savedImg(data.url), alt: img.alt } : img)) })); setImgNote(`Converted to WebP: ${kb(data.before || 0)} → ${kb(data.after || 0)}`); }
    else setFormError(data.error || "Could not convert this picture");
    setImgBusy("");
  };

  const validate = () => {
    if (!form.title.trim()) return t("products.eneezam.titleRequired");
    if (!form.variants.length) return t("products.eneezam.variantRequired");
    for (const v of form.variants) {
      const price = Number(v.price);
      if (v.price === "" || !Number.isFinite(price) || price < 0) return t("products.eneezam.priceInvalid");
      if (v.compare_at_price !== "" && (!Number.isFinite(Number(v.compare_at_price)) || Number(v.compare_at_price) < 0)) return t("products.eneezam.priceInvalid");
    }
    return "";
  };

  const tagsArray = () => form.tags.split(",").map((s) => s.trim()).filter(Boolean);

  const saveForm = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError("");
    try {
      if (!editing && listOn === "shopify") {
        // Same /shopify-product-create payload shape as the existing "New product" flow;
        // multiple variants become a single "Variant" option titled by each variant's title.
        const multi = form.variants.length > 1;
        const productPayload = {
          title: form.title.trim(),
          vendor: form.vendor.trim() || undefined,
          product_type: form.product_type.trim() || undefined,
          tags: tagsArray().join(", ") || undefined,
          body_html: form.description.trim() || undefined,
          status: form.status,
          images: form.images.map((img) => ({ src: img.url })).filter((i) => i.src),
          variants: form.variants.map((v, i) => ({
            price: String(v.price || "0"),
            compare_at_price: v.compare_at_price === "" ? undefined : String(v.compare_at_price),
            sku: v.sku.trim() || undefined,
            ...(multi ? { option1: v.title.trim() || `${t("products.eneezam.variantTitle")} ${i + 1}` } : {}),
          })),
        };
        if (multi) productPayload.options = [{ name: "Variant" }];
        const { status, data } = await api("/shopify-product-create", { method: "POST", body: JSON.stringify({ store_id: storeId, product: productPayload }) });
        if (status >= 400 || data.error || !data.product) { setFormError(data.error || t("products.eneezam.errorGeneric")); setSaving(false); return; }
        const row = { store_id: storeId, shopify_product_id: String(data.product.id), raw_data: data.product, synced_at: new Date().toISOString() };
        if (eneezamId) { try { await upsertProduct(eneezamId, row); } catch { /* local cache is best-effort */ } }
        logActivity("product_create", { shopify_product_id: row.shopify_product_id, variant_count: form.variants.length, list_on: "shopify" });
        setFormOpen(false);
        setSaving(false);
        return;
      }

      const product = {
        ...(editing ? { id: editing.id } : {}),
        title: form.title.trim(),
        description: form.description,
        vendor: form.vendor.trim(),
        product_type: form.product_type.trim(),
        tags: tagsArray(),
        status: form.status,
        images: form.images.map(normalizeImage),
        variants: form.variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          title: v.title.trim(),
          price: Number(v.price),
          compare_at_price: v.compare_at_price === "" ? null : Number(v.compare_at_price),
          sku: v.sku.trim(),
          inventory_quantity: v.inventory_quantity === "" ? 0 : parseInt(v.inventory_quantity, 10) || 0,
        })),
      };
      const { status, data } = await api("/save-store-product", { method: "POST", body: JSON.stringify({ store_id: storeId, product }) });
      if (status >= 400 || data.error || !data.product) { setFormError(data.error || t("products.eneezam.errorGeneric")); setSaving(false); return; }
      logActivity(editing ? "product_update" : "product_create", { product_id: data.product.id, title: data.product.title, source: "eneezam" });
      setFormOpen(false);
      loadList();
    } catch (ex) {
      setFormError(ex.message);
    }
    setSaving(false);
  };

  // ---------- copy from Shopify ----------
  const [copyOpen, setCopyOpen] = useState(false);
  const copyOpenRef = useRef(false);
  const [cands, setCands] = useState([]);
  const [candTotal, setCandTotal] = useState(0);
  const [candPage, setCandPage] = useState(1);
  const [candSearchInput, setCandSearchInput] = useState("");
  const candSearch = useDebounced(candSearchInput);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState(null);
  const [lastCopyPayload, setLastCopyPayload] = useState(null);
  const [copyMirror, setCopyMirror] = useState(null);

  const candSeq = useRef(0);
  const loadCands = async () => {
    const seq = ++candSeq.current;
    setCandLoading(true);
    setCandError("");
    const qs = new URLSearchParams({ store_id: storeId, search: candSearch, page: String(candPage), limit: String(LIMIT) });
    const { status, data } = await api(`/copy-candidates?${qs}`);
    if (seq !== candSeq.current) return;
    if (status >= 400 || data.error) setCandError(data.error || t("products.eneezam.errorGeneric"));
    setCands(Array.isArray(data.items) ? data.items : []);
    setCandTotal(Number(data.total) || 0);
    setCandLoading(false);
  };
  useEffect(() => { setCandPage(1); setSelectAll(false); setSelected(new Set()); }, [candSearch]);
  useEffect(() => { if (copyOpen) loadCands(); }, [copyOpen, candSearch, candPage]);

  const openCopy = () => {
    setCopyResult(null); setCopyMirror(null); setSelected(new Set()); setSelectAll(false);
    setCandSearchInput(""); setCandPage(1); copyOpenRef.current = true; setCopyOpen(true);
  };
  const closeCopy = () => { copyOpenRef.current = false; setCopyOpen(false); loadList(); };

  const toggleCand = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const candPages = Math.max(1, Math.ceil(candTotal / LIMIT));
  const selectedCount = selectAll ? candTotal : selected.size;

  const doCopy = async (payload) => {
    setCopying(true);
    setCopyResult(null);
    setLastCopyPayload(payload);
    const { status, data } = await api("/copy-from-shopify", { method: "POST", body: JSON.stringify({ store_id: storeId, ...payload }) });
    setCopying(false);
    if (status >= 400 || data.error) { setCopyResult({ error: data.error || t("products.eneezam.errorGeneric") }); return; }
    setCopyResult(data);
    logActivity("product_copy_from_shopify", { copied: data.copied || 0, skipped: data.skipped || 0, failed: data.failed || 0, all: !!payload.all });
    setSelected(new Set());
    setSelectAll(false);
    loadCands();
    loadList();
    if ((data.copied || 0) > 0) {
      setCopyMirror({ running: true, done: 0, total: 0 });
      const res = await runMirrorLoop({ shouldContinue: () => copyOpenRef.current, onProgress: (p) => setCopyMirror({ running: true, ...p }) });
      setCopyMirror({ running: false, ...res });
      loadList();
    }
  };

  // ---------- styles ----------
  const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12 };
  const input = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 12.5, boxSizing: "border-box" };
  const btn = (primary) => ({ padding: "7px 14px", borderRadius: 8, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });
  const pill = (bg, fg) => ({ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" });
  const statusPill = (s) => s === "active" ? pill("var(--ne-success-soft)", "var(--ne-success)") : s === "draft" ? pill("var(--ne-warning-soft)", "var(--ne-warning)") : pill("var(--ne-surface)", "var(--ne-muted)");
  const label = { fontSize: 11, color: "var(--ne-muted)", fontWeight: 700, display: "block", marginBottom: 4 };
  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000, padding: 12 };
  const modal = { ...card, width: 720, maxWidth: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" };
  const thumb = (src, size = 44) => src
    ? <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "cover", borderRadius: 8, background: "var(--ne-surface)", flexShrink: 0 }} loading="lazy" />
    : <div style={{ width: size, height: size, borderRadius: 8, background: "var(--ne-surface)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ne-muted-2)" }}><Icon name="products" size={16} /></div>;

  const imageStatus = (p) => {
    if (!p.image_count) return <span style={pill("var(--ne-surface)", "var(--ne-muted)")}>{t("products.eneezam.noImages")}</span>;
    return (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        {p.pending_images > 0
          ? <span style={pill("var(--ne-warning-soft)", "var(--ne-warning)")}>{fmt(t, "products.eneezam.imagesPending", { n: p.pending_images })}</span>
          : <span style={pill("var(--ne-success-soft)", "var(--ne-success)")}>{t("products.eneezam.imagesSaved")}</span>}
        {p.failed_images > 0 && <span style={pill("var(--ne-danger-soft)", "var(--ne-danger)")}>{fmt(t, "products.eneezam.imagesFailed", { n: p.failed_images })}</span>}
      </span>
    );
  };
  const priceRange = (min, max) => (min === null || min === undefined ? "" : min === max || max === null || max === undefined ? money(min) : `${money(min)} – ${money(max)}`);

  return (
    <div style={{ color: "var(--ne-text)" }}>
      {/* header: storefront source + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {hasShopify ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--ne-muted)", fontWeight: 700 }}>{t("products.eneezam.storefrontShows")}</span>
          <div style={{ display: "inline-flex", border: "1px solid var(--ne-border)", borderRadius: 9, overflow: "hidden" }}>
            {["shopify", "eneezam"].map((src) => (
              <button key={src} type="button" disabled={switching}
                onClick={() => { if (src !== catalogSource) { setSourceError(""); setConfirmSource(src); } }}
                style={{ padding: "6px 14px", border: "none", fontSize: 11.5, fontWeight: 700, cursor: src === catalogSource ? "default" : "pointer", background: src === catalogSource ? "var(--ne-accent-soft)" : "transparent", color: src === catalogSource ? "var(--ne-accent)" : "var(--ne-muted)" }}>
                {src === "shopify" ? t("products.eneezam.sourceShopify") : t("products.eneezam.sourceEneezam")}
              </button>
            ))}
          </div>
        </div> : <span style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>Products you add here sell on your store{storeUrl ? ` (${storeUrl.replace("https://", "")})` : ""}. Set them to Active to show them.</span>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {pendingTotal > 0 && (
            <button type="button" onClick={runPageMirror} disabled={mirrorState?.running} style={btn(false)}>
              <Icon name="upload" size={12} /> {mirrorState?.running ? fmt(t, "products.eneezam.savingImages", { done: mirrorState.done || 0, total: mirrorState.total || 0 }) : t("products.eneezam.saveImages")}
            </button>
          )}
          {hasShopify && <button type="button" onClick={openCopy} style={btn(false)}><Icon name="download" size={12} /> {t("products.eneezam.copyFromShopify")}</button>}
          <button type="button" onClick={openAdd} style={btn(true)}><Icon name="plus" size={12} /> {t("products.eneezam.addProduct")}</button>
        </div>
      </div>
      {sourceError && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: "0 0 10px" }}>{sourceError}</p>}
      {mirrorState && !mirrorState.running && (
        <p style={{ fontSize: 12, margin: "0 0 10px", color: mirrorState.error ? "var(--ne-danger)" : "var(--ne-muted)" }}>
          {mirrorState.error || fmt(t, "products.eneezam.imagesDone", { mirrored: mirrorState.mirrored || 0, failed: mirrorState.failed || 0 })}
        </p>
      )}

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("products.eneezam.searchPlaceholder")} style={{ ...input, flex: "1 1 220px" }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...input, flex: "0 0 auto" }}>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`products.eneezam.status.${s}`)}</option>)}
        </select>
      </div>

      {listError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{listError}</p>}

      {/* bulk bar */}
      {picked.size > 0 && (
        <div style={{ ...card, padding: "10px 12px", marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 12.5 }}>{picked.size} selected</b>
          <button type="button" style={btn(true)} disabled={!!bulk && !bulk.finished} onClick={() => runBulk("copy")}><Icon name="sparkle" size={12} /> Neezi: write listings</button>
          <select value={bulkStyle} onChange={(e) => setBulkStyle(e.target.value)} style={{ ...input, padding: "6px 8px" }} title="One style for all, so the store looks like one brand">
            {[["studio", "Clean studio"], ["pastel", "Pastel colour"], ["lifestyle", "Lifestyle"], ["dark", "Dark tech"], ["marble", "Marble luxury"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label style={{ fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={bulkMain} onChange={(e) => setBulkMain(e.target.checked)} /> make it the main photo</label>
          <button type="button" style={btn(false)} disabled={!!bulk && !bulk.finished} onClick={() => runBulk("photo")}><Icon name="sparkle" size={12} /> Neezi: brand photos</button>
          <button type="button" style={btn(false)} onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}
      {bulk && (
        <div style={{ ...card, padding: 12, marginBottom: 10, fontSize: 12.5, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><b>{bulk.kind === "copy" ? "Neezi is writing listings" : "Neezi is making brand photos"} · {bulk.done}/{bulk.total}</b><span>{bulk.ok} done{bulk.failed ? ` · ${bulk.failed} failed` : ""}{bulk.finished ? " · finished" : ""}</span></div>
          <div style={{ height: 6, borderRadius: 99, background: "var(--ne-border)", overflow: "hidden" }}><div style={{ width: `${Math.round((bulk.done / Math.max(1, bulk.total)) * 100)}%`, height: "100%", background: "var(--ne-grad)", transition: "width .4s" }} /></div>
          <div style={{ maxHeight: 120, overflowY: "auto", color: "var(--ne-muted)" }}>{bulk.log.map((l, i) => <div key={i}>{l}</div>)}</div>
          {bulk.finished && <div><button type="button" style={btn(false)} onClick={() => { setBulk(null); setPicked(new Set()); }}>Close</button></div>}
        </div>
      )}

      {/* list: same card layout as the Shopify products tab, edited in place */}
      {loading ? (
        <p style={{ ...card, padding: 16, margin: 0, fontSize: 12.5, color: "var(--ne-muted)" }}>{t("products.eneezam.loading")}</p>
      ) : items.length === 0 ? (
        <p style={{ ...card, padding: 20, margin: 0, fontSize: 12.5, color: "var(--ne-muted)", textAlign: "center" }}>{t("products.eneezam.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12, color: "var(--ne-muted)", display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={items.length > 0 && items.every((p) => picked.has(p.id))} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((p) => p.id)) : new Set())} /> Select all on this page</label>
          {items.map((p) => (
            <EneezamProductCard key={`${p.id}-${p.updated_at}`} p={p} isMobile={isMobile} storeUrl={storeUrl}
              allSkus={new Set(items.flatMap((x) => (x.variants || []).map((v) => v.sku).filter(Boolean)))}
              selected={picked.has(p.id)} onSelect={() => togglePick(p.id)} onOpen={() => openEdit(p)}
              onDelete={() => { setDeleteError(""); setDeleteTarget(p); }}
              onSave={async (prod, patch) => {
                const { data } = await api("/save-store-product", { method: "POST", body: JSON.stringify({ store_id: storeId, product: productPayload(prod, patch) }) });
                if (!data?.product) return { error: data?.error || "Could not save" };
                logActivity("product_update", { product_id: prod.id, title: data.product.title, source: "eneezam", inline: true });
                setItems((list) => list.map((x) => (x.id === prod.id ? data.product : x)));
                return {};
              }} />
          ))}
        </div>
      )}

      {total > LIMIT && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)} style={btn(false)}>{t("products.eneezam.prev")}</button>
          <span style={{ color: "var(--ne-muted)" }}>{fmt(t, "products.eneezam.pageOf", { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)} style={btn(false)}>{t("products.eneezam.next")}</button>
        </div>
      )}

      {/* switch confirm */}
      {confirmSource && (
        <div style={overlay}>
          <div style={{ ...card, width: 420, maxWidth: "100%", padding: 20 }}>
            <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.6 }}>
              {confirmSource === "eneezam" ? t("products.eneezam.switchConfirmEneezam") : t("products.eneezam.switchConfirmShopify")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmSource(null)} disabled={switching} style={btn(false)}>{t("products.eneezam.cancel")}</button>
              <button type="button" onClick={doSwitchSource} disabled={switching} style={btn(true)}>{switching ? t("products.eneezam.saving") : t("products.eneezam.switchConfirm")}</button>
            </div>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {deleteTarget && (
        <div style={overlay}>
          <div style={{ ...card, width: 420, maxWidth: "100%", padding: 20 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6 }}>{fmt(t, "products.eneezam.deleteConfirm", { title: deleteTarget.title })}</p>
            {deleteError && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: "0 0 10px" }}>{deleteError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} style={btn(false)}>{t("products.eneezam.cancel")}</button>
              <button type="button" onClick={doDelete} disabled={deleting} style={{ ...btn(true), background: "var(--ne-danger)" }}>{deleting ? t("products.eneezam.saving") : t("products.eneezam.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {/* add / edit: Shopify-style editor for eNeezam products */}
      {formOpen && (editing || listOn === "eneezam") && (
        <ProductEditor storeId={storeId} cfUrl={cfUrl} product={editing}
          onClose={() => { setFormOpen(false); loadList(); }}
          onSaved={(p) => { logActivity(editing ? "product_update" : "product_create", { product_id: p.id, title: p.title, source: "eneezam" }); setEditing(p); loadList(); }}
          onListOnShopify={hasShopify ? () => setListOn("shopify") : null} />
      )}
      {/* new product listed on Shopify (old form) */}
      {formOpen && !editing && listOn === "shopify" && (
        <div style={overlay}>
          <form onSubmit={saveForm} style={modal}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>{editing ? t("products.eneezam.formEditTitle") : t("products.eneezam.formAddTitle")}</h3>
              <button type="button" onClick={() => setFormOpen(false)} style={{ background: "none", border: "none", color: "var(--ne-muted)", cursor: "pointer" }} aria-label={t("products.eneezam.close")}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 12 }}>
              {!editing && (
                <div>
                  <span style={label}>{t("products.eneezam.listOn")}</span>
                  <div style={{ display: "inline-flex", border: "1px solid var(--ne-border)", borderRadius: 9, overflow: "hidden" }}>
                    {["eneezam", "shopify"].map((dest) => (
                      <button key={dest} type="button" onClick={() => setListOn(dest)}
                        style={{ padding: "6px 14px", border: "none", fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: listOn === dest ? "var(--ne-accent-soft)" : "transparent", color: listOn === dest ? "var(--ne-accent)" : "var(--ne-muted)" }}>
                        {dest === "shopify" ? t("products.eneezam.sourceShopify") : t("products.eneezam.sourceEneezam")}
                      </button>
                    ))}
                  </div>
                  {listOn === "shopify" && <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("products.eneezam.listOnShopifyHint")}</p>}
                </div>
              )}
              <div>
                <label style={label}>{t("products.eneezam.fieldTitle")}</label>
                <input value={form.title} onChange={(e) => setField("title", e.target.value)} style={{ ...input, width: "100%" }} />
              </div>
              <div>
                <label style={label}>{t("products.eneezam.fieldDescription")}</label>
                <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={4} style={{ ...input, width: "100%", resize: "vertical", fontFamily: "inherit" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div><label style={label}>{t("products.eneezam.fieldVendor")}</label><input value={form.vendor} onChange={(e) => setField("vendor", e.target.value)} style={{ ...input, width: "100%" }} /></div>
                <div><label style={label}>{t("products.eneezam.fieldType")}</label><input value={form.product_type} onChange={(e) => setField("product_type", e.target.value)} style={{ ...input, width: "100%" }} /></div>
                <div>
                  <label style={label}>{t("products.eneezam.fieldStatus")}</label>
                  <select value={form.status} onChange={(e) => setField("status", e.target.value)} style={{ ...input, width: "100%" }}>
                    {["active", "draft", "archived"].map((s) => <option key={s} value={s}>{t(`products.eneezam.status.${s}`)}</option>)}
                  </select>
                </div>
              </div>
              <div><label style={label}>{t("products.eneezam.fieldTags")}</label><input value={form.tags} onChange={(e) => setField("tags", e.target.value)} style={{ ...input, width: "100%" }} /></div>

              {/* images */}
              <div>
                <span style={label}>{t("products.eneezam.fieldImages")}</span>
                <div style={{ display: "grid", gap: 6 }}>
                  {form.images.map((img, i) => (
                    <div key={`${img.url}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {thumb(img.url, 40)}
                      <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: 11.5, color: "var(--ne-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.url}</span>
                      <span style={img.mirrored ? pill("var(--ne-success-soft)", "var(--ne-success)") : pill("var(--ne-surface)", "var(--ne-muted)")}>{img.mirrored ? t("products.eneezam.imageSaved") : t("products.eneezam.imageExternal")}</span>
                      {!/\.webp(\?|$)/i.test(img.url) && <button type="button" onClick={() => toWebp(i)} disabled={!!imgBusy} style={btn(false)} title="Make a small WebP copy in eNeezam">{imgBusy === `webp-${i}` ? "…" : "WebP"}</button>}
                      <button type="button" onClick={() => aiPhoto(i)} disabled={!!imgBusy} style={btn(false)} title="Neezi studio photo (Grow and Advance plans)"><Icon name="sparkle" size={11} /> {imgBusy === `ai-${i}` ? "Designing…" : "Neezi photo"}</button>
                      <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} style={btn(false)} aria-label={t("products.eneezam.moveUp")}><Icon name="arrowUp" size={11} /></button>
                      <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} style={btn(false)} aria-label={t("products.eneezam.moveDown")}><Icon name="arrowDown" size={11} /></button>
                      <button type="button" onClick={() => setField("images", form.images.filter((_, j) => j !== i))} style={{ ...btn(false), color: "var(--ne-danger)" }} aria-label={t("products.eneezam.remove")}><Icon name="close" size={11} /></button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder={t("products.eneezam.imageUrlPlaceholder")} style={{ ...input, flex: 1 }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImage(); } }} />
                    <button type="button" onClick={addImage} style={btn(false)}><Icon name="plus" size={11} /> {t("products.eneezam.addImage")}</button>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={!!imgBusy} style={btn(true)}><Icon name="upload" size={11} /> {imgBusy === "upload" ? "Uploading…" : "Upload"}</button>
                  </div>
                  {imgNote && <div style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{imgNote}</div>}
                </div>
              </div>

              {/* variants */}
              <div>
                <span style={label}>{t("products.eneezam.fieldVariants")}</span>
                <div style={{ display: "grid", gap: 8 }}>
                  {form.variants.map((v, i) => (
                    <div key={v.id || `new-${i}`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr)) auto", gap: 6, alignItems: "end", padding: 8, border: "1px solid var(--ne-border)", borderRadius: 9 }}>
                      <div><label style={label}>{t("products.eneezam.variantTitle")}</label><input value={v.title} onChange={(e) => setVariant(i, "title", e.target.value)} style={{ ...input, width: "100%" }} /></div>
                      <div><label style={label}>{t("products.eneezam.price")}</label><input type="number" min="0" step="any" value={v.price} onChange={(e) => setVariant(i, "price", e.target.value)} style={{ ...input, width: "100%" }} /></div>
                      <div><label style={label}>{t("products.eneezam.compareAt")}</label><input type="number" min="0" step="any" value={v.compare_at_price} onChange={(e) => setVariant(i, "compare_at_price", e.target.value)} style={{ ...input, width: "100%" }} /></div>
                      <div><label style={label}>{t("products.eneezam.sku")}</label><input value={v.sku} onChange={(e) => setVariant(i, "sku", e.target.value)} style={{ ...input, width: "100%" }} /></div>
                      <div><label style={label}>{t("products.eneezam.inventory")}</label><input type="number" step="1" value={v.inventory_quantity} onChange={(e) => setVariant(i, "inventory_quantity", e.target.value)} style={{ ...input, width: "100%" }} /></div>
                      <button type="button" disabled={form.variants.length <= 1} onClick={() => setField("variants", form.variants.filter((_, j) => j !== i))} style={{ ...btn(false), color: "var(--ne-danger)" }} aria-label={t("products.eneezam.remove")}><Icon name="trash" size={11} /></button>
                    </div>
                  ))}
                  <div><button type="button" onClick={() => setField("variants", [...form.variants, emptyVariant()])} style={btn(false)}><Icon name="plus" size={11} /> {t("products.eneezam.addVariant")}</button></div>
                </div>
              </div>
              {formError && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: 0 }}>{formError}</p>}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setFormOpen(false)} disabled={saving} style={btn(false)}>{t("products.eneezam.cancel")}</button>
              <button type="submit" disabled={saving} style={btn(true)}><Icon name="check" size={12} /> {saving ? t("products.eneezam.saving") : t("products.eneezam.save")}</button>
            </div>
          </form>
        </div>
      )}

      {/* copy from Shopify */}
      {copyOpen && (
        <div style={overlay}>
          <div style={modal}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>{t("products.eneezam.copyTitle")}</h3>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("products.eneezam.copyHint")}</p>
              </div>
              <button type="button" onClick={closeCopy} style={{ background: "none", border: "none", color: "var(--ne-muted)", cursor: "pointer" }} aria-label={t("products.eneezam.close")}><Icon name="close" size={14} /></button>
            </div>
            <div style={{ padding: "12px 18px", display: "grid", gap: 8, borderBottom: "1px solid var(--ne-border)" }}>
              <input value={candSearchInput} onChange={(e) => setCandSearchInput(e.target.value)} placeholder={t("products.eneezam.searchPlaceholder")} style={{ ...input, width: "100%" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                {selectAll ? (
                  <>
                    <span style={{ fontWeight: 700 }}>{fmt(t, "products.eneezam.allSelected", { n: candTotal })}</span>
                    <button type="button" onClick={() => setSelectAll(false)} style={btn(false)}>{t("products.eneezam.clearSelection")}</button>
                  </>
                ) : (
                  <>
                    <button type="button" disabled={!candTotal} onClick={() => { setSelected(new Set()); setSelectAll(true); }} style={btn(false)}>{t("products.eneezam.selectAll")}</button>
                    {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} style={btn(false)}>{t("products.eneezam.clearSelection")}</button>}
                  </>
                )}
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, minHeight: 120 }}>
              {candError && <p style={{ color: "var(--ne-danger)", fontSize: 12, padding: "10px 18px", margin: 0 }}>{candError}</p>}
              {candLoading ? (
                <p style={{ padding: 18, margin: 0, fontSize: 12.5, color: "var(--ne-muted)" }}>{t("products.eneezam.loading")}</p>
              ) : cands.length === 0 ? (
                <p style={{ padding: 18, margin: 0, fontSize: 12.5, color: "var(--ne-muted)" }}>{t("products.eneezam.noCandidates")}</p>
              ) : cands.map((c) => (
                <label key={c.shopify_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderTop: "1px solid var(--ne-border)", cursor: c.already_copied ? "default" : "pointer", opacity: c.already_copied ? 0.6 : 1 }}>
                  <input type="checkbox" disabled={c.already_copied} checked={c.already_copied ? false : (selectAll || selected.has(c.shopify_id))}
                    onChange={() => { if (!selectAll) toggleCand(c.shopify_id); }} style={{ accentColor: "#5C7CFA" }} />
                  {thumb(c.thumbnail, 36)}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ne-muted)", whiteSpace: "nowrap" }}>{priceRange(c.price_min, c.price_max)}</span>
                  {c.already_copied && <span style={pill("var(--ne-accent-soft)", "var(--ne-accent)")}>{t("products.eneezam.alreadyCopied")}</span>}
                </label>
              ))}
            </div>
            {candTotal > LIMIT && (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "8px 18px", fontSize: 12, borderTop: "1px solid var(--ne-border)" }}>
                <button type="button" disabled={candPage <= 1} onClick={() => setCandPage((x) => x - 1)} style={btn(false)}>{t("products.eneezam.prev")}</button>
                <span style={{ color: "var(--ne-muted)" }}>{fmt(t, "products.eneezam.pageOf", { page: candPage, pages: candPages })}</span>
                <button type="button" disabled={candPage >= candPages} onClick={() => setCandPage((x) => x + 1)} style={btn(false)}>{t("products.eneezam.next")}</button>
              </div>
            )}
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "grid", gap: 8 }}>
              {copyResult && (
                copyResult.error
                  ? <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: 0 }}>{copyResult.error}</p>
                  : <>
                      <p style={{ fontSize: 12, margin: 0 }}>{fmt(t, "products.eneezam.copyResult", { copied: copyResult.copied || 0, skipped: copyResult.skipped || 0, failed: copyResult.failed || 0 })}</p>
                      {copyResult.remaining_for_all > 0 && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <p style={{ fontSize: 12, margin: 0, color: "var(--ne-warning)" }}>{fmt(t, "products.eneezam.capHit", { n: copyResult.remaining_for_all })}</p>
                          {lastCopyPayload && <button type="button" disabled={copying} onClick={() => doCopy(lastCopyPayload)} style={btn(false)}>{t("products.eneezam.copyRemaining")}</button>}
                        </div>
                      )}
                    </>
              )}
              {copyMirror && (
                <p style={{ fontSize: 12, margin: 0, color: copyMirror.error ? "var(--ne-danger)" : "var(--ne-muted)" }}>
                  {copyMirror.error || (copyMirror.running
                    ? fmt(t, "products.eneezam.savingImages", { done: copyMirror.done || 0, total: copyMirror.total || 0 })
                    : fmt(t, "products.eneezam.imagesDone", { mirrored: copyMirror.mirrored || 0, failed: copyMirror.failed || 0 }))}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={closeCopy} style={btn(false)}>{t("products.eneezam.close")}</button>
                <button type="button" disabled={copying || selectedCount === 0}
                  onClick={() => doCopy(selectAll ? { all: true, search: candSearch } : { ids: [...selected] })}
                  style={{ ...btn(true), opacity: copying || selectedCount === 0 ? 0.6 : 1 }}>
                  {copying ? t("products.eneezam.copying") : fmt(t, "products.eneezam.copyN", { n: selectedCount })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
