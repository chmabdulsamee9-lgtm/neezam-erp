// Deterministic, offline SKU generator — no AI/API call. Builds a product-level
// base code from the product title (or reuses an existing sibling variant's base
// code), appends a variant-level code derived from the variant's option tokens,
// and de-duplicates against the store-wide SKU set.

const STOPWORDS = new Set([
  "the", "for", "of", "with", "buy", "free", "best", "in", "pakistan", "original",
  "premium", "professional", "set", "decor", "wall", "home", "only", "now", "today",
  "your", "and", "style", "quality", "new", "sale", "offer", "pack", "piece", "pcs",
  "pc", "by", "dr", "solution", "plan", "month", "months", "day", "days", "no",
  "instant", "original",
]);

const SIZE_DICT = { "extra large": "XL", "xl": "XL", "xxl": "XXL", "large": "L", "medium": "M", "small": "S" };
const COLOR_DICT = { "black": "BLK", "gold": "GLD", "golden": "GLD", "silver": "SLV", "white": "WHT", "wood": "WD", "wooden": "WD", "acrylic": "AC" };

function significantWords(text) {
  const cleaned = String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  return cleaned.split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
}

function stripTrailingDigits(code) {
  return String(code || "").replace(/\d+$/, "");
}

function productCodeFromTitle(title) {
  const words = significantWords(title);
  if (words.length === 0) return "PROD";
  let code = words.map((w) => w[0].toUpperCase()).join("").slice(0, 6);
  if (code.length < 2) code = words[0].slice(0, 4).toUpperCase();
  return code;
}

function tokenCode(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();

  const buyGet = /buy\s*(\d+)\s*get\s*(\d+)/i.exec(raw);
  if (buyGet) return `B${buyGet[1]}G${buyGet[2]}`;

  if (lower === "standard" || lower === "1 tube" || /^1\s*(tube|unit|pc|piece|pcs)?$/.test(lower)) return "STD";

  if (SIZE_DICT[lower]) return SIZE_DICT[lower];
  if (COLOR_DICT[lower]) return COLOR_DICT[lower];

  if (lower === "yes") return "Y";
  if (lower === "no") return "N";

  const pcsMatch = /(\d+)\s*(pcs|pc|pieces)/i.exec(raw);
  if (pcsMatch) return `${pcsMatch[1]}PC`;

  const words = significantWords(raw);
  const firstWord = words[0] || lower.replace(/[^a-z0-9]/g, "");
  return firstWord.slice(0, 3).toUpperCase();
}

function variantCodeFromTitle(variantTitle) {
  const trimmed = String(variantTitle || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "default title") return "";
  const tokens = trimmed.split("/").map((t) => t.trim()).filter(Boolean);
  const codes = tokens.map(tokenCode).filter(Boolean);
  return codes.join("-");
}

function skuTaken(sku, existingStoreSkuSet) {
  const norm = String(sku).toLowerCase();
  if (!existingStoreSkuSet) return false;
  const keys = existingStoreSkuSet instanceof Map ? existingStoreSkuSet.keys() : existingStoreSkuSet;
  for (const key of keys) {
    if (String(key).trim().toLowerCase() === norm) return true;
  }
  return false;
}

export function generateSku({ productTitle, variantTitle, existingProductBaseCode, existingStoreSkuSet }) {
  const base = existingProductBaseCode
    ? stripTrailingDigits(existingProductBaseCode).toUpperCase()
    : productCodeFromTitle(productTitle);
  const variantCode = variantCodeFromTitle(variantTitle);
  const candidateBase = variantCode ? `${base}-${variantCode}` : base;

  if (!skuTaken(candidateBase, existingStoreSkuSet)) return candidateBase;
  let n = 2;
  while (skuTaken(`${candidateBase}-${n}`, existingStoreSkuSet)) n++;
  return `${candidateBase}-${n}`;
}

export function isDuplicateSku(candidateSku, existingStoreSkuSet, excludeVariantId) {
  const norm = String(candidateSku || "").trim().toLowerCase();
  if (!norm || !existingStoreSkuSet) return false;

  if (existingStoreSkuSet instanceof Map) {
    for (const [sku, variantId] of existingStoreSkuSet) {
      if (excludeVariantId != null && variantId === excludeVariantId) continue;
      if (String(sku).trim().toLowerCase() === norm) return true;
    }
    return false;
  }

  for (const sku of existingStoreSkuSet) {
    if (String(sku).trim().toLowerCase() === norm) return true;
  }
  return false;
}
