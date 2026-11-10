import { META_LIMITS } from "../../lib/themeV2/inputs";
import { TextControl, SelectControl } from "../themeEditor/controls";
import { inputStyle } from "../themeEditor/controlStyles";

// Per-product merchandising details (card tag, title tag, key points, info tabs) saved in theme_config.product_meta.

export default function ProductMetaPanel({ t, products, productId, onProductId, meta, onMeta }) {
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

