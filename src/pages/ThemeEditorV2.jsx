import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { TEMPLATES } from "../lib/themeEditor/layout";
import { createHistory, pushState, undo, redo, canUndo, canRedo } from "../lib/themeEditor/history";
import { EDITOR_CSS, Dialog } from "../components/themeEditor/shell";
import { ProductMetaPanel } from "../components/themeEditor/SettingsPanels";
import Tree, { AddSectionPopup, SelectionMenu } from "../components/themeEditorV2/Tree";
import { SchemaFields, ThemeSettingsV2 } from "../components/themeEditorV2/SchemaForm";
import * as V2 from "../lib/themeV2/engine.generated";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const TOKEN_REFRESH_MS = 15 * 60 * 1000; // the worker's edit token lives 20 minutes
const PREVIEW_DEBOUNCE_MS = 250;

// v2 theme editor (theme packages such as Nova): section groups with blocks, schema-generated settings and an inspector
// in the live preview (hover outline, click to select). The draft lives in an undo/redo history; every change reaches
// the preview over postMessage, where the storefront renders it on the server. The edit token is sent over postMessage
// after the preview says it is ready, never in the iframe URL. Save writes the whole theme_config through
// PUT /update-store-theme (the worker validates it against the same schema).

const V2_CSS = `
.te2-row.hov{background:var(--ne-surface-2);outline:1px dashed var(--ne-accent);outline-offset:-1px}
.te2-grip{color:var(--ne-muted-2);cursor:grab;display:inline-flex;width:16px;justify-content:center;flex:none}
.te2-ico{display:inline-flex;color:var(--ne-muted);flex:none;margin-inline-end:2px}
.te2-name{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;background:transparent;border:none;padding:8px 0;color:var(--ne-text);text-align:start;font-size:13px;cursor:pointer;font-family:inherit}
.te2-title{font-weight:600;white-space:nowrap}
.te2-sum{color:var(--ne-muted);font-style:italic;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.te2-act{width:28px;height:28px;color:var(--ne-muted)}
.te2-act:hover:not(:disabled){color:var(--ne-text)}
.te2-menu{position:absolute;inset-inline-end:0;top:100%;z-index:40;min-width:184px;background:var(--ne-surface);border:1px solid var(--ne-border);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:5px 0}
.te2-menu button{width:100%;display:flex;align-items:center;gap:9px;padding:8px 12px;background:transparent;border:none;text-align:start;font-size:13px;color:var(--ne-text);cursor:pointer;font-family:inherit}
.te2-menu button:hover:not(:disabled){background:var(--ne-surface-2)}
.te2-menu button:disabled{opacity:.4;cursor:not-allowed}
.te2-menu button.danger{color:var(--ne-danger)}
.te2-sep{height:1px;background:var(--ne-border);margin:4px 0}
.te2-group{margin:0;padding:6px;font-size:11.5px;font-weight:700;color:var(--ne-muted);text-transform:uppercase;letter-spacing:.06em}
.te2-empty{margin:2px 8px 6px;font-size:12.5px;color:var(--ne-muted)}
.te2-addpop{position:absolute;inset:6px;z-index:45;background:var(--ne-surface);border:1px solid var(--ne-border);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden}
.te2-chip{padding:5px 11px;border-radius:20px;border:1px solid var(--ne-border);font-size:12px;font-weight:600;cursor:pointer;background:transparent;color:var(--ne-text);font-family:inherit}
.te2-chip[aria-pressed=true]{background:var(--ne-accent-soft);color:var(--ne-accent)}
.te2-crumbs{display:flex;align-items:center;gap:4px;min-width:0;flex:1;font-size:12px;color:var(--ne-muted);overflow:hidden;white-space:nowrap}
.te2-crumbs strong{color:var(--ne-text);font-size:14px;overflow:hidden;text-overflow:ellipsis}
.te2-crumbs button{background:none;border:none;padding:0;color:var(--ne-muted);cursor:pointer;font:inherit;text-decoration:underline}
.te2-banner{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:8px 16px;font-size:12.5px}
.te2-chipstate{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:3;padding:6px 12px;border-radius:20px;background:var(--ne-surface);border:1px solid var(--ne-border);font-size:12px;color:var(--ne-muted);box-shadow:0 6px 18px rgba(0,0,0,.2)}
.te2-skel{border-radius:10px;background:linear-gradient(90deg,var(--ne-surface-2),var(--ne-border),var(--ne-surface-2));background-size:200% 100%;animation:te2sk 1.2s linear infinite}
@keyframes te2sk{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.te2-skel{animation:none}}
.te-preview{position:relative}
`;

function Skeleton({ t }) {
  return (
    <div className="te-root" aria-busy="true">
      <style>{EDITOR_CSS + V2_CSS}</style>
      <div className="te-top"><div className="te2-skel" style={{ width: 180, height: 22 }} /><div className="te2-skel" style={{ width: 150, height: 30 }} /><div className="te2-skel" style={{ width: 160, height: 30, justifySelf: "end" }} /></div>
      <div className="te-body">
        <div className="te-panel" style={{ padding: 14, gap: 10, display: "flex", flexDirection: "column" }}>
          <span role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t("themeEditor.loading")}</span>
          {[70, 90, 80, 85, 60, 75].map((w, i) => <div key={i} className="te2-skel" style={{ width: `${w}%`, height: 30 }} />)}
        </div>
        <div className="te-preview"><div className="te2-skel" style={{ margin: 16, flex: 1, borderRadius: 14 }} /></div>
      </div>
    </div>
  );
}

export default function ThemeEditorV2({ storeId, themeId, onNavigate, onOpenThemeEditor, initialTheme }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const sl = useCallback((k) => V2.label(k, lang === "ur" ? "ur" : "en"), [lang]);
  const [profile, setProfile] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [hist, setHist] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [themeName, setThemeName] = useState("");
  const [status, setStatus] = useState("draft");
  const [products, setProducts] = useState([]);
  const [token, setToken] = useState(null);
  const [page, setPage] = useState("home");
  const [productHandle, setProductHandle] = useState("");
  const [metaProductId, setMetaProductId] = useState("");
  const [view, setView] = useState("sections"); // sections | theme | products
  const [sel, setSel] = useState(null); // { scope, sectionId, blockId }
  const [hov, setHov] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [device, setDevice] = useState("desktop");
  const [panelOpen, setPanelOpen] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const [addScope, setAddScope] = useState(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [preview, setPreview] = useState("loading"); // loading | ready | error
  const [previewErr, setPreviewErr] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [drag, setDrag] = useState(null); // tree drag and drop: { kind, scope, sectionId?, id, over, edge }
  const iframeRef = useRef(null);
  const pageMenuRef = useRef(null);
  const timer = useRef(null);
  const latest = useRef({});
  const pendingScroll = useRef(null);
  const counters = useRef({ added: 0, deleted: 0, duplicated: 0 });

  const draft = hist?.present ?? null;
  const readOnly = status === "published";
  const theme = useMemo(() => (draft ? V2.getTheme(draft.theme_id) : null), [draft]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user.id).single();
      setProfile(data || null);
    })();
  }, []);

  const logActivity = async (actionType, details) => {
    if (!profile || !store) return;
    try {
      await supabase.from("activity_log").insert({ store_id: store.id, user_id: profile.id, user_name: profile.full_name || profile.email, action_type: actionType, order_id: null, details: details || null });
    } catch (err) {
      console.log("logActivity error:", err.message);
    }
  };

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };

  /* ------------------------------------------------------------ load */
  useEffect(() => {
    if (!storeId || !themeId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { data: storeRow } = await supabase.from("stores").select("id, store_name, subdomain, store_custom_domains(domain, role, status)").eq("id", storeId).maybeSingle();
        const headers = await authHeaders();
        const [themeData, tokenData, prodData] = await Promise.all([
          initialTheme ? Promise.resolve({ theme: initialTheme }) : fetch(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(themeId)}`, { headers }).then((r) => r.json()),
          fetch(`${CF_URL}/generate-theme-edit-token`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ store_id: storeId }) }).then((r) => r.json()),
          fetch(`${CF_URL}/get-store-products?store_id=${encodeURIComponent(storeId)}`).then((r) => r.json()).catch(() => ({})),
        ]);
        if (!themeData.theme) throw new Error(themeData.error || t("themeEditor.loadFailed"));
        if (!tokenData.token) throw new Error(tokenData.error || t("themeEditor.tokenFailed"));
        if (cancelled) return;
        const normalized = V2.normalizeV2(themeData.theme.theme_config).config;
        if (!normalized) throw new Error(t("themeEditor.loadFailed"));
        const list = (Array.isArray(prodData?.products) ? prodData.products : []).filter((p) => p && p.handle);
        counters.current = { added: 0, deleted: 0, duplicated: 0 };
        setStore(storeRow || null);
        setHist(createHistory(normalized));
        setSavedJson(JSON.stringify(normalized));
        setThemeName(themeData.theme.name || "");
        setStatus(themeData.theme.status);
        setProducts(list);
        setProductHandle(list[0]?.handle || "");
        setMetaProductId(list[0]?.id || "");
        setToken(tokenData.token);
        setPage("home");
        setSel(null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof TypeError ? t("onlineStore.networkError") : err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, themeId]);

  useEffect(() => {
    if (!storeId || !token) return undefined;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${CF_URL}/generate-theme-edit-token`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ store_id: storeId }) });
        const d = await res.json();
        if (d.token) setToken(d.token);
      } catch { /* the old token keeps working until it expires */ }
    }, TOKEN_REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, !!token]);

  /* ------------------------------------------------------------ preview */
  const primaryDomain = (store?.store_custom_domains || []).find((d) => d.role === "primary" && d.status === "active")?.domain;
  const liveUrl = primaryDomain ? `https://${primaryDomain}` : store?.subdomain ? `https://${store.subdomain}.eneezam.com` : null;
  const liveOrigin = liveUrl ? new URL(liveUrl).origin : null;
  const pagePath = page === "product" ? (productHandle ? `/product/${encodeURIComponent(productHandle)}` : null) : TEMPLATES.find((tp) => tp.key === page)?.url || "/";
  const frameSrc = liveUrl && pagePath ? `${liveUrl}${pagePath}?preview=1&engine=v2` : null;

  useEffect(() => { latest.current = { draft, token, sel, lang, liveOrigin }; });

  const post = useCallback((msg) => {
    const w = iframeRef.current?.contentWindow;
    if (w && latest.current.liveOrigin) w.postMessage(msg, latest.current.liveOrigin);
  }, []);

  useEffect(() => {
    if (!draft) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => post({ type: "eneezam:v2-config", config: latest.current.draft, token: latest.current.token }), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [draft, token, post]);

  const scopeOf = (cfg, sectionId) => V2.findSection(cfg, sectionId)?.scope || null;

  const select = useCallback((s, scroll = false) => {
    setSel(s);
    setView("sections");
    setAddScope(null);
    if (s?.blockId) setExpanded((e) => (e.has(s.sectionId) ? e : new Set(e).add(s.sectionId)));
    post({ type: "eneezam:v2-select", sectionId: s?.sectionId || null, blockId: s?.blockId || null, scroll });
  }, [post]);

  useEffect(() => {
    function onMessage(e) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow || e.origin !== latest.current.liveOrigin) return;
      const d = e.data;
      if (!d || typeof d !== "object" || typeof d.type !== "string") return;
      if (d.type === "eneezam:v2-ready") {
        setPreview("loading");
        post({ type: "eneezam:v2-init", token: latest.current.token, config: latest.current.draft, lang: latest.current.lang === "ur" ? "ur" : "en" });
      } else if (d.type === "eneezam:v2-applied") {
        setPreview("ready");
        setPreviewErr("");
        const s = latest.current.sel;
        if (pendingScroll.current) {
          post({ type: "eneezam:v2-select", ...pendingScroll.current, scroll: true });
          pendingScroll.current = null;
        } else if (s) post({ type: "eneezam:v2-select", sectionId: s.sectionId, blockId: s.blockId, scroll: false });
      } else if (d.type === "eneezam:v2-click" && typeof d.sectionId === "string") {
        const scope = scopeOf(latest.current.draft, d.sectionId);
        if (!scope) return;
        select({ scope, sectionId: d.sectionId, blockId: typeof d.blockId === "string" ? d.blockId : null }, false);
        setPanelOpen(true);
      } else if (d.type === "eneezam:v2-hover-preview") {
        const scope = typeof d.sectionId === "string" ? scopeOf(latest.current.draft, d.sectionId) : null;
        setHov(scope ? { scope, sectionId: d.sectionId, blockId: typeof d.blockId === "string" ? d.blockId : null } : null);
      } else if (d.type === "eneezam:v2-error") {
        setPreview("error");
        setPreviewErr(String(d.error || ""));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post, select]);

  /* ------------------------------------------------------------ editing */
  const commit = useCallback((fn, key) => setHist((h) => (h ? pushState(h, fn(h.present), { key }) : h)), []);

  const act = {
    select,
    hover: (h) => { setHov(h); post({ type: "eneezam:v2-hover", sectionId: h?.sectionId || null, blockId: h?.blockId || null, scroll: !!h }); },
    toggleExpand: (id) => setExpanded((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    addSection: (scope, type) => {
      const r = V2.addSection(draft, scope, type, { afterId: sel?.scope === scope && !sel.blockId ? sel.sectionId : undefined });
      if (!r.id) return;
      commit(() => r.config);
      counters.current.added += 1;
      pendingScroll.current = { sectionId: r.id, blockId: null };
      select({ scope, sectionId: r.id, blockId: null });
    },
    duplicateSection: (scope, id) => {
      const r = V2.duplicateSection(draft, scope, id);
      if (!r.id) return;
      commit(() => r.config);
      counters.current.duplicated += 1;
      pendingScroll.current = { sectionId: r.id, blockId: null };
      select({ scope, sectionId: r.id, blockId: null });
    },
    removeSection: (scope, id) => {
      commit((d) => V2.removeSection(d, scope, id));
      counters.current.deleted += 1;
      if (sel?.sectionId === id) select(null);
    },
    toggleSection: (scope, id) => commit((d) => V2.toggleSection(d, scope, id)),
    moveSection: (scope, id, dir) => commit((d) => V2.moveSection(d, scope, id, dir)),
    reorderSection: (scope, id, target, edge) => commit((d) => V2.reorderSection(d, scope, id, target, edge)),
    addBlock: (scope, sectionId, type) => {
      const r = V2.addBlock(draft, scope, sectionId, type);
      if (!r.id) return;
      commit(() => r.config);
      pendingScroll.current = { sectionId, blockId: r.id };
      select({ scope, sectionId, blockId: r.id });
    },
    duplicateBlock: (scope, sectionId, blockId) => {
      const r = V2.duplicateBlock(draft, scope, sectionId, blockId);
      if (!r.id) return;
      commit(() => r.config);
      select({ scope, sectionId, blockId: r.id });
    },
    removeBlock: (scope, sectionId, blockId) => {
      commit((d) => V2.removeBlock(d, scope, sectionId, blockId));
      if (sel?.blockId === blockId) select({ scope, sectionId, blockId: null });
    },
    toggleBlock: (scope, sectionId, blockId) => commit((d) => V2.toggleBlock(d, scope, sectionId, blockId)),
    moveBlock: (scope, sectionId, blockId, dir) => commit((d) => V2.moveBlock(d, scope, sectionId, blockId, dir)),
    reorderBlock: (scope, sectionId, blockId, target, edge) => commit((d) => V2.reorderBlock(d, scope, sectionId, blockId, target, edge)),
  };

  // the selection only counts while the item still exists (undo can remove it)
  const selSection = sel && draft ? V2.containerOf(draft, sel.scope).sections[sel.sectionId] || null : null;
  const selDef = selSection && theme ? V2.sectionDef(theme, selSection.type) : null;
  const selBlock = selSection && sel.blockId ? selSection.blocks?.[sel.blockId] || null : null;
  const selBlockDef = selBlock && selDef ? V2.blockDef(selDef, selBlock.type) : null;
  const showSettings = view === "sections" && !!selSection && (!sel.blockId || !!selBlock);

  const onField = (key, value) => {
    if (!sel || readOnly) return;
    if (sel.blockId) commit((d) => V2.setBlockSetting(d, sel.scope, sel.sectionId, sel.blockId, key, value), `${sel.sectionId}.${sel.blockId}.${key}`);
    else commit((d) => V2.setSectionSetting(d, sel.scope, sel.sectionId, key, value), `${sel.sectionId}.${key}`);
  };
  const onThemeField = (key, value) => { if (!readOnly) commit((d) => V2.setThemeSetting(d, key, value), `set.${key}`); };
  const onMeta = (patch, key) => {
    if (!metaProductId || readOnly) return;
    commit((d) => ({ ...d, product_meta: { ...(d.product_meta || {}), [metaProductId]: { ...(d.product_meta?.[metaProductId] || {}), ...patch } } }), `meta.${metaProductId}.${key}`);
  };

  const doUndo = useCallback(() => setHist((h) => (h ? undo(h) : h)), []);
  const doRedo = useCallback(() => setHist((h) => (h ? redo(h) : h)), []);
  const dirty = useMemo(() => !!draft && !readOnly && JSON.stringify(draft) !== savedJson, [draft, savedJson, readOnly]);

  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!pageMenu) return undefined;
    const down = (e) => { if (pageMenuRef.current && !pageMenuRef.current.contains(e.target)) setPageMenu(false); };
    const key = (e) => { if (e.key === "Escape") setPageMenu(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [pageMenu]);

  /* ------------------------------------------------------------ save / publish / duplicate */
  const failText = (err, key) => (err instanceof TypeError ? t("onlineStore.networkError") : err?.message || t(key));

  const handleSave = async () => {
    if (!draft || !store || saving) return true;
    if (readOnly) { setSaveError(t("themeEditor.publishedReadOnly")); return false; }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`${CF_URL}/update-store-theme`, { method: "PUT", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ theme_id: themeId, theme_config: draft }) });
      const data = await res.json();
      if (!data.success) {
        setSaveError(data.reason === "invalid_theme_config" ? t("themeEditor.v2.invalidConfig").replace("{n}", String(data.errors?.length || 0)) : data.error || t("themeEditor.saveFailed"));
        return false;
      }
      setSavedJson(JSON.stringify(draft));
      setSavedAt(new Date());
      logActivity("theme_config_saved", { theme_id: themeId, engine: "v2", theme: draft.theme_id, ...counters.current });
      counters.current = { added: 0, deleted: 0, duplicated: 0 };
      return true;
    } catch (err) {
      setSaveError(failText(err, "themeEditor.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setDialog(null);
    if (!store || dirty) return;
    setPublishing(true);
    setPublishError("");
    try {
      const res = await fetch(`${CF_URL}/publish-store-theme`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ theme_id: themeId }) });
      const data = await res.json();
      if (!data.success) { setPublishError(data.error || t("themeEditor.publishFailed")); return; }
      setStatus("published");
      logActivity("theme_published", { theme_id: themeId, engine: "v2" });
    } catch (err) {
      setPublishError(failText(err, "themeEditor.publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const handleDuplicateToEdit = async () => {
    if (!store) return;
    setDuplicating(true);
    try {
      const res = await fetch(`${CF_URL}/create-store-theme`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ store_id: store.id, source_theme_id: themeId }) });
      const data = await res.json();
      if (!data.theme) { setSaveError(data.error || t("themeEditor.duplicateFailed")); return; }
      logActivity("theme_duplicated", { from_theme_id: themeId, to_theme_id: data.theme.id });
      onOpenThemeEditor?.(data.theme.id);
    } catch (err) {
      setSaveError(failText(err, "themeEditor.duplicateFailed"));
    } finally {
      setDuplicating(false);
    }
  };

  const goBack = () => { if (dirty) setDialog("leave"); else onNavigate?.("online-store"); };
  const switchPage = (key) => { setPage(key); setSel(null); setHov(null); setPageMenu(false); setPreview("loading"); };

  /* ------------------------------------------------------------ render */
  if (loading && storeId && themeId) return <Skeleton t={t} />;
  if (loadError || !store || !draft || !theme) {
    return (
      <div className="te-root">
        <style>{EDITOR_CSS + V2_CSS}</style>
        <div style={{ margin: "auto", maxWidth: 440, width: "100%", padding: 16 }}>
          <button className="te-btn" onClick={() => onNavigate?.("online-store")} style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="chevronLeft" size={13} />{t("themeEditor.backButton")}</button>
          <div role="alert" style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-danger)" }}>{loadError || t("themeEditor.loadFailed")}</div>
        </div>
      </div>
    );
  }

  const pageLabel = t(TEMPLATES.find((tp) => tp.key === page).labelKey);
  const groupTitle = (scope) => (scope === "header" ? t("themeEditor.v2.headerGroup") : scope === "footer" ? t("themeEditor.v2.footerGroup") : t("themeEditor.v2.templateGroup"));
  const railBtn = (key, icon, label) => (
    <button key={key} type="button" className="te-railbtn" aria-pressed={view === key} title={label} aria-label={label}
      onClick={() => { setView(key); setSel(null); setAddScope(null); post({ type: "eneezam:v2-select", sectionId: null, blockId: null }); setPanelOpen(true); }}>
      <Icon name={icon} size={18} />
    </button>
  );
  const panelTitle = view === "theme" ? t("themeEditor.themeSettings") : view === "products" ? t("themeEditor.productDetails") : pageLabel;
  const selName = selSection ? sl(`s.${selSection.type}`) : "";

  return (
    <div className="te-root">
      <style>{EDITOR_CSS + V2_CSS}</style>

      <div className="te-top">
        <div className="te-top-l">
          <button className="te-btn" onClick={goBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, paddingInline: 10 }} title={t("themeEditor.backTitle")}>
            <Icon name="chevronLeft" size={14} /><span className="te-hide-narrow">{t("themeEditor.backButton")}</span>
          </button>
          <button className="te-ibtn te-narrow-only" aria-pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)} title={t("themeEditor.togglePanel")} aria-label={t("themeEditor.togglePanel")}><Icon name="layout" size={17} /></button>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--ne-text)", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={themeName}>{themeName || t("themeEditor.untitled")}</span>
            <span style={{ flex: "none", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: readOnly ? "var(--ne-success-soft)" : "var(--ne-warning-soft)", color: readOnly ? "var(--ne-success)" : "var(--ne-warning)" }}>{readOnly ? t("themeEditor.publishedBadge") : t("themeEditor.draftBadge")}</span>
            <span className="te-hide-narrow" aria-live="polite" style={{ fontSize: 12, color: dirty ? "var(--ne-warning)" : "var(--ne-muted)", whiteSpace: "nowrap" }}>
              {saving ? t("themeEditor.saving") : dirty ? t("themeEditor.unsaved") : savedAt ? `${t("themeEditor.savedPrefix")} ${savedAt.toLocaleTimeString()}` : ""}
            </span>
          </div>
        </div>

        <div ref={pageMenuRef} style={{ position: "relative", justifySelf: "center" }}>
          <button className="te-btn" aria-haspopup="menu" aria-expanded={pageMenu} onClick={() => setPageMenu((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 150, justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="home" size={14} />{pageLabel}</span><Icon name="chevronDown" size={13} />
          </button>
          {pageMenu && (
            <div className="te-pop" role="menu" style={{ top: "calc(100% + 6px)", insetInlineStart: "50%", transform: "translateX(-50%)" }}>
              {TEMPLATES.map((tp) => (
                <button key={tp.key} role="menuitem" className="te-popitem" aria-current={page === tp.key} onClick={() => switchPage(tp.key)}>{t(tp.labelKey)}</button>
              ))}
            </div>
          )}
        </div>

        <div className="te-top-r">
          <div className="te-hide-narrow" style={{ display: "inline-flex", gap: 2, padding: 2, border: "1px solid var(--ne-border)", borderRadius: 12 }}>
            <button className="te-ibtn" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} title={t("themeEditor.desktop")} aria-label={t("themeEditor.desktop")}><Icon name="desktop" size={16} /></button>
            <button className="te-ibtn" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} title={t("themeEditor.mobile")} aria-label={t("themeEditor.mobile")}><Icon name="mobile" size={16} /></button>
          </div>
          <button className="te-ibtn" onClick={doUndo} disabled={readOnly || !canUndo(hist)} title={t("themeEditor.undo")} aria-label={t("themeEditor.undo")}><Icon name="undo" size={16} /></button>
          <button className="te-ibtn" onClick={doRedo} disabled={readOnly || !canRedo(hist)} title={t("themeEditor.redo")} aria-label={t("themeEditor.redo")}><Icon name="redo" size={16} /></button>
          {!readOnly && (
            <button className="te-btn te-hide-narrow" onClick={() => setDialog("publish")} disabled={publishing || dirty} title={dirty ? t("themeEditor.saveFirst") : t("themeEditor.publishButton")}>
              {publishing ? t("themeEditor.publishing") : t("themeEditor.publishButton")}
            </button>
          )}
          <button className="te-btn primary" onClick={handleSave} disabled={saving || readOnly || !dirty}>{saving ? t("themeEditor.saving") : t("themeEditor.saveButton")}</button>
        </div>
      </div>

      {(readOnly || saveError || publishError) && (
        <div role="alert" className="te2-banner" style={{ background: saveError || publishError ? "var(--ne-danger-soft)" : "var(--ne-warning-soft)", color: saveError || publishError ? "var(--ne-danger)" : "var(--ne-warning)" }}>
          <span>{saveError || publishError || t("themeEditor.publishedReadOnly")}</span>
          {readOnly && !saveError && !publishError && <button className="te-btn" onClick={handleDuplicateToEdit} disabled={duplicating} style={{ color: "inherit", borderColor: "currentColor" }}>{duplicating ? t("themeEditor.duplicating") : t("themeEditor.duplicateToEditButton")}</button>}
          {(saveError || publishError) && <button className="te-btn" onClick={() => { setSaveError(""); setPublishError(""); }} style={{ color: "inherit", borderColor: "currentColor" }}>{t("themeEditor.dismiss")}</button>}
        </div>
      )}

      <div className={`te-body${panelOpen ? " panel-open" : ""}`}>
        <nav className="te-rail" aria-label={t("themeEditor.tools")}>
          {railBtn("sections", "layout", t("themeEditor.sections"))}
          {railBtn("theme", "palette", t("themeEditor.themeSettings"))}
          {railBtn("products", "tag", t("themeEditor.productDetails"))}
        </nav>

        <aside className="te-panel" aria-label={showSettings ? selName : panelTitle}>
          <div className="te-panel-h">
            {showSettings ? (
              <>
                <button className="te-ibtn" onClick={() => (sel.blockId ? select({ ...sel, blockId: null }) : select(null))} title={t("themeEditor.backToSections")} aria-label={t("themeEditor.backToSections")}><Icon name="chevronLeft" size={16} /></button>
                <nav className="te2-crumbs" aria-label={t("themeEditor.v2.breadcrumb")}>
                  <span>{groupTitle(sel.scope)}</span><Icon name="chevronRight" size={11} />
                  {selBlock ? (
                    <><button type="button" onClick={() => select({ ...sel, blockId: null }, true)}>{selName}</button><Icon name="chevronRight" size={11} /><strong>{sl(`b.${selBlock.type}`)}</strong></>
                  ) : <strong>{selName}</strong>}
                </nav>
                {!readOnly && (selBlock || !selDef?.locked) && (
                  <SelectionMenu cfg={draft} sel={sel} isBlock={!!selBlock} act={act} t={t} open={headMenu} setOpen={setHeadMenu} />
                )}
              </>
            ) : <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{panelTitle}</span>}
            <button className="te-ibtn te-narrow-only" onClick={() => setPanelOpen(false)} title={t("themeEditor.closePanel")} aria-label={t("themeEditor.closePanel")}><Icon name="close" size={15} /></button>
          </div>
          <div className="te-panel-b">
            {view === "sections" && !showSettings && (
              <>
                <p style={{ margin: "2px 6px 12px", fontSize: 12, color: "var(--ne-muted)", lineHeight: 1.45 }}>{t("themeEditor.v2.inspectorHint")}</p>
                <Tree cfg={draft} theme={theme} page={page} t={t} sl={sl} sel={sel} hov={hov} readOnly={readOnly} expanded={expanded}
                  drag={drag} setDrag={setDrag} act={act} onOpenAdd={(scope) => setAddScope(scope)} />
              </>
            )}
            {showSettings && (
              <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
                {(() => {
                  const fields = selBlock ? selBlockDef?.settings || [] : selDef?.settings || [];
                  const values = selBlock ? selBlock.settings : selSection.settings;
                  if (!fields.length) return <p style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>{t("themeEditor.v2.noSettings")}</p>;
                  return <SchemaFields fields={fields} values={values} onChange={onField} sl={sl} t={t} catalog={products} theme={theme} settings={draft.settings} />;
                })()}
                {!selBlock && selDef?.blocks?.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--ne-muted)", marginTop: 4 }}>{t("themeEditor.v2.blocksInTree")}</p>
                )}
              </fieldset>
            )}
            {view === "theme" && (
              <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
                <ThemeSettingsV2 theme={theme} settings={draft.settings} onChange={onThemeField} sl={sl} t={t} catalog={products} />
              </fieldset>
            )}
            {view === "products" && (
              <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
                <ProductMetaPanel t={t} products={products} productId={metaProductId} onProductId={setMetaProductId} meta={draft.product_meta?.[metaProductId]} onMeta={onMeta} />
              </fieldset>
            )}
          </div>
          {addScope && view === "sections" && !showSettings && (
            <AddSectionPopup cfg={draft} theme={theme} scope={addScope} t={t} sl={sl} onClose={() => setAddScope(null)} onPick={(type) => { const s = addScope; setAddScope(null); act.addSection(s, type); }} />
          )}
        </aside>

        <main className={`te-preview${device === "mobile" ? " mobile" : ""}`} aria-label={t("themeEditor.previewLabel")}>
          {frameSrc ? (
            <>
              <iframe key={`${frameSrc}#${frameKey}`} ref={iframeRef} className={`te-frame${device === "mobile" ? " mobile" : ""}`} src={frameSrc} title={t("themeEditor.previewLabel")} referrerPolicy="no-referrer" />
              {preview === "loading" && <span className="te2-chipstate" role="status">{t("themeEditor.v2.previewLoading")}</span>}
              {preview === "error" && (
                <div className="te2-chipstate" role="alert" style={{ color: "var(--ne-danger)", display: "flex", gap: 10, alignItems: "center" }}>
                  <span>{t("themeEditor.v2.previewError")}{previewErr ? ` (${previewErr})` : ""}</span>
                  <button className="te-btn" style={{ height: 28 }} onClick={() => { setPreview("loading"); setFrameKey((k) => k + 1); }}>{t("onlineStore.retry")}</button>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: "var(--ne-muted)", alignSelf: "center", padding: 20, textAlign: "center", maxWidth: 360 }}>
              {page === "product" && liveUrl && !productHandle ? t("themeEditor.noProductPreview") : t("themeEditor.noLiveUrl")}
            </p>
          )}
        </main>
      </div>

      {dialog === "leave" && (
        <Dialog title={t("themeEditor.leaveTitle")} body={t("themeEditor.leaveBody")} onClose={() => setDialog(null)}
          actions={(
            <>
              <button className="te-btn" onClick={() => setDialog(null)}>{t("themeEditor.keepEditing")}</button>
              <button className="te-btn" onClick={() => { setDialog(null); onNavigate?.("online-store"); }} style={{ color: "var(--ne-danger)" }}>{t("themeEditor.leaveAnyway")}</button>
              <button className="te-btn primary" onClick={async () => { setDialog(null); if (await handleSave()) onNavigate?.("online-store"); }}>{t("themeEditor.saveAndLeave")}</button>
            </>
          )} />
      )}
      {dialog === "publish" && (
        <Dialog title={t("themeEditor.publishTitle")} body={t("themeEditor.publishBody")} onClose={() => setDialog(null)}
          actions={(
            <>
              <button className="te-btn" onClick={() => setDialog(null)}>{t("themeEditor.cancel")}</button>
              <button className="te-btn primary" onClick={handlePublish}>{t("themeEditor.publishConfirm")}</button>
            </>
          )} />
      )}
    </div>
  );
}
