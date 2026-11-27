import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { fetchStoreRow } from "../lib/storeColumns";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { nexApi, NEX_LOGO } from "../lib/nexApi";
import NexKyc from "./NexKyc";
import dexLogo from "../assets/couriers/dex.png";

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
  // NeX / DEX cards (worker nex.js)
  const [nex, setNex] = useState(null);
  const [nexError, setNexError] = useState("");
  const [kycOpen, setKycOpen] = useState(false);
  const [toggling, setToggling] = useState("");
  const [openCard, setOpenCard] = useState("");
  // the full KYC as submitted (read-only), loaded when the NeX details open
  const [kycFull, setKycFull] = useState(null);
  useEffect(() => {
    if (openCard !== "nex" || !nex?.kyc) return undefined;
    let alive = true;
    nexApi("kyc-get", { store_id: storeId }).then((d) => { if (alive) setKycFull(d.kyc || null); });
    return () => { alive = false; };
  }, [openCard, nex?.kyc, storeId]);
  const viewCnic = async (side) => {
    const w = window.open("", "_blank");
    const d = await nexApi("kyc-file", { store_id: storeId, side });
    if (d.error) { w?.close(); setNexError(d.error); } else if (w) w.location.href = d.url;
  };
  const setDefaultCourier = async (courier) => {
    const d = await nexApi("default", { store_id: storeId, courier });
    if (d.error) { setNexError(d.error); return; }
    logActivity("courier_default_set", { courier });
    loadCouriers();
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) fetchStore();
  }, [storeId]);

  useEffect(() => { if (storeId) fetchPickupAddresses(); }, [storeId]);
  useEffect(() => { if (storeId) loadCouriers(); }, [storeId]);

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
    const { data } = await fetchStoreRow(supabase, storeId);
    setStore(data || null);
    setDefaultWeight(data?.default_weight_kg ?? "0.5");
    setDefaultLength(data?.default_length_cm ?? "20");
    setDefaultWidth(data?.default_width_cm ?? "20");
    setDefaultHeight(data?.default_height_cm ?? "10");
    setLabelDisplayMode(data?.label_display_mode ?? "both");
    setLoading(false);
  };

  const loadCouriers = async () => {
    const d = await nexApi("state", { store_id: storeId });
    if (d.error) { setNexError(d.error); return; }
    setNexError(""); setNex(d);
  };

  const toggleCourier = async (courier, on) => {
    // NeX needs the one-time KYC before it can be switched on
    if (courier === "nex" && on && (!nex?.kyc || nex.kyc.status === "rejected")) { setKycOpen(true); return; }
    setToggling(courier);
    const d = await nexApi("toggle", { store_id: storeId, courier, on });
    setToggling("");
    if (d.error) { setNexError(d.error); return; }
    logActivity("courier_toggled", { courier, on });
    loadCouriers();
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

      {loading || !nex ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{nexError ? <span style={{ color: "var(--ne-danger)" }}>{nexError} <button onClick={loadCouriers} style={{ marginLeft: 6 }}>Dobara</button></span> : t("courier.loading")}</div>
      ) : (() => {
        const cards = [
          {
            id: "nex", name: "NeX", full: "Neezam Express · eNeezam ki apni courier service", logo: NEX_LOGO,
            on: nex.couriers.nex.enabled, connected: nex.couriers.nex.ready,
            status: nex.couriers.nex.ready ? ["ok", "Connected: booking mein NeX dikhega"]
              : !nex.kyc ? ["wait", "On karein aur ek dafa KYC bharein"]
              : nex.kyc.status === "submitted" ? ["wait", "KYC check ho rahi hai. Approve hote hi NeX chal jayega"]
              : nex.kyc.status === "rejected" ? ["bad", `KYC wapas aayi: ${nex.kyc.review_note || "dobara bharein"}`]
              : !nex.couriers.nex.service ? ["wait", "KYC approve. NeX service jald shuru ho rahi hai"]
              : !nex.couriers.nex.enabled ? ["off", "KYC approve hai magar NeX band hai"] : ["wait", "..."],
          },
          {
            id: "dex", name: "DEX", full: "Daraz Express · aap ke apne DEX account se", logo: dexLogo,
            on: nex.couriers.dex.enabled, connected: nex.couriers.dex.connected,
            status: nex.couriers.dex.ready ? ["ok", "Connected: booking mein DEX dikhega"]
              : !nex.couriers.dex.connected ? ["wait", "Connected nahi: integration code se jorein"]
              : ["off", "Connected hai magar band: booking mein nahi aayega"],
          },
        ];
        const tone = { ok: "var(--ne-success)", wait: "var(--ne-warning)", bad: "var(--ne-danger)", off: "var(--ne-muted)" };
        const open = cards.find((c) => c.id === openCard);
        return (
          <>
            <style>{".cc-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,200px));gap:16px}.cc-tile:hover .cc-box{border-color:var(--ne-accent)}@media(max-width:420px){.cc-tiles{grid-template-columns:1fr 1fr;gap:10px}}"}</style>
            {nexError && <p style={{ color: "var(--ne-danger)", fontSize: 12, margin: "0 0 10px" }}>{nexError}</p>}
            <div className="cc-tiles">
              {cards.map((c) => (
                <div key={c.id} className="cc-tile" style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                  <button className="cc-box" onClick={() => setOpenCard(c.id)} aria-label={`${c.name} ki tafseel`}
                    style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 18, background: "var(--ne-surface-2)", border: `2px solid ${c.on && c.connected ? "var(--ne-success)" : "var(--ne-border)"}`, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 14, boxSizing: "border-box", color: "var(--ne-text)", font: "inherit" }}>
                    <div style={{ width: "58%", aspectRatio: "1 / 1", borderRadius: 16, background: "#fff", border: "1px solid var(--ne-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      <img src={c.logo} alt="" style={{ maxWidth: "86%", maxHeight: "86%", objectFit: "contain" }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{c.name}</span>
                  </button>
                  <button role="switch" aria-checked={c.on} aria-label={`${c.name} on/off`} disabled={toggling === c.id} onClick={() => toggleCourier(c.id, !c.on)}
                    style={{ width: 50, height: 28, borderRadius: 14, border: "none", cursor: "pointer", position: "relative", background: c.on ? "var(--ne-success)" : "var(--ne-border)", transition: "background .15s" }}>
                    <span style={{ position: "absolute", top: 3, left: c.on ? 25 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                  </button>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: c.connected ? "var(--ne-success)" : "var(--ne-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                    <Icon name={c.connected ? "check" : "pending"} size={11} /> {c.connected ? "Connected" : "Not connected"}{c.on ? " · ON" : " · OFF"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
              <b>Booking mein pehle:</b>
              {[["nex", "NeX"], ["dex", "DEX"]].map(([id, name]) => {
                const on = (nex.default_courier || "nex") === id;
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => !on && setDefaultCourier(id)}
                    style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: on ? "default" : "pointer", border: `1px solid ${on ? "var(--ne-accent)" : "var(--ne-border)"}`, background: on ? "var(--ne-accent)" : "transparent", color: on ? "#fff" : "var(--ne-text)" }}>
                    {on ? "✓ " : ""}{name}
                  </button>
                );
              })}
              <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>Default courier booking ke dropdown mein sab se upar aata hai (ON aur connected ho to).</span>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--ne-muted-2)" }}>Box par click karein tafseel ke liye. Jo courier ON aur connected ho, booking karte waqt wohi dikhega; dono hon to booking par chunein.</p>

            {open && (
              <div onClick={(e) => { if (e.target === e.currentTarget) setOpenCard(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 12px" }}>
                <div role="dialog" aria-label={`${open.name} ki tafseel`} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 560, maxWidth: "100%", padding: 20, boxSizing: "border-box", color: "var(--ne-text)", display: "grid", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", border: "1px solid var(--ne-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}><img src={open.logo} alt="" style={{ maxWidth: "86%", maxHeight: "86%", objectFit: "contain" }} /></div>
                    <div style={{ flex: 1 }}><b style={{ fontSize: 17 }}>{open.name}</b><div style={{ fontSize: 12, color: "var(--ne-muted)" }}>{open.full}</div></div>
                    <button aria-label="Band karein" onClick={() => setOpenCard("")} style={{ background: "transparent", border: "none", color: "var(--ne-muted)", fontSize: 22, cursor: "pointer" }}>×</button>
                  </div>
                  <div style={{ fontSize: 13, color: tone[open.status[0]], display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Icon name={open.status[0] === "ok" ? "check" : open.status[0] === "bad" ? "warning" : "pending"} size={12} /> {open.status[1]}
                  </div>

                  {open.id === "nex" && (
                    <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                      <p style={{ margin: 0, color: "var(--ne-muted)", lineHeight: 1.6 }}>NeX eNeezam ki apni courier service hai. Booking eNeezam ke courier partners (Daraz Express (DEX), TCS, Leopards, PostEx aur FastEx) se hoti hai, COD eNeezam ko aati hai aur courier ke cycle par charges kaat kar aap ke bank mein bhej di jati hai.</p>
                      {nex.kyc ? (
                        <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "12px 14px", display: "grid", gap: 6 }}>
                          <span>KYC: <b style={{ color: nex.kyc.status === "approved" ? "var(--ne-success)" : nex.kyc.status === "rejected" ? "var(--ne-danger)" : "var(--ne-warning)" }}>{nex.kyc.status === "approved" ? "Approved" : nex.kyc.status === "rejected" ? "Wapas aayi" : "Check ho rahi hai"}</b> · {new Date(nex.kyc.updated_at || nex.kyc.created_at).toLocaleDateString("en-PK")}</span>
                          {!kycFull ? <span style={{ color: "var(--ne-muted)" }}>{t("courier.loading")}</span> : (
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(110px,auto) 1fr", gap: "4px 12px" }}>
                              {[["Contact person", kycFull.contact_name], ["Mobile", kycFull.mobile], ["Email", kycFull.email], ["Brand", kycFull.brand_name], ["Category", kycFull.category], ["Address", [kycFull.address, kycFull.city].filter(Boolean).join(", ")], ["Bank", kycFull.bank_name], ["Account title", kycFull.account_title], ["Account number", kycFull.account_number], ["IBAN", kycFull.iban]].map(([a, b]) => (
                                <div key={a} style={{ display: "contents" }}><span style={{ color: "var(--ne-muted)" }}>{a}</span><b style={{ wordBreak: "break-word" }}>{b || "-"}</b></div>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                            <button type="button" onClick={() => viewCnic("front")} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="eye" size={12} /> CNIC saamne</button>
                            <button type="button" onClick={() => viewCnic("back")} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="eye" size={12} /> CNIC peeche</button>
                          </div>
                          {nex.kyc.status !== "rejected" && <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>Yeh maloomat badalni ho to support@eneezam.com par likhein.</span>}
                        </div>
                      ) : <p style={{ margin: 0 }}>Abhi KYC nahi bhari. NeX on karne ke liye ek dafa KYC aur <a href="/nex-terms" target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)" }}>NeX terms</a> zaroori hain.</p>}
                      {(!nex.kyc || nex.kyc.status === "rejected") && <button onClick={() => { setOpenCard(""); setKycOpen(true); }} style={{ padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{nex.kyc ? "KYC edit karke theek karein" : "KYC bharein aur NeX shuru karein"}</button>}
                    </div>
                  )}

                  {open.id === "dex" && (
                    <>
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

                      <div style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 14 }}>
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
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        );
      })()}
      {kycOpen && nex && <NexKyc storeId={storeId} state={nex} onClose={() => setKycOpen(false)} onDone={() => { setKycOpen(false); logActivity("nex_kyc_submitted", {}); loadCouriers(); }} />}


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
