import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { getStorefrontTheme } from "../lib/storefrontThemes";
import { isV2, NOVA_ID, NOVA_NAME, createDefaultConfig } from "../lib/themeV2/engine.generated";
import { formatStoreDate, useStoreTimeZone } from "../lib/dates";
import StoreMetricsStrip from "../components/StoreMetricsStrip";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
// Per-row /get-store-theme lookups (for thumbnail theme numbers) are skipped past this many
// themes, since /list-store-themes doesn't return theme_config; rows then fall back to theme 1.
const MAX_THEME_LOOKUPS = 20;
const PREVIEW_W = 1280;

const btnPrimary = (disabled) => ({
  background: disabled ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9,
  padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
});
const btnGhost = (disabled) => ({
  background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)", borderRadius: 9,
  padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
});
const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14 };
const sectionTitle = { margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ne-text)" };

// Miniature of a v2 theme package, drawn from its default color scheme 1 (no images, CSS only).
const NOVA_DEFAULTS = createDefaultConfig(NOVA_ID).settings;
function NovaThumb() {
  const s = NOVA_DEFAULTS;
  return (
    <div aria-hidden="true" style={{ width: "100%", aspectRatio: "16 / 10", background: s.scheme_1_bg, borderRadius: 8, overflow: "hidden", border: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ height: "8%", background: s.scheme_3_bg }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4% 6%" }}>
        <div style={{ width: "22%", height: 5, background: s.scheme_1_text, borderRadius: 2 }} />
        <div style={{ display: "flex", gap: 4 }}>{[0, 1].map((i) => <div key={i} style={{ width: 12, height: 3, background: s.scheme_1_muted, borderRadius: 2 }} />)}</div>
      </div>
      <div style={{ flex: 1.4, background: s.scheme_3_bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5 }}>
        <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: s.scheme_3_text, fontWeight: 800, fontSize: 13, lineHeight: 1 }}>Aa</span>
        <div style={{ width: "22%", height: 7, background: s.scheme_3_button, borderRadius: 4 }} />
      </div>
      <div style={{ flex: 1, display: "flex", gap: "4%", padding: "5% 6%" }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ flex: 1, background: s.scheme_1_surface, borderRadius: 4 }} />)}
      </div>
    </div>
  );
}

// CSS-only miniature of a storefront theme, drawn from that theme's colours/fonts/radius.
function ThemeThumb({ themeNo }) {
  if (themeNo === NOVA_ID) return <NovaThumb />;
  const th = getStorefrontTheme(themeNo);
  const c = th.colors;
  const r = `min(${th.radius}, 8px)`;
  return (
    <div aria-hidden="true" style={{
      width: "100%", aspectRatio: "16 / 10", background: c.bg, borderRadius: 8, overflow: "hidden",
      border: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", padding: "6%", gap: "6%",
      boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: "26%", height: 5, background: c.text, borderRadius: 2 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 12, height: 3, background: c.textMuted, borderRadius: 2 }} />)}
        </div>
      </div>
      <div style={{ flex: 1.3, background: c.surface, border: `1px solid ${c.border}`, borderRadius: r, display: "flex", flexDirection: "column", justifyContent: "center", gap: 5, padding: "0 8%" }}>
        <span style={{ fontFamily: th.headingFont, color: c.text, fontWeight: 700, fontSize: 13, lineHeight: 1 }}>Aa</span>
        <div style={{ width: "34%", height: 7, background: c.accent, borderRadius: r }} />
      </div>
      <div style={{ flex: 1, display: "flex", gap: "5%" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: r }} />
        ))}
      </div>
    </div>
  );
}

// Scaled-down, non-interactive live render of the store.
function LivePreview({ url, title, fill }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / PREVIEW_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={boxRef} style={{
      position: "relative", width: "100%", overflow: "hidden", background: "var(--ne-surface)",
      ...(fill ? { height: "100%" } : { aspectRatio: "16 / 10", borderRadius: 10, border: "1px solid var(--ne-border)" }),
    }}>
      <iframe
        src={url}
        title={title}
        loading="lazy"
        tabIndex={-1}
        sandbox="allow-scripts allow-same-origin"
        style={{
          position: "absolute", top: 0, left: 0, width: PREVIEW_W, height: PREVIEW_W * 10 / 16, border: 0,
          transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none", background: "#fff",
        }}
      />
    </div>
  );
}

function MoreMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} aria-label={label} title={label} style={{ ...btnGhost(false), padding: "7px 9px" }}>
        <Icon name="moreHorizontal" size={16} />
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", minWidth: 170, background: "var(--ne-surface-2)",
          border: "1px solid var(--ne-border)", borderRadius: 10, padding: 4, zIndex: 50, boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        }}>
          {items.map((it) => (
            <button key={it.key} disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none",
                padding: "8px 10px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, textAlign: "left",
                color: it.danger ? "var(--ne-danger)" : "var(--ne-text)", cursor: it.disabled ? "not-allowed" : "pointer",
                opacity: it.disabled ? 0.5 : 1,
              }}>
              {it.icon && <Icon name={it.icon} size={13} />} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OnlineStore({ storeId, onOpenThemeEditor }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [themes, setThemes] = useState([]);
  const [themeNumbers, setThemeNumbers] = useState({});
  const [themesError, setThemesError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [range, setRange] = useState(30); // days: 7 / 30 / 90
  const [showNewInput, setShowNewInput] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [rowBusy, setRowBusy] = useState({});
  const [rowError, setRowError] = useState({});
  const [libBusy, setLibBusy] = useState({});
  const [retryAction, setRetryAction] = useState(null); // what the Retry button next to a themes error runs
  const [toast, setToast] = useState("");
  const tz = useStoreTimeZone(storeId, CF_URL);
  const dateLabel = (iso) => formatStoreDate(iso, tz, { time: false });
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };
  // a browser-level failure (no response at all: offline, blocked, refused) gets a readable message, never the raw "Failed to fetch"
  const failText = (err, fallbackKey) => (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err?.message || "")) ? t("onlineStore.networkError") : (err?.message || t(fallbackKey)));

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

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };

  const fetchStore = async () => {
    if (!storeId) {
      setStore(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("stores")
      .select("id, store_name, platform, subdomain, theme_id, store_custom_domains(domain, role, status)")
      .eq("id", storeId)
      .maybeSingle();
    setStore(data || null);
    setLoading(false);
  };

  const fetchThemeNumbers = async (list) => {
    if (!list.length || list.length > MAX_THEME_LOOKUPS) { setThemeNumbers({}); return; }
    const headers = await authHeaders();
    const entries = await Promise.all(list.map(async (th) => {
      try {
        const res = await fetch(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(th.id)}`, { headers });
        const data = await res.json();
        const cfg = data.theme?.theme_config;
        return [th.id, isV2(cfg) ? cfg.theme_id : Number(cfg?.settings?.active_theme_id) || 1];
      } catch {
        return [th.id, 1];
      }
    }));
    setThemeNumbers(Object.fromEntries(entries));
  };

  const fetchThemes = useCallback(async () => {
    if (!storeId) return;
    setThemesError(""); setRetryAction(null);
    try {
      const res = await fetch(`${CF_URL}/list-store-themes?store_id=${encodeURIComponent(storeId)}`, { headers: await authHeaders() });
      const data = await res.json();
      if (!data.themes) {
        setThemesError(data.error || t("onlineStore.themesLoadError"));
        setRetryAction(() => () => fetchThemes());
        setThemes([]);
        return;
      }
      setThemes(data.themes);
      fetchThemeNumbers(data.themes);
    } catch (err) {
      setThemesError(failText(err, "onlineStore.themesLoadError"));
      setRetryAction(() => () => fetchThemes());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const fetchStats = useCallback(async () => {
    if (!storeId) return;
    setStatsLoading(true);
    setStatsError("");
    try {
      const res = await fetch(`${CF_URL}/get-performance-stats?store_id=${encodeURIComponent(storeId)}&days=${range}`, { headers: await authHeaders() });
      const data = await res.json();
      if (data.error) {
        setStatsError(t("onlineStore.statsError"));
        setStats(null);
        return;
      }
      setStats(data);
    } catch (err) {
      setStatsError(failText(err, "onlineStore.statsError"));
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, range]);

  useEffect(() => {
    setLoading(true);
    fetchStore();
    fetchThemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const primaryDomain = (store?.store_custom_domains || []).find((d) => d.role === "primary" && d.status === "active")?.domain;
  const liveUrl = primaryDomain ? `https://${primaryDomain}` : store?.subdomain ? `https://${store.subdomain}.eneezam.com` : null;
  const liveHost = liveUrl ? liveUrl.replace(/^https:\/\//, "") : "";
  const publishedTheme = themes.find((th) => th.status === "published") || null;
  const draftThemes = themes.filter((th) => th.status !== "published").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const handleViewStore = () => {
    if (!liveUrl) return;
    logActivity(store.id, "online_store_viewed", { url: liveUrl });
    window.open(liveUrl, "_blank", "noopener,noreferrer");
  };

  const handleCreateTheme = async (sourceThemeId) => {
    if (!store) return;
    setCreating(true);
    setThemesError(""); setRetryAction(null);
    try {
      const res = await fetch(`${CF_URL}/create-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ store_id: store.id, name: newThemeName.trim() || undefined, source_theme_id: sourceThemeId || undefined }),
      });
      const data = await res.json();
      if (!data.theme) {
        setThemesError(data.error || t("onlineStore.createError"));
        setRetryAction(() => () => handleCreateTheme(sourceThemeId));
        return;
      }
      setNewThemeName("");
      setShowNewInput(false);
      logActivity(store.id, "theme_created", { theme_id: data.theme.id });
      await fetchThemes();
      onOpenThemeEditor?.(data.theme.id);
    } catch (err) {
      setThemesError(failText(err, "onlineStore.createError"));
      setRetryAction(() => () => handleCreateTheme(sourceThemeId));
    } finally {
      setCreating(false);
    }
  };

  // New theme / library "Add": a new draft built by the worker from the theme package's complete default config.
  const handleCreatePreset = async (preset, name, { open } = {}) => {
    if (!store) return;
    setLibBusy((p) => ({ ...p, [preset]: true }));
    setCreating(true);
    setThemesError(""); setRetryAction(null);
    try {
      const res = await fetch(`${CF_URL}/create-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ store_id: store.id, name: name || NOVA_NAME, preset }),
      });
      const data = await res.json();
      if (!data.theme) throw new Error(data.error || t("onlineStore.createError"));
      logActivity(store.id, "theme_created", { theme_id: data.theme.id, preset });
      setNewThemeName("");
      setShowNewInput(false);
      await fetchThemes();
      if (open) onOpenThemeEditor?.(data.theme.id);
      else showToast(t("onlineStore.addedToast").replace("{name}", name || NOVA_NAME));
    } catch (err) {
      setThemesError(failText(err, "onlineStore.createError"));
      setRetryAction(() => () => handleCreatePreset(preset, name, { open }));
    } finally {
      setLibBusy((p) => ({ ...p, [preset]: false }));
      setCreating(false);
    }
  };

  const handlePublish = async (themeId) => {
    setRowBusy((p) => ({ ...p, [themeId]: true }));
    setRowError((p) => ({ ...p, [themeId]: "" }));
    try {
      const res = await fetch(`${CF_URL}/publish-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ theme_id: themeId }),
      });
      const data = await res.json();
      if (!data.success) {
        setRowError((p) => ({ ...p, [themeId]: data.error || t("onlineStore.publishError") }));
        return;
      }
      logActivity(store.id, "theme_published", { theme_id: themeId });
      await fetchThemes();
    } catch (err) {
      setRowError((p) => ({ ...p, [themeId]: failText(err, "onlineStore.publishError") }));
    } finally {
      setRowBusy((p) => ({ ...p, [themeId]: false }));
    }
  };

  const handleDelete = async (themeId) => {
    if (!window.confirm(t("onlineStore.deleteConfirm"))) return;
    setRowBusy((p) => ({ ...p, [themeId]: true }));
    setRowError((p) => ({ ...p, [themeId]: "" }));
    try {
      const res = await fetch(`${CF_URL}/delete-store-theme`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ theme_id: themeId }),
      });
      const data = await res.json();
      if (!data.success) {
        setRowError((p) => ({ ...p, [themeId]: data.error || t("onlineStore.deleteError") }));
        return;
      }
      logActivity(store.id, "theme_deleted", { theme_id: themeId });
      await fetchThemes();
    } catch (err) {
      setRowError((p) => ({ ...p, [themeId]: failText(err, "onlineStore.deleteError") }));
    } finally {
      setRowBusy((p) => ({ ...p, [themeId]: false }));
    }
  };

  if (loading) {
    return <div style={{ padding: "1.5rem", color: "var(--ne-muted)" }}>{t("onlineStore.loading")}</div>;
  }
  if (!store || store.platform !== "native" || !store.subdomain) {
    return (
      <div style={{ padding: "1.25rem" }}>
        <h2 style={{ color: "var(--ne-text)", marginBottom: 12 }}>{t("onlineStore.title")}</h2>
        <div style={{ ...cardStyle, padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>
          {t("onlineStore.noNativeStores")}
        </div>
      </div>
    );
  }

  const publishedNo = publishedTheme ? themeNumbers[publishedTheme.id] : null;

  return (
    <div style={{ padding: "1.25rem", maxWidth: 1000, margin: "0 auto" }}>
      <h2 style={{ color: "var(--ne-text)", margin: "0 0 4px" }}>{t("onlineStore.title")}</h2>
      <p style={{ color: "var(--ne-muted)", fontSize: 13, margin: "0 0 18px" }}>{t("onlineStore.subtitle")}</p>

      {/* A) Speed + traffic stats */}
      <StoreMetricsStrip range={range} onRange={setRange} stats={stats} loading={statsLoading} error={statsError} onRetry={fetchStats} t={t} />

      {/* B) Current theme: one full-width card, the live preview is the background */}
      <div style={{ ...cardStyle, position: "relative", overflow: "hidden", margin: "18px 0 24px", minHeight: 600, background: "var(--ne-surface)" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          {liveUrl
            ? <LivePreview url={liveUrl} title={t("onlineStore.previewTitle")} fill />
            : <ThemeThumb themeNo={publishedNo || 1} />}
        </div>
        <div style={{ position: "relative", minHeight: 600, display: "flex", alignItems: "flex-end" }}>
          <div style={{
            width: "100%", boxSizing: "border-box", padding: "56px 20px 18px", display: "flex", gap: 14, alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap",
            background: "linear-gradient(to top, rgba(8,10,24,.92) 0%, rgba(8,10,24,.62) 55%, rgba(8,10,24,0) 100%)",
          }}>
            <div style={{ minWidth: 0, flex: "1 1 240px" }}>
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{t("onlineStore.currentThemeLabel")}</p>
              <p style={{ margin: "2px 0 4px", fontSize: 22, fontWeight: 800, color: "#fff", wordBreak: "break-all" }}>{liveHost || "—"}</p>
              {publishedTheme ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,.8)" }}>
                  {publishedTheme.name} · {t("onlineStore.lastSaved")}: {dateLabel(publishedTheme.updated_at)}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,.8)" }}>{t("onlineStore.noPublishedTheme")}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={handleViewStore} disabled={!liveUrl} style={{ ...btnGhost(!liveUrl), background: "rgba(255,255,255,.12)", color: "#fff", borderColor: "rgba(255,255,255,.35)" }}>
                <Icon name="link" size={13} /> {t("onlineStore.viewStoreButton")}
              </button>
              {publishedTheme && (
                <button onClick={() => onOpenThemeEditor?.(publishedTheme.id)} style={btnPrimary(false)}>
                  <Icon name="edit" size={13} /> {t("onlineStore.editThemeButton")}
                </button>
              )}
              {publishedTheme && (
                <MoreMenu label={t("onlineStore.moreActions")} items={[
                  { key: "dup", label: t("onlineStore.duplicateAction"), icon: "clipboard", onClick: () => handleCreateTheme(publishedTheme.id), disabled: creating },
                ]} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* C) Draft themes */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <p style={sectionTitle}>{t("onlineStore.draftThemesLabel")}</p>
          <button onClick={() => setShowNewInput((v) => !v)} style={btnGhost(false)}>
            <Icon name="plus" size={13} /> {t("onlineStore.newShort")}
          </button>
        </div>
        {showNewInput && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input
              autoFocus
              value={newThemeName}
              onChange={(e) => setNewThemeName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !creating) handleCreatePreset(NOVA_ID, newThemeName.trim(), { open: true }); }}
              placeholder={t("onlineStore.newThemeNamePlaceholder")}
              style={{ flex: "1 1 220px", padding: "8px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13 }}
            />
            <button onClick={() => handleCreatePreset(NOVA_ID, newThemeName.trim(), { open: true })} disabled={creating} style={btnPrimary(creating)}>
              {creating ? t("onlineStore.creatingTheme") : t("onlineStore.createAction")}
            </button>
          </div>
        )}
        {themesError && (
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", color: "var(--ne-danger)", fontSize: 12.5, margin: "0 0 10px" }}>
            <span>{themesError}</span>
            {retryAction && <button onClick={() => { const fn = retryAction; fn(); }} style={{ ...btnGhost(false), padding: "4px 10px", fontSize: 12 }}>{t("onlineStore.retry")}</button>}
          </div>
        )}
        {toast && <p role="status" style={{ color: "var(--ne-success)", fontSize: 12.5, margin: "0 0 10px" }}>{toast}</p>}

        <div style={{ ...cardStyle, overflow: "visible" }}>
          {draftThemes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ne-muted)", margin: 0, padding: "1rem 1.25rem" }}>{t("onlineStore.noDraftThemes")}</p>
          ) : (
            draftThemes.map((th, i) => (
              <div key={th.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", flexWrap: "wrap",
                borderTop: i === 0 ? "none" : "1px solid var(--ne-border)",
              }}>
                <div style={{ width: 112, flexShrink: 0 }}>
                  <ThemeThumb themeNo={themeNumbers[th.id] || 1} />
                </div>
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--ne-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("onlineStore.addedLabel")}: {dateLabel(th.created_at)}</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => handlePublish(th.id)} disabled={rowBusy[th.id]} style={btnGhost(rowBusy[th.id])}>
                    {rowBusy[th.id] ? t("onlineStore.busy") : t("onlineStore.publishAction")}
                  </button>
                  <button onClick={() => onOpenThemeEditor?.(th.id)} style={btnPrimary(false)}>
                    {t("onlineStore.editThemeButton")}
                  </button>
                  <MoreMenu label={t("onlineStore.moreActions")} items={[
                    { key: "dup", label: t("onlineStore.duplicateAction"), icon: "clipboard", onClick: () => handleCreateTheme(th.id), disabled: creating },
                    { key: "del", label: t("onlineStore.deleteAction"), icon: "trash", onClick: () => handleDelete(th.id), disabled: rowBusy[th.id], danger: true },
                  ]} />
                </div>
                {rowError[th.id] && <p style={{ width: "100%", margin: 0, color: "var(--ne-danger)", fontSize: 11.5 }}>{rowError[th.id]}</p>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* D) Theme library */}
      <div>
        <p style={{ ...sectionTitle, marginBottom: 4 }}>{t("onlineStore.themeLibraryLabel")}</p>
        <p style={{ fontSize: 12.5, color: "var(--ne-muted)", margin: "0 0 12px" }}>{t("onlineStore.themeLibraryHint")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          <div style={{ ...cardStyle, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <NovaThumb />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{NOVA_NAME}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ne-muted)" }}>{t("onlineStore.byEneezam")} · {t("onlineStore.novaTagline")}</p>
              </div>
              <button onClick={() => handleCreatePreset(NOVA_ID, NOVA_NAME)} disabled={libBusy[NOVA_ID]} style={btnGhost(libBusy[NOVA_ID])}>
                {libBusy[NOVA_ID] ? t("onlineStore.adding") : t("onlineStore.addAction")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
