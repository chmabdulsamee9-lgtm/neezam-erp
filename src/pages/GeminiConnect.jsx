import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

export default function GeminiConnect({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testState, setTestState] = useState(null); // null | "testing" | "ok" | "fail"
  const [testError, setTestError] = useState("");

  useEffect(() => {
    fetchStore();
  }, [storeId]);

  const fetchStore = async () => {
    setLoading(true);
    if (!storeId) { setStore(null); setLoading(false); return; }
    const { data } = await supabase.from("stores").select("id, store_name, gemini_api_key").eq("id", storeId).single();
    setStore(data || null);
    setLoading(false);
  };

  const maskKey = (key) => (key.length > 8 ? `${key.slice(0, 4)}••••••${key.slice(-4)}` : "••••••");

  const handleSave = async () => {
    setError("");
    if (!input.trim()) { setError(t("geminiConnect.keyRequired")); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/gemini-key-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ api_key: input.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || t("geminiConnect.keyInvalid"));
        setSaving(false);
        return;
      }
      const { error: err } = await supabase.from("stores").update({ gemini_api_key: input.trim() }).eq("id", storeId);
      if (err) { setError(err.message); setSaving(false); return; }
      setInput("");
      setEditing(false);
      fetchStore();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleDisconnect = async () => {
    setSaving(true);
    await supabase.from("stores").update({ gemini_api_key: null }).eq("id", storeId);
    setSaving(false);
    setTestState(null);
    fetchStore();
  };

  const handleTest = async () => {
    setTestState("testing");
    setTestError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/gemini-key-test-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: storeId }),
      });
      const data = await res.json();
      if (data.success) {
        setTestState("ok");
      } else {
        setTestState("fail");
        setTestError(data.error || "");
      }
    } catch (err) {
      setTestState("fail");
      setTestError(err.message);
    }
  };

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem 1.25rem", boxShadow: "0 2px 8px rgba(0,0,0,.18)" };
  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box" };

  if (loading) {
    return (
      <div style={{ padding: "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="key" size={17} /> {t("geminiConnect.title")}</h1>
        <p style={{ marginTop: 16, color: "var(--ne-muted)" }}>{t("geminiConnect.loading")}</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div style={{ padding: "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="key" size={17} /> {t("geminiConnect.title")}</h1>
        <div style={{ ...cardStyle, marginTop: "1.5rem", textAlign: "center", color: "var(--ne-muted)" }}>
          {t("geminiConnect.noStore")}
        </div>
      </div>
    );
  }

  const hasKey = !!store.gemini_api_key;

  return (
    <div style={{ padding: "1.5rem", color: "var(--ne-text)" }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="key" size={17} /> {t("geminiConnect.title")}</h1>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ne-muted)" }}>{t("geminiConnect.subtitle")}</p>

      <div style={{ ...cardStyle, marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{store.store_name}</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ne-muted-2)" }}>
              {hasKey ? maskKey(store.gemini_api_key) : t("geminiConnect.usingDefault")}
            </p>
          </div>
          {hasKey ? (
            <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-success-soft)", color: "var(--ne-success)", borderRadius: 20, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="check" size={10} /> {t("geminiConnect.connected")}
            </span>
          ) : (
            <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-warning-soft)", color: "var(--ne-warning)", borderRadius: 20, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="pending" size={10} /> {t("geminiConnect.notConnected")}
            </span>
          )}
        </div>

        {!editing ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => { setInput(""); setError(""); setTestState(null); setEditing(true); }}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {hasKey ? t("geminiConnect.change") : t("geminiConnect.setKey")}
            </button>
            {hasKey && (
              <button onClick={handleDisconnect} disabled={saving}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--ne-danger)", background: "transparent", color: "var(--ne-danger)", fontSize: 12, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                {t("geminiConnect.disconnect")}
              </button>
            )}
            {hasKey && (
              <button onClick={handleTest} disabled={testState === "testing"}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12, fontWeight: 700, cursor: testState === "testing" ? "default" : "pointer" }}>
                {testState === "testing" ? t("geminiConnect.testing") : t("geminiConnect.testConnection")}
              </button>
            )}
            {testState === "ok" && (
              <span style={{ fontSize: 12, color: "var(--ne-success)", fontWeight: 600 }}>{t("geminiConnect.testOk")}</span>
            )}
            {testState === "fail" && (
              <span style={{ fontSize: 12, color: "var(--ne-danger)", fontWeight: 600 }}>{t("geminiConnect.testFail")}{testError ? `: ${testError}` : ""}</span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="password" placeholder={t("geminiConnect.keyPlaceholder")} value={input} onChange={e => setInput(e.target.value)}
              style={{ ...inputStyle, width: 280 }} />
            <button onClick={handleSave} disabled={saving}
              style={{ padding: "9px 18px", background: saving ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
              {saving ? t("geminiConnect.verifying") : t("geminiConnect.save")}
            </button>
            <button onClick={() => { setEditing(false); setError(""); }} disabled={saving}
              style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 13, cursor: saving ? "default" : "pointer" }}>
              {t("geminiConnect.cancel")}
            </button>
          </div>
        )}
        {error && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
