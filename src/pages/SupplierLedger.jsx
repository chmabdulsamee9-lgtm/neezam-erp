import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const rupees = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

// ProfitLoss.jsx ke date-filter row ka exact wahi pattern (label keys + button set) —
// dashboard.dateFilter.* app-wide shared keys hain, page-specific nahi.
const DATE_FILTER_LABEL_KEYS = { today: "dashboard.dateFilter.today", yesterday: "dashboard.dateFilter.yesterday", "7days": "dashboard.dateFilter.7days", "30days": "dashboard.dateFilter.30days", custom: "dashboard.dateFilter.custom" };
const DATE_FILTERS = ["today", "yesterday", "7days", "30days", "custom"];

export default function SupplierLedger({ storeId, cfUrl = CF_URL }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [suppliers, setSuppliers] = useState([]);
  const [transactions, setTransactions] = useState({}); // { supplierId: [tx, ...] } — suppliers list ke balance cards ke liye, all-time
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", contact_phone: "", notes: "", is_dropship: false });
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState("");

  const [viewingSupplier, setViewingSupplier] = useState(null); // supplier row

  // Consolidated per-order ledger entries (/supplier-ledger-entries se) — pura,
  // unfiltered history fetch hota hai (dateFilter se independent), taake Running
  // Balance hamesha poori history ke against sahi rahe; date filter sirf DISPLAY ke
  // liye rows narrow karta hai, balance ko reset nahi karta.
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [dateFilter, setDateFilter] = useState("30days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null); // set = editing a manual entry, null = adding new
  const [entryForm, setEntryForm] = useState({ type: "debit", amount: "", transaction_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) fetchAll();
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return

    const channel = supabase
      .channel(`supplier-ledger-${storeId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'supplier_transactions',
        filter: `store_id=eq.${storeId}`
      }, () => {
        fetchAll()
        if (viewingSupplier) {
          loadLedgerEntries(viewingSupplier.id)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
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

  const loadLedgerEntries = async (supplierId) => {
    setLedgerLoading(true);
    setLedgerError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/supplier-ledger-entries?supplier_id=${encodeURIComponent(supplierId)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.error) { setLedgerError(data.error); setLedgerEntries([]); }
      else setLedgerEntries(data.entries || []);
    } catch (err) {
      setLedgerError(err.message);
    }
    setLedgerLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (viewingSupplier) loadLedgerEntries(viewingSupplier.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingSupplier]);

  // sync_all_dropship_debits() RPC (Worker se) — Delivered orders check karke naye
  // supplier debit entries banata hai. fetchAll() se poori transactions state refresh
  // hoti hai, isliye currently khuli hui supplier ledger (agar koi ho) bhi apne-aap
  // updated dikhti hai.
  const syncDropshipDebits = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/sync-dropship-debits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.error) {
        setSyncMessage(data.error);
      } else {
        setSyncMessage(`${data.orders_scanned ?? 0} ${t("ledger.syncOrdersScanned")} (${data.sku_combinations_checked ?? 0} ${t("ledger.syncSkuCombinationsChecked")}), ${data.new_entries ?? 0} ${t("ledger.syncNewEntries")}`);
        await fetchAll();
        if (viewingSupplier) await loadLedgerEntries(viewingSupplier.id);
      }
    } catch (err) {
      setSyncMessage(err.message);
    }
    setSyncing(false);
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
      is_dropship: supplierForm.is_dropship,
    });
    setSupplierSaving(false);
    if (error) { setSupplierError(error.message); return; }
    setShowAddSupplier(false);
    setSupplierForm({ name: "", contact_phone: "", notes: "", is_dropship: false });
    fetchAll();
  };

  // Naya entry hamesha direct insert (jaisa pehle tha). Edit sirf manual entries ke
  // liye hoti hai aur /supplier-transaction/:id PATCH se jaati hai — wahi endpoint
  // auto-generated (order-linked) entries ko edit hone se reject karta hai.
  const addEntry = async (e) => {
    e.preventDefault();
    setEntryError("");
    if (!entryForm.amount || Number(entryForm.amount) <= 0) { setEntryError(t("ledger.validAmountRequired")); return; }
    setEntrySaving(true);
    if (editingEntryId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${cfUrl}/supplier-transaction/${editingEntryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            type: entryForm.type, amount: Number(entryForm.amount),
            transaction_date: entryForm.transaction_date, notes: entryForm.notes.trim() || null,
          }),
        });
        const data = await res.json();
        if (data.error) { setEntrySaving(false); setEntryError(data.error); return; }
      } catch (err) {
        setEntrySaving(false);
        setEntryError(err.message);
        return;
      }
    } else {
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
      if (error) { setEntrySaving(false); setEntryError(error.message); return; }
    }
    setEntrySaving(false);
    setShowAddEntry(false);
    setEditingEntryId(null);
    setEntryForm({ type: "debit", amount: "", transaction_date: new Date().toISOString().slice(0, 10), notes: "" });
    await fetchAll();
    await loadLedgerEntries(viewingSupplier.id);
  };

  const openAddEntry = () => {
    setEditingEntryId(null);
    setEntryForm({ type: "debit", amount: "", transaction_date: new Date().toISOString().slice(0, 10), notes: "" });
    setEntryError("");
    setShowAddEntry(true);
  };

  const openEditEntry = (row) => {
    setEditingEntryId(row.id);
    setEntryForm({ type: row.type, amount: String(row.amount), transaction_date: row.date, notes: row.notes || "" });
    setEntryError("");
    setShowAddEntry(true);
  };

  const deleteEntry = async (id) => {
    if (!window.confirm(t("ledger.deleteConfirm"))) return;
    setDeletingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/supplier-transaction/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.error) {
        setEntryError(data.error);
      } else {
        await fetchAll();
        await loadLedgerEntries(viewingSupplier.id);
      }
    } catch (err) {
      setEntryError(err.message);
    }
    setDeletingId(null);
  };

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 10,
  };
  const dateBtnStyle = (type) => ({
    padding: "6px 14px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontWeight: 700, border: "1px solid",
    borderColor: dateFilter === type ? "transparent" : "var(--ne-border)",
    background: dateFilter === type ? "var(--ne-grad)" : "var(--ne-surface-2)",
    color: dateFilter === type ? "#fff" : "var(--ne-muted)",
  });

  // ---------- LEDGER VIEW (ek supplier khula ho) ----------

  // Running Balance hamesha POORI chronological history (oldest-first) ke against
  // compute hoti hai — date filter badalne se balance reset nahi honi chahiye, warna
  // ledger financially misleading ho jayegi.
  const entriesWithBalance = useMemo(() => {
    const chronological = [...ledgerEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    return chronological.reduce((acc, row) => {
      const prevRunning = acc.length > 0 ? acc[acc.length - 1].running : 0;
      const running = prevRunning + (row.type === "debit" ? Number(row.amount) : -Number(row.amount));
      acc.push({ ...row, running });
      return acc;
    }, []);
  }, [ledgerEntries]);

  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateFilter === "today") return { from: today, to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "yesterday") {
      const y = new Date(today.getTime() - 86400000);
      return { from: y, to: today };
    }
    if (dateFilter === "7days") return { from: new Date(today.getTime() - 7 * 86400000), to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "30days") return { from: new Date(today.getTime() - 30 * 86400000), to: new Date(today.getTime() + 86400000) };
    if (dateFilter === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(new Date(customTo).getTime() + 86400000) };
    }
    return { from: new Date(today.getTime() - 30 * 86400000), to: new Date(today.getTime() + 86400000) };
  };

  // Display ke liye date-range se narrow karte hain, phir latest-to-oldest sort —
  // har row apni already-computed (poori history wali) running balance carry karti hai.
  const displayedEntries = useMemo(() => {
    const { from, to } = getDateRange();
    return entriesWithBalance
      .filter((row) => { const d = new Date(row.date); return d >= from && d < to; })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesWithBalance, dateFilter, customFrom, customTo]);

  // Top SKUs — currently displayed (date-filtered) entries se, order-linked rows ke
  // items se — dashboard filter badalte hi client-side turant update hota hai, refetch
  // ki zaroorat nahi.
  const topSkus = useMemo(() => {
    const stats = {};
    displayedEntries.forEach((row) => {
      if (row.is_manual) return;
      (row.items || []).forEach((it) => {
        if (!it.sku) return;
        if (!stats[it.sku]) stats[it.sku] = { sku: it.sku, count: 0, total_amount: 0 };
        stats[it.sku].count += 1;
        stats[it.sku].total_amount += Number(it.amount) || 0;
      });
    });
    return Object.values(stats).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [displayedEntries]);

  // Currently-filtered (date-range-limited) entries ke Amount ka sum — total
  // transaction volume us period mein (debit + credit dono, Running Balance ke net
  // se alag), dashboard mein date filter ke saath prominently dikhane ke liye.
  const filteredTotalAmount = useMemo(() => displayedEntries.reduce((s, row) => s + (Number(row.amount) || 0), 0), [displayedEntries]);

  if (viewingSupplier) {
    const balance = balanceOf(viewingSupplier.id);
    const maxSkuCount = topSkus[0]?.count || 1;
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: balance > 0 ? "var(--ne-danger)" : "var(--ne-success)" }}>{rupees(Math.abs(balance))}</div>
              <div style={{ fontSize: 10, color: "var(--ne-muted)" }}>{balance > 0 ? t("ledger.payable") : balance < 0 ? t("ledger.advance") : t("ledger.clear")}</div>
            </div>
            <button onClick={syncDropshipDebits} disabled={syncing}
              style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: syncing ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: syncing ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="refresh" size={13} /> {syncing ? t("ledger.syncing") : t("ledger.syncButton")}
            </button>
            <button onClick={openAddEntry}
              style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {t("ledger.addEntry")}
            </button>
          </div>
        </div>
        {syncMessage && (
          <p style={{ margin: "-6px 0 12px", fontSize: 11.5, color: "var(--ne-muted)", textAlign: "right" }}>{syncMessage}</p>
        )}

        {/* ---------- Dashboard: date filter + total amount + Top SKUs ---------- */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem", marginBottom: "0.85rem" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: topSkus.length > 0 ? 14 : 0 }}>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              {DATE_FILTERS.map(f => (
                <button key={f} style={dateBtnStyle(f)} onClick={() => setDateFilter(f)}>{t(DATE_FILTER_LABEL_KEYS[f])}</button>
              ))}
              {dateFilter === "custom" && (
                <>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    style={{ padding: "6px 9px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
                </>
              )}
            </div>
            <div style={{ background: "var(--ne-accent-soft)", borderRadius: 10, padding: "8px 14px", textAlign: "right" }}>
              <div style={{ fontSize: 9.5, color: "var(--ne-accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px" }}>{t("ledger.totalAmountLabel")}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ne-accent)" }}>{rupees(filteredTotalAmount)}</div>
            </div>
          </div>
          {topSkus.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", fontWeight: 700, marginBottom: 8 }}>{t("ledger.topSkusTitle")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {topSkus.map((s, idx) => (
                  <div key={s.sku} style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "var(--ne-surface)" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${Math.round((s.count / maxSkuCount) * 100)}%`, background: "var(--ne-accent-soft)" }} />
                    <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", fontSize: 11.5 }}>
                      <span style={{ color: "var(--ne-text)", fontWeight: 600 }}>#{idx + 1} {s.sku}</span>
                      <span style={{ color: "var(--ne-muted)" }}>{s.count}x · {rupees(s.total_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          {ledgerLoading ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)", fontSize: 12 }}>{t("ledger.loading")}</div>
          ) : ledgerError ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-danger)", fontSize: 12 }}>{ledgerError}</div>
          ) : displayedEntries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("ledger.noEntries")}</div>
          ) : isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {displayedEntries.map((row, idx) => (
                <div key={row.is_manual ? row.id : row.order_id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, color: "var(--ne-muted)" }}>
                    <span>#{idx + 1} · {new Date(row.date).toLocaleDateString("en-PK")}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: row.type === "debit" ? "var(--ne-danger-soft)" : "var(--ne-success-soft)", color: row.type === "debit" ? "var(--ne-danger)" : "var(--ne-success)" }}>
                      {row.type === "debit" ? t("ledger.debitType") : t("ledger.paymentType")}
                    </span>
                  </div>
                  {!row.is_manual && <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginBottom: 4 }}>#{row.order_number || row.order_id}</div>}
                  {!row.is_manual && row.items.map((it, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: "var(--ne-text)", marginBottom: 2 }}>
                      {it.title}{it.variant_title ? ` — ${it.variant_title}` : ""} {it.sku ? <span style={{ color: "var(--ne-muted-2)", fontFamily: "monospace" }}>({it.sku})</span> : null}
                    </div>
                  ))}
                  {row.is_manual && row.notes && <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginBottom: 4 }}>{row.notes}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)" }}>{rupees(row.amount)}</span>
                    <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{t("ledger.balanceLabel")} {rupees(row.running)}</span>
                  </div>
                  {row.is_manual && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => openEditEntry(row)} style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 6, color: "var(--ne-text)", padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}><Icon name="edit" size={11} /></button>
                      <button onClick={() => deleteEntry(row.id)} disabled={deletingId === row.id} style={{ background: "var(--ne-danger-soft)", border: "none", borderRadius: 6, color: "var(--ne-danger)", padding: "4px 8px", cursor: deletingId === row.id ? "default" : "pointer", display: "flex", alignItems: "center" }}><Icon name="trash" size={11} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead>
                  <tr>
                    {["#", t("ledger.table.date"), t("ledger.table.order"), t("ledger.table.type"), t("ledger.table.amount"), t("ledger.table.notes"), t("ledger.table.product"), t("ledger.table.sku"), t("ledger.table.runningBalance"), ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedEntries.map((row, idx) => (
                    <tr key={row.is_manual ? row.id : row.order_id}>
                      <td style={{ padding: "7px 8px", color: "var(--ne-muted-2)", verticalAlign: "top" }}>{idx + 1}</td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", whiteSpace: "nowrap", verticalAlign: "top" }}>{new Date(row.date).toLocaleDateString("en-PK")}</td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-muted)", whiteSpace: "nowrap", verticalAlign: "top" }}>{row.is_manual ? "—" : `#${row.order_number || row.order_id}`}</td>
                      <td style={{ padding: "7px 8px", verticalAlign: "top" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap", background: row.type === "debit" ? "var(--ne-danger-soft)" : "var(--ne-success-soft)", color: row.type === "debit" ? "var(--ne-danger)" : "var(--ne-success)" }}>
                          {row.type === "debit" ? t("ledger.debitType") : t("ledger.paymentType")}
                        </span>
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" }}>{rupees(row.amount)}</td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-muted)", verticalAlign: "top" }}>{row.is_manual ? (row.notes || "—") : "—"}</td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", maxWidth: 260, whiteSpace: "normal", wordBreak: "break-word", verticalAlign: "top" }}>
                        {row.is_manual ? "—" : row.items.map((it, i) => (
                          <div key={i} style={{ marginBottom: i < row.items.length - 1 ? 4 : 0 }}>
                            {it.title || "—"}{it.variant_title ? ` — ${it.variant_title}` : ""}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-muted)", fontFamily: "monospace", verticalAlign: "top" }}>
                        {row.is_manual ? "—" : row.items.map((it, i) => (
                          <div key={i} style={{ marginBottom: i < row.items.length - 1 ? 4 : 0 }}>{it.sku || "—"}</div>
                        ))}
                      </td>
                      <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "top" }}>{rupees(row.running)}</td>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                        {row.is_manual && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => openEditEntry(row)} title={t("ledger.editEntry")}
                              style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 6, color: "var(--ne-text)", padding: "4px 7px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                              <Icon name="edit" size={11} />
                            </button>
                            <button onClick={() => deleteEntry(row.id)} disabled={deletingId === row.id} title={t("ledger.deleteEntry")}
                              style={{ background: "var(--ne-danger-soft)", border: "none", borderRadius: 6, color: "var(--ne-danger)", padding: "4px 7px", cursor: deletingId === row.id ? "default" : "pointer", display: "flex", alignItems: "center" }}>
                              <Icon name="trash" size={11} />
                            </button>
                          </div>
                        )}
                      </td>
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
                <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{editingEntryId ? t("ledger.editEntry") : t("ledger.addEntry")} — {viewingSupplier.name}</h2>
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
                    {entrySaving ? t("ledger.addingEntry") : (<><Icon name="check" size={13} /> {editingEntryId ? t("ledger.saveEntryButton") : t("ledger.addEntryButton")}</>)}
                  </button>
                  <button type="button" onClick={() => { setShowAddEntry(false); setEditingEntryId(null); }}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {syncMessage && <span style={{ fontSize: 11, color: "var(--ne-muted)" }}>{syncMessage}</span>}
          <button onClick={syncDropshipDebits} disabled={syncing}
            style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: syncing ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: syncing ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={13} /> {syncing ? t("ledger.syncing") : t("ledger.syncButton")}
          </button>
          <button onClick={() => { setSupplierForm({ name: "", contact_phone: "", notes: "", is_dropship: false }); setSupplierError(""); setShowAddSupplier(true); }}
            style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {t("ledger.addSupplier")}
          </button>
        </div>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ne-text)" }}>{s.name}</div>
                    {s.is_dropship && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "var(--ne-accent-soft)", color: "var(--ne-accent)" }}>
                        {t("ledger.dropshipBadge")}
                      </span>
                    )}
                  </div>
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
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ne-text)", cursor: "pointer", marginBottom: 10 }}>
                <input type="checkbox" checked={supplierForm.is_dropship} onChange={e => setSupplierForm(f => ({ ...f, is_dropship: e.target.checked }))} style={{ accentColor: "#5C7CFA" }} />
                {t("ledger.isDropshipLabel")}
              </label>

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
