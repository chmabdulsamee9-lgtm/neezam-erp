// Shared fetch/merge/cache logic for booked (Dex-tracked) orders — used by App.jsx's
// background preload, BookedOrders.jsx, aur CourierDashboard.jsx. Teeno jagah pehle
// alag-alag copies thi (manually sync karni parti thi har fix mein) — ab ek hi jagah hai.
import { supabase } from "./supabase";
import { getCachedBookedOrders, saveBookedOrdersBulk, getMeta, setMeta } from "./ordersCache";

const PAGE_SIZE = 1000;

export function bookedMetaKey(storeId) {
  return `bookedLastSyncedAt-${storeId}`;
}

// order_statuses se shuru (store_id + dex_tracking_number IS NOT NULL) — Shopify data
// (shopify_orders_cache) sirf matched (order_id wali) rows ke details ke liye chahiye.
export async function fetchBookedStatuses(storeId) {
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

// updated_at hi teeno write-paths (call-center edit, live Dex API, Excel import) se touch
// hota hai, isliye yehi field "row change ho gayi" ka reliable delta-sync signal hai
export async function fetchBookedStatusesDelta(storeId, since) {
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

// Full load ke liye: poori store ka shopify_orders_cache ek bulk-paginated pass mein
// (koi .in() ID-filtering nahi) — Orders.jsx ke fetchAllCachedOrders() jaisa hi.
export async function fetchAllCachedOrdersLite(storeId) {
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
export async function fetchCachedOrdersByIds(storeId, ids) {
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

export function mergeStatusesWithCache(statuses, cacheMap) {
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

// Full-load-or-delta: cache khali ho to poora load karo, warna sirf changed rows.
// IndexedDB cache + meta ko silently populate/update karta hai (koi React state nahi) —
// App.jsx ka background preload isay fire-and-forget call karta hai; BookedOrders.jsx/
// CourierDashboard.jsx isi function ko apne mount-time refresh ke liye bhi use karte hain,
// aur returned rows se apna local state update kar lete hain.
export async function syncBookedOrdersCache(storeId) {
  const metaKey = bookedMetaKey(storeId);
  const cached = await getCachedBookedOrders();
  const hasCacheForStore = cached.some((o) => o.agent_data?.store_id === storeId);

  if (hasCacheForStore) {
    const lastSyncedAt = (await getMeta(metaKey)) || "2000-01-01T00:00:00Z";
    const loadStartTime = new Date().toISOString();
    const deltaStatuses = await fetchBookedStatusesDelta(storeId, lastSyncedAt);
    let deltaMerged = [];
    if (deltaStatuses.length > 0) {
      const orderIds = deltaStatuses.filter((s) => s.order_id).map((s) => s.order_id);
      const cachedRows = await fetchCachedOrdersByIds(storeId, orderIds);
      const cacheMap = {};
      cachedRows.forEach((r) => { cacheMap[String(r.id)] = r.raw_data; });
      deltaMerged = mergeStatusesWithCache(deltaStatuses, cacheMap);
      await saveBookedOrdersBulk(deltaMerged);
    }
    await setMeta(metaKey, loadStartTime);
    return { full: false, rows: deltaMerged };
  }

  const loadStartTime = new Date().toISOString();
  const [statuses, cachedRows] = await Promise.all([fetchBookedStatuses(storeId), fetchAllCachedOrdersLite(storeId)]);
  const cacheMap = {};
  cachedRows.forEach((r) => { cacheMap[String(r.id)] = r.raw_data; });
  const merged = mergeStatusesWithCache(statuses, cacheMap);
  await saveBookedOrdersBulk(merged);
  await setMeta(metaKey, loadStartTime);
  return { full: true, rows: merged };
}
