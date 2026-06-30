import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

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
const SYNC_CONFIRM_PER_PAGE = 20;
const HISTORY_VALID_MS = 2 * 24 * 60 * 60 * 1000;

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

const toLocalDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const isHistoryValid = (h) => !!(h && h.created_at && (Date.now() - new Date(h.created_at).getTime()) < HISTORY_VALID_MS);

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
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [cancelReasonModal, setCancelReasonModal] = useState(null);
  const [cancelReasonOtherMode, setCancelReasonOtherMode] = useState(false);
  const [cancelReasonCustomText, setCancelReasonCustomText] = useState("");
  const tableRef = useRef(null);

  const [historyMap, setHistoryMap] = useState({});
  const [syncConfirmModal, setSyncConfirmModal] = useState(null);
  const [syncConfirmPage, setSyncConfirmPage] = useState(1);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgressCount, setSyncProgressCount] = useState(0);
  const [syncResultModal, setSyncResultModal] = useState(null);
  const [undoConfirmModal, setUndoConfirmModal] = useState(null);
  const [undoRunning, setUndoRunning] = useState(false);
  const [undoingId, setUndoingId] = useState(null);

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
      setError("Error: " + err.message);
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

  const buildSyncPlan = (order) => {
    const agentData = order.agent_data || {};
    const customerName = agentData.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
    const phoneToSync = normalizePhone(agentData.phone || order.customer?.phone || order.shipping_address?.phone || "");
    const nameParts = customerName.split(" ").filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "-";
    const addressPayload = {
      first_name: firstName,
      last_name: lastName,
      address1: agentData.address || order.shipping_address?.address1 || "",
      city: agentData.city || order.shipping_address?.city || "",
      phone: phoneToSync,
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
    if (!storeData) return { id: order.id, name: order.name, success: false, error: "Store connected nahi hai" };
    const { addressPayload, phoneToSync } = buildSyncPlan(order);
    try {
      await ensureHistorySnapshot(order);
      const res = await fetch(`${cfUrl}/shopify-update-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    setSyncResultModal({ title: "Sync Result", results });
  };

  const doUndoOrder = async (order) => {
    const storeData = store || ordersStore;
    const h = historyMap[String(order.id)];
    if (!storeData || !isHistoryValid(h)) {
      return { id: order.id, name: order.name, success: false, error: "Undo ke liye valid history nahi mili" };
    }
    try {
      const prevAddr = h.previous_shipping_address || {};
      const res = await fetch(`${cfUrl}/shopify-update-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setOrders(prev => prev.map(o => o.id === order.id
          ? { ...o, agent_data: prevAgent, agent_status: h.previous_status || null, synced_at: null, last_edited_at: null }
          : o
        ));
        setHistoryMap(prev => {
          const next = { ...prev };
          delete next[String(order.id)];
          return next;
        });
        return { id: order.id, name: order.name, success: true };
      }
      return { id: order.id, name: order.name, success: false, error: JSON.stringify(data.errors || data.error) };
    } catch (err) {
      return { id: order.id, name: order.name, success: false, error: err.message };
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
    setSyncResultModal({ title: "Undo Result", results });
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

  const EditableCell = ({ orderId, field, value, width = 100, maxChars = 20 }) => {
    const cellKey = `${orderId}-${field}`;
    const isEditing = editingCell === cellKey;
    const [val, setVal] = useState(value || "");
    useEffect(() => { setVal(value || ""); }, [value]);

    if (isEditing) return (
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") updateField(orderId, field, val); if (e.key === "Escape") setEditingCell(null); }}
          style={{ width, padding: "2px 5px", borderRadius: 5, border: "1px solid var(--ne-accent)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11 }} />
        <button onClick={() => updateField(orderId, field, val)}
          style={{ background: "var(--ne-grad)", border: "none", borderRadius: 5, color: "#fff", padding: "2px 5px", cursor: "pointer", fontSize: 10 }}>✓</button>
        <button onClick={() => setEditingCell(null)}
          style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 5, color: "var(--ne-text)", padding: "2px 5px", cursor: "pointer", fontSize: 10 }}>✕</button>
      </div>
    );

    return (
      <span onClick={() => setEditingCell(cellKey)}
        style={{ cursor: "pointer", color: value ? "var(--ne-text)" : "var(--ne-muted-2)", fontSize: 11, display: "block", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.35, maxWidth: width }}>
        {value || "—"}
      </span>
    );
  };

  if (error) return <div style={{ padding: "2rem", color: "var(--ne-danger)" }}>❌ {error}</div>;

  const tdBase = { padding: "7px 6px", verticalAlign: "top", overflow: "hidden" };
  const thBase = { padding: "7px 6px", textAlign: "left", color: "var(--ne-muted)", whiteSpace: "nowrap", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--ne-border)", background: "var(--ne-surface-2)" };
  const dateBtnStyle = (type) => ({
    padding: "5px 12px", borderRadius: 18, fontSize: 11, cursor: "pointer", fontWeight: 600, border: "1px solid",
    background: activeDateBtn === type ? "var(--ne-grad)" : "var(--ne-surface-2)",
    color: activeDateBtn === type ? "#fff" : "var(--ne-muted)",
    borderColor: activeDateBtn === type ? "transparent" : "var(--ne-border)",
  });

  const syncConfirmItems = syncConfirmModal?.items || [];
  const syncConfirmTotalPages = Math.ceil(syncConfirmItems.length / SYNC_CONFIRM_PER_PAGE) || 1;
  const syncConfirmPagedItems = syncConfirmItems.slice(
    (syncConfirmPage - 1) * SYNC_CONFIRM_PER_PAGE,
    syncConfirmPage * SYNC_CONFIRM_PER_PAGE
  );

  return (
    <div style={{ padding: "0.75rem", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ne-text)" }}>📦 Orders</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{currentStore?.store_name} — {tabFilteredOrders.length} orders</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button style={dateBtnStyle("today")} onClick={() => handleDateBtn("today")}>
          Today <span style={{ opacity: 0.85, fontWeight: 500 }}>({todayCount})</span>
        </button>
        <button style={dateBtnStyle("yesterday")} onClick={() => handleDateBtn("yesterday")}>
          Yesterday <span style={{ opacity: 0.85, fontWeight: 500 }}>({yesterdayCount})</span>
        </button>
        <button style={dateBtnStyle("7days")} onClick={() => handleDateBtn("7days")}>
          Last 7 Days <span style={{ opacity: 0.85, fontWeight: 500 }}>({last7Count})</span>
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setActiveDateBtn(null); }}
            style={{ padding: "5px 10px", borderRadius: 18, border: "1px solid var(--ne-danger)", background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✕ Clear</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "6px", flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Name, phone, order#..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 130, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActiveDateBtn(null); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActiveDateBtn(null); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" }} data-status-multi>
          <button onClick={() => setStatusMultiOpen(!statusMultiOpen)}
            style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}>
            {statusFilters.length === 0 ? "All Status ▼" : `${statusFilters.length} selected ▼`}
          </button>
          {statusMultiOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 9999, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "6px", minWidth: 180, marginTop: 4, boxShadow: "0 8px 30px rgba(0,0,0,.5)" }}>
              <div onClick={() => { setStatusFilters([]); setStatusMultiOpen(false); }}
                style={{ padding: "6px 10px", borderRadius: 7, cursor: "pointer", color: "var(--ne-muted)", fontSize: 11 }}>✕ Clear All</div>
              {STATUSES.map(s => (
                <div key={s.label} onClick={() => { setStatusFilters(prev => prev.includes(s.label) ? prev.filter(x => x !== s.label) : [...prev, s.label]); setPage(1); }}
                  style={{ padding: "6px 10px", borderRadius: 7, cursor: "pointer", color: s.color, fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = s.bg}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span>{statusFilters.includes(s.label) ? "✅" : "⬜"}</span>{s.label}
                </div>
              ))}
            </div>
          )}
        </div>
        <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          <option value="All">All Source</option>
          {["Meta", "TikTok", "Snapchat", "Google", "Direct"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={availableCities.includes(cityFilter) ? cityFilter : "All"} onChange={e => { setCityFilter(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          {availableCities.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={availableSKUs.includes(skuFilter) ? skuFilter : "All"} onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
          style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          <option value="All">All SKU</option>
          {availableSKUs.map(s => <option key={s}>{s}</option>)}
        </select>

        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--ne-muted)", fontWeight: 600 }}>{selectedIds.size} selected</span>
            <div style={{ position: "relative" }} data-bulk-status>
              <button onClick={() => setBulkStatusOpen(!bulkStatusOpen)}
                style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-accent-soft)", color: "var(--ne-accent)", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                Bulk Status ▼
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
              style={{ padding: "6px 12px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
              🔄 Bulk Sync ({selectedIds.size})
            </button>
            {selectedHaveValidHistory && (
              <button onClick={() => openUndoConfirm(orders.filter(o => selectedIds.has(o.id)))}
                style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid var(--ne-warning)", background: "var(--ne-warning-soft)", color: "var(--ne-warning)", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                ↩️ Bulk Undo
              </button>
            )}
            <button onClick={() => setSelectedIds(new Set())}
              style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 11, cursor: "pointer" }}>✕</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: "0.6rem", flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab ? "transparent" : "var(--ne-border)",
              background: activeTab === tab ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted)" }}>
            {tab}
            <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: activeTab === tab ? "rgba(255,255,255,0.22)" : "var(--ne-bg)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted-2)" }}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>Loading orders...</div>
      ) : (
        <div ref={tableRef} style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--ne-border)", flex: 1, overflowY: "auto", background: "var(--ne-surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 30 }} />
              <col style={{ width: 85 }} />
              <col style={{ width: 75 }} />
              <col style={{ width: 55 }} />
              <col style={{ width: 115 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 135 }} />
              <col style={{ width: 85 }} />
              <col style={{ width: 165 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 75 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 95 }} />
              <col style={{ width: 75 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 125 }} />
            </colgroup>
            <thead style={{ position: "sticky", top: 0, zIndex: 15 }}>
              <tr>
                <th style={{ ...thBase, width: 30 }}>
                  <input type="checkbox" checked={selectedIds.size === pagedOrders.length && pagedOrders.length > 0}
                    onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                </th>
                <th style={{ ...thBase, position: "sticky", left: 0, zIndex: 20, background: "var(--ne-surface-2)" }}>Order#</th>
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
                <th style={{ ...thBase, position: "sticky", right: 0, zIndex: 20, background: "var(--ne-surface-2)" }}>Status / Sync</th>
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
                const rowBg = isSelectedRow => isSelectedRow ? "var(--ne-accent-soft)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)");
                const syncState = getSyncState(order);
                const isSelected = selectedIds.has(order.id);
                const isCancelled = order.agent_status === "Cancelled";
                const hasValidHistory = isHistoryValid(historyMap[String(order.id)]);
                const isUndoing = undoingId === order.id;

                const syncBtn = () => {
                  if (syncState === "pending") return { bg: "var(--ne-warning-soft)", color: "var(--ne-warning)", label: "⚡ Ready to Sync" };
                  if (syncState === "synced") return { bg: "var(--ne-success-soft)", color: "var(--ne-success)", label: "✓ Synced" };
                  return { bg: "var(--ne-surface-2)", color: "var(--ne-muted-2)", label: "Sync" };
                };
                const sb = syncBtn();
                const bg = rowBg(isSelected);

                return (
                  <tr key={order.id} style={{ background: bg, borderBottom: "1px solid var(--ne-border)" }}>
                    <td style={{ ...tdBase, textAlign: "center" }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ ...tdBase, position: "sticky", left: 0, zIndex: 4, background: isSelected ? "var(--ne-accent-soft)" : "var(--ne-surface)", whiteSpace: "nowrap" }}>
                      <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 11 }}>{order.name}</a>
                    </td>
                    <td style={{ ...tdBase, color: "var(--ne-muted)", whiteSpace: "nowrap" }}>{date}</td>
                    <td style={{ ...tdBase, color: "var(--ne-muted-2)", whiteSpace: "nowrap" }}>{time}</td>
                    <td style={tdBase}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <EditableCell orderId={order.id} field="customer_name" value={fullName} width={110} maxChars={15} />
                        {isCancelled && cancellationReason && (
                          <span style={{ padding: "1px 6px", borderRadius: 6, fontSize: 9, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, whiteSpace: "nowrap", display: "inline-block" }}>
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
                    <td style={{ ...tdBase, color: "var(--ne-muted)", whiteSpace: "nowrap" }}>{unitPrices}</td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="shipping" value={String(shipping)} width={60} maxChars={7} /></td>
                    <td style={tdBase}><EditableCell orderId={order.id} field="discount" value={String(discount)} width={60} maxChars={7} /></td>
                    <td style={{ ...tdBase, color: "var(--ne-success)", fontWeight: 700, whiteSpace: "nowrap" }}>Rs. {Number(order.total_price).toLocaleString()}</td>
                    <td style={tdBase}>
                      <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 10, background: "var(--ne-surface-2)", color: SOURCE_COLORS[source], fontWeight: 700 }}>{source}</span>
                    </td>
                    <td style={tdBase}>
                      <EditableCell orderId={order.id} field="remarks" value={remarks} width={100} maxChars={18} />
                    </td>
                    <td style={{ ...tdBase, position: "sticky", right: 0, zIndex: 4, background: isSelected ? "var(--ne-accent-soft)" : "var(--ne-surface)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                        <button data-order-btn={order.id} onClick={(e) => handleStatusBtnClick(e, order.id)}
                          style={{ padding: "3px 9px", borderRadius: 8, fontSize: 10, background: status?.bg || "var(--ne-surface-2)", color: status?.color || "var(--ne-muted-2)", border: "none", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {order.agent_status || "Set ▼"}
                        </button>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button onClick={() => openSyncConfirm([order])}
                            style={{ padding: "2px 8px", borderRadius: 6, fontSize: 9, background: sb.bg, color: sb.color, border: "none", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                            {sb.label}
                          </button>
                          {hasValidHistory && (
                            <button onClick={() => openUndoConfirm([order])} disabled={isUndoing} title="Undo"
                              style={{ padding: "2px 5px", borderRadius: 6, fontSize: 11, lineHeight: 1, background: "var(--ne-warning-soft)", color: "var(--ne-warning)", border: "none", cursor: isUndoing ? "default" : "pointer" }}>
                              {isUndoing ? "⏳" : "↩️"}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagedOrders.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>Koi order nahi mila!</div>
          )}
        </div>
      )}

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

      {cancelReasonModal && (
        <div data-cancel-modal style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 999999, background: "var(--ne-surface-2)", border: "1px solid var(--ne-danger)", borderRadius: 10, padding: "8px", minWidth: 190, boxShadow: "0 8px 30px rgba(0,0,0,0.6)" }}>
          <div style={{ fontSize: 10, color: "var(--ne-danger)", fontWeight: 700, marginBottom: 6, paddingLeft: 4 }}>
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
                  Save
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

      {syncConfirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 560, maxWidth: "94vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>🔄 Sync Confirm — {syncConfirmItems.length} order{syncConfirmItems.length > 1 ? "s" : ""}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>Yeh changes Shopify pe push honge. Confirm karne se pehle review kar lo.</p>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {syncConfirmPagedItems.map(({ order, diff }) => (
                <div key={order.id} style={{ marginBottom: 12, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ne-accent)", marginBottom: 6 }}>{order.name}</div>
                  {diff.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>Koi change detect nahi hua.</div>
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
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: syncConfirmPage === 1 ? "default" : "pointer" }}>‹ Prev</button>
                <span style={{ fontSize: 11, color: "var(--ne-muted-2)", alignSelf: "center" }}>Page {syncConfirmPage} / {syncConfirmTotalPages}</span>
                <button onClick={() => setSyncConfirmPage(p => Math.min(syncConfirmTotalPages, p + 1))} disabled={syncConfirmPage === syncConfirmTotalPages}
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: syncConfirmPage === syncConfirmTotalPages ? "default" : "pointer" }}>Next ›</button>
              </div>
            )}

            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
                {syncRunning ? `⏳ Syncing... ${syncProgressCount}/${syncConfirmItems.length}` : ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSyncConfirmModal(null)} disabled={syncRunning}
                  style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: syncRunning ? "default" : "pointer" }}>
                  Cancel
                </button>
                <button onClick={confirmAndSync} disabled={syncRunning}
                  style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: syncRunning ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: syncRunning ? "default" : "pointer" }}>
                  {syncRunning ? "Syncing..." : "✓ Confirm & Sync"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {undoConfirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 420, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>↩️ Undo — {undoConfirmModal.orders.length} order{undoConfirmModal.orders.length > 1 ? "s" : ""}</h2>
            </div>
            <div style={{ padding: "14px 18px", maxHeight: 220, overflowY: "auto" }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ne-muted)" }}>
                In order(s) ki sync se pehli (purani) value Shopify pe wapas chali jayegi:
              </p>
              {undoConfirmModal.orders.map(o => (
                <div key={o.id} style={{ fontSize: 11, color: "var(--ne-accent)", marginBottom: 3 }}>{o.name}</div>
              ))}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setUndoConfirmModal(null)} disabled={undoRunning}
                style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: undoRunning ? "default" : "pointer" }}>
                Cancel
              </button>
              <button onClick={confirmUndo} disabled={undoRunning}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: undoRunning ? "var(--ne-border)" : "var(--ne-warning)", color: "#1A1300", fontSize: 12, fontWeight: 700, cursor: undoRunning ? "default" : "pointer" }}>
                {undoRunning ? "Undoing..." : "↩️ Confirm Undo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {syncResultModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 460, maxWidth: "94vw", maxHeight: "75vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{syncResultModal.title}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>
                ✅ {syncResultModal.results.filter(r => r.success).length} success, ❌ {syncResultModal.results.filter(r => !r.success).length} failed
              </p>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {syncResultModal.results.map(r => (
                <div key={r.id} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 6, alignItems: "flex-start" }}>
                  <span>{r.success ? "✅" : "❌"}</span>
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
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
          Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, tabFilteredOrders.length)} of {tabFilteredOrders.length}
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