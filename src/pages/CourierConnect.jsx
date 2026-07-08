import { useState, useEffect } from "react";
import { supabase } from "../supabase";

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
  const prefix = beforeUnderscore.split("-")[0];
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
      courier_order_status: cellToText(raw.omsOrderStatus) || null,
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
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [integrationCode, setIntegrationCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) fetchStore();
  }, [storeId]);

  const fetchStore = async () => {
    setLoading(true);
    const { data } = await supabase.from("stores").select("*").eq("id", storeId).single();
    setStore(data || null);
    setLoading(false);
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setError("");
    if (!integrationCode.trim()) {
      setError("Integration Code daalo");
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
        setError(data.error);
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

  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const rows = await parseDexExcelFile(file);
      if (rows.length === 0) {
        setUploadError("File mein koi valid row (jisme order number extract ho saka) nahi mili");
        setUploading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/dex-import-shipments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ storeId, rows }),
      });
      const data = await res.json();
      if (data.error) {
        setUploadError(data.error);
        setUploading(false);
        return;
      }
      setUploadResult({ updated: data.updated, inserted: data.inserted });
    } catch (err) {
      setUploadError(err.message);
    }
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
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📦 Courier Connect</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>Daraz Express (Dex) Logistics</p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>Loading...</div>
      ) : (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "1.25rem" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--ne-surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: "1px solid var(--ne-border)" }}>
              📦
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--ne-text)" }}>Daraz Express (Dex)</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ne-muted-2)" }}>
                {isConnected ? `Seller ID: ${store.dex_seller_id}` : "Abhi tak connected nahi"}
              </p>
            </div>
            {isConnected ? (
              <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-success-soft)", color: "var(--ne-success)", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap" }}>
                ✅ Connected
              </span>
            ) : (
              <span style={{ fontSize: 11, padding: "4px 12px", background: "var(--ne-warning-soft)", color: "var(--ne-warning)", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap" }}>
                ⏳ Not Connected
              </span>
            )}
          </div>

          {isConnected ? (
            <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "var(--ne-muted)" }}>
              Platform: <strong style={{ color: "var(--ne-text)" }}>{store.dex_platform_name || "eNeezam"}</strong><br />
              Connected: <strong style={{ color: "var(--ne-text)" }}>{store.dex_connected_at ? new Date(store.dex_connected_at).toLocaleString("en-PK") : "—"}</strong>
            </div>
          ) : (
            <form onSubmit={handleConnect}>
              <label style={{ color: "var(--ne-muted)", fontSize: 12, display: "block", marginBottom: 4, fontWeight: 600 }}>
                Dex Integration Code
              </label>
              <input type="text" placeholder="Integration Code daalo" value={integrationCode}
                onChange={e => setIntegrationCode(e.target.value)} style={inputStyle} />
              <p style={{ fontSize: 11, color: "var(--ne-muted-2)", margin: "-4px 0 12px" }}>
                Yeh code aapko Daraz Seller Center ke logistics/API section se milega.
              </p>

              {error && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{error}</p>}

              <button type="submit" disabled={connecting}
                style={{ width: "100%", padding: "10px", background: connecting ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: connecting ? "default" : "pointer" }}>
                {connecting ? "Connect ho raha hai..." : "🔗 Connect Dex"}
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
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "var(--ne-text)" }}>📊 Dex Excel Upload</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ne-muted-2)" }}>
            Daraz Seller Center se export ki gayi shipments file (.xlsx) upload karo — order number match kar ke courier/tracking status update ho jayega.
          </p>

          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "12px", borderRadius: 10, border: "1px dashed var(--ne-border)",
            background: "var(--ne-surface)", cursor: uploading ? "default" : "pointer",
            fontSize: 13, fontWeight: 600, color: "var(--ne-muted)",
          }}>
            {uploading ? "⏳ Upload ho raha hai..." : "📁 Excel file choose karo (.xlsx)"}
            <input type="file" accept=".xlsx" onChange={handleExcelUpload} disabled={uploading} style={{ display: "none" }} />
          </label>

          {uploadError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginTop: 10 }}>{uploadError}</p>}
          {uploadResult && (
            <div style={{ marginTop: 10 }}>
              <p style={{ color: "var(--ne-success)", fontSize: 12, margin: 0 }}>
                ✅ {uploadResult.updated} orders update ho gaye (Shopify se match hue).
              </p>
              {uploadResult.inserted > 0 && (
                <p style={{ color: "var(--ne-accent)", fontSize: 12, margin: "4px 0 0" }}>
                  📊 {uploadResult.inserted} orders "Unmatched/Manual" ke taur par add hue (Shopify mein nahi milay — Booked Orders mein alag badge ke sath dikhenge).
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
