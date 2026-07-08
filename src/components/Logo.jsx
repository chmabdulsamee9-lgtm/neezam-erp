import { useId } from "react";

// Flowline monogram — 4 nodes joined by a rising path, Aurora Ledger gradient (indigo→violet).
// animated=true add karta hai path-draw + staggered dot pop-in (splash screen ke liye,
// App.jsx ke SplashScreen mein wire hoga) — CSS keyframes theme.css mein hain
// (.ne-monogram-path / .ne-monogram-dot).
export function Monogram({ size = 32, animated = false }) {
  const gradId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5C7CFA" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <path
        d="M6 24 L14 13 L20 18 L27 7"
        stroke={`url(#${gradId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="100"
        className={animated ? "ne-monogram-path" : ""}
      />
      <circle className={animated ? "ne-monogram-dot" : ""} style={animated ? { animationDelay: "0.8s" } : undefined} cx="6" cy="24" r="3.2" fill={`url(#${gradId})`} />
      <circle className={animated ? "ne-monogram-dot" : ""} style={animated ? { animationDelay: "0.95s" } : undefined} cx="14" cy="13" r="3.2" fill={`url(#${gradId})`} />
      <circle className={animated ? "ne-monogram-dot" : ""} style={animated ? { animationDelay: "1.1s" } : undefined} cx="20" cy="18" r="3.2" fill={`url(#${gradId})`} />
      <circle className={animated ? "ne-monogram-dot" : ""} style={animated ? { animationDelay: "1.25s" } : undefined} cx="27" cy="7" r="3.2" fill={`url(#${gradId})`} />
    </svg>
  );
}

// "e" gradient + "Neezam" solid — poori app mein wordmark ka single source of truth.
// animated=true wordmark ko fade+slide-up deta hai (splash ke liye, delay CSS mein set hai).
export function Wordmark({ size = 22, animated = false, className = "" }) {
  return (
    <span
      className={`${animated ? "ne-splash-wordmark" : ""} ${className}`.trim()}
      style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.5px" }}
    >
      <span className="ne-wordmark-e">e</span>Neezam
    </span>
  );
}

export default function Logo({ size = 32, wordmarkSize = 22, gap = 9, animated = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      <Monogram size={size} animated={animated} />
      <Wordmark size={wordmarkSize} animated={animated} />
    </div>
  );
}
