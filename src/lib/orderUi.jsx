// Small presentational helpers for orders (money format and a tone badge), shared by the order detail page.
export const money = (n, currency = "PKR") => `${currency === "PKR" ? "Rs" : currency} ${Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export function Badge({ tone = "muted", children }) {
  const tones = {
    muted: ["var(--ne-surface)", "var(--ne-muted)"], success: ["var(--ne-success-soft)", "var(--ne-success)"],
    warning: ["var(--ne-warning-soft)", "var(--ne-warning)"], danger: ["rgba(239,68,68,.14)", "var(--ne-danger)"], accent: ["var(--ne-accent-soft)", "var(--ne-accent)"],
  };
  const [bg, fg] = tones[tone] || tones.muted;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>;
}
