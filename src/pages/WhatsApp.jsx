import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const WHATSAPP_SERVER = "https://neezam-whatsapp-production.up.railway.app";

const DEFAULT_TEMPLATES = {
  new_order: "Assalam o Alaikum {name}! Aapka order #{orderNo} receive ho gaya hai. Jald delivery hogi. Shukriya!",
  approved: "Aapka order #{orderNo} approve ho gaya hai! Jald dispatch hoga.",
  cancelled: "Aapka order #{orderNo} cancel ho gaya hai. Wajah: {reason}",
};

const TEMPLATE_DEFS = [
  { key: "new_order", labelKey: "whatsapp.template.newOrder", icon: "package", toggleKey: "auto_new_order", color: "#3b82f6" },
  { key: "approved",  labelKey: "whatsapp.template.approved",  icon: "check", toggleKey: "auto_approved",  color: "#16a34a" },
  { key: "cancelled", labelKey: "whatsapp.template.cancelled", icon: "close", toggleKey: "auto_cancelled", color: "#ef4444" },
];

export default function WhatsApp() {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [clientId, setClientId]         = useState(null);
  const [status, setStatus]             = useState("idle"); // idle | loading | qr | connected | error
  const [qrDataUrl, setQrDataUrl]       = useState(null);
  const [settings, setSettings]         = useState({
    auto_new_order: false,
    auto_approved:  false,
    auto_cancelled: false,
    template_new_order: DEFAULT_TEMPLATES.new_order,
    template_approved:  DEFAULT_TEMPLATES.approved,
    template_cancelled: DEFAULT_TEMPLATES.cancelled,
  });
  const [connTab, setConnTab]                 = useState("qr"); // "qr" | "phone"
  const [phoneNumber, setPhoneNumber]         = useState("");
  const [pairingCode, setPairingCode]         = useState(null);
  const [pairingLoading, setPairingLoading]   = useState(false);
  const [pairingError, setPairingError]       = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editText, setEditText]               = useState("");
  const [saving, setSaving]                   = useState(false);
  const [disconnecting, setDisconnecting]     = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    loadData();
    return () => clearInterval(pollRef.current);
  }, []);

  const loadData = async () => {
    const { data: store } = await supabase.from("stores").select("id").limit(1).single();
    if (!store) return;
    const cId = String(store.id);
    setClientId(cId);

    const { data: ws } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("client_id", cId)
      .single();

    if (ws) {
      setSettings({
        auto_new_order: ws.auto_new_order ?? false,
        auto_approved:  ws.auto_approved  ?? false,
        auto_cancelled: ws.auto_cancelled ?? false,
        template_new_order: ws.template_new_order || DEFAULT_TEMPLATES.new_order,
        template_approved:  ws.template_approved  || DEFAULT_TEMPLATES.approved,
        template_cancelled: ws.template_cancelled || DEFAULT_TEMPLATES.cancelled,
      });
    }

    // Check if already connected
    try {
      const res  = await fetch(`${WHATSAPP_SERVER}/status/${cId}`);
      const data = await res.json();
      if (data.status === "connected") setStatus("connected");
    } catch {
      // server offline — stay idle
    }
  };

  // ─── QR polling ────────────────────────────────────────────────────────────

  const fetchQR = async (cId) => {
    try {
      const res  = await fetch(`${WHATSAPP_SERVER}/qr/${cId}`);
      const data = await res.json();
      if (data.status === "connected") {
        setStatus("connected");
        setQrDataUrl(null);
        clearInterval(pollRef.current);
      } else if (data.status === "qr" && data.qr) {
        setStatus("qr");
        setQrDataUrl(data.qr);
      }
    } catch {
      setStatus("error");
      clearInterval(pollRef.current);
    }
  };

  const startQR = async () => {
    if (!clientId) return;
    setStatus("loading");
    setQrDataUrl(null);
    clearInterval(pollRef.current);
    await fetchQR(clientId);
    pollRef.current = setInterval(() => fetchQR(clientId), 5000);
  };

  // ─── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = async () => {
    if (!clientId) return;
    setDisconnecting(true);
    try {
      await fetch(`${WHATSAPP_SERVER}/disconnect/${clientId}`, { method: "POST" });
    } catch { /* ignore */ }
    clearInterval(pollRef.current);
    setStatus("idle");
    setQrDataUrl(null);
    setDisconnecting(false);
  };

  // ─── Settings ───────────────────────────────────────────────────────────────

  const persistSettings = async (updated) => {
    if (!clientId) return;
    setSaving(true);
    await supabase.from("whatsapp_settings").upsert(
      { client_id: clientId, ...updated, updated_at: new Date().toISOString() },
      { onConflict: "client_id" }
    );
    setSaving(false);
  };

  const handleToggle = (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    persistSettings(updated);
  };

  const requestCode = async () => {
    if (!clientId || !phoneNumber.trim()) return;
    setPairingLoading(true);
    setPairingCode(null);
    setPairingError(null);
    try {
      const res  = await fetch(`${WHATSAPP_SERVER}/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, phoneNumber: phoneNumber.trim() }),
      });
      const data = await res.json();
      if (data.status === "connected") {
        setStatus("connected");
      } else if (data.code) {
        setPairingCode(data.code);
        // Poll for connection after user enters the code
        clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const r = await fetch(`${WHATSAPP_SERVER}/status/${clientId}`);
            const d = await r.json();
            if (d.status === "connected") {
              setStatus("connected");
              setPairingCode(null);
              clearInterval(pollRef.current);
            }
          } catch { /* ignore */ }
        }, 5000);
      } else {
        setPairingError(data.error || t("whatsapp.codeNotFound"));
      }
    } catch {
      setPairingError(t("whatsapp.serverConnectFailed"));
    }
    setPairingLoading(false);
  };

  const handleSaveTemplate = () => {
    const updated = { ...settings, [`template_${editingTemplate}`]: editText };
    setSettings(updated);
    setEditingTemplate(null);
    persistSettings(updated);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "1.25rem", color: "#fff", maxWidth: 680 }}>

      {/* ── Connection card ── */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: 14, color: "#94a3b8", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="comment" size={13} /> {t("whatsapp.connectionTitle")}
          </h2>
          {status !== "connected" && (
            <div style={{ display: "flex", background: "#0f172a", borderRadius: 8, padding: 2, gap: 2 }}>
              {["qr", "phone"].map(tabKey => (
                <button key={tabKey} onClick={() => { setConnTab(tabKey); setPairingCode(null); setPairingError(null); clearInterval(pollRef.current); setStatus("idle"); setQrDataUrl(null); }}
                  style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: connTab === tabKey ? "#3b82f6" : "transparent", color: connTab === tabKey ? "#fff" : "#64748b", fontSize: 11, cursor: "pointer", fontWeight: connTab === tabKey ? 600 : 400, transition: "all 0.15s" }}>
                  {tabKey === "qr" ? t("whatsapp.qrTab") : t("whatsapp.phoneTab")}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Connected */}
        {status === "connected" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 6px #16a34a" }} />
              <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 14 }}>{t("whatsapp.connected")}</span>
            </div>
            <button onClick={disconnect} disabled={disconnecting}
              style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", fontSize: 12, cursor: disconnecting ? "default" : "pointer", fontWeight: 500 }}>
              {disconnecting ? t("whatsapp.disconnecting") : t("whatsapp.disconnect")}
            </button>
          </div>
        )}

        {/* ── QR tab ── */}
        {connTab === "qr" && (
          <>
            {(status === "idle" || status === "error") && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "1rem 0" }}>
                {status === "error" && (
                  <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>
                    {t("whatsapp.serverError")}
                  </p>
                )}
                <button onClick={startQR}
                  style={{ padding: "8px 28px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="link" size={13} /> {t("whatsapp.connectButton")}
                </button>
              </div>
            )}
            {status === "loading" && (
              <div style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8", fontSize: 13 }}>
                {t("whatsapp.generatingQr")}
              </div>
            )}
            {status === "qr" && qrDataUrl && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <img src={qrDataUrl} alt="WhatsApp QR Code"
                  style={{ width: 230, height: 230, borderRadius: 10, border: "3px solid #16a34a", background: "#fff", display: "block" }} />
                <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, textAlign: "center" }}>
                  {t("whatsapp.qrInstructionPrefix")}{" "}
                  <strong style={{ color: "#e2e8f0" }}>{t("whatsapp.qrInstructionBold")}</strong>{" "}
                  {t("whatsapp.qrInstructionSuffix")}
                </p>
                <span style={{ fontSize: 10, color: "#475569" }}>{t("whatsapp.autoRefresh")}</span>
              </div>
            )}
          </>
        )}

        {/* ── Phone Number tab ── */}
        {connTab === "phone" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0.5rem 0" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder={t("whatsapp.phonePlaceholder")}
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 12, outline: "none" }}
              />
              <button onClick={requestCode} disabled={pairingLoading || !phoneNumber.trim()}
                style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: pairingLoading ? "#1e3a5f" : "#3b82f6", color: "#fff", fontSize: 12, cursor: pairingLoading ? "default" : "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                {pairingLoading ? "..." : t("whatsapp.getCode")}
              </button>
            </div>

            {pairingError && (
              <p style={{ margin: 0, fontSize: 12, color: "#ef4444" }}>{pairingError}</p>
            )}

            {pairingCode && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "1rem", background: "#0f172a", borderRadius: 10, border: "1px solid #16a34a" }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{t("whatsapp.yourPairingCode")}</span>
                <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: 6, color: "#16a34a", fontFamily: "monospace" }}>
                  {pairingCode}
                </span>
                <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", textAlign: "center", lineHeight: 1.6 }}>
                  {t("whatsapp.pairingInstructionPrefix")}{" "}
                  <strong style={{ color: "#e2e8f0" }}>{t("whatsapp.pairingInstructionBold")}</strong>{" "}
                  {t("whatsapp.pairingInstructionSuffix")}
                </p>
                <span style={{ fontSize: 10, color: "#475569" }}>{t("whatsapp.waitingForConnection")}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Templates card ── */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: 14, color: "#94a3b8", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="edit" size={13} /> {t("whatsapp.templatesTitle")}
          </h2>
          {saving && <span style={{ fontSize: 10, color: "#3b82f6" }}>{t("whatsapp.saving")}</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {TEMPLATE_DEFS.map(({ key, labelKey, icon, toggleKey, color }) => (
            <div key={key} style={{ background: "#0f172a", borderRadius: 10, padding: "0.9rem", border: "1px solid #1e293b" }}>

              {/* Row header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name={icon} size={14} style={{ color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color }}>{t(labelKey)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{t("whatsapp.autoSend")}</span>
                  {/* Toggle pill */}
                  <div onClick={() => handleToggle(toggleKey)}
                    style={{ width: 38, height: 20, borderRadius: 10, background: settings[toggleKey] ? "#16a34a" : "#334155", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: 2, left: settings[toggleKey] ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
                  </div>
                </div>
              </div>

              {/* Edit mode */}
              {editingTemplate === key ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3b82f6", background: "#1e293b", color: "#fff", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                  <p style={{ margin: 0, fontSize: 10, color: "#475569" }}>
                    {t("whatsapp.variablesLabel")} <code style={{ color: "#94a3b8" }}>{"{name}"}</code>{" "}
                    <code style={{ color: "#94a3b8" }}>{"{orderNo}"}</code>{" "}
                    <code style={{ color: "#94a3b8" }}>{"{reason}"}</code>
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleSaveTemplate}
                      style={{ padding: "4px 14px", borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                      {t("whatsapp.save")}
                    </button>
                    <button onClick={() => setEditingTemplate(null)}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>
                      {t("whatsapp.cancel")}
                    </button>
                    <button onClick={() => setEditText(DEFAULT_TEMPLATES[key])}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 11, cursor: "pointer" }}>
                      {t("whatsapp.resetDefault")}
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.55, flex: 1 }}>
                    {settings[`template_${key}`]}
                  </p>
                  <button onClick={() => { setEditingTemplate(key); setEditText(settings[`template_${key}`]); }}
                    style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {t("whatsapp.edit")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
