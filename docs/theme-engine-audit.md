# Theme engine audit (read-only)

Scope: `neezam-erp-worker/storefront` (Astro + Svelte, Cloudflare Worker) and the editor in `neezam-erp`. Nothing was changed, run against a live store, or deployed. Facts come from reading the code; anything not verified is marked "not sure".

## 1. How the 8 designs are implemented

One shared engine, eight skins. There are no per-design components.

- **Tokens:** `storefront/src/themes/theme-definitions.ts` defines colours, fonts, radii, shadows, spacing, button and card style for ids 1 to 8. `src/styles/themes.css` mirrors them as CSS variables under `[data-theme="N"]` (the file says to keep the two in sync by hand).
- **Selection:** `BaseLayout.astro` sets `<html data-theme>` from `theme_config.settings.active_theme_id` in a pre-paint inline script. `?theme=1..8` overrides it for preview.
- **Shared:** one header (`SiteHeader.astro`), one footer (`SiteFooter.astro`), one product card, one set of 33 universal section renderers, the five core pages. `themes.css` is 86 KB and `global.css` 9 KB; both ship to every page whatever the design.
- **Duplicated or design-specific:**
  - Per-design CSS blocks. Counts of `[data-theme="N"]` selectors: 1 -> 19, 2 -> 29, 3 -> 39, 4 -> 40, 5 -> 142, 6 -> 15, 7 -> 14, 8 -> 13.
  - Designs 5 to 8 also have their own section types and default layouts, prefixed `jp-`, `zero-`, `org-`, `vince-` (about 24 renderers in `section-render.ts`) and their own card markup (`themedCard`).
  - `SiteHeader.astro` renders a subnav strip per design 5 to 8, hidden by CSS. All four are in the HTML for every design.
- **Rough split:** the markup and logic are about 80% shared. The CSS is the duplicated part, and designs 5 to 8 carry most of the design-specific code. Not sure of exact percentages.

## 2. Section registry

- **Where:** `storefront/src/lib/storefront-layout.ts`, `SECTION_REGISTRY`: 57 types. The ERP copies it with `scripts/sync-section-registry.mjs` into `src/lib/themeEditor/registry.js` (generated, so it can drift if the sync is not re-run).
- **A section type needs three things:**
  1. A registry entry: `{type, label, group, locked?, templates, defaults, schema[]}`. `schema` is a flat list of `{key, label, kind: text|textarea|number|toggle|select|range}`.
  2. A renderer: `RENDERERS[type] = (section, ctx) => htmlString` in `src/lib/section-render.ts`.
  3. CSS in `themes.css`.
- **Mapping:** `theme_config.layouts.<template>.sections[] = {id, type, enabled, settings}`. `renderSections()` looks up `RENDERERS[type]` and concatenates the strings. Renderers are plain string functions, shared by the server render and the browser re-render, so output is byte-identical. Unknown types render nothing.
- **No components, no blocks:** sections are flat key/value settings. Repeated items are numbered keys (`slide2_title`, `s1_cta`, ...).
- **Core sections** (`*-main`) are markers. The real content is a Svelte island or Astro markup that the page carries into place.

## 3. Page and template model

- **Page types (5):** home, collection, product, cart, checkout. `thank-you` is a separate page with no layout. Other routes are `/api/geo-*` and the legacy `/admin/theme-settings` Svelte editor.
- **How a layout is chosen (inconsistent):**
  - Home (`pages/index.astro`): the server renders the saved `layouts.home.sections`, or `DEFAULT_LAYOUT(home, themeId)` when empty.
  - Collection, product, cart, checkout: the server renders `DEFAULT_LAYOUT(template)` only. `scripts/page-renderer.ts` then re-renders in the browser from the saved layout, swapping the live core node back in. So a saved layout on these pages applies after JS runs, with a flash of the default.
  - Note that these pages call `DEFAULT_LAYOUT(template)` without a theme id; whether designs 5 to 8 get their themed default on SSR for non-home pages is not sure.
  - One layout per page type. No per-product or per-collection templates.
- **Header and footer are not sections.** `SiteHeader.astro` (logo, Home, Shop, cart, theme subnavs) and `SiteFooter.astro` (a fixed "Shop" column, newsletter form, copyright) are in `BaseLayout.astro`. Only the store name, tagline and logo are configurable, through `data-slot` text swaps. The newsletter form is `action="#"` with `onsubmit="return false"`, so it does nothing. The only header-group section is `announcement-bar`.

## 4. How `theme_config` loads per request

- **SSR on every request** (`output: 'server'`, Cloudflare adapter). Nothing is static.
- **Flow:** `middleware.ts` resolves the host, calling the worker's `GET /get-store-by-subdomain` or `/get-store-by-domain`. The worker queries Supabase and returns the store row **with the whole `theme_config`** and the custom-domain list. Then each page fetches the catalog.
- **Tenant lookup is not cached.** There is no Cache API, KV or `s-maxage` on it. Each page view costs one storefront-to-worker fetch plus one Supabase query. Neither `jsonResponse` nor the tenant routes set `Cache-Control`.
- **Catalog is edge-cached:** the storefront's `cachedFeed()` uses the Cache API for 300 s. The worker caches too (`s-maxage=300, swr=600`). The worker still runs `getCatalogSource()` (a Supabase read) before checking its own cache.
- **HTML:** no `Cache-Control` is set by Astro pages, so they are not edge-cached by default. Not sure whether a Cloudflare zone rule overrides that.
- **Config reaches the browser twice:** it is embedded in an inline script (`window.__EN_THEME_CONFIG__`) and the catalog JSON in `#en-catalog` (capped at 250 products).
- **Invalidation on publish:** `POST /publish-store-theme` demotes the old published row, promotes the new one, and copies `theme_config` into `stores.theme_config`. The storefront reads `stores.theme_config`, not `store_themes`. There is no purge. A publish shows on the next request, because the tenant lookup is uncached. Catalog changes can lag up to 5 minutes (plus swr).
- **Draft editing:** `PUT /update-store-theme` writes `store_themes.theme_config` for a draft row. It does no validation of shape or size (not sure whether Supabase limits apply).

## 5. Images

- **Config references:** plain absolute URL strings in section settings (`image`, `slide2_image`, `s1_image`, `logo_url`). `isRenderableImage()` accepts `http(s)://`, `//` and `data:image/`. Anything else renders a placeholder block.
- **Products:** the worker's `store-product-images` Supabase Storage bucket (public URLs, `Cache-Control: max-age=31536000`) is filled by `/mirror-store-product-images`. Shopify-sourced images stay on Shopify's CDN. This is for products only: **there is no upload path for theme images.** The editor's image control is a URL field.
- **No resizing, no WebP/AVIF conversion, no `srcset`, no Cloudflare Image Resizing (`cdn-cgi/image`).** `<img>` gets width and height (so no layout shift) and `loading="lazy"`; the first hero gets `fetchpriority="high"`. Product cards use 800x800 slots regardless of display size.
- **Fonts:** self-hosted in `public/fonts` (772 KB total, immutable cache). Each page loads only the families it uses.

## 6. What would block

| Goal | Concrete blockers | Effort |
|---|---|---|
| (a) Blocks inside sections | Config model is flat; renderers are string functions with numbered keys, no `blocks[]`. Needs a schema extension (`blocks`, `block_types`, `max_blocks`), renderers rewritten per section to iterate blocks, the editor tree (children, add/reorder/delete), the preview bridge (block-level ids and selection), and a migration of `slide2_*` style keys to blocks. Existing configs keep working if the old keys stay as a fallback. | L (M for a handful of sections first) |
| (b) Footer as an editable section group | The footer is an Astro component outside `renderSections`. Needs `layouts.footer` (additive), footer section types (links, newsletter, text, social), a working newsletter endpoint, SSR plus client render for it, and editor group support. Header is the same problem, plus the sticky and subnav logic. | M (footer), M to L (header) |
| (c) Theme as a package (manifest, templates, sections, assets, settings schema) | Everything is compiled into one Astro build, so a theme cannot be loaded at runtime. Needs: a data-driven registry (schema in the package, not TypeScript); a renderer that runs from data (a template language or declarative layout) instead of compiled functions; per-theme asset storage; a settings schema that drives the editor (today the theme settings groups are hardcoded); per-theme CSS scoping, since `themes.css` assumes global `[data-theme]` selectors. Core islands (cart, checkout, product purchase) would need a stable contract. | L |
| (d) Third-party uploaded themes | All of (c), plus: sandboxing or a safe template language, upload validation and review, asset storage and quotas, CSP, versioning, tenant isolation, and a store listing. See section 8. | L (XL with a marketplace) |

## 7. Editor side: schema-driven or hardcoded

- **Schema-driven:** the section settings form (generated from the registry `schema`), the add-section list and categories (types and `templates` come from the registry, categories are a hardcoded map in `layout.js`), lock rules, and defaults.
- **Hardcoded in the editor:**
  - Theme settings groups (`SettingsPanels.jsx`): design theme, branding, colours, typography, product cards, pop-ups and badges, product page, advanced. Fields and their keys are written in JSX, not read from any schema.
  - Palette slots, element targets and font options (`settingsModel.js`; the storefront has its own copy in `lib/palette.ts`, so they can drift).
  - Section names and category names (i18n keys per type, with fallback to the registry label), and the page list.
  - Field labels come from the registry in English only.
- **Duplicated across repos:** the registry (generated copy), palette and font lists (hand-copied).

## 8. Security if outsiders could upload themes

Today's code is fine for the merchant-only model: renderers escape text through `esc()`. It would not be safe for outsiders, because merchants can already put in:

- **Raw CSS:** `settings.custom_css` goes into a `<style>` unfiltered (`BaseLayout.astro`, `apply-overrides.ts`). That allows CSS exfiltration through `url()`, UI overlay and clickjacking. It cannot run script.
- **Unvalidated link targets:** `href="${esc(...)}"` only HTML-escapes, so a `javascript:` URL in `cta_href` or `link_href` would execute on click. This is script injection by the merchant on their own storefront; for outsiders it would be exploitable. Add a scheme allowlist.
- **Arbitrary image URLs:** any `https:` or `data:image/` URL, so tracking pixels and third-party hosts are possible.
- **Config in an inline script:** `define:vars` embeds the whole config. Astro's handling of `</script>` in that value I believe escapes it but am **not sure**; verify before trusting.
- **Where unsafe code would run:** (1) the storefront worker, which holds the tenant lookup and renders HTML as strings, so a template language there needs a sandbox; (2) the customer's browser on the store origin, where cart and checkout live, so injected script could read checkout form data; (3) the ERP editor, which loads the storefront in an iframe with a short-lived edit token passed in the URL (`token=`). A malicious theme running in that frame could read it through `location`. The token is valid 20 minutes and scoped to a store.
- **Required for outsiders:** run theme code in isolation (separate origin or a sandboxed iframe or isolate), no direct DOM or `innerHTML` from theme data, a strict CSP, no arbitrary script, a declarative or sandboxed template language, and review before listing.

## 9. Performance

Measured: only the built `dist/` sizes. Everything else is estimated from the code.

- **Per page, server side:** 1 tenant fetch to the worker, uncached, then 1 Supabase query behind it. Plus 1 catalog fetch (edge-cached 300 s), and on a product page a second product fetch. In preview mode there is also a token verify call. The worker also reads `catalog_source` from Supabase before it checks its own cache (even on a cache hit; not sure of the impact).
- **Latency risk:** the tenant lookup has no timeout (`fetch` without `AbortSignal`), unlike the catalog (8 s). A slow worker blocks every page.
- **Payload:** the full `theme_config` is in the HTML twice in effect (inline script plus rendered sections). The catalog is embedded as JSON (up to 250 products with variants) on every page that passes `catalog`.
- **JS shipped:** `dist/_astro` totals about 2.3 MB with `dist`, but the largest chunks are admin-only (`leaflet` 150 KB, `ThemeEditor` 45 KB, the `theme-settings` CSS 100 KB). A customer page loads the Svelte runtime and islands: `CartBadge` (client:load), `QuickView` (client:idle), `ProductPurchase` (client:load, product page), `CollectionControls`, plus `section-render` (25 KB) and `storefront-layout` (21 KB) because the browser re-renders. `CheckoutForm` is about 43 KB, plus Leaflet on checkout if the map is used (not sure it is lazy). `web-vitals` is added on real stores.
- **Double render:** collection, product, cart and checkout render the default on the server, then redraw the page in the browser when a saved layout exists: extra JS work, a flash, and poor CLS or LCP on those pages. Home renders the saved layout on the server and can still redraw if the HTML differs.
- **CSS:** about 95 KB of unminified source CSS for all eight designs on every page.
- **Images:** no resize or WebP, so a product image is served at source size into 800x800 slots; lazy loading is used, which helps.

## Recommended migration path (existing `theme_config` keeps working)

1. **Fix what blocks everything, with no format change.** Make non-home pages render the saved layout on the server (as home does), keeping the browser renderer as a fallback. Cache the tenant lookup (Cache API or KV with a short TTL and a purge on publish). Add a timeout to the lookup. Allowlist `href` schemes and validate `theme_config` shape and size on save. (S to M)
2. **Add `version` and optional `blocks` (additive).** Treat a missing `version` as v1. Add `blocks: [{id,type,settings}]` to a section instance and a `blocks` entry to registry entries. Convert 3 or 4 sections with repeated keys (hero slides, FAQ, testimonials, usp) first. Renderers read `blocks` when present and fall back to the numbered keys. The editor shows a block list only for types that declare blocks. (M)
3. **Move the registry to data.** Generate JSON from the TypeScript registry and have the storefront and the ERP both read that JSON, removing the generated copy and the duplicated palette and font lists. Drive the theme-settings groups from a `settings_schema` in the same format. (M)
4. **Footer and header groups.** Add `layouts.footer` (and later `layouts.header`) as additive keys; if absent, render today's footer. Wire up the newsletter. (M)
5. **Package format for first-party themes.** `{manifest, settings_schema, sections[], templates[], assets}` as JSON, with CSS scoped per theme. Convert the 8 existing designs into packages while keeping `active_theme_id` 1 to 8 as aliases, so saved configs still resolve. Add image upload with resize and WebP. (L)
6. **Only then consider third-party themes.** Requires the isolation and review work in section 8 first. (L)

Ordering note: steps 1 and 2 fix the editor's biggest gaps (blocks, saved layout on every page) and are safe to ship alone.

---

# Addendum: target architecture (8 independent theme packages, top-tier speed)

Target: each of the 8 designs becomes its own package (layout, sections, blocks, settings schema, CSS, assets). A store selects one; switching keeps each theme's settings separately. Speed goals: edge-cached HTML per store and page with purge on publish, config from KV or cache, zero JS by default, per-theme bundles, image CDN with resize and WebP/AVIF, subsetted self-hosted fonts, an enforced budget per theme.

## (a) How the "design theme 1-8" switch works today, and how hard it is to split

- **Mechanism:** one number, `theme_config.settings.active_theme_id` (1 to 8).
  - It sets `<html data-theme="N">` before paint (`BaseLayout.astro` inline script), which flips CSS variables and per-design CSS blocks in `themes.css`.
  - It picks the default section list: `DEFAULT_LAYOUT(template, themeId)` in `storefront-layout.ts` gives designs 5 to 8 their own default home.
  - `SiteHeader.astro` contains all four subnav variants and CSS hides three of them.
  - Section renderers branch by prefix (`jp-`, `zero-`, `org-`, `vince-`) and `themedCard()`.
  - The ERP editor reads the same number to filter which design-specific section types are offered.
- **Settings are not separate per design.** One `settings` object and one `layouts` object serve whichever design is active. Switching the number re-skins the same content, and a design's own sections stay in the saved layout but render nothing meaningful under another design (not sure how each renderer behaves in that case). The `store_themes` table holds named draft and published copies of a config, not one row per design, so it is not a per-design settings store either.
- **Coupling that makes the split hard:** shared header, footer and product card that each carry per-design markup or CSS; a single global `themes.css` that mixes all designs; the shared renderer registry; the editor's hardcoded settings groups; and `active_theme_id` stored inside the config, so the config schema is the union of all designs.
- **Effort: L overall.**
  - M: the data model (a `themes` map keyed by package id, `active_theme`, `settings_by_theme`, with a one-time migration that copies the current config into the active design's slot; reading old configs stays supported).
  - L: carving the 8 packages (separate header, footer, card and CSS per design; de-duplicating shared parts into a small core; the renderer rewritten around per-theme registries).
  - M: the editor driven by each package's settings schema, plus a switcher that previews other designs without losing the current one.
  - Designs 1 to 4 are the lightest to extract, since they are tokens plus a few CSS blocks. Design 5 is the heaviest (142 selectors) and, with 6 to 8, has its own section types.

## (b) Speed points: exists or missing

| Goal | Status |
|---|---|
| Edge-cached HTML per store+page, purge on publish | **Missing.** No `Cache-Control` on pages, no purge. Only the catalog feed is edge-cached (300 s). |
| Config from KV or cache, no per-request Supabase | **Missing.** `theme_config` is fetched through the uncached `/get-store-by-subdomain`, one Supabase query per page view. The catalog has a Cache API layer; the tenant lookup has none. |
| Zero JS by default | **Missing.** `CartBadge` loads eagerly (`client:load`), `QuickView` idle-hydrates on every page, and the Svelte runtime ships with them. The section renderer and layout modules (about 46 KB raw) are shipped to the browser to re-render. Vitals and attribution scripts run on every page. |
| Per-theme bundles | **Missing.** One CSS file for all 8 designs, and one shared renderer registry. |
| Image CDN with resize, WebP, AVIF | **Missing.** Raw URLs, no `srcset`, no Image Resizing. Width and height attributes, lazy loading and `fetchpriority` on the first hero image **exist**. |
| Self-hosted fonts | **Exists.** `public/fonts` (about 772 KB across all families, immutable cache, loaded only for the families a page uses). |
| Subsetted fonts | **Not sure.** The files are woff2, but I did not inspect their glyph coverage. |
| Enforced performance budget | **Missing.** No budget file, CI check or size gate. The only monitoring is the web-vitals beacon (`vitals-beacon.ts`, `/record-vitals`) feeding the ERP performance stats, which is measurement and not enforcement. |
| Edge deployment | **Exists.** Cloudflare Workers with static assets. |

## (c) Bytes a visitor downloads today for one page (DR GLOW)

Estimate from `storefront/dist` (built 2026-11-04) by gzip-compressing each emitted file. I could not load the live site, so the real bundle split on the page, and which design DR GLOW uses, are **not verified**. Transfer is probably brotli on Cloudflare, so real numbers are somewhat smaller.

- **CSS (every design, every page):** one stylesheet of Tailwind, `global.css` and `themes.css`: **about 100 KB raw, 19 KB gzip**. It contains all 8 designs, so a visitor pays for 7 designs they do not see. Product and checkout pages add a small checkout CSS (about 1.4 KB gz), and Leaflet CSS (6.5 KB gz) only if the map loads.
- **JS, home page:** about **126 KB raw, 45 KB gzip**, made up of:
  - Svelte runtime and islands (`render`, `props`, `each`, `class`, `CartBadge`, `QuickView`, `client`): about 21 KB gz.
  - Layout inline scripts (appearance boot, storefront flags, attribution, vitals): about 8 KB gz.
  - Section renderer, layout registry and helpers for the in-browser re-render: about 16 KB gz.
- **JS, product page:** the above plus `ProductPurchase` and its helpers: roughly **+8 KB gz**, about 53 KB gz. Not sure how much of the vitals script is the `web-vitals` library, so the figure could be a few KB higher.
- **Checkout:** `CheckoutForm` about 15 KB gz plus the location picker, and Leaflet (43 KB gz) if the map is used. Not sure whether Leaflet loads lazily.
- **Fonts:** one or two woff2 files per family used, 20 to 80 KB each (design-dependent). Not included above.
- **Images:** not included; unresized originals are the largest cost on the page.
- **Rough HTML-plus-assets total for one page, excluding images and fonts:** about 65 to 75 KB gz (CSS 19 + JS 45 to 53 + HTML). Not sure about the HTML size; it includes an inline theme-config script and the catalog JSON (up to 250 products), which can be tens of KB on a large catalog.

**Target gaps from this:** with per-theme CSS (about 3 to 6 KB gz is plausible; not measured) and no JS on a static page, a visitor would download roughly a tenth of what they do today. The main work is not the CSS split but removing the in-browser re-render (needs server rendering of saved layouts on every page) and making the cart badge and quick view opt-in.

## Updated migration path

The six-step path above still holds. For the new target, reorder so speed work lands before the package split:

1. **Speed without a format change (S to M):** cache the tenant and config lookup (KV or Cache API, purge on publish); edge-cache HTML per store and page with purge on publish; server-render saved layouts on all pages; drop the browser re-render except in preview; make `CartBadge` and `QuickView` lazy or opt-in.
2. **Data model (M):** `themes` map keyed by package id with settings per theme, plus migration from the current single config. Keep reading old configs.
3. **Add blocks and version (M).**
4. **Image pipeline (M):** upload for theme images, Cloudflare Image Resizing or an equivalent, `srcset`, WebP and AVIF.
5. **Extract packages (L):** start with designs 1 to 4 (token-only plus a few CSS blocks), then 5 to 8. Each package gets its own CSS and bundle plus a size budget checked in CI (add a build step that fails over budget).
6. **Footer and header as section groups inside each package (M to L).**
7. **Third-party themes (L to XL):** only after isolation and review (section 8).
