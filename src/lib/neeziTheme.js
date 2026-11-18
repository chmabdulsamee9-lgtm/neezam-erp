// Builds a draft theme config from a theme + version and Neezi's proposal (collections, menus, homepage text) and,
// on Grow / Advance, the banners Agnes made. Pure: uses only the synced theme engine.
import {
  createDefaultConfig, listSections, listBlocks, setSectionSetting, setBlockSetting, addBlock, removeBlock, setThemeSetting,
} from "./themeV2/engine.generated.js";

export function buildNeeziConfig({ themeId, versionId, storeName, proposal, banners = [] }) {
  let cfg = createDefaultConfig(themeId, versionId);
  if (!cfg) return null;
  const home = proposal?.home || {};
  const cols = (proposal?.collections || []).map((c) => ({ handle: c.handle, title: c.title }));
  const best = cols.find((c) => c.handle === "best-sellers") || cols[0];
  const other = cols.find((c) => c !== best) || null;
  if (storeName) cfg = setThemeSetting(cfg, "store_name", storeName);

  for (const sec of listSections(cfg, "header")) {
    if (sec.type === "header") cfg = setSectionSetting(cfg, "header", sec.id, "menu", "main-menu");
    if ((sec.type === "announcement" || sec.type === "marquee") && home.announcement) {
      const first = listBlocks(sec)[0];
      if (first) cfg = setBlockSetting(cfg, "header", sec.id, first.id, "text", home.announcement);
    }
  }
  for (const sec of listSections(cfg, "footer")) {
    if (sec.type !== "footer") continue;
    const links = listBlocks(sec).find((b) => b.type === "links");
    if (links) cfg = setBlockSetting(cfg, "footer", sec.id, links.id, "menu", "footer");
  }

  let bannerIdx = 0;
  const nextBanner = () => banners[bannerIdx++] || null;
  for (const sec of listSections(cfg, "home")) {
    const id = sec.id;
    if (sec.type === "hero") {
      for (const b of listBlocks(sec)) {
        if (b.type === "heading" && home.hero_heading) cfg = setBlockSetting(cfg, "home", id, b.id, "text", home.hero_heading);
        if (b.type === "text" && home.hero_text) cfg = setBlockSetting(cfg, "home", id, b.id, "text", `<p>${escapeHtml(home.hero_text)}</p>`);
      }
      const img = nextBanner();
      if (img) cfg = setSectionSetting(cfg, "home", id, "image", { url: img, alt: "" });
    }
    if (sec.type === "slideshow") {
      listBlocks(sec).forEach((b, i) => {
        if (i === 0 && home.hero_heading) { cfg = setBlockSetting(cfg, "home", id, b.id, "heading", home.hero_heading); cfg = setBlockSetting(cfg, "home", id, b.id, "text", home.hero_text || ""); }
        if (i > 0 && cols[i]) { cfg = setBlockSetting(cfg, "home", id, b.id, "heading", cols[i].title); cfg = setBlockSetting(cfg, "home", id, b.id, "button_link", `/collection?c=${cols[i].handle}`); }
        const img = nextBanner();
        if (img) cfg = setBlockSetting(cfg, "home", id, b.id, "image", { url: img, alt: "" });
      });
    }
    if (sec.type === "tabbed-products") {
      const tabs = listBlocks(sec);
      if (tabs[0] && best) { cfg = setBlockSetting(cfg, "home", id, tabs[0].id, "collection", best.handle); cfg = setBlockSetting(cfg, "home", id, tabs[0].id, "label", best.title); }
      if (tabs[1] && other) { cfg = setBlockSetting(cfg, "home", id, tabs[1].id, "collection", other.handle); cfg = setBlockSetting(cfg, "home", id, tabs[1].id, "label", other.title); }
    }
    if (sec.type === "featured-collection" && (other || best)) {
      const c = other || best;
      cfg = setSectionSetting(cfg, "home", id, "collection", c.handle);
      cfg = setSectionSetting(cfg, "home", id, "heading", c.title);
    }
    if (sec.type === "promo-grid") {
      listBlocks(sec).forEach((b, i) => {
        const c = cols[i + 1] || cols[i];
        if (c) { cfg = setBlockSetting(cfg, "home", id, b.id, "title", c.title); cfg = setBlockSetting(cfg, "home", id, b.id, "link", `/collection?c=${c.handle}`); }
        const img = nextBanner();
        if (img) cfg = setBlockSetting(cfg, "home", id, b.id, "image", { url: img, alt: "" });
      });
    }
    if (sec.type === "faq" && Array.isArray(home.faq) && home.faq.length) {
      for (const b of listBlocks(sec)) cfg = removeBlock(cfg, "home", id, b.id);
      for (const f of home.faq.slice(0, 8)) {
        const r = addBlock(cfg, "home", id, "item");
        cfg = r.config;
        if (r.id) { cfg = setBlockSetting(cfg, "home", id, r.id, "question", f.q); cfg = setBlockSetting(cfg, "home", id, r.id, "answer", `<p>${escapeHtml(f.a)}</p>`); }
      }
    }
  }
  return cfg;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
