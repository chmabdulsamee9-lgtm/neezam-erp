import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { TEMPLATES, resolveSections, withResolvedLayout, mutateSections, addSection, removeSection, duplicateSection, toggleSection, moveSection, reorderSection, setSectionSetting, isLocked } from "../lib/themeEditor/layout";
import { createHistory, pushState, undo, redo, canUndo, canRedo } from "../lib/themeEditor/history";
import { sectionLabel } from "../lib/themeEditor/labels";
import SectionsPanel, { AddSectionPopup, RowMenu } from "../components/themeEditor/SectionsPanel";
import { SectionSettingsForm, ThemeSettingsPanel, ProductMetaPanel } from "../components/themeEditor/SettingsPanels";
import { EDITOR_CSS, Dialog } from "../components/themeEditor/shell";
import ThemeEditorV2 from "./ThemeEditorV2";
import { isV2 } from "../lib/themeV2/engine.generated";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const TOKEN_REFRESH_MS = 15 * 60 * 1000; // the worker's edit token lives 20 minutes

// Full-viewport theme editor (Sections tree + settings panels + live preview). The draft lives in an undo/redo history;
// every change is pushed to the storefront iframe over postMessage (no save needed to preview), Save writes the whole
// theme_config through the existing PUT /update-store-theme.


function pathToTemplate(path) {
  const p = String(path || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return { key: "home" };
  if (p === "/collection" || p.startsWith("/collection/")) return { key: "collection" };
  if (p.startsWith("/product/")) return { key: "product", productPath: p };
  if (p === "/cart") return { key: "cart" };
  if (p === "/checkout") return { key: "checkout" };
  return null;
}


function LegacyThemeEditor({ storeId, themeId, onNavigate, onOpenThemeEditor }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [hist, setHist] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [themeName, setThemeName] = useState("");
  const [themeStatus, setThemeStatus] = useState("draft");
  const [products, setProducts] = useState([]);
  const [productPath, setProductPath] = useState("");
  const [metaProductId, setMetaProductId] = useState("");
  const [template, setTemplate] = useState("home");
  const [view, setView] = useState("sections"); // sections | theme | products
  const [selectedId, setSelectedId] = useState(null);
  const [device, setDevice] = useState("desktop");
  const [panelOpen, setPanelOpen] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [headMenu, setHeadMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [dialog, setDialog] = useState(null); // 'leave' | 'publish'
  const [frameToken, setFrameToken] = useState(null);
  const hasToken = !!frameToken;
  const iframeRef = useRef(null);
  const postTimer = useRef(null);
  const [defaultsCache] = useState(() => new Map()); // default section ids stay stable while the editor is open
  const pendingScroll = useRef(null);
  const counters = useRef({ added: 0, deleted: 0, duplicated: 0 });
  const pageMenuRef = useRef(null);

  const draft = hist?.present ?? null;
  const readOnly = themeStatus === "published";

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user.id).single();
      setCurrentProfile(data || null);
    })();
  }, []);

  const logActivity = async (sId, actionType, details) => {
    if (!currentProfile || !sId) return;
    try {
      await supabase.from("activity_log").insert({
        store_id: sId, user_id: currentProfile.id,
        user_name: currentProfile.full_name || currentProfile.email,
        action_type: actionType, order_id: null, details: details || null,
      });
    } catch (err) {
      console.log("logActivity error:", err.message);
    }
  };

  /* ------------------------------------------------------------ load */
  useEffect(() => {
    if (!storeId || !themeId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { data: storeRow } = await supabase
          .from("stores")
          .select("id, store_name, subdomain, store_custom_domains(domain, role, status)")
          .eq("id", storeId)
          .maybeSingle();
        const { data: { session } } = await supabase.auth.getSession();
        const authHeaders = { Authorization: `Bearer ${session?.access_token}` };
        const [themeRes, tokenRes, prodRes] = await Promise.all([
          fetch(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(themeId)}`, { headers: authHeaders }),
          fetch(`${CF_URL}/generate-theme-edit-token`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ store_id: storeId }) }),
          fetch(`${CF_URL}/get-store-products?store_id=${encodeURIComponent(storeId)}`).then((r) => r.json()).catch(() => ({})),
        ]);
        const themeData = await themeRes.json();
        const tokenData = await tokenRes.json();
        if (!themeData.theme) throw new Error(themeData.error || t("themeEditor.loadFailed"));
        if (!tokenData.token) throw new Error(tokenData.error || t("themeEditor.tokenFailed"));
        if (cancelled) return;
        const cfg = themeData.theme.theme_config || {};
        defaultsCache.clear();
        counters.current = { added: 0, deleted: 0, duplicated: 0 };
        const list = (Array.isArray(prodRes?.products) ? prodRes.products : []).filter((p) => p && p.handle);
        setStore(storeRow || null);
        setHist(createHistory(cfg));
        setSavedJson(JSON.stringify(cfg));
        setThemeName(themeData.theme.name || "");
        setThemeStatus(themeData.theme.status);
        setProducts(list);
        setProductPath(list[0] ? `/product/${list[0].handle}` : "");
        setMetaProductId(list[0]?.id || "");
        setFrameToken(tokenData.token);
        setTemplate("home");
        setSelectedId(null);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, themeId]);

  // keep the edit token alive so the preview can keep navigating between pages in a long session
  useEffect(() => {
    if (!storeId || !hasToken) return undefined;
    const id = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${CF_URL}/generate-theme-edit-token`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ store_id: storeId }) });
        const d = await res.json();
        if (d.token) setFrameToken(d.token);
      } catch { /* keep the old token; it still works until it expires */ }
    }, TOKEN_REFRESH_MS);
    return () => clearInterval(id);
  }, [storeId, hasToken]);

  /* ------------------------------------------------------------ preview */
  const primaryDomain = (store?.store_custom_domains || []).find((d) => d.role === "primary" && d.status === "active")?.domain;
  const liveUrl = primaryDomain ? `https://${primaryDomain}` : store?.subdomain ? `https://${store.subdomain}.eneezam.com` : null;
  const templateUrl = template === "product" ? productPath : TEMPLATES.find((tp) => tp.key === template)?.url || "/";

  // the iframe only navigates when the page changes; a refreshed token is picked up by the next navigation
  const frameSrc = useMemo(() => {
    if (!liveUrl || !frameToken || !templateUrl) return null;
    return `${liveUrl}${templateUrl}?token=${encodeURIComponent(frameToken)}&preview=1`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveUrl, templateUrl, hasToken]);

  const sections = useMemo(() => (draft ? resolveSections(draft, template, defaultsCache) : []), [draft, template, defaultsCache]);
  const previewConfig = useMemo(() => (draft ? withResolvedLayout(draft, template, defaultsCache) : null), [draft, template, defaultsCache]);
  // latest values for the message handler (which is registered once)
  const previewRef = useRef(null);
  const sectionsRef = useRef([]);
  const selectedRef = useRef(null);
  useEffect(() => { previewRef.current = previewConfig; sectionsRef.current = sections; selectedRef.current = selectedId; });

  const post = useCallback((msg) => { iframeRef.current?.contentWindow?.postMessage(msg, "*"); }, []);
  const sendPreview = useCallback(() => {
    if (previewRef.current) post({ type: "eneezam:theme-preview", themeConfig: previewRef.current });
  }, [post]);

  useEffect(() => {
    if (!previewConfig) return undefined;
    clearTimeout(postTimer.current);
    postTimer.current = setTimeout(sendPreview, 250);
    return () => clearTimeout(postTimer.current);
  }, [previewConfig, sendPreview]);

  // pending: the section was just created, so the preview has to finish rendering it before it can scroll there
  const selectSection = useCallback((id, { scroll = false, pending = false } = {}) => {
    setSelectedId(id);
    setView("sections");
    setAddOpen(false);
    pendingScroll.current = scroll && pending && id ? id : null;
    post({ type: "eneezam:select-section", id, scroll });
  }, [post]);

  useEffect(() => {
    function onMessage(e) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data;
      if (!d || typeof d.type !== "string") return;
      if (d.type === "eneezam:theme-preview-ready") {
        sendPreview();
        if (selectedRef.current) post({ type: "eneezam:select-section", id: selectedRef.current, scroll: false });
      } else if (d.type === "eneezam:theme-preview-applied") {
        if (pendingScroll.current) {
          post({ type: "eneezam:select-section", id: pendingScroll.current, scroll: true });
          pendingScroll.current = null;
        }
      } else if (d.type === "eneezam:section-click") {
        if (sectionsRef.current.some((s) => s.id === d.id)) {
          setSelectedId(d.id);
          setView("sections");
          setAddOpen(false);
          setPanelOpen(true);
          post({ type: "eneezam:select-section", id: d.id, scroll: false });
        }
      } else if (d.type === "eneezam:preview-navigate") {
        const hit = pathToTemplate(d.path);
        if (!hit) return;
        if (hit.productPath) setProductPath(hit.productPath);
        setTemplate(hit.key);
        setSelectedId(null);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendPreview, post]);

  /* ------------------------------------------------------------ editing */
  const commit = useCallback((fn, key) => {
    setHist((h) => (h ? pushState(h, fn(h.present), { key }) : h));
  }, []);
  const mutate = (fn, key) => commit((d) => mutateSections(d, template, fn, defaultsCache), key);

  const selected = selectedId ? sections.find((s) => s.id === selectedId) || null : null;

  const onToggle = (id) => mutate((a) => toggleSection(a, id));
  const onMove = (id, dir) => mutate((a) => moveSection(a, id, dir, template));
  const onReorder = (id, targetId, edge) => mutate((a) => reorderSection(a, id, targetId, edge, template));
  const onDelete = (id) => {
    mutate((a) => removeSection(a, id));
    counters.current.deleted += 1;
    if (selectedId === id) selectSection(null);
  };
  const onDuplicate = (id) => {
    const next = duplicateSection(sections, id);
    if (next === sections) return;
    const idx = sections.findIndex((s) => s.id === id);
    const copy = next[idx + 1];
    mutate(() => next);
    counters.current.duplicated += 1;
    selectSection(copy.id, { scroll: true, pending: true });
  };
  const onAdd = (type) => {
    const next = addSection(sections, type, template);
    if (next === sections) return;
    const created = next.find((s) => !sections.includes(s));
    mutate(() => next);
    counters.current.added += 1;
    setAddOpen(false);
    selectSection(created.id, { scroll: true, pending: true });
  };
  const onSectionSetting = (key, value) => { if (selected) mutate((a) => setSectionSetting(a, selected.id, key, value), `sec.${selected.id}.${key}`); };
  const onSettings = (fn, key) => commit((d) => ({ ...d, settings: fn(d.settings || {}) }), `set.${key}`);
  const onMeta = (patch, key) => {
    if (!metaProductId) return;
    commit((d) => ({ ...d, product_meta: { ...(d.product_meta || {}), [metaProductId]: { ...(d.product_meta?.[metaProductId] || {}), ...patch } } }), `meta.${metaProductId}.${key}`);
  };

  const doUndo = useCallback(() => setHist((h) => (h ? undo(h) : h)), []);
  const doRedo = useCallback(() => setHist((h) => (h ? redo(h) : h)), []);

  const dirty = useMemo(() => !!draft && !readOnly && JSON.stringify(draft) !== savedJson, [draft, savedJson, readOnly]);

  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing) return; // let the field keep its own text undo
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
  const handleSave = async () => {
    if (!draft || !store || !themeId || saving) return true;
    if (themeStatus === "published") { setSaveError(t("themeEditor.publishedReadOnly")); return false; }
    setSaving(true);
    setSaveError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/update-store-theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ theme_id: themeId, theme_config: draft }),
      });
      const data = await res.json();
      if (!data.success) { setSaveError(data.error || t("themeEditor.saveFailed")); return false; }
      setSavedJson(JSON.stringify(draft));
      setSavedAt(new Date());
      logActivity(store.id, "theme_config_saved", { theme_id: themeId, ...counters.current });
      counters.current = { added: 0, deleted: 0, duplicated: 0 };
      return true;
    } catch (err) {
      setSaveError(err.message || t("themeEditor.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setDialog(null);
    if (!store || !themeId || dirty) return;
    setPublishing(true);
    setPublishError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/publish-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ theme_id: themeId }),
      });
      const data = await res.json();
      if (!data.success) { setPublishError(data.error || t("themeEditor.publishFailed")); return; }
      setThemeStatus("published");
      logActivity(store.id, "theme_published", { theme_id: themeId });
    } catch (err) {
      setPublishError(err.message || t("themeEditor.publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const handleDuplicateToEdit = async () => {
    if (!store || !themeId) return;
    setDuplicating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/create-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: store.id, source_theme_id: themeId }),
      });
      const data = await res.json();
      if (!data.theme) { setSaveError(data.error || t("themeEditor.duplicateFailed")); return; }
      logActivity(store.id, "theme_duplicated", { from_theme_id: themeId, to_theme_id: data.theme.id });
      onOpenThemeEditor?.(data.theme.id);
    } catch (err) {
      setSaveError(err.message || t("themeEditor.duplicateFailed"));
    } finally {
      setDuplicating(false);
    }
  };

  const goBack = () => { if (dirty) setDialog("leave"); else onNavigate?.("online-store"); };

  /* ------------------------------------------------------------ render */
  if (loading && storeId && themeId) {
    return <div className="te-root"><style>{EDITOR_CSS}</style><div style={{ margin: "auto", color: "var(--ne-muted)", fontSize: 14 }}>{t("themeEditor.loading")}</div></div>;
  }
  if (loadError || !store || !draft) {
    return (
      <div className="te-root">
        <style>{EDITOR_CSS}</style>
        <div style={{ margin: "auto", maxWidth: 440, width: "100%", padding: 16 }}>
          <button className="te-btn" onClick={() => onNavigate?.("online-store")} style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="chevronLeft" size={13} />{t("themeEditor.backButton")}</button>
          <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-danger)" }}>{loadError || t("themeEditor.loadFailed")}</div>
        </div>
      </div>
    );
  }

  const settings = draft.settings || {};
  const themeNum = Number(settings.active_theme_id) || 1;
  const pageLabel = t(TEMPLATES.find((tp) => tp.key === template).labelKey);
  const statusText = readOnly ? t("themeEditor.publishedBadge") : t("themeEditor.draftBadge");
  const railBtn = (key, icon, label) => (
    <button key={key} type="button" className="te-railbtn" aria-pressed={view === key} title={label} aria-label={label}
      onClick={() => { setView(key); setSelectedId(null); post({ type: "eneezam:select-section", id: null }); setAddOpen(false); setPanelOpen(true); }}>
      <Icon name={icon} size={18} />
    </button>
  );
  const panelTitle = view === "theme" ? t("themeEditor.themeSettings") : view === "products" ? t("themeEditor.productDetails") : pageLabel;
  const showSettings = view === "sections" && selected;

  return (
    <div className="te-root">
      <style>{EDITOR_CSS}</style>

      <div className="te-top">
        <div className="te-top-l">
          <button className="te-btn" onClick={goBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, paddingInline: 10 }} title={t("themeEditor.backTitle")}>
            <Icon name="chevronLeft" size={14} /><span className="te-hide-narrow">{t("themeEditor.backButton")}</span>
          </button>
          <button className="te-ibtn te-narrow-only" aria-pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)} title={t("themeEditor.togglePanel")} aria-label={t("themeEditor.togglePanel")}><Icon name="layout" size={17} /></button>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--ne-text)", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }} title={themeName}>{themeName || t("themeEditor.untitled")}</span>
            <span style={{ flex: "none", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: readOnly ? "var(--ne-success-soft)" : "var(--ne-warning-soft)", color: readOnly ? "var(--ne-success)" : "var(--ne-warning)" }}>{statusText}</span>
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
                <button key={tp.key} role="menuitem" className="te-popitem" aria-current={template === tp.key}
                  onClick={() => { setTemplate(tp.key); setSelectedId(null); setPageMenu(false); }}>{t(tp.labelKey)}</button>
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

      <div role="note" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", fontSize: 12.5, background: "var(--ne-surface-2)", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)" }}>
        <Icon name="key" size={13} /><span><strong style={{ color: "var(--ne-text)" }}>{t("themeEditor.v2.legacyTitle")}</strong> {t("themeEditor.v2.legacyBody")}</span>
      </div>
      {(readOnly || saveError || publishError) && (
        <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 16px", fontSize: 12.5, background: saveError || publishError ? "var(--ne-danger-soft)" : "var(--ne-warning-soft)", color: saveError || publishError ? "var(--ne-danger)" : "var(--ne-warning)" }}>
          <span>{saveError || publishError || t("themeEditor.publishedReadOnly")}</span>
          {readOnly && !saveError && !publishError && (
            <button className="te-btn" onClick={handleDuplicateToEdit} disabled={duplicating} style={{ color: "inherit", borderColor: "currentColor" }}>{duplicating ? t("themeEditor.duplicating") : t("themeEditor.duplicateToEditButton")}</button>
          )}
          {(saveError || publishError) && <button className="te-btn" onClick={() => { setSaveError(""); setPublishError(""); }} style={{ color: "inherit", borderColor: "currentColor" }}>{t("themeEditor.dismiss")}</button>}
        </div>
      )}

      <div className={`te-body${panelOpen ? " panel-open" : ""}`}>
        <nav className="te-rail" aria-label={t("themeEditor.tools")}>
          {railBtn("sections", "layout", t("themeEditor.sections"))}
          {railBtn("theme", "palette", t("themeEditor.themeSettings"))}
          {railBtn("products", "tag", t("themeEditor.productDetails"))}
        </nav>

        <aside className="te-panel" aria-label={panelTitle}>
          <div className="te-panel-h">
            {showSettings && (
              <button className="te-ibtn" onClick={() => selectSection(null)} title={t("themeEditor.backToSections")} aria-label={t("themeEditor.backToSections")}><Icon name="chevronLeft" size={16} /></button>
            )}
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{showSettings ? sectionLabel(t, selected.type) : panelTitle}</span>
            {showSettings && !isLocked(selected.type) && !readOnly && (
              <>
                <button className="te-ibtn" onClick={() => setHeadMenu((v) => !v)} aria-haspopup="menu" aria-expanded={headMenu} title={t("themeEditor.more")} aria-label={t("themeEditor.more")}><Icon name="moreHorizontal" size={16} /></button>
                {headMenu && <RowMenu t={t} section={selected} template={template} sections={sections} onDuplicate={onDuplicate} onMove={onMove} onDelete={onDelete} onClose={() => setHeadMenu(false)} />}
              </>
            )}
            <button className="te-ibtn te-narrow-only" onClick={() => setPanelOpen(false)} title={t("themeEditor.closePanel")} aria-label={t("themeEditor.closePanel")}><Icon name="close" size={15} /></button>
          </div>
          <div className="te-panel-b">
            {view === "sections" && !selected && (
              <SectionsPanel t={t} template={template} sections={sections} selectedId={selectedId} readOnly={readOnly}
                onSelect={(id) => selectSection(id, { scroll: true })} onHover={(id) => post({ type: "eneezam:hover-section", id })}
                onToggle={onToggle} onDuplicate={onDuplicate} onDelete={onDelete} onMove={onMove} onReorder={onReorder} onAdd={onAdd} onOpenAdd={() => setAddOpen(true)} />
            )}
            {showSettings && <SectionSettingsForm t={t} section={selected} readOnly={readOnly} onChange={onSectionSetting} />}
            {view === "theme" && <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}><ThemeSettingsPanel t={t} settings={settings} onSettings={onSettings} /></fieldset>}
            {view === "products" && (
              <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
                <ProductMetaPanel t={t} products={products} productId={metaProductId} onProductId={setMetaProductId} meta={draft.product_meta?.[metaProductId]} onMeta={onMeta} />
              </fieldset>
            )}
          </div>
          {addOpen && view === "sections" && !selected && <AddSectionPopup t={t} template={template} themeId={themeNum} onClose={() => setAddOpen(false)} onPick={onAdd} />}
        </aside>

        <main className={`te-preview${device === "mobile" ? " mobile" : ""}`} aria-label={t("themeEditor.previewLabel")}>
          {frameSrc ? (
            <iframe ref={iframeRef} className={`te-frame${device === "mobile" ? " mobile" : ""}`} src={frameSrc} title={t("themeEditor.previewLabel")} />
          ) : (
            <p style={{ color: "var(--ne-muted)", alignSelf: "center", padding: 20, textAlign: "center", maxWidth: 360 }}>
              {template === "product" && liveUrl && !productPath ? t("themeEditor.noProductPreview") : t("themeEditor.noLiveUrl")}
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

// Picks the editor for the theme being opened: v2 theme packages (theme_config.version 2, e.g. Nova) open in the
// v2 editor; legacy themes keep the editor above unchanged. Nothing is migrated automatically.
export default function ThemeEditor(props) {
  const { storeId, themeId } = props;
  const [state, setState] = useState({ key: null, kind: null, theme: null });
  const key = `${storeId}:${themeId}`;
  useEffect(() => {
    if (!storeId || !themeId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(themeId)}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
        const data = await res.json();
        if (cancelled) return;
        const v2 = !!data.theme && isV2(data.theme.theme_config);
        setState({ key, kind: v2 ? "v2" : "legacy", theme: v2 ? data.theme : null });
      } catch {
        if (!cancelled) setState({ key, kind: "legacy", theme: null }); // the legacy editor shows its own load error
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, themeId, key]);
  if (!storeId || !themeId) return <LegacyThemeEditor {...props} />;
  if (state.key !== key) return <div className="te-root"><style>{EDITOR_CSS}</style></div>;
  return state.kind === "v2" ? <ThemeEditorV2 {...props} initialTheme={state.theme} /> : <LegacyThemeEditor {...props} />;
}
