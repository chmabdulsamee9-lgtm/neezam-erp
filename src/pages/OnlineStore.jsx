import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

function timeLabel(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function OnlineStore({ storeId, onNavigate, onOpenThemeEditor }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [themes, setThemes] = useState([]);
  const [themesError, setThemesError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [newThemeName, setNewThemeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [rowBusy, setRowBusy] = useState({});
  const [rowError, setRowError] = useState({});

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

  const fetchThemes = useCallback(async () => {
    if (!storeId) return;
    setThemesError("");
    try {
      const res = await fetch(`${CF_URL}/list-store-themes?store_id=${encodeURIComponent(storeId)}`, { headers: await authHeaders() });
      const data = await res.json();
      if (!data.themes) {
        setThemesError(data.error || "Themes load nahi hui");
        setThemes([]);
        return;
      }
      setThemes(data.themes);
    } catch (err) {
      setThemesError(err.message);
    }
  }, [storeId]);

  const fetchStats = useCallback(async () => {
    if (!storeId) return;
    setStatsLoading(true);
    setStatsError("");
    try {
      const res = await fetch(`${CF_URL}/get-performance-stats?store_id=${encodeURIComponent(storeId)}&days=30`, { headers: await authHeaders() });
      const data = await res.json();
      if (data.error) {
        setStatsError(data.error);
        setStats(null);
        return;
      }
      setStats(data);
    } catch (err) {
      setStatsError(err.message);
    } finally {
      setStatsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    fetchStore();
    fetchThemes();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const primaryDomain = (store?.store_custom_domains || []).find((d) => d.role === "primary" && d.status === "active")?.domain;
  const liveUrl = primaryDomain ? `https://${primaryDomain}` : store?.subdomain ? `https://${store.subdomain}.eneezam.com` : null;
  const publishedTheme = themes.find((th) => th.status === "published") || null;
  const draftThemes = themes.filter((th) => th.status !== "published");

  const handleViewStore = () => {
    if (!liveUrl) return;
    logActivity(store.id, "online_store_viewed", { url: liveUrl });
    window.open(liveUrl, "_blank", "noopener,noreferrer");
  };

  const handleCreateTheme = async (sourceThemeId) => {
    if (!store) return;
    setCreating(true);
    try {
      const res = await fetch(`${CF_URL}/create-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ store_id: store.id, name: newThemeName.trim() || undefined, source_theme_id: sourceThemeId || undefined }),
      });
      const data = await res.json();
      if (!data.theme) {
        setThemesError(data.error || "Theme create nahi hui");
        return;
      }
      setNewThemeName("");
      logActivity(store.id, "theme_created", { theme_id: data.theme.id });
      await fetchThemes();
      onOpenThemeEditor?.(data.theme.id);
    } catch (err) {
      setThemesError(err.message);
    } finally {
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
        setRowError((p) => ({ ...p, [themeId]: data.error || "Publish nahi hui" }));
        return;
      }
      logActivity(store.id, "theme_published", { theme_id: themeId });
      await fetchThemes();
    } catch (err) {
      setRowError((p) => ({ ...p, [themeId]: err.message }));
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
        setRowError((p) => ({ ...p, [themeId]: data.error || "Delete nahi hui" }));
        return;
      }
      logActivity(store.id, "theme_deleted", { theme_id: themeId });
      await fetchThemes();
    } catch (err) {
      setRowError((p) => ({ ...p, [themeId]: err.message }));
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
        <h2 style={{ color: "#fff", marginBottom: 12 }}>{t("onlineStore.title")}</h2>
        <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>
          {t("onlineStore.noNativeStores")}
        </div>
      </div>
    );
  }

  const statTiles = [
    { key: "lcp_p75", label: "LCP (P75)", unit: "ms", value: stats?.lcp_p75 != null ? Math.round(stats.lcp_p75) : null },
    { key: "inp_p75", label: "INP (P75)", unit: "ms", value: stats?.inp_p75 != null ? Math.round(stats.inp_p75) : null },
    { key: "cls_p75", label: "CLS (P75)", unit: "", value: stats?.cls_p75 != null ? Number(stats.cls_p75).toFixed(3) : null },
    { key: "sessions", label: t("onlineStore.sessionsLabel"), unit: "", value: stats?.sessions ?? null },
  ];
  const hasAnyStats = statTiles.some((s) => s.value != null && s.value !== 0);

  return (
    <div style={{ padding: "1.25rem" }}>
      <h2 style={{ color: "#fff", marginBottom: 4 }}>{t("onlineStore.title")}</h2>
      <p style={{ color: "var(--ne-muted)", fontSize: 13, marginBottom: 20 }}>{t("onlineStore.subtitle")}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: 10, marginBottom: 20, maxWidth: 680 }}>
        {statTiles.map((s) => (
          <div key={s.key} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "12px 14px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ne-text)" }}>
              {statsLoading ? "…" : s.value != null ? `${s.value}${s.unit}` : "—"}
            </p>
          </div>
        ))}
      </div>
      {!statsLoading && !hasAnyStats && !statsError && (
        <p style={{ fontSize: 12, color: "var(--ne-muted)", marginBottom: 20 }}>{t("onlineStore.statsEmpty")}</p>
      )}
      {statsError && <p style={{ fontSize: 12, color: "var(--ne-danger)", marginBottom: 20 }}>{statsError}</p>}

      <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem 1.5rem", maxWidth: 680, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Icon name="shop" size={20} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ne-text)" }}>{store.store_name}</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "var(--ne-muted)" }}>{t("onlineStore.addressLabel")}</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ne-text)", fontWeight: 600 }}>{liveUrl ? liveUrl.replace(/^https:\/\//, "") : "—"}</p>
        </div>
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "var(--ne-muted)" }}>{t("onlineStore.publishedThemeLabel")}</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ne-text)" }}>
            {publishedTheme ? publishedTheme.name : t("onlineStore.noThemeSelected")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleViewStore} disabled={!liveUrl} style={{
            background: liveUrl ? "var(--ne-grad)" : "var(--ne-border)", color: "#fff", border: "none",
            borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: liveUrl ? "pointer" : "not-allowed",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Icon name="link" size={13} /> {t("onlineStore.viewStoreButton")}
          </button>
          {publishedTheme && (
            <button onClick={() => onOpenThemeEditor?.(publishedTheme.id)} style={{
              background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)",
              borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <Icon name="edit" size={13} /> {t("onlineStore.editThemeButton")}
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 680 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}>{t("onlineStore.draftThemesLabel")}</p>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <input
            value={newThemeName}
            onChange={(e) => setNewThemeName(e.target.value)}
            placeholder={t("onlineStore.newThemeNamePlaceholder")}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13 }}
          />
          <button onClick={() => handleCreateTheme(publishedTheme?.id)} disabled={creating} style={{
            background: creating ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none",
            borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer",
          }}>
            {creating ? t("onlineStore.creatingTheme") : t("onlineStore.newThemeButton")}
          </button>
        </div>
        {themesError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{themesError}</p>}

        {draftThemes.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--ne-muted)" }}>{t("onlineStore.noDraftThemes")}</p>
        ) : (
          draftThemes.map((th) => (
            <div key={th.id} style={{
              display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--ne-border)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 8, background: "var(--ne-surface)", flexWrap: "wrap",
            }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ne-text)" }}>{th.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--ne-muted)" }}>{t("onlineStore.lastUpdated")}: {timeLabel(th.updated_at)}</p>
              </div>
              <button onClick={() => onOpenThemeEditor?.(th.id)} style={{ background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-text)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {t("onlineStore.editAction")}
              </button>
              <button onClick={() => handleCreateTheme(th.id)} disabled={creating} style={{ background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-text)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer" }}>
                {t("onlineStore.duplicateAction")}
              </button>
              <button onClick={() => handlePublish(th.id)} disabled={rowBusy[th.id]} style={{ background: "var(--ne-grad)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: rowBusy[th.id] ? "not-allowed" : "pointer" }}>
                {rowBusy[th.id] ? t("onlineStore.busy") : t("onlineStore.publishAction")}
              </button>
              <button onClick={() => handleDelete(th.id)} disabled={rowBusy[th.id]} style={{ background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-danger)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: rowBusy[th.id] ? "not-allowed" : "pointer" }}>
                {t("onlineStore.deleteAction")}
              </button>
              {rowError[th.id] && <p style={{ width: "100%", margin: 0, color: "var(--ne-danger)", fontSize: 11.5 }}>{rowError[th.id]}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
