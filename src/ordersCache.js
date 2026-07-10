// Browser ke IndexedDB mein orders cache karta hai, taake dusri baar Neezam
// khulne par data instantly (0 sec wait) dikhe, sirf naye/updated orders
// Supabase se aayein — poora 7000+ orders dobara load karne ki zaroorat nahi
//
// v3: har record ab store_id se partition hota hai (composite key
// "storeId::orderId" + "by_store" index) — pehle sirf keyPath "id" tha,
// jis wajah se do alag stores ka data ek hi global list mein mix ho jata
// tha jab kisi bhi store ka data ek dafa is browser mein cache ho chuka ho.

const DB_NAME = "neezam_orders_db";
const DB_VERSION = 3;
const ORDERS_STORE = "orders";
const META_STORE = "meta";
const BOOKED_STORE = "booked_orders";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      if (db.objectStoreNames.contains(ORDERS_STORE)) db.deleteObjectStore(ORDERS_STORE);
      const ordersStore = db.createObjectStore(ORDERS_STORE, { keyPath: "_cacheKey" });
      ordersStore.createIndex("by_store", "store_id", { unique: false });

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }

      if (db.objectStoreNames.contains(BOOKED_STORE)) db.deleteObjectStore(BOOKED_STORE);
      const bookedStore = db.createObjectStore(BOOKED_STORE, { keyPath: "_cacheKey" });
      bookedStore.createIndex("by_store", "store_id", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedOrders(storeId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ORDERS_STORE, "readonly");
      const idx = tx.objectStore(ORDERS_STORE).index("by_store");
      const req = idx.getAll(storeId);
      req.onsuccess = () => resolve((req.result || []).map(({ _cacheKey, ...rest }) => rest));
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.log("IndexedDB read error:", err.message);
    return [];
  }
}

export async function saveOrdersBulk(storeId, orders) {
  if (!orders || !orders.length) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ORDERS_STORE, "readwrite");
      const store = tx.objectStore(ORDERS_STORE);
      orders.forEach((o) => store.put({ ...o, store_id: storeId, _cacheKey: `${storeId}::${o.id}` }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("IndexedDB write error:", err.message);
  }
}

export async function upsertOrder(storeId, order) {
  return saveOrdersBulk(storeId, [order]);
}

export async function getCachedBookedOrders(storeId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKED_STORE, "readonly");
      const idx = tx.objectStore(BOOKED_STORE).index("by_store");
      const req = idx.getAll(storeId);
      req.onsuccess = () => resolve((req.result || []).map(({ _cacheKey, ...rest }) => rest));
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.log("IndexedDB read error:", err.message);
    return [];
  }
}

export async function saveBookedOrdersBulk(storeId, rows) {
  if (!rows || !rows.length) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKED_STORE, "readwrite");
      const store = tx.objectStore(BOOKED_STORE);
      rows.forEach((r) => store.put({ ...r, store_id: storeId, _cacheKey: `${storeId}::${r.id}` }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("IndexedDB write error:", err.message);
  }
}

export async function getMeta(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const store = tx.objectStore(META_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

export async function setMeta(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      const store = tx.objectStore(META_STORE);
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("IndexedDB meta write error:", err.message);
  }
}

export async function clearCache() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([ORDERS_STORE, META_STORE, BOOKED_STORE], "readwrite");
      tx.objectStore(ORDERS_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.objectStore(BOOKED_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("IndexedDB clear error:", err.message);
  }
}
