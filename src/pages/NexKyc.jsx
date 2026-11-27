// NeX first-time setup: the merchant's KYC (contact, business, bank, CNIC) and the NeX terms. Worker nex.js /nex/kyc-submit.
import { useState } from "react";
import Icon from "../components/Icon";
import { nexApi, NEX_LOGO } from "../lib/nexApi";

const input = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13.5, boxSizing: "border-box", marginTop: 4 };
const btn = (primary) => ({ padding: "10px 16px", borderRadius: 10, border: primary ? "none" : "1px solid var(--ne-border)", background: primary ? "var(--ne-grad)" : "transparent", color: primary ? "#fff" : "var(--ne-text)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" });
const BAD = {
  email: "Sahi email likhein", mobile: "Mobile number aise: 03001234567", contact_name: "Contact person ka naam likhein", category: "Category chunein",
  brand_name: "Brand ka naam likhein", address: "Poora address likhein", bank_name: "Bank ka naam likhein", account_number: "Account number likhein", account_title: "Account title likhein (bank account par jo naam hai)",
  iban: "IBAN aise: PK36MEEZ0000000123456702 (24 harf)", cnic_front: "CNIC ki saamne wali tasveer lagayein", cnic_back: "CNIC ki peeche wali tasveer lagayein", terms: "Terms aur policy accept karein",
};

/** the NeX terms the merchant accepts (version terms_version from the worker) */
export function NexTerms() {
  const li = { margin: "0 0 6px" };
  return (
    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--ne-text)" }}>
      <li style={li}><b>eNeezam aggregator hai.</b> NeX (Neezam Express) ke zariye aap ke parcels hamare courier partners, jaise Daraz Express (DEX), TCS, Leopards, PostEx aur FastEx, se deliver hote hain. Booking, tracking aur hisaab eNeezam mein hota hai.</li>
      <li style={li}><b>COD ki raqam:</b> customer se li gayi COD courier pehle eNeezam ko deta hai. Courier ki payment jis cycle par aati hai, usi cycle ke hisaab se eNeezam aap ke diye gaye bank account mein transfer karega, courier aur NeX charges kaat kar.</li>
      <li style={li}><b>Charges:</b> har parcel par delivery, return aur failed-delivery charges NeX ke rate card ke mutabiq lagenge, jo Courier Connect mein dikhaye jayenge. Taxes qanoon ke mutabiq kaate jayenge.</li>
      <li style={li}><b>Sahi maloomat:</b> KYC mein di gayi maloomat (bank, CNIC, address) sahi honi chahiye. Payment sirf usi bank account mein jayegi. Account badalne ke liye support@eneezam.com par likhein.</li>
      <li style={li}><b>Mana cheezein:</b> qanoonan mana, khatarnak, nashe wali ya jaali (counterfeit) cheezein NeX se nahi bheji ja saktin. Aisi booking cancel aur account band ho sakta hai.</li>
      <li style={li}><b>Packing aur parcel ki zimmedari:</b> parcel ki sahi packing aur andar ki cheez merchant ki zimmedari hai. Courier ki taraf se gum ya kharab hone wale parcel ka claim courier ki policy ke mutabiq hoga.</li>
      <li style={li}><b>Returns aur jhagde:</b> return ya delivery ke kisi jhagde mein courier aur eNeezam ka record maana jayega. Kisi bhi ghalat ya dhoke wali booking ki raqam roki ja sakti hai.</li>
      <li style={li}><b>Tabdeeli:</b> eNeezam in terms ya rates mein tabdeeli kar sakta hai, jis ki itlaa pehle di jayegi. NeX ka istemal jari rakhna nayi terms qubool karna hai.</li>
    </ol>
  );
}

export default function NexKyc({ storeId, state, onClose, onDone }) {
  const [f, setF] = useState({ email: "", mobile: "", contact_name: "", category: "", brand_name: "", address: "", city: "", bank_name: "", account_title: "", account_number: "", iban: "" });
  const [files, setFiles] = useState({ front: null, back: null });
  const [accept, setAccept] = useState(false);
  const [bad, setBad] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBad(""); setError("");
    if (!accept) { setBad("terms"); return; }
    for (const side of ["front", "back"]) {
      const file = files[side];
      if (!file) { setBad(`cnic_${side}`); return; }
      if (file.size > 5 * 1024 * 1024) { setError("Har tasveer 5 MB se chhoti honi chahiye"); return; }
    }
    setBusy(true);
    const form = new FormData();
    form.append("store_id", storeId);
    Object.entries(f).forEach(([k, v]) => form.append(k, v));
    form.append("cnic_front", files.front);
    form.append("cnic_back", files.back);
    form.append("accept_terms", "true");
    form.append("terms_version", state.terms_version);
    const r = await nexApi("kyc-submit", form);
    setBusy(false);
    if (r.field) { setBad(r.field); return; }
    if (r.error) { setError(r.error); return; }
    onDone();
  };

  const field = (k, label, props = {}) => (
    <label style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>{label}
      <input style={{ ...input, borderColor: bad === k ? "var(--ne-danger)" : "var(--ne-border)" }} value={f[k]} onChange={set(k)} aria-invalid={bad === k} {...props} />
      {bad === k && <span role="alert" style={{ color: "var(--ne-danger)", fontSize: 12 }}>{BAD[k]}</span>}
    </label>
  );
  const photo = (side, label) => (
    <label style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>{label}
      <input style={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles({ ...files, [side]: e.target.files?.[0] || null })} />
      {bad === `cnic_${side}` && <span role="alert" style={{ color: "var(--ne-danger)", fontSize: 12 }}>{BAD[`cnic_${side}`]}</span>}
    </label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1000000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 12px" }}>
      <form onSubmit={submit} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 640, maxWidth: "100%", padding: 20, display: "grid", gap: 14, color: "var(--ne-text)", boxSizing: "border-box" }}>
        <style>{".nk-g{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:620px){.nk-g{grid-template-columns:1fr}}"}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src={NEX_LOGO} alt="" width={36} height={36} style={{ borderRadius: 9 }} /><div><b style={{ fontSize: 16 }}>NeX shuru karein</b><div style={{ fontSize: 12, color: "var(--ne-muted)" }}>Ek dafa ki KYC. eNeezam check karke NeX on kar dega.</div></div></div>
          <button type="button" aria-label="Band karein" onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--ne-muted)", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <b style={{ fontSize: 13 }}>Raabta</b>
        <div className="nk-g">
          {field("contact_name", "Contact person ka naam", { autoComplete: "name" })}
          {field("mobile", "Mobile number", { type: "tel", autoComplete: "tel", placeholder: "03001234567" })}
          {field("email", "Email", { type: "email", autoComplete: "email" })}
        </div>

        <b style={{ fontSize: 13 }}>Business</b>
        <div className="nk-g">
          {field("brand_name", "Brand ka naam")}
          <label style={{ fontSize: 12.5, color: "var(--ne-muted)" }}>Category
            <select style={{ ...input, borderColor: bad === "category" ? "var(--ne-danger)" : "var(--ne-border)" }} value={f.category} onChange={set("category")}>
              <option value="">Chunein</option>{state.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {bad === "category" && <span role="alert" style={{ color: "var(--ne-danger)", fontSize: 12 }}>{BAD.category}</span>}
          </label>
        </div>
        <div className="nk-g">
          {field("address", "Poora address (dukaan / godown)", { autoComplete: "street-address" })}
          {field("city", "Shehar", { autoComplete: "address-level2" })}
        </div>

        <b style={{ fontSize: 13 }}>Bank (COD ki payment yahan aayegi)</b>
        <div className="nk-g">
          {field("bank_name", "Bank ka naam", { placeholder: "Meezan Bank" })}
          {field("account_title", "Account title (bank account par naam)")}
          {field("account_number", "Account number", { inputMode: "numeric", autoComplete: "off" })}
          {field("iban", "IBAN", { autoComplete: "off", placeholder: "PK36MEEZ0000000123456702" })}
        </div>

        <b style={{ fontSize: 13 }}>CNIC</b>
        <div className="nk-g">{photo("front", "Saamne wali tasveer")}{photo("back", "Peeche wali tasveer")}</div>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Main ne <a href="/nex-terms" target="_blank" rel="noreferrer" style={{ color: "var(--ne-accent)", fontWeight: 700 }}>NeX terms aur policy</a> parh li hain aur qubool karta/karti hoon, aur upar di gayi maloomat sahi hai.</span>
        </label>
        {bad === "terms" && <span role="alert" style={{ color: "var(--ne-danger)", fontSize: 12 }}>{BAD.terms}</span>}
        {error && <div role="alert" style={{ color: "var(--ne-danger)", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={btn(false)} onClick={onClose}>Baad mein</button>
          <button type="submit" style={btn(true)} disabled={busy}>{busy ? "Bhej rahe hain..." : <><Icon name="check" size={13} /> KYC jama karein</>}</button>
        </div>
      </form>
    </div>
  );
}
