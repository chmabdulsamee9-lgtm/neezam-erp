// Traffic source of an order (Direct / Meta / TikTok / Snapchat / Google), the same for Shopify and eNeezam orders.
// Mirrors the database's order_source(): substrings of referring_site + landing_site + source_name.
// referring_site alone is unreliable (in-app browsers strip the referrer), so landing_site (utm / fbclid) and
// source_name are signals too, with referring_site primary.
export function getOrderSource(order) {
  const ref = (order?.referring_site || "").toLowerCase();
  const landing = (order?.landing_site || "").toLowerCase();
  const sourceName = (order?.source_name || "").toLowerCase();
  const combined = `${ref} ${landing} ${sourceName}`;
  if (combined.includes("tiktok")) return "TikTok";
  if (combined.includes("facebook") || combined.includes("instagram") || combined.includes("fbclid") || combined.includes("meta") || combined.includes("fb")) return "Meta";
  if (combined.includes("snapchat")) return "Snapchat";
  if (combined.includes("google")) return "Google";
  return "Direct";
}
