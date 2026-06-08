import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const CLIENT_ID = "4183ca3035d00fd99e9c98cd3c47f3dc";
const REDIRECT_URI = "https://neezam-erp.netlify.app/auth/callback";

export default function StoreConnect() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shopUrl, setShopUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setStores(data || []);
    setLoading(false);
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
      `&scope=read_orders,write_orders,read_customers,write_customers` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    window.location.href = authUrl;
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Yeh store delete karna chahte ho?")) return;
    await supabase.from("stores").delete().eq("id", id);
    fetchStores();
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "#fff" }}>
            🔗 Store Connect
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#94a3b8" }}>
            Apna Shopify store connect karo
          </p>
        </div>
      </div>

      {/* Connect Form */}
      <div style={{
        background: "#1e293b",
        borderRadius: 12,
        padding: "1.5rem",
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: 16, color: "#fff" }}>
          Naya Store Add Karo
        </h2>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            placeholder="yourstore.myshopify.com"
            value={shopUrl}
            onChange={(e) => setShopUrl(e.target.value)}
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
            🔗 Shopify se Connect Karo
          </button>
        </div>
        {error && (
          <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{error}</p>
        )}
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
          Store URL daalo — Shopify ka login page khulega — Allow karo — automatically connect ho jayega!
        </p>
      </div>

      {/* Connected Stores */}
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
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: "#e8f5e9", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                }}>
                  🛍️
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: "#fff" }}>
                    {store.store_name}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#94a3b8" }}>
                    {store.shopify_url}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 12, padding: "3px 10px",
                  background: "#14532d", color: "#4ade80",
                  borderRadius: 20,
                }}>
                  ✅ Connected
                </span>
                <button
                  onClick={() => handleDelete(store.id)}
                  style={{
                    background: "transparent", border: "none",
                    cursor: "pointer", color: "#64748b",
                    padding: 6, fontSize: 18,
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}