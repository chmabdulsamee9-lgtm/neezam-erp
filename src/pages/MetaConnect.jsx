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
export default function MetaConnect({ storeId, storeName }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [banner, setBanner] = useState(() => bannerFromUrl(t)); // { kind: "success" | "error" | "info", text }
  const [businesses, setBusinesses] = useState(null); // null = not loaded
  const [accounts, setAccounts] = useState(null); // null = not loaded
  const [pixels, setPixels] = useState(null);
  const [pixelsState, setPixelsState] = useState("idle"); // idle | ok | unavailable
  const [manualPixel, setManualPixel] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [catalogs, setCatalogs] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [productStatus, setProductStatus] = useState(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [openSection, setOpenSection] = useState(null); // null = the first step that still needs work
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

  useEffect(() => { setBusinesses(null); setAccounts(null); setPixels(null); setPixelsState("idle"); setCatalogs(null); loadStatus(); }, [storeId, loadStatus]);

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
    if (code === 200 && data?.success) { setBusinesses(null); setAccounts(null); setPixels(null); setPixelsState("idle"); setCatalogs(null); await loadStatus(); return; }
    setBanner({ kind: "error", text: data?.error || t("metaConnect.disconnectFailed") });
  };

  // ---- step 1: business portfolio (picking one only filters the ad accounts; it is saved together with the ad account)
  const loadBusinesses = useCallback(async () => {
    setBusy("businesses");
    const { data } = await call("/meta-businesses");
    setBusy("");
    if (data?.needs_reconnect) { await loadStatus(); return; }
    // no business list (older server, Meta error): every ad account is shown under "All ad accounts"
    if (!data?.businesses) { setBusinesses([{ id: "all", name: "", ad_accounts: 0 }]); return; }
    setBusinesses(data.businesses);
    
  }, [call, loadStatus]);

  const saveBusiness = async (id) => {
    setBusy("business");
    const { data } = await call("/meta-set-business", { business_id: id });
    setBusy("");
    if (data?.success) { setCatalogs(null); setPixels(null); setPixelsState("idle"); setOpenSection(null); await loadStatus(); return; }
    if (data?.needs_reconnect) { await loadStatus(); return; }
    setBanner({ kind: "error", text: t("metaConnect.businessSaveFailed") });
  };

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

  useEffect(() => { if (connected && !needsReconnect && (status?.ad_account_id || status?.business_id) && pixelsState === "idle") loadPixels(); }, [connected, needsReconnect, status?.business_id, status?.ad_account_id, pixelsState, loadPixels]);
  const ready = connected && !needsReconnect;
  useEffect(() => { if (ready && businesses === null) loadBusinesses(); }, [ready, businesses, loadBusinesses]);
  // the ad account is optional (like Shopify): every account the connection can use is listed
  useEffect(() => { if (ready && accounts === null) loadAccounts("all"); }, [ready, accounts, loadAccounts]);
  useEffect(() => { if (ready && (status?.ad_account_id || status?.business_id) && status?.catalog_available && catalogs === null) loadCatalogs(); }, [ready, status?.business_id, status?.ad_account_id, status?.catalog_available, catalogs, loadCatalogs]);

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
  const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 13 };
  const bannerColors = { success: ["var(--ne-success-soft)", "var(--ne-success)"], error: ["var(--ne-danger-soft)", "var(--ne-danger)"], info: ["var(--ne-warning-soft)", "var(--ne-warning)"] };

  const days = status?.expires_in_days;
  const expiryText = status?.token_never_expires ? t("metaConnect.neverExpires") : days === null || days === undefined ? "" :days < 0 ? t("metaConnect.expired") : days === 0 ? t("metaConnect.expiresToday") : t("metaConnect.expiresIn").replace("{days}", String(days));

  // ---------------------------------------------------------------- Shopify-style setup: one card, collapsible steps
  const P = (k) => t(`metaConnect.${k}`);
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(lang === "ur" ? "en-GB" : undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; } };
  const bizList = (businesses || []).filter((b) => b.id !== "personal" && b.id !== "all");
  const sections = [
    { key: "profile", title: P("stepProfile"), done: ready },
    { key: "business", title: P("stepBusiness"), done: ready && !!status?.business_id, locked: !ready },
    { key: "catalog", title: P("stepCatalog"), done: ready && !!status?.catalog_id, locked: !ready || !status?.business_id, optional: true },
    { key: "pixel", title: P("stepPixel"), done: ready && !!status?.pixel_id, locked: !ready || (!status?.business_id && !status?.ad_account_id) },
    { key: "account", title: P("adAccountTitle"), done: ready && !!status?.ad_account_id, locked: !ready, optional: true },
    { key: "sharing", title: P("sharingTitle"), done: ready && !!status?.pixel_id && level !== "standard", locked: !ready || !status?.pixel_id },
    { key: "terms", title: P("termsTitle"), done: !!status?.terms_accepted_at, locked: !ready || !status?.pixel_id },
  ];
  const firstOpen = (sections.find((s) => !s.done && !s.locked && !s.optional) || sections.find((s) => !s.done && !s.locked) || sections[0]).key;
  const openKey = openSection ?? firstOpen;
  const canSubmit = ready && !!status?.pixel_id && (termsChecked || !!status?.terms_accepted_at) && !busy;

  const Row = ({ avatar, picture, icon, name, sub, action, active }) => (
    <div className={`ne-acc-row${active ? " active" : ""}`}>
      {picture ? <img className="ne-acc-avatar" src={picture} alt="" /> : <span className="ne-acc-avatar" aria-hidden="true">{icon ? <Icon name={icon} size={15} /> : String(avatar || name || "?").trim().charAt(0).toUpperCase()}</span>}
      <span className="ne-acc-row-text">
        <span className="ne-acc-row-name">{name}</span>
        {sub && <span className="ne-acc-row-sub" dir="ltr">{sub}</span>}
      </span>
      {action}
    </div>
  );
  const connectBtn = (onClick, label = P("connect")) => <button type="button" className="ne-acc-connect" onClick={onClick} disabled={!!busy}>{label}</button>;
  const connectedTag = <span className="ne-acc-tag">{P("connectedTag")}</span>;

  const body = (key) => {
    if (key === "profile") {
      if (!connected) return (
        <>
          <p className="ne-acc-help">{P("profileHelp")}</p>
          <button onClick={handleConnect} disabled={!!busy || status?.configured === false} className="ne-acc-primary"><Icon name="link" size={14} /> {busy === "connect" ? P("connecting") : P("connectButton")}</button>
        </>
      );
      return (
        <>
          <Row icon="team" name={P("accountName")} sub={needsReconnect ? P("needsReconnectTitle") : expiryText} action={needsReconnect ? connectBtn(handleConnect, P("reconnectButton")) : connectedTag} active={!needsReconnect} />
          <div className="ne-acc-actions">
            <button type="button" className="ne-asset-link" onClick={handleConnect} disabled={!!busy}><Icon name="refresh" size={12} /> {busy === "connect" ? P("connecting") : P("reconnectButton")}</button>
            <button type="button" className="ne-asset-link danger" onClick={handleDisconnect} disabled={!!busy}>{busy === "disconnect" ? P("disconnecting") : P("disconnect")}</button>
          </div>
        </>
      );
    }
    if (key === "business") return (
      <>
        <p className="ne-acc-help">{P("businessHelp")}</p>
        <div className="ne-acc-list">
          {businesses === null && <div className="ne-acc-empty">{P("loadingShort")}</div>}
          {businesses !== null && bizList.length === 0 && <div className="ne-acc-empty">{P("businessNone")}</div>}
          {bizList.map((b) => (
            <Row key={b.id} picture={b.picture} name={b.name || b.id} sub={b.created ? P("createdOn").replace("{date}", fmtDate(b.created)) : `${P("idLabel")} ${b.id}`}
              active={status?.business_id === b.id} action={status?.business_id === b.id ? connectedTag : connectBtn(() => saveBusiness(b.id))} />
          ))}
        </div>
        <p className="ne-acc-note">{P("businessMissingNote")} <button type="button" className="ne-asset-link" style={{ marginTop: 0 }} onClick={handleConnect} disabled={!!busy}>{P("reconnectButton")}</button></p>
      </>
    );
    if (key === "catalog") {
      if (status?.catalog_id) {
        const c = (catalogs || []).find((x) => x.id === String(status.catalog_id));
        return (
          <>
            <Row icon="products" name={status.catalog_name || c?.name || status.catalog_id} sub={`${P("idLabel")} ${status.catalog_id}`} action={connectedTag} active />
            <div className="ne-assets-sync">
              <span>{status.catalog_synced_at ? P("catalogLastSync").replace("{n}", String(status.catalog_item_count ?? 0)).replace("{time}", new Date(status.catalog_synced_at).toLocaleString()) : P("catalogNeverSynced")}</span>
              <button onClick={syncCatalog} disabled={!!busy} className="ne-acc-primary"><Icon name="refresh" size={13} /> {busy === "sync" ? P("catalogSyncing") : P("catalogSync")}</button>
            </div>
            {productStatus && (
              <div className="ne-product-status-row" style={{ marginTop: 10 }}>
                <span className="ok"><strong>{productStatus.approved}</strong> {P("statusApproved")}</span>
                <span className="wait"><strong>{productStatus.pending}</strong> {P("statusPending")}</span>
                <span className="bad"><strong>{productStatus.rejected}</strong> {P("statusRejected")}</span>
              </div>
            )}
            <div className="ne-acc-actions">
              <a href={`https://business.facebook.com/commerce/catalogs/${status.catalog_id}/products`} target="_blank" rel="noopener noreferrer" className="ne-asset-link"><Icon name="arrowRight" size={12} /> {P("viewProducts")}</a>
              <button type="button" className="ne-asset-link danger" onClick={removeCatalog} disabled={!!busy}>{busy === "catalogRemove" ? P("saving") : P("catalogRemove")}</button>
            </div>
          </>
        );
      }
      return (
        <>
          <p className="ne-acc-help">{status?.catalog_available === false ? P("catalogUnavailable") : catalogError ? catalogErrorText(catalogError) : P("catalogChooseHelp")}</p>
          <p className="ne-acc-sublabel">{P("catalogChooseTitle")}</p>
          <div className="ne-acc-list">
            {catalogs === null && <div className="ne-acc-empty">{P("loadingShort")}</div>}
            {(catalogs || []).map((c) => (
              <Row key={c.id} icon="products" name={c.name || c.id} sub={`${P("idLabel")} ${c.id}${c.product_count !== null && c.product_count !== undefined ? ` · ${P("catalogItems").replace("{n}", String(c.product_count))}` : ""}`}
                action={connectBtn(() => saveCatalog("/meta-set-catalog", { catalog_id: c.id }))} />
            ))}
            <div className="ne-acc-row">
              <span className="ne-acc-avatar ne-acc-avatar-new" aria-hidden="true"><Icon name="plus" size={15} /></span>
              <span className="ne-acc-row-text">
                <span className="ne-acc-row-name">{P("catalogCreate")}</span>
                <span className="ne-acc-row-sub">{P("catalogCreateTerms")} <a href="https://www.facebook.com/legal/commerce_product_merchant_agreement" target="_blank" rel="noopener noreferrer">{P("termsCatalog")}</a></span>
              </span>
              <button type="button" className="ne-acc-outline" disabled={!!busy || status?.catalog_available === false} onClick={() => saveCatalog("/meta-create-catalog", { name: `${storeName || "eNeezam"} catalogue` })}>{busy === "catalog" ? P("saving") : P("createCatalog")}</button>
            </div>
          </div>
        </>
      );
    }
    if (key === "pixel") return (
      <>
        <p className="ne-acc-help">{P("stepPixelHelp")}</p>
        <div className="ne-acc-list">
          {pixelsState === "idle" && !pixels && <div className="ne-acc-empty">{P("loadingShort")}</div>}
          {(pixels || []).map((px) => (
            <Row key={px.id} icon="zap" name={px.name || px.id} sub={`${P("idLabel")} ${px.id}`} active={String(status?.pixel_id) === px.id}
              action={String(status?.pixel_id) === px.id ? connectedTag : connectBtn(() => savePixel(px.id))} />
          ))}
          {status?.pixel_id && !(pixels || []).some((px) => px.id === String(status.pixel_id)) && (
            <Row icon="zap" name={status.pixel_name || P("pixelTitle")} sub={`${P("idLabel")} ${status.pixel_id}`} action={connectedTag} active />
          )}
          <div className="ne-acc-row">
            <span className="ne-acc-avatar ne-acc-avatar-new" aria-hidden="true"><Icon name="plus" size={15} /></span>
            <span className="ne-acc-row-text"><span className="ne-acc-row-name">{P("pixelCreate")}</span><span className="ne-acc-row-sub">{P("pixelCreateHelp")}</span></span>
            <button type="button" className="ne-acc-outline" disabled={!!busy} onClick={() => createPixel(`${storeName || "eNeezam"} pixel`)}>{busy === "pixel" ? P("saving") : P("create")}</button>
          </div>
        </div>
        <div className="ne-acc-actions">
          {status?.pixel_id && <a href={`https://business.facebook.com/events_manager2/list/pixel/${status.pixel_id}/test_events`} target="_blank" rel="noopener noreferrer" className="ne-asset-link"><Icon name="arrowRight" size={12} /> {P("testEvents")}</a>}
          <button type="button" className="ne-asset-link" onClick={() => setManualOpen((v) => !v)}><Icon name="edit" size={12} /> {P("pixelManualLabel")}</button>
          {status?.pixel_id && <button type="button" className="ne-asset-link danger" onClick={removePixel} disabled={!!busy}>{busy === "pixelRemove" ? P("saving") : P("pixelRemove")}</button>}
        </div>
        {manualOpen && (
          <div className="ne-assets-manual">
            <input dir="ltr" inputMode="numeric" value={manualPixel} onChange={(e) => setManualPixel(e.target.value.replace(/\D/g, "").slice(0, 20))} placeholder={P("pixelManualPlaceholder")} aria-label={P("pixelManualLabel")} style={{ ...input, flex: 1, minWidth: 160 }} />
            <button onClick={() => savePixel(manualPixel)} disabled={!!busy || !PIXEL_RE.test(manualPixel)} className="ne-acc-outline">{P("pixelSave")}</button>
          </div>
        )}
        <p className="ne-assets-note" style={{ marginTop: 12 }}><Icon name="warning" size={12} /> {P("pixelHelperNote")}</p>
      </>
    );
    if (key === "account") return (
      <>
        <p className="ne-acc-help">{P("accountOptionalHelp")}</p>
        <div className="ne-acc-list">
          {accounts === null && <div className="ne-acc-empty">{P("loadingShort")}</div>}
          {accounts !== null && accounts.length === 0 && <div className="ne-acc-empty">{P("adAccountNone")}</div>}
          {(accounts || []).map((a) => (
            <Row key={a.account_id} icon="megaphone" name={a.name || a.account_id} sub={`${P("idLabel")} ${a.account_id}${a.currency ? ` · ${a.currency}` : ""}`} active={String(status?.ad_account_id) === a.account_id}
              action={String(status?.ad_account_id) === a.account_id ? connectedTag : connectBtn(() => saveAccount(a.account_id))} />
          ))}
        </div>
      </>
    );
    if (key === "sharing") return (
      <>
        <p className="ne-acc-help">{P("sharingHelp")}</p>
        {status?.sharing_available === false && <p className="ne-assets-warn">{P("sharingUnavailable")}</p>}
        <div role="radiogroup" aria-label={P("sharingTitle")} className="ne-share-grid">
          {["standard", "enhanced", "maximum"].map((k) => {
            const blocked = k === "maximum" && needsReconnect;
            const off = !!busy || status?.sharing_available === false || blocked;
            const on = level === k;
            return (
              <button key={k} role="radio" aria-checked={on} onClick={() => saveSharing(k)} disabled={off && !on} className={`ne-share-opt${on ? " on" : ""}`}>
                <span className="ne-share-name">{P(`sharing_${k}`)}</span>
                <span className="ne-share-desc">{P(`sharing_${k}_desc`)}</span>
              </button>
            );
          })}
        </div>
        {level === "maximum" && (
          <div className="ne-assets-manual">
            <input dir="ltr" value={testCode} onChange={(e) => setTestCodeEdit(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 30))} placeholder="TEST12345" aria-label={P("sharingTestCode")} style={{ ...input, flex: 1, minWidth: 160 }} />
            <button onClick={() => saveSharing("maximum")} disabled={!!busy || needsReconnect} className="ne-acc-outline">{busy === "sharing" ? P("saving") : t("action.save")}</button>
          </div>
        )}
      </>
    );
    // terms
    return (
      <>
        <p className="ne-acc-help">{P("termsHelp")}</p>
        <ul className="ne-terms-list">
          <li><a href="https://www.facebook.com/legal/commercial_terms" target="_blank" rel="noopener noreferrer">{P("termsCommercial")}</a></li>
          <li><a href="https://www.facebook.com/legal/terms/businesstools" target="_blank" rel="noopener noreferrer">{P("termsBusinessTools")}</a></li>
          {status?.catalog_id && <li><a href="https://www.facebook.com/legal/commerce_product_merchant_agreement" target="_blank" rel="noopener noreferrer">{P("termsCatalog")}</a></li>}
        </ul>
        <label className="ne-terms-check">
          <input type="checkbox" checked={termsChecked || !!status?.terms_accepted_at} onChange={(e) => setTermsChecked(e.target.checked)} disabled={!!status?.terms_accepted_at} />
          <span>{P("termsAgree")}</span>
        </label>
      </>
    );
  };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", maxWidth: 680, margin: "0 auto", color: "var(--ne-text)" }}>
      <div className="ne-acc-header">
        <span className="ne-acc-logo" aria-hidden="true"><Icon name="megaphone" size={18} /></span>
        <div>
          <h1>{P("setupTitle")}</h1>
          <p>{P("setupSubtitle")}</p>
        </div>
      </div>

      {banner && (
        <div role="status" style={{ ...card, background: bannerColors[banner.kind][0], color: bannerColors[banner.kind][1], padding: "10px 14px", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={banner.kind === "success" ? "check" : "warning"} size={14} /> <span style={{ flex: 1 }}>{banner.text}</span>
          <button onClick={() => setBanner(null)} aria-label={P("dismiss")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}><Icon name="close" size={12} /></button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{P("loading")}</div>
      ) : (
        <>
          {status && status.configured === false && <div style={{ ...card, color: "var(--ne-warning)", fontSize: 12.5, fontWeight: 600 }}>{P("notConfigured")}</div>}
          <div className="ne-acc">
            {sections.map((s) => {
              const open = openKey === s.key && !s.locked;
              return (
                <section key={s.key} className={`ne-acc-item${open ? " open" : ""}${s.locked ? " locked" : ""}`}>
                  <button type="button" className="ne-acc-head" aria-expanded={open} disabled={s.locked} onClick={() => setOpenSection(open ? "" : s.key)}>
                    <Icon name={open ? "chevronUp" : "chevronDown"} size={15} />
                    <span className="ne-acc-title">{s.title}{s.optional && <span className="ne-assets-optional">{P("optional")}</span>}</span>
                    {s.done && <span className="ne-acc-check" aria-label={P("connectedTag")}><Icon name="check" size={12} /></span>}
                  </button>
                  {open && <div className="ne-acc-body">{body(s.key)}</div>}
                </section>
              );
            })}
          </div>
          {ready && (
            <div className="ne-acc-footer">
              <span>{status?.review_submitted_at ? P("submittedOn").replace("{time}", new Date(status.review_submitted_at).toLocaleString()) : ""}</span>
              <button onClick={submitReview} disabled={!canSubmit} className="ne-acc-submit">
                {busy === "review" ? P("submitting") : status?.review_submitted_at ? P("resubmit") : P("submitReview")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
