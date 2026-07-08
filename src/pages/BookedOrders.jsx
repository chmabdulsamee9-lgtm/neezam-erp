import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { getCachedBookedOrders, saveBookedOrdersBulk, getMeta, setMeta } from "../ordersCache";

const PAGE_SIZE = 1000;
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

const STATUS_TABS = ["All", "Delivered", "Returned", "In Transit", "Failed Delivery"];
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

// Query-direction: order_statuses se shuru (store_id + dex_tracking_number IS NOT NULL),
// shopify_orders_cache sirf matched (order_id wali) rows ke customer/address details ke liye
// targeted lookup hota hai — manual/unmatched rows ke liye koi Shopify row hai hi nahi.
async function fetchBookedStatuses(storeId) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("order_statuses")
      .select("*")
      .eq("store_id", storeId)
      .not("dex_tracking_number", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

// Orders.jsx ke delta-sync jaisa: sirf woh rows jo lastSyncedAt ke baad update hui hon —
// updated_at hi teeno write-paths (call-center edit, live Dex API, Excel import) se touch
// hota hai, isliye yehi field "row change ho gayi" ka reliable signal hai
async function fetchBookedStatusesDelta(storeId, since) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("order_statuses")
      .select("*")
      .eq("store_id", storeId)
      .not("dex_tracking_number", "is", null)
      .gt("updated_at", since)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

// Full load ke liye: Orders.jsx ke fetchAllCachedOrders() jaisa hi — poori store ka
// shopify_orders_cache ek bulk-paginated pass mein (koi .in() ID-filtering nahi). Pehle
// yahan chunked .in() lookup thi (200 ids/query) jo 2000+ matched orders pe 10 sequential
// round-trips banati thi — yehi asal slowdown tha. Ab sirf 1-2 simple paginated queries hain.
async function fetchAllCachedOrdersLite(storeId) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("shopify_orders_cache")
      .select("id, raw_data")
      .eq("store_id", storeId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

// Delta refresh ke liye: sirf mutthi-bhar changed order_ids hote hain, isliye targeted
// chunked .in() lookup yahan theek/cheap hai (full-load ke bhari case se bilkul alag)
async function fetchCachedOrdersByIds(storeId, ids) {
  if (ids.length === 0) return [];
  let allRows = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("shopify_orders_cache")
      .select("id, raw_data")
      .eq("store_id", storeId)
      .in("id", chunk);
    if (error) throw error;
    allRows = allRows.concat(data || []);
  }
  return allRows;
}

function mergeStatusesWithCache(statuses, cacheMap) {
  return statuses.map((s) => {
    const raw = s.order_id ? cacheMap[String(s.order_id)] : null;
    return {
      id: s.order_id || `manual-${s.manual_order_number}`,
      name: raw?.name || s.manual_order_number || "—",
      customer: raw?.customer || null,
      shipping_address: raw?.shipping_address || null,
      agent_data: s,
      isManual: !s.order_id,
    };
  });
}

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

export default function BookedOrders({ storeId, ordersStore }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [courierFilter, setCourierFilter] = useState("All");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) loadBooked();
  }, [storeId]);

  const metaKey = `bookedLastSyncedAt-${storeId}`;

  // Orders.jsx ke autoLoadOrders() jaisa hi pattern: cache mein data ho to FORAN dikhao
  // (koi spinner nahi), phir background mein sirf changed rows (updated_at > lastSyncedAt)
  // silently fetch kar ke merge/cache update karo
  const loadBooked = async () => {
    setError("");
    try {
      const cached = await getCachedBookedOrders();
      const cachedForStore = cached.filter((o) => o.agent_data?.store_id === storeId);

      if (cachedForStore.length > 0) {
        setOrders(cachedForStore);
        setLoading(false);
        refreshBookedDelta();
        return;
      }

      setLoading(true);
      const loadStartTime = new Date().toISOString();
      const [statuses, cachedRows] = await Promise.all([fetchBookedStatuses(storeId), fetchAllCachedOrdersLite(storeId)]);
      const cacheMap = {};
      cachedRows.forEach((r) => { cacheMap[String(r.id)] = r.raw_data; });
      const merged = mergeStatusesWithCache(statuses, cacheMap);
      setOrders(merged);
      await saveBookedOrdersBulk(merged);
      await setMeta(metaKey, loadStartTime);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const refreshBookedDelta = async () => {
    try {
      const lastSyncedAt = (await getMeta(metaKey)) || "2000-01-01T00:00:00Z";
      const loadStartTime = new Date().toISOString();
      const deltaStatuses = await fetchBookedStatusesDelta(storeId, lastSyncedAt);
      if (deltaStatuses.length > 0) {
        const orderIds = deltaStatuses.filter((s) => s.order_id).map((s) => s.order_id);
        const cachedRows = await fetchCachedOrdersByIds(storeId, orderIds);
        const cacheMap = {};
        cachedRows.forEach((r) => { cacheMap[String(r.id)] = r.raw_data; });
        const deltaMerged = mergeStatusesWithCache(deltaStatuses, cacheMap);
        setOrders((prev) => {
          const map = {};
          prev.forEach((o) => { map[o.id] = o; });
          deltaMerged.forEach((o) => { map[o.id] = o; });
          return Object.values(map);
        });
        await saveBookedOrdersBulk(deltaMerged);
      }
      await setMeta(metaKey, loadStartTime);
    } catch (err) {
      console.log("Booked delta sync error:", err.message);
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const availableCouriers = ["All", ...new Set(orders.map((o) => o.agent_data.courier_name).filter(Boolean))].sort();

  const tabCounts = Object.fromEntries(
    STATUS_TABS.map((t) => [t, t === "All" ? orders.length : orders.filter((o) => bucketCourierStatus(o.agent_data.courier_order_status) === t).length])
  );

  const filtered = orders.filter((o) => {
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
    const matchTab = activeTab === "All" || bucketCourierStatus(ad.courier_order_status) === activeTab;
    const matchCourier = courierFilter === "All" || ad.courier_name === courierFilter;
    return matchSearch && matchTab && matchCourier;
  });

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pagedFiltered = filtered.slice((page - 1) * perPage, page * perPage);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "12px 14px", marginBottom: 8 };

  if (error) return <div style={{ padding: "2rem", color: "var(--ne-danger)" }}>❌ {error}</div>;

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🚚 Booked Orders</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.store_name} — {filtered.length} shipments</p>
        </div>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* Search + Courier Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: "0.6rem", flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Naam, phone, order#, tracking#..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        <select value={courierFilter} onChange={(e) => { setCourierFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {availableCouriers.map((c) => <option key={c} value={c}>{c === "All" ? "All Couriers" : c}</option>)}
        </select>
      </div>

      {/* Status Tabs */}
      <div style={{ display: "flex", gap: 7, marginBottom: "0.75rem", flexWrap: "wrap" }}>
        {STATUS_TABS.map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab ? "transparent" : "var(--ne-border)",
              background: activeTab === tab ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted)" }}>
            {tab}
            <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: activeTab === tab ? "rgba(255,255,255,0.22)" : "var(--ne-bg)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted-2)" }}>
              {tabCounts[tab] || 0}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>Is filter mein koi booked order nahi.</div>
      ) : (
        <div>
          {pagedFiltered.map((o) => {
            const ad = o.agent_data;
            const bucket = bucketCourierStatus(ad.courier_order_status);
            const meta = STATUS_BUCKET_META[bucket] || { color: "var(--ne-muted-2)", bg: "var(--ne-surface)" };
            const fullName = `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim();
            const phone = o.customer?.phone || o.shipping_address?.phone || "";
            const city = o.shipping_address?.city || "";
            const isExpanded = expandedIds.has(o.id);
            const shopifyUrl = `https://${ordersStore?.shopify_url}/admin/orders/${o.id}`;

            return (
              <div key={o.id} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {o.isManual ? (
                    <span style={{ color: "var(--ne-text)", fontWeight: 700, fontSize: 13 }}>{o.name}</span>
                  ) : (
                    <a href={shopifyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 13 }}>{o.name}</a>
                  )}
                  {o.isManual && (
                    <span title="Shopify mein match nahi mila — sirf Excel se courier data" style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
                      ⚠️ Unmatched/Manual
                    </span>
                  )}
                  {ad.courier_name && (
                    <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${courierColor(ad.courier_name)}22`, color: courierColor(ad.courier_name) }}>
                      {ad.courier_name}
                    </span>
                  )}
                  <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.color }}>
                    {ad.courier_order_status || bucket}
                  </span>
                  {ad.delivery_attempt_count > 1 && (
                    <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
                      ⚠️ {ad.delivery_attempt_count} attempts
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)", marginTop: 6, fontFamily: "monospace" }}>
                  📍 {ad.dex_tracking_number}
                </div>

                <div style={{ fontSize: 11, color: "var(--ne-muted)", marginTop: 4 }}>
                  {fullName || "—"} · {phone || "—"} · {city || "—"}
                </div>
                {ad.logistics_status_at && (
                  <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", marginTop: 2 }}>
                    Last update: {fmtDateTime(ad.logistics_status_at)}
                  </div>
                )}

                <button onClick={() => toggleExpand(o.id)}
                  style={{ width: "100%", marginTop: 8, padding: "6px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 10.5, cursor: "pointer", fontWeight: 600 }}>
                  {isExpanded ? "▲ Kam dikhao" : "▼ Tafseel dikhao"}
                </button>

                {isExpanded && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ne-border)", display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: "var(--ne-muted-2)", minWidth: 110 }}>📦 Package Created</span>
                      <span style={{ color: ad.package_created_at ? "var(--ne-text)" : "var(--ne-muted-2)" }}>{fmtDateTime(ad.package_created_at) || "—"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: "var(--ne-muted-2)", minWidth: 110 }}>🚚 Pickup Success</span>
                      <span style={{ color: ad.pickup_success_at ? "var(--ne-text)" : "var(--ne-muted-2)" }}>{fmtDateTime(ad.pickup_success_at) || "—"}</span>
                    </div>
                    {ad.return_success_at ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "var(--ne-muted-2)", minWidth: 110 }}>↩️ Returned</span>
                        <span style={{ color: "var(--ne-danger)" }}>{fmtDateTime(ad.return_success_at)}</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "var(--ne-muted-2)", minWidth: 110 }}>✅ Delivered</span>
                        <span style={{ color: ad.delivered_at ? "var(--ne-success)" : "var(--ne-muted-2)" }}>{fmtDateTime(ad.delivered_at) || "—"}</span>
                      </div>
                    )}
                    {ad.latest_fail_reason && (
                      <div style={{ padding: "5px 9px", borderRadius: 8, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content" }}>
                        ⚠️ {ad.latest_fail_reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination — Orders.jsx wala exact pattern */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
            Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
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
    </div>
  );
}
