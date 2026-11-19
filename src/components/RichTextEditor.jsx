// Small rich text editor (Shopify-style toolbar): headings, bold, italic, bullet and numbered lists, links.
// Output is cleaned to the same safe tags the storefront allows (p, h2-h4, strong, em, ul, ol, li, a, br);
// the worker sanitizes again on save.
import { useEffect, useRef } from "react";
import { cleanHtml, htmlText } from "../lib/richtext";

const TOOLS = [
  ["formatBlock:h3", "H", "Heading"], ["bold", "B", "Bold"], ["italic", "I", "Italic"],
  ["insertUnorderedList", "•", "Bullet list"], ["insertOrderedList", "1.", "Numbered list"], ["link", "🔗", "Link"],
  ["formatBlock:p", "¶", "Normal text"], ["removeFormat", "⌫", "Clear formatting"],
];

export default function RichTextEditor({ value, onChange, placeholder = "", minHeight = 180, maxChars = 6000 }) {
  const ref = useRef(null);
  const last = useRef(value);
  useEffect(() => {
    if (ref.current && value !== last.current) { ref.current.innerHTML = value || ""; last.current = value; }
  }, [value]);
  useEffect(() => { if (ref.current) ref.current.innerHTML = value || ""; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const emit = () => { const html = cleanHtml(ref.current.innerHTML); last.current = html; onChange(html); };
  const run = (cmd) => {
    ref.current.focus();
    if (cmd === "link") { const u = window.prompt("Link (https://…)"); if (u && /^https?:\/\//i.test(u)) document.execCommand("createLink", false, u); }
    else if (cmd.startsWith("formatBlock:")) document.execCommand("formatBlock", false, cmd.split(":")[1]);
    else document.execCommand(cmd, false, null);
    emit();
  };
  const chars = htmlText(value).length;
  const btn = { minWidth: 30, height: 28, border: "none", background: "transparent", color: "var(--ne-text)", borderRadius: 6, cursor: "pointer", fontWeight: 800, fontSize: 12.5 };
  return (
    <div style={{ border: "1px solid var(--ne-border)", borderRadius: 10, overflow: "hidden", background: "var(--ne-bg)" }}>
      <div style={{ display: "flex", gap: 2, padding: 4, borderBottom: "1px solid var(--ne-border)", background: "var(--ne-surface)", flexWrap: "wrap" }}>
        {TOOLS.map(([cmd, label, title]) => (
          <button key={cmd} type="button" title={title} aria-label={title} onMouseDown={(e) => { e.preventDefault(); run(cmd); }} style={{ ...btn, fontStyle: cmd === "italic" ? "italic" : "normal" }}>{label}</button>
        ))}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: chars > maxChars ? "var(--ne-danger)" : "var(--ne-muted)", paddingRight: 6 }}>{chars}/{maxChars}</span>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={emit} onBlur={emit} data-placeholder={placeholder}
        onPaste={(e) => { e.preventDefault(); const html = e.clipboardData.getData("text/html"); const text = e.clipboardData.getData("text/plain"); document.execCommand("insertHTML", false, html ? cleanHtml(html) : text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]).replace(/\n/g, "<br>")); emit(); }}
        className="ne-rte" style={{ minHeight, padding: "10px 14px", outline: "none", fontSize: 13.5, lineHeight: 1.6, color: "var(--ne-text)" }} />
      <style>{".ne-rte:empty:before{content:attr(data-placeholder);color:var(--ne-muted)}.ne-rte h3{font-size:15px;margin:10px 0 4px}.ne-rte ul,.ne-rte ol{padding-left:22px;margin:4px 0}.ne-rte p{margin:0 0 6px}.ne-rte a{color:var(--ne-accent)}"}</style>
    </div>
  );
}
