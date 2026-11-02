// Weight units are DISPLAY ONLY: storage stays in grams everywhere. These convert between the unit the
// store chose in General settings (kg with decimals, or g) and grams.
export const WEIGHT_UNITS = ["kg", "g"];

export function gramsToUnit(grams, unit) {
  if (grams === null || grams === undefined || grams === "") return null;
  const g = Number(grams);
  if (!Number.isFinite(g)) return null;
  return unit === "g" ? g : Math.round((g / 1000) * 1000) / 1000;
}

export function unitToGrams(value, unit) {
  if (value === null || value === undefined || value === "") return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  return unit === "g" ? Math.round(v) : Math.round(v * 1000);
}

/** order id preview, same format the worker uses */
export const formatOrderId = (prefix, suffix, n) => `${prefix ?? ""}${n}${suffix ?? ""}`;
