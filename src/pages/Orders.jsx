import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "../supabase";
import dexLogo from "../assets/couriers/dex.png";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const TAB_KEYS = {
  All: "orders.tab.all",
  New: "orders.tab.new",
  Approved: "orders.tab.approved",
  Pending: "orders.tab.pending",
  "Ready to Sync": "orders.tab.readyToSync",
  Cancelled: "orders.tab.cancelled",
};

const STATUSES = [
  { label: "Approved", color: "#34D88E", bg: "#11402A" },
  { label: "Under Verification", color: "#F2A83E", bg: "#3A2A0D" },
  { label: "Cancelled", color: "#F26D6D", bg: "#3A1414" },
  { label: "Not Answering", color: "#FB923C", bg: "#3A2410" },
  { label: "Powered Off", color: "#F472B6", bg: "#3A1130" },
  { label: "Hold", color: "#8C93C4", bg: "#161B45" },
  { label: "Busy", color: "#5C7CFA", bg: "#1C2356" },
  { label: "FAKE Order", color: "#F26D6D", bg: "#2A0E0E" },
  { label: "No WhatsApp", color: "#8C93C4", bg: "#1A1E40" },
  { label: "Callback Scheduled", color: "#A855F7", bg: "#26134A" },
  { label: "Wrong Number", color: "#F06FA8", bg: "#330F2A" },
];

const SOURCE_COLORS = { Meta: "#5C7CFA", TikTok: "#F472B6", Snapchat: "#F2A83E", Google: "#34D88E", Direct: "#8C93C4" };
const PER_PAGE_OPTIONS = [20, 50, 100];
const TABS = ["All", "New", "Approved", "Pending", "Ready to Sync", "Cancelled"];
const CANCEL_REASONS = ["Not Interested", "Wrong Number", "Duplicate Order", "Customer Cancelled", "Out of Stock", "Other"];
const PAGE_SIZE = 1000;
const MIDDLE_CONTENT_WIDTH = 885; // Customer+Address+Items+Pricing(incl. Total row)+Source+Courier+Remarks + gaps — single source of truth so header/rows/scrollbar always match
const SYNC_CONFIRM_PER_PAGE = 20;
const HISTORY_VALID_MS = 2 * 24 * 60 * 60 * 1000; // 2 din
const BULK_PREVIEW_PER_PAGE = 20;

// Pure helper — order ki current sync state nikalta hai (module-level taake
// tabFilter aur render dono use kar sakein)
const getSyncState = (order) => {
  if (!order.synced_at && !order.last_edited_at) return "never";
  if (!order.synced_at && order.last_edited_at) return "pending";
  if (order.last_edited_at && order.synced_at && new Date(order.last_edited_at) > new Date(order.synced_at)) return "pending";
  return "synced";
};

const tabFilter = (tab, o) => {
  if (tab === "New") return !o.agent_status;
  if (tab === "Approved") return o.agent_status === "Approved";
  if (tab === "Pending") return !!(o.agent_status && o.agent_status !== "Approved" && o.agent_status !== "Cancelled");
  if (tab === "Ready to Sync") return getSyncState(o) === "pending";
  if (tab === "Cancelled") return o.agent_status === "Cancelled";
  return true;
};

const truncate = (str, max = 25) => {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
};

// Pakistani phone numbers ko hamesha 03xxxxxxxxx (local) format mein convert karta hai,
// chahe original +92xxxxxxxxxx, 0092xxxxxxxxxx, ya 92xxxxxxxxxx format mein ho
const normalizePhone = (raw) => {
  if (!raw) return "";
  let cleaned = String(raw).trim().replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+92")) cleaned = "0" + cleaned.slice(3);
  else if (cleaned.startsWith("0092")) cleaned = "0" + cleaned.slice(4);
  else if (cleaned.startsWith("92") && cleaned.length === 12) cleaned = "0" + cleaned.slice(2);
  return cleaned;
};

// normalizePhone() ka output local format mein hota hai (0-prefixed, jaise 03001234567) —
// wa.me links ko country-code ke sath, bina + ya leading-zero ke chahiye (923001234567)
const toWhatsAppPhone = (localPhone) => {
  if (!localPhone) return "";
  const digits = String(localPhone).replace(/\D/g, "");
  return digits.startsWith("0") ? "92" + digits.slice(1) : digits;
};

const getDateRange = (type) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (type === "today") return { from: today, to: new Date(today.getTime() + 86400000 - 1) };
  if (type === "yesterday") {
    const y = new Date(today.getTime() - 86400000);
    return { from: y, to: new Date(y.getTime() + 86400000 - 1) };
  }
  if (type === "7days") return { from: new Date(today.getTime() - 6 * 86400000), to: new Date(today.getTime() + 86400000 - 1) };
  return null;
};

// Format a local Date as YYYY-MM-DD without UTC conversion
const toLocalDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const isHistoryValid = (h) => !!(h && h.created_at && (Date.now() - new Date(h.created_at).getTime()) < HISTORY_VALID_MS);

const addressChipStyle = { padding: "2px 8px", borderRadius: 6, fontSize: 10.5, background: "var(--ne-surface)", color: "var(--ne-text)", fontWeight: 600, whiteSpace: "nowrap" };
const addressChipMutedStyle = { ...addressChipStyle, color: "var(--ne-muted-2)", fontWeight: 500, fontStyle: "italic" };
const addressBadgeBase = { padding: "2px 8px", borderRadius: 10, fontSize: 9.5, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 };
const addressMiniSelectStyle = { padding: "5px 7px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11 };
const addressSmallBtnPrimary = { padding: "5px 12px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 };
const addressSmallBtnSecondary = { padding: "5px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 };

// address_reference 11,000+ rows tak ja sakta hai — Supabase/PostgREST per-request row
// cap (is project mein 1000, jaisa DevMonitor/ProductsManagement/InventoryManagement
// mein already handle kiya gaya hai) se upar wale rows silently drop ho jate the, is
// liye Province dropdown mein sirf 5 provinces dikh rahe the. Yahan poora table
// paginate karke fetch karte hain phir distinct nikaalte hain — sirf province ke liye
// nahi, City/Area/SubArea ke liye bhi (same class ka bug kahin bhi lag sakta tha).
const ADDRESS_REF_PAGE_SIZE = 1000;
async function fetchDistinctAddressValues(column, filters) {
  let all = [];
  let from = 0;
  while (true) {
    let query = supabase.from("address_reference").select(column).order(column).range(from, from + ADDRESS_REF_PAGE_SIZE - 1);
    for (const [col, val] of Object.entries(filters || {})) query = query.eq(col, val);
    const { data, error } = await query;
    if (error || !data) break;
    all = all.concat(data);
    if (data.length < ADDRESS_REF_PAGE_SIZE) break;
    from += ADDRESS_REF_PAGE_SIZE;
  }
  return [...new Set(all.map((r) => r[column]))].filter(Boolean);
}

// Plain <select> Area/SubArea ke 11,000+ possible values ke sath unusable hai — yeh
// lightweight text-filter combobox koi naya npm dependency add kiye bina wahi kaam
// deta hai: type karo, list filter hoti hai, click se select ho jata hai.
function SearchableCombo({ value, options, placeholder, onSelect, loading, t }) {
  const [query, setQuery] = useState(value || "");
  const filtered = (query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options).slice(0, 300);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder}
        style={{ ...addressMiniSelectStyle, width: 150, boxSizing: "border-box" }} />
      <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 10000, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 7, marginTop: 2, maxHeight: 220, overflowY: "auto", minWidth: 170, boxShadow: "0 8px 30px rgba(0,0,0,.4)" }}>
        {loading ? (
          <div style={{ padding: "6px 9px", fontSize: 11, color: "var(--ne-muted-2)" }}>{t("orders.comboLoading")}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "6px 9px", fontSize: 11, color: "var(--ne-muted-2)" }}>{t("orders.comboNoMatches")}</div>
        ) : filtered.map((opt) => (
          <div key={opt} onClick={() => onSelect(opt)}
            style={{ padding: "6px 9px", fontSize: 11, cursor: "pointer", color: "var(--ne-text)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ne-accent-soft)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
}

// Order card/row ke neeche full-width "Address Match" block — apni khud ki
// local state rakhta hai (har order-row ki apni instance), parent se sirf
// order/storeId/cfUrl/t + agent_data-update callbacks leta hai. Sync-to-Shopify ab
// is block ka apna button nahi hai — confirm hote hi last_edited_at bump ho jata hai
// (onAddressConfirmed ke through), jo order ko parent ke existing "Ready to Sync"
// tab/flow (doSyncOrder/buildSyncPlan) mein khud-ba-khud le aata hai.
function AddressMatchBlock({ order, storeId, cfUrl, t, onUpdateAgentData, onAddressConfirmed }) {
  const ad = order.agent_data || {};
  const source = ad.address_match_source || null;
  const confirmed = !!ad.address_confirmed_at;

  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [preview, setPreview] = useState(ad.address_match_preview || "");
  const [confirming, setConfirming] = useState(false);
  const [editingChip, setEditingChip] = useState(null); // null | "province" | "city" | "area" | "subarea"
  const [chipLoading, setChipLoading] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [areas, setAreas] = useState([]);
  const [subareas, setSubareas] = useState([]);
  const [selProvince, setSelProvince] = useState(ad.matched_province || "");
  const [selCity, setSelCity] = useState(ad.matched_city || "");
  const [selArea, setSelArea] = useState(ad.matched_area || "");
  const [selSubarea, setSelSubarea] = useState(ad.matched_subarea || "");

  // Chips selProvince/selCity/selArea/selSubarea se render hote hain (ad.matched_* se
  // seedha nahi) taake inline-edit turant chip mein dikhe. Isay useEffect se prop ke
  // sath sync nahi karte (set-state-in-effect / cascading-render risk) — jahan bhi
  // ad.matched_* badalta hai woh hamesha isi component ke kisi action (handleMatch,
  // chip select, Save Mapping) se hota hai, is liye wahi action selX ko bhi seedha set
  // kar deta hai.
  useEffect(() => {
    if (!editingChip) return;
    const handleClick = (e) => {
      if (!e.target.closest("[data-address-chip-editor]")) setEditingChip(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingChip]);

  const handleMatch = async () => {
    setMatching(true);
    setMatchError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/match-order-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: storeId, order_id: order.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setMatchError(data.error || "Match address fail hui");
        setMatching(false);
        return;
      }
      onUpdateAgentData(order.id, {
        matched_province: data.province,
        matched_city: data.city,
        matched_area: data.area,
        matched_subarea: data.subarea,
        address_match_source: data.source,
        address_match_confidence: data.confidence,
        address_match_preview: data.formatted_address,
      });
      setSelProvince(data.province || "");
      setSelCity(data.city || "");
      setSelArea(data.area || "");
      setSelSubarea(data.subarea || "");
      setPreview(data.formatted_address || "");
    } catch (err) {
      setMatchError(err.message);
    }
    setMatching(false);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setMatchError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/confirm-order-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          order_id: order.id,
          final_address: preview,
          matched_province: selProvince || null,
          matched_city: selCity || null,
          matched_area: selArea || null,
          matched_subarea: selSubarea || null,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setMatchError(data.error || "Confirm fail hui");
        setConfirming(false);
        return;
      }
      const prevAddress = ad.address || order.shipping_address?.address1 || order.billing_address?.address1 || "";
      onUpdateAgentData(order.id, {
        matched_province: selProvince || null,
        matched_city: selCity || null,
        matched_area: selArea || null,
        matched_subarea: selSubarea || null,
        address: preview,
        address_confirmed_at: new Date().toISOString(),
      });
      if (onAddressConfirmed) onAddressConfirmed(order.id, prevAddress !== preview ? prevAddress : null);
    } catch (err) {
      setMatchError(err.message);
    }
    setConfirming(false);
  };

  const openChip = async (level) => {
    setEditingChip(level);
    setChipLoading(true);
    if (level === "province") {
      setProvinces(await fetchDistinctAddressValues("province", {}));
    } else if (level === "city") {
      setCities(await fetchDistinctAddressValues("city", { province: selProvince }));
    } else if (level === "area") {
      setAreas(await fetchDistinctAddressValues("area", { province: selProvince, city: selCity }));
    } else if (level === "subarea") {
      setSubareas(await fetchDistinctAddressValues("subarea", { province: selProvince, city: selCity, area: selArea }));
    }
    setChipLoading(false);
  };

  const selectChipValue = (level, value) => {
    if (level === "province") {
      setSelProvince(value); setSelCity(""); setSelArea(""); setSelSubarea("");
      setCities([]); setAreas([]); setSubareas([]);
    } else if (level === "city") {
      setSelCity(value); setSelArea(""); setSelSubarea("");
      setAreas([]); setSubareas([]);
    } else if (level === "area") {
      setSelArea(value); setSelSubarea("");
      setSubareas([]);
    } else if (level === "subarea") {
      setSelSubarea(value);
    }
    setEditingChip(null);
  };

  const handleSaveMapping = () => {
    onUpdateAgentData(order.id, {
      matched_province: selProvince || null,
      matched_city: selCity || null,
      matched_area: selArea || null,
      matched_subarea: selSubarea || null,
    });
    const rebuilt = [ad.address || order.shipping_address?.address1 || order.billing_address?.address1 || "", selArea, selSubarea, selCity, selProvince]
      .filter(Boolean).join(", ");
    setPreview(rebuilt);
  };

  const chipOptionsFor = { province: provinces, city: cities, area: areas, subarea: subareas };
  const chipPlaceholderFor = {
    province: t("orders.addressSelectProvince"),
    city: t("orders.addressSelectCity"),
    area: t("orders.addressSelectArea"),
    subarea: t("orders.addressSelectSubarea"),
  };
  const chipEmptyLabelFor = { province: "—", city: "—", area: t("orders.addressSelectArea"), subarea: t("orders.addressSelectSubarea") };

  const renderChip = (level, value, enabled) => {
    if (editingChip === level) {
      return (
        <span data-address-chip-editor style={{ display: "inline-block" }}>
          <SearchableCombo t={t} value={value} options={chipOptionsFor[level]} placeholder={chipPlaceholderFor[level]}
            loading={chipLoading} onSelect={(v) => selectChipValue(level, v)} />
        </span>
      );
    }
    const muted = !value;
    return (
      <span onClick={() => enabled && openChip(level)}
        style={{ ...(muted ? addressChipMutedStyle : addressChipStyle), cursor: enabled ? "pointer" : "default" }}>
        {value || chipEmptyLabelFor[level]}
      </span>
    );
  };

  if (!source) {
    return (
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ne-border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>{t("orders.addressMatchNotYet")}</span>
        <button onClick={handleMatch} disabled={matching} style={{ ...addressSmallBtnPrimary, cursor: matching ? "default" : "pointer" }}>
          <Icon name={matching ? "pending" : "search"} size={11} /> {matching ? t("orders.addressMatching") : t("orders.addressMatchButton")}
        </button>
        {matchError && <span style={{ color: "var(--ne-danger)", fontSize: 11 }}>{matchError}</span>}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: "var(--ne-muted-2)", fontWeight: 700 }}>{t("orders.addressMatchLabel")}:</span>
        {renderChip("province", selProvince, true)}
        <span style={{ color: "var(--ne-muted-2)", fontSize: 10 }}>›</span>
        {renderChip("city", selCity, !!selProvince)}
        <span style={{ color: "var(--ne-muted-2)", fontSize: 10 }}>›</span>
        {renderChip("area", selArea, !!selCity)}
        <span style={{ color: "var(--ne-muted-2)", fontSize: 10 }}>›</span>
        {renderChip("subarea", selSubarea, !!selArea)}
        {!confirmed && source === "system" && (
          <span style={{ ...addressBadgeBase, background: "var(--ne-success-soft)", color: "var(--ne-success)" }}>
            <Icon name="check" size={9} /> {t("orders.addressSystemMatched")}
          </span>
        )}
        {!confirmed && source === "ai" && (
          <span style={{ ...addressBadgeBase, background: "var(--ne-accent-soft)", color: "var(--ne-accent)" }}>
            ✨ {t("orders.addressAiMatched")}
          </span>
        )}
        {!confirmed && source === "manual_review" && (
          <span style={{ ...addressBadgeBase, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
            ⚠ {t("orders.addressManualReview")}
          </span>
        )}
        {!confirmed && source === "system_partial" && (
          <span style={{ ...addressBadgeBase, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
            ⚠ {t("orders.addressPartialMatch")}
          </span>
        )}
        {confirmed && (
          <span style={{ ...addressBadgeBase, background: "var(--ne-success-soft)", color: "var(--ne-success)" }}>
            <Icon name="check" size={9} /> {t("orders.addressConfirmed")}
          </span>
        )}
      </div>

      {!confirmed && (
        <div>
          <label style={{ fontSize: 10, color: "var(--ne-muted-2)", display: "block", marginBottom: 3 }}>{t("orders.addressPreviewLabel")}</label>
          <textarea rows={2} value={preview} onChange={(e) => setPreview(e.target.value)}
            style={{ width: "100%", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11.5, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
        </div>
      )}

      {!confirmed && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleSaveMapping} style={addressSmallBtnSecondary}>{t("orders.addressSaveMapping")}</button>
          <button onClick={handleConfirm} disabled={confirming} style={{ ...addressSmallBtnPrimary, cursor: confirming ? "default" : "pointer" }}>
            {confirming ? t("orders.addressConfirming") : ((selArea && selSubarea) ? t("orders.addressAccept") : t("orders.addressSetManually"))}
          </button>
          {matchError && <span style={{ color: "var(--ne-danger)", fontSize: 11 }}>{matchError}</span>}
        </div>
      )}
    </div>
  );
}

export default function Orders({ ordersData, setOrdersData, ordersLoaded, setOrdersLoaded, ordersStore, setOrdersStore, cfUrl }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const orders = ordersData;
  const setOrders = setOrdersData;
  const [loading, setLoading] = useState(!ordersLoaded);
  const [store, setStore] = useState(ordersStore);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState([]);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [cityFilter, setCityFilter] = useState("All");
  const [skuFilter, setSkuFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeDateBtn, setActiveDateBtn] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [statusDropdown, setStatusDropdown] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [statusMultiOpen, setStatusMultiOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [cancelReasonModal, setCancelReasonModal] = useState(null);
  const [cancelReasonOtherMode, setCancelReasonOtherMode] = useState(false);
  const [cancelReasonCustomText, setCancelReasonCustomText] = useState("");
  const tableRef = useRef(null);

  // Column-header row (desktop) + filters/search/tab-nav block (both layouts) collapse
  // on scroll-down and reappear on scroll-up, to maximize visible order-card space —
  // driven by the same vertical-scroll container (tableRef) mobile card list and
  // desktop table body both use (mutually exclusive, never both mounted at once).
  //
  // Root cause of the earlier flicker: the collapsing header row lived INSIDE this same
  // scrollable container. Collapsing it shrinks the container's scrollHeight; if the
  // user was scrolled far enough down, the browser then auto-clamps scrollTop to the
  // new (smaller) max — and that clamp itself fires a native 'scroll' event. This
  // handler read that clamp as "user scrolled up" and un-hid the header, which grew
  // scrollHeight back and could trigger another clamp, etc. — a self-triggered loop
  // with no further user input needed. Fixed by suppressing scroll-driven decisions for
  // a short window right after WE flip the state (covers the collapse/expand transition
  // + the clamp it can cause), so only genuine user scrolling changes the state.
  const [listHeaderHidden, setListHeaderHidden] = useState(false);
  const lastScrollTopRef = useRef(0);
  const suppressUntilRef = useRef(0);
  const handleListScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    if (Date.now() < suppressUntilRef.current) {
      lastScrollTopRef.current = top;
      return;
    }
    const last = lastScrollTopRef.current;
    if (Math.abs(top - last) > 8) {
      const shouldHide = top > last && top > 40;
      if (shouldHide !== listHeaderHidden) suppressUntilRef.current = Date.now() + 400;
      setListHeaderHidden(shouldHide);
      lastScrollTopRef.current = top;
    }
  };

  // --- Sync / Undo / History state ---
  const [historyMap, setHistoryMap] = useState({});
  const [syncConfirmModal, setSyncConfirmModal] = useState(null); // { items: [{order, diff}] }
  const [syncConfirmPage, setSyncConfirmPage] = useState(1);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgressCount, setSyncProgressCount] = useState(0);
  const [syncResultModal, setSyncResultModal] = useState(null); // { title, results: [{id,name,success,error}] }
  const [undoConfirmModal, setUndoConfirmModal] = useState(null); // { orders: [...] }
  const [undoRunning, setUndoRunning] = useState(false);
  const [undoingId, setUndoingId] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const middleRefs = useRef({});
  const isSyncingScroll = useRef(false);
  const undoInFlightRef = useRef(new Set()); // order ids jinke liye undo abhi process ho raha hai — double-click race guard
  const billingFallbackSavedRef = useRef(new Set()); // order ids jinke liye billing-fallback address/city already persist ho chuki (ek dafa hi trigger ho, dobara na ho)

  // --- Current user profile (activity log ke user_name/user_id ke liye) ---
  const [currentProfile, setCurrentProfile] = useState(null);

  // --- Create New Order (TASK 10) ---
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({ name: "", phone: "", address: "", city: "", product: "", sku: "", price: "" });
  const [newOrderCreateOnShopify, setNewOrderCreateOnShopify] = useState(false);
  const [newOrderSaving, setNewOrderSaving] = useState(false);
  const [newOrderError, setNewOrderError] = useState("");

  // --- Bulk Order Upload (TASK 11) ---
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkPage, setBulkPage] = useState(1);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkResult, setBulkResult] = useState(null); // { success, fail }
  const fileInputRef = useRef(null);

  // --- Order Items editor (line_items_override) ---
  const [itemsModal, setItemsModal] = useState(null); // order being edited, or null
  const [itemsList, setItemsList] = useState([]); // working array of { shopify_product_id, variant_id, title, variant_title, sku, price, quantity, discount }
  const [itemsListInitial, setItemsListInitial] = useState([]); // snapshot of itemsList as it was when the modal opened, for change-detection on save
  const [itemsSearch, setItemsSearch] = useState("");
  const [itemsSearchResults, setItemsSearchResults] = useState([]); // [{ product, variant }]
  const [itemsSaving, setItemsSaving] = useState(false);
  const [itemsSyncState, setItemsSyncState] = useState(null); // null | "syncing" | "synced" | "error" | "skipped-fulfilled"
  const [itemsSyncError, setItemsSyncError] = useState("");
  const [productsForSearch, setProductsForSearch] = useState([]); // products_cache rows for this store, fetched when modal opens

  const registerMiddleRef = (key) => (el) => {
    if (el) middleRefs.current[key] = el;
    else delete middleRefs.current[key];
  };

  const handleMiddleScroll = (key) => (e) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const val = e.target.scrollLeft;
    Object.entries(middleRefs.current).forEach(([k, el]) => {
      if (el && k !== key) el.scrollLeft = val;
    });
    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  useEffect(() => {
    if (!ordersLoaded) loadStore();
  }, []);

  // Activity log entries ke liye current user ka naam/id ek dafa fetch kar lo
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user.id).single();
      setCurrentProfile(data || null);
    })();
  }, []);

  const logActivity = async (actionType, orderId, details) => {
    const storeData = store || ordersStore;
    if (!currentProfile || !storeData) return;
    await supabase.from("activity_log").insert({
      store_id: storeData.id,
      user_id: currentProfile.id,
      user_name: currentProfile.full_name || currentProfile.email,
      action_type: actionType,
      order_id: orderId ? String(orderId) : null,
      details: details || null,
    });
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest("[data-status-dropdown]") && !e.target.closest("[data-order-btn]")) {
        setStatusDropdown(null);
      }
      if (!e.target.closest("[data-cancel-modal]")) {
        setCancelReasonModal(null);
        setCancelReasonOtherMode(false);
        setCancelReasonCustomText("");
      }
      if (!e.target.closest("[data-status-multi]")) setStatusMultiOpen(false);
      if (!e.target.closest("[data-bulk-status]")) setBulkStatusOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const loadStore = async () => {
    const { data } = await supabase.from("stores").select("*").limit(1).single();
    if (data) {
      setStore(data);
      setOrdersStore(data);
      fetchOrders(data);
    } else {
      setError(t("orders.storeConnectFirst"));
      setLoading(false);
    }
  };

  const fetchAllCachedOrders = async (storeId) => {
    let allRows = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("shopify_orders_cache")
        .select("raw_data")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data.map(r => r.raw_data));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allRows;
  };

  const fetchAllOrderStatuses = async () => {
    let allRows = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("*")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allRows;
  };

  const fetchAllSyncHistory = async () => {
    let allRows = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("order_sync_history")
        .select("*")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allRows;
  };

  const fetchOrders = async (storeData) => {
    setLoading(true);
    try {
      const cachedOrders = await fetchAllCachedOrders(storeData.id);
      const statuses = await fetchAllOrderStatuses();
      const history = await fetchAllSyncHistory();
      const statusMap = {};
      statuses.forEach(s => { statusMap[s.order_id] = s; });
      const hMap = {};
      history.forEach(h => { hMap[h.order_id] = h; });
      setHistoryMap(hMap);
      const merged = cachedOrders.map(o => ({
        ...o,
        agent_data: statusMap[String(o.id)] || {},
        agent_status: statusMap[String(o.id)]?.status || null,
        synced_at: statusMap[String(o.id)]?.synced_at || null,
        last_edited_at: statusMap[String(o.id)]?.last_edited_at || null,
      }));
      setOrders(merged);
      setOrdersLoaded(true);
    } catch (err) {
      setError(`${t("orders.errorPrefix")} ${err.message}`);
    }
    setLoading(false);
  };

  const getSource = (order) => {
    const ref = order.referring_site || "";
    if (ref.includes("facebook") || ref.includes("meta") || ref.includes("fb")) return "Meta";
    if (ref.includes("tiktok")) return "TikTok";
    if (ref.includes("snapchat")) return "Snapchat";
    if (ref.includes("google")) return "Google";
    return "Direct";
  };

  const getSKUs = (order) => {
    return order.line_items?.flatMap(i => {
      const sku = i.sku || "";
      return sku.split(/[+,]/).map(s => s.replace(/^\d+/, "").trim()).filter(Boolean);
    }) || [];
  };

  // Sirf tab snapshot lete hain jab koi existing valid snapshot na ho —
  // taake yeh hamesha "edit se PEHLE" wali asal value capture kare,
  // sync ke waqt ki nahi (warna undo edited value hi wapas la deta hai)
  const ensureHistorySnapshot = async (order) => {
    const existing = historyMap[String(order.id)];
    if (isHistoryValid(existing)) return;
    const now = new Date().toISOString();
    const snapshot = {
      previous_shipping_address: order.shipping_address || null,
      previous_phone: order.shipping_address?.phone || order.customer?.phone || null,
      previous_agent_data: order.agent_data || {},
      previous_status: order.agent_status || null,
      created_at: now,
    };
    await supabase.from("order_sync_history").upsert(
      { order_id: String(order.id), ...snapshot },
      { onConflict: "order_id" }
    );
    setHistoryMap(prev => ({ ...prev, [String(order.id)]: snapshot }));
  };

  const updateStatus = async (orderId, status) => {
    const orderForSnapshot = orders.find(o => o.id === orderId);
    if (orderForSnapshot) await ensureHistorySnapshot(orderForSnapshot);
    const now = new Date().toISOString();
    const { error } = await supabase.from("order_statuses").upsert(
      { order_id: String(orderId), store_id: ordersStore?.id, status, updated_at: now, last_edited_at: now },
      { onConflict: "order_id" }
    );
    if (!error) {
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const agentData = status !== "Cancelled"
          ? { ...o.agent_data, cancellation_reason: null }
          : o.agent_data;
        return { ...o, agent_status: status, last_edited_at: now, agent_data: agentData };
      }));
      logActivity("status_change", orderId, { status });
      if (status === "Cancelled") {
        setCancelReasonModal(orderId);
        setCancelReasonOtherMode(false);
        setCancelReasonCustomText("");
      }
    }
    setStatusDropdown(null);
  };

  const updateCancellationReason = async (orderId, reason) => {
    const orderForSnapshot = orders.find(o => o.id === orderId);
    if (orderForSnapshot) await ensureHistorySnapshot(orderForSnapshot);
    const now = new Date().toISOString();
    await supabase.from("order_statuses").upsert(
      { order_id: String(orderId), cancellation_reason: reason, updated_at: now },
      { onConflict: "order_id" }
    );
    setOrders(prev => prev.map(o => o.id === orderId
      ? { ...o, agent_data: { ...o.agent_data, cancellation_reason: reason } }
      : o
    ));
  };

  const updateField = async (orderId, field, value) => {
    const orderForSnapshot = orders.find(o => o.id === orderId);
    if (orderForSnapshot) await ensureHistorySnapshot(orderForSnapshot);
    const existing = orders.find(o => o.id === orderId)?.agent_data || {};
    // Phone field hamesha normalize karke save hota hai (03xxxxxxxxx format)
    const finalValue = field === "phone" ? normalizePhone(value) : value;
    const updated = { ...existing, [field]: finalValue };
    const now = new Date().toISOString();
    const { error } = await supabase.from("order_statuses").upsert({
      order_id: String(orderId),
      status: orders.find(o => o.id === orderId)?.agent_status || null,
      customer_name: updated.customer_name || null,
      phone: updated.phone || null,
      address: updated.address || null,
      city: updated.city || null,
      discount: updated.discount || null,
      notes: updated.notes || null,
      product: updated.product || null,
      sku: updated.sku || null,
      shipping: updated.shipping || null,
      remarks: updated.remarks || null,
      cancellation_reason: updated.cancellation_reason || null,
      updated_at: now,
      last_edited_at: now,
    }, { onConflict: "order_id" });
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, agent_data: updated, last_edited_at: now } : o));
      logActivity("field_edit", orderId, { field, value: finalValue });
    }
    setEditingCell(null);
  };

  // Display-time billing_address fallback (address/city/phone computed per-row below) ko ek
  // dafa order_statuses mein persist kar dete hain, taake agli baar seedha agent_data se mil
  // jaye. Note: jaan-boojh kar updateField() reuse nahi kiya — jab yeh fields ek sath billing
  // se aati hain (aam case, jab shipping_address bilkul missing ho), alag-alag updateField()
  // calls mein baad wali call ki stale "existing" lookup pehli call ki value ko clobber kar
  // deti (upsert onConflict:order_id, sab ek hi row target karte hain). Isliye saari fields ek
  // hi atomic upsert mein set karte hain — same table/shape/on_conflict jo updateField khud
  // use karta hai, bas ek call mein. Yeh bhi ek automatic system backfill hai (staff ka manual
  // edit nahi), isliye ensureHistorySnapshot/logActivity jaan-boojh kar skip kiye —
  // undo-history/activity-log mein isay staff-edit ki tarah dikhana galat hota.
  useEffect(() => {
    orders.forEach((order) => {
      if (billingFallbackSavedRef.current.has(order.id)) return;
      const agentData = order.agent_data || {};
      const shippingAddr = order.shipping_address || {};
      const billingAddr = order.billing_address || {};
      const addressFromBilling = !agentData.address && !shippingAddr.address1 && !!billingAddr.address1;
      const cityFromBilling = !agentData.city && !shippingAddr.city && !!billingAddr.city;
      const phoneFromBilling = !agentData.phone && !order.customer?.phone && !shippingAddr.phone && !!billingAddr.phone;
      if (!addressFromBilling && !cityFromBilling && !phoneFromBilling) return;
      billingFallbackSavedRef.current.add(order.id);
      const finalAddress = addressFromBilling ? billingAddr.address1 : (agentData.address || null);
      const finalCity = cityFromBilling ? billingAddr.city : (agentData.city || null);
      const finalPhone = phoneFromBilling ? normalizePhone(billingAddr.phone) : (agentData.phone || null);
      const now = new Date().toISOString();
      supabase.from("order_statuses").upsert({
        order_id: String(order.id),
        status: order.agent_status || null,
        customer_name: agentData.customer_name || null,
        phone: finalPhone,
        address: finalAddress,
        city: finalCity,
        discount: agentData.discount || null,
        notes: agentData.notes || null,
        product: agentData.product || null,
        sku: agentData.sku || null,
        shipping: agentData.shipping || null,
        remarks: agentData.remarks || null,
        cancellation_reason: agentData.cancellation_reason || null,
        updated_at: now,
        last_edited_at: now,
      }, { onConflict: "order_id" }).then(({ error }) => {
        if (!error) {
          setOrders(prev => prev.map(o => o.id === order.id
            ? { ...o, agent_data: { ...agentData, address: finalAddress, city: finalCity, phone: finalPhone }, last_edited_at: now }
            : o));
        } else {
          billingFallbackSavedRef.current.delete(order.id);
        }
      });
    });
  }, [orders]);

  // ---------- SYNC PLAN / DIFF ----------
  const buildSyncPlan = (order) => {
    const agentData = order.agent_data || {};
    const customerName = agentData.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
    const phoneToSync = normalizePhone(agentData.phone || order.customer?.phone || order.shipping_address?.phone || "");
    const nameParts = customerName.split(" ").filter(Boolean);
    // Jo naam Neezam mein likha jaye, usay literally respect karte hain
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "-";
    const addressPayload = {
      first_name: firstName,
      last_name: lastName,
      address1: agentData.address || order.shipping_address?.address1 || "",
      city: agentData.city || order.shipping_address?.city || "",
      phone: phoneToSync,
      country: "Pakistan",
      country_code: "PK",
      zip: order.shipping_address?.zip || order.billing_address?.zip || "00000",
      province: order.shipping_address?.province || order.billing_address?.province || undefined,
    };

    const beforeName = `${order.shipping_address?.first_name || ""} ${order.shipping_address?.last_name || ""}`.trim() || "—";
    const beforePhone = normalizePhone(order.shipping_address?.phone || order.customer?.phone || "") || "—";
    const beforeAddress = order.shipping_address?.address1 || "—";
    const beforeCity = order.shipping_address?.city || "—";

    const afterName = `${firstName} ${lastName}`.trim() || "—";
    const afterPhone = phoneToSync || "—";
    const afterAddress = addressPayload.address1 || "—";
    const afterCity = addressPayload.city || "—";

    const diff = [];
    if (beforeName !== afterName) diff.push({ label: "Name", before: beforeName, after: afterName });
    if (beforePhone !== afterPhone) diff.push({ label: "Phone", before: beforePhone, after: afterPhone });
    if (beforeAddress !== afterAddress) diff.push({ label: "Address", before: beforeAddress, after: afterAddress });
    if (beforeCity !== afterCity) diff.push({ label: "City", before: beforeCity, after: afterCity });

    return { addressPayload, phoneToSync, diff };
  };

  const doSyncOrder = async (order) => {
    const storeData = store || ordersStore;
    if (!storeData) return { id: order.id, name: order.name, success: false, error: t("orders.storeNotConnected") };
    const { addressPayload, phoneToSync } = buildSyncPlan(order);
    try {
      await ensureHistorySnapshot(order);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/shopify-update-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          shop: storeData.shopify_url,
          token: storeData.api_token,
          orderId: order.id,
          updates: { shipping_address: addressPayload, phone: phoneToSync },
        }),
      });
      const data = await res.json();
      if (!data.errors && !data.error) {
        const now = new Date().toISOString();
        await supabase.from("order_statuses").upsert(
          { order_id: String(order.id), synced_at: now, updated_at: now },
          { onConflict: "order_id" }
        );
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, synced_at: now } : o));
        logActivity("sync", order.id, { name: order.name });
        return { id: order.id, name: order.name, success: true };
      }
      return { id: order.id, name: order.name, success: false, error: JSON.stringify(data.errors || data.error) };
    } catch (err) {
      return { id: order.id, name: order.name, success: false, error: err.message };
    }
  };

  const openSyncConfirm = (ordersToSync) => {
    if (!ordersToSync.length) return;
    const items = ordersToSync.map(order => ({ order, ...buildSyncPlan(order) }));
    setSyncConfirmModal({ items });
    setSyncConfirmPage(1);
  };

  const confirmAndSync = async () => {
    if (!syncConfirmModal) return;
    setSyncRunning(true);
    setSyncProgressCount(0);
    const results = [];
    for (const item of syncConfirmModal.items) {
      const r = await doSyncOrder(item.order);
      results.push(r);
      setSyncProgressCount(results.length);
    }
    setSyncRunning(false);
    setSyncConfirmModal(null);
    setSelectedIds(new Set());
    setSyncResultModal({ title: t("orders.syncResultTitle"), results });
  };

  // ---------- UNDO ----------
  const doUndoOrder = async (order) => {
    const storeData = store || ordersStore;
    const h = historyMap[String(order.id)];
    if (!storeData || !isHistoryValid(h)) {
      return { id: order.id, name: order.name, success: false, error: t("orders.noValidHistoryForUndo") };
    }
    // Isi order ke liye pehle se ek undo chal raha ho to dobara start na karo
    // (do baar jaldi-jaldi click hone par historyMap/order_sync_history do baar consume na ho)
    if (undoInFlightRef.current.has(order.id)) {
      return { id: order.id, name: order.name, success: false, error: t("orders.undoAlreadyProcessing") };
    }
    undoInFlightRef.current.add(order.id);
    try {
      const prevAddr = h.previous_shipping_address || {};
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/shopify-update-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          shop: storeData.shopify_url,
          token: storeData.api_token,
          orderId: order.id,
          updates: {
            shipping_address: {
              first_name: prevAddr.first_name || "",
              last_name: prevAddr.last_name || "-",
              address1: prevAddr.address1 || "",
              city: prevAddr.city || "",
              phone: h.previous_phone || "",
            },
            phone: h.previous_phone || "",
          },
        }),
      });
      const data = await res.json();
      if (!data.errors && !data.error) {
        const prevAgent = h.previous_agent_data || {};
        await supabase.from("order_statuses").upsert({
          order_id: String(order.id),
          status: h.previous_status || null,
          customer_name: prevAgent.customer_name || null,
          phone: prevAgent.phone || null,
          address: prevAgent.address || null,
          city: prevAgent.city || null,
          discount: prevAgent.discount || null,
          notes: prevAgent.notes || null,
          product: prevAgent.product || null,
          sku: prevAgent.sku || null,
          shipping: prevAgent.shipping || null,
          remarks: prevAgent.remarks || null,
          cancellation_reason: prevAgent.cancellation_reason || null,
          synced_at: null,
          last_edited_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "order_id" });
        await supabase.from("order_sync_history").delete().eq("order_id", String(order.id));
        // Shopify ko jo shipping_address/phone bheja gaya, wahi local state mein bhi set karo —
        // agent_data ke empty hone par UI address/city/phone isi raw shipping_address pe fallback karti hai,
        // aur is fallback ka Shopify webhook/realtime ke aane ka wait karna hi "purani value UI mein reh jaana" bug ki wajah tha
        setOrders(prev => prev.map(o => o.id === order.id
          ? {
              ...o,
              agent_data: prevAgent,
              agent_status: h.previous_status || null,
              synced_at: null,
              last_edited_at: null,
              shipping_address: {
                ...(o.shipping_address || {}),
                first_name: prevAddr.first_name || "",
                last_name: prevAddr.last_name || "-",
                address1: prevAddr.address1 || "",
                city: prevAddr.city || "",
                phone: h.previous_phone || "",
              },
            }
          : o
        ));
        setHistoryMap(prev => {
          const next = { ...prev };
          delete next[String(order.id)];
          return next;
        });
        logActivity("undo", order.id, { name: order.name });
        return { id: order.id, name: order.name, success: true };
      }
      return { id: order.id, name: order.name, success: false, error: JSON.stringify(data.errors || data.error) };
    } catch (err) {
      return { id: order.id, name: order.name, success: false, error: err.message };
    } finally {
      undoInFlightRef.current.delete(order.id);
    }
  };

  const openUndoConfirm = (ordersToUndo) => {
    const valid = ordersToUndo.filter(o => isHistoryValid(historyMap[String(o.id)]));
    if (!valid.length) return;
    setUndoConfirmModal({ orders: valid });
  };

  const confirmUndo = async () => {
    if (!undoConfirmModal) return;
    setUndoRunning(true);
    const results = [];
    for (const order of undoConfirmModal.orders) {
      setUndoingId(order.id);
      const r = await doUndoOrder(order);
      results.push(r);
    }
    setUndoingId(null);
    setUndoRunning(false);
    setUndoConfirmModal(null);
    setSelectedIds(new Set());
    setSyncResultModal({ title: t("orders.undoResultTitle"), results });
  };

  // ---------- CREATE NEW ORDER (TASK 10) ----------
  const resetNewOrderForm = () => {
    setNewOrderForm({ name: "", phone: "", address: "", city: "", product: "", sku: "", price: "" });
    setNewOrderCreateOnShopify(false);
    setNewOrderError("");
  };

  const mergeRawOrderIntoState = (rawOrder) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === rawOrder.id);
      const merged = { ...rawOrder, agent_data: {}, agent_status: null, synced_at: null, last_edited_at: null };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = merged;
        return next;
      }
      return [merged, ...prev];
    });
  };

  const createNewOrder = async (e) => {
    e.preventDefault();
    setNewOrderError("");
    const storeData = store || ordersStore;
    if (!storeData) { setNewOrderError(t("orders.storeNotConnected")); return; }
    if (!newOrderForm.name.trim() || !newOrderForm.phone.trim()) {
      setNewOrderError(t("orders.nameAndPhoneRequired"));
      return;
    }
    setNewOrderSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          store_id: storeData.id,
          create_on_shopify: newOrderCreateOnShopify,
          customer_name: newOrderForm.name.trim(),
          phone: newOrderForm.phone.trim(),
          address: newOrderForm.address.trim(),
          city: newOrderForm.city.trim(),
          product: newOrderForm.product.trim(),
          sku: newOrderForm.sku.trim(),
          price: newOrderForm.price,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setNewOrderError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        setNewOrderSaving(false);
        return;
      }
      mergeRawOrderIntoState(data.order);
      setShowNewOrderModal(false);
      resetNewOrderForm();
    } catch (err) {
      setNewOrderError(err.message);
    }
    setNewOrderSaving(false);
  };

  // ---------- BULK ORDER UPLOAD (TASK 11) ----------
  const downloadCsvTemplate = () => {
    const csv = "Name,Phone,Address,City,Product,SKU,Price\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neezam_bulk_order_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data
          .map(r => ({
            name: (r.Name || r.name || "").trim(),
            phone: (r.Phone || r.phone || "").trim(),
            address: (r.Address || r.address || "").trim(),
            city: (r.City || r.city || "").trim(),
            product: (r.Product || r.product || "").trim(),
            sku: (r.SKU || r.sku || "").trim(),
            price: (r.Price || r.price || "0").toString().trim(),
          }))
          .filter(r => r.name && r.phone);
        setBulkRows(rows);
        setBulkPage(1);
        setBulkResult(null);
      },
    });
    e.target.value = "";
  };

  const confirmBulkImport = async () => {
    const storeData = store || ordersStore;
    if (!storeData || !bulkRows.length) return;
    setBulkImporting(true);
    setBulkProgress(0);
    const { data: { session } } = await supabase.auth.getSession();
    let successCount = 0, failCount = 0;
    const created = [];
    for (const row of bulkRows) {
      try {
        const res = await fetch(`${cfUrl}/create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            store_id: storeData.id,
            create_on_shopify: false,
            customer_name: row.name,
            phone: row.phone,
            address: row.address,
            city: row.city,
            product: row.product,
            sku: row.sku,
            price: row.price,
          }),
        });
        const data = await res.json();
        if (data.error) failCount++;
        else { successCount++; created.push(data.order); }
      } catch {
        failCount++;
      }
      setBulkProgress(p => p + 1);
    }
    created.forEach(mergeRawOrderIntoState);
    setBulkImporting(false);
    setBulkResult({ success: successCount, fail: failCount });
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkRows([]);
    setBulkPage(1);
    setBulkResult(null);
  };

  const bulkUpdateStatus = async (status) => {
    const now = new Date().toISOString();
    const ids = [...selectedIds];
    for (const orderId of ids) {
      await supabase.from("order_statuses").upsert(
        { order_id: String(orderId), store_id: ordersStore?.id, status, updated_at: now, last_edited_at: now },
        { onConflict: "order_id" }
      );
    }
    setOrders(prev => prev.map(o => selectedIds.has(o.id) ? { ...o, agent_status: status, last_edited_at: now } : o));
    setBulkStatusOpen(false);
    setSelectedIds(new Set());
  };

  const handleStatusBtnClick = (e, orderId) => {
    if (statusDropdown === orderId) { setStatusDropdown(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownHeight = 290;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < dropdownHeight;
    setDropdownPos({
      top: showAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 185),
    });
    setStatusDropdown(orderId);
  };

  const handleDateBtn = (type) => {
    if (activeDateBtn === type) {
      setActiveDateBtn(null);
      setDateFrom("");
      setDateTo("");
      return;
    }
    setActiveDateBtn(type);
    const range = getDateRange(type);
    if (range) {
      setDateFrom(toLocalDateStr(range.from));
      setDateTo(toLocalDateStr(range.to));
    }
    setPage(1);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedOrders.map(o => o.id)));
    }
  };

  const currentStore = store || ordersStore;

  const updateAgentDataPatch = (orderId, patch) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, agent_data: { ...(o.agent_data || {}), ...patch } } : o)));
  };

  // Address Match confirm ke baad: (a) last_edited_at bump karo taake order khud-ba-khud
  // parent ke existing "Ready to Sync" flow (getSyncState/doSyncOrder) mein aa jaye — is
  // block ka apna alag Sync-to-Shopify button ab nahi hai, isi mechanism se hona chahiye —
  // aur (b) agar address text waqai badla hai, transient "Was: ..." + highlight-fade
  // dikhao (purely visual, auto-clears once the CSS fade ends).
  const [addressFlash, setAddressFlash] = useState({});
  const handleAddressConfirmed = (orderId, prevAddress) => {
    const now = new Date().toISOString();
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, last_edited_at: now } : o)));
    if (!prevAddress) return;
    setAddressFlash((prev) => ({ ...prev, [orderId]: prevAddress }));
    setTimeout(() => {
      setAddressFlash((prev) => {
        const rest = { ...prev };
        delete rest[orderId];
        return rest;
      });
    }, 1600);
  };

  const computeOverrideTotal = (items) => (items || []).reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0) - (Number(it.discount) || 0), 0);

  const openItemsModal = (order) => {
    const override = order.agent_data?.line_items_override;
    const initial = override && override.length > 0
      ? override.map(it => ({ ...it }))
      : (order.line_items || []).map(i => ({
          shopify_product_id: i.product_id ? String(i.product_id) : null,
          variant_id: i.variant_id ? String(i.variant_id) : null,
          title: i.title || "",
          variant_title: i.variant_title && i.variant_title !== "Default Title" ? i.variant_title : "",
          sku: i.sku || "",
          price: i.price || "0",
          quantity: i.quantity || 1,
          discount: 0,
        }));
    setItemsModal(order);
    setItemsList(initial);
    setItemsListInitial(initial.map(it => ({ ...it })));
    setItemsSearch("");
    setItemsSearchResults([]);
    setItemsSyncState(null);
    setItemsSyncError("");
  };

  const closeItemsModal = () => {
    setItemsModal(null);
    setItemsList([]);
    setItemsListInitial([]);
    setItemsSearch("");
    setItemsSearchResults([]);
    setItemsSyncState(null);
    setItemsSyncError("");
  };

  // Discount/price/quantity yahan mixed string/number types se aa sakte hain (input
  // onChange raw string deta hai, initial load number deta hai) — comparison ke liye
  // sabko Number() se normalize karte hain taake "0" vs 0 jaisa false-positive change na bane.
  const normalizeItemForCompare = (it) => ({
    shopify_product_id: it.shopify_product_id ?? null,
    variant_id: it.variant_id ?? null,
    title: it.title || "",
    variant_title: it.variant_title || "",
    sku: it.sku || "",
    price: Number(it.price) || 0,
    quantity: Number(it.quantity) || 0,
    discount: Number(it.discount) || 0,
  });

  const itemsListChanged = (a, b) => {
    if (a.length !== b.length) return true;
    return JSON.stringify(a.map(normalizeItemForCompare)) !== JSON.stringify(b.map(normalizeItemForCompare));
  };

  const updateItemField = (idx, field, value) => {
    setItemsList(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const removeItem = (idx) => {
    setItemsList(prev => prev.filter((_, i) => i !== idx));
  };

  const addItemFromSearch = (product, variant) => {
    setItemsList(prev => [...prev, {
      shopify_product_id: product.shopify_product_id,
      variant_id: variant.id ? String(variant.id) : null,
      title: product.raw_data?.title || "",
      variant_title: variant.title && variant.title !== "Default Title" ? variant.title : "",
      sku: variant.sku || "",
      price: variant.price || "0",
      quantity: 1,
      discount: 0,
    }]);
    setItemsSearch("");
    setItemsSearchResults([]);
  };

  const saveItemsModal = async () => {
    if (!itemsModal) return;
    setItemsSaving(true);
    setItemsSyncState(null);
    setItemsSyncError("");
    const now = new Date().toISOString();
    const { error } = await supabase.from("order_statuses").upsert({
      order_id: String(itemsModal.id),
      line_items_override: itemsList,
      updated_at: now,
    }, { onConflict: "order_id" });
    if (error) {
      setItemsSaving(false);
      setItemsSyncState("error");
      setItemsSyncError(error.message);
      return;
    }
    setOrders(prev => prev.map(o => (o.id === itemsModal.id ? { ...o, agent_data: { ...(o.agent_data || {}), line_items_override: itemsList }, last_edited_at: now } : o)));

    // Kuch bhi actually badla nahi (same items/quantities/discounts jitne modal open
    // hote waqt the) to Shopify sync ki koi zaroorat nahi — local save ho chuka, bas
    // modal band karo, koi error/message nahi dikhani.
    if (!itemsListChanged(itemsList, itemsListInitial)) {
      setItemsSaving(false);
      closeItemsModal();
      return;
    }

    // Shopify Order Edit API sirf UNFULFILLED orders edit karne deta hai — Dex booking ho
    // chuki ho (tracking number set) to Shopify sync skip karo, sirf eNeezam-side override
    // (Dex re-booking reference ke liye) save rehne do.
    if (itemsModal.agent_data?.dex_tracking_number) {
      setItemsSyncState("skipped-fulfilled");
      setItemsSaving(false);
      return;
    }

    setItemsSyncState("syncing");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/shopify-order-edit-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: currentStore?.id, order_id: itemsModal.id, line_items_override: itemsList }),
      });
      const data = await res.json();
      if (data.success) {
        setItemsSyncState("synced");
      } else {
        setItemsSyncState("error");
        setItemsSyncError(data.error || "Unknown error");
      }
    } catch (err) {
      setItemsSyncState("error");
      setItemsSyncError(err.message);
    }
    setItemsSaving(false);
  };

  useEffect(() => {
    if (!itemsModal || !currentStore?.id) return;
    supabase.from("products_cache").select("*").eq("store_id", currentStore.id)
      .then(({ data, error }) => { if (!error) setProductsForSearch(data || []); });
  }, [itemsModal, currentStore?.id]);

  useEffect(() => {
    const q = itemsSearch.trim().toLowerCase();
    const handle = setTimeout(() => {
      if (!q) { setItemsSearchResults([]); return; }
      const results = [];
      productsForSearch.forEach((p) => {
        const title = (p.raw_data?.title || "").toLowerCase();
        (p.raw_data?.variants || []).forEach((v) => {
          const sku = (v.sku || "").toLowerCase();
          if (title.includes(q) || sku.includes(q)) results.push({ product: p, variant: v });
        });
      });
      setItemsSearchResults(results.slice(0, 20));
    }, 300);
    return () => clearTimeout(handle);
  }, [itemsSearch, productsForSearch]);

  // Step 1: date range only — source of truth for tab counts
  const dateFilteredOrders = orders.filter(order => {
    const orderDate = new Date(order.created_at);
    const matchFrom = !dateFrom || orderDate >= new Date(dateFrom + "T00:00:00");
    const matchTo = !dateTo || orderDate <= new Date(dateTo + "T23:59:59");
    return matchFrom && matchTo;
  });

  const tabCounts = Object.fromEntries(TABS.map(t => [t, t === "All" ? dateFilteredOrders.length : dateFilteredOrders.filter(o => tabFilter(t, o)).length]));

  const baseFilteredOrders = dateFilteredOrders.filter(order => {
    const name = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.toLowerCase();
    const phone = order.customer?.phone || order.shipping_address?.phone || "";
    const orderNum = order.name || "";
    const matchSearch = !search || name.includes(search.toLowerCase()) || phone.includes(search) || orderNum.includes(search);
    const matchSource = sourceFilter === "All" || getSource(order) === sourceFilter;
    const matchTab = activeTab === "All" || tabFilter(activeTab, order);
    return matchSearch && matchSource && matchTab;
  });

  const availableCities = ["All", ...new Set(baseFilteredOrders.map(o => o.agent_data?.city || o.shipping_address?.city).filter(Boolean))].sort();
  const availableSKUs = [...new Set(baseFilteredOrders.flatMap(o => getSKUs(o)))].filter(Boolean).sort();

  const filteredOrders = baseFilteredOrders.filter(order => {
    const orderCity = order.agent_data?.city || order.shipping_address?.city || "";
    const matchStatus = statusFilters.length === 0 || statusFilters.includes(order.agent_status);
    const matchCity = cityFilter === "All" || orderCity === cityFilter;
    const matchSku = skuFilter === "All" || getSKUs(order).includes(skuFilter);
    return matchStatus && matchCity && matchSku;
  });

  const tabFilteredOrders = filteredOrders;
  const totalPages = Math.ceil(filteredOrders.length / perPage);
  const pagedOrders = filteredOrders.slice((page - 1) * perPage, page * perPage);

  const todayCount = orders.filter(o => {
    const r = getDateRange("today");
    return new Date(o.created_at) >= r.from && new Date(o.created_at) <= r.to;
  }).length;

  const yesterdayCount = orders.filter(o => {
    const r = getDateRange("yesterday");
    return new Date(o.created_at) >= r.from && new Date(o.created_at) <= r.to;
  }).length;

  const last7Count = orders.filter(o => {
    const r = getDateRange("7days");
    return new Date(o.created_at) >= r.from && new Date(o.created_at) <= r.to;
  }).length;

  const selectedHaveValidHistory = [...selectedIds].some(id => isHistoryValid(historyMap[String(id)]));

  const EditableCell = ({ orderId, field, value, width = 100, multiline = false, clampLines = 2, displayStyle }) => {
    const cellKey = `${orderId}-${field}`;
    const isEditing = editingCell === cellKey;
    const [val, setVal] = useState(value || "");
    useEffect(() => { setVal(value || ""); }, [value]);

    if (isEditing) return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width }}>
        {multiline ? (
          <textarea autoFocus value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setEditingCell(null); }}
            rows={3}
            style={{ width: "100%", padding: "4px 6px", borderRadius: 5, border: "1px solid var(--ne-accent)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
        ) : (
          <input autoFocus value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") updateField(orderId, field, val); if (e.key === "Escape") setEditingCell(null); }}
            style={{ width: "100%", padding: "3px 6px", borderRadius: 5, border: "1px solid var(--ne-accent)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11, boxSizing: "border-box", outline: "none" }} />
        )}
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <button onClick={() => updateField(orderId, field, val)}
            style={{ background: "var(--ne-grad)", border: "none", borderRadius: 5, color: "#fff", padding: "2px 8px", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center" }}><Icon name="check" size={9} /></button>
          <button onClick={() => setEditingCell(null)}
            style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 5, color: "var(--ne-text)", padding: "2px 8px", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center" }}><Icon name="close" size={9} /></button>
        </div>
      </div>
    );

    return (
      <span onClick={() => setEditingCell(cellKey)} title={value || ""}
        style={{ cursor: "pointer", color: value ? "var(--ne-text)" : "var(--ne-muted-2)", fontSize: 11, display: "-webkit-box", WebkitLineClamp: clampLines, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", wordBreak: "break-word", lineHeight: 1.35, maxWidth: width, ...displayStyle }}>
        {value || "—"}
      </span>
    );
  };

  // Itemized product display with a "+N more items" collapse — falls back to the
  // plain EditableCell (freeform text) whenever there's a manual override, while
  // editing, or when there just aren't more than 2 items to collapse.
  const ProductsCell = ({ orderId, value, items, variantNote, hasManualOverride, width, multiline, clampLines }) => {
    const cellKey = `${orderId}-product`;
    const isEditing = editingCell === cellKey;
    const [expanded, setExpanded] = useState(false);

    if (isEditing || hasManualOverride || items.length <= 2) {
      return (
        <div>
          <EditableCell orderId={orderId} field="product" value={value} width={width} multiline={multiline} clampLines={clampLines} />
          {variantNote && <div style={{ fontSize: 10, color: "var(--ne-muted-2)", marginTop: 2 }}>{variantNote}</div>}
        </div>
      );
    }

    const shown = expanded ? items : items.slice(0, 2);
    const remaining = items.length - 2;

    return (
      <div onClick={() => setEditingCell(cellKey)} style={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: width, cursor: "pointer" }}>
        {shown.map((it, idx) => (
          <div key={idx} style={{ fontSize: 11, color: "var(--ne-text)", wordBreak: "break-word", lineHeight: 1.35 }}>
            {it.quantity > 1 ? `${it.quantity}x ` : ""}{it.title}
            {it.variant_title && it.variant_title !== "Default Title" && (
              <span style={{ color: "var(--ne-muted-2)" }}> ({it.variant_title})</span>
            )}
          </div>
        ))}
        <span onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          style={{ fontSize: 10, color: "var(--ne-accent)", cursor: "pointer", fontWeight: 700, alignSelf: "flex-start" }}>
          {expanded ? t("orders.itemsShowLess") : `+${remaining} ${t("orders.itemsMoreSuffix")}`}
        </span>
      </div>
    );
  };

  if (error) return <div style={{ padding: "2rem", color: "var(--ne-danger)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="error" size={16} /> {error}</div>;

  const tdBase = { padding: "7px 6px", verticalAlign: "top" };
  const thBase = { padding: "7px 6px", textAlign: "left", color: "var(--ne-muted)", whiteSpace: "nowrap", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--ne-border)", background: "var(--ne-surface-2)" };
  const dateBtnStyle = (type) => ({
    padding: "5px 12px", borderRadius: 18, fontSize: 11, cursor: "pointer", fontWeight: 600, border: "1px solid",
    background: activeDateBtn === type ? "var(--ne-grad)" : "var(--ne-surface-2)",
    color: activeDateBtn === type ? "#fff" : "var(--ne-muted)",
    borderColor: activeDateBtn === type ? "transparent" : "var(--ne-border)",
  });

  // ---------- Sync Confirm Modal pagination ----------
  const syncConfirmItems = syncConfirmModal?.items || [];
  const syncConfirmTotalPages = Math.ceil(syncConfirmItems.length / SYNC_CONFIRM_PER_PAGE) || 1;
  const syncConfirmPagedItems = syncConfirmItems.slice(
    (syncConfirmPage - 1) * SYNC_CONFIRM_PER_PAGE,
    syncConfirmPage * SYNC_CONFIRM_PER_PAGE
  );

  const orderRows = pagedOrders.map((order) => {
    const source = getSource(order);
    const status = STATUSES.find(s => s.label === order.agent_status);
    const phone = normalizePhone(order.agent_data?.phone || order.customer?.phone || order.shipping_address?.phone || order.billing_address?.phone || "");
    const fullName = order.agent_data?.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
    const city = order.agent_data?.city || order.shipping_address?.city || order.billing_address?.city || "";
    const address = order.agent_data?.address || order.shipping_address?.address1 || order.billing_address?.address1 || "";
    const itemsOverride = order.agent_data?.line_items_override;
    const productsEditable = order.agent_data?.product
      || (itemsOverride?.length > 0 ? itemsOverride.map(i => `${i.quantity > 1 ? i.quantity + "x " : ""}${i.title}`).join(" + ") : null)
      || order.line_items?.map(i => `${i.quantity > 1 ? i.quantity + "x " : ""}${i.title}`).join(" + ") || "—";
    const productVariantNote = !order.agent_data?.product
      ? (itemsOverride?.length > 0
          ? itemsOverride.map(i => i.variant_title || null).filter(Boolean).join(" + ")
          : order.line_items?.map(i => i.variant_title && i.variant_title !== "Default Title" ? i.variant_title : null).filter(Boolean).join(" + "))
      : "";
    const items = (itemsOverride?.length > 0 ? itemsOverride : order.line_items || [])
      .map(i => ({ title: i.title, variant_title: i.variant_title, quantity: i.quantity }));
    const wasAddress = addressFlash[order.id];
    const displayTotal = itemsOverride?.length > 0 ? computeOverrideTotal(itemsOverride) : (Number(order.total_price) || 0);
    const skus = order.agent_data?.sku || order.line_items?.map(i => `${i.quantity > 1 ? i.quantity : ""}${i.sku || ""}`).join(" + ") || "—";
    const unitPrices = (order.agent_data?.line_items_override || order.line_items)?.map(i => i.price).join(" + ") || "—";
    const shipping = order.agent_data?.shipping || order.total_shipping_price_set?.presentment_money?.amount || "0";
    const discount = order.agent_data?.discount || order.total_discounts || "0";
    const remarks = order.agent_data?.remarks || "";
    const cancellationReason = order.agent_data?.cancellation_reason || "";
    const waPhone = toWhatsAppPhone(phone);
    const waMessage = `Assalam-o-Alaikum ${fullName},\n\nAapka order confirm karna hai:\nOrder #: ${(order.name || "").replace("#", "")}\nProducts: ${productsEditable}\nTotal Amount: Rs. ${order.total_price || "0"}\nAddress: ${address}, ${city}\n\nOrder confirm karne ke liye "1" reply karein.\nCancel karna ho to "2" reply karein.\n\nMeherbani karke apna address bhi verify kar dein — agar koi ghalti ho to bata dein.\n\nShukriya!`;
    const date = new Date(order.created_at).toLocaleDateString("en-PK");
    const time = new Date(order.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
    const shopifyUrl = `https://${currentStore?.shopify_url}/admin/orders/${order.id}`;
    const syncState = getSyncState(order);
    const isSelected = selectedIds.has(order.id);
    const isCancelled = order.agent_status === "Cancelled";
    const hasValidHistory = isHistoryValid(historyMap[String(order.id)]);
    const isUndoing = undoingId === order.id;
    const isExpanded = expandedIds.has(order.id);

    const sb = syncState === "pending" ? { bg: "var(--ne-warning-soft)", color: "var(--ne-warning)", label: t("orders.tab.readyToSync"), icon: "zap" }
      : syncState === "synced" ? { bg: "var(--ne-success-soft)", color: "var(--ne-success)", label: t("orders.syncedLabel"), icon: "check" }
      : { bg: "var(--ne-surface-2)", color: "var(--ne-muted-2)", label: t("orders.syncLabel"), icon: null };

    const statusBtn = (
      <button data-order-btn={order.id} onClick={(e) => handleStatusBtnClick(e, order.id)}
        style={{ padding: "3px 9px", borderRadius: 8, fontSize: 10, background: status?.bg || "var(--ne-surface-2)", color: status?.color || "var(--ne-muted-2)", border: "none", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
        {order.agent_status || `${t("orders.setStatus")} ▼`}
      </button>
    );
    const syncRow = (
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button onClick={() => openSyncConfirm([order])}
          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 9, background: sb.bg, color: sb.color, border: "none", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {sb.icon && <Icon name={sb.icon} size={9} />} {sb.label}
        </button>
        {hasValidHistory && (
          <button onClick={() => openUndoConfirm([order])} disabled={isUndoing} title={t("orders.undoTitle")}
            style={{ padding: "2px 5px", borderRadius: 6, fontSize: 11, lineHeight: 1, background: "var(--ne-warning-soft)", color: "var(--ne-warning)", border: "none", cursor: isUndoing ? "default" : "pointer", display: "flex", alignItems: "center" }}>
            <Icon name={isUndoing ? "pending" : "undo"} size={11} />
          </button>
        )}
      </div>
    );

    return { order, source, phone, waPhone, waMessage, fullName, city, address, productsEditable, productVariantNote, items, hasManualOverride: !!order.agent_data?.product, wasAddress, displayTotal, skus, unitPrices, shipping, discount, remarks, cancellationReason, date, time, shopifyUrl, isSelected, isCancelled, hasValidHistory, isUndoing, isExpanded, statusBtn, syncRow };
  });

  return (
    <div style={{ padding: "0.75rem", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <style>{`@keyframes ne-address-flash { 0% { background-color: var(--ne-success-soft); } 100% { background-color: transparent; } } .ne-address-flash { animation: ne-address-flash 1.5s ease-out; border-radius: 6px; }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="package" size={15} /> {t("orders.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{currentStore?.store_name} — {tabFilteredOrders.length} {t("orders.ordersSuffix")}</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => { resetNewOrderForm(); setShowNewOrderModal(true); }}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {t("orders.newOrder")}
          </button>
          <button onClick={() => setShowBulkModal(true)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="upload" size={12} /> {t("orders.bulkUpload")}
          </button>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      {/* Quick filters + search + tab nav — collapses together as one unit on scroll-down,
          reappears on scroll-up. CSS-grid 1fr/0fr trick (not a fixed maxHeight) so it
          animates to the exact content height regardless of how many rows this wraps
          into on narrow viewports or whether the bulk-actions bar is showing. */}
      <div style={{ display: "grid", gridTemplateRows: listHeaderHidden ? "0fr" : "1fr", transition: "grid-template-rows .25s ease", overflow: "hidden" }}>
      <div style={{ minHeight: 0 }}>
      {/* Date Quick Buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button style={dateBtnStyle("today")} onClick={() => handleDateBtn("today")}>
          {t("orders.today")} <span style={{ opacity: 0.85, fontWeight: 500 }}>({todayCount})</span>
        </button>
        <button style={dateBtnStyle("yesterday")} onClick={() => handleDateBtn("yesterday")}>
          {t("orders.yesterday")} <span style={{ opacity: 0.85, fontWeight: 500 }}>({yesterdayCount})</span>
        </button>
        <button style={dateBtnStyle("7days")} onClick={() => handleDateBtn("7days")}>
          {t("orders.last7days")} <span style={{ opacity: 0.85, fontWeight: 500 }}>({last7Count})</span>
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setActiveDateBtn(null); }}
            style={{ padding: "5px 10px", borderRadius: 18, border: "1px solid var(--ne-danger)", background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontSize: 11, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="close" size={9} /> {t("orders.clear")}</button>
        )}
      </div>

      {/* Search + Date Range */}
      <div style={{ display: "flex", gap: 6, marginBottom: "6px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 130 }}>
          <Icon name="search" size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ne-muted-2)" }} />
          <input type="text" placeholder={t("orders.searchPlaceholder")} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 27px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        </div>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActiveDateBtn(null); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActiveDateBtn(null); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
      </div>

      {/* Filters + Bulk Actions */}
      <div style={{ display: "flex", gap: 6, marginBottom: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" }} data-status-multi>
          <button onClick={() => setStatusMultiOpen(!statusMultiOpen)}
            style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}>
            {statusFilters.length === 0 ? `${t("orders.allStatus")} ▼` : `${statusFilters.length} ${t("orders.selectedSuffix")} ▼`}
          </button>
          {statusMultiOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 9999, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "6px", minWidth: 180, marginTop: 4, boxShadow: "0 8px 30px rgba(0,0,0,.5)" }}>
              <div onClick={() => { setStatusFilters([]); setStatusMultiOpen(false); }}
                style={{ padding: "6px 10px", borderRadius: 7, cursor: "pointer", color: "var(--ne-muted)", fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}><Icon name="close" size={9} /> {t("orders.clearAll")}</div>
              {STATUSES.map(s => (
                <div key={s.label} onClick={() => { setStatusFilters(prev => prev.includes(s.label) ? prev.filter(x => x !== s.label) : [...prev, s.label]); setPage(1); }}
                  style={{ padding: "6px 10px", borderRadius: 7, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = s.bg}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ display: "flex", alignItems: "center" }}>{statusFilters.includes(s.label) ? <Icon name="check" size={10} /> : <span style={{ width: 10, height: 10, border: "1px solid currentColor", borderRadius: 2, display: "inline-block" }} />}</span>{s.label}
                </div>
              ))}
            </div>
          )}
        </div>
        <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          <option value="All">{t("orders.allSource")}</option>
          {["Meta", "TikTok", "Snapchat", "Google", "Direct"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={availableCities.includes(cityFilter) ? cityFilter : "All"} onChange={e => { setCityFilter(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          {availableCities.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={availableSKUs.includes(skuFilter) ? skuFilter : "All"} onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          <option value="All">{t("orders.allSku")}</option>
          {availableSKUs.map(s => <option key={s}>{s}</option>)}
        </select>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--ne-muted)", fontWeight: 600 }}>{selectedIds.size} {t("orders.selectedSuffix")}</span>
            <div style={{ position: "relative" }} data-bulk-status>
              <button onClick={() => setBulkStatusOpen(!bulkStatusOpen)}
                style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-accent-soft)", color: "var(--ne-accent)", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                {t("orders.bulkStatus")} ▼
              </button>
              {bulkStatusOpen && (
                <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 9999, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "6px", minWidth: 180, marginTop: 4, boxShadow: "0 8px 30px rgba(0,0,0,.5)" }}>
                  {STATUSES.map(s => (
                    <div key={s.label} onClick={() => bulkUpdateStatus(s.label)}
                      style={{ padding: "6px 10px", borderRadius: 7, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500 }}
                      onMouseEnter={e => e.currentTarget.style.background = s.bg}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => openSyncConfirm(orders.filter(o => selectedIds.has(o.id)))}
              style={{ padding: "6px 12px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="refresh" size={11} /> {t("orders.bulkSync")} ({selectedIds.size})
            </button>
            {selectedHaveValidHistory && (
              <button onClick={() => openUndoConfirm(orders.filter(o => selectedIds.has(o.id)))}
                style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--ne-warning)", background: "var(--ne-warning-soft)", color: "var(--ne-warning)", fontSize: 11, cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="undo" size={11} /> {t("orders.bulkUndo")}
              </button>
            )}
            <button onClick={() => setSelectedIds(new Set())}
              style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center" }}><Icon name="close" size={10} /></button>
          </div>
        )}
      </div>

      {/* Tab Navigation — har tab apni alag pill hai (theme reference jaisa), shared box nahi */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: "0.6rem" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab ? "transparent" : "var(--ne-border)",
              background: activeTab === tab ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted)" }}>
            {t(TAB_KEYS[tab])}
            <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: activeTab === tab ? "rgba(255,255,255,0.22)" : "var(--ne-bg)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted-2)" }}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>
      </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>{t("orders.loadingOrders")}</div>
      ) : isMobile ? (
        <div ref={tableRef} onScroll={handleListScroll} style={{ flex: 1, overflowY: "auto" }}>
          {orderRows.map(({ order, source, phone, waPhone, waMessage, fullName, city, address, productsEditable, productVariantNote, items, hasManualOverride, wasAddress, displayTotal, skus, unitPrices, shipping, discount, remarks, cancellationReason, date, time, shopifyUrl, isSelected, isCancelled, isExpanded, statusBtn, syncRow }) => (
            <div key={order.id} style={{ background: isSelected ? "var(--ne-accent-soft)" : "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "8px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>{order.name}</a>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => openItemsModal(order)}
                    style={{ padding: "3px 9px", borderRadius: 8, fontSize: 10, background: "var(--ne-surface-2)", color: "var(--ne-text)", border: "1px solid var(--ne-border)", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="edit" size={9} /> {t("orders.editItems")}
                  </button>
                  {statusBtn}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", marginTop: 4 }}>{date} · {time} · {skus}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                <div>
                  <EditableCell orderId={order.id} field="customer_name" value={fullName} width={160} clampLines={1}
                    displayStyle={{ fontSize: 12.5, fontWeight: 600, color: "var(--ne-text)" }} />
                  <EditableCell orderId={order.id} field="city" value={city} width={160} clampLines={1}
                    displayStyle={{ fontSize: 11, color: "var(--ne-muted)" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ne-success)" }}>Rs. {displayTotal.toLocaleString()}</div>
              </div>

              <button onClick={() => toggleExpand(order.id)}
                style={{ width: "100%", marginTop: 8, padding: "6px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 10.5, cursor: "pointer", fontWeight: 600 }}>
                {isExpanded ? t("orders.showLess") : t("orders.showMore")}
              </button>

              <AddressMatchBlock order={order} storeId={currentStore?.id} cfUrl={cfUrl} t={t} onUpdateAgentData={updateAgentDataPatch} onAddressConfirmed={handleAddressConfirmed} />

              {isExpanded && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{t("orders.phonePlaceholder")}: </span><EditableCell orderId={order.id} field="phone" value={phone} width={140} />
                    {phone && (
                      <a href={`tel:${phone}`} title={t("orders.call")}
                        style={{ padding: "2px 5px", borderRadius: 6, fontSize: 11, lineHeight: 1, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", textDecoration: "none" }}>
                        <Icon name="phone" size={11} />
                      </a>
                    )}
                    {waPhone && (
                      <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noreferrer" title={t("orders.whatsapp")}
                        style={{ padding: "2px 5px", borderRadius: 6, fontSize: 11, lineHeight: 1, background: "var(--ne-success-soft)", color: "var(--ne-success)", display: "flex", alignItems: "center", textDecoration: "none" }}>
                        <Icon name="comment" size={11} />
                      </a>
                    )}
                  </div>
                  <div className={wasAddress ? "ne-address-flash" : ""}>
                    <span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{t("orders.addressFieldPlaceholder")}: </span>
                    {wasAddress && <div style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{t("orders.addressWasLabel")} <s>{wasAddress}</s></div>}
                    <EditableCell orderId={order.id} field="address" value={address} width={260} />
                  </div>
                  <div><span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{t("orders.productPlaceholder")}: </span><div>
  <ProductsCell orderId={order.id} value={productsEditable} items={items} variantNote={productVariantNote} hasManualOverride={hasManualOverride} width={260} />
</div></div>
                  <div style={{ display: "flex", gap: 14 }}>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)" }}>{t("orders.unit")}: {unitPrices}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 3 }}>{t("orders.ship")}: <EditableCell orderId={order.id} field="shipping" value={String(shipping)} width={50} /></div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 3 }}>{t("orders.disc")}: <EditableCell orderId={order.id} field="discount" value={String(discount)} width={50} /></div>
                  </div>
                  {isCancelled && cancellationReason && (
                    <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: 10, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content" }}>{cancellationReason}</span>
                  )}
                  <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 10, background: "var(--ne-surface-2)", color: SOURCE_COLORS[source], fontWeight: 700, width: "fit-content" }}>{source}</span>
                  <div><span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{t("orders.remarks")}: </span><EditableCell orderId={order.id} field="remarks" value={remarks} width={260} /></div>
                  {syncRow}
                </div>
              )}
            </div>
          ))}
          {orderRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("orders.noOrderFound")}</div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <style>{`.ne-hide-scroll::-webkit-scrollbar{display:none} .ne-hide-scroll{scrollbar-width:none; -ms-overflow-style:none;}`}</style>

          <div ref={tableRef} onScroll={handleListScroll} style={{ flex: 1, overflowY: "auto" }}>

            {/* Header row — scroll-down collapses it (maxHeight/opacity/padding to 0), scroll-up restores it */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, position: "sticky", top: 0, zIndex: 5, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,.18)", overflow: "hidden",
              maxHeight: listHeaderHidden ? 0 : 44, opacity: listHeaderHidden ? 0 : 1, marginBottom: listHeaderHidden ? 0 : 8, padding: listHeaderHidden ? "0 0" : "10px 0", borderWidth: listHeaderHidden ? 0 : 1,
              transition: "max-height .25s ease, opacity .2s ease, margin-bottom .25s ease, padding .25s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, width: 136, padding: "0 8px 0 12px", boxSizing: "border-box" }}>
                <input type="checkbox" checked={selectedIds.size === pagedOrders.length && pagedOrders.length > 0}
                  onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                <span style={{ ...thBase, background: "none", border: "none", padding: 0 }}>{t("orders.orderHash")}</span>
              </div>
              <div ref={registerMiddleRef("header")} onScroll={handleMiddleScroll("header")} className="ne-hide-scroll"
                style={{ overflowX: "auto", flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, width: MIDDLE_CONTENT_WIDTH }}>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 140, flexShrink: 0 }}>{t("orders.customer")}</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 165, flexShrink: 0 }}>{t("orders.address")}</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 145, flexShrink: 0 }}>{t("orders.items")}</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 115, flexShrink: 0 }}>{t("orders.pricing")}</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 75, flexShrink: 0 }}>{t("orders.source")}</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 90, flexShrink: 0, textAlign: "center" }}>{t("orders.courier")}</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 95, flexShrink: 0 }}>{t("orders.remarks")}</span>
                </div>
              </div>
              <div style={{ width: 130, flexShrink: 0, padding: "0 12px 0 14px", boxSizing: "border-box" }}>
                <span style={{ ...thBase, background: "none", border: "none", padding: 0 }}>{t("orders.statusSync")}</span>
              </div>
            </div>

            {orderRows.map(({ order, source, phone, waPhone, waMessage, fullName, city, address, productsEditable, productVariantNote, items, hasManualOverride, wasAddress, displayTotal, skus, unitPrices, shipping, discount, remarks, cancellationReason, date, time, shopifyUrl, isSelected, isCancelled, statusBtn, syncRow }) => (
              <div key={order.id} style={{ background: isSelected ? "var(--ne-accent-soft)" : "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, marginBottom: 6, boxShadow: "0 2px 8px rgba(0,0,0,.18)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>

                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 8px 8px 12px", flexShrink: 0, width: 136, boxSizing: "border-box" }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)} style={{ cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ width: 90, minWidth: 90 }}>
                    <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 11.5 }}>{order.name}</a>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 2 }}>{date}</div>
                    <div style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{time}</div>
                  </div>
                </div>

                <div ref={registerMiddleRef(order.id)} onScroll={handleMiddleScroll(order.id)} className="ne-hide-scroll"
                  style={{ overflowX: "auto", flex: "1 1 auto", minWidth: 0, padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, width: MIDDLE_CONTENT_WIDTH }}>
                    <div style={{ width: 140, minWidth: 140, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
                      <EditableCell orderId={order.id} field="customer_name" value={fullName} width={130} clampLines={1} />
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <EditableCell orderId={order.id} field="phone" value={phone} width={85} clampLines={1} />
                        {phone && (
                          <a href={`tel:${phone}`} title={t("orders.call")}
                            style={{ padding: "2px 4px", borderRadius: 5, fontSize: 9.5, lineHeight: 1, background: "var(--ne-accent-soft)", color: "var(--ne-accent)", display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
                            <Icon name="phone" size={9.5} />
                          </a>
                        )}
                        {waPhone && (
                          <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noreferrer" title={t("orders.whatsapp")}
                            style={{ padding: "2px 4px", borderRadius: 5, fontSize: 9.5, lineHeight: 1, background: "var(--ne-success-soft)", color: "var(--ne-success)", display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
                            <Icon name="comment" size={9.5} />
                          </a>
                        )}
                      </div>
                      <EditableCell orderId={order.id} field="city" value={city} width={130} clampLines={1} />
                      {isCancelled && cancellationReason && (
                        <span style={{ padding: "1px 6px", borderRadius: 6, fontSize: 9, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content" }}>{cancellationReason}</span>
                      )}
                    </div>

                    <div className={wasAddress ? "ne-address-flash" : ""} style={{ width: 190, minWidth: 190, flexShrink: 0, overflow: "hidden" }}>
                      {wasAddress && <div style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{t("orders.addressWasLabel")} <s>{wasAddress}</s></div>}
                      <EditableCell orderId={order.id} field="address" value={address} width={180} multiline clampLines={3} />
                    </div>

                    <div style={{ width: 160, minWidth: 160, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
                      <EditableCell orderId={order.id} field="sku" value={skus} width={150} clampLines={1} />
                      <div>
                        <ProductsCell orderId={order.id} value={productsEditable} items={items} variantNote={productVariantNote} hasManualOverride={hasManualOverride} width={150} multiline clampLines={2} />
                      </div>
                    </div>

                    <div style={{ width: 115, minWidth: 115, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 10 }}>
                        <span style={{ color: "var(--ne-muted-2)", flexShrink: 0 }}>{t("orders.unit")}</span>
                        <span title={unitPrices} style={{ color: "var(--ne-muted)", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{unitPrices}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                        <span style={{ color: "var(--ne-muted-2)" }}>{t("orders.ship")}</span>
                        <EditableCell orderId={order.id} field="shipping" value={String(shipping)} width={55} clampLines={1} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                        <span style={{ color: "var(--ne-muted-2)" }}>{t("orders.disc")}</span>
                        <EditableCell orderId={order.id} field="discount" value={String(discount)} width={55} clampLines={1} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 1 }}>
                        <span style={{ color: "var(--ne-muted-2)", fontSize: 10 }}>{t("orders.total")}</span>
                        <span style={{ color: "var(--ne-success)", fontWeight: 700, fontSize: 12 }}>Rs. {displayTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <div style={{ width: 75, minWidth: 75, flexShrink: 0, overflow: "hidden" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 10, background: "var(--ne-surface)", color: SOURCE_COLORS[source], fontWeight: 700 }}>{source}</span>
                    </div>

                    <div style={{ width: 90, minWidth: 90, flexShrink: 0, overflow: "hidden", textAlign: "center" }}>
                      {order.agent_data?.dex_tracking_number && (
                        <>
                          <img src={dexLogo} alt="Dex" style={{ height: 14, width: "auto", display: "block", margin: "0 auto 2px" }} />
                          <div style={{ overflow: "hidden" }}>
                            <a href={`https://www.dex.com.pk/tracking?references=${encodeURIComponent(order.agent_data.dex_tracking_number)}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 10, color: "var(--ne-accent)", textDecoration: "underline", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {order.agent_data.dex_tracking_number}
                            </a>
                          </div>
                          <div style={{ fontSize: 9, color: "var(--ne-muted)", marginTop: 1 }}>
                            {(order.agent_data.courier_order_status || "").replace(/_/g, " ")}
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ width: 95, minWidth: 95, flexShrink: 0, overflow: "hidden" }}>
                      <EditableCell orderId={order.id} field="remarks" value={remarks} width={85} multiline clampLines={2} />
                    </div>
                  </div>
                </div>

                <div style={{ width: 130, minWidth: 130, flexShrink: 0, display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start", padding: "8px 12px 8px 14px", justifyContent: "center", boxSizing: "border-box" }}>
                  {statusBtn}
                  <button onClick={() => openItemsModal(order)}
                    style={{ padding: "3px 9px", borderRadius: 8, fontSize: 10, background: "var(--ne-surface-2)", color: "var(--ne-text)", border: "1px solid var(--ne-border)", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="edit" size={9} /> {t("orders.editItems")}
                  </button>
                  {syncRow}
                </div>
              </div>
              <div style={{ padding: "0 14px 10px 14px" }}>
                <AddressMatchBlock order={order} storeId={currentStore?.id} cfUrl={cfUrl} t={t} onUpdateAgentData={updateAgentDataPatch} onAddressConfirmed={handleAddressConfirmed} />
              </div>
              </div>
            ))}

            {orderRows.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("orders.noOrderFound")}</div>
            )}
          </div>

          {/* Master horizontal scrollbar — hamesha yahin fixed rehta hai (page ke sath scroll nahi hota), sabko control karta hai */}
          <div ref={registerMiddleRef("master")} onScroll={handleMiddleScroll("master")}
            style={{ overflowX: "auto", overflowY: "hidden", height: 14, flexShrink: 0, marginLeft: 136, marginRight: 130 }}>
            <div style={{ width: MIDDLE_CONTENT_WIDTH, height: 1 }} />
          </div>
        </div>
      )}

      {/* Status Dropdown Portal */}
      {statusDropdown && (
        <div data-status-dropdown style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 999999, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "4px", minWidth: 175, boxShadow: "0 8px 30px rgba(0,0,0,0.6)" }}>
          {STATUSES.map(s => (
            <div key={s.label} onClick={() => updateStatus(statusDropdown, s.label)}
              style={{ padding: "7px 10px", borderRadius: 7, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = s.bg}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {cancelReasonModal && (
        <div data-cancel-modal style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 999999, background: "var(--ne-surface-2)", border: "1px solid var(--ne-danger)", borderRadius: 10, padding: "8px", minWidth: 190, boxShadow: "0 8px 30px rgba(0,0,0,0.6)" }}>
          <div style={{ fontSize: 10, color: "var(--ne-danger)", fontWeight: 700, marginBottom: 6, paddingLeft: 4 }}>
            {t("orders.cancellationReasonTitle")}
          </div>
          {!cancelReasonOtherMode ? (
            <>
              {CANCEL_REASONS.map(r => (
                <div key={r}
                  onClick={() => {
                    if (r === "Other") {
                      setCancelReasonOtherMode(true);
                    } else {
                      updateCancellationReason(cancelReasonModal, r);
                      setCancelReasonModal(null);
                    }
                  }}
                  style={{ padding: "7px 10px", borderRadius: 7, cursor: "pointer", color: "var(--ne-danger)", fontSize: 11, fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--ne-danger-soft)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {r}
                </div>
              ))}
              <div onClick={() => setCancelReasonModal(null)}
                style={{ padding: "7px 10px", borderRadius: 7, cursor: "pointer", color: "var(--ne-muted-2)", fontSize: 10, marginTop: 2 }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--ne-border)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {t("orders.skip")}
              </div>
            </>
          ) : (
            <div style={{ padding: "4px" }}>
              <input
                autoFocus
                value={cancelReasonCustomText}
                placeholder={t("orders.customReasonPlaceholder")}
                onChange={e => setCancelReasonCustomText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && cancelReasonCustomText.trim()) {
                    updateCancellationReason(cancelReasonModal, cancelReasonCustomText.trim());
                    setCancelReasonModal(null);
                    setCancelReasonOtherMode(false);
                    setCancelReasonCustomText("");
                  }
                  if (e.key === "Escape") {
                    setCancelReasonOtherMode(false);
                    setCancelReasonCustomText("");
                  }
                }}
                style={{ width: "100%", padding: "6px 9px", borderRadius: 6, border: "1px solid var(--ne-danger)", background: "var(--ne-bg)", color: "var(--ne-danger)", fontSize: 11, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <button
                  onClick={() => {
                    if (cancelReasonCustomText.trim()) {
                      updateCancellationReason(cancelReasonModal, cancelReasonCustomText.trim());
                      setCancelReasonModal(null);
                      setCancelReasonOtherMode(false);
                      setCancelReasonCustomText("");
                    }
                  }}
                  style={{ flex: 1, padding: "5px", borderRadius: 6, border: "none", background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                  {t("orders.save")}
                </button>
                <button
                  onClick={() => { setCancelReasonOtherMode(false); setCancelReasonCustomText(""); }}
                  style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted-2)", fontSize: 10, cursor: "pointer" }}>
                  ←
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- SYNC CONFIRM MODAL ---------- */}
      {syncConfirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 560, maxWidth: "94vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="refresh" size={14} /> {t("orders.syncConfirmTitle")} — {syncConfirmItems.length} order{syncConfirmItems.length > 1 ? "s" : ""}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("orders.syncConfirmSubtitle")}</p>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {syncConfirmPagedItems.map(({ order, diff }) => (
                <div key={order.id} style={{ marginBottom: 12, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ne-accent)", marginBottom: 6 }}>{order.name}</div>
                  {diff.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>{t("orders.noChangeDetected")}</div>
                  ) : (
                    diff.map(d => (
                      <div key={d.label} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 4, alignItems: "baseline" }}>
                        <span style={{ width: 60, color: "var(--ne-muted)", flexShrink: 0 }}>{d.label}:</span>
                        <span style={{ color: "var(--ne-danger)", textDecoration: "line-through" }}>{d.before}</span>
                        <span style={{ color: "var(--ne-muted-2)" }}>→</span>
                        <span style={{ color: "var(--ne-success)", fontWeight: 600 }}>{d.after}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>

            {syncConfirmTotalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "6px 0", borderTop: "1px solid var(--ne-border)" }}>
                <button onClick={() => setSyncConfirmPage(p => Math.max(1, p - 1))} disabled={syncConfirmPage === 1}
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: syncConfirmPage === 1 ? "default" : "pointer" }}>{t("orders.prev")}</button>
                <span style={{ fontSize: 11, color: "var(--ne-muted-2)", alignSelf: "center" }}>{t("orders.pagePrefix")} {syncConfirmPage} / {syncConfirmTotalPages}</span>
                <button onClick={() => setSyncConfirmPage(p => Math.min(syncConfirmTotalPages, p + 1))} disabled={syncConfirmPage === syncConfirmTotalPages}
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: syncConfirmPage === syncConfirmTotalPages ? "default" : "pointer" }}>{t("orders.next")}</button>
              </div>
            )}

            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--ne-muted-2)", display: "flex", alignItems: "center", gap: 5 }}>
                {syncRunning ? (<><Icon name="pending" size={11} /> {t("orders.syncingSuffix")} {syncProgressCount}/{syncConfirmItems.length}</>) : ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSyncConfirmModal(null)} disabled={syncRunning}
                  style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: syncRunning ? "default" : "pointer" }}>
                  {t("orders.cancel")}
                </button>
                <button onClick={confirmAndSync} disabled={syncRunning}
                  style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: syncRunning ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: syncRunning ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {syncRunning ? t("orders.syncingSuffix") : (<><Icon name="check" size={12} /> {t("orders.confirmSync")}</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- UNDO CONFIRM MODAL ---------- */}
      {undoConfirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="undo" size={14} /> {t("orders.undoTitle")} — {undoConfirmModal.orders.length} order{undoConfirmModal.orders.length > 1 ? "s" : ""}</h2>
            </div>
            <div style={{ padding: "14px 18px", maxHeight: 220, overflowY: "auto" }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ne-muted)" }}>
                {t("orders.undoBody")}
              </p>
              {undoConfirmModal.orders.map(o => (
                <div key={o.id} style={{ fontSize: 11, color: "var(--ne-accent)", marginBottom: 3 }}>{o.name}</div>
              ))}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setUndoConfirmModal(null)} disabled={undoRunning}
                style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: undoRunning ? "default" : "pointer" }}>
                {t("orders.cancel")}
              </button>
              <button onClick={confirmUndo} disabled={undoRunning}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: undoRunning ? "var(--ne-border)" : "var(--ne-warning)", color: "#1A1300", fontSize: 12, fontWeight: 700, cursor: undoRunning ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {undoRunning ? t("orders.undoingSuffix") : (<><Icon name="undo" size={12} /> {t("orders.confirmUndo")}</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- SYNC/UNDO RESULT MODAL ---------- */}
      {syncResultModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 460, maxWidth: "94vw", maxHeight: "75vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{syncResultModal.title}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} /> {syncResultModal.results.filter(r => r.success).length} {t("orders.successSuffix")}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="close" size={11} /> {syncResultModal.results.filter(r => !r.success).length} {t("orders.failedSuffix")}</span>
              </p>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {syncResultModal.results.map(r => (
                <div key={r.id} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ display: "flex", alignItems: "center" }}><Icon name={r.success ? "check" : "close"} size={11} /></span>
                  <div>
                    <div style={{ color: "var(--ne-text)", fontWeight: 600 }}>{r.name}</div>
                    {!r.success && <div style={{ color: "var(--ne-danger)" }}>{r.error}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setSyncResultModal(null)}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {t("orders.ok")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- EDIT ITEMS MODAL ---------- */}
      {itemsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 640, maxWidth: "94vw", maxHeight: "92vh", minHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="edit" size={14} /> {t("orders.editItemsTitle")} — {itemsModal.name}</h2>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {itemsList.map((it, idx) => (
                <div key={idx} style={{ marginBottom: 10, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ne-text)", wordBreak: "break-word" }}>{it.title}</div>
                      {it.variant_title && <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)" }}>{it.variant_title}</div>}
                      {it.sku && <div style={{ fontSize: 10, color: "var(--ne-muted-2)", fontFamily: "monospace" }}>{it.sku}</div>}
                    </div>
                    <button onClick={() => removeItem(idx)}
                      style={{ background: "transparent", border: "1px solid var(--ne-danger)", borderRadius: 7, color: "var(--ne-danger)", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 9px", flexShrink: 0 }}>
                      {t("orders.remove")}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "var(--ne-muted-2)" }}>
                      {t("orders.quantity")}
                      <input type="number" value={it.quantity} onChange={e => updateItemField(idx, "quantity", Number(e.target.value))}
                        style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11, boxSizing: "border-box" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "var(--ne-muted-2)" }}>
                      {t("orders.price")}
                      <input type="number" value={it.price} disabled readOnly
                        style={{ width: 80, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted-2)", fontSize: 11, boxSizing: "border-box", cursor: "not-allowed" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "var(--ne-muted-2)" }}>
                      {t("orders.disc")}
                      <input type="number" value={it.discount} onChange={e => updateItemField(idx, "discount", e.target.value)}
                        style={{ width: 80, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11, boxSizing: "border-box" }} />
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "var(--ne-muted-2)" }}>
                      {t("orders.finalPrice")}
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ne-success)", padding: "4px 0" }}>Rs. {(Number(it.price) - (Number(it.discount) || 0)).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 12, position: "relative" }}>
                <input type="text" placeholder={t("orders.itemsSearchPlaceholder")} value={itemsSearch}
                  onChange={e => setItemsSearch(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 12, boxSizing: "border-box" }} />
                {itemsSearchResults.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 9, maxHeight: 300, overflowY: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", zIndex: 10 }}>
                    {itemsSearchResults.map(({ product, variant }) => (
                      <div key={`${product.shopify_product_id}-${variant.id}`}
                        onClick={() => addItemFromSearch(product, variant)}
                        style={{ padding: "7px 10px", cursor: "pointer", fontSize: 11, borderBottom: "1px solid var(--ne-border)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--ne-surface)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ color: "var(--ne-text)", fontWeight: 600 }}>
                          {product.raw_data?.title}
                          {variant.title && variant.title !== "Default Title" && <span style={{ color: "var(--ne-muted-2)", fontWeight: 400 }}> ({variant.title})</span>}
                        </div>
                        <div style={{ color: "var(--ne-muted-2)", fontSize: 10 }}>{variant.sku || "—"} · Rs. {variant.price}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {itemsSyncState && (
              <div style={{ padding: "8px 18px", borderTop: "1px solid var(--ne-border)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 6,
                color: itemsSyncState === "synced" ? "var(--ne-success)" : itemsSyncState === "error" ? "var(--ne-danger)" : itemsSyncState === "skipped-fulfilled" ? "var(--ne-warning)" : "var(--ne-muted)" }}>
                <Icon name={itemsSyncState === "synced" ? "check" : itemsSyncState === "error" ? "close" : itemsSyncState === "syncing" ? "pending" : "warning"} size={12} />
                {itemsSyncState === "syncing" && t("orders.itemsSyncing")}
                {itemsSyncState === "synced" && t("orders.itemsSynced")}
                {itemsSyncState === "error" && `${t("orders.itemsSyncError")}: ${itemsSyncError}`}
                {itemsSyncState === "skipped-fulfilled" && t("orders.itemsSyncSkippedFulfilled")}
              </div>
            )}

            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {itemsSyncState && itemsSyncState !== "syncing" ? (
                <button onClick={closeItemsModal}
                  style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {t("orders.close")}
                </button>
              ) : (
                <>
                  <button onClick={closeItemsModal} disabled={itemsSaving}
                    style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: itemsSaving ? "default" : "pointer" }}>
                    {t("orders.cancel")}
                  </button>
                  <button onClick={saveItemsModal} disabled={itemsSaving}
                    style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: itemsSaving ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: itemsSaving ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {itemsSaving ? t("orders.saving") : (<><Icon name="check" size={12} /> {t("orders.save")}</>)}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- CREATE NEW ORDER MODAL (TASK 10) ---------- */}
      {showNewOrderModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 440, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("orders.newOrderTitle")}</h2>
            </div>
            <form onSubmit={createNewOrder} style={{ padding: "16px 18px" }}>
              <input type="text" placeholder={t("orders.namePlaceholder")} value={newOrderForm.name}
                onChange={e => setNewOrderForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="tel" placeholder={t("orders.phonePlaceholder")} value={newOrderForm.phone}
                onChange={e => setNewOrderForm(f => ({ ...f, phone: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <textarea placeholder={t("orders.addressFieldPlaceholder")} value={newOrderForm.address} rows={2}
                onChange={e => setNewOrderForm(f => ({ ...f, address: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10, resize: "vertical", fontFamily: "inherit" }} />
              <input type="text" placeholder={t("orders.cityPlaceholder")} value={newOrderForm.city}
                onChange={e => setNewOrderForm(f => ({ ...f, city: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="text" placeholder={t("orders.productPlaceholder")} value={newOrderForm.product}
                onChange={e => setNewOrderForm(f => ({ ...f, product: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="text" placeholder={t("orders.skuPlaceholder")} value={newOrderForm.sku}
                onChange={e => setNewOrderForm(f => ({ ...f, sku: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="number" placeholder={t("orders.pricePlaceholder")} value={newOrderForm.price} step="0.01"
                onChange={e => setNewOrderForm(f => ({ ...f, price: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />

              {currentStore?.shopify_url && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ne-text)", cursor: "pointer", marginBottom: 12 }}>
                  <input type="checkbox" checked={newOrderCreateOnShopify} onChange={e => setNewOrderCreateOnShopify(e.target.checked)} />
                  {t("orders.alsoCreateShopify")}
                </label>
              )}

              {newOrderError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{newOrderError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={newOrderSaving}
                  style={{ flex: 1, padding: "10px", background: newOrderSaving ? "var(--ne-border)" : "var(--ne-success)", color: newOrderSaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: newOrderSaving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {newOrderSaving ? t("orders.creatingOrder") : (<><Icon name="check" size={13} /> {t("orders.createOrder")}</>)}
                </button>
                <button type="button" onClick={() => setShowNewOrderModal(false)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("orders.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- BULK ORDER UPLOAD MODAL (TASK 11) ---------- */}
      {showBulkModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 640, maxWidth: "94vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="upload" size={14} /> {t("orders.bulkUploadTitle")}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("orders.bulkUploadSubtitle")}</p>
            </div>

            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={downloadCsvTemplate}
                style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="download" size={12} /> {t("orders.downloadTemplate")}
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="folder" size={12} /> {t("orders.csvUploadButton")}
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: "none" }} />
              {bulkRows.length > 0 && <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{bulkRows.length} {t("orders.rowsFoundSuffix")}</span>}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {bulkRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)", fontSize: 12 }}>
                  {t("orders.noCsvUploaded")}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {[t("orders.namePlaceholder"), t("orders.phonePlaceholder"), t("orders.addressFieldPlaceholder"), t("orders.cityPlaceholder"), t("orders.productPlaceholder"), t("orders.skuPlaceholder"), t("orders.pricePlaceholder")].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "5px 6px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.slice((bulkPage - 1) * BULK_PREVIEW_PER_PAGE, bulkPage * BULK_PREVIEW_PER_PAGE).map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: "5px 6px", color: "var(--ne-text)" }}>{r.name}</td>
                        <td style={{ padding: "5px 6px", color: "var(--ne-text)" }}>{r.phone}</td>
                        <td style={{ padding: "5px 6px", color: "var(--ne-text)" }}>{truncate(r.address, 30)}</td>
                        <td style={{ padding: "5px 6px", color: "var(--ne-text)" }}>{r.city}</td>
                        <td style={{ padding: "5px 6px", color: "var(--ne-text)" }}>{truncate(r.product, 20)}</td>
                        <td style={{ padding: "5px 6px", color: "var(--ne-text)" }}>{r.sku}</td>
                        <td style={{ padding: "5px 6px", color: "var(--ne-text)" }}>{r.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {bulkRows.length > BULK_PREVIEW_PER_PAGE && (
              <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "6px 0", borderTop: "1px solid var(--ne-border)" }}>
                <button onClick={() => setBulkPage(p => Math.max(1, p - 1))} disabled={bulkPage === 1}
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: bulkPage === 1 ? "default" : "pointer" }}>{t("orders.prev")}</button>
                <span style={{ fontSize: 11, color: "var(--ne-muted-2)", alignSelf: "center" }}>
                  {t("orders.pagePrefix")} {bulkPage} / {Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE)}
                </span>
                <button onClick={() => setBulkPage(p => Math.min(Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE), p + 1))} disabled={bulkPage === Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE)}
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: bulkPage === Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE) ? "default" : "pointer" }}>{t("orders.next")}</button>
              </div>
            )}

            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--ne-muted-2)", display: "flex", alignItems: "center", gap: 10 }}>
                {bulkImporting ? (<><Icon name="pending" size={11} /> {t("orders.importingSuffix")} {bulkProgress}/{bulkRows.length}</>) : bulkResult ? (
                  <>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} /> {bulkResult.success} {t("orders.successSuffix")}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Icon name="close" size={11} /> {bulkResult.fail} {t("orders.failedSuffix")}</span>
                  </>
                ) : ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeBulkModal} disabled={bulkImporting}
                  style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: bulkImporting ? "default" : "pointer" }}>
                  {t("orders.close")}
                </button>
                <button onClick={confirmBulkImport} disabled={bulkImporting || bulkRows.length === 0}
                  style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: (bulkImporting || bulkRows.length === 0) ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: (bulkImporting || bulkRows.length === 0) ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {bulkImporting ? t("orders.importing") : (<><Icon name="check" size={12} /> {t("orders.confirmImport")}</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
          {t("orders.showing")} {((page - 1) * perPage) + 1}–{Math.min(page * perPage, tabFilteredOrders.length)} {t("orders.of")} {tabFilteredOrders.length}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>‹</button>
          {[...Array(Math.min(5, totalPages))].map((_, idx) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + idx;
            return <button key={p} onClick={() => setPage(p)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === p ? "var(--ne-grad)" : "var(--ne-surface-2)", color: page === p ? "#fff" : "var(--ne-muted)", fontSize: 11, cursor: "pointer", fontWeight: page === p ? 700 : 400 }}>{p}</button>;
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>»</button>
        </div>
      </div>
    </div>
  );
}