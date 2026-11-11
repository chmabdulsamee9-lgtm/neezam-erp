// Shopify CDN images are stored at full size (often 2048px). Lists show them at 30-56px, so ask the CDN
// for a small copy instead (width is doubled for sharp screens). Other hosts and data: URLs are returned
// unchanged.
export function thumbUrl(src, cssPx = 56) {
  if (!src || typeof src !== "string") return src;
  let u;
  try { u = new URL(src); } catch { return src; }
  if (!/(^|\.)cdn\.shopify\.com$/.test(u.hostname) && !u.pathname.startsWith("/cdn/shop/")) return src;
  u.searchParams.set("width", String(Math.min(2048, Math.max(32, Math.round(cssPx * 2)))));
  return u.toString();
}
