import { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { workerFetch } from "../lib/storeApi";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const PIXEL_RE = /^[0-9]{5,20}$/;

// the result of the OAuth round trip comes back as ?meta=connected | cancelled | error&reason=...
function bannerFromUrl(t) {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const result = params.get("meta");
  if (!result) return null;
  if (result === "connected") return { kind: "success", text: t("metaConnect.bannerConnected") };
  if (result === "cancelled") return { kind: "info", text: t("metaConnect.bannerCancelled") };
  const key = `metaConnect.reason.${params.get("reason")}`;
  const reason = t(key) === key ? t("metaConnect.reason.generic") : t(key);
  return { kind: "error", text: `${t("metaConnect.bannerError")} ${reason}` };
}

// Meta Connect: the OAuth round trip, the token and the ad-account / pixel checks all happen on the server. This page never
// sees, stores or sends a token: it only starts the connection (/meta-oauth-start), reads the status (/meta-status) and
// picks an ad account and a pixel by id.
export default function MetaConnect({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [banner, setBanner] = useState(() => bannerFromUrl(t)); // { kind: "success" | "error" | "info", text }
  const [accounts, setAccounts] = useState(null); // null = not loaded
  const [accountChoice, setAccountChoice] = useState("");
  const [pixels, setPixels] = useState(null);
  const [pixelsState, setPixelsState] = useState("idle"); // idle | ok | unavailable
  const [pixelChoice, setPixelChoice] = useState("");
  const [manualPixel, setManualPixel] = useState("");
  const [testCodeEdit, setTestCodeEdit] = useState(null); // null = show the saved code
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const call = useCallback((path, extra = {}) => workerFetch(CF_URL, path, { method: "POST", body: JSON.stringify({ store_id: storeId, ...extra }) }), [storeId]);

  const loadStatus = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const { data } = await call("/meta-status", { verify: true });
    setStatus(data && !data.error ? data : { connected: false, configured: data?.error !== "meta_not_configured", error: data?.error || "" });
    setLoading(false);
  }, [storeId, call]);

  // drop ?meta=... from the address bar once it was read
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("meta")) return;
    params.delete("meta");
    params.delete("reason");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  useEffect(() => { setAccounts(null); setPixels(null); setPixelsState("idle"); loadStatus(); }, [storeId, loadStatus]);

  const needsReconnect = !!status?.needs_reconnect;
  const connected = !!status?.connected;
  const level = status?.data_sharing || "standard";
  const testCode = testCodeEdit ?? status?.capi_test_code ?? "";

  // Standard / Enhanced / Maximum. The worker checks the token, the pixel and the staff permission; this only asks and shows the answer.
  const saveSharing = async (next) => {
    if (next === level && next !== "maximum") return;
    const code = next === "maximum" ? testCode.trim() : "";
    if (code && !/^[A-Za-z0-9]{3,30}$/.test(code)) { setBanner({ kind: "error", text: t("metaConnect.sharingBadTestCode") }); return; }
    setBusy("sharing");
    const { data } = await call("/meta-set-sharing", { level: next, ...(code ? { test_code: code } : {}) });
    setBusy("");
    if (data?.success) { setTestCodeEdit(null); setBanner({ kind: "success", text: t("metaConnect.sharingSaved") }); await loadStatus(); return; }
    const errs = { sharing_unavailable: "sharingUnavailable", maximum_needs_connection: "sharingNeedsConnection", meta_token_expired: "sharingTokenExpired", maximum_needs_pixel: "sharingNeedsPixel", invalid_test_code: "sharingBadTestCode" };
    setBanner({ kind: "error", text: t(`metaConnect.${errs[data?.error] || "sharingFailed"}`) });
  };

  const handleConnect = async () => {
    setBusy("connect");
    setBanner(null);
    const { data } = await call("/meta-oauth-start", { return_to: window.location.origin });
    if (data?.url) { window.location.href = data.url; return; }
    setBusy("");
    setBanner({ kind: "error", text: data?.error === "meta_not_configured" ? t("metaConnect.notConfigured") : t("metaConnect.startFailed") });
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t("metaConnect.disconnectConfirm"))) return;
    setBusy("disconnect");
    setBanner(null);
    const { status: code, data } = await call("/meta-disconnect");
    setBusy("");
    if (code === 200 && data?.success) { setAccounts(null); setPixels(null); setPixelsState("idle"); await loadStatus(); return; }
    setBanner({ kind: "error", text: data?.error || t("metaConnect.disconnectFailed") });
  };

  const loadAccounts = async () => {
    setBusy("accounts");
    const { data } = await call("/meta-ad-accounts");
    setBusy("");
    if (data?.needs_reconnect) { await loadStatus(); return; }
    if (data?.error) { setBanner({ kind: "error", text: t("metaConnect.adAccountLoadFailed") }); return; }
    setAccounts(data.accounts || []);
    setAccountChoice(data.selected || data.accounts?.[0]?.account_id || "");
  };

  const saveAccount = async () => {
    if (!accountChoice) return;
    setBusy("account");
    const { data } = await call("/meta-set-account", { ad_account_id: accountChoice });
    setBusy("");
    if (data?.success) { setAccounts(null); setBanner({ kind: "success", text: t("metaConnect.adAccountSaved") }); setPixels(null); setPixelsState("idle"); await loadStatus(); return; }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: t("metaConnect.adAccountLoadFailed") });
  };

  const loadPixels = useCallback(async () => {
    setBusy("pixels");
    const { data } = await call("/meta-pixels");
    setBusy("");
    if (data?.needs_reconnect) { await loadStatus(); return; }
    if (data?.pixels) { setPixels(data.pixels); setPixelsState("ok"); setPixelChoice(data.selected || data.pixels[0]?.id || ""); return; }
    setPixels([]);
    setPixelsState("unavailable");
  }, [call, loadStatus]);

  useEffect(() => { if (connected && !needsReconnect && status?.ad_account_id && pixelsState === "idle") loadPixels(); }, [connected, needsReconnect, status?.ad_account_id, pixelsState, loadPixels]);

  const savePixel = async (id) => {
    if (!PIXEL_RE.test(id)) { setBanner({ kind: "error", text: t("metaConnect.pixelInvalid") }); return; }
    setBusy("pixel");
    const { data } = await call("/meta-set-pixel", { pixel_id: id });
    setBusy("");
    if (data?.success) { setManualPixel(""); setBanner({ kind: "success", text: t("metaConnect.pixelSaved") }); await loadStatus(); return; }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: data?.error === "pixel_not_in_account" ? t("metaConnect.pixelNotInAccount") : t("metaConnect.pixelInvalid") });
  };

  const removePixel = async () => {
    if (!window.confirm(t("metaConnect.pixelRemoveConfirm"))) return;
    setBusy("pixelRemove");
    const { data } = await call("/meta-remove-pixel");
    setBusy("");
    if (data?.success) { setBanner({ kind: "success", text: t("metaConnect.pixelRemoved") }); await loadStatus(); return; }
    setBanner({ kind: "error", text: t("metaConnect.pixelInvalid") });
  };

  const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem", marginBottom: 14 };
  const btnPrimary = (off) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", background: "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: off ? "default" : "pointer", opacity: off ? 0.6 : 1 });
  const btnGhost = (off, danger) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", background: "transparent", border: `1px solid ${danger ? "var(--ne-danger)" : "var(--ne-border)"}`, color: danger ? "var(--ne-danger)" : "var(--ne-text)", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: off ? "default" : "pointer", opacity: off ? 0.6 : 1 });
  const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 13 };
  const bannerColors = { success: ["var(--ne-success-soft)", "var(--ne-success)"], error: ["var(--ne-danger-soft)", "var(--ne-danger)"], info: ["var(--ne-warning-soft)", "var(--ne-warning)"] };

  const days = status?.expires_in_days;
  const expiryText = days === null || days === undefined ? "" : days < 0 ? t("metaConnect.expired") : days === 0 ? t("metaConnect.expiresToday") : t("metaConnect.expiresIn").replace("{days}", String(days));

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", maxWidth: 640, margin: "0 auto", color: "var(--ne-text)" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="megaphone" size={17} /> {t("metaConnect.title")}</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("metaConnect.subtitle")}</p>
      </div>

      {banner && (
        <div role="status" style={{ ...card, background: bannerColors[banner.kind][0], color: bannerColors[banner.kind][1], padding: "10px 14px", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={banner.kind === "success" ? "check" : "warning"} size={14} /> <span style={{ flex: 1 }}>{banner.text}</span>
          <button onClick={() => setBanner(null)} aria-label={t("metaConnect.dismiss")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}><Icon name="close" size={12} /></button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("metaConnect.loading")}</div>
      ) : (
        <>
          {status && status.configured === false && (
            <div style={{ ...card, color: "var(--ne-warning)", fontSize: 12.5, fontWeight: 600 }}>{t("metaConnect.notConfigured")}</div>
          )}

          {connected && needsReconnect && (
            <div role="alert" style={{ ...card, border: "1px solid var(--ne-warning)", background: "var(--ne-warning-soft)" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: "var(--ne-warning)", display: "flex", alignItems: "center", gap: 6 }}><Icon name="warning" size={14} /> {t("metaConnect.needsReconnectTitle")}</p>
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ne-text)" }}>{t("metaConnect.needsReconnectBody")}</p>
              {level === "maximum" && <p style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 600, color: "var(--ne-text)" }}>{t("metaConnect.serverPaused")}</p>}
              <button onClick={handleConnect} disabled={!!busy} style={btnPrimary(!!busy)}><Icon name="refresh" size={14} /> {busy === "connect" ? t("metaConnect.connecting") : t("metaConnect.reconnectButton")}</button>
            </div>
          )}

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--ne-border)" }}><Icon name="megaphone" size={22} /></div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{t("metaConnect.accountName")}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ne-muted-2)" }}>
                  {connected ? (status.ad_account_name || (status.ad_account_id ? `${t("metaConnect.accountIdPrefix")} ${status.ad_account_id}` : t("metaConnect.noAdAccountYet"))) : t("metaConnect.notConnectedYet")}
                </p>
                {connected && expiryText && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: days !== null && days < 7 ? "var(--ne-warning)" : "var(--ne-muted)" }}>{expiryText}</p>}
              </div>
              <span style={{ fontSize: 11, padding: "4px 12px", background: connected && !needsReconnect ? "var(--ne-success-soft)" : "var(--ne-warning-soft)", color: connected && !needsReconnect ? "var(--ne-success)" : "var(--ne-warning)", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name={connected && !needsReconnect ? "check" : "pending"} size={10} /> {connected && !needsReconnect ? t("metaConnect.connected") : t("metaConnect.notConnected")}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {!connected && (
                <button onClick={handleConnect} disabled={!!busy || status?.configured === false} style={{ ...btnPrimary(!!busy || status?.configured === false), width: isMobile ? "100%" : "auto" }}>
                  <Icon name="link" size={14} /> {busy === "connect" ? t("metaConnect.connecting") : t("metaConnect.connectButton")}
                </button>
              )}
              {connected && !needsReconnect && <button onClick={handleConnect} disabled={!!busy} style={btnGhost(!!busy)}><Icon name="refresh" size={13} /> {busy === "connect" ? t("metaConnect.connecting") : t("metaConnect.reconnectButton")}</button>}
              {connected && <button onClick={handleDisconnect} disabled={!!busy} style={btnGhost(!!busy, true)}>{busy === "disconnect" ? t("metaConnect.disconnecting") : t("metaConnect.disconnect")}</button>}
            </div>
          </div>

          {connected && !needsReconnect && (
            <div style={card}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14 }}>{t("metaConnect.adAccountTitle")}</p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ne-muted)" }}>{status.ad_account_id ? `${t("metaConnect.adAccountCurrent")}: ${status.ad_account_name || status.ad_account_id}` : t("metaConnect.adAccountPickHelp")}</p>
              {accounts === null ? (
                <button onClick={loadAccounts} disabled={!!busy} style={btnGhost(!!busy)}>{busy === "accounts" ? t("metaConnect.loading") : status.ad_account_id ? t("metaConnect.adAccountChange") : t("metaConnect.adAccountPick")}</button>
              ) : accounts.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--ne-warning)" }}>{t("metaConnect.adAccountNone")}</p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select value={accountChoice} onChange={(e) => setAccountChoice(e.target.value)} aria-label={t("metaConnect.adAccountTitle")} style={{ ...input, flex: 1, minWidth: 200 }}>
                    {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.name || a.account_id} ({a.account_id}){a.currency ? ` · ${a.currency}` : ""}</option>)}
                  </select>
                  <button onClick={saveAccount} disabled={!!busy || !accountChoice} style={btnPrimary(!!busy || !accountChoice)}>{busy === "account" ? t("metaConnect.saving") : t("metaConnect.adAccountSave")}</button>
                </div>
              )}
            </div>
          )}

          {connected && !needsReconnect && status.ad_account_id && (
            <div style={card}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14 }}>{t("metaConnect.pixelTitle")}</p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ne-muted)" }}>{t("metaConnect.pixelHelp")}</p>
              {status.pixel_id && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5 }}>{t("metaConnect.pixelCurrent")}: <strong dir="ltr">{status.pixel_id}</strong></span>
                  <button onClick={removePixel} disabled={!!busy} style={btnGhost(!!busy, true)}><Icon name="trash" size={13} /> {busy === "pixelRemove" ? t("metaConnect.saving") : t("metaConnect.pixelRemove")}</button>
                </div>
              )}
              {pixelsState === "ok" && pixels.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <select value={pixelChoice} onChange={(e) => setPixelChoice(e.target.value)} aria-label={t("metaConnect.pixelPick")} style={{ ...input, flex: 1, minWidth: 200 }}>
                    {pixels.map((p) => <option key={p.id} value={p.id}>{p.name || p.id} ({p.id})</option>)}
                  </select>
                  <button onClick={() => savePixel(pixelChoice)} disabled={!!busy || !pixelChoice} style={btnPrimary(!!busy || !pixelChoice)}>{busy === "pixel" ? t("metaConnect.saving") : t("metaConnect.pixelSave")}</button>
                </div>
              )}
              {pixelsState === "ok" && pixels.length === 0 && <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ne-muted)" }}>{t("metaConnect.pixelNone")}</p>}
              {pixelsState === "unavailable" && <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ne-warning)" }}>{t("metaConnect.pixelUnavailable")}</p>}
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{t("metaConnect.pixelManualLabel")}</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input dir="ltr" inputMode="numeric" value={manualPixel} onChange={(e) => setManualPixel(e.target.value.replace(/\D/g, "").slice(0, 20))} placeholder={t("metaConnect.pixelManualPlaceholder")} style={{ ...input, flex: 1, minWidth: 200 }} />
                <button onClick={() => savePixel(manualPixel)} disabled={!!busy || !PIXEL_RE.test(manualPixel)} style={btnGhost(!!busy || !PIXEL_RE.test(manualPixel))}>{t("metaConnect.pixelSave")}</button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--ne-muted-2)" }}>{t("metaConnect.pixelManualHelp")}</p>
            </div>
          )}

          {connected && status.pixel_id && (
            <div style={card}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14 }}>{t("metaConnect.sharingTitle")}</p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ne-muted)" }}>{t("metaConnect.sharingHelp")}</p>
              {status.sharing_available === false && <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ne-warning)" }}>{t("metaConnect.sharingUnavailable")}</p>}
              {level === "maximum" && days !== null && days !== undefined && days >= 0 && days <= 7 && !needsReconnect && (
                <div role="alert" style={{ marginBottom: 10, padding: "9px 12px", borderRadius: 9, background: "var(--ne-warning-soft)", color: "var(--ne-warning)", fontSize: 12.5, fontWeight: 600 }}>{t("metaConnect.sharingExpiring").replace("{days}", String(days))}</div>
              )}
              <div role="radiogroup" aria-label={t("metaConnect.sharingTitle")} style={{ display: "grid", gap: 8 }}>
                {["standard", "enhanced", "maximum"].map((key) => {
                  const blocked = key === "maximum" && needsReconnect;
                  const off = !!busy || status.sharing_available === false || blocked;
                  const on = level === key;
                  return (
                    <button key={key} role="radio" aria-checked={on} onClick={() => saveSharing(key)} disabled={off && !on} style={{ textAlign: "start", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, border: `1px solid ${on ? "var(--ne-success)" : "var(--ne-border)"}`, background: on ? "var(--ne-success-soft)" : "var(--ne-surface)", color: "var(--ne-text)", cursor: off ? "default" : "pointer", opacity: off && !on ? 0.55 : 1 }}>
                      <span style={{ marginTop: 2, width: 14 }}>{on ? <Icon name="check" size={13} /> : null}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>{t(`metaConnect.sharing_${key}`)}</span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--ne-muted)", marginTop: 2 }}>{t(`metaConnect.sharing_${key}_desc`)}</span>
                        {blocked && <span style={{ display: "block", fontSize: 11.5, color: "var(--ne-warning)", marginTop: 4 }}>{t("metaConnect.sharingMaxBlocked")}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {level === "maximum" && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{t("metaConnect.sharingTestCode")}</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input dir="ltr" value={testCode} onChange={(e) => setTestCodeEdit(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 30))} placeholder="TEST12345" style={{ ...input, flex: 1, minWidth: 200 }} />
                    <button onClick={() => saveSharing("maximum")} disabled={!!busy || needsReconnect} style={btnGhost(!!busy || needsReconnect)}>{busy === "sharing" ? t("metaConnect.saving") : t("metaConnect.pixelSave")}</button>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ne-muted-2)" }}>{t("metaConnect.sharingTestCodeHelp")}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
