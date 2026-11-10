import { useLocation, useNavigate } from "react-router-dom";
import SolutionPageLayout from "./SolutionPageLayout";
import { SOLUTIONS_LINKS } from "../solutionsLinks";
import { useLanguage, useTranslation } from "../../../i18n";

// Renders any solution that is described as data in solutionsLinks.js (the `page` field): same layout as the other
// solution pages, plus an optional information box and links. Adding such a solution needs no new component.
export default function DataSolution() {
  const location = useLocation();
  const navigate = useNavigate();
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const entry = SOLUTIONS_LINKS.find((s) => s.page && s.path === location.pathname);
  if (!entry) return null;
  const p = entry.page;
  return (
    <SolutionPageLayout icon={entry.icon} titleKey={p.titleKey} subtitleKey={p.subtitleKey} features={p.features} noteKey={p.noteKey}>
      {p.infoTitleKey && (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t(p.infoTitleKey)}</div>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ne-muted)", lineHeight: 1.7 }}>{t(p.infoBodyKey)}</p>
          {p.links && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {p.links.map((l) => (
                <button key={l.path} onClick={() => navigate(l.path)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "var(--ne-accent)", textDecoration: "underline" }}>
                  {t(l.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </SolutionPageLayout>
  );
}
