import { useState } from "react";
import { STOREFRONT_THEMES } from "../../lib/storefrontThemes";
import { sectionMeta } from "../../lib/themeEditor/layout";
import { sectionLabel } from "../../lib/themeEditor/labels";
import { getIn, setIn, PALETTE_SLOTS, ELEMENT_TARGETS, FONT_OPTIONS, META_LIMITS, paletteDefault } from "../../lib/themeEditor/settingsModel";
import { TextControl, NumberControl, SelectControl, ToggleControl, RangeControl, ColorControl, ImageControl, LinkControl, Group } from "./controls";
import { inputStyle } from "./controlStyles";

/* ---------------------------------------------------------------- section settings */

const IMAGE_KEY = /(^|_)image$/;
const LINK_KEY = /href$/;

function SchemaField({ t, field, value, onChange }) {
  const label = field.label;
  switch (field.kind) {
    case "toggle": return <ToggleControl label={label} checked={value === true} onChange={onChange} />;
    case "range": return <RangeControl label={label} value={value} min={field.min} max={field.max} step={field.step} unit={field.unit} onChange={onChange} />;
    case "select": return <SelectControl label={label} value={value} options={field.options || []} onChange={onChange} />;
    case "number": return <NumberControl label={label} value={value} min={field.min} max={field.max} step={field.step} onChange={onChange} />;
    case "textarea": return <TextControl label={label} value={value} multiline placeholder={field.placeholder} mono={field.key === "html"} onChange={onChange} />;
    default:
      if (IMAGE_KEY.test(field.key)) return <ImageControl t={t} label={label} value={value} onChange={onChange} />;
      if (LINK_KEY.test(field.key)) return <LinkControl t={t} label={label} value={value} onChange={onChange} />;
      return <TextControl label={label} value={value} placeholder={field.placeholder} onChange={onChange} />;
  }
}

/** every field of the section type (from the storefront's own schema), plus any extra keys an older saved layout carries */
export function SectionSettingsForm({ t, section, onChange, readOnly }) {
  const meta = sectionMeta(section.type);
  const settings = section.settings || {};
  const known = new Set((meta?.schema || []).map((f) => f.key));
  const extra = Object.keys(settings).filter((k) => !known.has(k));
  return (
    <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      {(meta?.schema || []).length === 0 && extra.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>{t("themeEditor.noSectionSettings")}</p>}
      {(meta?.schema || []).map((f) => (
        <SchemaField key={f.key} t={t} field={f} value={settings[f.key] ?? meta.defaults[f.key]} onChange={(v) => onChange(f.key, v)} />
      ))}
      {extra.length > 0 && (
        <div style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 12, marginTop: 4 }}>
          <p style={{ margin: "0 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("themeEditor.otherFields")}</p>
          {extra.map((k) => {
            const v = settings[k];
            if (typeof v === "boolean") return <ToggleControl key={k} label={k} checked={v} onChange={(x) => onChange(k, x)} />;
            if (typeof v === "number") return <NumberControl key={k} label={k} value={v} onChange={(x) => onChange(k, x)} />;
            return <TextControl key={k} label={k} value={String(v ?? "")} multiline={String(v ?? "").length > 60} onChange={(x) => onChange(k, x)} />;
          })}
        </div>
      )}
    </fieldset>
  );
}

export function SectionPanelTitle({ t, section }) {
  return <>{sectionLabel(t, section.type)}</>;
}

/* ---------------------------------------------------------------- theme settings */

const OPEN_DEFAULT = { design: true };

export function ThemeSettingsPanel({ t, settings, onSettings }) {
  const [open, setOpen] = useState(OPEN_DEFAULT);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const themeId = Number(settings.active_theme_id) || 1;
  const set = (path, value, key) => onSettings((s) => setIn(s, path, value), key || path.join("."));
  const orNull = (v) => (v === "" ? null : v);
  const palette = settings.palette || {};
  const slotLabel = (k) => t(PALETTE_SLOTS.find((s) => s.key === k).labelKey);

  return (
    <div>
      <Group title={t("themeEditor.grp.design")} open={!!open.design} onToggle={() => toggle("design")}>
        <SelectControl label={t("themeEditor.designTheme")} value={themeId} onChange={(v) => set(["active_theme_id"], Number(v))}
          options={STOREFRONT_THEMES.map((th) => ({ value: th.id, label: `${th.id}. ${th.name}` }))} hint={t("themeEditor.designThemeHint")} />
      </Group>

      <Group title={t("themeEditor.grp.branding")} open={!!open.branding} onToggle={() => toggle("branding")}>
        <TextControl label={t("themeEditor.storeDisplayName")} value={settings.store_display_name || ""} maxLength={60} onChange={(v) => set(["store_display_name"], orNull(v))} />
        <TextControl label={t("themeEditor.tagline")} value={settings.store_tagline || ""} maxLength={120} onChange={(v) => set(["store_tagline"], orNull(v))} />
        <ImageControl t={t} label={t("themeEditor.logo")} value={settings.logo_url || ""} onChange={(v) => set(["logo_url"], orNull(v))} />
        <ColorControl t={t} label={t("themeEditor.brandColor")} hint={t("themeEditor.brandColorHint")} value={settings.brand_color || ""} fallback="#111111"
          onChange={(v) => set(["brand_color"], v)} onReset={() => set(["brand_color"], null)} />
      </Group>

      <Group title={t("themeEditor.grp.colors")} open={!!open.colors} onToggle={() => toggle("colors")}>
        {PALETTE_SLOTS.map((slot) => (
          <ColorControl key={slot.key} t={t} label={t(slot.labelKey)} hint={t(slot.hintKey)} value={palette[slot.key] || ""} fallback={paletteDefault(slot.key, themeId)}
            onChange={(v) => set(["palette", slot.key], v, `pal.${slot.key}`)}
            onReset={() => onSettings((s) => { const p = { ...(s.palette || {}) }; delete p[slot.key]; return { ...s, palette: p }; }, `pal.${slot.key}`)} />
        ))}
        <p style={{ margin: "18px 0 10px", fontSize: 11.5, fontWeight: 700, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("themeEditor.elementColors")}</p>
        {ELEMENT_TARGETS.map((el) => (
          <SelectControl key={el.key} label={t(el.labelKey)} value={getIn(settings, ["palette_assign", el.key], "") || ""}
            onChange={(v) => set(["palette_assign", el.key], v || null)}
            options={[{ value: "", label: `${t("themeEditor.defaultSlot")} (${slotLabel(el.defaultSlot)})` }, ...PALETTE_SLOTS.map((s) => ({ value: s.key, label: t(s.labelKey) }))]} />
        ))}
      </Group>

      <Group title={t("themeEditor.grp.typography")} open={!!open.typography} onToggle={() => toggle("typography")}>
        {[["heading", "themeEditor.font.heading"], ["body", "themeEditor.font.body"], ["accent", "themeEditor.font.accent"]].map(([k, lk]) => (
          <SelectControl key={k} label={t(lk)} value={getIn(settings, ["font_overrides", k], "") || ""} onChange={(v) => set(["font_overrides", k], v || null)}
            options={[{ value: "", label: t("themeEditor.themeDefault") }, ...FONT_OPTIONS.map((f) => ({ value: f.key, label: f.label }))]} />
        ))}
      </Group>

      <Group title={t("themeEditor.grp.cards")} open={!!open.cards} onToggle={() => toggle("cards")}>
        {[["show_rating", "themeEditor.card.rating"], ["quick_view", "themeEditor.card.quickView"], ["quick_add", "themeEditor.card.quickAdd"]].map(([k, lk]) => (
          <ToggleControl key={k} label={t(lk)} checked={settings.card?.[k] !== false} onChange={(v) => set(["card", k], v)} />
        ))}
        <ColorControl t={t} label={t("themeEditor.sale.burst")} value={settings.sale_badge?.burst_color || ""} fallback="#fdf65e"
          onChange={(v) => set(["sale_badge", "burst_color"], v)} onReset={() => set(["sale_badge", "burst_color"], undefined)} />
        <ColorControl t={t} label={t("themeEditor.sale.text")} value={settings.sale_badge?.text_color || ""} fallback="#2e6eb0"
          onChange={(v) => set(["sale_badge", "text_color"], v)} onReset={() => set(["sale_badge", "text_color"], undefined)} />
      </Group>

      <Group title={t("themeEditor.grp.badges")} open={!!open.badges} onToggle={() => toggle("badges")}>
        <ToggleControl label={t("themeEditor.salesPop")} checked={settings.sales_pop?.enabled !== false} onChange={(v) => set(["sales_pop", "enabled"], v)} />
        <ToggleControl label={t("themeEditor.soldBadge")} checked={settings.sold_badge?.enabled !== false} onChange={(v) => set(["sold_badge", "enabled"], v)} />
        <TextControl label={t("themeEditor.soldBadgeText")} value={settings.sold_badge?.template || ""} onChange={(v) => set(["sold_badge", "template"], v)} />
        <ToggleControl label={t("themeEditor.stockBadge")} checked={settings.stock_badge?.enabled !== false} onChange={(v) => set(["stock_badge", "enabled"], v)} />
      </Group>

      <Group title={t("themeEditor.grp.productPage")} open={!!open.productPage} onToggle={() => toggle("productPage")}>
        <TextControl label={t("themeEditor.pdpPerks")} value={settings.pdp_perks || ""} maxLength={120} onChange={(v) => set(["pdp_perks"], orNull(v))} />
        <TextControl label={t("themeEditor.shipHeading")} value={settings.shipping_returns?.heading || ""} onChange={(v) => set(["shipping_returns", "heading"], v)} />
        <TextControl label={t("themeEditor.shipLines")} value={settings.shipping_returns?.lines || ""} multiline hint={t("themeEditor.shipLinesHint")} onChange={(v) => set(["shipping_returns", "lines"], v)} />
      </Group>

      <Group title={t("themeEditor.grp.advanced")} open={!!open.advanced} onToggle={() => toggle("advanced")}>
        <TextControl label={t("themeEditor.customCss")} value={settings.custom_css || ""} multiline mono placeholder={t("themeEditor.customCssHint")} onChange={(v) => set(["custom_css"], orNull(v))} />
        <TextControl label={t("themeEditor.aiBrief")} value={settings.ai_brief || ""} multiline placeholder={t("themeEditor.aiBriefHint")} onChange={(v) => set(["ai_brief"], orNull(v))} />
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------------- per-product details */

export function ProductMetaPanel({ t, products, productId, onProductId, meta, onMeta }) {
  const m = meta || {};
  const infoAt = (i) => m.info_sections?.[i] || { title: "", body: "" };
  const setInfo = (i, patch) => {
    const arr = [...(m.info_sections || [])];
    while (arr.length <= i) arr.push({ title: "", body: "" });
    arr[i] = { ...arr[i], ...patch };
    onMeta({ info_sections: arr.slice(0, META_LIMITS.info_sections_max) }, `info.${i}`);
  };
  const setPoint = (i, v) => {
    const kp = [...(m.key_points || []), "", "", ""].slice(0, META_LIMITS.key_points_max);
    kp[i] = v;
    onMeta({ key_points: kp }, `kp.${i}`);
  };
  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ne-muted)", lineHeight: 1.5 }}>{t("themeEditor.productIntro")}</p>
      {products.length > 0 ? (
        <SelectControl label={t("themeEditor.product")} value={productId || ""} onChange={onProductId}
          options={[{ value: "", label: t("themeEditor.chooseProduct") }, ...products.map((p) => ({ value: p.id, label: p.title || p.handle || p.id }))]} />
      ) : (
        <TextControl label={t("themeEditor.productId")} value={productId || ""} onChange={onProductId} hint={t("themeEditor.noProducts")} />
      )}
      {productId && (
        <>
          <TextControl label={`${t("themeEditor.cardTag")} (${META_LIMITS.card_tag})`} value={m.card_tag || ""} maxLength={META_LIMITS.card_tag} onChange={(v) => onMeta({ card_tag: v }, "card_tag")} />
          <TextControl label={`${t("themeEditor.titleTag")} (${META_LIMITS.title_tag})`} value={m.title_tag || ""} maxLength={META_LIMITS.title_tag} onChange={(v) => onMeta({ title_tag: v }, "title_tag")} />
          <p style={{ margin: "16px 0 8px", fontSize: 12, fontWeight: 700 }}>{t("themeEditor.keyPoints")}</p>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <input style={inputStyle} maxLength={META_LIMITS.key_point} aria-label={`${t("themeEditor.keyPoint")} ${i + 1}`} placeholder={`${t("themeEditor.keyPoint")} ${i + 1}`}
                value={m.key_points?.[i] || ""} onChange={(e) => setPoint(i, e.target.value)} />
            </div>
          ))}
          <p style={{ margin: "16px 0 8px", fontSize: 12, fontWeight: 700 }}>{t("themeEditor.infoSections")}</p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ border: "1px solid var(--ne-border)", borderRadius: 12, padding: 10, marginBottom: 10 }}>
              <input style={{ ...inputStyle, marginBottom: 6 }} maxLength={META_LIMITS.info_title} aria-label={`${t("themeEditor.infoTitle")} ${i + 1}`} placeholder={`${t("themeEditor.infoTitle")} ${i + 1}`}
                value={infoAt(i).title || ""} onChange={(e) => setInfo(i, { title: e.target.value })} />
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} maxLength={META_LIMITS.info_body} aria-label={t("themeEditor.infoBody")} placeholder={t("themeEditor.infoBody")}
                value={infoAt(i).body || ""} onChange={(e) => setInfo(i, { body: e.target.value })} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

