import { useEffect, useState } from "react";
import { supabase } from "../supabase";

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

      const targetUrl = `https://${shop}/admin/oauth/access_token`;
      
      const res = await fetch(
        `https://proxy.cors.sh/${targetUrl}`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-cors-api-key": "temp_" + Math.random()
          },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
          }),
        }
      );

      const data = await res.json();

      if (!data.access_token) {
        setStatus("❌ Token nahi mila: " + JSON.stringify(data));
        return;
      }

      setStatus("💾 Store save ho raha hai...");

      const { data: { user } } = await supabase.auth.getUser();
      const storeName = shop.replace(".myshopify.com", "");

      await supabase.from("stores").upsert({
        user_id: user.id,
        store_name: storeName,
        shopify_url: shop,
        api_token: data.access_token,
        platform: "shopify",
      }, { onConflict: "shopify_url" });

      setStatus("✅ Store connected! Redirect ho raha hai...");
      setTimeout(() => { window.location.href = "/"; }, 2000);

    } catch (err) {
      setStatus("❌ Error: " + err.message);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f172a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontSize: "18px",
      flexDirection: "column",
      gap: "1rem"
    }}>
      <div style={{ fontSize: 48 }}>🔗</div>
      <div>{status}</div>
    </div>
  );
}