import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { useSyncContext } from "../context/SyncContext";

const REDIRECT_URI = "https://neezam-erp.pages.dev/auth/callback";
const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

const SCOPES = [
  "read_orders",
  "write_orders",
  "read_order_edits",
  "write_order_edits",
  "read_products",
  "write_products",
  "read_product_listings",
  "write_product_listings",
  "read_customers",
  "write_customers",
  "read_inventory",
  "write_inventory",
  "read_discounts",
  "write_discounts",
  "read_locations",
  "write_locations",
  "read_fulfillments",
  "write_fulfillments",
  "read_returns",
  "write_returns",
  "read_draft_orders",
  "write_draft_orders",
  "read_shipping",
  "write_shipping",
  "read_price_rules",
  "write_price_rules",
  "read_gift_cards",
  "write_gift_cards",
  "read_marketing_events",
  "write_marketing_events",
  "read_reports",
  "write_reports",
  "read_content",
  "write_content",
  "read_files",
  "write_files",
  "read_themes",
  "write_themes",
  "read_publications",
  "write_publications",
  "read_checkouts",
  "write_checkouts",
  "read_analytics",
  "read_translations",
  "write_translations",
  "read_metaobjects",
  "write_metaobjects",
  "read_legal_policies",
].join(",");

export default function StoreConnect({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopUrl, setShopUrl] = useState("");
  const [error, setError] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [cacheCounts, setCacheCounts] = useState({});
  const [showNativeInput, setShowNativeInput] = useState(false);
  const [nativeSubdomain, setNativeSubdomain] = useState("");
  const [nativeStoreName, setNativeStoreName] = useState("");
  const [nativeAvailability, setNativeAvailability] = useState(null); // {checking, available, reason} | null
  const [nativeError, setNativeError] = useState("");
  const [nativeCreating, setNativeCreating] = useState(false);
  const [domainInputs, setDomainInputs] = useState({}); // {[storeId]: string} — new-domain text field
  const [domainBusy, setDomainBusy] = useState({}); // {[storeId]: bool} — add/remove in flight
  const [domainChecking, setDomainChecking] = useState({}); // {[storeId]: bool} — status check in flight
  const [domainError, setDomainError] = useState({}); // {[storeId]: string}
  const [domainCname, setDomainCname] = useState({}); // {[storeId]: {type, name, target} | null}
  const [copiedKey, setCopiedKey] = useState(""); // which copy button last showed "copied"
  const [showEnableNativeInput, setShowEnableNativeInput] = useState({}); // {[storeId]: bool}
  const [enableNativeInputs, setEnableNativeInputs] = useState({}); // {[storeId]: string}
  const [enableNativeAvailability, setEnableNativeAvailability] = useState({}); // {[storeId]: {checking, available, reason} | null}
  const [enableNativeBusy, setEnableNativeBusy] = useState({}); // {[storeId]: bool}
  const [enableNativeError, setEnableNativeError] = useState({}); // {[storeId]: string}
  const enableNativeTimers = useRef({}); // {[storeId]: timeoutId} — per-store debounce, since multiple cards can type at once
  const [toggleBusy, setToggleBusy] = useState({}); // {[storeId]: bool}
  const [toggleError, setToggleError] = useState({}); // {[storeId]: string}
  const { syncMap, startSync } = useSyncContext();
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    fetchStores();
  }, [storeId]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Activity-log ke "author" field ke liye current user ka naam (BookedOrders.jsx/CourierConnect.jsx
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

  // SECURITY: sirf current user ke apne brand ka store dikhana hai —
  // saare stores nahi (warna ek brand dusre ka data dekh leta)
  const fetchStores = async () => {
    setLoading(true);
    if (!storeId) {
      setStores([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("stores")
      .select("id, store_name, eneezam_id, shopify_url, platform, subdomain, custom_domain, custom_domain_status")
      .eq("id", storeId);
    setStores(data || []);
    setLoading(false);
    if (data) {
      data.forEach((store) => fetchCacheCount(store.id));
    }
  };

  const fetchCacheCount = async (sId) => {
    const { count } = await supabase
      .from("shopify_orders_cache")
      .select("*", { count: "exact", head: true })
      .eq("store_id", sId);
    setCacheCounts((prev) => ({ ...prev, [sId]: count ?? 0 }));
  };

  const handleConnect = async (urlOverride) => {
    setError("");
    const rawUrl = urlOverride || shopUrl;
    if (!rawUrl) {
      setError(t("store.urlRequired"));
      return;
    }
    let cleanUrl = rawUrl
      .replace("https://", "")
      .replace("http://", "")
      .replace(/\/$/, "");
    if (!cleanUrl.includes(".myshopify.com")) {
      cleanUrl = cleanUrl + ".myshopify.com";
    }
    // "state" ko OAuth ka standard round-trip param use karte hain taake eneezam_id
    // callback tak reliably pahunche, chahe is store ka shopify_url abhi null ho
    // (pehli-baar-connect) — Worker ke /shopify-token mein isi state se decide hota hai.
    const currentEneezamId = stores[0]?.eneezam_id;
    // client_id (public value, secret nahi) Worker se dynamically fetch karte hain — store ka
    // apna dedicated Shopify app ho to wahi milega, warna default shared app ka client_id.
    let clientId;
    try {
      const res = await fetch(`${CF_URL}/store-shopify-client-id?store_id=${encodeURIComponent(currentEneezamId || "")}`);
      const data = await res.json();
      if (data.error || !data.client_id) {
        setError(data.error || t("store.urlRequired"));
        return;
      }
      clientId = data.client_id;
    } catch (err) {
      setError(err.message);
      return;
    }
    const authUrl =
      `https://${cleanUrl}/admin/oauth/authorize` +
      `?client_id=${clientId}` +
      `&scope=${SCOPES}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${encodeURIComponent(currentEneezamId || "")}`;
    // Actual DB-write (shopify_url set) OAuth callback (ShopifyCallback.jsx) mein hoti hai, is
    // component se navigate-away ho jane ke baad — is liye yahan connect-flow ke INITIATION
    // par hi log karte hain (yehi ek pakka signal hai jo is file ke scope mein milta hai)
    logActivity(storeId, "shopify_connected", { shopUrl: cleanUrl });
    window.location.href = authUrl;
  };

  // 500ms-debounced availability check as the user types the subdomain — mirrors the
  // worker's own validateSubdomain() reason codes, so the message shown here always matches
  // what the server would say.
  useEffect(() => {
    const value = nativeSubdomain.trim();
    if (!value) {
      setNativeAvailability(null);
      return;
    }
    setNativeAvailability({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${CF_URL}/check-subdomain-availability?subdomain=${encodeURIComponent(value)}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const data = await res.json();
        setNativeAvailability({ checking: false, available: !!data.available, reason: data.reason || null });
      } catch (err) {
        setNativeAvailability({ checking: false, available: false, reason: null, error: err.message });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [nativeSubdomain]);

  const subdomainReasonKey = {
    taken: "store.subdomainTaken",
    invalid_format: "store.subdomainInvalid",
    reserved: "store.subdomainReserved",
    too_short: "store.subdomainTooShort",
    too_long: "store.subdomainTooLong",
  };

  const handleCreateNativeStore = async () => {
    setNativeError("");
    if (!nativeAvailability?.available || !nativeStoreName.trim()) return;
    setNativeCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/create-native-store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ subdomain: nativeSubdomain.trim(), store_name: nativeStoreName.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setNativeError(data.error || t("store.subdomainInvalid"));
        setNativeCreating(false);
        return;
      }
      setStores((prev) => [...prev, data.store]);
      logActivity(data.store.id, "native_store_created", { subdomain: data.store.subdomain });
      setShowNativeInput(false);
      setNativeSubdomain("");
      setNativeStoreName("");
      setNativeAvailability(null);
    } catch (err) {
      setNativeError(err.message);
    } finally {
      setNativeCreating(false);
    }
  };

  const handleCopy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1500);
    } catch (err) {
      console.log("clipboard copy error:", err.message);
    }
  };

  const handleAddCustomDomain = async (store) => {
    const domain = (domainInputs[store.id] || "").trim().toLowerCase();
    if (!domain) return;
    setDomainError((prev) => ({ ...prev, [store.id]: "" }));
    setDomainBusy((prev) => ({ ...prev, [store.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/add-custom-domain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ store_id: store.id, domain }),
      });
      const data = await res.json();
      if (!data.success) {
        setDomainError((prev) => ({ ...prev, [store.id]: data.error || t("store.customDomainInvalid") }));
        return;
      }
      setDomainCname((prev) => ({ ...prev, [store.id]: data.cname_instructions }));
      setStores((prev) => prev.map((s) => (
        s.id === store.id ? { ...s, custom_domain: domain, custom_domain_status: "pending" } : s
      )));
      logActivity(store.id, "custom_domain_connected", { domain });
    } catch (err) {
      setDomainError((prev) => ({ ...prev, [store.id]: err.message }));
    } finally {
      setDomainBusy((prev) => ({ ...prev, [store.id]: false }));
    }
  };

  const handleCheckCustomDomainStatus = async (store) => {
    setDomainChecking((prev) => ({ ...prev, [store.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/check-custom-domain-status?store_id=${encodeURIComponent(store.id)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.status) {
        setStores((prev) => prev.map((s) => (
          s.id === store.id ? { ...s, custom_domain_status: data.status } : s
        )));
      }
    } catch (err) {
      setDomainError((prev) => ({ ...prev, [store.id]: err.message }));
    } finally {
      setDomainChecking((prev) => ({ ...prev, [store.id]: false }));
    }
  };

  const handleRemoveCustomDomain = async (store) => {
    if (!window.confirm(t("store.removeDomainConfirm"))) return;
    setDomainBusy((prev) => ({ ...prev, [store.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/remove-custom-domain`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ store_id: store.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setDomainError((prev) => ({ ...prev, [store.id]: data.error || t("store.customDomainInvalid") }));
        return;
      }
      setStores((prev) => prev.map((s) => (
        s.id === store.id ? { ...s, custom_domain: null, custom_domain_status: null } : s
      )));
      setDomainCname((prev) => ({ ...prev, [store.id]: null }));
      setDomainInputs((prev) => ({ ...prev, [store.id]: "" }));
      logActivity(store.id, "custom_domain_removed", { domain: store.custom_domain });
    } catch (err) {
      setDomainError((prev) => ({ ...prev, [store.id]: err.message }));
    } finally {
      setDomainBusy((prev) => ({ ...prev, [store.id]: false }));
    }
  };

  // Per-store debounced availability check for the "Enable Native Storefront" flow —
  // same reason-code mapping/UX as the top-level Create Native Store flow, just keyed
  // by store id since this can run on multiple store cards at once.
  const handleEnableNativeSubdomainChange = (storeId, rawValue) => {
    const value = rawValue.toLowerCase();
    setEnableNativeInputs((prev) => ({ ...prev, [storeId]: value }));
    if (enableNativeTimers.current[storeId]) clearTimeout(enableNativeTimers.current[storeId]);

    const trimmed = value.trim();
    if (!trimmed) {
      setEnableNativeAvailability((prev) => ({ ...prev, [storeId]: null }));
      return;
    }
    setEnableNativeAvailability((prev) => ({ ...prev, [storeId]: { checking: true } }));
    enableNativeTimers.current[storeId] = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${CF_URL}/check-subdomain-availability?subdomain=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const data = await res.json();
        setEnableNativeAvailability((prev) => ({ ...prev, [storeId]: { checking: false, available: !!data.available, reason: data.reason || null } }));
      } catch (err) {
        setEnableNativeAvailability((prev) => ({ ...prev, [storeId]: { checking: false, available: false, reason: null, error: err.message } }));
      }
    }, 500);
  };

  const handleEnableNativeStorefront = async (store) => {
    const availability = enableNativeAvailability[store.id];
    const subdomain = (enableNativeInputs[store.id] || "").trim();
    if (!availability?.available || !subdomain) return;
    setEnableNativeError((prev) => ({ ...prev, [store.id]: "" }));
    setEnableNativeBusy((prev) => ({ ...prev, [store.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/enable-native-storefront`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ store_id: store.id, subdomain }),
      });
      const data = await res.json();
      if (!data.success) {
        setEnableNativeError((prev) => ({ ...prev, [store.id]: data.error || t("store.subdomainInvalid") }));
        return;
      }
      setStores((prev) => prev.map((s) => (
        s.id === store.id ? { ...s, subdomain: data.subdomain } : s
      )));
      logActivity(store.id, "native_storefront_enabled", { subdomain: data.subdomain });
      setShowEnableNativeInput((prev) => ({ ...prev, [store.id]: false }));
      setEnableNativeInputs((prev) => ({ ...prev, [store.id]: "" }));
      setEnableNativeAvailability((prev) => ({ ...prev, [store.id]: null }));
    } catch (err) {
      setEnableNativeError((prev) => ({ ...prev, [store.id]: err.message }));
    } finally {
      setEnableNativeBusy((prev) => ({ ...prev, [store.id]: false }));
    }
  };

  const handleTogglePlatform = async (store, newPlatform) => {
    const confirmKey = newPlatform === "shopify" ? "store.toggleConfirmToShopify" : "store.toggleConfirmToNative";
    if (!window.confirm(t(confirmKey))) return;
    setToggleError((prev) => ({ ...prev, [store.id]: "" }));
    setToggleBusy((prev) => ({ ...prev, [store.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/toggle-store-platform`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ store_id: store.id, platform: newPlatform }),
      });
      const data = await res.json();
      if (!data.success) {
        setToggleError((prev) => ({ ...prev, [store.id]: data.error || t("store.toggleFailed") }));
        return;
      }
      setStores((prev) => prev.map((s) => (
        s.id === store.id ? { ...s, platform: data.platform } : s
      )));
      logActivity(store.id, "store_platform_toggled", { platform: data.platform });
    } catch (err) {
      setToggleError((prev) => ({ ...prev, [store.id]: err.message }));
    } finally {
      setToggleBusy((prev) => ({ ...prev, [store.id]: false }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("store.deleteConfirm"))) return;
    const store = stores.find((s) => s.id === id);
    await supabase.from("stores").delete().eq("id", id);
    logActivity(id, "shopify_disconnected", { shopUrl: store?.shopify_url });
    fetchStores();
  };

  // Refreshes the "X orders cached" chip once a store's sync transitions from syncing to
  // not-syncing (completed or failed) — the sync loop itself now lives in SyncContext, which
  // doesn't know about this UI-only cache-count display, so this watches syncMap reactively
  // instead of being called directly at the end of a sync function.
  const prevSyncingRef = useRef({});
  useEffect(() => {
    stores.forEach((store) => {
      const wasSyncing = prevSyncingRef.current[store.id];
      const isSyncing = !!syncMap[store.id]?.syncing;
      if (wasSyncing && !isSyncing) fetchCacheCount(store.id);
      prevSyncingRef.current[store.id] = isSyncing;
    });
  }, [syncMap, stores]);

  return (
    <div style={{ padding: isMobile ? "1rem" : "2rem", maxWidth: 800, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="link" size={19} /> {t("store.title")}
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--ne-muted)" }}>
          {t("store.subtitle")}
        </p>
      </div>

      {/* Add New Store Button - sirf tab dikhana jab abhi tak Shopify connect nahi hua,
          ya jab existing (abhi-tak-not-connected) store-card ke "Connect Shopify"
          button se showInput explicitly true kiya gaya ho */}
      {(stores.length === 0 || showInput) && !loading && (
        !showInput ? (
          <button
            onClick={() => setShowInput(true)}
            style={{
              width: "100%",
              padding: "16px",
              background: "var(--ne-grad)",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              boxShadow: "0 6px 20px rgba(92,124,250,.25)",
            }}
          >
            <Icon name="shop" size={20} />
            {t("store.loginWithShopify")}
          </button>
        ) : (
          <div style={{
            background: "var(--ne-surface-2)",
            border: "1px solid var(--ne-border)",
            borderRadius: 14,
            padding: "1.5rem",
            marginBottom: "1.5rem",
          }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: 16, color: "var(--ne-text)", fontWeight: 700 }}>
              {t("store.enterUrl")}
            </h2>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
              <input
                type="text"
                placeholder="yourstore.myshopify.com"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 9,
                  border: "1px solid var(--ne-border)",
                  background: "var(--ne-bg)",
                  color: "var(--ne-text)",
                  fontSize: 14,
                }}
              />
              <button
                onClick={() => handleConnect()}
                style={{
                  background: "var(--ne-grad)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 9,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="link" size={13} /> {t("store.connect")}
              </button>
              <button
                onClick={() => { setShowInput(false); setError(""); }}
                style={{
                  background: "var(--ne-surface)",
                  border: "1px solid var(--ne-border)",
                  color: "var(--ne-text)",
                  borderRadius: 9,
                  padding: "10px 14px",
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
            {error && (
              <p style={{ color: "var(--ne-danger)", fontSize: 13, marginTop: 8 }}>{error}</p>
            )}
            <p style={{ fontSize: 12, color: "var(--ne-muted-2)", marginTop: 8 }}>
              {t("store.connectHint")}
            </p>
          </div>
        )
      )}

      {/* Create Native Store — additive alongside Connect Shopify, never replacing it */}
      {!loading && !showNativeInput && (
        <button
          onClick={() => setShowNativeInput(true)}
          style={{
            width: "100%",
            padding: "14px",
            background: "var(--ne-surface-2)",
            color: "var(--ne-text)",
            border: "1px dashed var(--ne-border)",
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <Icon name="shop" size={18} />
          {t("store.createNativeStoreButton")}
        </button>
      )}

      {showNativeInput && (
        <div style={{
          background: "var(--ne-surface-2)",
          border: "1px solid var(--ne-border)",
          borderRadius: 14,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: 16, color: "var(--ne-text)", fontWeight: 700 }}>
            {t("store.createNativeStoreTitle")}
          </h2>

          <div style={{ marginBottom: 10 }}>
            <input
              type="text"
              placeholder={t("store.storeNamePlaceholder")}
              value={nativeStoreName}
              onChange={(e) => setNativeStoreName(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 9,
                border: "1px solid var(--ne-border)",
                background: "var(--ne-bg)",
                color: "var(--ne-text)",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "center" }}>
            <input
              type="text"
              placeholder={t("store.subdomainPlaceholder")}
              value={nativeSubdomain}
              onChange={(e) => setNativeSubdomain(e.target.value.toLowerCase())}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 9,
                border: "1px solid var(--ne-border)",
                background: "var(--ne-bg)",
                color: "var(--ne-text)",
                fontSize: 14,
              }}
            />
            <span style={{ fontSize: 13, color: "var(--ne-muted)", whiteSpace: "nowrap" }}>
              .eneezam.com
            </span>
          </div>

          {nativeSubdomain.trim() && (
            <p style={{
              fontSize: 12.5, marginTop: 8, display: "flex", alignItems: "center", gap: 6,
              color: nativeAvailability?.checking
                ? "var(--ne-muted)"
                : nativeAvailability?.available
                  ? "var(--ne-success)"
                  : "var(--ne-danger)",
            }}>
              {nativeAvailability?.checking ? (
                <>{t("store.subdomainChecking")}</>
              ) : nativeAvailability?.available ? (
                <><Icon name="check" size={11} /> {t("store.subdomainAvailable")}</>
              ) : (
                <><Icon name="error" size={11} /> {t(subdomainReasonKey[nativeAvailability?.reason] || "store.subdomainInvalid")}</>
              )}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={handleCreateNativeStore}
              disabled={!nativeAvailability?.available || !nativeStoreName.trim() || nativeCreating}
              style={{
                background: (!nativeAvailability?.available || !nativeStoreName.trim() || nativeCreating) ? "var(--ne-border)" : "var(--ne-grad)",
                color: "#fff",
                border: "none",
                borderRadius: 9,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: (!nativeAvailability?.available || !nativeStoreName.trim() || nativeCreating) ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="shop" size={13} /> {nativeCreating ? t("store.creatingNativeStore") : t("store.createNativeStore")}
            </button>
            <button
              onClick={() => { setShowNativeInput(false); setNativeError(""); setNativeSubdomain(""); setNativeStoreName(""); setNativeAvailability(null); }}
              style={{
                background: "var(--ne-surface)",
                border: "1px solid var(--ne-border)",
                color: "var(--ne-text)",
                borderRadius: 9,
                padding: "10px 14px",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>

          {nativeError && (
            <p style={{ color: "var(--ne-danger)", fontSize: 13, marginTop: 8 }}>{nativeError}</p>
          )}
        </div>
      )}

      {/* Connected Store */}
      <h2 style={{ fontSize: 15, color: "var(--ne-muted)", marginBottom: 12, fontWeight: 600 }}>
        {t("store.yourStore")}
      </h2>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)" }}>
          {t("store.loading")}
        </div>
      ) : stores.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "3rem",
          background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, color: "var(--ne-muted)",
        }}>
          <p style={{ margin: 0, fontSize: 14 }}>{t("store.noStoreConnected")}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {stores.map((store) => {
          const syncEntry = syncMap[store.id] || {};
          const syncPct = syncEntry.totalCount ? Math.round((syncEntry.syncedCount / syncEntry.totalCount) * 100) : null;
          return (
            <div key={store.id} style={{
              background: "var(--ne-surface-2)",
              border: "1px solid var(--ne-border)",
              borderRadius: 14,
              padding: "1rem 1.25rem",
              boxShadow: "0 2px 8px rgba(0,0,0,.18)",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: "var(--ne-surface)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    border: "1px solid var(--ne-border)"
                  }}>
                    <Icon name="shop" size={20} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--ne-text)" }}>
                      {store.store_name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: "var(--ne-accent)" }}>
                      {store.eneezam_id || "—"}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ne-muted-2)" }}>
                      {store.platform === "native"
                        ? `${store.subdomain}.eneezam.com`
                        : (store.shopify_url || t("store.notConnectedYet"))}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {store.shopify_url && store.subdomain ? (
                    <div style={{ display: "inline-flex", border: "1px solid var(--ne-border)", borderRadius: 20, overflow: "hidden" }}>
                      <button
                        onClick={() => store.platform !== "shopify" && handleTogglePlatform(store, "shopify")}
                        disabled={toggleBusy[store.id]}
                        style={{
                          border: "none", padding: "5px 12px", fontSize: 11, fontWeight: 700,
                          cursor: toggleBusy[store.id] ? "not-allowed" : "pointer",
                          background: store.platform === "shopify" ? "var(--ne-grad)" : "transparent",
                          color: store.platform === "shopify" ? "#fff" : "var(--ne-muted)",
                        }}
                      >
                        {t("store.toggleToShopify")}
                      </button>
                      <button
                        onClick={() => store.platform !== "native" && handleTogglePlatform(store, "native")}
                        disabled={toggleBusy[store.id]}
                        style={{
                          border: "none", padding: "5px 12px", fontSize: 11, fontWeight: 700,
                          cursor: toggleBusy[store.id] ? "not-allowed" : "pointer",
                          background: store.platform === "native" ? "var(--ne-grad)" : "transparent",
                          color: store.platform === "native" ? "#fff" : "var(--ne-muted)",
                        }}
                      >
                        {t("store.toggleToNative")}
                      </button>
                    </div>
                  ) : store.platform === "native" ? (
                    <span style={{
                      fontSize: 11, padding: "4px 12px",
                      background: "var(--ne-success-soft)", color: "var(--ne-success)",
                      borderRadius: 20, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5,
                    }}>
                      <Icon name="shop" size={10} /> {t("store.platformNative")}
                    </span>
                  ) : store.shopify_url ? (
                    <>
                      <span style={{
                        fontSize: 11, padding: "4px 12px",
                        background: "var(--ne-success-soft)", color: "var(--ne-success)",
                        borderRadius: 20, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5,
                      }}>
                        <Icon name="check" size={10} /> {t("store.connected")}
                      </span>
                      <button
                        onClick={() => handleConnect(store.shopify_url)}
                        style={{
                          background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)",
                          borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                        }}
                      >
                        <Icon name="refresh" size={10} /> {t("store.reconnect")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{
                        fontSize: 11, padding: "4px 12px",
                        background: "var(--ne-warning-soft)", color: "var(--ne-warning)",
                        borderRadius: 20, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5,
                      }}>
                        <Icon name="pending" size={10} /> {t("store.notConnected")}
                      </span>
                      <button
                        onClick={() => setShowInput(true)}
                        style={{
                          background: "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9,
                          padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                        }}
                      >
                        <Icon name="shop" size={12} /> {t("store.connectShopifyButton")}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {toggleError[store.id] && (
                <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="error" size={12} /> {toggleError[store.id]}
                </p>
              )}

              {/* CARD A — Shopify Connection: shown whenever shopify_url exists, regardless
                  of which platform is currently active */}
              {store.shopify_url && (
                <div style={{
                  background: "var(--ne-surface)",
                  border: "1px solid var(--ne-border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 12,
                }}>
                  <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>
                    {t("store.shopifyConnectionHeading")}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: "var(--ne-text)" }}>{store.shopify_url}</span>
                    <button
                      onClick={() => handleConnect(store.shopify_url)}
                      style={{
                        background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)",
                        borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                      }}
                    >
                      <Icon name="refresh" size={10} /> {t("store.reconnect")}
                    </button>
                  </div>

                  <div style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "flex-start" : "center",
                    justifyContent: "space-between",
                    gap: isMobile ? 10 : 0,
                  }}>
                    <div style={{ fontSize: 13, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Icon name="database" size={13} /> <strong style={{ color: "var(--ne-text)" }}>{cacheCounts[store.id] ?? "..."}</strong> {t("store.ordersCached")}
                      {syncEntry.syncing && (
                        <span style={{ color: "var(--ne-accent)", marginLeft: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Icon name="pending" size={11} /> {t("store.syncing")} {syncEntry.syncedCount?.toLocaleString() ?? 0}
                          {syncEntry.totalCount ? ` / ${syncEntry.totalCount.toLocaleString()} (${syncPct}%)` : ""}
                        </span>
                      )}
                    </div>
                    {store.platform === "native" ? (
                      <span style={{ fontSize: 12, color: "var(--ne-muted)", fontStyle: "italic", whiteSpace: "nowrap" }}>
                        {t("store.shopifyPausedNote")}
                      </span>
                    ) : (
                      <button
                        onClick={() => startSync(store)}
                        disabled={syncEntry.syncing}
                        style={{
                          background: syncEntry.syncing ? "var(--ne-border)" : "var(--ne-grad)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 9,
                          padding: "8px 16px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: syncEntry.syncing ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {syncEntry.syncing ? t("store.syncing") : (<><Icon name="refresh" size={13} /> {t("store.syncOrders")}</>)}
                      </button>
                    )}
                  </div>
                  {syncEntry.error && !syncEntry.syncing && (
                    <p style={{ color: "var(--ne-danger)", fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="error" size={12} /> {syncEntry.error}
                    </p>
                  )}
                </div>
              )}

              {/* CARD B — Native Storefront: the enable-flow for a Shopify store with no
                  subdomain yet, or the subdomain + custom-domain UI once one exists. Always
                  rendered when there's a native-capable context — i.e. whenever shopify_url
                  is missing (pure/native-created store) or a subdomain can still be added. */}
              <div style={{
                background: "var(--ne-surface)",
                border: "1px solid var(--ne-border)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 12,
              }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>
                  {t("store.nativeStorefrontHeading")}
                </p>

                {/* Enable Native Storefront — additive, for an existing Shopify store that
                    doesn't have a subdomain yet (never creates a new store, just reserves a
                    subdomain on this one) */}
                {store.platform === "shopify" && !store.subdomain && (
                  !showEnableNativeInput[store.id] ? (
                    <button
                      onClick={() => setShowEnableNativeInput((prev) => ({ ...prev, [store.id]: true }))}
                      style={{
                        background: "var(--ne-bg)", color: "var(--ne-text)", border: "1px dashed var(--ne-border)",
                        borderRadius: 9, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      }}
                    >
                      <Icon name="shop" size={14} /> {t("store.enableNativeStorefront")}
                    </button>
                  ) : (
                    <div>
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, alignItems: isMobile ? "stretch" : "center" }}>
                        <input
                          type="text"
                          placeholder={t("store.subdomainPlaceholder")}
                          value={enableNativeInputs[store.id] || ""}
                          onChange={(e) => handleEnableNativeSubdomainChange(store.id, e.target.value)}
                          style={{
                            flex: 1, padding: "10px 14px", borderRadius: 9,
                            border: "1px solid var(--ne-border)", background: "var(--ne-bg)",
                            color: "var(--ne-text)", fontSize: 14,
                          }}
                        />
                        <span style={{ fontSize: 13, color: "var(--ne-muted)", whiteSpace: "nowrap" }}>.eneezam.com</span>
                        <button
                          onClick={() => handleEnableNativeStorefront(store)}
                          disabled={!enableNativeAvailability[store.id]?.available || enableNativeBusy[store.id]}
                          style={{
                            background: (!enableNativeAvailability[store.id]?.available || enableNativeBusy[store.id]) ? "var(--ne-border)" : "var(--ne-grad)",
                            color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px",
                            fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                            cursor: (!enableNativeAvailability[store.id]?.available || enableNativeBusy[store.id]) ? "not-allowed" : "pointer",
                          }}
                        >
                          {enableNativeBusy[store.id] ? t("store.creatingNativeStore") : t("store.createNativeStore")}
                        </button>
                        <button
                          onClick={() => setShowEnableNativeInput((prev) => ({ ...prev, [store.id]: false }))}
                          style={{
                            background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-text)",
                            borderRadius: 9, padding: "10px 14px", fontSize: 14, cursor: "pointer",
                          }}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                      {(enableNativeInputs[store.id] || "").trim() && (
                        <p style={{
                          fontSize: 12.5, marginTop: 8, display: "flex", alignItems: "center", gap: 6,
                          color: enableNativeAvailability[store.id]?.checking
                            ? "var(--ne-muted)"
                            : enableNativeAvailability[store.id]?.available
                              ? "var(--ne-success)"
                              : "var(--ne-danger)",
                        }}>
                          {enableNativeAvailability[store.id]?.checking ? (
                            <>{t("store.subdomainChecking")}</>
                          ) : enableNativeAvailability[store.id]?.available ? (
                            <><Icon name="check" size={11} /> {t("store.subdomainAvailable")}</>
                          ) : (
                            <><Icon name="error" size={11} /> {t(subdomainReasonKey[enableNativeAvailability[store.id]?.reason] || "store.subdomainInvalid")}</>
                          )}
                        </p>
                      )}
                      {enableNativeError[store.id] && (
                        <p style={{ color: "var(--ne-danger)", fontSize: 13, marginTop: 8 }}>{enableNativeError[store.id]}</p>
                      )}
                    </div>
                  )
                )}

                {/* Subdomain + custom domain connect — shown whenever the store HAS a
                    subdomain (regardless of whether it's the currently active platform),
                    muted with a paused note when platform !== 'native'. Rendered directly
                    inside Card B (no further nested bordered box) to read as one card. */}
                {!!store.subdomain && (
                  <div style={{ opacity: store.platform === "native" ? 1 : 0.6 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>
                      {store.subdomain}.eneezam.com
                    </p>
                    {store.platform !== "native" && (
                      <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ne-muted)" }}>
                        {t("store.nativePausedNote")}
                      </p>
                    )}
                    <p style={{ margin: "10px 0 10px", fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>
                      {t("store.customDomainTitle")}
                    </p>

                    {!store.custom_domain ? (
                      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                        <input
                          type="text"
                          placeholder={t("store.customDomainPlaceholder")}
                          value={domainInputs[store.id] || ""}
                          onChange={(e) => setDomainInputs((prev) => ({ ...prev, [store.id]: e.target.value }))}
                          style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: 9,
                            border: "1px solid var(--ne-border)",
                            background: "var(--ne-bg)",
                            color: "var(--ne-text)",
                            fontSize: 14,
                          }}
                        />
                        <button
                          onClick={() => handleAddCustomDomain(store)}
                          disabled={!(domainInputs[store.id] || "").trim() || domainBusy[store.id]}
                          style={{
                            background: (!(domainInputs[store.id] || "").trim() || domainBusy[store.id]) ? "var(--ne-border)" : "var(--ne-grad)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 9,
                            padding: "10px 16px",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: (!(domainInputs[store.id] || "").trim() || domainBusy[store.id]) ? "not-allowed" : "pointer",
                            whiteSpace: "nowrap",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Icon name="link" size={13} />
                          {domainBusy[store.id] ? t("store.customDomainConnecting") : t("store.connectDomainButton")}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, color: "var(--ne-text)", fontWeight: 600 }}>
                            {store.custom_domain}
                          </span>
                          {store.custom_domain_status === "active" ? (
                            <span style={{
                              fontSize: 11, padding: "3px 10px",
                              background: "var(--ne-success-soft)", color: "var(--ne-success)",
                              borderRadius: 20, fontWeight: 700,
                            }}>
                              {t("store.customDomainActive")}
                            </span>
                          ) : store.custom_domain_status === "error" ? (
                            <span style={{
                              fontSize: 11, padding: "3px 10px",
                              background: "var(--ne-danger-soft)", color: "var(--ne-danger)",
                              borderRadius: 20, fontWeight: 700,
                            }}>
                              {t("store.customDomainError")}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 11, padding: "3px 10px",
                              background: "var(--ne-warning-soft)", color: "var(--ne-warning)",
                              borderRadius: 20, fontWeight: 700,
                            }}>
                              {t("store.customDomainPending")}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                          <button
                            onClick={() => handleCheckCustomDomainStatus(store)}
                            disabled={domainChecking[store.id]}
                            style={{
                              background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)",
                              borderRadius: 9, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                              cursor: domainChecking[store.id] ? "not-allowed" : "pointer",
                              display: "inline-flex", alignItems: "center", gap: 6,
                            }}
                          >
                            <Icon name="refresh" size={11} />
                            {domainChecking[store.id] ? t("store.checkingStatus") : t("store.checkStatusButton")}
                          </button>
                          <button
                            onClick={() => handleRemoveCustomDomain(store)}
                            disabled={domainBusy[store.id]}
                            style={{
                              background: "transparent", color: "var(--ne-danger)", border: "1px solid var(--ne-border)",
                              borderRadius: 9, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                              cursor: domainBusy[store.id] ? "not-allowed" : "pointer",
                            }}
                          >
                            {t("store.removeDomainButton")}
                          </button>
                        </div>
                      </div>
                    )}

                    {domainCname[store.id] && (
                      <div style={{
                        marginTop: 12, padding: "12px 14px", background: "var(--ne-surface-2)",
                        border: "1px solid var(--ne-border)", borderRadius: 9,
                      }}>
                        <p style={{ margin: "0 0 8px", fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)" }}>
                          {t("store.cnameInstructionsTitle")}
                        </p>
                        {[
                          { labelKey: "store.cnameType", value: domainCname[store.id].type },
                          { labelKey: "store.cnameName", value: domainCname[store.id].name },
                          { labelKey: "store.cnameTarget", value: domainCname[store.id].target },
                        ].map((row) => {
                          const copyKey = `${store.id}-${row.labelKey}`;
                          return (
                            <div key={row.labelKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, color: "var(--ne-muted)", minWidth: 50 }}>{t(row.labelKey)}:</span>
                              <code style={{ fontSize: 12, color: "var(--ne-text)", background: "var(--ne-bg)", padding: "2px 8px", borderRadius: 6 }}>
                                {row.value}
                              </code>
                              <button
                                onClick={() => handleCopy(copyKey, row.value)}
                                style={{
                                  background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-text)",
                                  borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer",
                                }}
                              >
                                {copiedKey === copyKey ? t("store.copiedLabel") : t("store.copyButton")}
                              </button>
                            </div>
                          );
                        })}
                        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ne-muted-2)" }}>
                          {t("store.propagationNote")}
                        </p>
                      </div>
                    )}

                    {domainError[store.id] && (
                      <p style={{ color: "var(--ne-danger)", fontSize: 12, marginTop: 8 }}>{domainError[store.id]}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}