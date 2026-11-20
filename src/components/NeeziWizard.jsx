// Neezi setup wizard (Nov 2026): Brand (name, logo, favicon, Neezi logo maker) -> About the brand -> Policies ->
// Colours (light or contrast, from the logo) -> Theme (or let Neezi choose) -> start. State lives in the Neezi job
// (lib/neeziJob) so it survives closing the popup.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import Icon from "./Icon";
import { patchNeeziJob } from "../lib/neeziJob";
import { brandColorFrom, removeWhiteBackground, faviconFromLogo, swatchesFor } from "../lib/brandKit";

const CF = "https://api.eneezam.com";
const STEPS = [
  ["brand", "Brand"],
  ["about", "About"],
  ["policies", "Policies"],
  ["colors", "Colours"],
  ["theme", "Theme"],
];
const WIZ_DEFAULT = {
  step: "brand", name: "", logo: "", favicon: "", about: "", refUrl: "", logoNote: "", draftLogo: "",
  policies: { delivery_days: "3 to 5 working days", shipping_fee: "", free_over: "", cod: true, return_days: 7, return_rule: "Unused items in their original packaging", refund_type: "exchange_or_refund", contact_phone: "", contact_email: "" },
  mode: "light", brandColor: "", themeChoice: "auto", loaded: false,
};

const input = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, fontFamily: "inherit" };
const label = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ne-muted)", marginBottom: 5 };
const btn = (primary, disabled) => ({
  background: disabled ? "var(--ne-border)" : primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)",
  border: primary ? "none" : "1px solid var(--ne-border)", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700,
  cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.7 : 1,
});
const tile = { border: "1px solid var(--ne-border)", borderRadius: 12, padding: 12, background: "var(--ne-surface)", display: "grid", gap: 8 };
const Field = ({ l, children, hint }) => <label style={{ display: "block" }}><span style={label}>{l}</span>{children}{hint && <span style={{ display: "block", fontSize: 11, color: "var(--ne-muted)", marginTop: 4 }}>{hint}</span>}</label>;
const Note = ({ kind, children }) => <div style={{ fontSize: 12.5, padding: "9px 11px", borderRadius: 9, background: kind === "error" ? "rgba(220,38,38,.08)" : "var(--ne-surface)", color: kind === "error" ? "#dc2626" : "var(--ne-text)", border: "1px solid var(--ne-border)" }}>{children}</div>;

async function upload(storeId, blobOrFile) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${CF}/growth/upload-image?store_id=${storeId}&kind=product`, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": blobOrFile.type || "image/png" }, body: blobOrFile });
  const d = await res.json().catch(() => ({}));
  if (!d.url) throw new Error(d.error || "Upload failed");
  return d.url;
}

export default function NeeziWizard({ job, api, themeInfo, themeOrder, DemoFrame, firstVersion, onStart }) {
  const w = { ...WIZ_DEFAULT, ...(job.wiz || {}) };
  const set = (patch) => patchNeeziJob((j) => ({ wiz: { ...WIZ_DEFAULT, ...(j.wiz || {}), ...(typeof patch === "function" ? patch({ ...WIZ_DEFAULT, ...(j.wiz || {}) }) : patch) } }));
  const setPol = (k, v) => set((x) => ({ policies: { ...x.policies, [k]: v } }));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const logoFile = useRef(null), favFile = useRef(null), refFile = useRef(null);
  const tier = job.plan?.tier || "essential";
  const paid = tier !== "essential";
  const idx = STEPS.findIndex(([k]) => k === w.step);

  // what the store already has: brand name, about, policy answers
  useEffect(() => {
    if (w.loaded) return;
    api(`/growth/neezi-brand?store_id=${job.storeId}`).then((d) => {
      set((x) => ({ loaded: true, name: x.name || d.brand_name || job.storeName || "", about: x.about || d.about || "", policies: d.policies ? { ...x.policies, ...d.policies } : { ...x.policies, free_over: d.free_over ? String(d.free_over) : x.policies.free_over } }));
    });
  }, [job.storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // brand colour from the logo (the merchant can still change it)
  useEffect(() => {
    if (!w.logo || w.brandColor) return;
    brandColorFrom(w.logo).then((c) => set({ brandColor: c })).catch(() => set({ brandColor: "#6d4aff" }));
  }, [w.logo]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key, fn) => { setBusy(key); setErr(""); try { await fn(); } catch (e) { setErr(e.message || "Something went wrong"); } finally { setBusy(""); } };
  const pickFile = (ref) => ref.current?.click();
  const onLogo = (file) => file && run("logo", async () => { const url = await upload(job.storeId, file); set({ logo: url, brandColor: "", draftLogo: "" }); });
  const onFav = (file) => file && run("fav", async () => { const url = await upload(job.storeId, file); set({ favicon: url }); });
  const onRef = (file) => file && run("ref", async () => { const url = await upload(job.storeId, file); set({ refUrl: url }); });
  const favOpts = () => ({ name: w.name, color: w.brandColor });
  const makeFavicon = () => run("fav", async () => { const blob = await faviconFromLogo(w.logo, favOpts()); set({ favicon: await upload(job.storeId, blob) }); });
  const makeLogo = () => run("ai", async () => {
    const d = await api("/growth/neezi-logo", { method: "POST", body: { store_id: job.storeId, brand_name: w.name, about: w.logoNote, ref_url: w.refUrl || undefined } });
    if (d.error) throw new Error(d.error);
    set({ draftLogo: d.url });
  });
  const useDraft = () => run("use", async () => {
    const png = await removeWhiteBackground(w.draftLogo);
    const url = await upload(job.storeId, png);
    const favBlob = await faviconFromLogo(url, { name: w.name, color: await brandColorFrom(url).catch(() => "") }).catch(() => null);
    const fav = !w.favicon && favBlob ? await upload(job.storeId, favBlob) : w.favicon;
    set({ logo: url, favicon: fav, draftLogo: "", brandColor: "" });
  });

  const next = async () => {
    if (w.step === "brand") {
      if (!w.name.trim()) { setErr("Write your brand name."); return; }
      // a logo but no favicon: Neezi makes the favicon from the logo
      if (w.logo && !w.favicon) { await run("fav", async () => { const blob = await faviconFromLogo(w.logo, favOpts()); set({ favicon: await upload(job.storeId, blob) }); }); }
    }
    if (w.step === "about" && w.about.trim().length < 15) { setErr("Tell Neezi a little more about your brand (one or two sentences)."); return; }
    setErr("");
    set({ step: STEPS[Math.min(idx + 1, STEPS.length - 1)][0] });
  };
  const back = () => { setErr(""); set({ step: STEPS[Math.max(idx - 1, 0)][0] }); };

  const imgBox = (src, h = 64) => src ? <img src={src} alt="" style={{ height: h, maxWidth: "100%", objectFit: "contain", background: "repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0/14px 14px", borderRadius: 8, padding: 6 }} /> : <div style={{ height: h, borderRadius: 8, border: "1px dashed var(--ne-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--ne-muted)" }}>None yet</div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* steps */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STEPS.map(([k, t], i) => (
          <span key={k} style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 99, background: i === idx ? "var(--ne-grad)" : i < idx ? "var(--ne-surface)" : "transparent", color: i === idx ? "#fff" : i < idx ? "var(--ne-text)" : "var(--ne-muted)", border: i === idx ? "none" : "1px solid var(--ne-border)" }}>
            {i < idx ? "✓ " : `${i + 1}. `}{t}
          </span>
        ))}
      </div>

      {w.step === "brand" && (
        <>
          <Field l="Brand name"><input style={input} value={w.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your brand name" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div style={tile}>
              <b style={{ fontSize: 13 }}>Logo</b>
              {imgBox(w.logo)}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={btn(false, !!busy)} disabled={!!busy} onClick={() => pickFile(logoFile)}><Icon name="upload" size={12} /> {busy === "logo" ? "Uploading…" : w.logo ? "Change" : "Upload logo"}</button>
                {w.logo && <button style={btn(false)} onClick={() => set({ logo: "", brandColor: "" })}>Remove</button>}
              </div>
              <input ref={logoFile} type="file" accept="image/*" hidden onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div style={tile}>
              <b style={{ fontSize: 13 }}>Favicon <span style={{ fontWeight: 500, color: "var(--ne-muted)" }}>(the small icon in the browser tab)</span></b>
              {imgBox(w.favicon)}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={btn(false, !!busy)} disabled={!!busy} onClick={() => pickFile(favFile)}><Icon name="upload" size={12} /> {busy === "fav" ? "Working…" : w.favicon ? "Change" : "Upload favicon"}</button>
                {w.logo && <button style={btn(false, !!busy)} disabled={!!busy} onClick={makeFavicon}><Icon name="sparkle" size={12} /> Make from logo</button>}
              </div>
              <input ref={favFile} type="file" accept="image/*" hidden onChange={(e) => { onFav(e.target.files?.[0]); e.target.value = ""; }} />
              {w.logo && !w.favicon && <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>No favicon? Neezi makes it from your logo when you press Next.</span>}
            </div>
          </div>

          {!w.logo && (
            <div style={{ ...tile, background: "var(--ne-surface-2)" }}>
              <b style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Icon name="sparkle" size={13} /> No logo? Let Neezi design one</b>
              {!paid ? <span style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>Logo design by Neezi comes with the Grow and Advance plans. You can continue without a logo: your brand name is shown in the header.</span> : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "start" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <span style={label}>Reference (optional)</span>
                      {w.refUrl ? <img src={w.refUrl} alt="" style={{ width: 110, height: 80, objectFit: "contain", borderRadius: 8, border: "1px solid var(--ne-border)" }} /> : <div style={{ width: 110, height: 80, borderRadius: 8, border: "1px dashed var(--ne-border)" }} />}
                      <button style={btn(false, !!busy)} disabled={!!busy} onClick={() => pickFile(refFile)}>{busy === "ref" ? "Uploading…" : w.refUrl ? "Change" : "Upload 1 image"}</button>
                      <input ref={refFile} type="file" accept="image/*" hidden onChange={(e) => { onRef(e.target.files?.[0]); e.target.value = ""; }} />
                    </div>
                    <Field l="What kind of logo do you want?" hint="Style, colours, icon idea. Example: minimal, lavender and gold, a leaf with the name in a clean serif font.">
                      <textarea style={{ ...input, minHeight: 92, resize: "vertical" }} value={w.logoNote} onChange={(e) => set({ logoNote: e.target.value })} placeholder="Describe the logo you have in mind" />
                    </Field>
                  </div>
                  {w.draftLogo && (
                    <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                      <img src={w.draftLogo} alt="" style={{ width: 200, height: 200, objectFit: "contain", borderRadius: 10, border: "1px solid var(--ne-border)", background: "#fff" }} />
                      <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>The white background is removed when you use it.</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={btn(!w.draftLogo, !!busy || !w.name.trim())} disabled={!!busy || !w.name.trim()} onClick={makeLogo}><Icon name="sparkle" size={12} /> {busy === "ai" ? "Neezi is designing (20 to 60 seconds)…" : w.draftLogo ? "Make another" : "Make my logo"}</button>
                    {w.draftLogo && <button style={btn(true, !!busy)} disabled={!!busy} onClick={useDraft}><Icon name="check" size={12} /> {busy === "use" ? "Saving…" : "Use this logo"}</button>}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {w.step === "about" && (
        <Field l="What is your brand about?" hint="Neezi uses this for your collections, homepage text, banners, product listings and to choose a theme.">
          <textarea style={{ ...input, minHeight: 130, resize: "vertical" }} value={w.about} onChange={(e) => set({ about: e.target.value })} placeholder="Example: Glowe sells dermatologist-tested Korean skincare for Pakistani skin: serums, sunscreens and face washes for oily and acne-prone skin. Friendly, simple, honest." />
        </Field>
      )}

      {w.step === "policies" && (
        <>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ne-muted)" }}>Neezi writes your Shipping, Return, Privacy and Terms pages from these answers and puts them in the footer.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <Field l="Delivery time"><input style={input} value={w.policies.delivery_days} onChange={(e) => setPol("delivery_days", e.target.value)} placeholder="3 to 5 working days" /></Field>
            <Field l="Delivery charges" hint="Leave empty if they're shown at checkout."><input style={input} value={w.policies.shipping_fee} onChange={(e) => setPol("shipping_fee", e.target.value)} placeholder="Rs 200 all over Pakistan" /></Field>
            <Field l="Free delivery over (Rs)" hint="Leave empty if there's no free delivery."><input style={input} type="number" min="0" value={w.policies.free_over} onChange={(e) => setPol("free_over", e.target.value)} placeholder="3000" /></Field>
            <Field l="Returns">
              <select style={input} value={String(w.policies.return_days)} onChange={(e) => setPol("return_days", Number(e.target.value))}>
                {[0, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n ? `Within ${n} days` : "No returns (only damaged or wrong items)"}</option>)}
              </select>
            </Field>
            {Number(w.policies.return_days) > 0 && (
              <>
                <Field l="Customer gets">
                  <select style={input} value={w.policies.refund_type} onChange={(e) => setPol("refund_type", e.target.value)}>
                    <option value="exchange_or_refund">Exchange or refund</option>
                    <option value="exchange_only">Exchange only</option>
                    <option value="refund_only">Refund only</option>
                  </select>
                </Field>
                <Field l="Return condition"><input style={input} value={w.policies.return_rule} onChange={(e) => setPol("return_rule", e.target.value)} /></Field>
              </>
            )}
            <Field l="WhatsApp / phone for customers"><input style={input} value={w.policies.contact_phone} onChange={(e) => setPol("contact_phone", e.target.value)} placeholder="0300 1234567" /></Field>
            <Field l="Email for customers (optional)"><input style={input} type="email" value={w.policies.contact_email} onChange={(e) => setPol("contact_email", e.target.value)} placeholder="hello@yourbrand.com" /></Field>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" checked={!!w.policies.cod} onChange={(e) => setPol("cod", e.target.checked)} /> Cash on delivery available</label>
        </>
      )}

      {w.step === "colors" && (
        <>
          {paid ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5 }}>Brand colour{w.logo ? " (from your logo)" : ""}:</span>
              <input type="color" value={w.brandColor || "#6d4aff"} onChange={(e) => set({ brandColor: e.target.value })} style={{ width: 44, height: 30, border: "1px solid var(--ne-border)", borderRadius: 8, background: "none" }} />
              <code style={{ fontSize: 12 }}>{w.brandColor || "#6d4aff"}</code>
            </div>
          ) : <Note>Colours made from your logo come with the Grow and Advance plans. Your theme uses its own light or dark colours.</Note>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["light", "Light colours", "Clean white pages, your colour on buttons and highlights."], ["contrast", "Contrast colours", "Deep dark pages with your colour standing out."]].map(([k, t, d]) => {
              const sw = swatchesFor(w.brandColor || "#6d4aff", k);
              const on = w.mode === k;
              return (
                <button key={k} onClick={() => set({ mode: k })} style={{ ...tile, textAlign: "left", cursor: "pointer", outline: on ? "2px solid var(--ne-accent, #6366f1)" : "none", background: on ? "var(--ne-surface-2)" : "var(--ne-surface)" }}>
                  <div style={{ height: 70, borderRadius: 9, background: sw[0], border: "1px solid var(--ne-border)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: sw[3] }}>{w.name || "Brand"}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: sw[1], color: k === "contrast" ? "#111" : "#fff" }}>Shop now</span>
                  </div>
                  <b style={{ fontSize: 13 }}>{on ? "✓ " : ""}{t}</b>
                  <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>{d}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {w.step === "theme" && (
        <>
          <button onClick={() => set({ themeChoice: "auto" })} style={{ ...tile, textAlign: "left", cursor: "pointer", outline: w.themeChoice === "auto" ? "2px solid var(--ne-accent, #6366f1)" : "none" }}>
            <b style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Icon name="sparkle" size={13} /> {w.themeChoice === "auto" ? "✓ " : ""}Let Neezi choose the theme for my brand (recommended)</b>
            <span style={{ fontSize: 12, color: "var(--ne-muted)" }}>Neezi looks at your products and brand and picks the theme that fits best.</span>
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
            {themeOrder.map((id) => (
              <div key={id} role="button" tabIndex={0} onClick={() => set({ themeChoice: id })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") set({ themeChoice: id }); }} style={{ ...tile, minWidth: 0, overflow: "hidden", cursor: "pointer", outline: w.themeChoice === id ? "2px solid var(--ne-accent, #6366f1)" : "none" }}>
                <div style={{ pointerEvents: "none", minWidth: 0, width: "100%" }}><DemoFrame src={`${job.liveUrl}/__demo/${id}/${firstVersion(id)}`} height={150} /></div>
                <b style={{ fontSize: 13 }}>{w.themeChoice === id ? "✓ " : ""}{themeInfo[id].name}</b>
                <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{themeInfo[id].ref}</span>
              </div>
            ))}
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" checked={!!job.auto} onChange={(e) => patchNeeziJob({ auto: e.target.checked })} /> Let Neezi do everything without stopping for review{paid ? " (including AI banners)" : ""}</label>
        </>
      )}

      {err && <Note kind="error">{err}</Note>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button style={btn(false, idx === 0 || !!busy)} disabled={idx === 0 || !!busy} onClick={back}>Back</button>
        {w.step !== "theme"
          ? <button style={btn(true, !!busy)} disabled={!!busy} onClick={next}>{busy === "fav" ? "Making favicon…" : "Next"}</button>
          : <button style={btn(true, !!busy)} disabled={!!busy} onClick={() => run("start", () => onStart(w))}><Icon name="sparkle" size={13} /> {busy === "start" ? "Saving your brand…" : job.auto ? "Set up my store" : "Start Neezi setup"}</button>}
      </div>
    </div>
  );
}
