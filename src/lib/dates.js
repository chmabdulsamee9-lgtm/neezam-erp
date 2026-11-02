import { useEffect, useState } from "react";
import { workerFetch } from "./storeApi";

// One place for store-time-zone dates. The time zone comes from General settings (stores.general_settings,
// default Asia/Karachi). Only the eNeezam order screens use it so far; the older pages still format
// dates in the browser's own time zone (see the report).
export const DEFAULT_TIME_ZONE = "Asia/Karachi";
const zoneByStore = new Map(); // storeId -> IANA zone (ERP browser session cache)

export function formatStoreDate(iso, timeZone = DEFAULT_TIME_ZONE, { time = true } = {}) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "numeric", minute: "2-digit", hour12: true } : {}) }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function useStoreTimeZone(storeId, cfUrl) {
  const [zone, setZone] = useState(zoneByStore.get(storeId) || DEFAULT_TIME_ZONE);
  useEffect(() => {
    let alive = true;
    if (!storeId || !cfUrl) return undefined;
    if (zoneByStore.has(storeId)) { setZone(zoneByStore.get(storeId)); return undefined; }
    workerFetch(cfUrl, `/get-general-settings?store_id=${storeId}`).then(({ status, data }) => {
      const z = status === 200 ? data?.settings?.defaults?.time_zone : null;
      if (z) zoneByStore.set(storeId, z);
      if (alive && z) setZone(z);
    });
    return () => { alive = false; };
  }, [storeId, cfUrl]);
  return zone;
}
