// Checkout layout editor (Settings > Checkout): a live preview of the storefront checkout in the published theme's
// colours, where every field is a tile. Drag a tile to move it, drag its right-edge handle to change its width
// (snaps to 1/4, 1/3, 1/2, 2/3, 3/4, full, with Canva-style guide lines), drag its bottom handle to change the field
// height. Same 12-column grid as the storefront (CheckoutForm.svelte), so what you see is what customers get.
import { useEffect, useRef, useState } from "react";

import { SPAN_LABEL, COL_GAP, snapSpan, packRows } from "../lib/checkoutLayout";

export default function CheckoutCanvas({ device, layout, fields, names, labelOf, placeholderOf, required, theme, onChange, selected, onSelect }) {
  const gridRef = useRef(null);
  const [drag, setDrag] = useState(null);     // { name, x, y, w, h, over, side }
  const [resize, setResize] = useState(null); // { name, span, guideX, aligned }
  const [heightDrag, setHeightDrag] = useState(null);
  const lay = layout;
  const visible = lay.order.filter((n) => names.includes(n) && fields[n]);
  const rows = packRows(visible, lay.span);
  const t = theme;

  const gridBox = () => gridRef.current?.getBoundingClientRect();
  const colW = () => { const b = gridBox(); return b ? (b.width - COL_GAP * 11) / 12 : 20; };
  const colX = (col) => col * (colW() + COL_GAP); // left edge of a column, relative to the grid
  const tileRects = () => Object.fromEntries(visible.map((n) => [n, gridRef.current?.querySelector(`[data-tile="${n}"]`)?.getBoundingClientRect()]).filter(([, r]) => r));

  /* ---------------- move ---------------- */
  const startMove = (e, name) => {
    if (e.button !== 0) return;
    onSelect(name);
    const r = e.currentTarget.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    let active = false;
    const move = (ev) => {
      if (!active && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      active = true;
      const rects = tileRects();
      let over = null, side = "after";
      for (const [n, rr] of Object.entries(rects)) {
        if (n === name) continue;
        if (ev.clientX >= rr.left && ev.clientX <= rr.right && ev.clientY >= rr.top - lay.gap / 2 && ev.clientY <= rr.bottom + lay.gap / 2) {
          over = n;
          side = ev.clientX < rr.left + rr.width / 2 ? "before" : "after";
        }
      }
      setDrag({ name, x: ev.clientX - (start.x - r.left), y: ev.clientY - (start.y - r.top), w: r.width, h: r.height, over, side });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag((d) => {
        if (d && d.over) {
          const order = lay.order.filter((n) => n !== name);
          const i = order.indexOf(d.over) + (d.side === "after" ? 1 : 0);
          order.splice(i, 0, name);
          onChange({ ...lay, order });
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------------- width ---------------- */
  const startResize = (e, name) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(name);
    const startX = e.clientX, startSpan = lay.span[name] || 12;
    const row = rows.find((r) => r.some((x) => x.name === name));
    const startCol = row?.find((x) => x.name === name)?.col || 0;
    // edges of the other tiles: when the snapped edge lines up with one of them, the guide turns pink (like Canva)
    const otherEdges = rows.flatMap((r) => r.filter((x) => x.name !== name).flatMap((x) => [x.col, x.col + x.span]));
    const move = (ev) => {
      const raw = startSpan + (ev.clientX - startX) / (colW() + COL_GAP);
      const span = snapSpan(Math.max(3, raw));
      const edge = Math.min(12, startCol + span);
      setResize({ name, span, cw: colW(), guideX: colX(edge) - (edge === 12 ? 0 : COL_GAP / 2), aligned: otherEdges.includes(edge) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResize((r) => { if (r && r.span !== startSpan) onChange({ ...lay, span: { ...lay.span, [name]: r.span } }); return null; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------------- field height (all fields) ---------------- */
  const startHeight = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY, start = lay.input_height;
    const move = (ev) => setHeightDrag(Math.min(64, Math.max(34, Math.round(start + (ev.clientY - startY)))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setHeightDrag((h) => { if (h && h !== start) onChange({ ...lay, input_height: h }); return null; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Esc: drop the selection
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onSelect(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onSelect]);

  const ih = heightDrag || lay.input_height;
  const isDesktop = device === "desktop";
  const font = t.fontBody ? `'${t.fontBody}', system-ui, sans-serif` : "system-ui, sans-serif";
  const headFont = t.fontHeading ? `'${t.fontHeading}', system-ui, sans-serif` : font;

  const tile = (n) => {
    const span = resize?.name === n ? resize.span : lay.span[n] || 12;
    const sel = selected === n;
    const dragging = drag?.name === n;
    const isOver = drag?.over === n;
    const area = n === "address";
    return (
      <div key={n} data-tile={n} onPointerDown={(e) => startMove(e, n)}
        style={{ gridColumn: `span ${span}`, position: "relative", minWidth: 0, cursor: "grab", touchAction: "none", userSelect: "none", opacity: dragging ? 0.25 : 1,
          borderRadius: 12, padding: 4, margin: -4, outline: sel ? `2px solid ${t.accentUi}` : "1px dashed transparent", transition: "grid-column .2s, outline-color .15s" }}
        onMouseEnter={(e) => { if (!sel) e.currentTarget.style.outline = `1px dashed ${t.accentUi}88`; }}
        onMouseLeave={(e) => { if (!sel) e.currentTarget.style.outline = "1px dashed transparent"; }}>
        {isOver && <span style={{ position: "absolute", top: 0, bottom: 0, [drag.side === "before" ? "left" : "right"]: -8, width: 4, borderRadius: 4, background: t.accentUi, boxShadow: `0 0 0 3px ${t.accentUi}33` }} />}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: t.muted, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {labelOf(n)}{required(n) ? "" : " (optional)"}
        </div>
        <div style={{ height: area ? Math.max(ih * 1.7, 64) : ih, borderRadius: t.radius, border: `1px solid ${t.border}`, background: t.inputBg, color: t.muted, fontSize: 13, padding: "0 12px", display: "flex", alignItems: area ? "flex-start" : "center", paddingTop: area ? 10 : 0, overflow: "hidden", whiteSpace: "nowrap", transition: "height .15s" }}>
          {placeholderOf(n)}
        </div>
        {sel && (
          <>
            {/* width handle (right edge, like the Android tile editor) */}
            <span title="Drag to change the width" onPointerDown={(e) => startResize(e, n)}
              style={{ position: "absolute", right: -7, top: "50%", transform: "translateY(-50%)", width: 10, height: 34, borderRadius: 6, background: t.accentUi, border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", cursor: "ew-resize", touchAction: "none" }} />
            {/* height handle (bottom edge): changes the height of every field */}
            <span title="Drag to change the field height" onPointerDown={startHeight}
              style={{ position: "absolute", bottom: -7, left: "50%", transform: "translateX(-50%)", width: 34, height: 10, borderRadius: 6, background: t.accentUi, border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)", cursor: "ns-resize", touchAction: "none" }} />
            <span style={{ position: "absolute", top: -11, right: 6, fontSize: 10, fontWeight: 800, color: "#fff", background: t.accentUi, borderRadius: 6, padding: "1px 6px" }}>{SPAN_LABEL[span]}</span>
          </>
        )}
      </div>
    );
  };

  const form = (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: isDesktop ? 22 : 16 }}>
      <div style={{ fontFamily: headFont, fontSize: isDesktop ? 20 : 17, fontWeight: 700, color: t.text, marginBottom: 14 }}>Delivery address</div>
      <div ref={gridRef} style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", columnGap: COL_GAP, rowGap: lay.gap, transition: "row-gap .2s" }}>
        {/* column guides while resizing */}
        {resize && Array.from({ length: 13 }, (_, i) => (
          <span key={i} style={{ position: "absolute", top: -6, bottom: -6, left: i * (resize.cw + COL_GAP) - (i === 0 || i === 12 ? 0 : COL_GAP / 2), width: 1, background: `${t.accentUi}22`, pointerEvents: "none" }} />
        ))}
        {resize && <span style={{ position: "absolute", top: -10, bottom: -10, left: resize.guideX, width: 2, background: resize.aligned ? "#ec4899" : t.accentUi, pointerEvents: "none", boxShadow: resize.aligned ? "0 0 0 2px #ec489933" : "none" }} />}
        {visible.map(tile)}
      </div>
    </div>
  );

  const summary = (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, display: "grid", gap: 10, alignContent: "start" }}>
      <div style={{ fontFamily: headFont, fontSize: 16, fontWeight: 700, color: t.text }}>Your order</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ width: 40, height: 40, borderRadius: 8, background: t.inputBg, border: `1px solid ${t.border}` }} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>Your product</div><div style={{ fontSize: 11, color: t.muted }}>Default × 1</div></div>
        <b style={{ fontSize: 12.5, color: t.text }}>Rs 1,499</b>
      </div>
      <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 13, color: t.text }}><b>Total</b><b>Rs 1,499</b></div>
      <div style={{ height: 44, borderRadius: t.radius, background: t.button, color: t.buttonText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 700 }}>Place COD order</div>
    </div>
  );

  return (
    <div style={{ position: "relative" }}>
      <div style={isDesktop
        ? { border: "1px solid var(--ne-border)", borderRadius: 14, overflow: "hidden", background: t.bg, boxShadow: "0 10px 30px -18px rgba(0,0,0,.4)" }
        : { width: 372, maxWidth: "100%", margin: "0 auto", borderRadius: 38, padding: 10, background: "#0f0f14", boxShadow: "0 16px 40px -18px rgba(0,0,0,.55)" }}>
        {isDesktop && <div style={{ display: "flex", gap: 6, padding: "9px 12px", background: "var(--ne-surface)", borderBottom: "1px solid var(--ne-border)" }}>{["#ef4444", "#f59e0b", "#22c55e"].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}<span style={{ marginLeft: 10, fontSize: 11, color: "var(--ne-muted)" }}>{t.host}/checkout</span></div>}
        <div style={{ background: t.bg, borderRadius: isDesktop ? 0 : 30, overflow: "hidden", fontFamily: font, maxHeight: isDesktop ? "none" : 720, overflowY: isDesktop ? "visible" : "auto" }}>
          {!isDesktop && <div style={{ height: 26, display: "flex", justifyContent: "center", alignItems: "center" }}><span style={{ width: 90, height: 18, borderRadius: 12, background: "#0f0f14" }} /></div>}
          <div style={{ padding: isDesktop ? "14px 22px" : "8px 14px", borderBottom: `1px solid ${t.border}`, fontFamily: headFont, fontWeight: 800, color: t.text, textAlign: "center", fontSize: 15 }}>{t.storeName}</div>
          <div style={{ padding: isDesktop ? 22 : 12, display: "grid", gridTemplateColumns: isDesktop ? "minmax(0,1fr) 260px" : "1fr", gap: 16, alignItems: "start" }}>
            {form}
            {summary}
          </div>
        </div>
      </div>
      {drag && (
        <div style={{ position: "fixed", left: drag.x, top: drag.y, width: drag.w, height: drag.h, pointerEvents: "none", zIndex: 5000, transform: "rotate(-1.2deg) scale(1.03)", borderRadius: 12, background: t.surface, boxShadow: "0 18px 40px -12px rgba(0,0,0,.45)", outline: `2px solid ${t.accentUi}`, padding: 4, fontFamily: font }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: t.muted, marginBottom: 5 }}>{labelOf(drag.name)}</div>
          <div style={{ height: Math.min(drag.h - 24, ih), borderRadius: t.radius, border: `1px solid ${t.border}`, background: t.inputBg }} />
        </div>
      )}
      {heightDrag && <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", background: t.accentUi, color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "3px 8px" }}>Field height {heightDrag}px</div>}
    </div>
  );
}
