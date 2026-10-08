import { useId, useState } from "react";

// Sirf inline SVG + HTML overlays (koi chart library nahi). Rang CSS variables se aate hain,
// isliye light aur dark dono themes mein theek dikhte hain.
export function Sparkline({ values = [], color = "var(--ne-accent)", height = 28 }) {
  const v = values.length >= 2 ? values : [values[0] || 0, values[0] || 0];
  const max = Math.max(...v, 1);
  const W = 100;
  const d = v
    .map((val, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(2)} ${(height - 3 - (val / max) * (height - 6)).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden="true">
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TrendChart({ cur = [], prev = [], labels = [], color = "var(--ne-accent)", format = (v) => String(v), curLabel = "", prevLabel = "", height = 220 }) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);
  const pad = (a) => (a.length >= 2 ? a : [a[0] || 0, a[0] || 0]);
  const c = pad(cur);
  const p = pad(prev.length ? prev : cur.map(() => 0));
  const n = c.length;
  const W = 600, H = height, top = 10, bottom = 6;
  const maxV = Math.max(1, ...c, ...p);
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => top + (H - top - bottom) * (1 - v / maxV);
  const toPath = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${toPath(c)} L${W} ${H - bottom} L0 ${H - bottom} Z`;
  const pickIdx = (clientX, el) => {
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
    return Math.round(f * (n - 1));
  };
  const tickEvery = Math.max(1, Math.ceil(n / 6));
  const leftPct = (i) => (i / (n - 1)) * 100;

  return (
    <div>
      <div
        style={{ position: "relative", height: H, touchAction: "pan-y" }}
        onMouseMove={(e) => setHover(pickIdx(e.clientX, e.currentTarget))}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => setHover(pickIdx(e.touches[0].clientX, e.currentTarget))}
        onTouchEnd={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }} aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.25 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((k) => {
            const gy = top + ((H - top - bottom) * k) / 3;
            return <line key={k} x1="0" x2={W} y1={gy} y2={gy} style={{ stroke: "var(--ne-border)" }} strokeWidth="1" vectorEffect="non-scaling-stroke" />;
          })}
          <path d={area} fill={`url(#${gid})`} />
          <path d={toPath(p)} fill="none" style={{ stroke: "var(--ne-muted-2)" }} strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={toPath(c)} fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {hover !== null && (
          <div style={{ pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: 0, bottom: bottom, left: `${leftPct(hover)}%`, width: 1, background: "var(--ne-border)" }} />
            <div style={{ position: "absolute", left: `${leftPct(hover)}%`, top: `${(y(c[hover]) / H) * 100}%`, width: 9, height: 9, borderRadius: "50%", background: color, transform: "translate(-50%,-50%)", border: "2px solid var(--ne-surface-2)" }} />
            <div
              style={{
                position: "absolute", top: 4, left: `${leftPct(hover)}%`,
                transform: leftPct(hover) < 20 ? "translateX(0)" : leftPct(hover) > 80 ? "translateX(-100%)" : "translateX(-50%)",
                background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 10,
                padding: "6px 10px", fontSize: 11.5, whiteSpace: "nowrap", color: "var(--ne-text)", boxShadow: "0 4px 14px rgba(0,0,0,.12)",
              }}
            >
              <div style={{ color: "var(--ne-muted)", marginBottom: 3 }}>{labels[hover] || ""}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                <span>{curLabel}</span>
                <b style={{ marginLeft: "auto" }}>{format(c[hover])}</b>
              </div>
              {prevLabel ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ne-muted)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ne-muted-2)" }} />
                  <span>{prevLabel}</span>
                  <b style={{ marginLeft: "auto" }}>{format(p[hover])}</b>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "relative", height: 18, marginTop: 6 }}>
        {labels.map((lb, i) =>
          i % tickEvery === 0 && i < n ? (
            <span
              key={i}
              style={{
                position: "absolute", left: `${leftPct(i)}%`, fontSize: 10, color: "var(--ne-muted)",
                transform: i === 0 ? "translateX(0)" : leftPct(i) > 92 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {lb}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}
