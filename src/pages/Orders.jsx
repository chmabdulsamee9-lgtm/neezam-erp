import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const STATUSES = [
  { label: "Approved", color: "#16a34a", bg: "#14532d" },
  { label: "Under Verification", color: "#eab308", bg: "#713f12" },
  { label: "Cancelled", color: "#ef4444", bg: "#7f1d1d" },
  { label: "Not Answering", color: "#f97316", bg: "#7c2d12" },
  { label: "Powered Off", color: "#ec4899", bg: "#831843" },
  { label: "Hold", color: "#94a3b8", bg: "#1e293b" },
  { label: "Busy", color: "#60a5fa", bg: "#1e3a5f" },
  { label: "FAKE Order", color: "#ef4444", bg: "#450a0a" },
  { label: "No WhatsApp", color: "#94a3b8", bg: "#27272a" },
  { label: "Callback Scheduled", color: "#a78bfa", bg: "#2e1065" },
  { label: "Wrong Number", color: "#f87171", bg: "#3b0764" },
];

const SOURCE_COLORS = { Meta: "#3b82f6", TikTok: "#ec4899", Snapchat: "#eab308", Google: "#10b981", Direct: "#64748b" };
const PER_PAGE_OPTIONS = [20, 50, 100];
const TABS = ["All", "New", "Approved", "Pending", "Cancelled"];
const CANCEL_REASONS = ["Not Interested", "Wrong Number", "Duplicate Order", "Customer Cancelled", "Out of Stock", "Other"];
const PAGE_SIZE = 1000;

const tabFilter = (tab, o) => {
  if (tab === "New") return !o.agent_status;
  if (tab === "Approved") return o.agent_status === "Approved";
  if (tab === "Pending") return !!(o.agent_status && o.agent_status !== "Approved" && o.agent_status !== "Cancelled");
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

export default function Orders({ ordersData, setOrdersData, ordersLoaded, setOrdersLoaded, ordersStore, setOrdersStore, cfUrl }) {
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
  const [syncingId, setSyncingId] = useState(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [cancelReasonModal, setCancelReasonModal] = useState(null);
  const [cancelReasonOtherMode, setCancelReasonOtherMode] = useState(false);
  const [cancelReasonCustomText, setCancelReasonCustomText] = useState("");
  const tableRef = useRef(null);

  useEffect(() => {
    if (!ordersLoaded) loadStore();
  }, []);

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
      setError("Pehle Store Connect karo!");
      setLoading(false);
    }
  };

  // Saari cached orders Supabase se paginate karke laata hai (1000 per page,
  // PostgREST ki default row limit se bachne ke liye)
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

  const fetchOrders = async (storeData) => {
    setLoading(true);
    try {
      const cachedOrders = await fetchAllCachedOrders(storeData.id);
      const statuses = await fetchAllOrderStatuses();
      const statusMap = {};
      statuses.forEach(s => { statusMap[s.order_id] = s; });
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
      setError("Error: " + err.message);
    }
    setLoading(false);
  };

  const handleRefresh = () => {
    const storeData = store || ordersStore;
    if (storeData) fetchOrders(storeData);
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

  const updateStatus = async (orderId, status) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("order_statuses").upsert(
      { order_id: String(orderId), status, updated_at: now, last_edited_at: now },
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
      if (status === "Cancelled") {
        setCancelReasonModal(orderId);
        setCancelReasonOtherMode(false);
        setCancelReasonCustomText("");
      }
    }
    setStatusDropdown(null);
  };

  const updateCancellationReason = async (orderId, reason) => {
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
    }
    setEditingCell(null);
  };

  const syncToShopify = async (order, silent = false) => {
    const storeData = store || ordersStore;
    if (!storeData) return false;
    setSyncingId(order.id);
    const agentData = order.agent_data || {};
    const customerName = agentData.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
    const phoneToSync = normalizePhone(agentData.phone || order.customer?.phone || order.shipping_address?.phone || "");
    const addressPayload = {
      first_name: customerName.split(" ")[0] || "",
      last_name: customerName.split(" ").slice(1).join(" ") || "",
      address1: agentData.address || order.shipping_address?.address1 || "",
      city: agentData.city || order.shipping_address?.city || "",
      phone: phoneToSync,
    };
    try {
      const res = await fetch(`${cfUrl}/shopify-update-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: storeData.shopify_url,
          token: storeData.api_token,
          orderId: order.id,
          updates: {
            shipping_address: addressPayload,
            billing_address: addressPayload,
            phone: phoneToSync,
          }
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
        if (!silent) alert("✅ Shopify pe update ho gaya!\nOrder: " + order.name);
        setSyncingId(null);
        return true;
      } else {
        if (!silent) alert("❌ Shopify Error:\n" + JSON.stringify(data.errors || data.error, null, 2));
        setSyncingId(null);
        return false;
      }
    } catch (err) {
      if (!silent) alert("❌ Error: " + err.message);
      setSyncingId(null);
      return false;
    }
  };

  const bulkUpdateStatus = async (status) => {
    const now = new Date().toISOString();
    const ids = [...selectedIds];
    for (const orderId of ids) {
      await supabase.from("order_statuses").upsert(
        { order_id: String(orderId), status, updated_at: now, last_edited_at: now },
        { onConflict: "order_id" }
      );
    }
    setOrders(prev => prev.map(o => selectedIds.has(o.id) ? { ...o, agent_status: status, last_edited_at: now } : o));
    setBulkStatusOpen(false);
    setSelectedIds(new Set());
  };

  const bulkSync = async () => {
    const ids = [...selectedIds];
    const ordersToSync = orders.filter(o => ids.includes(o.id));
    setBulkSyncing(true);
    let success = 0;
    for (const order of ordersToSync) {
      const ok = await syncToShopify(order, true);
      if (ok) success++;
    }
    setBulkSyncing(false);
    setSelectedIds(new Set());
    alert(`✅ ${success}/${ordersToSync.length} orders sync ho gaye!`);
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

  const getSyncState = (order) => {
    if (!order.synced_at && !order.last_edited_at) return "never";
    if (!order.synced_at && order.last_edited_at) return "pending";
    if (order.last_edited_at && order.synced_at && new Date(order.last_edited_at) > new Date(order.synced_at)) return "pending";
    return "synced";
  };

  const currentStore = store || ordersStore;

  // Step 1: date range only — source of truth for tab counts
  const dateFilteredOrders = orders.filter(order => {
    const orderDate = new Date(order.created_at);
    // Append time so JS parses as LOCAL midnight, not UTC midnight
    const matchFrom = !dateFrom || orderDate >= new Date(dateFrom + "T00:00:00");
    const matchTo = !dateTo || orderDate <= new Date(dateTo + "T23:59:59");
    return matchFrom && matchTo;
  });

  // Tab counts from date-only set so clicking Today/Yesterday updates all badges
  const tabCounts = Object.fromEntries(TABS.map(t => [t, t === "All" ? dateFilteredOrders.length : dateFilteredOrders.filter(o => tabFilter(t, o)).length]));

  // Step 2: date + search + source + active tab — base for city/sku dropdown options
  const baseFilteredOrders = dateFilteredOrders.filter(order => {
    const name = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.toLowerCase();
    const phone = order.customer?.phone || order.shipping_address?.phone || "";
    const orderNum = order.name || "";
    const matchSearch = !search || name.includes(search.toLowerCase()) || phone.includes(search) || orderNum.includes(search);
    const matchSource = sourceFilter === "All" || getSource(order) === sourceFilter;
    const matchTab = activeTab === "All" || tabFilter(activeTab, order);
    return matchSearch && matchSource && matchTab;
  });

  // Dropdown options from the fully active context (date + search + source + tab)
  const availableCities = ["All", ...new Set(baseFilteredOrders.map(o => o.agent_data?.city || o.shipping_address?.city).filter(Boolean))].sort();
  const availableSKUs = [...new Set(baseFilteredOrders.flatMap(o => getSKUs(o)))].filter(Boolean).sort();

  // Step 3: apply status, city, sku filters on top of baseFilteredOrders
  const filteredOrders = baseFilteredOrders.filter(order => {
    const orderCity = order.agent_data?.city || order.shipping_address?.city || "";
    const matchStatus = statusFilters.length === 0 || statusFilters.includes(order.agent_status);
    const matchCity = cityFilter === "All" || orderCity === cityFilter;
    const matchSku = skuFilter === "All" || getSKUs(order).includes(skuFilter);
    return matchStatus && matchCity && matchSku;
  });

  // Tab already applied in baseFilteredOrders; alias kept for downstream references
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

  const EditableCell = ({ orderId, field, value, width = 100, maxChars = 20 }) => {
    const cellKey = `${orderId}-${field}`;
    const isEditing = editingCell === cellKey;
    const [val, setVal] = useState(value || "");
    useEffect(() => { setVal(value || ""); }, [value]);

    if (isEditing) return (
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") updateField(orderId, field, val); if (e.key === "Escape") setEditingCell(null); }}
          style={{ width, padding: "2px 5px", borderRadius: 4, border: "1px solid #3b82f6", background: "#0f172a", color: "#fff", fontSize: 11 }} />
        <button onClick={() => updateField(orderId, field, val)}
          style={{ background: "#3b82f6", border: "none", borderRadius: 4, color: "#fff", padding: "2px 5px", cursor: "pointer", fontSize: 10 }}>✓</button>
        <button onClick={() => setEditingCell(null)}
          style={{ background: "#334155", border: "none", borderRadius: 4, color: "#fff", padding: "2px 5px", cursor: "pointer", fontSize: 10 }}>✕</button>
      </div>
    );

    const display = truncate(value, maxChars);
    const needsTooltip = value && value.length > maxChars;
    return (
      <span onClick={() => setEditingCell(cellKey)} title={needsTooltip ? value : ""}
        style={{ cursor: "pointer", color: value ? "#e2e8f0" : "#475569", fontSize: 11, whiteSpace: "nowrap" }}>
        {display || "—"}
      </span>
    );
  };

  if (error) return <div style={{ padding: "2rem", color: "#ef4444" }}>❌ {error}</div>;

  const tdBase = { padding: "5px 6px" };
  const thBase = { padding: "7px 6px", textAlign: "left", color: "#64748b", whiteSpace: "nowrap", fontWeight: 500, borderBottom: "1px solid #334155", background: "#1e293b" };
  const dateBtnStyle = (type) => ({
    padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600, border: "1px solid",
    background: activeDateBtn === type ? "#3b82f6" : "#0f172a",
    color: activeDateBtn === type ? "#fff" : "#94a3b8",
    borderColor: activeDateBtn === type ? "#3b82f6" : "#334155",
  });

  return (
    <div style={{ padding: "0.5rem", height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>📦 Orders</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>{currentStore?.store_name} — {tabFilteredOrders.length} orders</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#fff", fontSize: 11 }}>
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      {/* Date Quick Buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: "6px", alignItems: "center" }}>
        <button style={dateBtnStyle("today")} onClick={() => handleDateBtn("today")}>
          Today <span style={{ opacity: 0.7, fontWeight: 400 }}>({todayCount})</span>
        </button>
        <button style={dateBtnStyle("yesterday")} onClick={() => handleDateBtn("yesterday")}>
          Yesterday <span style={{ opacity: 0.7, fontWeight: 400 }}>({yesterdayCount})</span>
        </button>
        <button style={dateBtnStyle("7days")} onClick={() => handleDateBtn("7days")}>
          Last 7 Days <span style={{ opacity: 0.7, fontWeight: 400 }}>({last7Count})</span>
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setActiveDateBtn(null); }}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #334155", background: "#7f1d1d", color: "#fca5a5", fontSize: 11, cursor: "pointer" }}>✕ Clear</button>
        )}
      </div>

      {/* Search + Date Range */}
      <div style={{ display: "flex", gap: 5, marginBottom: "4px", flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Name, phone, order#..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 130, padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActiveDateBtn(null); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActiveDateBtn(null); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }} />
      </div>

      {/* Filters + Bulk Actions */}
      <div style={{ display: "flex", gap: 5, marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" }} data-status-multi>
          <button onClick={() => setStatusMultiOpen(!statusMultiOpen)}
            style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
            {statusFilters.length === 0 ? "All Status ▼" : `${statusFilters.length} selected ▼`}
          </button>
          {statusMultiOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 9999, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px", minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.8)" }}>
              <div onClick={() => { setStatusFilters([]); setStatusMultiOpen(false); }}
                style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", color: "#94a3b8", fontSize: 11 }}>✕ Clear All</div>
              {STATUSES.map(s => (
                <div key={s.label} onClick={() => { setStatusFilters(prev => prev.includes(s.label) ? prev.filter(x => x !== s.label) : [...prev, s.label]); setPage(1); }}
                  style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = s.bg}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span>{statusFilters.includes(s.label) ? "✅" : "⬜"}</span>{s.label}
                </div>
              ))}
            </div>
          )}
        </div>
        <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }}>
          <option value="All">All Source</option>
          {["Meta", "TikTok", "Snapchat", "Google", "Direct"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={availableCities.includes(cityFilter) ? cityFilter : "All"} onChange={e => { setCityFilter(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }}>
          {availableCities.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={availableSKUs.includes(skuFilter) ? skuFilter : "All"} onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 11 }}>
          <option value="All">All SKU</option>
          {availableSKUs.map(s => <option key={s}>{s}</option>)}
        </select>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginLeft: "auto" }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{selectedIds.size} selected</span>
            <div style={{ position: "relative" }} data-bulk-status>
              <button onClick={() => setBulkStatusOpen(!bulkStatusOpen)}
                style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e3a5f", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                Bulk Status ▼
              </button>
              {bulkStatusOpen && (
                <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 9999, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "6px", minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.8)" }}>
                  {STATUSES.map(s => (
                    <div key={s.label} onClick={() => bulkUpdateStatus(s.label)}
                      style={{ padding: "5px 10px", borderRadius: 6, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500 }}
                      onMouseEnter={e => e.currentTarget.style.background = s.bg}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={bulkSync} disabled={bulkSyncing}
              style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: bulkSyncing ? "#1e293b" : "#0c4a6e", color: bulkSyncing ? "#64748b" : "#38bdf8", fontSize: 11, cursor: bulkSyncing ? "default" : "pointer", fontWeight: 600 }}>
              {bulkSyncing ? "Syncing..." : `🔄 Bulk Sync (${selectedIds.size})`}
            </button>
            <button onClick={() => setSelectedIds(new Set())}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>✕</button>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: "0.5rem", flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }}
            style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 600, border: "1px solid", transition: "all 0.15s",
              background: activeTab === tab ? "#3b82f6" : "#1e293b",
              color: activeTab === tab ? "#fff" : "#94a3b8",
              borderColor: activeTab === tab ? "#3b82f6" : "#334155" }}>
            {tab}
            <span style={{ marginLeft: 5, padding: "1px 6px", borderRadius: 10, fontSize: 10,
              background: activeTab === tab ? "rgba(255,255,255,0.25)" : "#0f172a",
              color: activeTab === tab ? "#fff" : "#64748b" }}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#94a3b8" }}>Loading orders...</div>
      ) : (
        <div ref={tableRef} style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #1e293b", flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 15 }}>
              <tr style={{ background: "#1e293b" }}>
                <th style={{ ...thBase, width: 30 }}>
                  <input type="checkbox" checked={selectedIds.size === pagedOrders.length && pagedOrders.length > 0}
                    onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                </th>
                <th style={{ ...thBase, position: "sticky", left: 0, zIndex: 20, background: "#1e293b", minWidth: 85 }}>Order#</th>
                <th style={thBase}>Date</th>
                <th style={thBase}>Time</th>
                <th style={thBase}>Full Name</th>
                <th style={thBase}>Phone</th>
                <th style={thBase}>Address</th>
                <th style={thBase}>City</th>
                <th style={thBase}>Products</th>
                <th style={thBase}>SKU</th>
                <th style={thBase}>Unit Price</th>
                <th style={thBase}>Shipping</th>
                <th style={thBase}>Discount</th>
                <th style={thBase}>Total</th>
                <th style={thBase}>Source</th>
                <th style={thBase}>Remarks</th>
                <th style={{ ...thBase, position: "sticky", right: 0, zIndex: 20, background: "#1e293b", minWidth: 120 }}>Status / Sync</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order, i) => {
                const source = getSource(order);
                const status = STATUSES.find(s => s.label === order.agent_status);
                const phone = normalizePhone(order.agent_data?.phone || order.customer?.phone || order.shipping_address?.phone || "");
                const fullName = order.agent_data?.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
                const city = order.agent_data?.city || order.shipping_address?.city || "";
                const address = order.agent_data?.address || order.shipping_address?.address1 || "";
                const products = order.agent_data?.product || order.line_items?.map(i => `${i.quantity > 1 ? i.quantity + "x " : ""}${i.title}`).join(" + ") || "—";
                const skus = order.agent_data?.sku || order.line_items?.map(i => `${i.quantity > 1 ? i.quantity : ""}${i.sku || ""}`).join(" + ") || "—";
                const unitPrices = order.line_items?.map(i => i.price).join(" + ") || "—";
                const shipping = order.agent_data?.shipping || order.total_shipping_price_set?.presentment_money?.amount || "0";
                const discount = order.agent_data?.discount || order.total_discounts || "0";
                const remarks = order.agent_data?.remarks || "";
                const cancellationReason = order.agent_data?.cancellation_reason || "";
                const date = new Date(order.created_at).toLocaleDateString("en-PK");
                const time = new Date(order.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
                const shopifyUrl = `https://${currentStore?.shopify_url}/admin/orders/${order.id}`;
                const rowBg = i % 2 === 0 ? "#0f172a" : "#0a0f1e";
                const isSyncing = syncingId === order.id;
                const syncState = getSyncState(order);
                const isSelected = selectedIds.has(order.id);
                const isCancelled = order.agent_status === "Cancelled";

                const syncBtn = () => {
                  if (syncState === "pending") return { bg: "#713f12", color: "#eab308", label: "⚡ Ready to Sync" };
                  if (syncState === "synced") return { bg: "#14532d", color: "#16a34a", label: "✓ Synced" };
                  return { bg: "#1e293b", color: "#475569", label: "Sync" };
                };
                const sb = syncBtn();

                return (
                  <tr key={order.id} style={{ background: isSelected ? "#1e3a5f" : rowBg, borderBottom: "1px solid #1e293b" }}>
                    <td style={{ ...tdBase, textAlign: "center" }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ ...tdBase, position: "sticky", left: 0, zIndex: 4, background: isSelected ? "#1e3a5f" : rowBg, whiteSpace: "nowrap" }}>
                      <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontWeight: 600, textDecoration: "none", fontSize: 11 }}>{order.name}</a>
                    </td>
                    <td style={{ ...tdBase, color: "#94a3b8", whiteSpace: "nowrap" }}>{date}</td>
                    <td style={{ ...tdBase, color: "#64748b", whiteSpace: "nowrap" }}>{time}</td>
                    <td style={tdBase}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <EditableCell orderId={order.id} field="customer_name" value={fullName} width={110} maxChars={15} />
                        {isCancelled && cancellationReason && (
                          <span style={{ padding: "1px 5px", borderRadius: 6, fontSize: 9, background: "#7f1d1d", color: "#fca5a5", fontWeight: 500, whiteSpace: "nowrap", display: "inline-block" }}>
                            {cancellationReason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="phone" value={phone} width={100} maxChars={13} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="address" value={address} width={130} maxChars={18} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="city" value={city} width={80} maxChars={10} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="product" value={products} width={160} maxChars={20} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="sku" value={skus} width={100} maxChars={12} /></td>
                    <td style={{ ...tdBase, color: "#94a3b8", whiteSpace: "nowrap" }}>{unitPrices}</td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="shipping" value={String(shipping)} width={60} maxChars={7} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="discount" value={String(discount)} width={60} maxChars={7} /></td>
                    <td style={{ ...tdBase, color: "#10b981", fontWeight: 600, whiteSpace: "nowrap" }}>Rs. {Number(order.total_price).toLocaleString()}</td>
                    <td style={tdBase}>
                      <span style={{ padding: "2px 6px", borderRadius: 8, fontSize: 10, background: "#1e293b", color: SOURCE_COLORS[source], fontWeight: 600 }}>{source}</span>
                    </td>
                    <td style={tdBase}>
                      <EditableCell orderId={order.id} field="remarks" value={remarks} width={100} maxChars={18} />
                    </td>
                    <td style={{ ...tdBase, position: "sticky", right: 0, zIndex: 4, background: isSelected ? "#1e3a5f" : rowBg }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                        <button data-order-btn={order.id} onClick={(e) => handleStatusBtnClick(e, order.id)}
                          style={{ padding: "3px 8px", borderRadius: 8, fontSize: 10, background: status?.bg || "#1e293b", color: status?.color || "#64748b", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {order.agent_status || "Set ▼"}
                        </button>
                        <button onClick={() => syncToShopify(order)} disabled={isSyncing}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 9, background: isSyncing ? "#1e293b" : sb.bg, color: isSyncing ? "#64748b" : sb.color, border: "none", cursor: isSyncing ? "default" : "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {isSyncing ? "Syncing..." : sb.label}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagedOrders.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Koi order nahi mila!</div>
          )}
        </div>
      )}

      {/* Status Dropdown Portal */}
      {statusDropdown && (
        <div data-status-dropdown style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 999999, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "4px", minWidth: 175, boxShadow: "0 8px 30px rgba(0,0,0,0.9)" }}>
          {STATUSES.map(s => (
            <div key={s.label} onClick={() => updateStatus(statusDropdown, s.label)}
              style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.background = s.bg}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {cancelReasonModal && (
        <div data-cancel-modal style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 999999, background: "#1e293b", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px", minWidth: 190, boxShadow: "0 8px 30px rgba(0,0,0,0.9)" }}>
          <div style={{ fontSize: 10, color: "#fca5a5", fontWeight: 600, marginBottom: 6, paddingLeft: 4 }}>
            Cancellation Reason
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
                  style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: "#fca5a5", fontSize: 11, fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#7f1d1d"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {r}
                </div>
              ))}
              <div onClick={() => setCancelReasonModal(null)}
                style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer", color: "#64748b", fontSize: 10, marginTop: 2 }}
                onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                Skip
              </div>
            </>
          ) : (
            <div style={{ padding: "4px" }}>
              <input
                autoFocus
                value={cancelReasonCustomText}
                placeholder="Type custom reason..."
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
                style={{ width: "100%", padding: "5px 8px", borderRadius: 4, border: "1px solid #7f1d1d", background: "#0f172a", color: "#fca5a5", fontSize: 11, boxSizing: "border-box" }}
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
                  style={{ flex: 1, padding: "4px", borderRadius: 4, border: "none", background: "#7f1d1d", color: "#fca5a5", fontSize: 10, cursor: "pointer", fontWeight: 600 }}>
                  Save
                </button>
                <button
                  onClick={() => { setCancelReasonOtherMode(false); setCancelReasonCustomText(""); }}
                  style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #334155", background: "transparent", color: "#64748b", fontSize: 10, cursor: "pointer" }}>
                  ←
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, tabFilteredOrders.length)} of {tabFilteredOrders.length}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === 1 ? "#0f172a" : "#1e293b", color: page === 1 ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === 1 ? "#0f172a" : "#1e293b", color: page === 1 ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>‹</button>
          {[...Array(Math.min(5, totalPages))].map((_, idx) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + idx;
            return <button key={p} onClick={() => setPage(p)} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === p ? "#3b82f6" : "#1e293b", color: page === p ? "#fff" : "#94a3b8", fontSize: 11, cursor: "pointer" }}>{p}</button>;
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === totalPages ? "#0f172a" : "#1e293b", color: page === totalPages ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid #334155", background: page === totalPages ? "#0f172a" : "#1e293b", color: page === totalPages ? "#334155" : "#94a3b8", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>»</button>
        </div>
      </div>
    </div>
  );
}