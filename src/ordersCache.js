// Browser ke IndexedDB mein orders cache karta hai, taake dusri baar Neezam
// khulne par data instantly (0 sec wait) dikhe, sirf naye/updated orders
// Supabase se aayein — poora 7000+ orders dobara load karne ki zaroorat nahi

const DB_NAME = "neezam_orders_db";
const DB_VERSION = 1;
const ORDERS_STORE = "orders";
const META_STORE = "meta";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ORDERS_STORE)) {
        db.createObjectStore(ORDERS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedOrders() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ORDERS_STORE, "readonly");
      const store = tx.objectStore(ORDERS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.log("IndexedDB read error:", err.message);
    return [];
  }
}

export async function saveOrdersBulk(orders) {
  if (!orders || !orders.length) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ORDERS_STORE, "readwrite");
      const store = tx.objectStore(ORDERS_STORE);
      orders.forEach((o) => store.put(o));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("IndexedDB write error:", err.message);
  }
}

export async function upsertOrder(order) {
  return saveOrdersBulk([order]);
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
      const tx = db.transaction([ORDERS_STORE, META_STORE], "readwrite");
      tx.objectStore(ORDERS_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("IndexedDB clear error:", err.message);
  }
}