import { createContext, useContext, useState, useCallback, useRef } from "react";
import { supabase } from "../supabase";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

// Ultimate failsafe only — real stop conditions are data.done and the bounded-retry
// failure path below, not this cap.
const SAFETY_CAP = 500;
const BACKOFF_MS = [1000, 2000, 4000];

const emptyEntry = () => ({ syncing: false, syncedCount: 0, totalCount: null, error: null, retryCount: 0, storeName: "" });

const SyncContext = createContext(null);

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSyncContext must be used within a SyncProvider");
  return ctx;
}

// First use of React Context in this codebase — kept scoped to sync state only, per
// explicit scope: nothing else in the app is being refactored into Context here.
export function SyncProvider({ children }) {
  const [syncMap, setSyncMap] = useState({});
  // Guards against double-starting the same store's loop (e.g. a second click while one is
  // already in flight) — separate from React state since it needs to be read/written
  // synchronously, not after a re-render.
  const runningRef = useRef({});

  const updateEntry = useCallback((storeId, patch) => {
    setSyncMap((prev) => ({ ...prev, [storeId]: { ...(prev[storeId] || emptyEntry()), ...patch } }));
  }, []);

  const startSync = useCallback(async (store) => {
    const storeId = store.id;
    if (runningRef.current[storeId]) return;
    runningRef.current[storeId] = true;
    updateEntry(storeId, { syncing: true, error: null, retryCount: 0, storeName: store.store_name || "" });

    // Local to this one run — avoids reading retryCount back out of shared state (which
    // would be a stale closure across awaits inside this same async function).
    let localRetryCount = 0;
    let iterations = 0;

    try {
      while (iterations < SAFETY_CAP) {
        iterations++;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${CF_URL}/sync-orders-chunk?store_id=${storeId}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const data = await res.json();

        if (data.cursorExpired) {
          // Not a retry-exhausting failure — the next call hits a fresh start server-side
          // (status was set to "failed_expired"), so just surface a transient message and
          // keep going.
          //
          // This check is deliberately narrow (the specific cursorExpired flag, not a
          // generic "something went wrong") so that genuine failures — the circuit-breaker
          // trip and upsert-write failures the worker now also returns — never set this flag
          // and always fall through to the real error-handling branch below instead of being
          // treated as a soft continue.
          localRetryCount = 0;
          updateEntry(storeId, {
            syncedCount: data.synced_count ?? 0,
            totalCount: data.total_count ?? null,
            retryCount: 0,
            error: "Sync position expired, restarting from latest orders",
          });
          continue;
        }

        if (data.error) {
          localRetryCount += 1;
          if (localRetryCount < 3) {
            updateEntry(storeId, { retryCount: localRetryCount });
            await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[localRetryCount - 1]));
            continue;
          }
          updateEntry(storeId, {
            syncing: false,
            error: "Sync ruk gaya hai — dobara Sync dabayen taake jahan tak hua tha wahan se jari rahe",
            retryCount: localRetryCount,
          });
          break;
        }

        localRetryCount = 0;
        updateEntry(storeId, {
          syncedCount: data.synced_count ?? 0,
          totalCount: data.total_count ?? null,
          retryCount: 0,
          error: null,
        });

        if (data.done) {
          updateEntry(storeId, { syncing: false });
          break;
        }
      }
    } catch (err) {
      updateEntry(storeId, { syncing: false, error: err.message });
    } finally {
      runningRef.current[storeId] = false;
    }
  }, [updateEntry]);

  return (
    <SyncContext.Provider value={{ syncMap, startSync }}>
      {children}
    </SyncContext.Provider>
  );
}
