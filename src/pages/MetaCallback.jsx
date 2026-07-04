import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev"

export default function MetaCallback() {
  const [status, setStatus] = useState("🔄 Processing...");
  const [adAccounts, setAdAccounts] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [storeId, setStoreId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state"); // MetaConnect.jsx ne authorize URL mein state=storeId bheja tha

      if (!code || !state) {
        setStatus("❌ Invalid callback!");
        return;
      }
      setStoreId(state);

      setStatus("🔄 Token le rahe hain...");

      const res = await fetch(`${CF_URL}/meta-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: state, code }),
      });
      const data = await res.json();

      if (!data.access_token) {
        setStatus("❌ Token nahi mila: " + JSON.stringify(data));
        return;
      }

      setAccessToken(data.access_token);
      const accounts = data.adAccounts || [];

      if (accounts.length === 0) {
        setStatus("❌ Koi ad account nahi mila is Facebook login se.");
        return;
      }

      if (accounts.length === 1) {
        await selectAccount(accounts[0], data.access_token, state);
        return;
      }

      setAdAccounts(accounts);
      setSelectedId(accounts[0].account_id);
      setStatus("");
    } catch (err) {
      setStatus("❌ Error: " + err.message);
    }
  };

  const selectAccount = async (account, token, sId) => {
    setSaving(true);
    setStatus("💾 Account save ho raha hai...");
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        localStorage.setItem("pending_meta_account", JSON.stringify({ storeId: sId, accessToken: token, account }));
        setStatus("✅ Almost done! Login page pe ja rahe hain...");
        setTimeout(() => { window.location.href = "/"; }, 1500);
        return;
      }

      const res = await fetch(`${CF_URL}/meta-select-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          storeId: sId,
          accessToken: token,
          adAccountId: account.account_id,
          adAccountName: account.name,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus("❌ Save error: " + data.error);
        setSaving(false);
        return;
      }

      setStatus("✅ Meta account connected! Redirect ho raha hai...");
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (err) {
      setStatus("❌ Error: " + err.message);
      setSaving(false);
    }
  };

  const handleConfirmSelection = () => {
    const account = adAccounts.find(a => a.account_id === selectedId);
    if (account) selectAccount(account, accessToken, storeId);
  };

  if (adAccounts) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", padding: "1rem" }}>
        <div style={{ background: "#161B45", border: "1px solid #232A52", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 420 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>📣 Ad Account Select Karo</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8C93C4" }}>Aapke Facebook login mein {adAccounts.length} ad accounts mile — apna sahi account select karo.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 400, overflowY: "auto" }}>
            {adAccounts.map(acc => (
              <label key={acc.account_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: `1px solid ${selectedId === acc.account_id ? "#5C7CFA" : "#232A52"}`, background: selectedId === acc.account_id ? "rgba(92,124,250,.1)" : "transparent", cursor: "pointer" }}>
                <input type="radio" checked={selectedId === acc.account_id} onChange={() => setSelectedId(acc.account_id)} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{acc.name}</div>
                  <div style={{ fontSize: 11, color: "#8C93C4" }}>ID: {acc.account_id} · {acc.currency}</div>
                </div>
              </label>
            ))}
          </div>
          {status && <p style={{ fontSize: 12, color: "#F26D6D", marginBottom: 12 }}>{status}</p>}
          <button onClick={handleConfirmSelection} disabled={saving}
            style={{ width: "100%", padding: "12px", background: saving ? "#232A52" : "linear-gradient(120deg, #5C7CFA 0%, #A855F7 100%)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Connect ho raha hai..." : "✓ Confirm & Connect"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "18px", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: 48 }}>📣</div>
      <div>{status}</div>
    </div>
  );
}
