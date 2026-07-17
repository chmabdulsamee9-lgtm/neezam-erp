// Browser ke IndexedDB mein products_cache rows cache karta hai — ordersCache.js
// (src/ordersCache.js) ka exact partitioning pattern mirror karta hai, lekin apna
// alag/independent IndexedDB database use karta hai taake orders cache ke DB_VERSION
// bumps se koi interaction/risk na ho.
//
// Partition key hamesha eneezam_id hota hai (jaisa ordersCache.js mein "storeId" param
// naam se pass hota hai, waisa hi yahan bhi) — LEKIN products_cache row ka apna
// `store_id` field (real stores.id UUID, Shopify worker calls ke liye zaroori) ussay
// clobber NAHI karte, is liye partition apne alag `_partitionId` field mein store hoti hai.

const DB_NAME = "neezam_products_db";
const DB_VERSION = 1;
const PRODUCTS_STORE = "products";
const META_STORE = "meta";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
        const store = db.createObjectStore(PRODUCTS_STORE, { keyPath: "_cacheKey" });
        store.createIndex("by_partition", "_partitionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedProducts(eneezamId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PRODUCTS_STORE, "readonly");
      const idx = tx.objectStore(PRODUCTS_STORE).index("by_partition");
      const req = idx.getAll(eneezamId);
      req.onsuccess = () => resolve((req.result || []).map(({ _cacheKey, _partitionId, ...rest }) => rest));
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.log("Products IndexedDB read error:", err.message);
    return [];
  }
}

export async function saveProductsBulk(eneezamId, rows) {
  if (!rows || !rows.length) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PRODUCTS_STORE, "readwrite");
      const store = tx.objectStore(PRODUCTS_STORE);
      rows.forEach((r) => store.put({ ...r, _partitionId: eneezamId, _cacheKey: `${eneezamId}::${r.shopify_product_id}` }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("Products IndexedDB write error:", err.message);
  }
}

export async function upsertProduct(eneezamId, row) {
  return saveProductsBulk(eneezamId, [row]);
}

export async function getProductsMeta(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

export async function setProductsMeta(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("Products IndexedDB meta write error:", err.message);
  }
}

export async function clearProductsCache() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([PRODUCTS_STORE, META_STORE], "readwrite");
      tx.objectStore(PRODUCTS_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.log("Products IndexedDB clear error:", err.message);
  }
}
