import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const META_APP_ID = "1554596542737935";
const META_REDIRECT_URI = "https://neezam-erp.pages.dev/auth/meta-callback";
const META_SCOPES = "ads_management,ads_read,business_management,catalog_management,leads_retrieval,pages_show_list,pages_read_engagement,pages_manage_ads,pages_manage_metadata";

export default function MetaConnect({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) fetchStore();
  }, [storeId]);

  const fetchStore = async () => {
    setLoading(true);
    const { data } = await supabase.from("stores").select("*").eq("id", storeId).single();
    setStore(data || null);
    setLoading(false);
  };

  const isConnected = !!store?.meta_access_token;

  const handleConnect = () => {
    const authUrl =
      `https://www.facebook.com/${"v21.0"}/dialog/oauth?client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}` +
      `&state=${storeId}` +
      `&scope=${encodeURIComponent(META_SCOPES)}`;
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t("metaConnect.disconnectConfirm"))) return;
    setDisconnecting(true);
    setError("");
    const { error } = await supabase.from("stores").update({
      meta_access_token: null,
      meta_token_expires_at: null,
      meta_ad_account_id: null,
      meta_ad_account_name: null,
      meta_connected_at: null,
    }).eq("id", storeId);
    setDisconnecting(false);
    if (error) { setError(error.message); return; }
    fetchStore();
  };

  const inputCardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem" };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", maxWidth: 600, margin: "0 auto", color: "var(--ne-text)" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="megaphone" size={17} /> {t("metaConnect.title")}</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("metaConnect.subtitle")}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("metaConnect.loading")}</div>
      ) : (
        <div style={inputCardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: isConnected ? "1.25rem" : 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--ne-border)" }}>
              <Icon name="megaphone" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--ne-text)" }}>{t("metaConnect.accountName")}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ne-muted-2)" }}>
                {isConnected ? store.meta_ad_account_name || `${t("metaConnect.accountIdPrefix")} ${store.meta_ad_account_id}` : t("metaConnect.notConnectedYet")}
              </p>
            </div>
            {isConnected ? (
              <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-success-soft)", color: "var(--ne-success)", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="check" size={10} /> {t("metaConnect.connected")}
              </span>
            ) : (
              <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-warning-soft)", color: "var(--ne-warning)", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="pending" size={10} /> {t("metaConnect.notConnected")}
              </span>
            )}
          </div>

          {error && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginTop: 12 }}>{error}</p>}

          {isConnected ? (
            <>
              <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "var(--ne-muted)", marginTop: 12 }}>
                {t("metaConnect.connectedAt")} <strong style={{ color: "var(--ne-text)" }}>{store.meta_connected_at ? new Date(store.meta_connected_at).toLocaleString("en-PK") : "—"}</strong>
              </div>
              <button onClick={handleDisconnect} disabled={disconnecting}
                style={{ width: "100%", marginTop: 12, padding: "10px", background: "transparent", border: "1px solid var(--ne-danger)", color: "var(--ne-danger)", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: disconnecting ? "default" : "pointer" }}>
                {disconnecting ? t("metaConnect.disconnecting") : t("metaConnect.disconnect")}
              </button>
            </>
          ) : (
            <button onClick={handleConnect}
              style={{ width: "100%", marginTop: 16, padding: "12px", background: "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="link" size={14} /> {t("metaConnect.connectButton")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
