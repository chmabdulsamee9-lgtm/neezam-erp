import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

// Dex ke 43-column Excel export mein se sirf woh headers jo order_statuses ke courier-overlay
// columns ke liye zaroori hain (price/address/warehouse/product-list waghera is naye architecture
// mein store nahi hote — order_statuses sirf courier/logistics overlay hai, Shopify data nahi).
const DEX_SOURCE_HEADERS = {
  externalOrderId: "externalOrderId",
  lastMileShippingProvider: "lastMileShippingProvider",
  trackingNo: "trackingNo",
  omsOrderStatus: "omsOrderStatus",
  logisticsCurrentStatus: "logisticsCurrentStatus",
  logisticsCurrentStatusTime: "logisticsCurrentStatusTime",
  deliveryAttemptCount: "deliveryAttemptCount",
  packageCreatedTime: "packageCreatedTime",
  pickupSuccessTime: "pickupSuccessTime",
  deliveredTime: "deliveredTime",
  returnSuccessTime: "returnSuccessTime",
  "First failed delivery attempt reason": "firstFailedDeliveryAttemptReason",
  "Second failed delivery attempt reason": "secondFailedDeliveryAttemptReason",
  "Third failed delivery attempt reason": "thirdFailedDeliveryAttemptReason",
  "Fourth failed delivery attempt reason": "fourthFailedDeliveryAttemptReason",
};

function cellToText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toString();
  if (typeof value === "object") {
    if (value.text) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join("");
    return "";
  }
  return String(value).trim();
}

function cellToTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(cellToText(value));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function cellToInt(value) {
  const text = cellToText(value);
  if (!text) return null;
  const n = Number(text);
  return isNaN(n) ? null : Math.round(n);
}

// Dex externalOrderId format: "PREFIX[-VARIANT]_shopifyId_suffix" (jaise DWK2366_7859021644086_362,
// DWK2265-F1_6105674187062_264) — Shopify order name ("#DWK2366") sirf prefix hota hai
function extractOrderRef(externalOrderId) {
  const text = cellToText(externalOrderId).trim();
  if (!text) return null;
  const beforeUnderscore = text.split("_")[0];
  const prefix = beforeUnderscore.split("-")[0].replace(/^#+/, "");
  return prefix ? `#${prefix}` : null;
}

async function parseDexExcelFile(file) {
  // Dynamic import — exceljs (~1MB) sirf yahan, upload ke actual waqt load hoti hai, poori
  // app ke initial bundle mein hamesha shamil nahi rehti (pehle static import thi)
  const { default: ExcelJS } = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const colIndexToSourceKey = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = String(cell.value || "").trim();
    const sourceKey = DEX_SOURCE_HEADERS[header];
    if (sourceKey) colIndexToSourceKey[colNumber] = sourceKey;
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const sourceKey = colIndexToSourceKey[colNumber];
      if (!sourceKey) return;
      raw[sourceKey] = cell.value;
    });

    const orderNumberMatch = extractOrderRef(raw.externalOrderId);
    if (!orderNumberMatch) return; // is row ko kisi Shopify order se match hi nahi kiya ja sakta

    // Har row hamesha yehi 10 keys rakhta hai (kuch null ho sakti hain) — blank-cell wali
    // rows doosri rows se kam keys ki wajah se PostgREST bulk-upsert (PGRST102) fail nahi karengi,
    // kyunki yahan object literal hamesha explicit shape mein banta hai, conditional nahi.
    rows.push({
      order_number_match: orderNumberMatch,
      courier_name: cellToText(raw.lastMileShippingProvider) || null,
      dex_tracking_number: cellToText(raw.trackingNo) || null,
      // Renamed from courier_order_status to avoid colliding with the worker's own
      // COMPUTED courier_order_status field name — this is raw Excel text (human-readable,
      // e.g. "Last Mile Inbound"), used only as a fallback when dex_status is blank.
      oms_order_status_raw: cellToText(raw.omsOrderStatus) || null,
      dex_status: cellToText(raw.logisticsCurrentStatus) || null,
      logistics_status_at: cellToTimestamp(raw.logisticsCurrentStatusTime),
      delivery_attempt_count: cellToInt(raw.deliveryAttemptCount),
      latest_fail_reason:
        cellToText(raw.fourthFailedDeliveryAttemptReason) ||
        cellToText(raw.thirdFailedDeliveryAttemptReason) ||
        cellToText(raw.secondFailedDeliveryAttemptReason) ||
        cellToText(raw.firstFailedDeliveryAttemptReason) ||
        null,
      package_created_at: cellToTimestamp(raw.packageCreatedTime),
      pickup_success_at: cellToTimestamp(raw.pickupSuccessTime),
      delivered_at: cellToTimestamp(raw.deliveredTime),
      return_success_at: cellToTimestamp(raw.returnSuccessTime),
    });
  });
  return rows;
}

export default function CourierConnect({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [store, setStore] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [integrationCode, setIntegrationCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [importResultModalOpen, setImportResultModalOpen] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  const [pickupAddresses, setPickupAddresses] = useState([]);
  const [pickupAddrError, setPickupAddrError] = useState("");
  const [newAddrLabel, setNewAddrLabel] = useState("");
  const [newAddrLine, setNewAddrLine] = useState("");
  const [newAddrCity, setNewAddrCity] = useState("");
  const [newAddrContactName, setNewAddrContactName] = useState("");
  const [newAddrContactPhone, setNewAddrContactPhone] = useState("");
  const [defaultLength, setDefaultLength] = useState("");
  const [defaultWidth, setDefaultWidth] = useState("");
  const [defaultHeight, setDefaultHeight] = useState("");
  const [addingAddr, setAddingAddr] = useState(false);
  const [defaultWeight, setDefaultWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [labelDisplayMode, setLabelDisplayMode] = useState("both");
  const [savingLabelMode, setSavingLabelMode] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) fetchStore();
  }, [storeId]);

  useEffect(() => { if (storeId) fetchPickupAddresses(); }, [storeId]);

  // Activity-log ke "author" field ke liye current user ka naam (BookedOrders.jsx/Orders.jsx
  // ke currentProfile fetch jaisa hi pattern)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user.id).single();
      setCurrentProfile(data || null);
    })();
  }, []);

  const logActivity = async (actionType, details) => {
    if (!currentProfile || !storeId) return;
    try {
      await supabase.from("activity_log").insert({
        store_id: storeId,
        user_id: currentProfile.id,
        user_name: currentProfile.full_name || currentProfile.email,
        action_type: actionType,
        order_id: null,
        details: details || null,
      });
    } catch (err) {
      console.log("logActivity error:", err.message);
    }
  };

  const fetchStore = async () => {
    setLoading(true);
    const { data } = await supabase.from("stores").select("*").eq("id", storeId).single();
    setStore(data || null);
    setDefaultWeight(data?.default_weight_kg ?? "0.5");
    setDefaultLength(data?.default_length_cm ?? "20");
    setDefaultWidth(data?.default_width_cm ?? "20");
    setDefaultHeight(data?.default_height_cm ?? "10");
    setLabelDisplayMode(data?.label_display_mode ?? "both");
    setLoading(false);
  };

  const fetchPickupAddresses = async () => {
    const { data } = await supabase.from("pickup_addresses").select("*").eq("store_id", storeId).order("created_at");
    setPickupAddresses(data || []);
  };

  const handleAddAddress = async () => {
    if (!newAddrLabel.trim() || !newAddrLine.trim() || !newAddrCity.trim() || !newAddrContactName.trim() || !newAddrContactPhone.trim()) return;
    setAddingAddr(true);
    setPickupAddrError("");
    const isFirst = pickupAddresses.length === 0;
    const { error } = await supabase.from("pickup_addresses").insert({
      store_id: storeId, label: newAddrLabel.trim(), address_line: newAddrLine.trim(), city: newAddrCity.trim(),
      contact_name: newAddrContactName.trim(), contact_phone: newAddrContactPhone.trim(), is_default: isFirst,
    });
    setAddingAddr(false);
    if (error) {
      setPickupAddrError(error.message);
      return;
    }
    logActivity("pickup_address_added", { label: newAddrLabel.trim(), city: newAddrCity.trim() });
    setNewAddrLabel(""); setNewAddrLine(""); setNewAddrCity(""); setNewAddrContactName(""); setNewAddrContactPhone("");
    await fetchPickupAddresses();
  };

  const handleSetDefaultAddress = async (id) => {
    setPickupAddrError("");
    const { error: clearError } = await supabase.from("pickup_addresses").update({ is_default: false }).eq("store_id", storeId);
    if (clearError) {
      setPickupAddrError(clearError.message);
      return;
    }
    const { error: setDefaultError } = await supabase.from("pickup_addresses").update({ is_default: true }).eq("id", id);
    if (setDefaultError) {
      setPickupAddrError(setDefaultError.message);
      return;
    }
    fetchPickupAddresses();
  };

  const handleDeleteAddress = async (id) => {
    setPickupAddrError("");
    const addr = pickupAddresses.find((a) => a.id === id);
    const { error } = await supabase.from("pickup_addresses").delete().eq("id", id);
    if (error) {
      setPickupAddrError(error.message);
      return;
    }
    logActivity("pickup_address_deleted", { label: addr?.label, city: addr?.city });
    fetchPickupAddresses();
  };

  const handleSaveWeight = async () => {
    setSavingWeight(true);
    const payload = {
      default_weight_kg: Number(defaultWeight) || 0.5,
      default_length_cm: Number(defaultLength) || 20,
      default_width_cm: Number(defaultWidth) || 20,
      default_height_cm: Number(defaultHeight) || 10,
    };
    await supabase.from("stores").update(payload).eq("id", storeId);
    logActivity("default_weight_updated", payload);
    setSavingWeight(false);
  };

  const handleSaveLabelMode = async (mode) => {
    setSavingLabelMode(true);
    setLabelDisplayMode(mode);
    await supabase.from("stores")
      .update({ label_display_mode: mode })
      .eq("id", storeId);
    logActivity("label_display_mode_updated", { label_display_mode: mode });
    setSavingLabelMode(false);
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setError("");
    if (!integrationCode.trim()) {
      setError(t("courier.integrationCodeRequired"));
      return;
    }
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/dex-bind-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ storeId, integrationCode: integrationCode.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.details?.errorMessage || data.error);
        setConnecting(false);
        return;
      }
      setIntegrationCode("");
      fetchStore();
    } catch (err) {
      setError(err.message);
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t("courier.disconnectConfirm"))) return;
    setDisconnecting(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/dex-unbind-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setDisconnecting(false);
        return;
      }
      fetchStore();
    } catch (err) {
      setError(err.message);
    }
    setDisconnecting(false);
  };

  // Rows are sent in sequential chunks, not one giant request — each chunk is its own
  // Worker invocation with its own fresh Cloudflare subrequest budget, since
  // afterCourierStatusChange() (fired once per matched order inside /dex-import-shipments)
  // scales 1:1 with matched-row count and would otherwise risk exceeding the per-invocation
  // subrequest limit on a large file.
  const IMPORT_CHUNK_SIZE = 15;

  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    setImportProgress(null);
    try {
      const rows = await parseDexExcelFile(file);
      if (rows.length === 0) {
        setUploadError(t("courier.noValidRows"));
        setUploading(false);
        return;
      }
      const chunks = [];
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + IMPORT_CHUNK_SIZE));
      }

      const aggregated = { updated: 0, inserted: 0, skippedSameStatus: 0, skippedStale: 0, statusBreakdown: {}, partial: false };

      for (let i = 0; i < chunks.length; i++) {
        setImportProgress({ current: i + 1, total: chunks.length });
        try {
          // Fetched fresh for EACH chunk (not once before the loop) — a long-running
          // multi-minute import could otherwise keep reusing a token that's gone stale by
          // the time later chunks fire. getSession() itself refreshes an expiring session
          // before returning it, so this picks up a valid token every time.
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`${CF_URL}/dex-import-shipments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ storeId, rows: chunks[i] }),
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            aggregated.partial = true;
            setUploadError(data.error || t("courier.importChunkFailed"));
            break;
          }
          aggregated.updated += data.updated || 0;
          aggregated.inserted += data.inserted || 0;
          aggregated.skippedSameStatus += data.skipped_same_status || 0;
          aggregated.skippedStale += data.skipped_stale || 0;
          Object.entries(data.status_breakdown || {}).forEach(([status, count]) => {
            aggregated.statusBreakdown[status] = (aggregated.statusBreakdown[status] || 0) + count;
          });
        } catch (err) {
          aggregated.partial = true;
          setUploadError(err.message);
          break;
        }
      }

      setUploadResult(aggregated);
      setImportResultModalOpen(true);
    } catch (err) {
      setUploadError(err.message);
    }
    setImportProgress(null);
    setUploading(false);
  };

  const isConnected = !!store?.dex_seller_id;

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10,
  };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", maxWidth: 600, margin: "0 auto", color: "var(--ne-text)" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="package" size={17} /> {t("courier.title")}</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("courier.subtitle")}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("courier.loading")}</div>
      ) : (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "1.25rem" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--ne-border)" }}>
              <Icon name="package" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--ne-text)" }}>{t("courier.dexName")}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ne-muted-2)" }}>
                {isConnected ? `${t("courier.sellerIdPrefix")} ${store.dex_seller_id}` : t("courier.notConnectedYet")}
              </p>
            </div>
            {isConnected ? (
              <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-success-soft)", color: "var(--ne-success)", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="check" size={10} /> {t("courier.connected")}
              </span>
            ) : (
              <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-warning-soft)", color: "var(--ne-warning)", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="pending" size={10} /> {t("courier.notConnected")}
              </span>
            )}
          </div>

          {isConnected ? (
            <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "var(--ne-muted)" }}>
              {t("courier.platform")} <strong style={{ color: "var(--ne-text)" }}>{store.dex_platform_name || "eNeezam"}</strong><br />
              {t("courier.connectedAt")} <strong style={{ color: "var(--ne-text)" }}>{store.dex_connected_at ? new Date(store.dex_connected_at).toLocaleString("en-PK") : "—"}</strong>
              {error && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: "10px 0 0" }}>{error}</p>}
              <button onClick={handleDisconnect} disabled={disconnecting}
                style={{ width: "100%", marginTop: 12, padding: "10px", background: "transparent", border: "1px solid var(--ne-danger)", color: "var(--ne-danger)", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: disconnecting ? "default" : "pointer" }}>
                {disconnecting ? t("courier.disconnecting") : t("courier.disconnect")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleConnect}>
              <label style={{ color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 4, fontWeight: 600 }}>
                {t("courier.integrationCodeLabel")}
              </label>
              <input type="text" placeholder={t("courier.integrationCodePlaceholder")} value={integrationCode}
                onChange={e => setIntegrationCode(e.target.value)} style={inputStyle} />
              <p style={{ fontSize: 11, color: "var(--ne-muted-2)", margin: "-4px 0 12px" }}>
                {t("courier.integrationCodeHint")}
              </p>

              {error && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{error}</p>}

              <button type="submit" disabled={connecting}
                style={{ width: "100%", padding: "10px", background: connecting ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: connecting ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {connecting ? t("courier.connecting") : (<><Icon name="link" size={13} /> {t("courier.connectDex")}</>)}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Dex manual Excel upload — order_statuses ke courier-overlay columns ko update karta hai
          (order_number_match se Shopify order dhoond kar). Live-API binding (upar wala card) se
          bilkul alag/independent hai. */}
      {!loading && (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem", marginTop: "1rem" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="chart" size={14} /> {t("courier.excelUploadTitle")}</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ne-muted-2)" }}>
            {t("courier.excelUploadHint")}
          </p>

          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "12px", borderRadius: 10, border: "1px dashed var(--ne-border)",
            background: "var(--ne-surface)", cursor: uploading ? "default" : "pointer",
            fontSize: 13, fontWeight: 600, color: "var(--ne-muted)",
          }}>
            {uploading ? (
              <><Icon name="pending" size={13} /> {importProgress ? `${t("courier.processingBatch")} ${importProgress.current}/${importProgress.total}...` : t("courier.uploading")}</>
            ) : (<><Icon name="folder" size={13} /> {t("courier.chooseExcel")}</>)}
            <input type="file" accept=".xlsx" onChange={handleExcelUpload} disabled={uploading} style={{ display: "none" }} />
          </label>

          {uploadError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginTop: 10 }}>{uploadError}</p>}
          {uploadResult && (
            <div style={{ marginTop: 10 }}>
              <p style={{ color: "var(--ne-success)", fontSize: 12, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={11} /> {uploadResult.updated} {t("courier.ordersUpdatedSuffix")}
              </p>
              {uploadResult.inserted > 0 && (
                <p style={{ color: "var(--ne-accent)", fontSize: 12, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="chart" size={11} /> {uploadResult.inserted} {t("courier.unmatchedNote")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {importResultModalOpen && uploadResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 480, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("courier.importResultTitle")}</h3>
              <button onClick={() => setImportResultModalOpen(false)} style={{ background: "transparent", border: "none", color: "var(--ne-muted)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>

            {uploadResult.partial && (
              <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ne-warning)", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="warning" size={12} /> {t("courier.importPartialNote")}
              </p>
            )}

            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={12} /> {uploadResult.updated} {t("courier.importResultUpdated")}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="pending" size={12} /> {uploadResult.skippedSameStatus} {t("courier.importResultSkippedSame")}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="pending" size={12} /> {uploadResult.skippedStale} {t("courier.importResultSkippedStale")}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ne-accent)", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="chart" size={12} /> {uploadResult.inserted} {t("courier.importResultManualAdded")}
              </p>
            </div>

            {Object.keys(uploadResult.statusBreakdown).length > 0 && (
              <div style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 12 }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "var(--ne-muted)" }}>{t("courier.importResultBreakdown")}</p>
                <div style={{ display: "grid", gap: 4 }}>
                  {Object.entries(uploadResult.statusBreakdown).map(([status, count]) => (
                    <div key={status} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ne-text)" }}>
                      <span>{status}</span>
                      <span style={{ fontWeight: 700 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setImportResultModalOpen(false)}
              style={{
                marginTop: 18, width: "100%", padding: "9px 0", borderRadius: 9, border: "none",
                background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              {t("courier.importResultClose")}
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem", marginTop: "1rem" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="pin" size={14} /> {t("courier.pickupAddressesTitle")}</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ne-muted-2)" }}>{t("courier.pickupAddressesHint")}</p>

          {pickupAddrError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{pickupAddrError}</p>}

          {pickupAddresses.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ne-text)" }}>{a.label} {a.is_default && <span style={{ fontSize: 10, color: "var(--ne-accent)" }}>({t("courier.default")})</span>}</div>
                <div style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{a.address_line}, {a.city}</div>
                <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginTop: 2 }}>{a.contact_name} · {a.contact_phone}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {!a.is_default && <button onClick={() => handleSetDefaultAddress(a.id)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", cursor: "pointer" }}>{t("courier.setDefault")}</button>}
                <button onClick={() => handleDeleteAddress(a.id)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--ne-danger)", background: "transparent", color: "var(--ne-danger)", cursor: "pointer" }}>{t("courier.delete")}</button>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--ne-border)" }}>
            <label style={{ color: "var(--ne-muted)", fontSize: 11.5, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("courier.addressNameLabel")}</label>
            <input placeholder={t("courier.addressNamePlaceholder")} value={newAddrLabel} onChange={(e) => setNewAddrLabel(e.target.value)} style={inputStyle} />
            <label style={{ color: "var(--ne-muted)", fontSize: 11.5, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("courier.addressLabel")}</label>
            <input placeholder={t("courier.addressPlaceholder")} value={newAddrLine} onChange={(e) => setNewAddrLine(e.target.value)} style={inputStyle} />
            <label style={{ color: "var(--ne-muted)", fontSize: 11.5, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("courier.cityLabel")}</label>
            <input placeholder={t("courier.cityPlaceholder")} value={newAddrCity} onChange={(e) => setNewAddrCity(e.target.value)} style={inputStyle} />
            <label style={{ color: "var(--ne-muted)", fontSize: 11.5, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("courier.contactNameLabel")}</label>
            <input placeholder={t("courier.contactNamePlaceholder")} value={newAddrContactName} onChange={(e) => setNewAddrContactName(e.target.value)} style={inputStyle} />
            <label style={{ color: "var(--ne-muted)", fontSize: 11.5, display: "block", marginBottom: 4, fontWeight: 600 }}>{t("courier.contactPhoneLabel")}</label>
            <input placeholder={t("courier.contactPhonePlaceholder")} value={newAddrContactPhone} onChange={(e) => setNewAddrContactPhone(e.target.value)} style={inputStyle} />
            <button onClick={handleAddAddress} disabled={addingAddr}
              style={{ width: "100%", padding: "9px", background: "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              + {t("courier.addAddressButton")}
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem", marginTop: "1rem" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="scale" size={14} /> {t("courier.defaultWeightTitle")}</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ne-muted-2)" }}>{t("courier.defaultWeightHint")}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <label style={{ color: "var(--ne-muted)", fontSize: 11, display: "block", marginBottom: 3 }}>{t("courier.weightKg")}</label>
              <input type="number" step="0.1" value={defaultWeight} onChange={(e) => setDefaultWeight(e.target.value)} style={{ ...inputStyle, marginBottom: 0, width: 90 }} />
            </div>
            <div>
              <label style={{ color: "var(--ne-muted)", fontSize: 11, display: "block", marginBottom: 3 }}>{t("courier.lengthCm")}</label>
              <input type="number" value={defaultLength} onChange={(e) => setDefaultLength(e.target.value)} style={{ ...inputStyle, marginBottom: 0, width: 90 }} />
            </div>
            <div>
              <label style={{ color: "var(--ne-muted)", fontSize: 11, display: "block", marginBottom: 3 }}>{t("courier.widthCm")}</label>
              <input type="number" value={defaultWidth} onChange={(e) => setDefaultWidth(e.target.value)} style={{ ...inputStyle, marginBottom: 0, width: 90 }} />
            </div>
            <div>
              <label style={{ color: "var(--ne-muted)", fontSize: 11, display: "block", marginBottom: 3 }}>{t("courier.heightCm")}</label>
              <input type="number" value={defaultHeight} onChange={(e) => setDefaultHeight(e.target.value)} style={{ ...inputStyle, marginBottom: 0, width: 90 }} />
            </div>
          </div>
          <button onClick={handleSaveWeight} disabled={savingWeight}
            style={{ padding: "9px 18px", background: "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {t("courier.save")}
          </button>
        </div>
      )}

      {!loading && (
        <div style={{
          background: 'var(--ne-surface-2)',
          border: '1px solid var(--ne-border)',
          borderRadius: 14, padding: '1.5rem',
          marginTop: '1rem'
        }}>
          <p style={{
            margin: '0 0 4px', fontWeight: 700, fontSize: 15,
            color: 'var(--ne-text)'
          }}>
            eNeezam Label Display
          </p>
          <p style={{
            margin: '0 0 12px', fontSize: 12,
            color: 'var(--ne-muted-2)'
          }}>
            Label pe items kaise print hon
          </p>
          {[
            { value: "name", label: "Sirf Product Name (variant ke sath)" },
            { value: "sku", label: "Sirf SKU" },
            { value: "both", label: "Dono — Product Name + Variant + SKU" },
          ].map((opt) => (
            <label key={opt.value} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 0', fontSize: 13, cursor: 'pointer'
            }}>
              <input
                type="radio"
                name="labelDisplayMode"
                checked={labelDisplayMode === opt.value}
                onChange={() => handleSaveLabelMode(opt.value)}
                disabled={savingLabelMode}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
