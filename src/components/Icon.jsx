// Shared stroke-based icon set — replaces raw emoji glyphs (🚪⏳✓✕🏪✎🗑⚠️🔑📦🔄 etc.)
// across the app so every page renders a consistent, theme-aware SVG instead of a
// platform-dependent emoji glyph. Style mirrors App.jsx's existing NAV_ICONS set.
const PATHS = {
  logout: <><path d="M7 17H4.5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 4.5 3H7" /><path d="M13 14l4-4-4-4" /><path d="M17 10H7" /></>,
  pending: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>,
  check: <path d="M4 10.5l4 4 8-9" />,
  close: <><path d="M5 5l10 10" /><path d="M15 5L5 15" /></>,
  store: <><path d="M3 8.5 4 3h12l1 5.5" /><path d="M3 8.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /><path d="M4.5 8.5V17h11V8.5" /></>,
  edit: <><path d="M12.5 3.5l4 4L6 18H2v-4Z" /><path d="M11 5l4 4" /></>,
  trash: <><path d="M3.5 5.5h13" /><path d="M8 5.5V3.5h4v2" /><path d="M5.5 5.5 6.3 17h7.4l.8-11.5" /><path d="M8.3 9v5M11.7 9v5" /></>,
  warning: <><path d="M10 3 2 17h16Z" /><path d="M10 8v4" /><circle cx="10" cy="14.3" r=".9" fill="currentColor" stroke="none" /></>,
  key: <><circle cx="7" cy="13" r="3.5" /><path d="M9.5 10.5 17 3" /><path d="M13.5 6.5 16 4" /><path d="M15 8 17.5 5.5" /></>,
  package: <><path d="M10 2.5 17 6.5v7L10 17.5 3 13.5v-7Z" /><path d="M3 6.5 10 10.5 17 6.5" /><path d="M10 10.5v7" /></>,
  refresh: <><path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" /><path d="M16.5 3v3.5H13" /></>,
  truck: <><rect x="1.5" y="6" width="10" height="8" rx="1" /><path d="M11.5 9h3.7L18 12v2h-6.5" /><circle cx="5.5" cy="16" r="1.7" /><circle cx="14.5" cy="16" r="1.7" /></>,
  comment: <path d="M3 16.5 4 13.4A6.7 6.7 0 1 1 8.6 16L3 16.5Z" />,
  printer: <><rect x="4" y="2.5" width="12" height="5.5" rx="1" /><rect x="2.5" y="7.5" width="15" height="7" rx="1.5" /><rect x="5.5" y="12" width="9" height="5.5" rx="1" /></>,
  error: <><circle cx="10" cy="10" r="7.3" /><path d="M10 6.5v4" /><circle cx="10" cy="13.3" r=".9" fill="currentColor" stroke="none" /></>,
  search: <><circle cx="8.5" cy="8.5" r="5.5" /><path d="M16.5 16.5 13 13" /></>,
  link: <><path d="M8.5 11.5 11.5 8.5" /><path d="M9 6 11 4a3 3 0 0 1 4.2 4.2L13 10.5" /><path d="M11 14l-2 2a3 3 0 0 1-4.2-4.2L7 9.5" /></>,
  folder: <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3.5l1.5 2H16a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5Z" />,
  pin: <><path d="M10 18s5.5-5 5.5-9.3A5.5 5.5 0 0 0 4.5 8.7C4.5 13 10 18 10 18Z" /><circle cx="10" cy="8.3" r="2" /></>,
  scale: <><path d="M10 3.5v13" /><path d="M4 6.5h12" /><path d="M4 6.5 1.5 12a2.5 2.5 0 0 0 5 0Z" /><path d="M16 6.5 13.5 12a2.5 2.5 0 0 0 5 0Z" /><path d="M7 16.5h6" /></>,
  chart: <><path d="M3 17V9" /><path d="M9 17V3" /><path d="M15 17v-6" /></>,
  shop: <><path d="M3 8.5 4 3h12l1 5.5" /><path d="M3 8.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /><path d="M4.5 8.5V17h11V8.5" /><path d="M8 17v-4h4v4" /></>,
  database: <><ellipse cx="10" cy="5" rx="6.5" ry="2.5" /><path d="M3.5 5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V5" /><path d="M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" /></>,
}

export default function Icon({ name, size = 15, style, className, ...rest }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
      {...rest}
    >
      {path}
    </svg>
  )
}
