// Rich text helpers for the product editor (same safe tags the storefront allows).
const ALLOWED = new Set(["P", "H2", "H3", "H4", "STRONG", "EM", "B", "I", "UL", "OL", "LI", "A", "BR"]);
const RENAME = { B: "strong", I: "em", DIV: "p" };

export function cleanHtml(html) {
  const box = document.createElement("div");
  box.innerHTML = String(html || "");
  const walk = (node) => {
    let out = "";
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += n.textContent.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      const inner = walk(n);
      if (tag === "BR") { out += "<br>"; return; }
      if (!ALLOWED.has(tag) && tag !== "DIV" && tag !== "SPAN") { out += inner; return; }
      if (tag === "SPAN") { out += inner; return; }
      const name = (RENAME[tag] || tag).toLowerCase();
      if (name === "a") {
        const href = n.getAttribute("href") || "";
        out += /^(https?:|\/|mailto:|tel:)/i.test(href) ? `<a href="${href.replace(/"/g, "&quot;")}">${inner}</a>` : inner;
        return;
      }
      if (!inner.replace(/<br>/g, "").trim() && name !== "li") return;
      out += `<${name}>${inner}</${name}>`;
    });
    return out;
  };
  return walk(box).replace(/(<p><\/p>)+/g, "");
}

export const htmlText = (html) => { const d = document.createElement("div"); d.innerHTML = html || ""; return (d.textContent || "").replace(/\s+/g, " ").trim(); };

