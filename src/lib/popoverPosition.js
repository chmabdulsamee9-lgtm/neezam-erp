// Geometry for popups that live in a portal on document.body (position: fixed), so the sidebar and the Settings panel can never clip them.
// Pure: rects in, coordinates out. All numbers are viewport pixels.

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * A popup beside an edge (the sidebar edge), bottom aligned with the trigger.
 *   edge   : { left, right } of the sidebar (the popup sits just outside it)
 *   anchor : { top, bottom } of the trigger (decides the vertical position)
 *   size   : { w, h } wanted size (h is the measured height, 0 before the first measure)
 *   vp     : { w, h } viewport
 *   rtl    : the sidebar sits on the right, so the popup opens to its left
 * Returns { left, top, width, maxHeight }: always fully inside the viewport (margin px), shrinking width/height only when the viewport is smaller.
 */
export function placeBeside({ edge, anchor, size, vp, rtl = false, gap = 8, margin = 8 }) {
  const width = Math.min(size.w, Math.max(0, vp.w - margin * 2));
  const maxHeight = Math.max(0, vp.h - margin * 2);
  const height = Math.min(size.h || 0, maxHeight);
  const wantLeft = rtl ? edge.left - gap - width : edge.right + gap;
  const left = clamp(wantLeft, margin, vp.w - width - margin);
  const top = clamp(anchor.bottom - height, margin, vp.h - height - margin);
  return { left, top, width, maxHeight };
}

/** x of a one-line tooltip or flyout next to the sidebar edge: { left } normally, { right } (distance from the viewport's right) in RTL */
export function placeTip({ edge, vp, rtl = false, gap = 12 }) {
  return rtl ? { right: Math.max(0, vp.w - edge.left + gap) } : { left: edge.right + gap };
}
