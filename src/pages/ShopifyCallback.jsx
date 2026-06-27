import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev"
const CLIENT_ID = import.meta.env.VITE_SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_SHOPIFY_CLIENT_SECRET;

export default function ShopifyCallback() {
  const [status, setStatus] = useState("🔄 Processing...");

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const shop = params.get("shop");

      if (!code || !shop) {
        setStatus("❌ Invalid callback!");
        return;
      }

      setStatus("🔄 Token le rahe hain...");

      const res = await fetch(`${CF_URL}/shopify-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, shop,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        }),
      });

      const data = await res.json();

      if (!data.access_token) {
        setStatus("❌ Token nahi mila: " + JSON.stringify(data));
        return;
      }

      setStatus("💾 Store save ho raha hai...");

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        localStorage.setItem("pending_store", JSON.stringify({ shop, token: data.access_token }));
        setStatus("✅ Almost done! Login page pe ja rahe hain...");
        setTimeout(() => { window.location.href = "/"; }, 1500);
        return;
      }

      const storeName = shop.replace(".myshopify.com", "");

      const { error } = await supabase.from("stores").upsert({
        user_id: session.user.id,
        store_name: storeName,
        shopify_url: shop,
        api_token: data.access_token,
        platform: "shopify",
      }, { onConflict: "shopify_url" });

      if (error) {
        setStatus("❌ Save error: " + error.message);
        return;
      }

      setStatus("✅ Store connected! Redirect ho raha hai...");
      setTimeout(() => { window.location.href = "/"; }, 2000);

    } catch (err) {
      setStatus("❌ Error: " + err.message);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "18px", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: 48 }}>🔗</div>
      <div>{status}</div>
    </div>
  );
}