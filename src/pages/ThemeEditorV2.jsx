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
import Tip from "../components/themeEditorV2/Tip";
import * as V2 from "../lib/themeV2/engine.generated";
import {
  SHORTCUTS, matchShortcut, isTypingTarget, readInspector, writeInspector,
  createScrollSync, onScrollReport, scrollPairTo, thumbGeometry, topFromThumb, saveAsDraft,
} from "../lib/themeV2/editorLogic";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const TOKEN_REFRESH_MS = 15 * 60 * 1000; // the worker's edit token lives 20 minutes
const PREVIEW_DEBOUNCE_MS = 250;

// v2 theme editor (theme packages such as Nova). All controls live in the left column; the preview fills the rest of
// the viewport from top to bottom. The draft lives in an undo/redo history; every change reaches the preview over
// postMessage, where the storefront renders it on the server. The edit token is sent over postMessage after the preview
// says it is ready, never in the iframe URL. Save writes the whole theme_config through PUT /update-store-theme (the
// worker validates it); saving a published theme needs an explicit confirmation because it changes the live store.
// Sizes are deliberately compact (about 10% smaller than the legacy editor) with real sizes, not CSS zoom.

const V2_CSS = `
.te2-root{background:var(--ne-surface)}
.te2-body{flex:1;min-height:0;display:flex;gap:6px;padding:6px;position:relative}
.te2-left{width:348px;flex:none;display:flex;flex-direction:column;min-height:0;position:relative;background:var(--ne-surface-2);border:1px solid var(--ne-border);border-radius:14px;overflow:hidden}
.te2-bar{display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:6px 8px}
.te2-bar+.te2-bar{padding-top:0}
.te2-name{font-weight:700;font-size:12.5px;color:var(--ne-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.te2-badge{flex:none;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px}
.te2-dirty{font-size:10.5px;white-space:nowrap}
.te2-tabs{display:flex;gap:4px;padding:4px 8px 6px;border-bottom:1px solid var(--ne-border)}
.te2-tab{width:34px;height:30px;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--ne-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.te2-tab:hover{background:var(--ne-surface);color:var(--ne-text)}
.te2-tab[aria-pressed=true],.te2-root .te-ibtn[aria-pressed=true]{background:var(--ne-accent-soft);color:var(--ne-accent);border-color:transparent}
.te2-ph{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 6px 0 10px;border-bottom:1px solid var(--ne-border);font-weight:700;font-size:12.5px;flex:none}
.te2-scroll{flex:1;min-height:0;overflow-y:auto;padding:8px 8px 16px}
.te2-stage{flex:1;min-width:0;position:relative;display:flex;justify-content:center;background:var(--ne-surface);border-radius:14px;overflow:hidden}
.te2-pair{display:flex;gap:12px;height:100%;min-width:0}
.te2-pair.desktop{flex:1}
.te2-frame{height:100%;border:0;display:block;background:#fff;box-sizing:content-box}
.te2-pair.desktop .te2-frame{flex:1;width:100%;min-width:0;border-radius:12px}
.te2-frame.mobile{width:390px;flex:none;border-radius:16px;box-shadow:0 0 0 1px var(--ne-border)}
.te2-sbar{width:8px;flex:none;position:relative;border-radius:8px;background:var(--ne-surface-2);cursor:pointer;touch-action:none}
.te2-sbar>span{position:absolute;left:1px;right:1px;border-radius:6px;background:var(--ne-muted-2);cursor:grab}
.te2-sbar>span:hover,.te2-sbar>span.drag{background:var(--ne-muted)}
.te2-chipstate{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:3;padding:5px 11px;border-radius:20px;background:var(--ne-surface-2);border:1px solid var(--ne-border);font-size:11.5px;color:var(--ne-muted);box-shadow:0 6px 18px rgba(0,0,0,.15)}
.te2-fab{display:none;position:absolute;top:10px;left:10px;z-index:4}
.te2-root .te-btn{height:30px;padding:0 11px;font-size:12px;border-radius:9px}
.te2-root .te-ibtn{width:30px;height:30px;border-radius:9px}
.te2-root .te-row{min-height:33px;border-radius:9px}
.te2-root .te-add{font-size:12px;padding:6px 9px;margin-top:2px}
.te2-root .te-popitem{font-size:12px;padding:7px 9px}
.te2-root .te-pop{border-radius:12px}
.te2-root .te-panel-b,.te2-scroll{font-size:12px}
.te2-scroll input:not([type=range]):not([type=checkbox]):not([type=color]),.te2-scroll select,.te2-scroll textarea,.te2-addpop input{font-size:12px!important;padding:6px 9px!important;border-radius:9px!important}
.te2-scroll label{font-size:11px!important}
.te2-scroll p{font-size:11px}
.te2-ts>div>button[aria-expanded]{font-size:12.5px!important;padding:10px 5px!important}
.te2-slot{height:6px;position:relative;margin:0 4px}
.te2-slot button{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;border:1px solid var(--ne-accent);background:var(--ne-surface-2);color:var(--ne-accent);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;padding:0;z-index:2}
.te2-slot::before{content:"";position:absolute;left:6px;right:6px;top:50%;height:2px;background:var(--ne-accent);opacity:0;border-radius:2px}
.te2-slot:hover button,.te2-slot:hover::before,.te2-slot button:focus-visible,.te2-slot:focus-within::before{opacity:1}
.te2-row.hov{background:var(--ne-surface);outline:1px dashed var(--ne-accent);outline-offset:-1px}
.te2-grip{color:var(--ne-muted-2);cursor:grab;display:inline-flex;width:14px;justify-content:center;flex:none}
.te2-ico{display:inline-flex;color:var(--ne-muted);flex:none;margin-inline-end:2px}
.te2-root .te2-name{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;background:transparent;border:none;padding:7px 0;color:var(--ne-text);text-align:start;font-size:12px;cursor:pointer;font-family:inherit}
.te2-title{font-weight:600;white-space:nowrap}
.te2-sum{color:var(--ne-muted);font-style:italic;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.te2-root .te2-act{width:26px;height:26px;color:var(--ne-muted)}
.te2-act:hover:not(:disabled){color:var(--ne-text)}
.te2-menu{position:absolute;inset-inline-end:0;top:100%;z-index:40;min-width:170px;background:var(--ne-surface-2);border:1px solid var(--ne-border);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:4px 0}
.te2-menu button{width:100%;display:flex;align-items:center;gap:8px;padding:7px 11px;background:transparent;border:none;text-align:start;font-size:12px;color:var(--ne-text);cursor:pointer;font-family:inherit}
.te2-menu button:hover:not(:disabled){background:var(--ne-surface)}
.te2-menu button:disabled{opacity:.4;cursor:not-allowed}
.te2-menu button.danger{color:var(--ne-danger)}
.te2-sep{height:1px;background:var(--ne-border);margin:4px 0}
.te2-group{margin:0;padding:5px 6px;font-size:10.5px;font-weight:700;color:var(--ne-muted);text-transform:uppercase;letter-spacing:.06em}
.te2-empty{margin:2px 8px 6px;font-size:11.5px;color:var(--ne-muted)}
.te2-addpop{position:absolute;inset:6px;z-index:45;background:var(--ne-surface-2);border:1px solid var(--ne-border);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}
.te2-chip{padding:4px 10px;border-radius:20px;border:1px solid var(--ne-border);font-size:11px;font-weight:600;cursor:pointer;background:transparent;color:var(--ne-text);font-family:inherit}
.te2-chip[aria-pressed=true]{background:var(--ne-accent-soft);color:var(--ne-accent)}
.te2-crumbs{display:flex;align-items:center;gap:4px;min-width:0;flex:1;font-size:11px;color:var(--ne-muted);overflow:hidden;white-space:nowrap}
.te2-crumbs strong{color:var(--ne-text);font-size:12.5px;overflow:hidden;text-overflow:ellipsis}
.te2-crumbs button{background:none;border:none;padding:0;color:var(--ne-muted);cursor:pointer;font:inherit;text-decoration:underline}
.te2-alert{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:7px 10px;font-size:11.5px;border-bottom:1px solid var(--ne-border)}
.te2-skel{border-radius:10px;background:linear-gradient(90deg,var(--ne-surface),var(--ne-border),var(--ne-surface));background-size:200% 100%;animation:te2sk 1.2s linear infinite}
@keyframes te2sk{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.te2-skel{animation:none}}
@media (max-width: 900px){
  .te2-left{position:absolute;z-index:50;inset:6px auto 6px 6px;width:min(348px,calc(100% - 12px));display:none;box-shadow:0 14px 40px rgba(0,0,0,.35)}
  .te2-body.panel-open .te2-left{display:flex}
  .te2-fab{display:inline-flex}
}
`;

function Skeleton({ t }) {
  return (
    <div className="te-root te2-root" aria-busy="true">
      <style>{EDITOR_CSS + V2_CSS}</style>
      <div className="te2-body">
        <div className="te2-left" style={{ padding: 10, gap: 8, display: "flex", flexDirection: "column" }}>
          <span role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t("themeEditor.loading")}</span>
          {[60, 80, 40, 90, 85, 70, 75, 65].map((w, i) => <div key={i} className="te2-skel" style={{ width: `${w}%`, height: 26 }} />)}
        </div>
        <div className="te2-stage"><div className="te2-skel" style={{ margin: 0, flex: 1, borderRadius: 14 }} /></div>
      </div>
    </div>
  );
}

/** thin scrollbar drawn outside the preview frame(s), driven by the frames' scroll reports */
function ScrollBar({ metrics, dual, onScrollTo, label }) {
  const ref = useRef(null);
  const [trackPx, setTrackPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setTrackPx(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const geo = metrics && trackPx ? thumbGeometry(metrics, trackPx, dual) : null;
  const startDrag = (e) => {
    if (!geo || !metrics) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const start = geo.offset;
    setDragging(true);
    const move = (ev) => onScrollTo(topFromThumb(start + ev.clientY - startY, metrics, trackPx, dual));
    const up = () => { setDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const trackClick = (e) => {
    if (!geo || !metrics || e.target !== ref.current) return;
    const y = e.clientY - ref.current.getBoundingClientRect().top;
    onScrollTo(topFromThumb(y - geo.size / 2, metrics, trackPx, dual));
  };
  return (
    <div ref={ref} className="te2-sbar" role="scrollbar" aria-label={label} aria-orientation="vertical" aria-controls="te2-preview"
      aria-valuenow={metrics ? Math.round(metrics.top) : 0} aria-valuemin={0} aria-valuemax={metrics ? Math.max(0, metrics.height - metrics.client) : 0}
      onPointerDown={trackClick} style={{ visibility: geo ? "visible" : "hidden" }}>
      {geo && <span className={dragging ? "drag" : ""} style={{ top: geo.offset, height: geo.size }} onPointerDown={startDrag} />}
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
  const [dual, setDual] = useState(false);
  const [inspector, setInspector] = useState(() => readInspector(typeof localStorage === "undefined" ? null : localStorage));
  const [panelOpen, setPanelOpen] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const [addTarget, setAddTarget] = useState(null); // { scope, index }
  const [headMenu, setHeadMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [dialog, setDialog] = useState(null); // leave | publish | savePublished | discard | { draftId }
  const [preview, setPreview] = useState("loading"); // loading | ready | error
  const [previewErr, setPreviewErr] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [drag, setDrag] = useState(null); // tree drag and drop: { kind, scope, sectionId?, id, over, edge }
  const [metrics, setMetrics] = useState(null); // frame 1 scroll metrics for the custom scrollbar
  const frameRefs = useRef({ 1: null, 2: null });
  const pageMenuRef = useRef(null);
  const timer = useRef(null);
  const latest = useRef({});
  const pendingScroll = useRef(null);
  const counters = useRef({ added: 0, deleted: 0, duplicated: 0 });
  const sync = useRef(createScrollSync());

  const draft = hist?.present ?? null;
  const isPublished = status === "published";
  const theme = useMemo(() => (draft ? V2.getTheme(draft.theme_id) : null), [draft]);
  const dualOn = dual && device === "mobile";

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

  /* ------------------------------------------------------------ preview frames */
  const primaryDomain = (store?.store_custom_domains || []).find((d) => d.role === "primary" && d.status === "active")?.domain;
  const liveHost = primaryDomain || (store?.subdomain ? `${store.subdomain}.eneezam.com` : "");
  const liveUrl = liveHost ? `https://${liveHost}` : null;
  const liveOrigin = liveUrl ? new URL(liveUrl).origin : null;
  const pagePath = page === "product" ? (productHandle ? `/product/${encodeURIComponent(productHandle)}` : null) : TEMPLATES.find((tp) => tp.key === page)?.url || "/";
  const frameSrc = liveUrl && pagePath ? `${liveUrl}${pagePath}?preview=1&engine=v2` : null;

  useEffect(() => { latest.current = { draft, token, sel, lang, liveOrigin, inspector, dualOn }; });

  const postTo = useCallback((frame, msg) => {
    const w = frameRefs.current[frame]?.contentWindow;
    if (w && latest.current.liveOrigin) w.postMessage(msg, latest.current.liveOrigin);
  }, []);
  const post = useCallback((msg) => postTo(1, msg), [postTo]);
  const postBoth = useCallback((msg) => { postTo(1, msg); postTo(2, msg); }, [postTo]);
  const runScroll = useCallback((cmds) => { for (const c of cmds) postTo(c.frame, { type: "eneezam:v2-scroll-to", top: c.top }); }, [postTo]);

  useEffect(() => {
    if (!draft) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => postBoth({ type: "eneezam:v2-config", config: latest.current.draft, token: latest.current.token }), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [draft, token, postBoth]);

  // dual view: frame 2 continues below frame 1; switching it on aligns the pair
  useEffect(() => {
    sync.current.dual = dualOn;
    if (!dualOn) sync.current.metrics[2] = null;
    post({ type: "eneezam:v2-dual", dual: dualOn });
    const m = sync.current.metrics[1];
    if (dualOn && m) runScroll(scrollPairTo(sync.current, m.top));
  }, [dualOn, post, runScroll]);

  useEffect(() => { post({ type: "eneezam:v2-inspector", on: inspector }); }, [inspector, post]);

  const scopeOf = (cfg, sectionId) => V2.findSection(cfg, sectionId)?.scope || null;

  const select = useCallback((s, scroll = false) => {
    setSel(s);
    setView("sections");
    setAddTarget(null);
    if (s?.blockId) setExpanded((e) => (e.has(s.sectionId) ? e : new Set(e).add(s.sectionId)));
    post({ type: "eneezam:v2-select", sectionId: s?.sectionId || null, blockId: s?.blockId || null, scroll });
  }, [post]);

  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== latest.current.liveOrigin) return;
      const frame = e.source && e.source === frameRefs.current[1]?.contentWindow ? 1 : e.source && e.source === frameRefs.current[2]?.contentWindow ? 2 : 0;
      if (!frame) return;
      const d = e.data;
      if (!d || typeof d !== "object" || typeof d.type !== "string") return;
      if (d.type === "eneezam:v2-ready") {
        if (frame === 1) setPreview("loading");
        postTo(frame, { type: "eneezam:v2-init", token: latest.current.token, config: latest.current.draft, lang: latest.current.lang === "ur" ? "ur" : "en", role: frame === 2 ? "secondary" : "primary", inspector: latest.current.inspector, dual: latest.current.dualOn });
        return;
      }
      if (d.type === "eneezam:v2-scroll" && [d.top, d.height, d.client].every((n) => typeof n === "number" && Number.isFinite(n))) {
        const report = { top: d.top, height: d.height, client: d.client, programmatic: d.programmatic === true };
        const cmds = onScrollReport(sync.current, frame, report);
        if (frame === 1) setMetrics({ top: d.top, height: d.height, client: d.client });
        runScroll(cmds);
        return;
      }
      if (d.type === "eneezam:v2-applied") {
        if (frame === 2) {
          // keep frame 2 directly below frame 1 after every re-render (content height may have changed)
          const m = sync.current.metrics[1];
          if (m) runScroll(scrollPairTo(sync.current, m.top));
          return;
        }
        setPreview("ready");
        setPreviewErr("");
        const s = latest.current.sel;
        if (pendingScroll.current) {
          post({ type: "eneezam:v2-select", ...pendingScroll.current, scroll: true });
          pendingScroll.current = null;
        } else if (s) post({ type: "eneezam:v2-select", sectionId: s.sectionId, blockId: s.blockId, scroll: false });
        return;
      }
      if (frame !== 1) return; // frame 2 of the dual view is view-only: no selection, hover or insert events
      if (d.type === "eneezam:v2-click" && typeof d.sectionId === "string") {
        if (!latest.current.inspector) return;
        const scope = scopeOf(latest.current.draft, d.sectionId);
        if (!scope) return;
        select({ scope, sectionId: d.sectionId, blockId: typeof d.blockId === "string" ? d.blockId : null }, false);
        setPanelOpen(true);
      } else if (d.type === "eneezam:v2-hover-preview") {
        const scope = latest.current.inspector && typeof d.sectionId === "string" ? scopeOf(latest.current.draft, d.sectionId) : null;
        setHov(scope ? { scope, sectionId: d.sectionId, blockId: typeof d.blockId === "string" ? d.blockId : null } : null);
      } else if (d.type === "eneezam:v2-insert" && typeof d.sectionId === "string" && (d.edge === "before" || d.edge === "after")) {
        if (!latest.current.inspector) return;
        const at = V2.insertPointFor(latest.current.draft, d.sectionId, d.edge);
        if (!at || !V2.addableSections(latest.current.draft, at.scope).length) return;
        setSel(null);
        setView("sections");
        setPanelOpen(true);
        setAddTarget(at);
      } else if (d.type === "eneezam:v2-error") {
        setPreview("error");
        setPreviewErr(String(d.error || ""));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post, postTo, runScroll, select]);

  /* ------------------------------------------------------------ editing */
  const commit = useCallback((fn, key) => setHist((h) => (h ? pushState(h, fn(h.present), { key }) : h)), []);

  const act = {
    select,
    hover: (h) => { setHov(h); post({ type: "eneezam:v2-hover", sectionId: h?.sectionId || null, blockId: h?.blockId || null, scroll: !!h }); },
    toggleExpand: (id) => setExpanded((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    addSection: (scope, type, index) => {
      const r = V2.addSection(draft, scope, type, Number.isInteger(index) ? { index } : { afterId: sel?.scope === scope && !sel.blockId ? sel.sectionId : undefined });
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
    if (!sel) return;
    if (sel.blockId) commit((d) => V2.setBlockSetting(d, sel.scope, sel.sectionId, sel.blockId, key, value), `${sel.sectionId}.${sel.blockId}.${key}`);
    else commit((d) => V2.setSectionSetting(d, sel.scope, sel.sectionId, key, value), `${sel.sectionId}.${key}`);
  };
  const onThemeField = (key, value) => commit((d) => V2.setThemeSetting(d, key, value), `set.${key}`);
  const onMeta = (patch, key) => {
    if (!metaProductId) return;
    commit((d) => ({ ...d, product_meta: { ...(d.product_meta || {}), [metaProductId]: { ...(d.product_meta?.[metaProductId] || {}), ...patch } } }), `meta.${metaProductId}.${key}`);
  };

  const doUndo = useCallback(() => setHist((h) => (h ? undo(h) : h)), []);
  const doRedo = useCallback(() => setHist((h) => (h ? redo(h) : h)), []);
  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== savedJson, [draft, savedJson]);

  const switchView = useCallback((key) => {
    setView(key);
    setSel(null);
    setAddTarget(null);
    post({ type: "eneezam:v2-select", sectionId: null, blockId: null });
    setPanelOpen(true);
  }, [post]);
  const toggleInspector = useCallback(() => setInspector((on) => {
    writeInspector(typeof localStorage === "undefined" ? null : localStorage, !on);
    if (on) setHov(null);
    return !on;
  }), []);

  /* ------------------------------------------------------------ save / publish / discard / save as draft */
  const failText = (err, key) => (err instanceof TypeError ? t("onlineStore.networkError") : err?.message || t(key));

  const doSave = async () => {
    if (!draft || !store || saving) return false;
    setSaving(true);
    setSaveError("");
    try {
      const body = { theme_id: themeId, theme_config: draft };
      if (isPublished) body.confirm_published = true;
      const res = await fetch(`${CF_URL}/update-store-theme`, { method: "PUT", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) {
        setSaveError(data.reason === "invalid_theme_config" ? t("themeEditor.v2.invalidConfig").replace("{n}", String(data.errors?.length || 0)) : data.error || t("themeEditor.saveFailed"));
        return false;
      }
      setSavedJson(JSON.stringify(draft));
      setSavedAt(new Date());
      logActivity(isPublished ? "theme_published_saved" : "theme_config_saved", { theme_id: themeId, engine: "v2", theme: draft.theme_id, ...counters.current });
      counters.current = { added: 0, deleted: 0, duplicated: 0 };
      return true;
    } catch (err) {
      setSaveError(failText(err, "themeEditor.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };
  // a published theme is the live store: always confirm first
  const requestSave = () => {
    if (!dirty || saving) return;
    if (isPublished) setDialog("savePublished");
    else doSave();
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

  const doDiscard = () => {
    setDialog(null);
    if (!savedJson) return;
    setHist(createHistory(JSON.parse(savedJson)));
    setSel(null);
    counters.current = { added: 0, deleted: 0, duplicated: 0 };
    logActivity("theme_changes_discarded", { theme_id: themeId, engine: "v2" });
  };

  const handleSaveAsDraft = async () => {
    if (!store || !draft || savingDraft) return;
    setSavingDraft(true);
    setSaveError("");
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const request = async (path, { method, body }) => (await fetch(`${CF_URL}${path}`, { method, headers, body: JSON.stringify(body) })).json();
      const name = `${themeName || t("themeEditor.untitled")} (${t("themeEditor.v2.draftSuffix")})`;
      const r = await saveAsDraft({ request, storeId: store.id, themeId, name, config: draft });
      if (!r.ok) { setSaveError(r.error || t("themeEditor.v2.saveAsDraftFailed")); return; }
      logActivity("theme_saved_as_draft", { from_theme_id: themeId, to_theme_id: r.draftId, engine: "v2" });
      setDialog({ draftId: r.draftId });
    } catch (err) {
      setSaveError(failText(err, "themeEditor.v2.saveAsDraftFailed"));
    } finally {
      setSavingDraft(false);
    }
  };

  /* ------------------------------------------------------------ keyboard */
  useEffect(() => {
    function onKey(e) {
      const action = matchShortcut(e, isTypingTarget(e.target));
      if (!action || dialog) return;
      e.preventDefault();
      if (action === "undo") doUndo();
      else if (action === "redo") doRedo();
      else if (action === "save") requestSave();
      else if (action === "inspector") toggleInspector();
      else switchView(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  const goBack = () => { if (dirty) setDialog("leave"); else onNavigate?.("online-store"); };
  const switchPage = (key) => { setPage(key); setSel(null); setHov(null); setPageMenu(false); setPreview("loading"); setMetrics(null); };

  /* ------------------------------------------------------------ render */
  if (loading && storeId && themeId) return <Skeleton t={t} />;
  if (loadError || !store || !draft || !theme) {
    return (
      <div className="te-root te2-root">
        <style>{EDITOR_CSS + V2_CSS}</style>
        <div style={{ margin: "auto", maxWidth: 440, width: "100%", padding: 16 }}>
          <button className="te-btn" onClick={() => onNavigate?.("online-store")} style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="chevronLeft" size={13} />{t("themeEditor.backButton")}</button>
          <div role="alert" style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-danger)" }}>{loadError || t("themeEditor.loadFailed")}</div>
        </div>
      </div>
    );
  }

  const pageLabel = t(TEMPLATES.find((tp) => tp.key === page).labelKey);
  const groupTitle = (scope) => (scope === "header" ? t("themeEditor.v2.headerGroup") : scope === "footer" ? t("themeEditor.v2.footerGroup") : t("themeEditor.v2.templateGroup"));
  const panelTitle = view === "theme" ? t("themeEditor.themeSettings") : view === "products" ? t("themeEditor.productDetails") : pageLabel;
  const selName = selSection ? sl(`s.${selSection.type}`) : "";
  const tab = (key, icon, label) => (
    <Tip key={key} label={label} keys={SHORTCUTS[key]}>
      <button type="button" className="te2-tab" aria-pressed={view === key} aria-label={label} onClick={() => switchView(key)}>
        <Icon name={icon} size={16} />
      </button>
    </Tip>
  );
  const frames = dualOn ? [1, 2] : [1];
  const statusText = saving ? t("themeEditor.saving") : dirty ? t("themeEditor.unsaved") : savedAt ? `${t("themeEditor.savedPrefix")} ${savedAt.toLocaleTimeString()}` : "";

  return (
    <div className="te-root te2-root">
      <style>{EDITOR_CSS + V2_CSS}</style>
      <div className={`te2-body${panelOpen ? " panel-open" : ""}`}>
        <aside className="te2-left" aria-label={t("themeEditor.tools")}>
          {/* row 1: back, name, status, undo, redo, save */}
          <div className="te2-bar">
            <Tip label={t("themeEditor.backTitle")}>
              <button className="te-ibtn" onClick={goBack} aria-label={t("themeEditor.backButton")}><Icon name="chevronLeft" size={15} /></button>
            </Tip>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span className="te2-name" title={themeName}>{themeName || t("themeEditor.untitled")}</span>
                <span className="te2-badge" style={{ background: isPublished ? "var(--ne-success-soft)" : "var(--ne-warning-soft)", color: isPublished ? "var(--ne-success)" : "var(--ne-warning)" }}>{isPublished ? t("themeEditor.publishedBadge") : t("themeEditor.draftBadge")}</span>
              </div>
              <span className="te2-dirty" aria-live="polite" style={{ color: dirty ? "var(--ne-warning)" : "var(--ne-muted)", minHeight: 13 }}>{statusText}</span>
            </div>
            <Tip label={t("themeEditor.undo")} keys={SHORTCUTS.undo}><button className="te-ibtn" onClick={doUndo} disabled={!canUndo(hist)} aria-label={t("themeEditor.undo")}><Icon name="undo" size={15} /></button></Tip>
            <Tip label={t("themeEditor.redo")} keys={SHORTCUTS.redo}><button className="te-ibtn" onClick={doRedo} disabled={!canRedo(hist)} aria-label={t("themeEditor.redo")}><Icon name="redo" size={15} /></button></Tip>
            <Tip label={isPublished ? t("themeEditor.v2.saveLive") : t("themeEditor.saveButton")} keys={SHORTCUTS.save}>
              <button className="te-btn primary" onClick={requestSave} disabled={saving || !dirty}>{saving ? t("themeEditor.saving") : t("themeEditor.saveButton")}</button>
            </Tip>
            <button className="te-ibtn te-narrow-only" onClick={() => setPanelOpen(false)} aria-label={t("themeEditor.closePanel")}><Icon name="close" size={14} /></button>
          </div>

          {/* row 2: page, device, inspector, (dual), publish / discard + save as draft */}
          <div className="te2-bar">
            <div ref={pageMenuRef} style={{ position: "relative", flex: 1, minWidth: 120 }}>
              <button className="te-btn" aria-haspopup="menu" aria-expanded={pageMenu} onClick={() => setPageMenu((v) => !v)} style={{ width: "100%", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, overflow: "hidden" }}><Icon name="home" size={13} />{pageLabel}</span><Icon name="chevronDown" size={12} />
              </button>
              {pageMenu && (
                <div className="te-pop" role="menu" style={{ top: "calc(100% + 4px)", insetInlineStart: 0, minWidth: 180 }}>
                  {TEMPLATES.map((tp) => (
                    <button key={tp.key} role="menuitem" className="te-popitem" aria-current={page === tp.key} onClick={() => switchPage(tp.key)}>{t(tp.labelKey)}</button>
                  ))}
                </div>
              )}
            </div>
            {device === "desktop" ? (
              <Tip label={t("themeEditor.v2.mobileView")}><button className="te-ibtn" onClick={() => setDevice("mobile")} aria-label={t("themeEditor.v2.mobileView")}><Icon name="mobile" size={15} /></button></Tip>
            ) : (
              <Tip label={t("themeEditor.v2.desktopView")}><button className="te-ibtn" onClick={() => { setDevice("desktop"); }} aria-label={t("themeEditor.v2.desktopView")}><Icon name="desktop" size={15} /></button></Tip>
            )}
            {device === "mobile" && (
              <Tip label={t("themeEditor.v2.dualView")}><button className="te-ibtn" aria-pressed={dual} onClick={() => setDual((v) => !v)} aria-label={t("themeEditor.v2.dualView")}><Icon name="copy" size={15} /></button></Tip>
            )}
            <Tip label={inspector ? t("themeEditor.v2.inspectorOff") : t("themeEditor.v2.inspectorOn")} keys={SHORTCUTS.inspector}>
              <button className="te-ibtn" aria-pressed={inspector} onClick={toggleInspector} aria-label={inspector ? t("themeEditor.v2.inspectorOff") : t("themeEditor.v2.inspectorOn")}><Icon name="search" size={15} /></button>
            </Tip>
            {isPublished ? (
              <>
                <Tip label={t("themeEditor.v2.discardTitle")}><button className="te-btn" onClick={() => (dirty ? setDialog("discard") : null)} disabled={!dirty}>{t("themeEditor.v2.discard")}</button></Tip>
                <Tip label={t("themeEditor.v2.saveAsDraftTitle")}><button className="te-btn" onClick={handleSaveAsDraft} disabled={savingDraft}>{savingDraft ? t("themeEditor.saving") : t("themeEditor.v2.saveAsDraft")}</button></Tip>
              </>
            ) : (
              <Tip label={dirty ? t("themeEditor.saveFirst") : t("themeEditor.publishButton")}>
                <button className="te-btn" onClick={() => setDialog("publish")} disabled={publishing || dirty}>{publishing ? t("themeEditor.publishing") : t("themeEditor.publishButton")}</button>
              </Tip>
            )}
          </div>

          {/* row 3: tabs (former icon rail) */}
          <nav className="te2-tabs" aria-label={t("themeEditor.tools")}>
            {tab("sections", "layout", t("themeEditor.sections"))}
            {tab("theme", "palette", t("themeEditor.themeSettings"))}
            {tab("products", "tag", t("themeEditor.productDetails"))}
          </nav>

          {(saveError || publishError) && (
            <div role="alert" className="te2-alert" style={{ background: "var(--ne-danger-soft)", color: "var(--ne-danger)" }}>
              <span>{saveError || publishError}</span>
              <button className="te-btn" onClick={() => { setSaveError(""); setPublishError(""); }} style={{ color: "inherit", borderColor: "currentColor", height: 26 }}>{t("themeEditor.dismiss")}</button>
            </div>
          )}

          <div className="te2-ph">
            {showSettings ? (
              <>
                <button className="te-ibtn" onClick={() => (sel.blockId ? select({ ...sel, blockId: null }) : select(null))} title={t("themeEditor.backToSections")} aria-label={t("themeEditor.backToSections")}><Icon name="chevronLeft" size={14} /></button>
                <nav className="te2-crumbs" aria-label={t("themeEditor.v2.breadcrumb")}>
                  <span>{groupTitle(sel.scope)}</span><Icon name="chevronRight" size={10} />
                  {selBlock ? (
                    <><button type="button" onClick={() => select({ ...sel, blockId: null }, true)}>{selName}</button><Icon name="chevronRight" size={10} /><strong>{sl(`b.${selBlock.type}`)}</strong></>
                  ) : <strong>{selName}</strong>}
                </nav>
                {(selBlock || !selDef?.locked) && <SelectionMenu cfg={draft} sel={sel} isBlock={!!selBlock} act={act} t={t} open={headMenu} setOpen={setHeadMenu} />}
              </>
            ) : <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{panelTitle}</span>}
          </div>

          <div className="te2-scroll">
            {view === "sections" && !showSettings && (
              <>
                <p style={{ margin: "0 4px 10px", fontSize: 11, color: "var(--ne-muted)", lineHeight: 1.45 }}>{inspector ? t("themeEditor.v2.inspectorHint") : t("themeEditor.v2.inspectorOffHint")}</p>
                <Tree cfg={draft} theme={theme} page={page} t={t} sl={sl} sel={sel} hov={hov} readOnly={false} expanded={expanded}
                  drag={drag} setDrag={setDrag} act={act} onOpenAdd={(scope, index) => setAddTarget({ scope, index })} />
              </>
            )}
            {showSettings && (() => {
              const fields = selBlock ? selBlockDef?.settings || [] : selDef?.settings || [];
              const values = selBlock ? selBlock.settings : selSection.settings;
              return (
                <>
                  {fields.length ? <SchemaFields fields={fields} values={values} onChange={onField} sl={sl} t={t} catalog={products} theme={theme} settings={draft.settings} />
                    : <p style={{ color: "var(--ne-muted)" }}>{t("themeEditor.v2.noSettings")}</p>}
                  {!selBlock && selDef?.blocks?.length > 0 && <p style={{ color: "var(--ne-muted)", marginTop: 4 }}>{t("themeEditor.v2.blocksInTree")}</p>}
                </>
              );
            })()}
            {view === "theme" && <div className="te2-ts"><ThemeSettingsV2 theme={theme} settings={draft.settings} onChange={onThemeField} sl={sl} t={t} catalog={products} /></div>}
            {view === "products" && <ProductMetaPanel t={t} products={products} productId={metaProductId} onProductId={setMetaProductId} meta={draft.product_meta?.[metaProductId]} onMeta={onMeta} />}
          </div>

          {addTarget && (
            <AddSectionPopup cfg={draft} theme={theme} scope={addTarget.scope} t={t} sl={sl} onClose={() => setAddTarget(null)}
              onPick={(type) => { const at = addTarget; setAddTarget(null); act.addSection(at.scope, type, at.index); }} />
          )}
        </aside>

        <main className="te2-stage" id="te2-preview" aria-label={t("themeEditor.previewLabel")}>
          <button className="te-btn te2-fab" onClick={() => setPanelOpen(true)} aria-label={t("themeEditor.togglePanel")}><Icon name="layout" size={14} />{t("themeEditor.sections")}</button>
          {frameSrc ? (
            <>
              <div className={`te2-pair ${device}`}>
                {frames.map((n) => (
                  <iframe key={`${n}:${frameSrc}#${frameKey}`} ref={(el) => { frameRefs.current[n] = el; }} className={`te2-frame${device === "mobile" ? " mobile" : ""}`}
                    src={frameSrc} title={n === 1 ? t("themeEditor.previewLabel") : t("themeEditor.v2.previewContinued")} referrerPolicy="no-referrer" data-frame={n} />
                ))}
                <ScrollBar metrics={metrics} dual={dualOn} label={t("themeEditor.v2.scrollPreview")} onScrollTo={(top) => runScroll(scrollPairTo(sync.current, top))} />
              </div>
              {preview === "loading" && <span className="te2-chipstate" role="status">{t("themeEditor.v2.previewLoading")}</span>}
              {preview === "error" && (
                <div className="te2-chipstate" role="alert" style={{ color: "var(--ne-danger)", display: "flex", gap: 10, alignItems: "center" }}>
                  <span>{t("themeEditor.v2.previewError")}{previewErr ? ` (${previewErr})` : ""}</span>
                  <button className="te-btn" style={{ height: 26 }} onClick={() => { setPreview("loading"); setFrameKey((k) => k + 1); }}>{t("onlineStore.retry")}</button>
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
              {!isPublished && <button className="te-btn primary" onClick={async () => { setDialog(null); if (await doSave()) onNavigate?.("online-store"); }}>{t("themeEditor.saveAndLeave")}</button>}
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
      {dialog === "savePublished" && (
        <Dialog title={t("themeEditor.v2.saveLiveTitle")} body={t("themeEditor.v2.saveLiveBody").replace("{domain}", liveHost || store.store_name || "")} onClose={() => setDialog(null)}
          actions={(
            <>
              <button className="te-btn" onClick={() => setDialog(null)}>{t("themeEditor.cancel")}</button>
              <button className="te-btn primary" onClick={async () => { setDialog(null); await doSave(); }}>{t("themeEditor.v2.saveLiveConfirm")}</button>
            </>
          )} />
      )}
      {dialog === "discard" && (
        <Dialog title={t("themeEditor.v2.discardTitle")} body={t("themeEditor.v2.discardBody")} onClose={() => setDialog(null)}
          actions={(
            <>
              <button className="te-btn" onClick={() => setDialog(null)}>{t("themeEditor.keepEditing")}</button>
              <button className="te-btn" style={{ color: "var(--ne-danger)" }} onClick={doDiscard}>{t("themeEditor.v2.discard")}</button>
            </>
          )} />
      )}
      {dialog && typeof dialog === "object" && dialog.draftId && (
        <Dialog title={t("themeEditor.v2.draftCreatedTitle")} body={t("themeEditor.v2.draftCreatedBody")} onClose={() => setDialog(null)}
          actions={(
            <>
              <button className="te-btn" onClick={() => setDialog(null)}>{t("themeEditor.v2.stayHere")}</button>
              <button className="te-btn primary" onClick={() => { const id = dialog.draftId; setDialog(null); onOpenThemeEditor?.(id); }}>{t("themeEditor.v2.openDraft")}</button>
            </>
          )} />
      )}
    </div>
  );
}
