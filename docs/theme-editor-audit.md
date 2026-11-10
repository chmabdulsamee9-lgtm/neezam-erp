# Theme editor audit (ERP > Online Store > Edit theme)

Written before the rebuild. Sources: the capture folder `Desktop/shopify-capture` (12 screenshots + `index.json`) and our code.

## A. What the capture shows

**Limits of the capture.** Every `step-NNN.json` holds only `body` and one `div` (2 nodes): the editor runs in a cross-origin iframe, so no DOM or computed styles of the editor chrome were recorded. `index.json` has the page-level CSS tokens only, and `events` is empty (no click or drag log). All numbers below are measured from the screenshots (viewport 1366x561 unless noted), so they are pixel estimates. The colour picker, image picker, "..." menu contents and drag-and-drop were **not captured**; for those we use standard patterns and say so.

| Area | Observed |
|---|---|
| Top bar | 56px high, one row. Left: exit arrow, then 3 icon buttons (sections, theme settings, apps; selected one has a light rounded background). Centre: theme name + green status badge, then the page switcher ("Home page", chevron on hover). Right: inspector toggle, device toggle, undo, redo, "..." button, black Save pill. |
| Layout | No ERP sidebar. Left panel x 4-300 (296px) in a rounded card, preview x 304-1352 (~1048px) filling the rest, full height, 4px gutters. Panel and preview each scroll on their own (one scrollbar each). |
| Panel header | Page name ("Home page") bold 14px, thin divider under it, then the tree. |
| Tree | Groups "Header" / "Template" / "Footer" (bold 13px, divider between). Row ~32px, indent ~16px per level. A section row: chevron, icon, name, grey italic summary of its content ("Announcement - Welcome to our s..."). Children (blocks) listed under an expanded section, each with an "Add block" link. "Add section" (blue, plus-circle) at the end of each group. |
| States | Selected row: solid blue fill, white text, ~8px radius. Hover: light grey. Child rows are not filled when the parent is selected. |
| Selecting | Opens a second card **below** the tree: icon, section name, "..." menu, close X; settings (labelled controls, 32px inputs, segmented buttons, selects, colour-scheme swatches). The section is outlined in blue (2px) in the preview with a small name tab at its top-left; clicking a block shows a block tab and "+" insert handles. |
| Add section | Popup anchored to the link, ~640x420: left column ~255px (search, "Sections / Apps" segmented control, list), right ~380px "No preview available" pane. |
| Page switcher | ~320px popup: search field, list with icons, groups divided by lines, rows with chevrons open sub-lists (Products -> "Default product, assigned to 15 products", "Create template"). |
| Theme settings | Accordion list, row 48px, bold 14px label, chevron at the right (Logo, Colors, Typography, Layout, Buttons, Inputs, Product cards, Social media, Search, Currency, Cart, Custom CSS...). Expanded group = stacked labelled inputs. |
| Device toggle | Mobile = centred ~360px-wide frame with its own scrollbar; the rest of the preview area is blank. |
| Mobile (811px) | Different layout: preview on top, bottom sheet with "Select sections by tapping on them in the Preview". Not adopted (our editor uses a slide-over panel under 900px). |

## B. Our code before the rebuild

- `src/pages/ThemeEditor.jsx` (723 lines, one component) rendered inside the ERP shell (sidebar and topbar visible), with flat tabs Theme / Sections / Design / Branding / Advanced / Products. State: `draft` (the whole `theme_config`), `template`, `tab`, `selectedSectionId`. No history.
- `theme_config` = `{ settings, layouts, product_meta }`. `layouts` = `{ home|collection|product|cart|checkout: { sections: [{ id, type, enabled, settings }] } }`. Sections are **flat**: no blocks exist in the storefront renderer. `settings` holds design theme id, palette, palette_assign, font_overrides, custom_css, branding, sales_pop, sold/stock badges, card, sale_badge, pdp_perks, shipping_returns, ai_brief.
- Section types: 57 in the storefront `SECTION_REGISTRY` (19 universal, 5 locked "main" sections, 33 theme-specific for designs 5-8). The old editor offered 19 and had no schema, so every field was a generic text box.
- Preview: iframe on `<store domain><page>?token=<edit token>&preview=1`. The storefront middleware verifies the token (`/verify-theme-edit-token`) and loads `preview-bridge.ts`, which listens for `{ type: "eneezam:theme-preview", themeConfig }` and re-renders in place; it posts `eneezam:theme-preview-ready` and `...-applied`. The editor debounced 400ms.
- Save: `PUT /update-store-theme { theme_id, theme_config }` (auth, `hasStoreAccess`, rejects `published` rows). Publish: `POST /publish-store-theme`. Duplicate: `POST /create-store-theme`.
- Defects found: (1) **Sections list empty**: a theme that never saved a layout has `layouts: {}`; the storefront then renders `DEFAULT_LAYOUT(template, themeId)` but the editor read only the saved array. (2) Theme name used `color:#fff` on a light bar. (3) Product preview URL hard-coded to one demo product handle, product merchandising defaulted to `demo-product-1`. (4) Edit token lives 20 minutes and was never refreshed. (5) Preview links navigated the iframe out of preview mode.

## C. Gap list (Shopify vs ours, and what the renderer allows)

| Shopify editor | Feasible? | Result |
|---|---|---|
| Full-viewport editor, rail, tree, large preview | Yes | Built |
| Real section tree, hide/show, duplicate, delete, move, drag reorder | Yes (flat sections) | Built |
| Add-section popup with categories + search | Yes (only supported types) | Built; no right-hand preview pane (no renderer for thumbnails) |
| Select section: settings panel with back arrow, highlight and scroll in preview, click in preview selects | Yes, needs small storefront change (section wrapper ids + messages), preview mode only | Built |
| Undo / redo, dirty state, unsaved warning | Yes | Built |
| Device toggle | Yes | Built (390px) |
| Typed controls (colour, image, text, select, range, toggle, link) | Yes | Built; image = URL + preview (no upload) |
| Blocks inside sections (add/reorder/delete) | **No**: renderer has no blocks | Not done |
| Footer group, header section groups beyond announcement bars | **No**: footer and header are theme code, not sections | Not done (home shows Header = announcement bars, Template = the rest) |
| Page switcher with products/collections/pages sub-lists, templates per product | **No**: one layout per page type | Five page types only |
| Image upload to a bucket | **No** existing store-image bucket/endpoint (needs new storage + SQL) | Not done |
| Section hover "+" insert handles, drag in preview | Not captured / not feasible without more storefront work | Not done |
| Section previews in the add popup, "Generate" (AI), Apps tab | No | Not done |
| Theme-settings groups Layout / Animations / Variant pills / Collection cards ... | Those settings do not exist in our `settings` | Not done (every existing setting is kept, regrouped) |
