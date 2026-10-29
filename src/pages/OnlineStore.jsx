import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

export default function OnlineStore({ storeId, onNavigate }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  // Activity-log ke "author" field ke liye current user ka naam (StoreConnect.jsx
  // ke currentProfile fetch jaisa hi pattern)
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
        store_id: sId,
        user_id: currentProfile.id,
        user_name: currentProfile.full_name || currentProfile.email,
        action_type: actionType,
        order_id: null,
        details: details || null,
      });
    } catch (err) {
      console.log("logActivity error:", err.message);
    }
  };

  const fetchStore = async () => {
    setLoading(true);
    if (!storeId) {
      setStore(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("stores")
      .select("id, store_name, platform, subdomain, custom_domain, custom_domain_status, theme_id, store_custom_domains(domain, role, status)")
      .eq("id", storeId)
      .maybeSingle();
    setStore(data || null);
    setLoading(false);
  };

  useEffect(() => {
    fetchStore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // The storefront build is one shared deployment serving every tenant via
  // Host-header resolution (src/middleware.ts in neezam-storefront) — there's
  // no per-store route param. A specific store's own live address is the only
  // correct way to reach ITS admin theme editor, since /admin/theme-settings
  // resolves "which store" from the Host header, same as any other page.
  const primaryDomain = (store?.store_custom_domains || []).find((d) => d.role === "primary" && d.status === "active")?.domain;
  const liveUrl = primaryDomain
    ? `https://${primaryDomain}`
    : store?.subdomain
    ? `https://${store.subdomain}.eneezam.com`
    : null;
  const handleViewStore = () => {
    if (!liveUrl) return;
    logActivity(store.id, "online_store_viewed", { url: liveUrl });
    window.open(liveUrl, "_blank", "noopener,noreferrer");
  };

  // Theme editing now happens inside neezam-erp itself (ThemeEditor.jsx), with
  // the storefront embedded as a live preview iframe — not a new tab opening
  // the old Svelte /admin/theme-settings page directly.
  const handleEditTheme = () => {
    if (!store) return;
    logActivity(store.id, "online_store_theme_edit_opened", { store_id: store.id });
    onNavigate?.("theme-editor");
  };

  if (loading) {
    return <div style={{ padding: "1.5rem", color: "var(--ne-muted)" }}>{t("onlineStore.loading")}</div>;
  }

  if (!store || store.platform !== "native" || !store.subdomain) {
    return (
      <div style={{ padding: "1.25rem" }}>
        <h2 style={{ color: "#fff", marginBottom: 12 }}>{t("onlineStore.title")}</h2>
        <div style={{
          background: "var(--ne-surface)", border: "1px solid var(--ne-border)",
          borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)",
        }}>
          {t("onlineStore.noNativeStores")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.25rem" }}>
      <h2 style={{ color: "#fff", marginBottom: 4 }}>{t("onlineStore.title")}</h2>
      <p style={{ color: "var(--ne-muted)", fontSize: 13, marginBottom: 20 }}>{t("onlineStore.subtitle")}</p>

      <div style={{
        background: "var(--ne-surface)", border: "1px solid var(--ne-border)",
        borderRadius: 14, padding: "1.25rem 1.5rem", maxWidth: 560,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Icon name="shop" size={20} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ne-text)" }}>{store.store_name}</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "var(--ne-muted)" }}>
            {t("onlineStore.addressLabel")}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ne-text)", fontWeight: 600 }}>
            {liveUrl ? liveUrl.replace(/^https:\/\//, "") : "—"}
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "var(--ne-muted)" }}>
            {t("onlineStore.themeStatusLabel")}
          </p>
          {store.theme_id ? (
            <span style={{
              fontSize: 11, padding: "3px 10px", display: "inline-block",
              background: "var(--ne-success-soft)", color: "var(--ne-success)",
              borderRadius: 20, fontWeight: 700,
            }}>
              {t("onlineStore.themeActive").replace("{id}", store.theme_id)}
            </span>
          ) : (
            <span style={{
              fontSize: 11, padding: "3px 10px", display: "inline-block",
              background: "var(--ne-warning-soft)", color: "var(--ne-warning)",
              borderRadius: 20, fontWeight: 700,
            }}>
              {t("onlineStore.noThemeSelected")}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={handleViewStore}
            disabled={!liveUrl}
            style={{
              background: liveUrl ? "var(--ne-grad)" : "var(--ne-border)", color: "#fff",
              border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700,
              cursor: liveUrl ? "pointer" : "not-allowed",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Icon name="link" size={13} />
            {t("onlineStore.viewStoreButton")}
          </button>
          <button
            onClick={handleEditTheme}
            style={{
              background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)",
              borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Icon name="edit" size={13} />
            {t("onlineStore.editThemeButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
