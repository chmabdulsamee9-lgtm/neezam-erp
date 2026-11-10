// Shared chrome of the theme editors (legacy and v2): the full-viewport layout CSS and the modal dialog.
export const EDITOR_CSS = `
.te-root{position:fixed;inset:0;z-index:1200;display:flex;flex-direction:column;background:var(--ne-sidebar-bg);color:var(--ne-text);font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.te-top{height:56px;flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:0 12px;background:var(--ne-surface);border-bottom:1px solid var(--ne-border)}
.te-top-l{display:flex;align-items:center;gap:10px;min-width:0}
.te-top-r{display:flex;align-items:center;gap:6px;justify-content:flex-end;min-width:0}
.te-ibtn{width:34px;height:34px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--ne-text);cursor:pointer}
.te-ibtn:hover:not(:disabled){background:var(--ne-surface-2)}
.te-ibtn:disabled{opacity:.35;cursor:not-allowed}
.te-ibtn[aria-pressed=true]{background:var(--ne-accent-soft);color:var(--ne-accent)}
.te-btn{height:34px;padding:0 14px;border-radius:10px;border:1px solid var(--ne-border);background:transparent;color:var(--ne-text);font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit}
.te-btn:hover:not(:disabled){background:var(--ne-surface-2)}
.te-btn:disabled{opacity:.45;cursor:not-allowed}
.te-btn.primary{background:var(--ne-grad);border-color:transparent;color:#fff}
.te-btn.primary:hover:not(:disabled){filter:brightness(1.08);background:var(--ne-grad)}
.te-body{flex:1;min-height:0;display:flex;gap:8px;padding:8px;position:relative}
.te-rail{width:52px;flex:none;display:flex;flex-direction:column;gap:6px;align-items:center;padding:8px 0;background:var(--ne-surface);border:1px solid var(--ne-border);border-radius:14px}
.te-railbtn{width:38px;height:38px;border-radius:10px;border:none;background:transparent;color:var(--ne-muted);cursor:pointer;display:flex;align-items:center;justify-content:center}
.te-railbtn:hover{background:var(--ne-surface-2);color:var(--ne-text)}
.te-railbtn[aria-pressed=true]{background:var(--ne-accent-soft);color:var(--ne-accent)}
.te-panel{width:320px;flex:none;position:relative;display:flex;flex-direction:column;background:var(--ne-surface);border:1px solid var(--ne-border);border-radius:14px;min-height:0;overflow:hidden}
.te-panel-h{position:relative;display:flex;align-items:center;gap:8px;min-height:50px;padding:0 10px 0 14px;border-bottom:1px solid var(--ne-border);font-weight:700;font-size:14px;flex:none}
.te-panel-b{flex:1;min-height:0;overflow-y:auto;padding:10px 10px 18px}
.te-preview{flex:1;min-width:0;display:flex;justify-content:center;background:var(--ne-surface-2);border:1px solid var(--ne-border);border-radius:14px;overflow:hidden}
.te-preview.mobile{padding:10px 0}
.te-frame{width:100%;height:100%;background:#fff;border:0;display:block;box-sizing:border-box}
.te-frame.mobile{width:390px;max-width:100%;border:1px solid var(--ne-border);border-radius:22px}
.te-row{position:relative;display:flex;align-items:center;gap:4px;padding:0 4px;min-height:38px;border-radius:10px;border:1px solid transparent;cursor:pointer}
.te-row:hover{background:var(--ne-surface-2)}
.te-row.sel{background:var(--ne-accent-soft);border-color:var(--ne-accent)}
.te-row.drop-before::before,.te-row.drop-after::after{content:'';position:absolute;inset-inline:6px;height:2px;border-radius:2px;background:var(--ne-accent)}
.te-row.drop-before::before{top:-2px}.te-row.drop-after::after{bottom:-2px}
.te-act:hover:not(:disabled){background:var(--ne-border) !important;color:var(--ne-text) !important}
.te-add{display:flex;align-items:center;gap:8px;width:100%;margin-top:4px;padding:8px 10px;border-radius:10px;border:none;background:transparent;color:var(--ne-accent);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.te-add:hover{background:var(--ne-surface-2)}
.te-pick:hover{background:var(--ne-surface-2) !important}
.te-pop{position:absolute;z-index:60;background:var(--ne-surface);border:1px solid var(--ne-border);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.45);padding:6px;min-width:210px}
.te-popitem{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:10px;border:none;background:transparent;color:var(--ne-text);font-size:13px;text-align:start;cursor:pointer;font-family:inherit}
.te-popitem:hover{background:var(--ne-surface-2)}
.te-popitem[aria-current=true]{background:var(--ne-accent-soft);color:var(--ne-accent)}
.te-narrow-only{display:none}
@media (max-width: 900px){
  .te-narrow-only{display:inline-flex}
  .te-rail{display:none}
  .te-top{grid-template-columns:auto 1fr auto;gap:6px}
  .te-top .te-hide-narrow{display:none}
  .te-panel{position:absolute;z-index:50;inset:8px auto 8px 8px;width:min(340px,calc(100% - 16px));display:none;box-shadow:0 14px 40px rgba(0,0,0,.5)}
  .te-body.panel-open .te-panel{display:flex}
}
`;

export function Dialog({ title, body, actions, onClose }) {
  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ width: "100%", maxWidth: 420, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{title}</h2>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.5, color: "var(--ne-muted)" }}>{body}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>{actions}</div>
      </div>
    </div>
  );
}
