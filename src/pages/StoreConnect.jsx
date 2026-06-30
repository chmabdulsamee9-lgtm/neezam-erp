import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const CLIENT_ID = import.meta.env.VITE_SHOPIFY_CLIENT_ID;
const REDIRECT_URI = "https://neezam-erp.pages.dev/auth/callback";
const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

const SCOPES = [
  "read_orders",
  "write_orders",
  "read_order_edits",
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
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopUrl, setShopUrl] = useState("");
  const [error, setError] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [cacheCounts, setCacheCounts] = useState({});
  const [syncingStoreId, setSyncingStoreId] = useState(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    fetchStores();
  }, [storeId]);

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
      .select("*")
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

  const handleConnect = () => {
    setError("");
    if (!shopUrl) {
      setError("Store URL daalo");
      return;
    }
    let cleanUrl = shopUrl
      .replace("https://", "")
      .replace("http://", "")
      .replace(/\/$/, "");
    if (!cleanUrl.includes(".myshopify.com")) {
      cleanUrl = cleanUrl + ".myshopify.com";
    }
    const authUrl =
      `https://${cleanUrl}/admin/oauth/authorize` +
      `?client_id=${CLIENT_ID}` +
      `&scope=${SCOPES}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    window.location.href = authUrl;
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Yeh store delete karna chahte ho?")) return;
    await supabase.from("stores").delete().eq("id", id);
    fetchStores();
  };

  const handleSync = async (store) => {
    setSyncingStoreId(store.id);
    setSyncProgress(0);
    setSyncError("");

    let sinceId = 0;
    let total = 0;
    let safety = 0;

    try {
      while (safety < 200) {
        safety++;
        const qs = sinceId
          ? `?store_id=${store.id}&since_id=${sinceId}`
          : `?store_id=${store.id}`;
        const res = await fetch(`${CF_URL}/sync-orders-chunk${qs}`);
        const data = await res.json();

        if (data.error) {
          setSyncError(data.error);
          break;
        }

        total += data.count || 0;
        setSyncProgress(total);

        if (data.done) break;
        sinceId = data.nextSinceId;
      }
    } catch (err) {
      setSyncError(err.message);
    }

    setSyncingStoreId(null);
    fetchCacheCount(store.id);
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 800, margin: "0 auto" }}>
      
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "#fff" }}>
          🔗 Store Connect
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#94a3b8" }}>
          Apna Shopify store connect karo
        </p>
      </div>

      {/* Add New Store Button - sirf tab dikhana jab abhi tak Shopify connect nahi hua */}
      {stores.length === 0 && !loading && (
        !showInput ? (
          <button
            onClick={() => setShowInput(true)}
            style={{
              width: "100%",
              padding: "16px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 20 }}>🛍️</span>
            Login with Shopify — Apna Store Connect Karo
          </button>
        ) : (
          <div style={{
            background: "#1e293b",
            borderRadius: 12,
            padding: "1.5rem",
            marginBottom: "1.5rem",
          }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: 16, color: "#fff" }}>
              Store URL daalo
            </h2>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                placeholder="yourstore.myshopify.com"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#0f172a",
                  color: "#fff",
                  fontSize: 14,
                }}
              />
              <button
                onClick={handleConnect}
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontSize: 14,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                🔗 Connect
              </button>
              <button
                onClick={() => { setShowInput(false); setError(""); }}
                style={{
                  background: "#334155",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            {error && (
              <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{error}</p>
            )}
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
              Store URL daalo — Shopify login page khulega — Allow karo — automatically connect!
            </p>
          </div>
        )
      )}

      {/* Connected Store */}
      <h2 style={{ fontSize: 15, color: "#94a3b8", marginBottom: 12, fontWeight: 400 }}>
        Aapka Store
      </h2>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
          Loading...
        </div>
      ) : stores.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "3rem",
          background: "#1e293b", borderRadius: 12, color: "#94a3b8",
        }}>
          <p style={{ margin: 0, fontSize: 14 }}>Abhi koi store connected nahi!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {stores.map((store) => (
            <div key={store.id} style={{
              background: "#1e293b",
              borderRadius: 12,
              padding: "1rem 1.25rem",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: "#0f172a", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 22, border: "1px solid #1e293b"
                  }}>
                    🛍️
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: "#fff" }}>
                      {store.store_name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                      {store.shopify_url || "Shopify connect nahi hua abhi"}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {store.shopify_url ? (
                    <span style={{
                      fontSize: 12, padding: "4px 12px",
                      background: "#14532d", color: "#4ade80",
                      borderRadius: 20, fontWeight: 500,
                    }}>
                      ✅ Connected
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 12, padding: "4px 12px",
                      background: "#713f12", color: "#eab308",
                      borderRadius: 20, fontWeight: 500,
                    }}>
                      ⏳ Not Connected
                    </span>
                  )}
                </div>
              </div>

              {/* Sync section - sirf jab Shopify connect ho */}
              {store.shopify_url && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#0f172a",
                  borderRadius: 8,
                  padding: "10px 14px",
                }}>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>
                    🗄️ <strong style={{ color: "#fff" }}>{cacheCounts[store.id] ?? "..."}</strong> orders cached
                    {syncingStoreId === store.id && (
                      <span style={{ color: "#3b82f6", marginLeft: 10 }}>
                        ⏳ Syncing... {syncProgress} orders so far
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleSync(store)}
                    disabled={syncingStoreId === store.id}
                    style={{
                      background: syncingStoreId === store.id ? "#334155" : "#3b82f6",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: syncingStoreId === store.id ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {syncingStoreId === store.id ? "Syncing..." : "🔄 Sync Orders"}
                  </button>
                </div>
              )}
              {syncError && syncingStoreId === null && (
                <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>
                  ❌ {syncError}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}