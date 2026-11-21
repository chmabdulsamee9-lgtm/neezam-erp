// Master Dashboard › Agnes AI (eNeezam owner only): API keys (rotated round-robin like Gemini; a key that fails or
// hits its limit is skipped), endpoint and model settings, quick tests, and 30-day usage (chat for Neezi's store
// setup, images for banners).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";

const CF = "https://neezam-erp.chmabdulsamee9.workers.dev";
async function api(path, method = "GET", body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${CF}${path}`, { method, headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  try { return await res.json(); } catch { return { error: `HTTP ${res.status}` }; }
}
const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: 18 };
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box" };
const btn = (p) => ({ background: p ? "var(--ne-grad)" : "transparent", color: p ? "#fff" : "var(--ne-text)", border: p ? "none" : "1px solid var(--ne-border)", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });

export default function AgnesMonitor() {
  const [keys, setKeys] = useState([]);
  const [settings, setSettings] = useState(null);
  const [usage, setUsage] = useState([]);
  const [form, setForm] = useState({ label: "", api_key: "" });
  const [msg, setMsg] = useState("");
  const [test, setTest] = useState("");
  const load = useCallback(async () => {
    const [k, s, u] = await Promise.all([api("/agnes/keys"), api("/agnes/settings"), api("/agnes/usage")]);
    setKeys(k.items || []); setSettings(s.error ? null : s); setUsage(u.items || []);
    if (k.error) setMsg(k.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const addKey = async () => {
    const d = await api("/agnes/keys", "POST", form);
    setMsg(d.error || "Key added. It joins the rotation right away.");
    if (!d.error) { setForm({ label: "", api_key: "" }); load(); }
  };
  const stats = useMemo(() => {
    const byDay = {}, byKind = { chat: [0, 0], image: [0, 0] }, byKey = {};
    for (const u of usage) {
      const d = u.created_at.slice(0, 10);
      byDay[d] = (byDay[d] || 0) + 1;
      const k = byKind[u.kind] || (byKind[u.kind] = [0, 0]);
      k[u.ok ? 0 : 1]++;
      const kk = byKey[u.key_id] || (byKey[u.key_id] = [0, 0]);
      kk[u.ok ? 0 : 1]++;
    }
    const days = Object.entries(byDay).sort().slice(-14);
    return { days, byKind, byKey, max: Math.max(1, ...days.map(([, n]) => n)) };
  }, [usage]);
  return (
    <div style={{ padding: "20px 24px 40px", maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
      <div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Agnes AI</h1><p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ne-muted)" }}>Neezi uses Agnes to set up stores (collections, menus, text) and to design banners for Grow and Advance. Add as many keys as you like: they rotate like the Gemini keys, and a key that fails or hits its limit is skipped.</p></div>
      {msg && <div style={{ ...card, padding: 10, fontSize: 12.5 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <div style={{ ...card, display: "grid", gap: 10 }}>
          <b>API keys</b>
          {keys.length === 0 && <p style={{ margin: 0, fontSize: 12.5, color: "var(--ne-muted)" }}>No key yet. Create one at platform.agnes-ai.com › Settings › API Keys and paste it below.</p>}
          {keys.map((k) => (
            <div key={k.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", borderBottom: "1px solid var(--ne-border)", paddingBottom: 8, fontSize: 12.5 }}>
              <div><b>{k.label || `Key ${k.id}`}</b> <span style={{ color: "var(--ne-muted)" }}>{k.masked}</span><div style={{ fontSize: 11.5, color: k.last_error ? "#dc2626" : "var(--ne-muted)" }}>{k.last_error ? `Last error: ${k.last_error.slice(0, 90)}` : k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString("en-PK")}` : "Not used yet"}</div></div>
              <button style={btn(false)} onClick={async () => { await api("/agnes/keys", "PATCH", { id: k.id, is_active: !k.is_active }); load(); }}>{k.is_active ? "Active" : "Off"}</button>
              <button style={btn(false)} onClick={async () => { if (window.confirm("Remove this key?")) { await api("/agnes/keys", "DELETE", { id: k.id }); load(); } }}><Icon name="trash" size={12} /></button>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8 }}>
            <input style={input} placeholder="Label (e.g. Account 1)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <input style={input} placeholder="Paste API key" type="password" autoComplete="off" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            <button style={btn(true)} onClick={addKey}><Icon name="plus" size={12} /> Add</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button style={btn(false)} onClick={async () => { setTest("Testing chat…"); const d = await api("/agnes/test", "POST", { kind: "chat" }); setTest(d.ok ? `Chat OK (${d.model}): ${d.reply}` : `Chat failed: ${d.error}`); load(); }}>Test chat</button>
            <button style={btn(false)} onClick={async () => { setTest("Testing image…"); const d = await api("/agnes/test", "POST", { kind: "image" }); setTest(d.ok ? `Image OK (${d.model})` : `Image failed: ${d.error}`); load(); }}>Test image</button>
            <span style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>{test}</span>
          </div>
        </div>
        <div style={{ ...card, display: "grid", gap: 10 }}>
          <b>Endpoint and models</b>
          {settings ? (
            <>
              {[["base_url", "API base URL"], ["chat_model", "Chat model (Neezi setup)"], ["image_model", "Image model (banners)"]].map(([k, l]) => (
                <label key={k} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ne-muted)" }}>{l}<input style={{ ...input, marginTop: 4 }} value={settings[k] || ""} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} /></label>
              ))}
              <div><button style={btn(true)} onClick={async () => { const d = await api("/agnes/settings", "POST", settings); setMsg(d.error || "Settings saved."); }}>Save</button></div>
            </>
          ) : <p style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>Loading…</p>}
        </div>
      </div>
      <div style={{ ...card, display: "grid", gap: 12 }}>
        <b>Usage (last 30 days)</b>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(stats.byKind).map(([k, [ok, bad]]) => <div key={k} style={{ ...card, padding: 12, minWidth: 150 }}><div style={{ fontSize: 11.5, color: "var(--ne-muted)", fontWeight: 700 }}>{k === "chat" ? "Store setups (chat)" : "Banners (images)"}</div><b style={{ fontSize: 20 }}>{ok}</b> <span style={{ fontSize: 12, color: bad ? "#dc2626" : "var(--ne-muted)" }}>{bad} failed</span></div>)}
          {Object.entries(stats.byKey).map(([id, [ok, bad]]) => <div key={id} style={{ ...card, padding: 12, minWidth: 130 }}><div style={{ fontSize: 11.5, color: "var(--ne-muted)", fontWeight: 700 }}>{keys.find((k) => String(k.id) === String(id))?.label || `Key ${id}`}</div><b style={{ fontSize: 20 }}>{ok + bad}</b> <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>calls</span></div>)}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
          {stats.days.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>No calls yet.</p> : stats.days.map(([d, n]) => <div key={d} title={`${d}: ${n}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><div style={{ width: "100%", height: `${(n / stats.max) * 90}px`, background: "var(--ne-grad)", borderRadius: 4 }} /><span style={{ fontSize: 9.5, color: "var(--ne-muted)" }}>{d.slice(5)}</span></div>)}
        </div>
        <div style={{ maxHeight: 260, overflowY: "auto", fontSize: 12 }}>
          {usage.slice(0, 60).map((u) => <div key={u.id} style={{ display: "grid", gridTemplateColumns: "150px 70px 1fr 70px", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--ne-border)" }}><span>{new Date(u.created_at).toLocaleString("en-PK")}</span><span>{u.kind}</span><span style={{ color: u.ok ? "var(--ne-text)" : "#dc2626", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.ok ? u.model : u.error}</span><span>{u.ms ? `${(u.ms / 1000).toFixed(1)}s` : ""}</span></div>)}
        </div>
      </div>
    </div>
  );
}
