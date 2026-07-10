// Shared fetch/merge/cache logic for booked (Dex-tracked) orders — used by App.jsx's
// background preload, BookedOrders.jsx, aur CourierDashboard.jsx. Teeno jagah pehle
// alag-alag copies thi (manually sync karni parti thi har fix mein) — ab ek hi jagah hai.
import { supabase } from "./supabase";
import { getCachedBookedOrders, saveBookedOrdersBulk, getMeta, setMeta, getCachedOrders } from "./ordersCache";

const PAGE_SIZE = 1000;

export function bookedMetaKey(storeId) {
  return `bookedLastSyncedAt-${storeId}`;
}

// order_statuses se shuru (store_id + dex_tracking_number IS NOT NULL) — Shopify data
// (shopify_orders_cache) sirf matched (order_id wali) rows ke details ke liye chahiye.
// onProgress(count) — har page ke baad running-total report karta hai (loading-count UI ke liye)
export async function fetchBookedStatuses(storeId, onProgress) {
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
    onProgress?.(allRows.length);
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

// Granular 6-category bucketing (Status Funnel donut + CourierDetailedView tables) —
// BookedOrders.jsx ke apne 4-category bucketCourierStatus() se ALAG/independent hai, wahan
// koi change nahi kiya. Priority order (confirmed): Cancelled > Lost > Pickup Failed >
// Returned > Delivered > In Transit (default) — pehle jo match ho jaye wahi jeetta hai.
export const GRANULAR_STATUS_CATEGORIES = ["Delivered", "Returned", "Pickup Failed", "Cancelled", "Lost", "In Transit"];

export function bucketCourierStatusGranular(raw) {
  const s = (raw || "").toLowerCase();
  if (!s) return "In Transit";
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("lost")) return "Lost";
  if (s.includes("pickup") && s.includes("fail")) return "Pickup Failed";
  if (s.includes("return")) return "Returned";
  if (s.includes("deliver")) return "Delivered";
  return "In Transit";
}

// Dashboard.jsx ke DATE_FILTERS/getDateRange() jaisa hi pattern — Courier Dashboard aur
// Detailed View dono ke top-level date-filter ke liye reuse hota hai.
export const DATE_FILTERS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "Custom", value: "custom" },
];

export function getDateRange(dateFilter, customFrom, customTo) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dateFilter === "today") return { from: today, to: new Date(today.getTime() + 86400000) };
  if (dateFilter === "yesterday") {
    const y = new Date(today.getTime() - 86400000);
    return { from: y, to: today };
  }
  if (dateFilter === "7days") return { from: new Date(today.getTime() - 7 * 86400000), to: new Date(today.getTime() + 86400000) };
  if (dateFilter === "30days") return { from: new Date(today.getTime() - 30 * 86400000), to: new Date(today.getTime() + 86400000) };
  if (dateFilter === "custom" && customFrom && customTo) {
    return { from: new Date(customFrom), to: new Date(new Date(customTo).getTime() + 86400000) };
  }
  return { from: today, to: new Date(today.getTime() + 86400000) };
}

export function mergeStatusesWithCache(statuses, cacheMap) {
  return statuses.map((s) => {
    const raw = s.order_id ? cacheMap[String(s.order_id)] : null;
    return {
      id: s.order_id || `manual-${s.manual_order_number}`,
      name: raw?.name || s.manual_order_number || "—",
      customer: raw?.customer || null,
      shipping_address: raw?.shipping_address || null,
      total_price: raw?.total_price ?? null,
      created_at: raw?.created_at || null,
      agent_data: s,
      isManual: !s.order_id,
    };
  });
}

// courier_order_status (OMS-level, omsOrderStatus se aaya) hi authoritative source hai final-state
// ke liye — dex_status (granular logistics snapshot) sirf in-progress stage detect karne ke kaam
// aata hai (Timeline component mein). Real data se confirmed keyword-rules (2026-07-09 query se):
// "Delivery attempt failed"/"Deliver Failed" > "Return pending" > "Returned" > "Delivered" > "Lost
// damaged" > "Pickup failed" > "Canceled" — pehle jo match ho jaye wahi jeetta hai. Baaki
// (Last Mile Inbound/Transit to ship/Ready to ship/Shipping/NULL) abhi in-progress hain, final nahi.
export function bucketFinalStatus(courierOrderStatus) {
  const s = (courierOrderStatus || "").toLowerCase();
  if (s.includes("deliver") && s.includes("fail")) return "Delivery Failed";
  if (s.includes("return") && s.includes("pending")) return "Return Pending";
  if (s.includes("return")) return "Returned";
  if (s.includes("deliver")) return "Delivered";
  if (s.includes("lost")) return "Lost";
  if (s.includes("pickup") && s.includes("fail")) return "Pickup Failed";
  if (s.includes("cancel")) return "Cancelled";
  return null;
}

// "Poisoned" row = matched order (order_id hai, isManual false) jiska Shopify data cache-miss
// ki wajah se null reh gaya tha (name fallback "—" ban gaya). Manual/unmatched orders ke liye
// "—" bilkul sahi/expected hai (unka koi order_id/Shopify row hai hi nahi) — sirf matched
// orders ka "—" hona hi galat/poisoned signal hai.
function findPoisonedRows(rows) {
  return rows.filter((r) => !r.isManual && r.agent_data?.order_id && r.name === "—");
}

async function repairPoisonedRows(storeId, poisoned) {
  if (poisoned.length === 0) return [];
  const orderIds = poisoned.map((r) => r.agent_data.order_id);
  const cachedRows = await fetchCachedOrdersByIds(storeId, orderIds);
  const cacheMap = {};
  cachedRows.forEach((r) => { cacheMap[String(r.id)] = r.raw_data; });
  const statuses = poisoned.map((r) => r.agent_data);
  return mergeStatusesWithCache(statuses, cacheMap);
}

// Full-load-or-delta: cache khali ho to poora load karo, warna sirf changed rows.
// IndexedDB cache + meta ko silently populate/update karta hai (koi React state nahi) —
// App.jsx ka background preload isay fire-and-forget call karta hai; BookedOrders.jsx/
// CourierDashboard.jsx isi function ko apne mount-time refresh ke liye bhi use karte hain,
// aur returned rows se apna local state update kar lete hain. onProgress(count) sirf
// full-load path mein call hota hai (order_statuses page-by-page) — loading-count UI ke liye.
export async function syncBookedOrdersCache(storeId, eneezamId, onProgress) {
  const metaKey = bookedMetaKey(eneezamId);
  const cached = await getCachedBookedOrders(eneezamId);
  const cachedForStore = cached.filter((o) => o.agent_data?.store_id === storeId);
  const hasCacheForStore = cachedForStore.length > 0;

  if (hasCacheForStore) {
    // Self-heal: pehle kabhi poison hui rows (order_id hai lekin local-cache-miss ki wajah
    // se Shopify data khali reh gaya tha, "name" waghera "—" ban gaya) ko yahan targeted
    // lookup se theek karo — warna woh row kabhi khud repair nahi hoti (delta-sync sirf
    // updated_at badalne par hi us row ko dobara chhuta hai)
    const poisoned = findPoisonedRows(cachedForStore);
    const repaired = await repairPoisonedRows(storeId, poisoned);
    if (repaired.length > 0) await saveBookedOrdersBulk(eneezamId, repaired);

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
      await saveBookedOrdersBulk(eneezamId, deltaMerged);
    }
    await setMeta(metaKey, loadStartTime);
    return { full: false, rows: [...repaired, ...deltaMerged] };
  }

  const loadStartTime = new Date().toISOString();

  // Orders ka apna preload (App.jsx:autoLoadOrders) LOCAL "orders" IndexedDB cache already
  // bhar chuka hota hai usi waqt parallel mein — wahi se id->order map banate hain, taake
  // shopify_orders_cache ka network se DOBARA (redundant) fetch na karna pade. Yehi asal
  // wajah thi "kabhi 140 pe atak, kabhi 3000 pe" wale slow-load ki — do bhari network fetches
  // ek sath chal rahi hoti thi. Sirf agar local cache bhi khali ho (bilkul first-ever
  // app-open, dono cache cold) tabhi purana network-fallback chalta hai.
  const localOrders = await getCachedOrders(eneezamId);
  const [statuses, cacheMap] = await (async () => {
    if (localOrders.length > 0) {
      const s = await fetchBookedStatuses(storeId, onProgress);
      const map = {};
      localOrders.forEach((o) => { map[String(o.id)] = o; });
      return [s, map];
    }
    const [s, cachedRows] = await Promise.all([fetchBookedStatuses(storeId, onProgress), fetchAllCachedOrdersLite(storeId)]);
    const map = {};
    cachedRows.forEach((r) => { map[String(r.id)] = r.raw_data; });
    return [s, map];
  })();

  // Local-cache-miss ko silently trust nahi karte — jitne order_ids map mein nahi milay
  // (matched hain lekin abhi tak local "orders" cache mein nahi aaye, jaisे purane orders
  // jo background mein load ho rahe hote hain), unke liye ek chhoti targeted lookup karo —
  // yehi cache-poisoning bug ki asal wajah thi.
  const missingIds = statuses.filter((s) => s.order_id && !cacheMap[String(s.order_id)]).map((s) => s.order_id);
  if (missingIds.length > 0) {
    const missingRows = await fetchCachedOrdersByIds(storeId, missingIds);
    missingRows.forEach((r) => { cacheMap[String(r.id)] = r.raw_data; });
  }

  const merged = mergeStatusesWithCache(statuses, cacheMap);
  await saveBookedOrdersBulk(eneezamId, merged);
  await setMeta(metaKey, loadStartTime);
  return { full: true, rows: merged };
}
