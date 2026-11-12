import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { TOKENS, TOKEN_GROUPS, MODES, cleanTheme, cssValue, applyTheme } from "../lib/themeTokens";
import PageEditor from "./PageEditor";

// Master Dashboard > UI Editor (creator only). Edits the app's look tokens for light and dark, previews every
// block on desktop or phone width, saves a draft and publishes it live for everybody (table app_theme_settings,
// row "global": draft + live). "Try on the whole app" applies the draft only on this screen until you leave.

const ROW_ID = "global";
const byKey = Object.fromEntries(TOKENS.map((t) => [t.key, t]));

function scopedCss(theme, scope) {
  // the preview needs the FULL token set of the previewed mode (it may differ from the app's current mode)
  return MODES.map((mode) => {
    const values = { ...Object.fromEntries(TOKENS.map((t) => [t.key, t[mode]])), ...((theme && theme[mode]) || {}) };
    const decl = TOKENS.map((t) => { const v = cssValue(t, values[t.key]); return v ? `${t.cssVar}:${v};` : ""; }).join("");
    const a = cssValue(byKey.accent, values.accent); const b = cssValue(byKey.accent2, values.accent2);
    return `${scope}[data-preview-theme="${mode}"]{${decl}--ne-grad:linear-gradient(120deg, ${a} 0%, ${b} 100%);color:var(--ne-text);background:var(--ne-bg);}`;
  }).join("\n");
}

// blocks of the preview; data-tokens drives the inspector
function Preview({ mobile }) {
  const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, boxShadow: "var(--ne-shadow-card)" };
  const btn = { padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 14, padding: 16 }}>
      <div data-tokens="card,border,radiusCard,shadow,surface,divider,text" style={{ ...card, overflow: "hidden", borderRadius: "var(--ne-radius-card)" }}>
        <div data-tokens="surface,text" style={{ background: "var(--ne-surface)", padding: "10px 14px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}><Icon name="settings" size={13} /> Unlock good seller health</div>
        {["Add business details", "Fulfill your first order"].map((x, i) => (
          <div key={x} data-tokens="text,divider" style={{ padding: "11px 14px", fontSize: 12.5, display: "flex", justifyContent: "space-between", borderTop: i ? "1px solid var(--ne-border-inner)" : "none" }}>{x}<Icon name="chevronRight" size={12} /></div>
        ))}
      </div>
      <div data-tokens="card,radiusCard,shadow" style={{ ...card, borderRadius: "var(--ne-radius-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button data-tokens="accent,accent2,radiusButton" style={{ ...btn, border: "none", color: "#fff", background: "var(--ne-grad)", borderRadius: "var(--ne-radius-button)" }}>Create order</button>
          <button data-tokens="card,border,text,radiusButton" style={{ ...btn, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", borderRadius: "var(--ne-radius-button)" }}>Export</button>
          <button data-tokens="danger,radiusButton" style={{ ...btn, border: "none", background: "var(--ne-danger)", color: "#fff", borderRadius: "var(--ne-radius-button)" }}>Delete</button>
        </div>
        <input data-tokens="card,border,text,radiusControl" placeholder="Search and filter" style={{ padding: "8px 10px", border: "1px solid var(--ne-border)", borderRadius: "var(--ne-radius-control)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 12 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["Delivered", "success"], ["Pending", "warning"], ["Returned", "danger"], ["Meta", "accent"]].map(([l, c]) => (
            <span key={l} data-tokens={c} style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: `var(--ne-${c})`, background: `color-mix(in srgb, var(--ne-${c}) 14%, transparent)` }}>{l}</span>
          ))}
        </div>
        <div data-tokens="muted" style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>Secondary text looks like this.</div>
      </div>
      <div data-tokens="card,border,radiusCard,shadow,text,muted,success" style={{ ...card, borderRadius: "var(--ne-radius-card)", padding: 14, gridColumn: mobile ? "auto" : "1 / -1", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div><div data-tokens="accent" style={{ color: "var(--ne-accent)", fontWeight: 700, fontSize: 13 }}>#7131</div><div style={{ fontSize: 11, color: "var(--ne-muted)" }}>11/11/2026 · 11:52 pm</div></div>
        <div style={{ fontSize: 12 }}><span data-tokens="text,surface" className="ne-editable">Abdullah Faisal</span><div className="ne-editable" style={{ fontSize: 11, color: "var(--ne-muted)" }}>Lahore</div></div>
        <div style={{ fontSize: 12, flex: 1, minWidth: 150 }}>Nano Hydroxyapatite Repair & Protect Toothpaste</div>
        <div data-tokens="success" style={{ fontWeight: 700, color: "var(--ne-success)" }}>Rs. 1,199</div>
      </div>
      <div data-tokens="card,radiusCard,shadow,surface,divider" style={{ ...card, borderRadius: "var(--ne-radius-card)", overflow: "hidden", gridColumn: mobile ? "auto" : "1 / -1" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr data-tokens="surface,muted" style={{ background: "var(--ne-surface)", color: "var(--ne-muted)", textAlign: "left" }}>{["Order", "Customer", "Total", "Status"].map((h) => <th key={h} style={{ padding: "8px 12px", fontWeight: 600 }}>{h}</th>)}</tr></thead>
          <tbody>{[["#DS4094", "Uzma Afzal", "1,199", "Pending"], ["#DS4093", "Rabia Mughal", "1,499", "Delivered"]].map((r) => (
            <tr key={r[0]} data-tokens="divider,text" style={{ borderTop: "1px solid var(--ne-border-inner)" }}>{r.map((c, i) => <td key={i} style={{ padding: "8px 12px" }}>{c}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function UiEditor() {
  const [saved, setSaved] = useState({ draft: {}, live: {} });
  const [theme, setTheme] = useState({ light: {}, dark: {} });
  const [mode, setMode] = useState(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  const [mobile, setMobile] = useState(false);
  const [tryOnApp, setTryOnApp] = useState(false);
  const [inspect, setInspect] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("page");
  const controlRefs = useRef({});

  useEffect(() => {
    supabase.from("app_theme_settings").select("draft, live").eq("id", ROW_ID).maybeSingle().then(({ data, error }) => {
      if (error) setMsg({ kind: "error", text: `Theme table not reachable: ${error.message}` });
      const row = { draft: cleanTheme(data?.draft), live: cleanTheme(data?.live) };
      setSaved(row);
      setTheme(row.draft);
      setLoaded(true);
    });
  }, []);

  // "Try on the whole app": the draft replaces the live look on this screen only; leaving restores the live look
  useEffect(() => { applyTheme(tryOnApp ? theme : saved.live); }, [tryOnApp, theme, saved.live]);
  useEffect(() => () => applyTheme(saved.live), [saved.live]);

  const values = theme[mode] || {};
  const valueOf = (t) => (values[t.key] !== undefined ? values[t.key] : t[mode]);
  const setValue = (key, v) => setTheme((prev) => ({ ...prev, [mode]: { ...(prev[mode] || {}), [key]: v } }));
  const resetKey = (key) => setTheme((prev) => { const m = { ...(prev[mode] || {}) }; delete m[key]; return { ...prev, [mode]: m }; });
  const dirty = JSON.stringify(cleanTheme(theme)) !== JSON.stringify(saved.draft);
  const draftDiffersFromLive = JSON.stringify(cleanTheme(theme)) !== JSON.stringify(saved.live);
  const css = useMemo(() => scopedCss(theme, ".ne-uie-preview"), [theme]);

  const write = async (fields, okText) => {
    setBusy(okText); setMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("app_theme_settings").upsert({ id: ROW_ID, ...fields, updated_at: new Date().toISOString(), updated_by: session?.user?.id || null });
    setBusy("");
    if (error) { setMsg({ kind: "error", text: error.message }); return false; }
    setSaved((s) => ({ ...s, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, cleanTheme(v)])) }));
    setMsg({ kind: "success", text: okText });
    return true;
  };
  const saveDraft = () => write({ draft: cleanTheme(theme) }, "Draft saved");
  const publish = () => { const t = cleanTheme(theme); write({ draft: t, live: t }, "Published: everybody sees this look now"); };

  const onPreviewClick = (e) => {
    const el = e.target.closest("[data-tokens]");
    if (!el) return;
    e.preventDefault();
    setInspect({ tokens: el.dataset.tokens.split(","), tag: el.tagName.toLowerCase(), text: (el.innerText || el.placeholder || "").trim().slice(0, 40) });
  };
  const jumpTo = (key) => { const node = controlRefs.current[key]; if (node) { node.scrollIntoView({ behavior: "smooth", block: "center" }); node.classList.add("ne-uie-flash"); setTimeout(() => node.classList.remove("ne-uie-flash"), 900); } };

  const control = (t) => {
    const v = valueOf(t);
    const changed = values[t.key] !== undefined && String(values[t.key]) !== String(t[mode]);
    return (
      <div key={t.key} ref={(n) => { controlRefs.current[t.key] = n; }} className="ne-uie-control">
        <div className="ne-uie-label">
          <span>{t.label}</span>
          {changed && <button type="button" onClick={() => resetKey(t.key)} title="Back to default"><Icon name="undo" size={11} /></button>}
        </div>
        {t.type === "color" && (
          <div className="ne-uie-color">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"} onChange={(e) => setValue(t.key, e.target.value)} />
            <input type="text" value={v} onChange={(e) => setValue(t.key, e.target.value.trim())} spellCheck={false} />
          </div>
        )}
        {(t.type === "px" || t.type === "number") && (
          <div className="ne-uie-range">
            <input type="range" min={t.min} max={t.max} step={t.step || 1} value={Number(v)} onChange={(e) => setValue(t.key, Number(e.target.value))} />
            <span>{t.full !== undefined && Number(v) >= t.full ? "round" : t.type === "px" ? `${v}px` : `${Math.round(Number(v) * 100)}%`}</span>
          </div>
        )}
        {t.type === "select" && (
          <div className="ne-uie-seg">
            {Object.keys(t.options).map((o) => <button key={o} type="button" className={v === o ? "on" : ""} onClick={() => setValue(t.key, o)}>{o}</button>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ne-uie">
      <style>{css}</style>
      <div className="ne-uie-top">
        <div>
          <h1>UI Editor</h1>
          <p>Edit any page live (Page editor) or the whole look (Global theme). Draft first, then publish live.</p>
          <div className="ne-uie-seg" style={{ marginTop: 8 }}>
            <button type="button" className={tab === "page" ? "on" : ""} onClick={() => setTab("page")}>Page editor</button>
            <button type="button" className={tab === "global" ? "on" : ""} onClick={() => setTab("global")}>Global theme</button>
          </div>
        </div>
        <div className="ne-uie-actions">
          <label className="ne-uie-toggle"><input type="checkbox" checked={tryOnApp} onChange={(e) => setTryOnApp(e.target.checked)} /> Try on the whole app</label>
          <button type="button" onClick={() => setTheme(saved.draft)} disabled={!dirty || !!busy}>Discard changes</button>
          <button type="button" onClick={() => setTheme({ light: {}, dark: {} })} disabled={!!busy}>Reset to default</button>
          <button type="button" onClick={saveDraft} disabled={!dirty || !!busy || !loaded}>{busy === "Draft saved" ? "Saving..." : "Save draft"}</button>
          <button type="button" className="primary" onClick={publish} disabled={!draftDiffersFromLive || !!busy || !loaded}>{busy.startsWith("Published") ? "Publishing..." : "Publish live"}</button>
        </div>
      </div>
      {msg && <div className={`ne-uie-msg ${msg.kind}`}>{msg.text}</div>}
      {tab === "page" && <div className="ne-uie-body"><PageEditor theme={theme} setTheme={setTheme} /></div>}
      {tab === "global" && <div className="ne-uie-body">
        <aside className="ne-uie-panel">
          <div className="ne-uie-seg ne-uie-modes">
            {MODES.map((m) => <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m === "light" ? "Light theme" : "Dark theme"}</button>)}
          </div>
          {TOKEN_GROUPS.map((g) => (
            <section key={g.id}>
              <h3>{g.label}</h3>
              {TOKENS.filter((t) => t.group === g.id).map(control)}
            </section>
          ))}
        </aside>
        <main className="ne-uie-stage">
          <div className="ne-uie-stagebar">
            <div className="ne-uie-seg">
              <button type="button" className={!mobile ? "on" : ""} onClick={() => setMobile(false)}>Desktop</button>
              <button type="button" className={mobile ? "on" : ""} onClick={() => setMobile(true)}>Mobile</button>
            </div>
            <span>Click any block to inspect it</span>
          </div>
          <div className="ne-uie-frame" style={{ width: mobile ? 390 : "100%" }}>
            <div className="ne-uie-preview" data-preview-theme={mode} onClick={onPreviewClick}>
              <Preview mobile={mobile} />
            </div>
          </div>
          {inspect && (
            <div className="ne-uie-inspector">
              <div className="ne-uie-inspector-head"><b>Inspector</b> <code>{inspect.tag}</code> {inspect.text && <span>"{inspect.text}"</span>}<button type="button" onClick={() => setInspect(null)}><Icon name="close" size={11} /></button></div>
              {inspect.tokens.filter((k) => byKey[k]).map((k) => (
                <button type="button" key={k} className="ne-uie-inspector-row" onClick={() => jumpTo(k)}>
                  <span>{byKey[k].label}</span>
                  <code>{byKey[k].cssVar}</code>
                  {byKey[k].type === "color" && <i style={{ background: valueOf(byKey[k]) }} />}
                  <b>{String(valueOf(byKey[k]))}</b>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>}
    </div>
  );
}
