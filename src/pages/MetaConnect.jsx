import { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon";
import AssetPicker from "../components/AssetPicker";
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
export default function MetaConnect({ storeId, storeName }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [banner, setBanner] = useState(() => bannerFromUrl(t)); // { kind: "success" | "error" | "info", text }
  const [businesses, setBusinesses] = useState(null); // null = not loaded
  const [businessPermission, setBusinessPermission] = useState(true);
  const [businessChoice, setBusinessChoice] = useState("");
  const [accounts, setAccounts] = useState(null); // null = not loaded
  const [pixels, setPixels] = useState(null);
  const [pixelsState, setPixelsState] = useState("idle"); // idle | ok | unavailable
  const [manualPixel, setManualPixel] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [catalogs, setCatalogs] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [productStatus, setProductStatus] = useState(null);
  const [termsChecked, setTermsChecked] = useState(false);
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

  useEffect(() => { setBusinesses(null); setBusinessChoice(""); setAccounts(null); setPixels(null); setPixelsState("idle"); setCatalogs(null); loadStatus(); }, [storeId, loadStatus]);

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
    if (code === 200 && data?.success) { setBusinesses(null); setBusinessChoice(""); setAccounts(null); setPixels(null); setPixelsState("idle"); setCatalogs(null); await loadStatus(); return; }
    setBanner({ kind: "error", text: data?.error || t("metaConnect.disconnectFailed") });
  };

  // ---- step 1: business portfolio (picking one only filters the ad accounts; it is saved together with the ad account)
  const loadBusinesses = useCallback(async () => {
    setBusy("businesses");
    const { data } = await call("/meta-businesses");
    setBusy("");
    if (data?.needs_reconnect) { await loadStatus(); return; }
    // no business list (older server, Meta error): every ad account is shown under "All ad accounts"
    if (!data?.businesses) { setBusinesses([{ id: "all", name: "", ad_accounts: 0 }]); setBusinessChoice("all"); return; }
    setBusinesses(data.businesses);
    setBusinessPermission(data.business_permission !== false);
    setBusinessChoice((cur) => cur || data.selected || (data.businesses.length === 1 ? data.businesses[0].id : ""));
  }, [call, loadStatus]);

  // ---- step 2: ad accounts of the chosen business
  const loadAccounts = useCallback(async (biz) => {
    if (!biz) { setAccounts(null); return; }
    setBusy("accounts");
    const { data } = await call("/meta-ad-accounts", biz === "all" ? {} : { business_id: biz });
    setBusy("");
    if (data?.needs_reconnect) { await loadStatus(); return; }
    if (data?.error) { setBanner({ kind: "error", text: t("metaConnect.adAccountLoadFailed") }); setAccounts([]); return; }
    setAccounts(data.accounts || []);
  }, [call, loadStatus, t]);

  const saveAccount = async (id) => {
    setBusy("account");
    const { data } = await call("/meta-set-account", { ad_account_id: id });
    setBusy("");
    if (data?.success) { setBanner({ kind: "success", text: t("metaConnect.adAccountSaved") }); setPixels(null); setPixelsState("idle"); setCatalogs(null); await loadStatus(); return; }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: t("metaConnect.adAccountLoadFailed") });
  };

  // ---- step 4: product catalogue
  const loadCatalogs = useCallback(async () => {
    setBusy("catalogs");
    const { data } = await call("/meta-catalogs");
    setBusy("");
    if (data?.needs_reconnect) { await loadStatus(); return; }
    if (data?.catalogs) { setCatalogs(data.catalogs); setCatalogError(""); return; }
    setCatalogs([]);
    setCatalogError(data?.error || "catalog_failed");
  }, [call, loadStatus]);

  const catalogErrorText = (code, msg) => {
    const keys = { catalog_permission: "catalogPermission", catalog_needs_business: "catalogNeedsBusiness", catalog_unavailable: "catalogUnavailable", catalog_no_website: "catalogNoWebsite", catalog_sync_failed: "catalogSyncFailed", catalog_create_failed: "catalogCreateFailed" };
    return `${t(`metaConnect.${keys[code] || "catalogFailed"}`)}${msg ? ` (${msg})` : ""}`;
  };

  const saveCatalog = async (path, extra) => {
    setBusy("catalog");
    const { data } = await call(path, extra);
    setBusy("");
    if (data?.success) {
      setBanner({ kind: "success", text: t(path === "/meta-create-catalog" ? "metaConnect.catalogCreated" : "metaConnect.catalogSaved") });
      setCatalogs(null);
      await loadStatus();
      return;
    }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: catalogErrorText(data?.error, data?.meta_message) });
  };

  const syncCatalog = async () => {
    setBusy("sync");
    const { data } = await call("/meta-catalog-sync");
    setBusy("");
    if (data?.success) {
      setBanner({ kind: data.partial ? "info" : "success", text: t("metaConnect.catalogSynced").replace("{n}", String(data.sent)).replace("{skipped}", String(data.skipped || 0)) });
      await loadStatus();
      return;
    }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: catalogErrorText(data?.error, data?.meta_message) });
  };

  const createPixel = async (name) => {
    setBusy("pixel");
    const { data } = await call("/meta-create-pixel", { name });
    setBusy("");
    if (data?.success) { setBanner({ kind: "success", text: t("metaConnect.pixelCreated") }); setPixelsState("idle"); await loadStatus(); return; }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: `${t("metaConnect.pixelCreateFailed")}${data?.meta_message ? ` (${data.meta_message})` : ""}` });
  };

  const loadPixels = useCallback(async () => {
    setBusy("pixels");
    const { data } = await call("/meta-pixels");
    setBusy("");
    if (data?.needs_reconnect) { await loadStatus(); return; }
    if (data?.pixels) { setPixels(data.pixels); setPixelsState("ok"); return; }
    setPixels([]);
    setPixelsState("unavailable");
  }, [call, loadStatus]);

  useEffect(() => { if (connected && !needsReconnect && status?.ad_account_id && pixelsState === "idle") loadPixels(); }, [connected, needsReconnect, status?.ad_account_id, pixelsState, loadPixels]);
  const ready = connected && !needsReconnect;
  useEffect(() => { if (ready && businesses === null) loadBusinesses(); }, [ready, businesses, loadBusinesses]);
  useEffect(() => { if (ready && businessChoice) loadAccounts(businessChoice); }, [ready, businessChoice, loadAccounts]);
  useEffect(() => { if (ready && status?.ad_account_id && status?.catalog_available && catalogs === null) loadCatalogs(); }, [ready, status?.ad_account_id, status?.catalog_available, catalogs, loadCatalogs]);

  const savePixel = async (id) => {
    if (!PIXEL_RE.test(id)) { setBanner({ kind: "error", text: t("metaConnect.pixelInvalid") }); return; }
    setBusy("pixel");
    const { data } = await call("/meta-set-pixel", { pixel_id: id });
    setBusy("");
    if (data?.success) { setManualPixel(""); setManualOpen(false); setBanner({ kind: "success", text: t("metaConnect.pixelSaved") }); await loadStatus(); return; }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: data?.error === "pixel_not_in_account" ? t("metaConnect.pixelNotInAccount") : t("metaConnect.pixelInvalid") });
  };

  const loadProductStatus = useCallback(async () => {
    const { data } = await call("/meta-catalog-status");
    if (data?.success) setProductStatus(data);
  }, [call]);
  useEffect(() => { if (ready && status?.catalog_id && productStatus === null) loadProductStatus(); }, [ready, status?.catalog_id, productStatus, loadProductStatus]);

  const removeCatalog = async () => {
    if (!window.confirm(t("metaConnect.catalogRemoveConfirm"))) return;
    setBusy("catalogRemove");
    const { data } = await call("/meta-remove-catalog");
    setBusy("");
    if (data?.success) { setBanner({ kind: "success", text: t("metaConnect.catalogRemoved") }); setCatalogs(null); setProductStatus(null); await loadStatus(); return; }
    setBanner({ kind: "error", text: t("metaConnect.catalogFailed") });
  };

  const submitReview = async () => {
    setBusy("review");
    const { data } = await call("/meta-submit-review", { accept_terms: true });
    setBusy("");
    if (data?.success) {
      setBanner({ kind: data.sync_error ? "info" : "success", text: data.sync_error ? `${t("metaConnect.submittedPartly")} (${data.sync_error})` : t("metaConnect.submittedOk").replace("{n}", String(data.sent ?? 0)) });
      setProductStatus(null);
      await loadStatus();
      return;
    }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    const errs = { setup_incomplete: "submitNeedsSetup", review_unavailable: "catalogUnavailable", terms_required: "termsAgree" };
    setBanner({ kind: "error", text: t(`metaConnect.${errs[data?.error] || "submitFailed"}`) });
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
  const expiryText = status?.token_never_expires ? t("metaConnect.neverExpires") : days === null || days === undefined ? "" :days < 0 ? t("metaConnect.expired") : days === 0 ? t("metaConnect.expiresToday") : t("metaConnect.expiresIn").replace("{days}", String(days));

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

          {ready && (() => {
            const P = (k) => t(`metaConnect.${k}`);
            const bizOptions = (businesses || []).map((b) => (b.id === "all" ? { id: "all", name: P("allAdAccounts"), sub: "", icon: "megaphone" }
              : { id: b.id, name: b.id === "personal" ? P("personalAccounts") : b.name || b.id, sub: b.id === "personal" ? P("personalAccountsSub") : `${P("idLabel")} ${b.id}`, picture: b.picture, icon: b.id === "personal" ? "team" : null }));
            const bizValue = bizOptions.find((b) => b.id === businessChoice) || null;
            const accOptions = (accounts || []).map((a) => ({ id: a.account_id, name: a.name || a.account_id, sub: `${P("idLabel")} ${a.account_id}${a.currency ? ` · ${a.currency}` : ""}`, icon: "megaphone" }));
            const accValue = status.ad_account_id ? (accOptions.find((a) => a.id === String(status.ad_account_id)) || { id: String(status.ad_account_id), name: status.ad_account_name || status.ad_account_id, sub: `${P("idLabel")} ${status.ad_account_id}`, icon: "megaphone" }) : null;
            const pxOptions = (pixels || []).map((p) => ({ id: p.id, name: p.name || p.id, sub: `${P("idLabel")} ${p.id}`, icon: "zap" }));
            const pxValue = status.pixel_id ? (pxOptions.find((p) => p.id === String(status.pixel_id)) || { id: String(status.pixel_id), name: status.pixel_name || P("pixelTitle"), sub: `${P("idLabel")} ${status.pixel_id}`, icon: "zap" }) : null;
            const catOptions = (catalogs || []).map((c) => ({ id: c.id, name: c.name || c.id, sub: `${P("idLabel")} ${c.id}${c.product_count !== null && c.product_count !== undefined ? ` · ${P("catalogItems").replace("{n}", String(c.product_count))}` : ""}`, icon: "products" }));
            const catValue = status.catalog_id ? (catOptions.find((c) => c.id === String(status.catalog_id)) || { id: String(status.catalog_id), name: status.catalog_name || status.catalog_id, sub: `${P("idLabel")} ${status.catalog_id}`, icon: "products" }) : null;
            const common = { searchLabel: P("pickerSearch"), emptyLabel: P("pickerEmpty"), cancelLabel: P("cancel"), createButton: P("create") };
            const steps = [
              { key: "business", done: !!bizValue, title: P("stepBusiness"), help: businessPermission ? P("stepBusinessHelp") : P("businessPermissionHint"),
                picker: <AssetPicker label={P("stepBusiness")} value={bizValue} options={bizOptions} placeholder={busy === "businesses" ? P("loadingShort") : P("pickBusiness")} busy={busy === "businesses"} disabled={!!busy && busy !== "businesses"} onChange={(id) => setBusinessChoice(id)} {...common} /> },
              { key: "account", done: !!accValue, locked: !bizValue, title: P("adAccountTitle"), help: P("adAccountPickHelp"),
                picker: <AssetPicker label={P("adAccountTitle")} value={accValue && accOptions.some((a) => a.id === accValue.id) ? accValue : (accounts === null ? accValue : null)} options={accOptions} placeholder={accounts && accounts.length === 0 ? P("adAccountNone") : P("adAccountPick")} busy={busy === "accounts" || busy === "account"} disabled={!bizValue || (!!busy && busy !== "accounts")} onChange={saveAccount} {...common} /> },
              { key: "pixel", done: !!pxValue, locked: !accValue, title: P("stepPixel"), help: P("stepPixelHelp"),
                picker: <AssetPicker label={P("stepPixel")} value={pxValue} options={pxOptions} placeholder={P("pixelPick")} busy={busy === "pixels" || busy === "pixel"} disabled={!accValue || (!!busy && busy !== "pixels")} onChange={savePixel}
                  onCreate={createPixel} createLabel={P("pixelCreate")} createPlaceholder={P("pixelCreateName")} createDefault={`${storeName || "eNeezam"} pixel`}
                  footerExtra={<button type="button" className="ne-asset-footer ne-asset-footer-muted" onClick={() => setManualOpen(true)}><Icon name="edit" size={13} /> {P("pixelManualLabel")}</button>} {...common} /> },
              { key: "catalog", done: !!catValue, locked: !accValue, optional: true, title: P("stepCatalog"), help: status.catalog_available === false ? P("catalogUnavailable") : catalogError ? catalogErrorText(catalogError) : P("stepCatalogHelp"),
                picker: <AssetPicker label={P("stepCatalog")} value={catValue} options={catOptions} placeholder={P("catalogPick")} busy={busy === "catalogs" || busy === "catalog"} disabled={!accValue || status.catalog_available === false || !!catalogError || (!!busy && busy !== "catalogs")}
                  onChange={(id) => saveCatalog("/meta-set-catalog", { catalog_id: id })} onCreate={(name) => saveCatalog("/meta-create-catalog", { name })} createLabel={P("catalogCreate")} createPlaceholder={P("catalogCreateName")} createDefault={`${storeName || "eNeezam"} catalogue`} {...common} /> },
            ];
            const doneCount = steps.filter((s) => s.done).length;
            return (
              <div style={card} className="ne-assets-card">
                <div className="ne-assets-head">
                  <div>
                    <p className="ne-assets-title">{P("assetsTitle")}</p>
                    <p className="ne-assets-help">{P("assetsHelp")}</p>
                  </div>
                  <span className="ne-assets-count">{doneCount}/{steps.length}</span>
                </div>
                <ol className="ne-assets-steps">
                  {steps.map((s, i) => (
                    <li key={s.key} className={`ne-assets-step${s.done ? " done" : ""}${s.locked ? " locked" : ""}`}>
                      <span className="ne-assets-dot" aria-hidden="true">{s.done ? <Icon name="check" size={12} /> : i + 1}</span>
                      <div className="ne-assets-body">
                        <div className="ne-assets-label">
                          <span>{s.title}</span>{s.optional && <span className="ne-assets-optional">{P("optional")}</span>}
                        </div>
                        <p className="ne-assets-sub">{s.help}</p>
                        {s.picker}
                        {s.key === "business" && !businessPermission && (
                          <button type="button" className="ne-asset-link" onClick={handleConnect} disabled={!!busy}><Icon name="refresh" size={12} /> {P("reconnectForBusiness")}</button>
                        )}
                        {s.key === "pixel" && manualOpen && (
                          <div className="ne-assets-manual">
                            <input dir="ltr" inputMode="numeric" value={manualPixel} onChange={(e) => setManualPixel(e.target.value.replace(/\D/g, "").slice(0, 20))} placeholder={P("pixelManualPlaceholder")} aria-label={P("pixelManualLabel")} style={{ ...input, flex: 1, minWidth: 160 }} />
                            <button onClick={() => savePixel(manualPixel)} disabled={!!busy || !PIXEL_RE.test(manualPixel)} style={btnGhost(!!busy || !PIXEL_RE.test(manualPixel))}>{P("pixelSave")}</button>
                            <button onClick={() => setManualOpen(false)} style={btnGhost(false)}>{P("cancel")}</button>
                          </div>
                        )}
                        {s.key === "pixel" && pixelsState === "unavailable" && <p className="ne-assets-warn">{P("pixelUnavailable")}</p>}
                        {s.key === "pixel" && pxValue && (
                          <div className="ne-assets-meta">
                            <a href={`https://business.facebook.com/events_manager2/list/pixel/${pxValue.id}/test_events`} target="_blank" rel="noopener noreferrer"><Icon name="arrowRight" size={12} /> {P("testEvents")}</a>
                            <button type="button" className="ne-asset-link danger" onClick={removePixel} disabled={!!busy}>{busy === "pixelRemove" ? P("saving") : P("pixelRemove")}</button>
                          </div>
                        )}
                        {s.key === "catalog" && catValue && (
                          <div className="ne-assets-sync">
                            <span>{status.catalog_synced_at ? P("catalogLastSync").replace("{n}", String(status.catalog_item_count ?? 0)).replace("{time}", new Date(status.catalog_synced_at).toLocaleString()) : P("catalogNeverSynced")}</span>
                            <button onClick={syncCatalog} disabled={!!busy} style={btnPrimary(!!busy)}><Icon name="refresh" size={13} /> {busy === "sync" ? P("catalogSyncing") : P("catalogSync")}</button>
                          </div>
                        )}
                        {s.key === "catalog" && catValue && (
                          <div className="ne-assets-meta">
                            <a href={`https://business.facebook.com/commerce/catalogs/${catValue.id}/products`} target="_blank" rel="noopener noreferrer"><Icon name="arrowRight" size={12} /> {P("viewProducts")}</a>
                            <button type="button" className="ne-asset-link danger" onClick={removeCatalog} disabled={!!busy}>{busy === "catalogRemove" ? P("saving") : P("catalogRemove")}</button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                {pxValue && <p className="ne-assets-note"><Icon name="warning" size={12} /> {P("pixelHelperNote")}</p>}
              </div>
            );
          })()}

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
                    <button onClick={() => saveSharing("maximum")} disabled={!!busy || needsReconnect} style={btnGhost(!!busy || needsReconnect)}>{busy === "sharing" ? t("metaConnect.saving") : t("action.save")}</button>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ne-muted-2)" }}>{t("metaConnect.sharingTestCodeHelp")}</p>
                </div>
              )}
            </div>
          )}

          {ready && status.pixel_id && (
            <div style={card} className="ne-assets-card">
              <div className="ne-assets-head">
                <div>
                  <p className="ne-assets-title">{t("metaConnect.termsTitle")}</p>
                  <p className="ne-assets-help">{t("metaConnect.termsHelp")}</p>
                </div>
                {status.review_submitted_at && <span className="ne-assets-count ne-assets-count-ok">{t("metaConnect.submitted")}</span>}
              </div>
              <ul className="ne-terms-list">
                <li><a href="https://www.facebook.com/legal/commercial_terms" target="_blank" rel="noopener noreferrer">{t("metaConnect.termsCommercial")}</a></li>
                <li><a href="https://www.facebook.com/legal/terms/businesstools" target="_blank" rel="noopener noreferrer">{t("metaConnect.termsBusinessTools")}</a></li>
                {status.catalog_id && <li><a href="https://www.facebook.com/legal/commerce_product_merchant_agreement" target="_blank" rel="noopener noreferrer">{t("metaConnect.termsCatalog")}</a></li>}
              </ul>
              <label className="ne-terms-check">
                <input type="checkbox" checked={termsChecked || !!status.terms_accepted_at} onChange={(e) => setTermsChecked(e.target.checked)} disabled={!!status.terms_accepted_at} />
                <span>{t("metaConnect.termsAgree")}</span>
              </label>
              <div className="ne-assets-sync" style={{ marginTop: 12 }}>
                <span>{status.review_submitted_at ? t("metaConnect.submittedOn").replace("{time}", new Date(status.review_submitted_at).toLocaleString()) : t("metaConnect.submitHelp")}</span>
                <button onClick={submitReview} disabled={!!busy || !(termsChecked || status.terms_accepted_at)} style={btnPrimary(!!busy || !(termsChecked || status.terms_accepted_at))}>
                  {busy === "review" ? t("metaConnect.submitting") : status.review_submitted_at ? t("metaConnect.resubmit") : t("metaConnect.submitReview")}
                </button>
              </div>
              {status.catalog_id && productStatus && (
                <div className="ne-product-status">
                  <p className="ne-assets-label" style={{ margin: "14px 0 8px" }}>{t("metaConnect.productStatus")}</p>
                  <div className="ne-product-status-row">
                    <span className="ok"><strong>{productStatus.approved}</strong> {t("metaConnect.statusApproved")}</span>
                    <span className="wait"><strong>{productStatus.pending}</strong> {t("metaConnect.statusPending")}</span>
                    <span className="bad"><strong>{productStatus.rejected}</strong> {t("metaConnect.statusRejected")}</span>
                  </div>
                  <a className="ne-product-status-link" href={`https://business.facebook.com/commerce/catalogs/${status.catalog_id}/products`} target="_blank" rel="noopener noreferrer"><Icon name="arrowRight" size={12} /> {t("metaConnect.viewProducts")}</a>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
