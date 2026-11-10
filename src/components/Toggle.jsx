// Small on/off switch shared by the Settings pages (same look as the Checkout and Shipping pages).
export default function Toggle({ on, onChange, label, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      style={{
        width: 34, height: 19, borderRadius: 10, border: "none", padding: 2, flexShrink: 0, cursor: disabled ? "not-allowed" : "pointer",
        background: on ? "var(--ne-accent)" : "var(--ne-border)", opacity: disabled ? 0.55 : 1, display: "inline-flex", alignItems: "center",
        justifyContent: on ? "flex-end" : "flex-start", transition: "background .15s",
      }}
    >
      <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff", display: "block" }} />
    </button>
  );
}
