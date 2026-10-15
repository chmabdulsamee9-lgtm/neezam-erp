// Persistent "last known result" cache for server-paginated views (Orders / Booked / Dashboard / Home).
// Hamesha pehle yahan se foran dikhao, phir server se revalidate karo — sach hamesha server hai.
const DB_NAME = "neezam_views_db";
const STORE = "views";
const MAX_ENTRIES = 150;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "key" });
        os.createIndex("at", "at");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getView(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch (e) {
    return null;
  }
}

export async function setView(key, json) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      os.put({ key, at: Date.now(), json });
      const countReq = os.count();
      countReq.onsuccess = () => {
        let extra = countReq.result - MAX_ENTRIES;
        if (extra <= 0) return;
        const cur = os.index("at").openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c && extra > 0) { c.delete(); extra--; c.continue(); }
        };
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch (e) { /* ignore */ }
}

export async function clearViewCache() {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch (e) { /* ignore */ }
}
