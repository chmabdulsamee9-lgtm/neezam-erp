import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
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
const MIDDLE_CONTENT_WIDTH = 980; // Customer+Address+Items+Pricing+Total+Source+Courier+Remarks + gaps — single source of truth so header/rows/scrollbar always match
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
    setSyncResultModal({ title: "Sync Result", results });
  };

  // ---------- UNDO ----------
  const doUndoOrder = async (order) => {
    const storeData = store || ordersStore;
    const h = historyMap[String(order.id)];
    if (!storeData || !isHistoryValid(h)) {
      return { id: order.id, name: order.name, success: false, error: "Undo ke liye valid history nahi mili" };
    }
    // Isi order ke liye pehle se ek undo chal raha ho to dobara start na karo
    // (do baar jaldi-jaldi click hone par historyMap/order_sync_history do baar consume na ho)
    if (undoInFlightRef.current.has(order.id)) {
      return { id: order.id, name: order.name, success: false, error: "Is order ka undo pehle se process ho raha hai" };
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
    setSyncResultModal({ title: "Undo Result", results });
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
    if (!storeData) { setNewOrderError("Store connected nahi hai"); return; }
    if (!newOrderForm.name.trim() || !newOrderForm.phone.trim()) {
      setNewOrderError("Naam aur phone zaroori hain");
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

  const EditableCell = ({ orderId, field, value, width = 100, multiline = false, clampLines = 2 }) => {
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
            style={{ background: "var(--ne-grad)", border: "none", borderRadius: 5, color: "#fff", padding: "2px 8px", cursor: "pointer", fontSize: 10 }}>✓</button>
          <button onClick={() => setEditingCell(null)}
            style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 5, color: "var(--ne-text)", padding: "2px 8px", cursor: "pointer", fontSize: 10 }}>✕</button>
        </div>
      </div>
    );

    return (
      <span onClick={() => setEditingCell(cellKey)} title={value || ""}
        style={{ cursor: "pointer", color: value ? "var(--ne-text)" : "var(--ne-muted-2)", fontSize: 11, display: "-webkit-box", WebkitLineClamp: clampLines, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", wordBreak: "break-word", lineHeight: 1.35, maxWidth: width }}>
        {value || "—"}
      </span>
    );
  };

  if (error) return <div style={{ padding: "2rem", color: "var(--ne-danger)" }}>❌ {error}</div>;

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
    const syncState = getSyncState(order);
    const isSelected = selectedIds.has(order.id);
    const isCancelled = order.agent_status === "Cancelled";
    const hasValidHistory = isHistoryValid(historyMap[String(order.id)]);
    const isUndoing = undoingId === order.id;
    const isExpanded = expandedIds.has(order.id);

    const sb = syncState === "pending" ? { bg: "var(--ne-warning-soft)", color: "var(--ne-warning)", label: "⚡ Ready to Sync" }
      : syncState === "synced" ? { bg: "var(--ne-success-soft)", color: "var(--ne-success)", label: "✓ Synced" }
      : { bg: "var(--ne-surface-2)", color: "var(--ne-muted-2)", label: "Sync" };

    const statusBtn = (
      <button data-order-btn={order.id} onClick={(e) => handleStatusBtnClick(e, order.id)}
        style={{ padding: "3px 9px", borderRadius: 8, fontSize: 10, background: status?.bg || "var(--ne-surface-2)", color: status?.color || "var(--ne-muted-2)", border: "none", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
        {order.agent_status || "Set ▼"}
      </button>
    );
    const syncRow = (
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
    );

    return { order, source, phone, fullName, city, address, products, skus, unitPrices, shipping, discount, remarks, cancellationReason, date, time, shopifyUrl, isSelected, isCancelled, hasValidHistory, isUndoing, isExpanded, statusBtn, syncRow };
  });

  return (
    <div style={{ padding: "0.75rem", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ne-text)" }}>📦 Orders</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{currentStore?.store_name} — {tabFilteredOrders.length} orders</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => { resetNewOrderForm(); setShowNewOrderModal(true); }}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            + New Order
          </button>
          <button onClick={() => setShowBulkModal(true)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            📤 Bulk Upload
          </button>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      {/* Date Quick Buttons */}
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

      {/* Search + Date Range */}
      <div style={{ display: "flex", gap: 6, marginBottom: "6px", flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Name, phone, order#..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 130, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
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

        {/* Bulk Actions */}
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

      {/* Tab Navigation — har tab apni alag pill hai (theme reference jaisa), shared box nahi */}
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
      ) : isMobile ? (
        <div ref={tableRef} style={{ flex: 1, overflowY: "auto" }}>
          {orderRows.map(({ order, source, phone, fullName, city, address, products, skus, unitPrices, shipping, discount, remarks, cancellationReason, date, time, shopifyUrl, isSelected, isCancelled, isExpanded, statusBtn, syncRow }) => (
            <div key={order.id} style={{ background: isSelected ? "var(--ne-accent-soft)" : "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "10px 12px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>{order.name}</a>
                <span style={{ marginLeft: "auto" }}>{statusBtn}</span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", marginTop: 4 }}>{date} · {time} · {skus}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ne-text)" }}>{fullName || "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>{city || "—"}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ne-success)" }}>Rs. {Number(order.total_price).toLocaleString()}</div>
              </div>

              <button onClick={() => toggleExpand(order.id)}
                style={{ width: "100%", marginTop: 8, padding: "6px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 10.5, cursor: "pointer", fontWeight: 600 }}>
                {isExpanded ? "▲ Kam dikhao" : "▼ Tafseel dikhao"}
              </button>

              {isExpanded && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div><span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>Phone: </span><EditableCell orderId={order.id} field="phone" value={phone} width={200} /></div>
                  <div><span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>Address: </span><EditableCell orderId={order.id} field="address" value={address} width={260} /></div>
                  <div><span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>Product: </span><EditableCell orderId={order.id} field="product" value={products} width={260} /></div>
                  <div style={{ display: "flex", gap: 14 }}>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)" }}>Unit: {unitPrices}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 3 }}>Ship: <EditableCell orderId={order.id} field="shipping" value={String(shipping)} width={50} /></div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", display: "flex", alignItems: "center", gap: 3 }}>Disc: <EditableCell orderId={order.id} field="discount" value={String(discount)} width={50} /></div>
                  </div>
                  {isCancelled && cancellationReason && (
                    <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: 10, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content" }}>{cancellationReason}</span>
                  )}
                  <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 10, background: "var(--ne-surface-2)", color: SOURCE_COLORS[source], fontWeight: 700, width: "fit-content" }}>{source}</span>
                  <div><span style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>Remarks: </span><EditableCell orderId={order.id} field="remarks" value={remarks} width={260} /></div>
                  {syncRow}
                </div>
              )}
            </div>
          ))}
          {orderRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>Koi order nahi mila!</div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <style>{`.ne-hide-scroll::-webkit-scrollbar{display:none} .ne-hide-scroll{scrollbar-width:none; -ms-overflow-style:none;}`}</style>

          <div ref={tableRef} style={{ flex: 1, overflowY: "auto" }}>

            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 8, position: "sticky", top: 0, zIndex: 5, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,.18)", padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, width: 136, padding: "0 8px 0 12px", boxSizing: "border-box" }}>
                <input type="checkbox" checked={selectedIds.size === pagedOrders.length && pagedOrders.length > 0}
                  onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                <span style={{ ...thBase, background: "none", border: "none", padding: 0 }}>Order#</span>
              </div>
              <div ref={registerMiddleRef("header")} onScroll={handleMiddleScroll("header")} className="ne-hide-scroll"
                style={{ overflowX: "auto", flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, width: MIDDLE_CONTENT_WIDTH }}>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 140, flexShrink: 0 }}>Customer</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 165, flexShrink: 0 }}>Address</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 145, flexShrink: 0 }}>Items</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 115, flexShrink: 0 }}>Pricing</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 85, flexShrink: 0 }}>Total</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 75, flexShrink: 0 }}>Source</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 90, flexShrink: 0, textAlign: "center" }}>Courier</span>
                  <span style={{ ...thBase, background: "none", border: "none", padding: 0, width: 95, flexShrink: 0 }}>Remarks</span>
                </div>
              </div>
              <div style={{ width: 130, flexShrink: 0, padding: "0 12px 0 14px", boxSizing: "border-box" }}>
                <span style={{ ...thBase, background: "none", border: "none", padding: 0 }}>Status / Sync</span>
              </div>
            </div>

            {orderRows.map(({ order, source, phone, fullName, city, address, products, skus, unitPrices, shipping, discount, remarks, cancellationReason, date, time, shopifyUrl, isSelected, isCancelled, statusBtn, syncRow }) => (
              <div key={order.id} style={{ display: "flex", alignItems: "stretch", gap: 0, background: isSelected ? "var(--ne-accent-soft)" : "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, marginBottom: 8, boxShadow: "0 2px 8px rgba(0,0,0,.18)", overflow: "hidden" }}>

                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 8px 10px 12px", flexShrink: 0, width: 136, boxSizing: "border-box" }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(order.id)} style={{ cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ width: 90, minWidth: 90 }}>
                    <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 11.5 }}>{order.name}</a>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", marginTop: 2 }}>{date}</div>
                    <div style={{ fontSize: 10, color: "var(--ne-muted-2)" }}>{time}</div>
                  </div>
                </div>

                <div ref={registerMiddleRef(order.id)} onScroll={handleMiddleScroll(order.id)} className="ne-hide-scroll"
                  style={{ overflowX: "auto", flex: "1 1 auto", minWidth: 0, padding: "10px 0" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, width: MIDDLE_CONTENT_WIDTH }}>
                    <div style={{ width: 140, minWidth: 140, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
                      <EditableCell orderId={order.id} field="customer_name" value={fullName} width={130} clampLines={1} />
                      <EditableCell orderId={order.id} field="phone" value={phone} width={130} clampLines={1} />
                      <EditableCell orderId={order.id} field="city" value={city} width={130} clampLines={1} />
                      {isCancelled && cancellationReason && (
                        <span style={{ padding: "1px 6px", borderRadius: 6, fontSize: 9, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content" }}>{cancellationReason}</span>
                      )}
                    </div>

                    <div style={{ width: 190, minWidth: 190, flexShrink: 0, overflow: "hidden" }}>
                      <EditableCell orderId={order.id} field="address" value={address} width={180} multiline clampLines={3} />
                    </div>

                    <div style={{ width: 160, minWidth: 160, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
                      <EditableCell orderId={order.id} field="sku" value={skus} width={150} clampLines={1} />
                      <EditableCell orderId={order.id} field="product" value={products} width={150} multiline clampLines={2} />
                    </div>

                    <div style={{ width: 115, minWidth: 115, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 10 }}>
                        <span style={{ color: "var(--ne-muted-2)", flexShrink: 0 }}>Unit</span>
                        <span title={unitPrices} style={{ color: "var(--ne-muted)", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{unitPrices}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                        <span style={{ color: "var(--ne-muted-2)" }}>Ship</span>
                        <EditableCell orderId={order.id} field="shipping" value={String(shipping)} width={55} clampLines={1} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
                        <span style={{ color: "var(--ne-muted-2)" }}>Disc</span>
                        <EditableCell orderId={order.id} field="discount" value={String(discount)} width={55} clampLines={1} />
                      </div>
                    </div>

                    <div style={{ width: 85, minWidth: 85, flexShrink: 0, overflow: "hidden", color: "var(--ne-success)", fontWeight: 700, fontSize: 12 }}>
                      Rs. {Number(order.total_price).toLocaleString()}
                    </div>

                    <div style={{ width: 75, minWidth: 75, flexShrink: 0, overflow: "hidden" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 10, background: "var(--ne-surface)", color: SOURCE_COLORS[source], fontWeight: 700 }}>{source}</span>
                    </div>

                    <div style={{ width: 90, minWidth: 90, flexShrink: 0, overflow: "hidden", textAlign: "center" }}>
                      {order.agent_data?.dex_tracking_number && (
                        <>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: 4, background: "var(--ne-accent-soft)", fontSize: 9, fontWeight: 700, color: "var(--ne-accent)", marginBottom: 2 }}>
                            {(order.agent_data.courier_name || "D")[0].toUpperCase()}
                          </span>
                          <div>
                            <a href={`https://www.dex.com.pk/tracking?references=${encodeURIComponent(order.agent_data.dex_tracking_number)}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 10, color: "var(--ne-accent)", textDecoration: "underline" }}>
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

                <div style={{ width: 130, minWidth: 130, flexShrink: 0, display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start", padding: "10px 12px 10px 14px", justifyContent: "center", boxSizing: "border-box" }}>
                  {statusBtn}
                  {syncRow}
                </div>
              </div>
            ))}

            {orderRows.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>Koi order nahi mila!</div>
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

      {/* ---------- SYNC CONFIRM MODAL ---------- */}
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

      {/* ---------- UNDO CONFIRM MODAL ---------- */}
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

      {/* ---------- SYNC/UNDO RESULT MODAL ---------- */}
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

      {/* ---------- CREATE NEW ORDER MODAL (TASK 10) ---------- */}
      {showNewOrderModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 440, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>+ New Order</h2>
            </div>
            <form onSubmit={createNewOrder} style={{ padding: "16px 18px" }}>
              <input type="text" placeholder="Naam" value={newOrderForm.name}
                onChange={e => setNewOrderForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="tel" placeholder="Phone" value={newOrderForm.phone}
                onChange={e => setNewOrderForm(f => ({ ...f, phone: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <textarea placeholder="Address" value={newOrderForm.address} rows={2}
                onChange={e => setNewOrderForm(f => ({ ...f, address: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10, resize: "vertical", fontFamily: "inherit" }} />
              <input type="text" placeholder="City" value={newOrderForm.city}
                onChange={e => setNewOrderForm(f => ({ ...f, city: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="text" placeholder="Product" value={newOrderForm.product}
                onChange={e => setNewOrderForm(f => ({ ...f, product: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="text" placeholder="SKU" value={newOrderForm.sku}
                onChange={e => setNewOrderForm(f => ({ ...f, sku: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />
              <input type="number" placeholder="Price" value={newOrderForm.price} step="0.01"
                onChange={e => setNewOrderForm(f => ({ ...f, price: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }} />

              {currentStore?.shopify_url && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ne-text)", cursor: "pointer", marginBottom: 12 }}>
                  <input type="checkbox" checked={newOrderCreateOnShopify} onChange={e => setNewOrderCreateOnShopify(e.target.checked)} />
                  Shopify order bhi banao
                </label>
              )}

              {newOrderError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{newOrderError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={newOrderSaving}
                  style={{ flex: 1, padding: "10px", background: newOrderSaving ? "var(--ne-border)" : "var(--ne-success)", color: newOrderSaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: newOrderSaving ? "default" : "pointer" }}>
                  {newOrderSaving ? "Create ho raha hai..." : "✓ Create Order"}
                </button>
                <button type="button" onClick={() => setShowNewOrderModal(false)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  Cancel
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
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>📤 Bulk Order Upload</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>CSV template download karo, fill karo, phir upload karo.</p>
            </div>

            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={downloadCsvTemplate}
                style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                ⬇ Download Template
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                📁 CSV Upload Karo
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: "none" }} />
              {bulkRows.length > 0 && <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{bulkRows.length} rows mile</span>}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {bulkRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)", fontSize: 12 }}>
                  Koi CSV upload nahi hui abhi.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Name", "Phone", "Address", "City", "Product", "SKU", "Price"].map(h => (
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
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: bulkPage === 1 ? "default" : "pointer" }}>‹ Prev</button>
                <span style={{ fontSize: 11, color: "var(--ne-muted-2)", alignSelf: "center" }}>
                  Page {bulkPage} / {Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE)}
                </span>
                <button onClick={() => setBulkPage(p => Math.min(Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE), p + 1))} disabled={bulkPage === Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE)}
                  style={{ padding: "3px 10px", borderRadius: 7, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 11, cursor: bulkPage === Math.ceil(bulkRows.length / BULK_PREVIEW_PER_PAGE) ? "default" : "pointer" }}>Next ›</button>
              </div>
            )}

            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
                {bulkImporting ? `⏳ Import ho raha hai... ${bulkProgress}/${bulkRows.length}` : bulkResult ? `✅ ${bulkResult.success} success, ❌ ${bulkResult.fail} failed` : ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeBulkModal} disabled={bulkImporting}
                  style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: bulkImporting ? "default" : "pointer" }}>
                  Close
                </button>
                <button onClick={confirmBulkImport} disabled={bulkImporting || bulkRows.length === 0}
                  style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: (bulkImporting || bulkRows.length === 0) ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: (bulkImporting || bulkRows.length === 0) ? "default" : "pointer" }}>
                  {bulkImporting ? "Importing..." : "✓ Confirm & Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
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