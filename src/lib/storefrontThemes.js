// Minimal mirror of neezam-storefront's src/themes/theme-definitions.ts — only what the Online
// Store page needs to draw CSS thumbnails. The ERP can't import the storefront's TS, so keep
// these in sync with that file when a theme's colours/fonts/radius change.
export const STOREFRONT_THEMES = [
  { id: 1, name: "Studio Mono", colors: { bg: "#ffffff", surface: "#f5f5f4", text: "#111111", textMuted: "#6f6f6f", accent: "#111111", border: "#e3e3e1" }, headingFont: "Archivo, sans-serif", bodyFont: "Inter, sans-serif", radius: "2px" },
  { id: 2, name: "Noir Luxe", colors: { bg: "#0a0a0b", surface: "#141416", text: "#ede4d3", textMuted: "#9a917f", accent: "#c6a15b", border: "#26252a" }, headingFont: "Playfair Display, serif", bodyFont: "Jost, sans-serif", radius: "10px" },
  { id: 3, name: "Velvet Nocturne", colors: { bg: "#2b0d17", surface: "#3a1220", text: "#f5ead9", textMuted: "#c9a9b0", accent: "#D3AF37", border: "#57202f" }, headingFont: "Playfair Display, serif", bodyFont: "Nunito Sans, sans-serif", radius: "8px" },
  { id: 4, name: "Bloom Pop", colors: { bg: "#fff5f8", surface: "#ffffff", text: "#3d2530", textMuted: "#8a6474", accent: "#e66386", border: "#ffd3e0" }, headingFont: "Barlow, sans-serif", bodyFont: "Barlow, sans-serif", radius: "18px" },
  { id: 5, name: "Clinic Bright", colors: { bg: "#ffffff", surface: "#e5f2ff", text: "#073279", textMuted: "#5b84b8", accent: "#2e6eb0", border: "#bcd6f4" }, headingFont: "Poppins, sans-serif", bodyFont: "Poppins, sans-serif", radius: "20px" },
  { id: 6, name: "Circuit Lime", colors: { bg: "#0b0b0d", surface: "#16161a", text: "#f2f2f0", textMuted: "#9a9a8e", accent: "#c8f542", border: "#26262d" }, headingFont: "Space Grotesk, sans-serif", bodyFont: "Space Grotesk, sans-serif", radius: "16px" },
  { id: 7, name: "Garden Mint", colors: { bg: "#edf7ee", surface: "#ffffff", text: "#1e3d2b", textMuted: "#5f7d68", accent: "#e55a8a", border: "#cfe4d2" }, headingFont: "Quicksand, sans-serif", bodyFont: "Quicksand, sans-serif", radius: "20px" },
  { id: 8, name: "Rose Slate", colors: { bg: "#f3f4f6", surface: "#ffffff", text: "#1f2430", textMuted: "#67707f", accent: "#e8416c", border: "#e2e5ea" }, headingFont: "Montserrat, sans-serif", bodyFont: "Montserrat, sans-serif", radius: "16px" },
];

export function getStorefrontTheme(id) {
  return STOREFRONT_THEMES.find((th) => th.id === Number(id)) || STOREFRONT_THEMES[0];
}
