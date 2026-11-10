import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { EDITOR_CSS } from "../components/themeEditor/shell";
import ThemeEditorV2 from "./ThemeEditorV2";
import { isV2 } from "../lib/themeV2/engine.generated";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";

// Theme editor entry. Nova (theme_config version 2) is the only theme engine: a theme in any other format cannot be
// edited, published or duplicated any more, so it gets a clear message here (it can still be deleted from the Online Store list).
function Unsupported({ t, onNavigate, error }) {
  return (
    <div className="te-root">
      <style>{EDITOR_CSS}</style>
      <div style={{ margin: "auto", maxWidth: 440, width: "100%", padding: 16 }}>
        <button className="te-btn" onClick={() => onNavigate?.("online-store")} style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="chevronLeft" size={13} />{t("themeEditor.backButton")}
        </button>
        <div role="alert" style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.5rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: error ? "var(--ne-danger)" : "var(--ne-text)" }}>{error || t("themeEditor.v2.unsupportedTitle")}</p>
          {!error && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--ne-muted)" }}>{t("themeEditor.v2.unsupportedBody")}</p>}
        </div>
      </div>
    </div>
  );
}

export default function ThemeEditor(props) {
  const { storeId, themeId, onNavigate } = props;
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const key = `${storeId}:${themeId}`;
  const [state, setState] = useState({ key: null, kind: null, theme: null, error: "" });

  useEffect(() => {
    if (!storeId || !themeId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(themeId)}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
        const data = await res.json();
        if (cancelled) return;
        if (!data.theme) { setState({ key, kind: "error", theme: null, error: data.error || t("themeEditor.loadFailed") }); return; }
        setState({ key, kind: isV2(data.theme.theme_config) ? "v2" : "unsupported", theme: data.theme, error: "" });
      } catch (err) {
        if (!cancelled) setState({ key, kind: "error", theme: null, error: err instanceof TypeError ? t("onlineStore.networkError") : err.message });
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, themeId, key]);

  if (!storeId || !themeId) return <Unsupported t={t} onNavigate={onNavigate} error={t("themeEditor.loadFailed")} />;
  if (state.key !== key) return <div className="te-root"><style>{EDITOR_CSS}</style></div>;
  if (state.kind === "v2") return <ThemeEditorV2 {...props} initialTheme={state.theme} />;
  return <Unsupported t={t} onNavigate={onNavigate} error={state.kind === "error" ? state.error : ""} />;
}
