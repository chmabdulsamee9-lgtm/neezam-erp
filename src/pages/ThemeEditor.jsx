import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";
import { EDITOR_CSS } from "../components/themeEditor/shell";
import ThemeEditorV2 from "./ThemeEditorV2";
import { isV2 } from "../lib/themeV2/engine.generated";
import { fetchJsonRetry } from "../lib/fetchRetry";

const CF_URL = "https://api.eneezam.com";

// Theme editor entry. Nova (theme_config version 2) is the only theme engine: a theme in any other format cannot be
// edited, published or duplicated any more, so it gets a clear message here (it can still be deleted from the Online Store list).
function Unsupported({ t, onNavigate, error, onRetry }) {
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
          {onRetry && <button className="te-btn" onClick={onRetry} style={{ marginTop: 12 }}>Try again</button>}
        </div>
      </div>
    </div>
  );
}

const lastThemeKey = (storeId) => `ne_edit_theme_${storeId}`;
const remember = (storeId, id) => { try { localStorage.setItem(lastThemeKey(storeId), id); } catch { /* private mode */ } };
const recall = (storeId) => { try { return localStorage.getItem(lastThemeKey(storeId)) || null; } catch { return null; } };

export default function ThemeEditor(props) {
  const { storeId, onNavigate } = props;
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  // the theme to open: the one the merchant picked, else the one last opened for this store (a reload loses the
  // in-memory id), else the store's most recently changed theme
  const themeId = props.themeId || null;
  const key = `${storeId}:${themeId}`;
  const [state, setState] = useState({ key: null, kind: null, theme: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!storeId) return undefined;
    let cancelled = false;
    const slowTimer = setTimeout(() => setSlow(true), 6000);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = { Authorization: `Bearer ${session?.access_token}` };
        let id = themeId || recall(storeId);
        let data = id ? await fetchJsonRetry(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(id)}`, { headers }) : null;
        if (!data?.theme) {
          // remembered theme gone (deleted) or none known: open the store's latest theme
          const list = await fetchJsonRetry(`${CF_URL}/list-store-themes?store_id=${encodeURIComponent(storeId)}`, { headers });
          const latest = [...(list.themes || [])].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
          if (latest && latest.id !== id) { id = latest.id; data = await fetchJsonRetry(`${CF_URL}/get-store-theme?theme_id=${encodeURIComponent(id)}`, { headers }); }
        }
        if (cancelled) return;
        if (!data?.theme) { setState({ key, kind: "error", theme: null, error: data?.error || t("themeEditor.loadFailed") }); return; }
        remember(storeId, data.theme.id);
        if (!themeId) props.onOpenThemeEditor?.(data.theme.id);
        setState({ key, kind: isV2(data.theme.theme_config) ? "v2" : "unsupported", theme: data.theme, error: "" });
      } catch (err) {
        if (!cancelled) setState({ key, kind: "error", theme: null, error: err instanceof TypeError ? t("onlineStore.networkError") : err.message });
      } finally {
        clearTimeout(slowTimer);
      }
    })();
    return () => { cancelled = true; clearTimeout(slowTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, key, attempt]);

  if (!storeId) return <Unsupported t={t} onNavigate={onNavigate} error={t("themeEditor.loadFailed")} />;
  if (state.key !== key || (state.kind === null)) {
    return (
      <div className="te-root"><style>{EDITOR_CSS}</style>
        <div style={{ margin: "auto", textAlign: "center", color: "var(--ne-muted)", fontSize: 13 }}>
          <div className="te-spin" style={{ width: 28, height: 28, margin: "0 auto 12px", borderRadius: "50%", border: "3px solid var(--ne-border)", borderTopColor: "var(--ne-accent)", animation: "teSpin 0.9s linear infinite" }} />
          <style>{"@keyframes teSpin{to{transform:rotate(360deg)}}"}</style>
          {slow ? "Your connection is slow. Still opening your theme…" : "Opening your theme…"}
        </div>
      </div>
    );
  }
  if (state.kind === "v2") return <ThemeEditorV2 {...props} themeId={state.theme.id} initialTheme={state.theme} />;
  return <Unsupported t={t} onNavigate={onNavigate} error={state.kind === "error" ? state.error : ""} onRetry={state.kind === "error" ? () => { setSlow(false); setState({ key: null, kind: null, theme: null, error: "" }); setAttempt((n) => n + 1); } : null} />;
}
