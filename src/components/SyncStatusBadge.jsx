import { useSyncContext } from "../context/SyncContext";
import Icon from "./Icon";

// Mounted at the app-shell level (App.jsx topbar) so it stays visible across page
// navigation — SyncProvider lives above BrowserRouter in main.jsx, so its state survives
// route changes within the SPA regardless of which page this badge happens to render on.
export default function SyncStatusBadge() {
  const { syncMap } = useSyncContext();
  const activeEntries = Object.entries(syncMap || {}).filter(([, entry]) => entry.syncing);
  if (activeEntries.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      {activeEntries.map(([storeId, entry]) => {
        const pct = entry.totalCount ? Math.round((entry.syncedCount / entry.totalCount) * 100) : null;
        return (
          <div key={storeId} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
            borderRadius: 20, background: "var(--ne-accent-soft)", color: "var(--ne-accent)",
            fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            <Icon name="pending" size={11} />
            {entry.storeName ? `Syncing ${entry.storeName}: ` : "Syncing: "}
            {entry.syncedCount.toLocaleString()}
            {entry.totalCount ? `/${entry.totalCount.toLocaleString()}` : ""}
            {pct !== null ? ` (${pct}%)` : ""}
          </div>
        );
      })}
    </div>
  );
}
