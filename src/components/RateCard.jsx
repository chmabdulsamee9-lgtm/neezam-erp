// Courier rate card v2 (worker rates.js): per region the base fee (up to 0.5 kg), the fee for each further 0.5 kg,
// fuel adjustment %, VAT %, income tax % and sales tax %. "Local" is the merchant's own city.
//   NeX: eNeezam edits (Master Dashboard > NeX: the default card or one merchant's); merchants only see theirs.
//   DEX: the merchant edits its own card.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import Icon from "./Icon";

const CF = "https://neezam-erp.chmabdulsamee9.workers.dev";
async function ratesApi(path, body) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${CF}/rates/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(body) });
    return (await res.json().catch(() => null)) || { error: `HTTP ${res.status}` };
  } catch (err) {
    return { error: err.message || "Connection problem" };
  }
}

const FIELDS = [
  ["base_fee", "Base fee (0.5 kg tak)"],
  ["extra_half_kg", "Har agla 0.5 kg"],
  ["fuel_pct", "Fuel adjustment %"],
  ["vat_pct", "VAT %"],
  ["income_tax_pct", "Income tax %"],
  ["sales_tax_pct", "Sales tax %"],
];
const REGION_LABEL = { "Federally Administered Tribal Areas": "FATA" };

// readOnly: only show the rates (NeX statement: rates are assigned from Master Dashboard > NeX).
export default function RateCard({ storeId = null, courier, title, onClose, readOnly = false }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const d = await ratesApi("get", { store_id: storeId, courier });
    if (d.error) { setError(d.error); return; }
    setData(d);
    setRows(d.rows.map((r) => ({ ...r })));
  }, [storeId, courier]);
  useEffect(() => { load(); }, [load]);

  const set = (i, f, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [f]: v } : r)));
  const save = async () => {
    setBusy(true); setMsg(""); setError("");
    const d = await ratesApi("save", { store_id: storeId, courier, rows: rows.map((r) => Object.fromEntries([["region", r.region], ...FIELDS.map(([f]) => [f, r[f]])])) });
    setBusy(false);
    if (d.error) { setError(d.error); return; }
    setMsg("Rate card save ho gaya."); load();
  };
  const reset = async () => {
    if (!window.confirm("Is store ka apna rate card hata kar default rates par wapas jayein?")) return;
    setBusy(true); setMsg(""); setError("");
    const d = await ratesApi("reset", { store_id: storeId, courier });
    setBusy(false);
    if (d.error) { setError(d.error); return; }
    setMsg("Default rates lag gaye."); load();
  };

  const edit = !readOnly && Boolean(data?.editable);
  const cell = { padding: "6px 6px", borderBottom: "1px solid var(--ne-border)", whiteSpace: "nowrap" };
  const inp = { width: 74, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--ne-border)", background: edit ? "var(--ne-bg)" : "var(--ne-surface)", color: "var(--ne-text)", fontSize: 12, boxSizing: "border-box" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1000000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 860, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", color: "var(--ne-text)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}><Icon name="card" size={14} /> {title}</h2>
          <button aria-label="Band karein" onClick={onClose} style={{ background: "none", border: "none", color: "var(--ne-muted)", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: "12px 18px", overflow: "auto", display: "grid", gap: 10 }}>
          {error && <div role="alert" style={{ color: "var(--ne-danger)", fontSize: 12.5 }}>{error}</div>}
          {msg && <div role="status" style={{ color: "var(--ne-success)", fontSize: 12.5 }}>{msg}</div>}
          <p style={{ margin: 0, fontSize: 12, color: "var(--ne-muted)", lineHeight: 1.6 }}>
            Shipping = base fee (0.5 kg tak) + har agle 0.5 kg ka fee. Fuel adjustment shipping fee par lagta hai, VAT shipping + fuel par, income aur sales tax deliver hone wale parcel ki COD par.
            {data && !edit && (courier === "nex" ? " Yeh NeX ke rates eNeezam ne aap ke liye rakhe hain; badal nahi sakte." : " Yeh rates sirf store owner badal sakta hai.")}
          </p>
          {!data ? <p style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>Load ho raha hai...</p> : (
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
              <thead><tr><th style={{ ...cell, textAlign: "left", color: "var(--ne-muted)", fontSize: 11 }}>Ilaqa</th>{FIELDS.map(([f, l]) => <th key={f} style={{ ...cell, textAlign: "left", color: "var(--ne-muted)", fontSize: 11 }}>{l}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={r.region}>
                  <td style={{ ...cell, fontWeight: 700 }}>{r.region === "Local" ? `Local${data.merchant_city ? ` (${data.merchant_city})` : " (merchant ki city)"}` : REGION_LABEL[r.region] || r.region}{r.own && data.store_id && <span style={{ fontSize: 10, color: "var(--ne-accent)", marginLeft: 6 }}>khaas</span>}</td>
                  {FIELDS.map(([f]) => (
                    <td key={f} style={cell}><input style={inp} type="number" min={0} step="0.01" value={r[f] ?? 0} readOnly={!edit} aria-label={`${r.region} ${f}`} onChange={(e) => set(i, f, e.target.value)} /></td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          )}
          {data && !data.merchant_city && data.store_id && <p style={{ margin: 0, fontSize: 11.5, color: "var(--ne-warning)" }}>Store ka pickup address nahi, is liye "Local" kisi parcel par nahi lagega. Courier Connect mein pickup address add karein.</p>}
        </div>
        {edit && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {data?.store_id && data?.has_own && <button onClick={reset} disabled={busy} style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-text)", fontWeight: 700, cursor: "pointer" }}>Default rates par wapas</button>}
            <button onClick={save} disabled={busy} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{busy ? "Save ho raha hai..." : "Save"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
