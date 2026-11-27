// Master Dashboard › NeX (eNeezam owner only): eNeezam's own DEX account that NeX books through, and the merchants' NeX KYC
// (approve / reject, CNIC pictures). Data: worker nex.js /nex/admin/*.
import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { nexApi, NEX_LOGO } from "../lib/nexApi";
import { NexTerms } from "./NexKyc";

const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: 18 };
const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box" };
const btn = (primary, danger) => ({ background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : danger ? "var(--ne-danger)" : "var(--ne-text)", border: primary ? "none" : `1px solid ${danger ? "var(--ne-danger)" : "var(--ne-border)"}`, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
const muted = { color: "var(--ne-muted)", fontSize: 12.5 };
const STATUS = { submitted: ["Check karein", "var(--ne-warning)"], approved: ["Approved", "var(--ne-success)"], rejected: ["Rejected", "var(--ne-danger)"] };
const day = (iso) => (iso ? new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function NexAdmin({ onExit }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [showTerms, setShowTerms] = useState(false);

  const load = useCallback(async () => {
    const d = await nexApi("admin/overview");
    if (d.error) { setMsg(d.error); return; }
    setData(d);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (path, body, okText) => {
    setBusy(true); setMsg("");
    const d = await nexApi(path, body);
    setBusy(false);
    setMsg(d.error || okText);
    if (!d.error) load();
    return !d.error;
  };
  const view = async (storeId, side) => {
    const w = window.open("", "_blank");
    const d = await nexApi("admin/kyc-file", { store_id: storeId, side });
    if (d.error) { w?.close(); setMsg(d.error); } else if (w) w.location.href = d.url;
  };

  const st = data?.settings;
  const list = (data?.kyc || []).filter((k) => !onlyOpen || k.status === "submitted");
  return (
    <div className="ne-app-shell ne-master" style={{ height: "100%", overflow: "auto" }}>
      <div style={{ padding: "20px 20px 50px", maxWidth: 1000, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}><img src={NEX_LOGO} alt="" width={34} height={34} style={{ borderRadius: 8 }} /><div><h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>NeX</h1><p style={{ ...muted, margin: "2px 0 0" }}>Neezam Express: eNeezam ka DEX account aur merchants ki KYC.</p></div></div>
          <button style={btn(false)} onClick={onExit}>Master Dashboard</button>
        </div>
        {msg && <div role="status" style={{ ...card, padding: 10, fontSize: 13 }}>{msg} {!data && <button style={btn(false)} onClick={() => { setMsg(""); load(); }}>Dobara koshish karein</button>}</div>}
        {!data && !msg && <div style={card}>Load ho raha hai...</div>}

        {data && (
          <div style={{ ...card, display: "grid", gap: 10 }}>
            <b>NeX ka DEX account</b>
            {st?.dex_seller_id ? (
              <>
                <div style={{ fontSize: 13, color: "var(--ne-success)", display: "flex", gap: 6, alignItems: "center" }}><Icon name="check" size={13} /> Connected · seller {st.dex_seller_id} · {day(st.connected_at)}</div>
                <p style={{ ...muted, margin: 0 }}>Jin stores ki NeX KYC approve hai aur NeX ON hai, un ki booking isi DEX account se hoti hai. COD isi account mein aati hai.</p>
                <div><button style={btn(false, true)} disabled={busy} onClick={() => window.confirm("NeX ka DEX account hata dein? Is ke baad NeX se booking band ho jayegi.") && run("admin/unbind", {}, "NeX ka DEX account hata diya.")}>Disconnect</button></div>
              </>
            ) : (
              <>
                <p style={{ ...muted, margin: 0 }}>eNeezam ke apne DEX seller portal (oms.dex.com.pk) se Integration Code lein aur yahan daal dein. NeX ki saari booking isi account se hogi.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input style={{ ...input, maxWidth: 320 }} placeholder="DEX Integration Code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
                  <button style={btn(true)} disabled={busy || !code.trim()} onClick={() => run("admin/bind", { integration_code: code.trim() }, "NeX ka DEX account connect ho gaya.").then((ok) => ok && setCode(""))}>Connect</button>
                </div>
              </>
            )}
            <div><button style={btn(false)} onClick={() => setShowTerms(!showTerms)}>{showTerms ? "Terms band karein" : `Merchant ki NeX terms dekhein (version ${st?.terms_version || ""})`}</button></div>
            {showTerms && <div style={{ border: "1px solid var(--ne-border)", borderRadius: 10, padding: 12, background: "var(--ne-surface)" }}><NexTerms /></div>}
          </div>
        )}

        {data && (
          <div style={{ ...card, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <b>Merchants ki KYC ({data.kyc.length})</b>
              <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Sirf jo check karni hain</label>
            </div>
            {list.length === 0 && <p style={{ ...muted, margin: 0 }}>Koi KYC nahi.</p>}
            {list.map((k) => (
              <div key={k.store_id} style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div><b>{k.brand_name}</b> <span style={muted}>· store: {k.stores?.store_name} · {k.category}</span></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS[k.status][1] }}>{STATUS[k.status][0]}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 4, fontSize: 12.5 }}>
                  <span>Contact: <b>{k.contact_name}</b></span><span>Mobile: <b>{k.mobile}</b></span><span>Email: <b>{k.email}</b></span>
                  <span>Address: <b>{k.address}{k.city ? `, ${k.city}` : ""}</b></span>
                  <span>Bank: <b>{k.bank_name}</b>{k.account_title ? ` (${k.account_title})` : ""}</span><span>Account: <b>{k.account_number}</b></span><span>IBAN: <b>{k.iban}</b></span>
                  <span style={muted}>Terms {k.terms_version} accept: {day(k.terms_accepted_at)}</span>
                </div>
                {k.review_note && <span style={{ ...muted, color: "var(--ne-danger)" }}>Note: {k.review_note}</span>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={btn(false)} onClick={() => view(k.store_id, "front")}><Icon name="eye" size={13} /> CNIC saamne</button>
                  <button style={btn(false)} onClick={() => view(k.store_id, "back")}><Icon name="eye" size={13} /> CNIC peeche</button>
                  {k.status !== "approved" && <button style={btn(true)} disabled={busy} onClick={() => window.confirm(`${k.brand_name} ki KYC approve karein? Is ke baad woh NeX se booking kar sakenge.`) && run("admin/kyc-review", { store_id: k.store_id, action: "approve" }, "Approve ho gayi.")}>Approve</button>}
                  {k.status !== "rejected" && <button style={btn(false, true)} disabled={busy} onClick={() => { const note = window.prompt("Wajah (merchant ko Courier Connect mein dikhegi):"); if (note?.trim()) run("admin/kyc-review", { store_id: k.store_id, action: "reject", note }, "Wapas bhej di."); }}>Reject</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
