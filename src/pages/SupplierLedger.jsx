import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const rupees = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

export default function SupplierLedger({ storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [suppliers, setSuppliers] = useState([]);
  const [transactions, setTransactions] = useState({}); // { supplierId: [tx, ...] }
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", contact_phone: "", notes: "" });
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState("");

  const [viewingSupplier, setViewingSupplier] = useState(null); // supplier row

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({ type: "debit", amount: "", transaction_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryError, setEntryError] = useState("");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) fetchAll();
  }, [storeId]);

  const fetchAll = async () => {
    setLoading(true);
    const { data: supplierRows } = await supabase.from("suppliers").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    setSuppliers(supplierRows || []);
    const { data: txRows } = await supabase.from("supplier_transactions").select("*").eq("store_id", storeId).order("transaction_date", { ascending: true });
    const grouped = {};
    (txRows || []).forEach(tx => {
      if (!grouped[tx.supplier_id]) grouped[tx.supplier_id] = [];
      grouped[tx.supplier_id].push(tx);
    });
    setTransactions(grouped);
    setLoading(false);
  };

  const balanceOf = (supplierId) => {
    const txs = transactions[supplierId] || [];
    return txs.reduce((bal, tx) => bal + (tx.type === "debit" ? Number(tx.amount) : -Number(tx.amount)), 0);
  };

  const addSupplier = async (e) => {
    e.preventDefault();
    setSupplierError("");
    if (!supplierForm.name.trim()) { setSupplierError(t("ledger.nameRequired")); return; }
    setSupplierSaving(true);
    const { error } = await supabase.from("suppliers").insert({
      store_id: storeId,
      name: supplierForm.name.trim(),
      contact_phone: supplierForm.contact_phone.trim() || null,
      notes: supplierForm.notes.trim() || null,
    });
    setSupplierSaving(false);
    if (error) { setSupplierError(error.message); return; }
    setShowAddSupplier(false);
    setSupplierForm({ name: "", contact_phone: "", notes: "" });
    fetchAll();
  };

  const addEntry = async (e) => {
    e.preventDefault();
    setEntryError("");
    if (!entryForm.amount || Number(entryForm.amount) <= 0) { setEntryError(t("ledger.validAmountRequired")); return; }
    setEntrySaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("supplier_transactions").insert({
      supplier_id: viewingSupplier.id,
      store_id: storeId,
      type: entryForm.type,
      amount: Number(entryForm.amount),
      transaction_date: entryForm.transaction_date,
      notes: entryForm.notes.trim() || null,
      created_by: user?.id || null,
    });
    setEntrySaving(false);
    if (error) { setEntryError(error.message); return; }
    setShowAddEntry(false);
    setEntryForm({ type: "debit", amount: "", transaction_date: new Date().toISOString().slice(0, 10), notes: "" });
    fetchAll();
  };

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10,
  };

  // ---------- LEDGER VIEW (ek supplier khula ho) ----------
  const ledgerRows = useMemo(() => {
    if (!viewingSupplier) return [];
    const txs = [...(transactions[viewingSupplier.id] || [])].sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
    let running = 0;
    return txs.map(tx => {
      running += tx.type === "debit" ? Number(tx.amount) : -Number(tx.amount);
      return { ...tx, running };
    });
  }, [viewingSupplier, transactions]);

  if (viewingSupplier) {
    const balance = balanceOf(viewingSupplier.id);
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <button onClick={() => setViewingSupplier(null)}
          style={{ marginBottom: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-muted)", fontSize: 11, cursor: "pointer" }}>
          {t("ledger.backToSuppliers")}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{viewingSupplier.name}</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{viewingSupplier.contact_phone || t("common.noPhone")}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: balance > 0 ? "var(--ne-danger)" : "var(--ne-success)" }}>{rupees(Math.abs(balance))}</div>
              <div style={{ fontSize: 10, color: "var(--ne-muted)" }}>{balance > 0 ? t("ledger.payable") : balance < 0 ? t("ledger.advance") : t("ledger.clear")}</div>
            </div>
            <button onClick={() => { setEntryForm({ type: "debit", amount: "", transaction_date: new Date().toISOString().slice(0, 10), notes: "" }); setEntryError(""); setShowAddEntry(true); }}
              style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {t("ledger.addEntry")}
            </button>
          </div>
        </div>

        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          {ledgerRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("ledger.noEntries")}</div>
          ) : isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ledgerRows.map(row => (
                <div key={row.id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{new Date(row.transaction_date).toLocaleDateString("en-PK")}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: row.type === "debit" ? "var(--ne-danger-soft)" : "var(--ne-success-soft)", color: row.type === "debit" ? "var(--ne-danger)" : "var(--ne-success)" }}>
                      {row.type === "debit" ? t("ledger.debitType") : t("ledger.paymentType")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)" }}>{rupees(row.amount)}</span>
                    <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{t("ledger.balanceLabel")} {rupees(row.running)}</span>
                  </div>
                  {row.notes && <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginTop: 4 }}>{row.notes}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead>
                  <tr>
                    {[t("ledger.table.date"), t("ledger.table.type"), t("ledger.table.amount"), t("ledger.table.notes"), t("ledger.table.runningBalance")].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)" }}>{new Date(row.transaction_date).toLocaleDateString("en-PK")}</td>
                      <td style={{ padding: "7px 8px" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: row.type === "debit" ? "var(--ne-danger-soft)" : "var(--ne-success-soft)", color: row.type === "debit" ? "var(--ne-danger)" : "var(--ne-success)" }}>
                          {row.type === "debit" ? t("ledger.debitType") : t("ledger.paymentType")}
                        </span>
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 600 }}>{rupees(row.amount)}</td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-muted)" }}>{row.notes || "—"}</td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 700 }}>{rupees(row.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showAddEntry && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
            <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
                <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("ledger.addEntry")} — {viewingSupplier.name}</h2>
              </div>
              <form onSubmit={addEntry} style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ne-text)", cursor: "pointer" }}>
                    <input type="radio" checked={entryForm.type === "debit"} onChange={() => setEntryForm(f => ({ ...f, type: "debit" }))} />
                    {t("ledger.debitRadio")}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ne-text)", cursor: "pointer" }}>
                    <input type="radio" checked={entryForm.type === "credit"} onChange={() => setEntryForm(f => ({ ...f, type: "credit" }))} />
                    {t("ledger.creditRadio")}
                  </label>
                </div>
                <input type="number" placeholder={t("ledger.amountPlaceholder")} value={entryForm.amount} step="0.01"
                  onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} />
                <input type="date" value={entryForm.transaction_date}
                  onChange={e => setEntryForm(f => ({ ...f, transaction_date: e.target.value }))} style={inputStyle} />
                <textarea placeholder={t("ledger.notesPlaceholder")} rows={2} value={entryForm.notes}
                  onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

                {entryError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{entryError}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" disabled={entrySaving}
                    style={{ flex: 1, padding: "10px", background: entrySaving ? "var(--ne-border)" : "var(--ne-success)", color: entrySaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: entrySaving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {entrySaving ? t("ledger.addingEntry") : (<><Icon name="check" size={13} /> {t("ledger.addEntryButton")}</>)}
                  </button>
                  <button type="button" onClick={() => setShowAddEntry(false)}
                    style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                    {t("ledger.cancel")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- SUPPLIERS LIST ----------
  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="clipboard" size={17} /> {t("ledger.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{suppliers.length} {t("ledger.suppliersSuffix")}</p>
        </div>
        <button onClick={() => { setSupplierForm({ name: "", contact_phone: "", notes: "" }); setSupplierError(""); setShowAddSupplier(true); }}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {t("ledger.addSupplier")}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--ne-muted)" }}>{t("ledger.loading")}</div>
      ) : suppliers.length === 0 ? (
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)", fontSize: 13 }}>
          {t("ledger.noSuppliers")}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {suppliers.map(s => {
            const balance = balanceOf(s.id);
            return (
              <div key={s.id} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ne-text)" }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ne-muted-2)" }}>{s.contact_phone || t("common.noPhone")}</div>
                </div>
                <div style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{balance > 0 ? t("ledger.payable") : balance < 0 ? t("ledger.advance") : t("ledger.balance")}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: balance > 0 ? "var(--ne-danger)" : balance < 0 ? "var(--ne-success)" : "var(--ne-muted)" }}>{rupees(Math.abs(balance))}</span>
                </div>
                <button onClick={() => setViewingSupplier(s)}
                  style={{ padding: "9px", borderRadius: 10, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {t("ledger.viewLedger")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAddSupplier && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("ledger.addSupplier")}</h2>
            </div>
            <form onSubmit={addSupplier} style={{ padding: "16px 18px" }}>
              <input type="text" placeholder={t("ledger.namePlaceholder")} value={supplierForm.name}
                onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              <input type="tel" placeholder={t("ledger.phonePlaceholder")} value={supplierForm.contact_phone}
                onChange={e => setSupplierForm(f => ({ ...f, contact_phone: e.target.value }))} style={inputStyle} />
              <textarea placeholder={t("ledger.notesPlaceholder")} rows={2} value={supplierForm.notes}
                onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

              {supplierError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{supplierError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={supplierSaving}
                  style={{ flex: 1, padding: "10px", background: supplierSaving ? "var(--ne-border)" : "var(--ne-success)", color: supplierSaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: supplierSaving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {supplierSaving ? t("ledger.addingSupplier") : (<><Icon name="check" size={13} /> {t("ledger.addSupplierButton")}</>)}
                </button>
                <button type="button" onClick={() => setShowAddSupplier(false)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("ledger.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
