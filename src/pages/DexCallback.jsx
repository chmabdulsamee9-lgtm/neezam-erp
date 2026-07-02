import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev"

export default function DexCallback() {
  const [status, setStatus] = useState("🔄 Processing...");

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const storeId = params.get("state"); // StoreConnect.jsx ne authorize URL mein state=storeId bheja tha

      if (!code || !storeId) {
        setStatus("❌ Invalid callback!");
        return;
      }

      setStatus("🔄 Token le rahe hain...");

      const res = await fetch(`${CF_URL}/dex-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!data.access_token) {
        setStatus("❌ Token nahi mila: " + JSON.stringify(data));
        return;
      }

      setStatus("💾 Store save ho raha hai...");

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        localStorage.setItem("pending_dex_store", JSON.stringify({ storeId, ...data }));
        setStatus("✅ Almost done! Login page pe ja rahe hain...");
        setTimeout(() => { window.location.href = "/"; }, 1500);
        return;
      }

      const expiresAt = data.expires_in
        ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
        : null;

      const { error } = await supabase.from("stores").update({
        dex_seller_id: data.account || data.seller_id || data.country_user_info?.[0]?.seller_id || null,
        dex_access_token: data.access_token,
        dex_refresh_token: data.refresh_token || null,
        dex_token_expires_at: expiresAt,
      }).eq("id", storeId);

      if (error) {
        setStatus("❌ Save error: " + error.message);
        return;
      }

      setStatus("✅ Dex connected! Redirect ho raha hai...");
      setTimeout(() => { window.location.href = "/"; }, 2000);

    } catch (err) {
      setStatus("❌ Error: " + err.message);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "18px", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: 48 }}>📦</div>
      <div>{status}</div>
    </div>
  );
}
