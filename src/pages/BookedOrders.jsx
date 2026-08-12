import { useState, useEffect, useMemo } from "react";
import { PDFDocument } from "pdf-lib";
import { supabase } from "../supabase";
import { getCachedBookedOrders } from "../ordersCache";
import { syncBookedOrdersCache, bucketFinalStatus } from "../bookedOrdersData";
import { printEneezamLabel, printEneezamLabelsMerged } from "../components/EneezamLabel";
import { addressChipStyle, addressChipMutedStyle } from "../addressChipStyles";
import dexLogo from "../assets/couriers/dex.png";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

const PER_PAGE_OPTIONS = [20, 50, 100];

// Courier company brand colors — jaise Dashboard.jsx ke SOURCE_COLORS (Meta/TikTok/etc),
// yeh company-identity colors hain, theme-reactive semantic vars nahi
const COURIER_COLORS = {
  "PK-DEX": "#5C7CFA",
  "PK-LCS": "#34D88E",
  "PK-TCS": "#FB923C",
  "PK-TRAX": "#3B82F6",
  "PK-MNP-API": "#A855F7",
};
const courierColor = (name) => COURIER_COLORS[name] || "#8C93C4";

const STATUS_BUCKET_META = {
  Delivered: { color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
  Returned: { color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
  "In Transit": { color: "var(--ne-accent)", bg: "var(--ne-accent-soft)" },
  "Failed Delivery": { color: "var(--ne-orange)", bg: "var(--ne-orange-soft)" },
};

// Daraz ke courier_order_status (omsOrderStatus se aaya) ka exact vocabulary sample data
// dekhe bina pata nahi — isliye keyword-based bucketing, exact-string match nahi. Agar
// real data pe grouping galat lage to yahan rules adjust karne honge.
function bucketCourierStatus(raw) {
  const s = (raw || "").toLowerCase();
  if (!s) return "In Transit";
  if (s.includes("return")) return "Returned";
  if (s.includes("fail")) return "Failed Delivery";
  if (s.includes("deliver")) return "Delivered";
  return "In Transit";
}

// Top filter-tabs ka nested taxonomy (bucketCourierStatus/STATUS_BUCKET_META se ALAG/independent
// hai — woh sirf per-card status-badge color ke liye hai, yeh sirf tab-filtering ke liye).
// "To Ship" aur "Shipped" ke apne sub-buckets hain, baaki standalone final-outcome tabs hain.
// Real dex_status/courier_order_status distinct-values (2026-07-09 query) ke against confirmed:
// har value neeche kisi na kisi bucket mein saaf saaf aata hai, koi unclassified case nahi bacha.
const TAB_KEYS = [
  { key: "All", labelKey: "booked.tab.all" },
  { key: "Ready for Booking", labelKey: "booked.tab.readyForBooking" },
  { key: "To Ship", labelKey: "booked.tab.toShip", subs: [
      { key: "Booked", labelKey: "booked.tab.booked" },
      { key: "Pickup Failed", labelKey: "booked.tab.pickupFailed" },
    ] },
  { key: "Shipped", labelKey: "booked.tab.shipped", subs: [
      { key: "Pickup Success", labelKey: "booked.tab.pickupSuccess" },
      { key: "Transit to Ship", labelKey: "booked.tab.transitToShip" },
      { key: "Arrived at Destination City", labelKey: "booked.tab.arrivedAtDestination" },
      { key: "Out for Delivery", labelKey: "booked.tab.outForDelivery" },
      { key: "Delivery attempt failed", labelKey: "booked.tab.deliveryAttemptFailed" },
      { key: "Failed Delivery", labelKey: "booked.tab.failedDelivery" },
    ] },
  { key: "Delivered", labelKey: "booked.tab.delivered" },
  { key: "Pending Return", labelKey: "booked.tab.pendingReturn" },
  { key: "Returned", labelKey: "booked.tab.returned" },
  { key: "Lost & Damage", labelKey: "booked.tab.lostDamage" },
  { key: "Cancel", labelKey: "booked.tab.cancel" },
];

const STATUS_TAB_MAP = {
  "ready to ship": { tab: "To Ship", sub: "Booked" },
  "to pack": { tab: "To Ship", sub: "Booked" },
  "pickup failed": { tab: "To Ship", sub: "Pickup Failed" },
  "pickup success": { tab: "Shipped", sub: "Pickup Success" },
  "transit to ship": { tab: "Shipped", sub: "Transit to Ship" },
  "last mile inbound": { tab: "Shipped", sub: "Arrived at Destination City" },
  "shipping": { tab: "Shipped", sub: "Out for Delivery" },
  "delivery attempt failed": { tab: "Shipped", sub: "Delivery attempt failed" },
  "deliver failed": { tab: "Shipped", sub: "Failed Delivery" },
  "delivered": { tab: "Delivered", sub: null },
  "returned": { tab: "Returned", sub: null },
  "return pending": { tab: "Pending Return", sub: null },
  "canceled": { tab: "Cancel", sub: null },
  "lost damaged": { tab: "Lost & Damage", sub: null },
};

function classifyTab(o) {
  const ad = o.agent_data;
  const raw = (ad.courier_order_status || "").trim().toLowerCase();
  const mapped = STATUS_TAB_MAP[raw];
  if (mapped) return mapped;
  if (!raw) return { tab: "To Ship", sub: "Booked" };
  return { tab: `Unmapped: ${ad.courier_order_status.trim()}`, sub: null };
}

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

const trackingUrl = (trackingNo) => `https://www.dex.com.pk/tracking?references=${encodeURIComponent(trackingNo || "")}`;

// Show Tracking modal ke event rows ke liye — module-level function taake Date.now()
// direct render/JSX mein inline call na ho (React purity-lint isay flag karta hai).
function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "abhi";
  if (mins < 60) return `${mins}m pehle`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h pehle`;
  const days = Math.floor(hrs / 24);
  return `${days}d pehle`;
}

// courier_order_status null ho (dex_status DEX_STATUS_MAP mein na ho) to raw_status ka
// readable fallback — "domestic_multi_leg_waiting_for_handover" -> "Multi Leg Waiting For Handover"
function humanizeRawStatus(raw) {
  if (!raw) return "—";
  return raw
    .replace(/^domestic_|^package_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// dex_tracking_events.photos/epod jsonb columns — array ya single string, kabhi bhi
// ho sakte hain, isliye dono cases ko ek flat URL array mein normalize karte hain.
function normalizePhotoUrls(...fields) {
  const urls = [];
  for (const f of fields) {
    if (!f) continue;
    if (Array.isArray(f)) urls.push(...f.filter(Boolean));
    else if (typeof f === "string") urls.push(f);
  }
  return urls;
}

// "Day N" = pickup_success_at (ya na ho to package_created_at) se aaj tak guzre din + 1
// (pickup/creation ke din khud "Day 1" hai). Koi bhi final/terminal courier_order_status
// (Delivered/Returned/Delivery Failed/Return Pending/Lost/Pickup Failed/Cancelled) reach ho
// chuka ho to yeh pill irrelevant hai — sirf abhi-tak-pending orders ke liye relevant hai.
// Dex ko reAttemptDateTime kam-se-kam agle calendar din ka chahiye — <input type="date">
// ka "min" attribute isi se set hota hai.
function tomorrowDateString() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function computeAgingDay(o) {
  const ad = o.agent_data;
  if (bucketFinalStatus(ad.courier_order_status)) return null;
  const refTs = ad.pickup_success_at || ad.package_created_at;
  if (!refTs) return null;
  const days = Math.floor((Date.now() - new Date(refTs).getTime()) / 86400000) + 1;
  return Math.max(1, days);
}

function agingMeta(day) {
  if (day <= 1) return { color: "#22C55E", labelKey: "booked.aging.great" };
  if (day === 2) return { color: "#84CC16", labelKey: "booked.aging.onTrack" };
  if (day === 3) return { color: "#EAB308", labelKey: "booked.aging.normal" };
  if (day === 4) return { color: "#F97316", labelKey: "booked.aging.concerning" };
  if (day === 5) return { color: "#EF4444", labelKey: "booked.aging.alarming" };
  return { color: "#DC2626", labelKey: "booked.aging.urgent", pulse: true };
}

// Final-state color ramp (Aurora Ledger palette, confirmed) — jab order apne final/terminal
// outcome tak pahunch jaye to POORI progress-line isi color mein render hoti hai, sirf last
// dot ka color nahi.
const FINAL_STATE_COLOR = {
  Delivered: "#34D88E",
  "Delivery Failed": "#F2A83E",
  "Return Pending": "#FB923C",
  Returned: "#F26D6D",
  Lost: "#F472B6",
};
const IN_PROGRESS_COLOR = "var(--ne-accent)";

function daysBetween(fromIso, toIso) {
  if (!fromIso) return null;
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  return Math.max(0, Math.floor((to - from) / 86400000));
}

// Booking ke turant baad, bina kisi intermediate status ke, seedha Cancelled/Pickup-Failed ho
// jane wale orders ke liye poora 6-stage timeline misleading hai (jaise "Day 336" dikhana
// jabke woh sirf turant-cancel hua tha, kabhi transit mein gaya hi nahi) — in ke liye sirf
// Booked -> Final ka 2-stage mini-timeline dikhate hain, neutral color mein (koi urgency nahi).
function isBookedToTerminalSpecialCase(finalStatus, ad) {
  return (finalStatus === "Cancelled" || finalStatus === "Pickup Failed") && !ad.pickup_success_at;
}

// Stages: [Created (sirf matched orders ke liye, Shopify raw_data.created_at se) ->] Booked
// [package_created_at] -> In Transit [pickup_success_at] -> Arrived at Destination City
// [arrived_at_destination_at] -> Out for Delivery [out_for_delivery_at] -> Final (courier_order_status
// se decide, color/label badalta hai). Har stage ke upar day-count = us stage aur AGLE known
// checkpoint ke beech ka farq — agla checkpoint maloom ho jaye to yeh count naturally frozen ho
// jata hai (dono timestamps fixed hain), warna aaj tak live badhta rehta hai.
function buildTimeline(o) {
  const ad = o.agent_data;
  const finalStatus = bucketFinalStatus(ad.courier_order_status);

  if (isBookedToTerminalSpecialCase(finalStatus, ad) && ad.package_created_at) {
    const finalAt = ad.logistics_status_at || null;
    return {
      special: true,
      color: "var(--ne-muted-2)",
      currentIdx: -1,
      isReached: true,
      stages: [
        { label: "Booked", at: ad.package_created_at, done: true, days: daysBetween(ad.package_created_at, finalAt) },
        { label: finalStatus, at: finalAt, done: true, days: null, isFinal: true },
      ],
    };
  }

  const finalAt = finalStatus === "Delivered" ? (ad.delivered_at || ad.logistics_status_at)
    : finalStatus === "Returned" ? (ad.return_success_at || ad.logistics_status_at)
    : ad.logistics_status_at;
  const finalMeta = finalStatus && FINAL_STATE_COLOR[finalStatus]
    ? { label: finalStatus, at: finalAt, color: FINAL_STATE_COLOR[finalStatus] }
    : { label: "Delivered", at: null, color: null };
  const isReached = !!finalMeta.color;

  const rawStages = [];
  if (!o.isManual) rawStages.push({ label: "Created", at: o.created_at });
  rawStages.push({ label: "Booked", at: ad.package_created_at });
  rawStages.push({ label: "In Transit", at: ad.pickup_success_at });
  rawStages.push({ label: "Arrived at Destination City", at: ad.arrived_at_destination_at });
  rawStages.push({ label: "Out for Delivery", at: ad.out_for_delivery_at });

  const checkpoints = [...rawStages, finalMeta];
  const stages = rawStages.map((s, i) => {
    const nextKnownAt = checkpoints.slice(i + 1).find((c) => !!c.at)?.at || null;
    return { ...s, done: isReached || !!s.at, days: s.at ? daysBetween(s.at, nextKnownAt) : null };
  });

  let currentIdx = -1;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].at) { currentIdx = i; break; }
  }

  return {
    special: false,
    color: isReached ? finalMeta.color : IN_PROGRESS_COLOR,
    isReached,
    currentIdx: isReached ? -1 : currentIdx,
    stages: [...stages, { label: finalMeta.label, at: finalMeta.at, done: isReached, days: null, isFinal: true }],
  };
}

function Timeline({ order }) {
  const tl = buildTimeline(order);
  return (
    <div style={{ display: "flex" }}>
      {tl.stages.map((s, i) => {
        const isCurrent = i === tl.currentIdx;
        const dotColor = tl.isReached || tl.special ? tl.color : (s.done ? IN_PROGRESS_COLOR : "var(--ne-border)");
        const lineColor = tl.isReached || tl.special ? tl.color : (i > 0 && tl.stages[i - 1].done ? IN_PROGRESS_COLOR : "var(--ne-border)");
        return (
          <div key={s.label} style={{ flex: 1, textAlign: "center", position: "relative", minWidth: 72 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: dotColor, marginBottom: 3, minHeight: 12 }}>
              {s.days !== null && s.days !== undefined ? `${s.days} day${s.days === 1 ? "" : "s"}` : " "}
            </div>
            {i > 0 && (
              <div style={{ position: "absolute", top: 20, left: "-50%", width: "100%", height: 2, background: lineColor }} />
            )}
            <div style={{
              width: 11, height: 11, borderRadius: "50%", margin: "0 auto", position: "relative", zIndex: 1,
              background: dotColor,
              boxShadow: isCurrent ? `0 0 0 4px ${dotColor}33` : "none",
            }} />
            <div style={{ fontSize: 9.5, marginTop: 6, fontWeight: s.done ? 700 : 500, color: s.done ? "var(--ne-text)" : "var(--ne-muted-2)" }}>{s.label}</div>
            <div style={{ fontSize: 8.5, color: "var(--ne-muted-2)", marginTop: 2 }}>{fmtDateTime(s.at) || "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

// Read-only province›city›area›subarea chip row for "Ready for Booking" cards — reuses
// Orders.jsx's AddressMatchBlock chip styling (addressChipStyle/addressChipMutedStyle) for
// visual consistency, but with no click/edit behavior at all (pure display).
function ReadOnlyAddressChips({ matched }) {
  if (!matched?.province) return null;
  const levels = [matched.province, matched.city, matched.area, matched.subarea];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2, overflow: "hidden", flexWrap: "nowrap" }}>
      {levels.map((value, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
          {i > 0 && <span style={{ color: "var(--ne-muted-2)", fontSize: 8, flexShrink: 0 }}>›</span>}
          <span style={{ ...(value ? addressChipStyle : addressChipMutedStyle), padding: "1px 5px", fontSize: 8.5, overflow: "hidden", textOverflow: "ellipsis" }}>
            {value || "—"}
          </span>
        </span>
      ))}
    </div>
  );
}

// Order-number ke numeric-sequence se descending sort (LATEST se OLDEST) — "#DWK8390" se 8390
// nikal ke number compare karte hain, manual orders ke liye manual_order_number use karte hain.
function extractOrderNum(o) {
  const raw = (o.name && o.name !== "—" ? o.name : o.agent_data.manual_order_number) || "";
  const digits = raw.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : -1;
}

// Orders.jsx ke computeOverrideTotal jaisa hi — line_items_override edit hone par
// BookedOrders "Ready for Booking" card ka total bhi updated price reflect kare,
// raw Shopify total_price pe stuck na rahe.
function computeOverrideTotal(items) {
  return (items || []).reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0) - (Number(it.discount) || 0), 0);
}

export default function BookedOrders({ storeId, ordersStore }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [activeSubTab, setActiveSubTab] = useState(null);
  const [courierFilter, setCourierFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [expandedRemarksIds, setExpandedRemarksIds] = useState(new Set());
  const [remarkDrafts, setRemarkDrafts] = useState({});
  const [remarkSubmitting, setRemarkSubmitting] = useState(null);
  const [loadingCount, setLoadingCount] = useState(0);
  const [readyOrders, setReadyOrders] = useState([]);
  const [variantSkuRows, setVariantSkuRows] = useState([]); // lightweight products_cache projection (raw_data->variants only) for the live-SKU lookup
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookCourier, setBookCourier] = useState("dex");
  const [bookAddressId, setBookAddressId] = useState("");
  const [pickupAddresses, setPickupAddresses] = useState([]);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [showCancelResultModal, setShowCancelResultModal] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);
  const [bookResults, setBookResults] = useState([]);
  const [showBookResultModal, setShowBookResultModal] = useState(false);
  const [awbResults, setAwbResults] = useState([]);
  const [showAwbResultModal, setShowAwbResultModal] = useState(false);
  const [mergingPdf, setMergingPdf] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState(null);
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const [bulkCancelResults, setBulkCancelResults] = useState([]);
  const [showBulkCancelResultModal, setShowBulkCancelResultModal] = useState(false);
  const [printingAwb, setPrintingAwb] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);
  const [shipperAdviceModal, setShipperAdviceModal] = useState(null);
  const [adviceFeedbackType, setAdviceFeedbackType] = useState("REATTEMPT");
  const [adviceReattemptDate, setAdviceReattemptDate] = useState("");
  const [adviceSellerNote, setAdviceSellerNote] = useState("");
  const [submittingAdvice, setSubmittingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState("");
  const [showAdviceSuccessModal, setShowAdviceSuccessModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(null);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");

  // DEX-serviceable cities — 152 rows, fetch once (not per-row) aur ek lowercased
  // Set mein cache karo, taake har order ke liye sirf ek O(1) lookup lage.
  const [dexServiceableCitySet, setDexServiceableCitySet] = useState(() => new Set());
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("dex_serviceable_cities").select("city");
      setDexServiceableCitySet(new Set((data || []).map((r) => (r.city || "").trim().toLowerCase()).filter(Boolean)));
    })();
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) loadBooked();
  }, [storeId]);

  // "Ready for Booking" = order_statuses.status "Approved" hai (agent_status, Orders.jsx wala
  // exact value) lekin abhi tak dex_tracking_number set nahi hua (kabhi booked hi nahi hua).
  // shopify_orders_cache mein flat columns nahi hote — asal order raw_data JSONB mein hai
  // (bookedOrdersData.js/App.jsx ka established pattern), isliye targeted order_statuses lookup
  // pehle karte hain phir sirf un-hi order_ids ka shopify_orders_cache .in() fetch — poori table
  // scan karne ke bajaye.
  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const { data: statusRows } = await supabase
        .from("order_statuses")
        .select("order_id, line_items_override, sku, matched_province, matched_city, matched_area, matched_subarea, customer_name")
        .eq("store_id", storeId)
        .eq("status", "Approved")
        .is("dex_tracking_number", null);
      const overrideMap = {};
      const skuOverrideMap = {};
      const matchedAddressMap = {};
      const nameOverrideMap = {};
      (statusRows || []).forEach((s) => {
        if (s.line_items_override) overrideMap[s.order_id] = s.line_items_override;
        if (s.sku) skuOverrideMap[s.order_id] = s.sku;
        if (s.customer_name) nameOverrideMap[s.order_id] = s.customer_name;
        matchedAddressMap[s.order_id] = {
          province: s.matched_province || null,
          city: s.matched_city || null,
          area: s.matched_area || null,
          subarea: s.matched_subarea || null,
        };
      });
      const orderIds = (statusRows || []).map((s) => s.order_id).filter(Boolean);
      if (orderIds.length === 0) {
        setReadyOrders([]);
      } else {
        const { data: cachedRows } = await supabase
          .from("shopify_orders_cache")
          .select("id, raw_data")
          .in("id", orderIds);
        const mapped = (cachedRows || []).map((r) => ({
          id: r.id, ...r.raw_data,
          _line_items_override: overrideMap[r.id] || null,
          _sku_override: skuOverrideMap[r.id] || null,
          _matched_city: matchedAddressMap[r.id]?.city || null,
          _matched_address: matchedAddressMap[r.id] || null,
          _customer_name_override: nameOverrideMap[r.id] || null,
        }));
        mapped.sort((a, b) => {
          const numA = parseInt((a.name || "").replace(/\D/g, ""), 10) || 0;
          const numB = parseInt((b.name || "").replace(/\D/g, ""), 10) || 0;
          return numB - numA;
        });
        setReadyOrders(mapped);
      }
      const { data: addrs } = await supabase.from("pickup_addresses").select("*").eq("store_id", storeId).order("created_at");
      setPickupAddresses(addrs || []);
      if (addrs && addrs.length > 0) setBookAddressId((addrs.find((a) => a.is_default) || addrs[0]).id);
    })();
  }, [storeId]);

  // Live SKU lookup (Orders.jsx jaisa hi) — "raw_data->variants" sirf, poora raw_data(*)
  // nahi, taake page-load payload halka rahe (images/body_html/tags/options waghera
  // drop ho jate hain).
  useEffect(() => {
    if (!storeId) return;
    supabase.from("products_cache").select("shopify_product_id, raw_data->variants").eq("store_id", storeId)
      .then(({ data, error }) => { if (!error) setVariantSkuRows(data || []); });
  }, [storeId]);

  const variantSkuMap = useMemo(() => {
    const map = new Map();
    variantSkuRows.forEach((row) => {
      (row.variants || []).forEach((v) => {
        if (v?.id != null) map.set(String(v.id), v.sku || "");
      });
    });
    return map;
  }, [variantSkuRows]);

  // Override items "Default Title" ke liye "" store karte hain, raw Shopify line_items
  // literal "Default Title" — dono ko ek hi canonical form pe laate hain taake
  // product_id::variant_title key dono taraf match kare.
  const normVariantTitle = (vt) => (vt && vt !== "Default Title" ? vt : "Default Title");

  // Fallback map jab variant_id se lookup fail ho jaye (variant delete karke usi naam
  // se dobara banaya gaya — naya variant_id, lekin product_id + title same rehte hain).
  const productVariantSkuMap = useMemo(() => {
    const map = new Map();
    variantSkuRows.forEach((row) => {
      if (row.shopify_product_id == null) return;
      (row.variants || []).forEach((v) => {
        map.set(`${row.shopify_product_id}::${normVariantTitle(v?.title)}`, v?.sku || "");
      });
    });
    return map;
  }, [variantSkuRows]);

  // Priority: line item ka apna stored sku (order ke purchase-time ka frozen record —
  // Shopify variant_id ko baad mein kisi bilkul different variant ke liye REUSE kar
  // sakta hai, is liye "live" lookup order ke asal SKU se unrelated cheez wapas de
  // sakta hai; raw sku hamesha sahi hota hai jab tak khaali na ho) -> variant_id se
  // fresh products_cache lookup (sirf jab raw sku khaali ho) -> product_id +
  // variant_title se lookup.
  const liveSkuForLineItem = (li) => {
    const rawSku = (li?.sku || "").trim();
    if (rawSku) return rawSku;
    const key = li?.variant_id != null ? String(li.variant_id) : null;
    if (key && variantSkuMap.has(key)) return variantSkuMap.get(key);
    const productId = li?.product_id ?? li?.shopify_product_id;
    if (productId != null) {
      const pvKey = `${productId}::${normVariantTitle(li?.variant_title)}`;
      if (productVariantSkuMap.has(pvKey)) return productVariantSkuMap.get(pvKey);
    }
    return "";
  };

  // Koi bhi lookup SKU resolve na kar paye to blank/dash ke bajaye product ka apna
  // title + variant dikhao.
  const displaySkuForLineItem = (li) => {
    const sku = liveSkuForLineItem(li);
    if (sku) return sku;
    const variantTitle = li?.variant_title && li.variant_title !== "Default Title" ? li.variant_title : "";
    return [li?.title || "", variantTitle].filter(Boolean).join(" - ");
  };

  // Remarks ke "author" field ke liye current user ka naam (Orders.jsx ke currentProfile
  // fetch jaisa hi pattern)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user.id).single();
      setCurrentProfile(data || null);
    })();
  }, []);

  const logActivity = async (actionType, orderId, details) => {
    if (!currentProfile || !ordersStore) return;
    try {
      await supabase.from("activity_log").insert({
        store_id: ordersStore.id,
        user_id: currentProfile.id,
        user_name: currentProfile.full_name || currentProfile.email,
        action_type: actionType,
        order_id: orderId ? String(orderId) : null,
        details: details || null,
      });
    } catch (err) {
      console.log("logActivity error:", err.message);
    }
  };

  // App.jsx ka background preload agar pehle hi cache warm kar chuka ho, to yahan turant
  // (spinner ke bina) dikhega — warna yehi function full-load karega. syncBookedOrdersCache()
  // (src/bookedOrdersData.js) hi asal fetch/merge/cache-write karta hai, App.jsx ka
  // fire-and-forget preload bhi isi function ko use karta hai — dono jagah same logic.
  const loadBooked = async () => {
    setError("");
    try {
      const cached = await getCachedBookedOrders(ordersStore?.eneezam_id);
      const cachedForStore = cached.filter((o) => o.agent_data?.store_id === storeId);

      if (cachedForStore.length > 0) {
        setOrders(cachedForStore);
        setLoading(false);
        syncBookedOrdersCache(storeId, ordersStore?.eneezam_id)
          .then(({ rows }) => {
            if (rows.length === 0) return;
            setOrders((prev) => {
              const map = {};
              prev.forEach((o) => { map[o.id] = o; });
              rows.forEach((o) => { map[o.id] = o; });
              return Object.values(map);
            });
          })
          .catch((err) => console.log("Booked delta sync error:", err.message));
        return;
      }

      setLoading(true);
      setLoadingCount(0);
      const { rows } = await syncBookedOrdersCache(storeId, ordersStore?.eneezam_id, (count) => setLoadingCount(count));
      setOrders(rows);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const toggleRemarks = (id) => {
    setExpandedRemarksIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleBookSingle = async (orderId) => {
    setSelectedIds(new Set([orderId]));
    setShowBookModal(true);
  };

  const handleBookConfirm = async () => {
    setBooking(true);
    setBookError("");
    const { data: { session } } = await supabase.auth.getSession();
    const results = [];
    for (const orderId of selectedIds) {
      const orderName = readyOrders.find((o) => o.id === orderId)?.name || orderId;
      try {
        const res = await fetch(`${CF_URL}/dex-book-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ store_id: storeId, order_id: orderId, pickup_address_id: bookAddressId }),
        });
        const data = await res.json();
        if (data.error) {
          results.push({ orderId, orderName, success: false, error: data.error });
          logActivity("booking_failed", orderId, { orderName, error: data.error });
        } else {
          results.push({ orderId, orderName, success: true, trackingNumber: data.trackingNumber });
          logActivity("booking_success", orderId, { orderName, trackingNumber: data.trackingNumber });
        }
      } catch (err) {
        results.push({ orderId, orderName, success: false, error: err.message });
        logActivity("booking_failed", orderId, { orderName, error: err.message });
      }
    }
    setBooking(false);
    setShowBookModal(false);
    setBookResults(results);
    setShowBookResultModal(true);
    setSelectedIds(new Set());
    loadBooked();
    setReadyOrders((prev) => prev.filter((o) => {
      const r = results.find((res) => res.orderId === o.id);
      return r ? !r.success : true;
    }));
  };

  const handleCancelBooking = async (orderId) => {
    setCancellingId(orderId);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${CF_URL}/dex-cancel-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: storeId, order_id: orderId }),
      });
      const data = await res.json();
      if (data.error) {
        setCancelResult({ success: false, error: data.error });
        logActivity("cancel_failed", orderId, { error: data.error });
      } else {
        setCancelResult({ success: true });
        logActivity("cancel_success", orderId, {});
      }
    } catch (err) {
      setCancelResult({ success: false, error: err.message });
      logActivity("cancel_failed", orderId, { error: err.message });
    }
    setCancellingId(null);
    setShowCancelResultModal(true);
    loadBooked();
  };

  const openShipperAdviceModal = (order) => {
    setShipperAdviceModal(order);
    setAdviceFeedbackType("REATTEMPT");
    setAdviceReattemptDate("");
    setAdviceSellerNote("");
    setAdviceError("");
  };

  const openTrackingModal = async (order) => {
    setShowTrackingModal(order);
    setTrackingEvents([]);
    setTrackingError("");
    setTrackingLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/order-tracking-history?order_id=${order.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.error) setTrackingError(data.error);
      else setTrackingEvents(data.events || []);
    } catch (err) {
      setTrackingError(err.message);
    }
    setTrackingLoading(false);
  };

  const handleSubmitShipperAdvice = async () => {
    const order = shipperAdviceModal;
    if (!order) return;
    setSubmittingAdvice(true);
    setAdviceError("");
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const body = { store_id: storeId, order_id: order.id, feedbackType: adviceFeedbackType };
      // Dex ka EpisPackageReAttempt API reAttemptDateTime epoch-milliseconds (13-digit,
      // string form — unke Java SDK sample jaisa) maangta hai, "YYYY-MM-DD" nahi.
      if (adviceFeedbackType === "REATTEMPT" && adviceReattemptDate) {
        const epochMs = new Date(adviceReattemptDate + "T00:00:00").getTime();
        body.reAttemptDateTime = String(epochMs);
      }
      if (adviceSellerNote.trim()) body.sellerNote = adviceSellerNote.trim();

      const res = await fetch(`${CF_URL}/dex-shipper-advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setAdviceError(data.error);
        logActivity("shipper_advice_failed", order.id, { error: data.error, feedbackType: adviceFeedbackType });
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, agent_data: { ...o.agent_data, awaiting_shipper_advice: false } } : o)));
        logActivity("shipper_advice_success", order.id, { feedbackType: adviceFeedbackType });
        setShipperAdviceModal(null);
        setShowAdviceSuccessModal(true);
      }
    } catch (err) {
      setAdviceError(err.message);
      logActivity("shipper_advice_failed", order.id, { error: err.message, feedbackType: adviceFeedbackType });
    }
    setSubmittingAdvice(false);
  };

  const handleBulkPrintAwb = async () => {
    setPrintingAwb(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const results = [];
      for (const orderId of selectedIds) {
        const order = orders.find((o) => o.id === orderId);
        const packageCode = order?.agent_data?.dex_package_code;
        const orderName = order?.name || orderId;
        if (!packageCode) {
          results.push({ orderId, orderName, error: t("booked.packageCodeMissing") });
          logActivity("awb_print_failed", orderId, { orderName, error: t("booked.packageCodeMissing") });
          continue;
        }
        try {
          const res = await fetch(`${CF_URL}/dex-print-awb?store_id=${storeId}&package_code=${packageCode}`, {
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          const data = await res.json();
          const pdfUrl = data.data?.url || data.url;
          if (pdfUrl) {
            results.push({ orderId, orderName, pdfUrl });
            logActivity("awb_print_success", orderId, { orderName });
          } else {
            const errMsg = data.error || t("booked.awbUrlMissing");
            results.push({ orderId, orderName, error: errMsg });
            logActivity("awb_print_failed", orderId, { orderName, error: errMsg });
          }
        } catch (err) {
          results.push({ orderId, orderName, error: err.message });
          logActivity("awb_print_failed", orderId, { orderName, error: err.message });
        }
      }
      setAwbResults(results);
      setShowAwbResultModal(true);

      // Dex ke paas batch-print endpoint nahi hai (per-order pdfUrl milta hai) — isliye
      // client-side pdf-lib se sab successful AWBs ko ek hi PDF mein merge karte hain.
      setMergedPdfUrl(null);
      const successUrls = results.filter((r) => r.pdfUrl).map((r) => r.pdfUrl);
      if (successUrls.length > 0) {
        setMergingPdf(true);
        try {
          const merged = await PDFDocument.create();
          for (const url of successUrls) {
            const bytes = await fetch(`${CF_URL}/proxy-pdf?url=${encodeURIComponent(url)}`, {
              headers: { Authorization: `Bearer ${session?.access_token}` },
            }).then((r) => r.arrayBuffer());
            const src = await PDFDocument.load(bytes);
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((p) => merged.addPage(p));
          }
          const mergedBytes = await merged.save();
          const blob = new Blob([mergedBytes], { type: "application/pdf" });
          setMergedPdfUrl(URL.createObjectURL(blob));
        } catch (err) {
          console.log("PDF merge error:", err.message);
          setMergedPdfUrl(null);
        }
        setMergingPdf(false);
      }
    } finally {
      setPrintingAwb(false);
    }
  };

  const handleBulkCancelBooking = async () => {
    setBulkCancelling(true);
    const { data: { session } } = await supabase.auth.getSession();
    const results = [];
    for (const orderId of selectedIds) {
      const order = orders.find((o) => o.id === orderId);
      const orderName = order?.name || orderId;
      try {
        const res = await fetch(`${CF_URL}/dex-cancel-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ store_id: storeId, order_id: orderId }),
        });
        const data = await res.json();
        if (data.error) {
          results.push({ orderId, orderName, success: false, error: data.error });
          logActivity("cancel_failed", orderId, { orderName, error: data.error });
        } else {
          results.push({ orderId, orderName, success: true });
          logActivity("cancel_success", orderId, { orderName });
        }
      } catch (err) {
        results.push({ orderId, orderName, success: false, error: err.message });
        logActivity("cancel_failed", orderId, { orderName, error: err.message });
      }
    }
    setBulkCancelling(false);
    setBulkCancelResults(results);
    setShowBulkCancelResultModal(true);
    setSelectedIds(new Set());
    loadBooked();
  };

  const handleBulkPrintEneezamLabel = async () => {
    setPrintingLabel(true);
    try {
      const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
      await printEneezamLabelsMerged({ orders: selectedOrders, storeId });
    } finally {
      setPrintingLabel(false);
    }
  };

  const submitRemark = async (order) => {
    const text = (remarkDrafts[order.id] || "").trim();
    if (!text) return;
    const author = currentProfile?.full_name || currentProfile?.email || "—";
    const optimisticEntry = { text, author, created_at: new Date().toISOString() };

    setRemarkSubmitting(order.id);
    // Optimistic update — turant dikhao, DB confirm hone ka wait nahi
    setOrders((prev) => prev.map((o) => o.id === order.id
      ? { ...o, agent_data: { ...o.agent_data, remarks_log: [...(o.agent_data.remarks_log || []), optimisticEntry] } }
      : o
    ));
    setRemarkDrafts((prev) => ({ ...prev, [order.id]: "" }));

    try {
      const { data, error: rpcError } = await supabase.rpc("append_order_remark", {
        p_order_id: order.agent_data.order_id || null,
        p_manual_order_number: order.agent_data.manual_order_number || null,
        p_text: text,
        p_author: author,
      });
      if (rpcError) throw rpcError;
      // Server ka authoritative array (asal timestamp ke sath) se optimistic entry replace karo
      setOrders((prev) => prev.map((o) => o.id === order.id
        ? { ...o, agent_data: { ...o.agent_data, remarks_log: data || o.agent_data.remarks_log } }
        : o
      ));
    } catch (err) {
      console.log("Remark save error:", err.message);
    }
    setRemarkSubmitting(null);
  };

  const availableCouriers = ["All", ...new Set(orders.map((o) => o.agent_data.courier_name).filter(Boolean))].sort();

  const classified = orders.map((o) => ({ o, cls: classifyTab(o) }));

  const unmappedTabKeys = [...new Set(classified.map((c) => c.cls.tab).filter((key) => key.startsWith("Unmapped: ")))];

  const TAB_STRUCTURE = [
    ...TAB_KEYS.map((td) => ({
      ...td,
      label: t(td.labelKey),
      subs: td.subs?.map((s) => ({ ...s, label: t(s.labelKey) })),
    })),
    ...unmappedTabKeys.map((key) => ({ key, label: key })),
  ];
  const activeTabDef = TAB_STRUCTURE.find((td) => td.key === activeTab);

  const tabCounts = Object.fromEntries(
    TAB_STRUCTURE.map((td) => [td.key, td.key === "All" ? orders.length : td.key === "Ready for Booking" ? readyOrders.length : classified.filter((c) => c.cls.tab === td.key).length])
  );
  const subTabCounts = Object.fromEntries(
    TAB_STRUCTURE.filter((td) => td.subs).flatMap((td) =>
      td.subs.map((s) => [`${td.key}::${s.key}`, classified.filter((c) => c.cls.tab === td.key && c.cls.sub === s.key).length])
    )
  );

  const filtered = classified.filter(({ o, cls }) => {
    const ad = o.agent_data;
    const fullName = `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.toLowerCase();
    const phone = o.customer?.phone || o.shipping_address?.phone || "";
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      (o.name || "").toLowerCase().includes(q) ||
      fullName.includes(q) ||
      phone.includes(search) ||
      (ad.dex_tracking_number || "").toLowerCase().includes(q);
    const matchTab = activeTab === "All" || (cls.tab === activeTab && (!activeSubTab || cls.sub === activeSubTab));
    const matchCourier = courierFilter === "All" || ad.courier_name === courierFilter;
    return matchSearch && matchTab && matchCourier;
  }).map(({ o }) => o).sort((a, b) => extractOrderNum(b) - extractOrderNum(a));

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pagedFiltered = filtered.slice((page - 1) * perPage, page * perPage);

  // "To Ship" tab (Booked + Pickup Failed sub-tabs) ke liye select-all — `filtered` already
  // active tab/sub-tab/search/courier filters respect karta hai.
  const allToShipSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));
  const toggleSelectAllToShip = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allToShipSelected) filtered.forEach((o) => n.delete(o.id));
      else filtered.forEach((o) => n.add(o.id));
      return n;
    });
  };

  // "Ready for Booking" tab ke liye select-all — same pattern jaisa "To Ship" tab ke liye
  // upar hai (koi search/filter is tab pe readyOrders par apply nahi hoti, isliye poora
  // readyOrders hi "currently visible" hai).
  const allReadySelected = readyOrders.length > 0 && readyOrders.every((o) => selectedIds.has(o.id));
  const toggleSelectAllReady = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allReadySelected) readyOrders.forEach((o) => n.delete(o.id));
      else readyOrders.forEach((o) => n.add(o.id));
      return n;
    });
  };

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px", marginBottom: 16 };

  if (error) return <div style={{ padding: "2rem", color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="error" size={16} /> {error}</div>;

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <style>{"@keyframes ne-aging-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="truck" size={17} /> {t("booked.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.store_name} — {filtered.length} {t("booked.shipments")}</p>
        </div>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* Search + Courier Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: "0.6rem", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <Icon name="search" size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ne-muted-2)" }} />
          <input type="text" placeholder={t("booked.searchPlaceholder")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5, boxSizing: "border-box" }} />
        </div>
        <select value={courierFilter} onChange={(e) => { setCourierFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {availableCouriers.map((c) => <option key={c} value={c}>{c === "All" ? t("booked.allCouriers") : c}</option>)}
        </select>
      </div>

      {/* Top-level Tabs — "To Ship"/"Shipped" ke apne nested sub-buckets hain, baaki
          (Delivered/Pending Return/Returned/Lost & Damage/Cancel) standalone hain */}
      <div style={{ display: "flex", gap: 7, marginBottom: activeTabDef?.subs ? 6 : "0.75rem", flexWrap: "wrap" }}>
        {TAB_STRUCTURE.map((tab) => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setActiveSubTab(null); setPage(1); }}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab.key ? "transparent" : "var(--ne-border)",
              background: activeTab === tab.key ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab.key ? "#fff" : "var(--ne-muted)" }}>
            {tab.label}
            <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: activeTab === tab.key ? "rgba(255,255,255,0.22)" : "var(--ne-bg)",
              color: activeTab === tab.key ? "#fff" : "var(--ne-muted-2)" }}>
              {tabCounts[tab.key] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Nested sub-tabs — sirf jab active top-level tab ("To Ship"/"Shipped") ke subs hon */}
      {activeTabDef?.subs && (
        <div style={{ display: "flex", gap: 6, marginBottom: "0.75rem", flexWrap: "wrap", paddingLeft: 10, borderLeft: "2px solid var(--ne-border)" }}>
          <button onClick={() => { setActiveSubTab(null); setPage(1); }}
            style={{ padding: "5px 12px", borderRadius: 16, fontSize: 10.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: !activeSubTab ? "transparent" : "var(--ne-border)",
              background: !activeSubTab ? "var(--ne-accent-soft)" : "var(--ne-surface)",
              color: !activeSubTab ? "var(--ne-accent)" : "var(--ne-muted)" }}>
            {t("booked.allPrefix")} {activeTabDef.label}
            <span style={{ marginLeft: 5, opacity: 0.75 }}>{tabCounts[activeTabDef.key] || 0}</span>
          </button>
          {activeTabDef.subs.map((s) => (
            <button key={s.key} onClick={() => { setActiveSubTab(s.key); setPage(1); }}
              style={{ padding: "5px 12px", borderRadius: 16, fontSize: 10.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
                borderColor: activeSubTab === s.key ? "transparent" : "var(--ne-border)",
                background: activeSubTab === s.key ? "var(--ne-accent-soft)" : "var(--ne-surface)",
                color: activeSubTab === s.key ? "var(--ne-accent)" : "var(--ne-muted)" }}>
              {s.label}
              <span style={{ marginLeft: 5, opacity: 0.75 }}>{subTabCounts[`${activeTabDef.key}::${s.key}`] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {activeTab === "Ready for Booking" ? (
        <div>
          {readyOrders.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 11.5, color: "var(--ne-muted)", cursor: "pointer", width: "fit-content" }}>
              <input type="checkbox" checked={allReadySelected} onChange={toggleSelectAllReady} style={{ cursor: "pointer" }} />
              {t("booked.selectAll")}
            </label>
          )}
          {selectedIds.size > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, padding: "10px 14px", background: "var(--ne-accent-soft)", borderRadius: 10, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--ne-text)", fontWeight: 600 }}>{selectedIds.size} {t("booked.selected")}</span>
              <button onClick={() => setShowBookModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <Icon name="package" size={13} /> {t("booked.bookSelected")}
              </button>
            </div>
          )}
          {readyOrders.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("booked.noReadyOrders")}</div>
          ) : (
            readyOrders.map((o) => {
              const customerName = o._customer_name_override || `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim() || "—";
              const displayTotal = (o._line_items_override && o._line_items_override.length > 0) ? computeOverrideTotal(o._line_items_override) : (Number(o.total_price) || 0);
              const phone = o.customer?.phone || o.shipping_address?.phone || "";
              const address = o.shipping_address ? `${o.shipping_address.address1 || ""}, ${o.shipping_address.city || ""}` : "—";
              const products = (o._line_items_override || o.line_items || []).map((li) => `${li.quantity > 1 ? li.quantity + "x " : ""}${li.title}`).join(" + ") || "—";
              // Staff ka manual SKU override (order_statuses.sku, Orders.jsx ki EditableCell
              // se editable) ko priority — Orders.jsx ka agent_data?.sku || line_items ka
              // exact wahi fallback pattern, yahan _sku_override ke naam se. Har line item
              // apna live SKU (variant_id se products_cache lookup) ke through dikhata hai,
              // stored sku sirf tab jab variant ab products_cache mein hi nahi (deleted/archived).
              const skus = o._sku_override || (o._line_items_override || o.line_items || []).map((li) => `${li.quantity > 1 ? li.quantity : ""}${displaySkuForLineItem(li)}`).join(" + ") || "—";
              const variantNote = (o._line_items_override || o.line_items || [])
                .map((li) => (li.variant_title && li.variant_title !== "Default Title" ? li.variant_title : null))
                .filter(Boolean).join(" + ");
              const dexCheckCity = (o._matched_city || o.shipping_address?.city || o.billing_address?.city || "").trim().toLowerCase();
              const isDexServiceable = !!dexCheckCity && dexServiceableCitySet.has(dexCheckCity);
              const cityLabel = o.shipping_address?.city || o.billing_address?.city || "";
              const createdDate = o.created_at ? new Date(o.created_at).toLocaleDateString("en-GB") : "";
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "stretch", gap: 0, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, marginBottom: 6, boxShadow: "0 2px 8px rgba(0,0,0,.18)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "8px 6px 8px 10px", flexShrink: 0, width: 116, boxSizing: "border-box" }}>
                    <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} style={{ cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ width: 84, minWidth: 84 }}>
                      <span style={{ color: "var(--ne-accent)", fontWeight: 700, fontSize: 11.5 }}>{o.name}</span>
                      <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 2 }}>{createdDate}</div>
                    </div>
                  </div>

                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", overflow: "hidden" }}>
                    <div style={{ width: 118, minWidth: 118 }}>
                      <div style={{ fontSize: 12, color: "var(--ne-text)", fontWeight: 600 }}>{customerName}</div>
                      <div style={{ fontSize: 11, color: phone ? "var(--ne-muted)" : "var(--ne-danger)", fontWeight: phone ? 400 : 700, display: "flex", alignItems: "center", gap: 4 }}>
                        {phone || (<><Icon name="warning" size={11} /> {t("booked.phoneMissing")}</>)}
                      </div>
                      {cityLabel && <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", marginTop: 1 }}>{cityLabel}</div>}
                    </div>
                    <div style={{ width: 190, minWidth: 190 }}>
                      <ReadOnlyAddressChips matched={o._matched_address} />
                      <div style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{address}</div>
                    </div>
                    <div style={{ width: 142, minWidth: 142 }}>
                      <div style={{ fontSize: 11.5, color: "var(--ne-text)" }}>{products}</div>
                      {variantNote && <div style={{ fontSize: 10, color: "var(--ne-muted-2)", marginTop: 1 }}>{variantNote}</div>}
                      <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", marginTop: 2 }}>SKU: {skus}</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>
                      Rs. {displayTotal.toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, padding: "0 10px", flexShrink: 0 }}>
                    <button onClick={() => handleBookSingle(o.id)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                      <Icon name="package" size={14} />
                      {t("booked.book")}
                    </button>
                    {isDexServiceable && (
                      <span title={t("orders.dexRecommendTooltip")}
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 7px", borderRadius: 7, fontSize: 9, fontWeight: 700, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", whiteSpace: "nowrap" }}>
                        📦 {t("orders.dexRecommend")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>
          {t("booked.loading")}{loadingCount > 0 ? ` (${loadingCount} ${t("booked.loaded")})` : "..."}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("booked.noBookedInFilter")}</div>
      ) : (
        <div>
          {activeTab === "To Ship" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 11.5, color: "var(--ne-muted)", cursor: "pointer", width: "fit-content" }}>
              <input type="checkbox" checked={allToShipSelected} onChange={toggleSelectAllToShip} style={{ cursor: "pointer" }} />
              {t("booked.selectAll")}
            </label>
          )}
          {selectedIds.size > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, padding: "10px 14px", background: "var(--ne-accent-soft)", borderRadius: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--ne-text)", fontWeight: 600 }}>{selectedIds.size} {t("booked.selected")}</span>
              <button onClick={handleBulkPrintAwb} disabled={printingAwb}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: printingAwb ? "default" : "pointer", opacity: printingAwb ? 0.7 : 1 }}>
                <Icon name="printer" size={13} /> {printingAwb ? t("booked.printing") : t("booked.printAwb")}
              </button>
              <button onClick={handleBulkPrintEneezamLabel} disabled={printingLabel}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12, fontWeight: 700, cursor: printingLabel ? "default" : "pointer", opacity: printingLabel ? 0.7 : 1 }}>
                <Icon name="printer" size={13} /> {printingLabel ? t("booked.printing") : t("booked.printEneezamLabel")}
              </button>
              {activeTab === "To Ship" && (
                <button onClick={handleBulkCancelBooking} disabled={bulkCancelling}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "1px solid var(--ne-danger)", background: "transparent", color: "var(--ne-danger)", fontSize: 12, fontWeight: 700, cursor: bulkCancelling ? "default" : "pointer", opacity: bulkCancelling ? 0.7 : 1 }}>
                  <Icon name="close" size={13} /> {bulkCancelling ? t("booked.cancelling") : t("booked.cancelSelected")}
                </button>
              )}
              <button onClick={() => setSelectedIds(new Set())} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12, cursor: "pointer" }}>
                {t("booked.clear")}
              </button>
            </div>
          )}
          {pagedFiltered.map((o) => {
            const ad = o.agent_data;
            const bucket = bucketCourierStatus(ad.courier_order_status);
            const finalStatus = bucketFinalStatus(ad.courier_order_status);
            const isSpecialTerminal = finalStatus === "Cancelled" || finalStatus === "Pickup Failed";
            const meta = isSpecialTerminal
              ? { color: "var(--ne-muted)", bg: "var(--ne-muted-soft)" }
              : STATUS_BUCKET_META[bucket] || { color: "var(--ne-muted-2)", bg: "var(--ne-surface)" };
            const fullName = `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim();
            const phone = o.customer?.phone || o.shipping_address?.phone || "";
            const city = o.shipping_address?.city || "";
            const isRemarksOpen = expandedRemarksIds.has(o.id);
            const remarksLog = ad.remarks_log || [];
            const agingDay = computeAgingDay(o);
            const aging = agingDay ? agingMeta(agingDay) : null;
            const cls = classifyTab(o);
            return (
              <div key={o.id} style={{ ...cardStyle, display: "flex", gap: 10 }}>
                <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} style={{ accentColor: "#5C7CFA", marginTop: 4 }} />
                <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <a href={trackingUrl(ad.dex_tracking_number)} target="_blank" rel="noreferrer"
                        style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
                        {o.name}
                      </a>
                      {/* Is page pe har row hi Dex-booked hai (fetchBookedStatuses sirf
                          dex_tracking_number IS NOT NULL rows leta hai) — courier_name to
                          sirf Dex ka last-mile sub-carrier (PK-TRAX/PK-LCS/waghera) batata
                          hai, booking-platform nahi, isliye logo har card pe unconditional */}
                      <img src={dexLogo} alt="Dex" style={{ height: 16, width: "auto", display: "block" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginTop: 3 }}>
                      {fullName || "—"} · {phone || "—"} · {city || "—"}
                      {ad.logistics_status_at ? ` · ${fmtDateTime(ad.logistics_status_at)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {ad.awaiting_shipper_advice && (
                      <button onClick={() => openShipperAdviceModal(o)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "none", background: "var(--ne-danger)", color: "#fff", fontSize: 10.5, fontWeight: 700, cursor: "pointer", animation: "ne-aging-pulse 1.4s ease-in-out infinite" }}>
                        <Icon name="warning" size={11} /> {t("booked.awaitingShipperAdvice")} · {t("booked.adviceDo")}
                      </button>
                    )}
                    {o.isManual && (
                      <span title={t("booked.unmatchedTooltip")} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
                        <Icon name="warning" size={10} /> {t("booked.unmatchedManual")}
                      </span>
                    )}
                    {ad.courier_name && (
                      <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: `${courierColor(ad.courier_name)}26`, color: courierColor(ad.courier_name) }}>
                        {ad.courier_name}
                      </span>
                    )}
                    <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: meta.bg, color: meta.color }}>
                      {ad.courier_order_status || bucket}
                    </span>
                    {ad.delivery_attempt_count > 1 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
                        <Icon name="warning" size={10} /> {ad.delivery_attempt_count} {t("booked.attempts")}
                      </span>
                    )}
                    {aging && (
                      <span style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: `${aging.color}22`, color: aging.color,
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: aging.color, animation: aging.pulse ? "ne-aging-pulse 1.4s ease-in-out infinite" : "none" }} />
                        {t("booked.day")} {agingDay} — {t(aging.labelKey)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Details Grid — hamesha visible, koi toggle/wrapper nahi */}
                <div style={{
                  display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 14,
                  padding: "14px 0", borderTop: "1px solid var(--ne-border)", borderBottom: "1px solid var(--ne-border)", marginTop: 12, marginBottom: 14,
                }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>{t("booked.trackingNo")}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ne-text)", fontFamily: "monospace" }}>{ad.dex_tracking_number || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>{t("booked.status")}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{ad.courier_order_status || bucket}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>{t("booked.amountCod")}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ne-text)" }}>{o.total_price ? `Rs. ${Number(o.total_price).toLocaleString()}` : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>{t("booked.deliveryAttempts")}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ad.delivery_attempt_count > 0 ? "var(--ne-warning)" : "var(--ne-text)" }}>{ad.delivery_attempt_count || 0}</div>
                  </div>
                </div>

                {/* Timeline — hamesha visible, koi toggle/wrapper nahi */}
                <div style={{ marginBottom: 16, overflowX: "auto" }}>
                  <Timeline order={o} />
                </div>

                {ad.latest_fail_reason && (
                  <div style={{ marginBottom: 14, padding: "5px 9px", borderRadius: 8, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="warning" size={12} /> {ad.latest_fail_reason}
                  </div>
                )}

                {/* Remarks box — YEH pura block hamesha visible hai, sirf iske andar ki
                    .remarks-list collapse/expand hoti hai jab header-button click ho.
                    Background/shadow Orders.jsx ke card-style se exact match (dono modes mein). */}
                <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" }}>
                  <button onClick={() => toggleRemarks(o.id)}
                    style={{ background: "none", border: "none", color: "var(--ne-text)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
                    <Icon name="comment" size={14} /> {t("booked.remarks")} <span style={{ fontSize: 10.5, background: "var(--ne-accent)", color: "#fff", padding: "1px 8px", borderRadius: 10 }}>{remarksLog.length}</span>
                  </button>

                  {isRemarksOpen && (
                    <div style={{ marginTop: 12 }}>
                      {remarksLog.map((r, i) => (
                        <div key={i} style={{ background: "var(--ne-surface)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 12 }}>
                          <div style={{ color: "var(--ne-text)" }}>{r.text}</div>
                          <div style={{ fontSize: 10, color: "var(--ne-muted-2)", marginTop: 4 }}>
                            {r.author} · {new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <input type="text" placeholder={t("booked.remarkPlaceholder")}
                          value={remarkDrafts[o.id] || ""}
                          onChange={(e) => setRemarkDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") submitRemark(o); }}
                          style={{ flex: 1, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 8, padding: "9px 12px", color: "var(--ne-text)", fontSize: 12, outline: "none" }} />
                        <button onClick={() => submitRemark(o)} disabled={remarkSubmitting === o.id || !(remarkDrafts[o.id] || "").trim()}
                          style={{ background: "var(--ne-grad)", border: "none", color: "#fff", padding: "9px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: remarkSubmitting === o.id ? "default" : "pointer", whiteSpace: "nowrap" }}>
                          {remarkSubmitting === o.id ? "..." : t("booked.add")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button onClick={() => openTrackingModal(o)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    <Icon name="clock" size={12} />
                    {t("booked.showTracking")}
                  </button>
                  <button onClick={() => printEneezamLabel({ order: o, storeId })}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    <Icon name="printer" size={12} />
                    🏷 {t("booked.printEneezamLabel")}
                  </button>
                  {(cls.tab === "To Ship") && (
                  <button onClick={() => handleCancelBooking(o.id)} disabled={cancellingId === o.id}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-danger)", background: "transparent", color: "var(--ne-danger)", fontSize: 11, fontWeight: 700, cursor: cancellingId === o.id ? "default" : "pointer", opacity: cancellingId === o.id ? 0.7 : 1 }}>
                    {cancellingId === o.id ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        {t("booked.cancelling")}
                      </>
                    ) : (
                      <>
                        <Icon name="close" size={12} />
                        {t("booked.cancelBooking")}
                      </>
                    )}
                  </button>
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination — Orders.jsx wala exact pattern */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
            {t("booked.showing")} {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} {t("booked.of")} {filtered.length}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>‹</button>
            {[...Array(Math.min(5, totalPages))].map((_, idx) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + idx;
              return <button key={p} onClick={() => setPage(p)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === p ? "var(--ne-grad)" : "var(--ne-surface-2)", color: page === p ? "#fff" : "var(--ne-muted)", fontSize: 11, cursor: "pointer", fontWeight: page === p ? 700 : 400 }}>{p}</button>;
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>»</button>
          </div>
        </div>
      )}

      {showBookModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "92vw", padding: "20px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="package" size={14} /> {t("booked.bookShipment")} ({selectedIds.size} {selectedIds.size > 1 ? t("booked.orders") : t("booked.order")})</h3>

            <label style={{ fontSize: 12, color: "var(--ne-muted)", display: "block", marginBottom: 4 }}>{t("booked.courier")}</label>
            <select value={bookCourier} onChange={(e) => setBookCourier(e.target.value)}
              style={{ width: "100%", padding: "9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, marginBottom: 12 }}>
              <option value="dex">Dex</option>
            </select>

            {pickupAddresses.length > 1 && (
              <>
                <label style={{ fontSize: 12, color: "var(--ne-muted)", display: "block", marginBottom: 4 }}>{t("booked.pickupAddress")}</label>
                <select value={bookAddressId} onChange={(e) => setBookAddressId(e.target.value)}
                  style={{ width: "100%", padding: "9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, marginBottom: 12 }}>
                  {pickupAddresses.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </>
            )}

            {bookError && <p style={{ color: "var(--ne-danger)", fontSize: 11, whiteSpace: "pre-wrap", marginBottom: 10 }}>{bookError}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowBookModal(false); setSelectedIds(new Set()); }}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 13, cursor: "pointer" }}>
                {t("action.cancel")}
              </button>
              <button onClick={handleBookConfirm} disabled={booking}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {booking ? t("booked.bookingDots") : t("booked.bookNow")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBookResultModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000001 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", padding: "20px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="package" size={14} /> {t("booked.bookingResult")} ({bookResults.filter((r) => r.success).length}/{bookResults.length} {t("booked.successfulSuffix")})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {bookResults.map((r) => (
                <div key={r.orderId} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${r.success ? "var(--ne-success)" : "var(--ne-danger)"}`, background: r.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{r.orderName}</div>
                  {r.success ? (
                    <div style={{ fontSize: 12, color: "var(--ne-success)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("booked.bookedTrackingPrefix")} {r.trackingNumber}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="close" size={11} /> {r.error}</div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setShowBookResultModal(false)}
              style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {t("booked.close")}
            </button>
          </div>
        </div>
      )}

      {showAwbResultModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000001 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", padding: "20px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="printer" size={14} /> {t("booked.awbPrint")} ({awbResults.filter((r) => r.pdfUrl).length}/{awbResults.length} {t("booked.readySuffix")})
            </h3>

            {mergingPdf && (
              <p style={{ fontSize: 12, color: "var(--ne-muted)", marginBottom: 14 }}>{t("booked.mergingPdf")}</p>
            )}
            {!mergingPdf && mergedPdfUrl && (
              <button onClick={() => window.open(mergedPdfUrl, "_blank")}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
                <Icon name="printer" size={14} /> {t("booked.downloadMergedPdf")} ({awbResults.filter((r) => r.pdfUrl).length} {t("booked.orders")})
              </button>
            )}
            {!mergingPdf && !mergedPdfUrl && awbResults.some((r) => r.pdfUrl) && (
              <p style={{ fontSize: 11.5, color: "var(--ne-warning)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="warning" size={11} /> {t("booked.mergeFailedFallback")}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {awbResults.map((r) => (
                <div key={r.orderId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, border: `1px solid ${r.pdfUrl ? "var(--ne-border)" : "var(--ne-danger)"}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{r.orderName}</div>
                    {!r.pdfUrl && <div style={{ fontSize: 12, color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="close" size={11} /> {r.error}</div>}
                  </div>
                  {r.pdfUrl && !mergedPdfUrl && (
                    <button onClick={() => window.open(r.pdfUrl, "_blank")}
                      style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                      {t("booked.openAwb")}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => { setShowAwbResultModal(false); setMergedPdfUrl(null); }}
              style={{ width: "100%", padding: "10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 13, cursor: "pointer" }}>
              {t("booked.close")}
            </button>
          </div>
        </div>
      )}

      {showBulkCancelResultModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000001 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", padding: "20px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="close" size={14} /> {t("booked.bulkCancelResult")} ({bulkCancelResults.filter((r) => r.success).length}/{bulkCancelResults.length} {t("booked.successfulSuffix")})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {bulkCancelResults.map((r) => (
                <div key={r.orderId} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${r.success ? "var(--ne-success)" : "var(--ne-danger)"}`, background: r.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>{r.orderName}</div>
                  {r.success ? (
                    <div style={{ fontSize: 12, color: "var(--ne-success)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="check" size={11} /> {t("booked.cancelSuccessful")}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="close" size={11} /> {r.error}</div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setShowBulkCancelResultModal(false)}
              style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {t("booked.close")}
            </button>
          </div>
        </div>
      )}

      {showCancelResultModal && cancelResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000001 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 360, maxWidth: "92vw", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}>
              {cancelResult.success ? (<><Icon name="check" size={14} /> {t("booked.cancelSuccessful")}</>) : (<><Icon name="close" size={14} /> {t("booked.cancelFailed")}</>)}
            </h3>
            <p style={{ fontSize: 12.5, color: cancelResult.success ? "var(--ne-success)" : "var(--ne-danger)", marginBottom: 16 }}>
              {cancelResult.success ? t("booked.cancelledMessage") : cancelResult.error}
            </p>
            <button onClick={() => setShowCancelResultModal(false)}
              style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {t("booked.close")}
            </button>
          </div>
        </div>
      )}

      {shipperAdviceModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 400, maxWidth: "92vw", padding: "20px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="warning" size={14} /> {shipperAdviceModal.name} — {t("booked.shipperAdviceModalTitle")}
            </h3>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <label style={{
                flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${adviceFeedbackType === "REATTEMPT" ? "var(--ne-accent)" : "var(--ne-border)"}`,
                background: adviceFeedbackType === "REATTEMPT" ? "var(--ne-accent-soft)" : "transparent",
              }}>
                <input type="radio" name="adviceFeedbackType" checked={adviceFeedbackType === "REATTEMPT"} onChange={() => setAdviceFeedbackType("REATTEMPT")} />
                <span style={{ fontSize: 12.5, color: "var(--ne-text)", fontWeight: 600 }}>{t("booked.reattemptDelivery")}</span>
              </label>
              <label style={{
                flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${adviceFeedbackType === "RETURN" ? "var(--ne-accent)" : "var(--ne-border)"}`,
                background: adviceFeedbackType === "RETURN" ? "var(--ne-accent-soft)" : "transparent",
              }}>
                <input type="radio" name="adviceFeedbackType" checked={adviceFeedbackType === "RETURN"} onChange={() => setAdviceFeedbackType("RETURN")} />
                <span style={{ fontSize: 12.5, color: "var(--ne-text)", fontWeight: 600 }}>{t("booked.returnPackage")}</span>
              </label>
            </div>

            {adviceFeedbackType === "REATTEMPT" && (
              <>
                <label style={{ fontSize: 12, color: "var(--ne-muted)", display: "block", marginBottom: 4 }}>{t("booked.reattemptDateLabel")}</label>
                <input type="date" value={adviceReattemptDate} min={tomorrowDateString()}
                  onChange={(e) => setAdviceReattemptDate(e.target.value)}
                  style={{ width: "100%", padding: "9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, marginBottom: 12 }} />
              </>
            )}

            <label style={{ fontSize: 12, color: "var(--ne-muted)", display: "block", marginBottom: 4 }}>{t("booked.sellerNoteLabel")}</label>
            <textarea value={adviceSellerNote} onChange={(e) => setAdviceSellerNote(e.target.value)} placeholder={t("booked.sellerNotePlaceholder")} rows={3}
              style={{ width: "100%", padding: "9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, marginBottom: 12, resize: "vertical", fontFamily: "inherit" }} />

            {adviceError && <p style={{ color: "var(--ne-danger)", fontSize: 11, whiteSpace: "pre-wrap", marginBottom: 10 }}>{adviceError}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShipperAdviceModal(null)} disabled={submittingAdvice}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 13, cursor: "pointer" }}>
                {t("action.cancel")}
              </button>
              <button onClick={handleSubmitShipperAdvice} disabled={submittingAdvice}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: submittingAdvice ? "default" : "pointer", opacity: submittingAdvice ? 0.7 : 1 }}>
                {submittingAdvice ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    {t("booked.submittingAdvice")}
                  </>
                ) : t("booked.submitAdvice")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdviceSuccessModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000001 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 360, maxWidth: "92vw", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="check" size={14} /> {t("booked.adviceSuccessTitle")}
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--ne-success)", marginBottom: 16 }}>
              {t("booked.adviceSuccessMessage")}
            </p>
            <button onClick={() => setShowAdviceSuccessModal(false)}
              style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {t("booked.close")}
            </button>
          </div>
        </div>
      )}

      {showTrackingModal && (
        <div onClick={() => setShowTrackingModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000002 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: "90vw", height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--ne-border)", flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="clock" size={14} /> {showTrackingModal.name} — {t("booked.trackingModalTitle")}
              </h3>
              <button onClick={() => setShowTrackingModal(null)}
                style={{ background: "none", border: "none", color: "var(--ne-muted)", cursor: "pointer", padding: 4, display: "flex" }}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
              {trackingLoading ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("booked.loading")}</div>
              ) : trackingError ? (
                <p style={{ color: "var(--ne-danger)", fontSize: 12.5, padding: "1rem 0" }}>{trackingError}</p>
              ) : trackingEvents.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted-2)", fontSize: 12.5 }}>{t("booked.trackingEmpty")}</div>
              ) : (
                [...trackingEvents].reverse().map((ev, i, arr) => {
                  const bucket = bucketCourierStatus(ev.courier_order_status);
                  const meta = STATUS_BUCKET_META[bucket] || { color: "var(--ne-muted-2)", bg: "var(--ne-surface)" };
                  const photoUrls = normalizePhotoUrls(ev.photos, ev.epod);
                  return (
                    <div key={ev.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--ne-border)" : "none" }}>
                      <div style={{ width: 108, minWidth: 108 }} title={fmtDateTime(ev.event_time)}>
                        <div style={{ fontSize: 11, color: "var(--ne-text)", fontWeight: 600 }}>{timeAgo(ev.event_time)}</div>
                        <div style={{ fontSize: 9.5, color: "var(--ne-muted-2)" }}>{fmtDateTime(ev.event_time)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, background: meta.bg, color: meta.color }}>
                            {ev.courier_order_status || humanizeRawStatus(ev.raw_status)}
                          </span>
                          {ev.location && (
                            <span style={{ fontSize: 11, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                              <Icon name="pin" size={10} /> {ev.location}
                            </span>
                          )}
                        </div>
                        {ev.driver_name && (
                          <div style={{ fontSize: 11, color: "var(--ne-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                            <Icon name="truck" size={10} /> {ev.driver_name}
                            {ev.driver_phone && (
                              <a href={`tel:${ev.driver_phone}`} style={{ color: "var(--ne-accent)", textDecoration: "none" }}>{ev.driver_phone}</a>
                            )}
                          </div>
                        )}
                        {photoUrls.length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            {photoUrls.map((url, pi) => (
                              <img key={pi} src={url} alt="" onClick={() => window.open(url, "_blank")}
                                style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", cursor: "pointer", border: "1px solid var(--ne-border)" }} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
