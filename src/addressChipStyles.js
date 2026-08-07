// Shared chip styling for province/city/area/subarea display — used by Orders.jsx's
// AddressMatchBlock (editable chips) and BookedOrders.jsx's read-only chip row. Kept in its
// own module (not exported from a page component) so Vite Fast Refresh isn't broken by a
// component file exporting non-component values.
export const addressChipStyle = { padding: "2px 8px", borderRadius: 6, fontSize: 10.5, background: "var(--ne-surface)", color: "var(--ne-text)", fontWeight: 600, whiteSpace: "nowrap" };
export const addressChipMutedStyle = { ...addressChipStyle, color: "var(--ne-muted-2)", fontWeight: 500, fontStyle: "italic" };
