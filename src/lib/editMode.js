// Page editor "edit mode": runs only inside the UI Editor's preview iframe (the iframe is named "ne-edit", which
// survives navigation inside the frame). Hovering outlines an element of the page, clicking picks it (the click does
// not reach the app) and sends its selector + current styles to the editor; the editor sends the draft theme back,
// which is applied live. Messages are accepted only from the same origin.
import { applyTheme, PAGE_PROPS } from "./themeTokens";

export const EDIT_FRAME_NAME = "ne-edit";

/** CSS path from the page container (.ne-content) to el; `general` drops the position on repeated items (all cards) */
export function selectorFor(el, root) {
  const steps = [];
  let node = el;
  while (node && node !== root && node.parentElement) {
    const parent = node.parentElement;
    const kids = [...parent.children];
    const tag = node.tagName.toLowerCase();
    steps.unshift({ tag, idx: kids.indexOf(node) + 1, repeated: kids.filter((c) => c.tagName === node.tagName).length >= 3 });
    node = parent;
  }
  if (node !== root) return null;
  const exact = "> " + steps.map((s) => `${s.tag}:nth-child(${s.idx})`).join(" > ");
  const general = "> " + steps.map((s) => (s.repeated ? s.tag : `${s.tag}:nth-child(${s.idx})`)).join(" > ");
  return { exact, general, depth: steps.length };
}

const rgbToHex = (c) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c || "");
  if (!m) return "";
  if (m[4] !== undefined && Number(m[4]) === 0) return "";
  return "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
};

function currentStyles(el) {
  const cs = getComputedStyle(el);
  const out = {};
  for (const p of PAGE_PROPS) {
    const v = cs.getPropertyValue(p.prop);
    if (p.kind === "color") out[p.prop] = rgbToHex(v);
    else if (p.kind === "px") out[p.prop] = p.prop === "padding" ? parseFloat(cs.paddingTop) || 0 : parseFloat(v) || 0;
    else if (p.kind === "num") out[p.prop] = p.prop === "line-height" ? (parseFloat(v) / (parseFloat(cs.fontSize) || 13)).toFixed(2) : parseFloat(v);
    else out[p.prop] = p.prop === "display" ? "" : v;
  }
  return out;
}

export function installEditMode() {
  if (typeof window === "undefined" || window.parent === window || window.name !== EDIT_FRAME_NAME) return;
  const parentOrigin = window.location.origin;
  let picking = true;
  const send = (msg) => window.parent.postMessage(msg, parentOrigin);

  const box = document.createElement("div");
  box.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #5C7CFA;background:rgba(92,124,250,.08);border-radius:4px;transition:all .08s ease;display:none";
  const tag = document.createElement("div");
  tag.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;background:#5C7CFA;color:#fff;font:600 11px/1.6 system-ui;padding:0 6px;border-radius:4px;display:none;white-space:nowrap";
  const mount = () => { if (!box.isConnected) { document.body.appendChild(box); document.body.appendChild(tag); } };

  const pageKey = () => document.querySelector(".ne-content")?.getAttribute("data-ne-page") || "";
  const inPage = (el) => el && el.closest && el.closest(".ne-content") && !el.closest("[data-ne-edit-ignore]");
  const show = (el) => {
    mount();
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    tag.textContent = `${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)}`;
    Object.assign(tag.style, { display: "block", left: `${r.left}px`, top: `${Math.max(0, r.top - 18)}px` });
  };
  const hide = () => { box.style.display = "none"; tag.style.display = "none"; };

  document.addEventListener("mouseover", (e) => { if (picking && inPage(e.target)) show(e.target); else hide(); }, true);
  document.addEventListener("scroll", hide, true);
  document.addEventListener("click", (e) => {
    if (!picking || !inPage(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    const root = el.closest(".ne-content");
    const sel = selectorFor(el, root);
    if (!sel) return;
    const text = (el.innerText || el.value || el.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 40);
    send({ type: "ne-pick", page: pageKey(), selector: sel.exact, general: sel.general, label: `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ""}`, styles: currentStyles(el) });
  }, true);

  window.addEventListener("message", (e) => {
    if (e.origin !== parentOrigin || e.source !== window.parent) return;
    const d = e.data || {};
    if (d.type === "ne-theme") applyTheme(d.theme);
    if (d.type === "ne-pick-mode") { picking = !!d.on; if (!picking) hide(); }
  });

  // tell the editor which page is open (also after navigating inside the frame)
  let last = "";
  setInterval(() => { const p = pageKey(); if (p !== last) { last = p; send({ type: "ne-page", page: p }); } }, 500);
  send({ type: "ne-ready" });
}
