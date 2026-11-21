// Checkout layout editor helpers (12-column grid, same as the storefront CheckoutForm.svelte).
export const SPANS = [3, 4, 6, 8, 9, 12];
export const SPAN_LABEL = { 3: "1/4", 4: "1/3", 6: "1/2", 8: "2/3", 9: "3/4", 12: "Full" };
export const COL_GAP = 12;
export const snapSpan = (v) => SPANS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 12);

/** rows the grid will make (CSS grid auto-placement, no dense packing): [[{name, span, col}]] */
export function packRows(names, span) {
  const rows = [];
  let row = [], used = 0;
  for (const n of names) {
    const s = span[n] || 12;
    if (used + s > 12 && row.length) { rows.push(row); row = []; used = 0; }
    row.push({ name: n, span: s, col: used });
    used += s;
  }
  if (row.length) rows.push(row);
  return rows;
}

