import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

// Mirrors neezam-storefront/src/lib/storefront-layout.ts's TEMPLATES — a
// separate repo/runtime, so this is a deliberate, small, hand-kept copy
// rather than a shared import.
const TEMPLATES = [
  { key: "home", label: "Home page", url: "/" },
  { key: "collection", label: "Collections", url: "/collection" },
  { key: "product", label: "Products", url: "/product/velvet-matte-lipstick" },
  { key: "cart", label: "Cart", url: "/cart" },
  { key: "checkout", label: "Checkout", url: "/checkout" },
];

// The universal (templates: '*') section library from storefront-layout.ts's
// SECTION_REGISTRY, plus the two non-locked 'core' product-page sections.
// Deliberately excludes the ~30 brand-specific jp-*/zero-*/org-*/vince-*
// section types (themes 5-8's bespoke pre-built sections) — those can still
// be edited if already present in a saved layout (via the generic field
// editor below), just not newly added from this menu. See final report.
const SECTION_TYPES = [
  { type: "announcement-bar", label: "Announcement bar" },
  { type: "hero", label: "Hero banner (with slideshow)" },
  { type: "featured-collection", label: "Featured collection" },
  { type: "collection-list", label: "Category rows (icon chips)" },
  { type: "promo-banner", label: "Promo banner (big CTA)" },
  { type: "stats-row", label: "Stats / trust counters" },
  { type: "testimonials", label: "Testimonials carousel row" },
  { type: "countdown-strip", label: "Flash-sale countdown strip" },
  { type: "ugc-strip", label: "UGC / Instagram photo strip" },
  { type: "brand-story", label: "Brand story split" },
  { type: "trust-marquee", label: "Trust claims marquee" },
  { type: "deals-grid", label: "Deals strip + offer cards" },
  { type: "mini-picks", label: "Celeb favourites (mini cards)" },
  { type: "quote-strip", label: "Brand quote strip" },
  { type: "press-logos", label: "Press / featured-in logos" },
  { type: "newsletter", label: "Newsletter signup" },
  { type: "custom-html", label: "Custom block (HTML)" },
  { type: "product-reviews", label: "Customer reviews" },
  { type: "related-products", label: "Related products" },
];
const LOCKED_CORE_TYPES = {
  home: "home-main", collection: "collection-main", product: "product-main", cart: "cart-main", checkout: "checkout-main",
};
const LOCKED_TYPE_SET = new Set(Object.values(LOCKED_CORE_TYPES));

function sectionLabel(type) {
  return SECTION_TYPES.find((s) => s.type === type)?.label
    || Object.entries(LOCKED_CORE_TYPES).find(([, t]) => t === type)?.[0]
    || type;
}
function newId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`; }
function makeSection(type) { return { id: newId("sec"), type, enabled: true, settings: {} }; }

// Mirrors neezam-storefront/src/lib/palette.ts (PALETTE_SLOTS/ELEMENT_TARGETS/
// FONT_OPTIONS) — default hex values shown here are theme-1's, since this
// editor doesn't have access to the storefront's full per-theme default map;
// it only matters for the swatch shown before a slot has ever been set.
const PALETTE_SLOTS = [
  { key: "bg", label: "Background", feeds: "Page background, behind everything", default: "#ffffff" },
  { key: "surface", label: "Surface / Cards", feeds: "Cards, section surfaces, chips, inputs", default: "#f5f5f4" },
  { key: "text", label: "Headings / Main text", feeds: "Headings, product titles, prices", default: "#111111" },
  { key: "textMuted", label: "Muted text", feeds: "Captions, vendors, secondary copy", default: "#6f6f6f" },
  { key: "accent", label: "Accent", feeds: "Buttons, badges, highlights, links", default: "#111111" },
  { key: "accentContrast", label: "Text on accent", feeds: "Button label text, badge text", default: "#ffffff" },
  { key: "border", label: "Outlines / Borders", feeds: "Card outlines, input borders, dividers", default: "#e3e3e1" },
];
const ELEMENT_TARGETS = [
  { key: "headings", label: "Headings", defaultSlot: "text" },
  { key: "bodyText", label: "Body text", defaultSlot: "text" },
  { key: "buttons", label: "Buttons (bg)", defaultSlot: "accent" },
  { key: "buttonText", label: "Button text", defaultSlot: "accentContrast" },
  { key: "links", label: "Links / accents", defaultSlot: "accent" },
  { key: "badges", label: "Badge / sticker bg", defaultSlot: "accent" },
  { key: "badgeText", label: "Badge text", defaultSlot: "accentContrast" },
  { key: "announceBar", label: "Announcement bar bg", defaultSlot: "accent" },
  { key: "announceText", label: "Announcement text", defaultSlot: "accentContrast" },
  { key: "outlines", label: "Outlines / inputs", defaultSlot: "border" },
  { key: "saleBadge", label: "Sale badge bg", defaultSlot: "accent" },
  { key: "saleText", label: "Sale badge text", defaultSlot: "accentContrast" },
  { key: "stars", label: "Review stars", defaultSlot: "accent" },
  { key: "popupCard", label: "Sales popup card", defaultSlot: "surface" },
];
const FONT_OPTIONS = [
  { key: "archivo", label: "Archivo" }, { key: "archivo-black", label: "Archivo Black" },
  { key: "inter", label: "Inter" }, { key: "space-grotesk", label: "Space Grotesk" },
  { key: "playfair", label: "Playfair Display" }, { key: "jost", label: "Jost" },
  { key: "fraunces", label: "Fraunces" }, { key: "nunito", label: "Nunito" },
  { key: "caveat", label: "Caveat (handwritten)" }, { key: "sora", label: "Sora" },
  { key: "poppins", label: "Poppins" }, { key: "lora", label: "Lora" },
  { key: "plus-jakarta", label: "Plus Jakarta Sans" }, { key: "quicksand", label: "Quicksand" },
  { key: "nunito-sans", label: "Nunito Sans" }, { key: "barlow", label: "Barlow" },
  { key: "montserrat", label: "Montserrat" },
];
const META_LIMITS = { card_tag: 30, title_tag: 30, key_point: 60, key_points_max: 3, info_title: 40, info_body: 600, info_sections_max: 4 };

const TABS = [
  { id: "theme", label: "Theme" },
  { id: "sections", label: "Sections" },
  { id: "design", label: "Design" },
  { id: "branding", label: "Branding" },
  { id: "advanced", label: "Advanced" },
  { id: "products", label: "Products" },
];

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)",
  background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13,
};
const labelStyle = { display: "block", marginBottom: 4, fontSize: 11, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: "0.06em" };
const groupLabelStyle = { fontSize: 11, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "18px 0 8px" };
const chipStyle = (active) => ({
  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid var(--ne-border)",
  background: active ? "var(--ne-grad)" : "transparent", color: active ? "#fff" : "var(--ne-text)",
});

export default function ThemeEditor({ storeId, themeId, onNavigate, onOpenThemeEditor }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState(null);
  const [themeName, setThemeName] = useState("");
  const [themeStatus, setThemeStatus] = useState("draft");
  const [duplicating, setDuplicating] = useState(false);
  const [template, setTemplate] = useState("home");
  const [tab, setTab] = useState("theme");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [previewToken, setPreviewToken] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [metaProductId, setMetaProductId] = useState("demo-product-1");
  const iframeRef = useRef(null);
  const postTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user.id).single();
      setCurrentProfile(data || null);
    })();
  }, []);

  const logActivity = async (sId, actionType, details) => {
    if (!currentProfile || !sId) return;
    try {
      await supabase.from("activity_log").insert({
        store_id: sId, user_id: currentProfile.id,
        user_name: currentProfile.full_name || currentProfile.email,
        action_type: actionType, order_id: null, details: details || null,
      });
    } catch (err) {
      console.log("logActivity error:", err.message);
    }
  };

  useEffect(() => {
    if (!storeId || !themeId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { data: storeRow } = await supabase
          .from("stores")
          .select("id, store_name, subdomain, store_custom_domains(domain, role, status)")
          .eq("id", storeId)
          .maybeSingle();
        setStore(storeRow || null);

        const { data: { session } } = await supabase.auth.getSession();
        const authHeaders = { Authorization: `Bearer ${session?.access_token}` };

        const [themeRes, tokenRes] = await Promise.all([
          fetch(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(themeId)}`, { headers: authHeaders }),
          fetch(`${CF_URL}/generate-theme-edit-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ store_id: storeId }),
          }),
        ]);
        const themeData = await themeRes.json();
        const tokenData = await tokenRes.json();
        if (!themeData.theme) throw new Error(themeData.error || "Theme load nahi hua");
        if (!tokenData.token) throw new Error(tokenData.error || "Preview token generate nahi hua");
        setDraft(themeData.theme.theme_config);
        setThemeName(themeData.theme.name);
        setThemeStatus(themeData.theme.status);
        setPreviewToken(tokenData.token);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId, themeId]);

  const primaryDomain = (store?.store_custom_domains || []).find((d) => d.role === "primary" && d.status === "active")?.domain;
  const liveUrl = primaryDomain ? `https://${primaryDomain}` : store?.subdomain ? `https://${store.subdomain}.eneezam.com` : null;
  const templateUrl = TEMPLATES.find((tp) => tp.key === template)?.url || "/";
  const previewSrc = liveUrl && previewToken
    ? `${liveUrl}${templateUrl}?token=${encodeURIComponent(previewToken)}&preview=1`
    : null;

  const sendPreview = useCallback(() => {
    if (!draft) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "eneezam:theme-preview", themeConfig: draft }, "*");
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    clearTimeout(postTimer.current);
    postTimer.current = setTimeout(sendPreview, 400);
    return () => clearTimeout(postTimer.current);
  }, [draft, sendPreview]);

  useEffect(() => {
    function onMessage(e) {
      if (e.data?.type === "eneezam:theme-preview-ready") sendPreview();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendPreview]);

  const updateSettings = (patch) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const updateLayoutSections = (tplKey, fn) => setDraft((d) => {
    const current = d.layouts?.[tplKey]?.sections || [];
    return { ...d, layouts: { ...d.layouts, [tplKey]: { sections: fn(current) } } };
  });

  const sections = draft?.layouts?.[template]?.sections || [];
  const selected = sections.find((s) => s.id === selectedSectionId) || null;
  const lockedType = LOCKED_CORE_TYPES[template];

  const toggleEnabled = (id) => updateLayoutSections(template, (arr) => arr.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  const removeSection = (id) => {
    const target = sections.find((s) => s.id === id);
    if (target && LOCKED_TYPE_SET.has(target.type)) return;
    updateLayoutSections(template, (arr) => arr.filter((s) => s.id !== id));
    if (selectedSectionId === id) setSelectedSectionId(null);
  };
  const moveSection = (id, dir) => updateLayoutSections(template, (arr) => {
    const idx = arr.findIndex((s) => s.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= arr.length) return arr;
    const next = [...arr];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    return next;
  });
  const addSection = (secType) => {
    updateLayoutSections(template, (arr) => [...arr, makeSection(secType)]);
    setAddMenuOpen(false);
  };
  const setSectionField = (id, key, value) => updateLayoutSections(template, (arr) =>
    arr.map((s) => (s.id === id ? { ...s, settings: { ...s.settings, [key]: value } } : s))
  );
  const addSectionField = (id) => {
    const key = window.prompt("Field key (e.g. heading)?");
    if (!key) return;
    setSectionField(id, key.trim(), "");
  };

  const handleSave = async () => {
    if (!draft || !store || !themeId) return;
    // Worker rejects writes to a published row — this mirrors that at the
    // UI level too, via the "Duplicate to edit" banner below, but guard
    // here too in case Save is clicked in some edge-case race.
    if (themeStatus === "published") {
      setSaveError(t("themeEditor.publishedReadOnly"));
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/update-store-theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ theme_id: themeId, theme_config: draft }),
      });
      const data = await res.json();
      if (!data.success) {
        setSaveError(data.error || "Save nahi hua");
        return;
      }
      setSavedAt(new Date());
      logActivity(store.id, "theme_config_saved", { theme_id: themeId });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // The worker rejects direct edits to a published row (to avoid accidental
  // live edits bypassing publish) — this creates a draft copy and re-targets
  // this same editor instance at it via onOpenThemeEditor, rather than
  // allowing a mid-edit async fork.
  const handleDuplicateToEdit = async () => {
    if (!store || !themeId) return;
    setDuplicating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/create-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: store.id, source_theme_id: themeId }),
      });
      const data = await res.json();
      if (!data.theme) {
        setSaveError(data.error || "Duplicate nahi hui");
        return;
      }
      logActivity(store.id, "theme_duplicated", { from_theme_id: themeId, to_theme_id: data.theme.id });
      onOpenThemeEditor?.(data.theme.id);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setDuplicating(false);
    }
  };

  const handlePublishFromEditor = async () => {
    if (!store || !themeId) return;
    setPublishing(true);
    setPublishError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${CF_URL}/publish-store-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ theme_id: themeId }),
      });
      const data = await res.json();
      if (!data.success) {
        setPublishError(data.error || "Publish nahi hui");
        return;
      }
      setThemeStatus("published");
      logActivity(store.id, "theme_published", { theme_id: themeId });
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "1.5rem", color: "var(--ne-muted)" }}>{t("themeEditor.loading")}</div>;
  }
  if (loadError || !store) {
    return (
      <div style={{ padding: "1.25rem" }}>
        <button onClick={() => onNavigate?.("online-store")} style={{ background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-text)", borderRadius: 9, padding: "8px 14px", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
          <Icon name="undo" size={13} /> {t("themeEditor.backButton")}
        </button>
        <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-danger)" }}>
          {loadError || t("themeEditor.loadFailed")}
        </div>
      </div>
    );
  }

  const settings = draft.settings || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "10px 16px", borderBottom: "1px solid var(--ne-border)", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => onNavigate?.("online-store")} style={{ background: "transparent", border: "1px solid var(--ne-border)", color: "var(--ne-text)", borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="undo" size={12} /> {t("themeEditor.backButton")}
          </button>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{store.store_name}</span>
          <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>— {themeName}</span>
          {themeStatus === "published" && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: "var(--ne-success-soft)", color: "var(--ne-success)" }}>
              {t("themeEditor.publishedBadge")}
            </span>
          )}
          <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>
            {saving ? t("themeEditor.saving") : savedAt ? `${t("themeEditor.savedPrefix")} ${savedAt.toLocaleTimeString()}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 20, padding: 3 }}>
          {TEMPLATES.map((tp) => (
            <button key={tp.key} onClick={() => setTemplate(tp.key)} style={chipStyle(template === tp.key)}>
              {tp.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {themeStatus === "draft" && (
            <button onClick={handlePublishFromEditor} disabled={publishing} style={{
              background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)",
              borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: publishing ? "not-allowed" : "pointer",
            }}>
              {publishing ? t("themeEditor.publishing") : t("themeEditor.publishButton")}
            </button>
          )}
          <button onClick={handleSave} disabled={saving || themeStatus === "published"} style={{
            background: (saving || themeStatus === "published") ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", border: "none",
            borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: (saving || themeStatus === "published") ? "not-allowed" : "pointer",
          }}>
            {saving ? t("themeEditor.saving") : t("themeEditor.saveButton")}
          </button>
        </div>
      </div>
      {themeStatus === "published" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 16px", background: "var(--ne-warning-soft)", color: "var(--ne-warning)", fontSize: 12.5 }}>
          <span>{t("themeEditor.publishedReadOnly")}</span>
          <button onClick={handleDuplicateToEdit} disabled={duplicating} style={{ background: "transparent", border: "1px solid currentColor", color: "inherit", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: duplicating ? "not-allowed" : "pointer" }}>
            {duplicating ? t("themeEditor.duplicating") : t("themeEditor.duplicateToEditButton")}
          </button>
        </div>
      )}
      {saveError && <p style={{ color: "var(--ne-danger)", fontSize: 12, padding: "8px 16px 0" }}>{saveError}</p>}
      {publishError && <p style={{ color: "var(--ne-danger)", fontSize: 12, padding: "8px 16px 0" }}>{publishError}</p>}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 380, borderRight: "1px solid var(--ne-border)", overflowY: "auto", padding: "14px 16px" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {TABS.map((tb) => (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={chipStyle(tab === tb.id)}>{tb.label}</button>
            ))}
          </div>

          {tab === "theme" && (
            <div>
              <p style={groupLabelStyle}>Design theme (1-8)</p>
              <select style={inputStyle} value={settings.active_theme_id || 1} onChange={(e) => updateSettings({ active_theme_id: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <p style={{ fontSize: 12, color: "var(--ne-muted)", marginTop: 10 }}>
                Preview iframe oppose se draft receive karta hai har change par — Save tabhi real visitors ko dikhta hai jab aap "Save" button dabao.
              </p>
            </div>
          )}

          {tab === "sections" && (
            <div>
              <p style={groupLabelStyle}>{TEMPLATES.find((tp) => tp.key === template)?.label} — sections</p>
              {sections.map((s) => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--ne-border)",
                  borderRadius: 8, marginBottom: 4, background: selectedSectionId === s.id ? "var(--ne-surface-2)" : "var(--ne-surface)",
                  opacity: s.enabled ? 1 : 0.55,
                }}>
                  {LOCKED_TYPE_SET.has(s.type) && <Icon name="key" size={11} />}
                  <button onClick={() => setSelectedSectionId(s.id)} style={{ flex: 1, textAlign: "left", padding: "8px 6px", fontSize: 12.5, color: "var(--ne-text)", background: "transparent", border: "none", cursor: "pointer" }}>
                    {sectionLabel(s.type)}
                  </button>
                  {!LOCKED_TYPE_SET.has(s.type) && (
                    <>
                      <button onClick={() => moveSection(s.id, -1)} style={{ padding: 6, background: "transparent", border: "none", color: "var(--ne-muted)", cursor: "pointer" }}>▲</button>
                      <button onClick={() => moveSection(s.id, 1)} style={{ padding: 6, background: "transparent", border: "none", color: "var(--ne-muted)", cursor: "pointer" }}>▼</button>
                    </>
                  )}
                  <button onClick={() => toggleEnabled(s.id)} style={{ padding: 6, background: "transparent", border: "none", color: "var(--ne-muted)", cursor: "pointer" }}>
                    <Icon name={s.enabled ? "check" : "close"} size={12} />
                  </button>
                  {!LOCKED_TYPE_SET.has(s.type) && (
                    <button onClick={() => removeSection(s.id)} style={{ padding: 6, background: "transparent", border: "none", color: "var(--ne-danger)", cursor: "pointer" }}>
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </div>
              ))}

              <div style={{ position: "relative", marginTop: 8 }}>
                <button onClick={() => setAddMenuOpen((v) => !v)} style={{ width: "100%", padding: "8px", borderRadius: 9, border: "1px dashed var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontSize: 12.5, cursor: "pointer" }}>
                  + Add section
                </button>
                {addMenuOpen && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 10, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 9, maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
                    {SECTION_TYPES.map((m) => (
                      <button key={m.type} onClick={() => addSection(m.type)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12.5, background: "transparent", border: "none", color: "var(--ne-text)", cursor: "pointer" }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selected && (
                <div style={{ marginTop: 18 }}>
                  <p style={groupLabelStyle}>{sectionLabel(selected.type)} — fields</p>
                  {Object.entries(selected.settings || {}).map(([key, value]) => (
                    <div key={key} style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>{key}</label>
                      {typeof value === "boolean" ? (
                        <button onClick={() => setSectionField(selected.id, key, !value)} style={chipStyle(value)}>{value ? "On" : "Off"}</button>
                      ) : typeof value === "number" ? (
                        <input type="number" style={inputStyle} value={value} onChange={(e) => setSectionField(selected.id, key, Number(e.target.value))} />
                      ) : String(value).length > 60 ? (
                        <textarea style={{ ...inputStyle, minHeight: 70 }} value={String(value)} onChange={(e) => setSectionField(selected.id, key, e.target.value)} />
                      ) : (
                        <input type="text" style={inputStyle} value={String(value)} onChange={(e) => setSectionField(selected.id, key, e.target.value)} />
                      )}
                    </div>
                  ))}
                  <button onClick={() => addSectionField(selected.id)} style={{ fontSize: 11.5, color: "var(--ne-muted)", textDecoration: "underline", background: "transparent", border: "none", cursor: "pointer" }}>
                    + Add field
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "design" && (
            <div>
              <p style={groupLabelStyle}>Palette — 7 slots</p>
              {PALETTE_SLOTS.map((slot) => (
                <div key={slot.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <input type="color" value={settings.palette?.[slot.key] || slot.default}
                    onChange={(e) => updateSettings({ palette: { ...(settings.palette || {}), [slot.key]: e.target.value } })}
                    style={{ width: 36, height: 36, border: "none", background: "none", cursor: "pointer" }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ne-text)" }}>{slot.label}</p>
                    <p style={{ margin: 0, fontSize: 10.5, color: "var(--ne-muted)" }}>{slot.feeds}</p>
                  </div>
                </div>
              ))}

              <p style={groupLabelStyle}>Element assignments</p>
              {ELEMENT_TARGETS.map((el) => (
                <div key={el.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 12, color: "var(--ne-text)" }}>{el.label}</span>
                  <select style={{ ...inputStyle, width: 150 }} value={settings.palette_assign?.[el.key] || ""}
                    onChange={(e) => updateSettings({ palette_assign: { ...(settings.palette_assign || {}), [el.key]: e.target.value || null } })}>
                    <option value="">Default ({el.defaultSlot})</option>
                    {PALETTE_SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              ))}

              <p style={groupLabelStyle}>Fonts</p>
              {[["heading", "Headings"], ["body", "Body"], ["accent", "Accent / script"]].map(([key, label]) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>{label}</label>
                  <select style={inputStyle} value={settings.font_overrides?.[key] || ""}
                    onChange={(e) => updateSettings({ font_overrides: { ...(settings.font_overrides || {}), [key]: e.target.value || null } })}>
                    <option value="">Theme default</option>
                    {FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              ))}

              <p style={groupLabelStyle}>Custom CSS</p>
              <textarea style={{ ...inputStyle, minHeight: 100, fontFamily: "monospace" }} value={settings.custom_css || ""}
                onChange={(e) => updateSettings({ custom_css: e.target.value || null })} placeholder="Injected on every page" />
            </div>
          )}

          {tab === "branding" && (
            <div>
              <p style={groupLabelStyle}>Brand</p>
              <label style={labelStyle}>Store display name</label>
              <input style={inputStyle} value={settings.store_display_name || ""} maxLength={60}
                onChange={(e) => updateSettings({ store_display_name: e.target.value || null })} />
              <label style={{ ...labelStyle, marginTop: 10 }}>Tagline</label>
              <input style={inputStyle} value={settings.store_tagline || ""} maxLength={120}
                onChange={(e) => updateSettings({ store_tagline: e.target.value || null })} />
              <label style={{ ...labelStyle, marginTop: 10 }}>Logo image URL</label>
              <input style={inputStyle} value={settings.logo_url || ""} placeholder="https://...logo.png"
                onChange={(e) => updateSettings({ logo_url: e.target.value || null })} />
              <label style={{ ...labelStyle, marginTop: 10 }}>Brand color (legacy single accent)</label>
              <input type="color" value={settings.brand_color || "#111111"}
                onChange={(e) => updateSettings({ brand_color: e.target.value })}
                style={{ width: 44, height: 36, border: "none", background: "none", cursor: "pointer" }} />
            </div>
          )}

          {tab === "advanced" && (
            <div>
              <p style={groupLabelStyle}>Sales pop-up</p>
              <button style={chipStyle(settings.sales_pop?.enabled !== false)} onClick={() => updateSettings({ sales_pop: { ...settings.sales_pop, enabled: !(settings.sales_pop?.enabled !== false) } })}>
                {settings.sales_pop?.enabled !== false ? "On" : "Off"}
              </button>

              <p style={groupLabelStyle}>Sold-count badge</p>
              <button style={chipStyle(settings.sold_badge?.enabled !== false)} onClick={() => updateSettings({ sold_badge: { ...settings.sold_badge, enabled: !(settings.sold_badge?.enabled !== false) } })}>
                {settings.sold_badge?.enabled !== false ? "On" : "Off"}
              </button>
              <label style={{ ...labelStyle, marginTop: 8 }}>Badge text</label>
              <input style={inputStyle} value={settings.sold_badge?.template || ""}
                onChange={(e) => updateSettings({ sold_badge: { ...settings.sold_badge, template: e.target.value } })} />

              <p style={groupLabelStyle}>Stock-left badge</p>
              <button style={chipStyle(settings.stock_badge?.enabled !== false)} onClick={() => updateSettings({ stock_badge: { ...settings.stock_badge, enabled: !(settings.stock_badge?.enabled !== false) } })}>
                {settings.stock_badge?.enabled !== false ? "On" : "Off"}
              </button>

              <p style={groupLabelStyle}>Product cards</p>
              {[["show_rating", "Star ratings"], ["quick_view", "Quick view"], ["quick_add", "Quick add"]].map(([k, label]) => (
                <button key={k} style={{ ...chipStyle(settings.card?.[k] !== false), marginRight: 6, marginBottom: 6 }}
                  onClick={() => updateSettings({ card: { ...settings.card, [k]: !(settings.card?.[k] !== false) } })}>
                  {label}
                </button>
              ))}

              <p style={groupLabelStyle}>Sale sticker</p>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="color" value={settings.sale_badge?.burst_color || "#fdf65e"}
                  onChange={(e) => updateSettings({ sale_badge: { ...settings.sale_badge, burst_color: e.target.value } })}
                  style={{ width: 36, height: 36, border: "none", background: "none", cursor: "pointer" }} />
                <input type="color" value={settings.sale_badge?.text_color || "#2e6eb0"}
                  onChange={(e) => updateSettings({ sale_badge: { ...settings.sale_badge, text_color: e.target.value } })}
                  style={{ width: 36, height: 36, border: "none", background: "none", cursor: "pointer" }} />
              </div>

              <p style={groupLabelStyle}>PDP perks line</p>
              <input style={inputStyle} maxLength={120} value={settings.pdp_perks || ""}
                onChange={(e) => updateSettings({ pdp_perks: e.target.value || null })} />

              <p style={groupLabelStyle}>Shipping &amp; returns</p>
              <label style={labelStyle}>Heading</label>
              <input style={inputStyle} value={settings.shipping_returns?.heading || ""}
                onChange={(e) => updateSettings({ shipping_returns: { ...settings.shipping_returns, heading: e.target.value } })} />
              <label style={{ ...labelStyle, marginTop: 8 }}>Lines (one per line)</label>
              <textarea style={{ ...inputStyle, minHeight: 100 }} value={settings.shipping_returns?.lines || ""}
                onChange={(e) => updateSettings({ shipping_returns: { ...settings.shipping_returns, lines: e.target.value } })} />

              <p style={groupLabelStyle}>AI brand brief</p>
              <textarea style={{ ...inputStyle, minHeight: 90 }} value={settings.ai_brief || ""}
                placeholder="Describe brand vibe, audience, colors/fonts mood..."
                onChange={(e) => updateSettings({ ai_brief: e.target.value || null })} />
            </div>
          )}

          {tab === "products" && (
            <div>
              <p style={groupLabelStyle}>Per-product merchandising</p>
              <p style={{ fontSize: 11.5, color: "var(--ne-muted)", marginBottom: 10 }}>
                Product ID type karo (eNeezam ka product identifier) — card tag, title tag, key points, aur info accordions set karne ke liye.
              </p>
              <label style={labelStyle}>Product ID</label>
              <input style={inputStyle} value={metaProductId} onChange={(e) => setMetaProductId(e.target.value)} />

              {metaProductId && (() => {
                const meta = draft.product_meta?.[metaProductId] || {};
                const updateMeta = (patch) => setDraft((d) => ({
                  ...d,
                  product_meta: { ...d.product_meta, [metaProductId]: { ...meta, ...patch } },
                }));
                return (
                  <div style={{ marginTop: 14 }}>
                    <label style={labelStyle}>Card tag (max {META_LIMITS.card_tag})</label>
                    <input style={inputStyle} maxLength={META_LIMITS.card_tag} value={meta.card_tag || ""}
                      onChange={(e) => updateMeta({ card_tag: e.target.value })} />
                    <label style={{ ...labelStyle, marginTop: 10 }}>Title tag (max {META_LIMITS.title_tag})</label>
                    <input style={inputStyle} maxLength={META_LIMITS.title_tag} value={meta.title_tag || ""}
                      onChange={(e) => updateMeta({ title_tag: e.target.value })} />
                    <p style={{ ...groupLabelStyle, marginTop: 14 }}>Key points (max {META_LIMITS.key_points_max})</p>
                    {[0, 1, 2].map((i) => (
                      <input key={i} style={{ ...inputStyle, marginBottom: 6 }} maxLength={META_LIMITS.key_point}
                        placeholder={`Key point ${i + 1}`} value={meta.key_points?.[i] || ""}
                        onChange={(e) => {
                          const kp = [...(meta.key_points || []), "", "", ""].slice(0, META_LIMITS.key_points_max);
                          kp[i] = e.target.value;
                          updateMeta({ key_points: kp });
                        }} />
                    ))}
                    <p style={{ ...groupLabelStyle, marginTop: 14 }}>Info sections (max {META_LIMITS.info_sections_max})</p>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} style={{ border: "1px solid var(--ne-border)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <input style={{ ...inputStyle, marginBottom: 6 }} maxLength={META_LIMITS.info_title}
                          placeholder={`Section ${i + 1} title`} value={meta.info_sections?.[i]?.title || ""}
                          onChange={(e) => {
                            const arr = [...(meta.info_sections || [])];
                            while (arr.length <= i) arr.push({ title: "", body: "" });
                            arr[i] = { ...arr[i], title: e.target.value };
                            updateMeta({ info_sections: arr.slice(0, META_LIMITS.info_sections_max) });
                          }} />
                        <textarea style={{ ...inputStyle, minHeight: 60 }} maxLength={META_LIMITS.info_body}
                          placeholder="Body" value={meta.info_sections?.[i]?.body || ""}
                          onChange={(e) => {
                            const arr = [...(meta.info_sections || [])];
                            while (arr.length <= i) arr.push({ title: "", body: "" });
                            arr[i] = { ...arr[i], body: e.target.value };
                            updateMeta({ info_sections: arr.slice(0, META_LIMITS.info_sections_max) });
                          }} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div style={{ flex: 1, background: "var(--ne-surface-2)", display: "flex", justifyContent: "center", padding: 14 }}>
          {previewSrc ? (
            <iframe
              ref={iframeRef}
              src={previewSrc}
              title="Storefront live preview"
              style={{ width: "100%", maxWidth: 1100, height: "100%", border: "1px solid var(--ne-border)", borderRadius: 12, background: "#fff" }}
            />
          ) : (
            <p style={{ color: "var(--ne-muted)", alignSelf: "center" }}>{t("themeEditor.noLiveUrl")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
