import { useState } from "react";

// Tooltip for the theme editor's buttons: the same look as the ERP sidebar tooltip (global .ne-toggle-tip and .ne-kbd
// classes from theme.css), shown on hover and on keyboard focus, positioned fixed from the trigger's rect so it is
// never clipped by the panel. `keys` renders shortcut chips, e.g. ["CTRL", "2"].
export default function Tip({ label, keys, placement = "bottom", children, block }) {
  const [pos, setPos] = useState(null);
  const show = (el) => {
    const r = el.getBoundingClientRect();
    // clamped so a tooltip on the far-left column never leaves the screen
    setPos(placement === "right" ? { left: r.right + 10, top: r.top + r.height / 2 } : { left: Math.max(90, r.left + r.width / 2), top: r.bottom + 8 });
  };
  return (
    <span style={{ display: block ? "flex" : "inline-flex", flex: block ? 1 : "none", minWidth: 0 }}
      onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setPos(null)}
      onFocus={(e) => show(e.currentTarget)} onBlur={() => setPos(null)}>
      {children}
      {pos && (
        <span role="tooltip" className={`ne-toggle-tip ne-toggle-tip-${placement}`} style={{ left: pos.left, top: pos.top, zIndex: 1400 }}>
          <span>{label}</span>
          {keys?.map((k, i) => <span key={k} className="ne-kbd" style={i === 0 ? { marginLeft: 4 } : undefined}>{k}</span>)}
        </span>
      )}
    </span>
  );
}
