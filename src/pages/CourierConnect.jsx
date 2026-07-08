import { useState, useEffect } from "react";
import ExcelJS from "exceljs";
import { supabase } from "../supabase";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

// Dex ke 43-column Excel export headers -> dex_shipments_import table ke snake_case columns.
// (SQL confirmed — dex_shipments_import table, upsert key (store_id, tracking_no))
const DEX_HEADER_MAP = {
  externalOrderId: "external_order_id",
  omsOrderId: "oms_order_id",
  trackingNo: "tracking_no",
  "Original Tracking No": "original_tracking_no",
  "Package type": "package_type",
  "Delivery Option": "delivery_option",
  platform: "platform",
  omsOrderStatus: "oms_order_status",
  totalPrice: "total_price",
  paymentMethod: "payment_method",
  orderCreatedTime: "order_created_time",
  productList: "product_list",
  quantity: "quantity",
  estimatedShippingFee: "estimated_shipping_fee",
  dimWeight: "dim_weight",
  receiver: "receiver",
  receiverPhone: "receiver_phone",
  receiverAddress: "receiver_address",
  receiverLevel4Address: "receiver_level4_address",
  receiverLevel3Address: "receiver_level3_address",
  receiverLevel2Address: "receiver_level2_address",
  "Receiver Original Address": "receiver_original_address",
  warehouseName: "warehouse_name",
  warehouseAddress: "warehouse_address",
  "Warehouse Original Address": "warehouse_original_address",
  deliveryNote: "delivery_note",
  firstMileShippingProvider: "first_mile_shipping_provider",
  lastMileShippingProvider: "last_mile_shipping_provider",
  packageCreatedTime: "package_created_time",
  logisticsCurrentStatus: "logistics_current_status",
  logisticsCurrentStatusTime: "logistics_current_status_time",
  failedPickupReason: "failed_pickup_reason",
  pickupSuccessTime: "pickup_success_time",
  firstFailDeliveryAttemptTime: "first_fail_delivery_attempt_time",
  latestFailedDeliveryTime: "latest_failed_delivery_time",
  "First failed delivery attempt reason": "first_failed_delivery_attempt_reason",
  "Second failed delivery attempt reason": "second_failed_delivery_attempt_reason",
  "Third failed delivery attempt reason": "third_failed_delivery_attempt_reason",
  "Fourth failed delivery attempt reason": "fourth_failed_delivery_attempt_reason",
  deliveryAttemptCount: "delivery_attempt_count",
  deliveredTime: "delivered_time",
  failedReturnTime: "failed_return_time",
  returnSuccessTime: "return_success_time",
};

const DEX_TIMESTAMP_COLS = new Set([
  "order_created_time", "package_created_time", "logistics_current_status_time",
  "pickup_success_time", "first_fail_delivery_attempt_time", "latest_failed_delivery_time",
  "delivered_time", "failed_return_time", "return_success_time",
]);
const DEX_NUMERIC_COLS = new Set(["total_price", "estimated_shipping_fee", "dim_weight"]);
const DEX_INTEGER_COLS = new Set(["quantity", "delivery_attempt_count"]);

function coerceDexCell(value, col) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return DEX_TIMESTAMP_COLS.has(col) ? value.toISOString() : value.toString();
  }
  if (typeof value === "object") {
    if (value.text) value = value.text;
    else if (value.result !== undefined) value = value.result;
    else if (Array.isArray(value.richText)) value = value.richText.map(t => t.text).join("");
    else return null;
  }
  if (DEX_TIMESTAMP_COLS.has(col)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (DEX_NUMERIC_COLS.has(col) || DEX_INTEGER_COLS.has(col)) {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  return String(value).trim();
}

async function parseDexExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const colIndexToDbKey = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = String(cell.value || "").trim();
    const dbKey = DEX_HEADER_MAP[header];
    if (dbKey) colIndexToDbKey[colNumber] = dbKey;
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const dbKey = colIndexToDbKey[colNumber];
      if (!dbKey) return;
      obj[dbKey] = coerceDexCell(cell.value, dbKey);
    });
    if (obj.tracking_no) rows.push(obj);
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
        setUploadError("File mein koi valid row (tracking_no ke sath) nahi mili");
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
      setUploadResult({ upserted: data.upserted, skipped: data.skipped });
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

      {/* Phase 8: Dex manual Excel upload — 43-column export, insert-or-update by tracking_no.
          Live-API binding (upar wala card) se bilkul alag/independent hai. */}
      {!loading && (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem", marginTop: "1rem" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15, color: "var(--ne-text)" }}>📊 Dex Excel Upload</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ne-muted-2)" }}>
            Daraz Seller Center se export ki gayi shipments file (.xlsx) upload karo — tracking number ke hisaab se insert-or-update ho jayega.
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
            <p style={{ color: "var(--ne-success)", fontSize: 12, marginTop: 10 }}>
              ✅ {uploadResult.upserted} shipments save ho gaye{uploadResult.skipped > 0 ? ` (${uploadResult.skipped} rows skip hui, tracking number missing tha)` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
