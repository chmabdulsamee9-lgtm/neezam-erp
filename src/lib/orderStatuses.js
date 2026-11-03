// The 11 order statuses of the Orders list "Set" dropdown, shared by the list and the order detail page.
export const STATUSES = [
  { label: "Approved", color: "#34D88E", bg: "#11402A" },
  { label: "Under Verification", color: "#F2A83E", bg: "#3A2A0D" },
  { label: "Cancelled", color: "#F26D6D", bg: "#3A1414" },
  { label: "Not Answering", color: "#FB923C", bg: "#3A2410" },
  { label: "Powered Off", color: "#F472B6", bg: "#3A1130" },
  { label: "Hold", color: "#8C93C4", bg: "#161B45" },
  { label: "Busy", color: "#5C7CFA", bg: "#1C2356" },
  { label: "FAKE Order", color: "#F26D6D", bg: "#2A0E0E" },
  { label: "No WhatsApp", color: "#8C93C4", bg: "#1A1E40" },
  { label: "Callback Scheduled", color: "#A855F7", bg: "#26134A" },
  { label: "Wrong Number", color: "#F06FA8", bg: "#330F2A" },
];

// Native eNeezam orders are stored with a uuid id (Shopify ids are numeric).
export const isNativeOrderId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? ""));
