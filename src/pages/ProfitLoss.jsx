import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";

const DATE_FILTERS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "Custom", value: "custom" },
];

const EXPENSE_CATEGORIES = [
  { value: "ad_spend", label: "Ad Spend" },
  { value: "courier", label: "Courier" },
  { value: "packaging", label: "Packaging" },
  { value: "salary", label: "Salary" },
  { value: "misc", label: "Misc" },
];

const rupees = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

export default function ProfitLoss({ ordersData, storeId }) {
  const [dateFilter, setDateFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [expenses, setExpenses] = useState([]);
  const [productCosts, setProductCosts] = useState({}); // { sku: cost_price }
  const [loading, setLoading] = useState(true);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: "ad_spend", amount: "", expense_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState("");

  const [editingCostSku, setEditingCostSku] = useState(null);
  const [editingCostValue, setEditingCostValue] = useState("");

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
    const [{ data: expenseRows }, { data: costRows }] = await Promise.all([
      supabase.from("expenses").select("*").eq("store_id", storeId).order("expense_date", { ascending: false }),
      supabase.from("product_costs").select("*").eq("store_id", storeId),
    ]);
    setExpenses(expenseRows || []);
    const costMap = {};
    (costRows || []).forEach(r => { costMap[r.sku] = Number(r.cost_price); });
    setProductCosts(costMap);
    setLoading(false);
  };

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
    return { from: today, to: new Date(today.getTime() + 86400000) };
  };

  // Revenue/COGS sirf Approved orders se — warna P&L number galat lagega
  const approvedOrders = useMemo(() => {
    if (!ordersData?.length) return [];
    const { from, to } = getDateRange();
    return ordersData.filter(o => {
      const d = new Date(o.created_at);
      return d >= from && d < to && o.agent_status === "Approved";
    });
  }, [ordersData, dateFilter, customFrom, customTo]);

  const revenue = approvedOrders.reduce((s, o) => s + Number(o.total_price || 0), 0);

  const perSkuStats = useMemo(() => {
    const map = {};
    approvedOrders.forEach(o => {
      const seenInOrder = new Set();
      (o.line_items || []).forEach(li => {
        const sku = (li.sku || "").trim() || "(no SKU)";
        const qty = Number(li.quantity || 1);
        const lineRevenue = Number(li.price || 0) * qty;
        if (!map[sku]) map[sku] = { sku, orders: 0, qty: 0, revenue: 0 };
        if (!seenInOrder.has(sku)) { map[sku].orders += 1; seenInOrder.add(sku); }
        map[sku].qty += qty;
        map[sku].revenue += lineRevenue;
      });
    });
    return Object.values(map).map(row => {
      const costPer = productCosts[row.sku];
      const cost = costPer != null ? costPer * row.qty : null;
      const profit = cost != null ? row.revenue - cost : null;
      return { ...row, costPer, cost, profit };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [approvedOrders, productCosts]);

  const totalCOGS = perSkuStats.reduce((s, row) => s + (row.cost || 0), 0);

  const filteredExpenses = useMemo(() => {
    const { from, to } = getDateRange();
    return expenses.filter(e => {
      const d = new Date(e.expense_date + "T00:00:00");
      return d >= from && d < to;
    });
  }, [expenses, dateFilter, customFrom, customTo]);

  const sumByCategory = (cats) => filteredExpenses.filter(e => cats.includes(e.category)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const adSpend = sumByCategory(["ad_spend"]);
  const courier = sumByCategory(["courier"]);
  const packaging = sumByCategory(["packaging"]);
  const otherExpenses = sumByCategory(["salary", "misc"]);

  const netProfit = revenue - totalCOGS - adSpend - courier - otherExpenses;

  const dateFilterLabel = DATE_FILTERS.find(f => f.value === dateFilter)?.label || "Today";

  const heroChips = [
    { label: "Revenue", value: rupees(revenue) },
    { label: "Total COGS", value: rupees(totalCOGS) },
    { label: "Ad Spend", value: rupees(adSpend) },
    { label: "Courier", value: rupees(courier) },
    { label: "Other Expenses", value: rupees(otherExpenses) },
  ];

  const breakdownCards = [
    { label: "Revenue", value: revenue, color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
    { label: "COGS", value: totalCOGS, color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
    { label: "Ad Spend", value: adSpend, color: "var(--ne-accent)", bg: "var(--ne-accent-soft)" },
    { label: "Courier", value: courier, color: "var(--ne-warning)", bg: "var(--ne-warning-soft)" },
    { label: "Packaging", value: packaging, color: "var(--ne-pink)", bg: "var(--ne-pink-soft)" },
    { label: "Misc (Salary + Other)", value: otherExpenses, color: "var(--ne-orange)", bg: "var(--ne-orange-soft)" },
  ];

  const addExpense = async (e) => {
    e.preventDefault();
    setExpenseError("");
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      setExpenseError("Valid amount daalo");
      return;
    }
    setExpenseSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("expenses").insert({
      store_id: storeId,
      category: expenseForm.category,
      amount: Number(expenseForm.amount),
      expense_date: expenseForm.expense_date,
      notes: expenseForm.notes.trim() || null,
      created_by: user?.id || null,
    });
    setExpenseSaving(false);
    if (error) { setExpenseError(error.message); return; }
    setShowExpenseModal(false);
    setExpenseForm({ category: "ad_spend", amount: "", expense_date: new Date().toISOString().slice(0, 10), notes: "" });
    fetchAll();
  };

  const openSetCost = (sku, currentCost) => {
    setEditingCostSku(sku);
    setEditingCostValue(currentCost != null ? String(currentCost) : "");
  };

  const saveCost = async (sku) => {
    if (!editingCostValue || Number(editingCostValue) < 0) return;
    await supabase.from("product_costs").upsert({
      store_id: storeId,
      sku,
      cost_price: Number(editingCostValue),
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,sku" });
    setProductCosts(prev => ({ ...prev, [sku]: Number(editingCostValue) }));
    setEditingCostSku(null);
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

  const CostCell = ({ row }) => {
    if (editingCostSku === row.sku) {
      return (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="number" autoFocus value={editingCostValue} onChange={e => setEditingCostValue(e.target.value)}
            style={{ width: 70, padding: "3px 6px", borderRadius: 5, border: "1px solid var(--ne-accent)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11 }} />
          <button onClick={() => saveCost(row.sku)}
            style={{ background: "var(--ne-grad)", border: "none", borderRadius: 5, color: "#fff", padding: "3px 8px", cursor: "pointer", fontSize: 10 }}>✓</button>
          <button onClick={() => setEditingCostSku(null)}
            style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 5, color: "var(--ne-text)", padding: "3px 8px", cursor: "pointer", fontSize: 10 }}>✕</button>
        </div>
      );
    }
    if (row.costPer == null) {
      return (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "var(--ne-muted-2)", fontSize: 11 }}>Cost not set</span>
          <button onClick={() => openSetCost(row.sku, null)}
            style={{ background: "var(--ne-accent-soft)", border: "none", borderRadius: 6, color: "var(--ne-accent)", padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
            Set Cost
          </button>
        </div>
      );
    }
    return (
      <span onClick={() => openSetCost(row.sku, row.costPer)} style={{ cursor: "pointer", fontSize: 11.5, color: "var(--ne-text)" }} title="Edit cost">
        {rupees(row.cost)}
      </span>
    );
  };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>💹 Profit & Loss</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>Approved orders ke basis pe</p>
        </div>
        <button onClick={() => setShowExpenseModal(true)}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          + Add Expense
        </button>
      </div>

      {/* Date Filter */}
      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {DATE_FILTERS.map(f => (
          <button key={f.value} style={dateBtnStyle(f.value)} onClick={() => setDateFilter(f.value)}>{f.label}</button>
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

      {/* Hero Net Profit Card */}
      <div style={{ background: "var(--ne-grad)", borderRadius: 18, padding: "1.4rem", marginBottom: "0.75rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontWeight: 600, marginBottom: 4 }}>
            {dateFilterLabel} — net profit
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#fff" }}>
            {rupees(netProfit)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {heroChips.map(chip => (
            <div key={chip.label} style={{ background: "rgba(255,255,255,.16)", borderRadius: 10, padding: "8px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{chip.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", fontWeight: 600, whiteSpace: "nowrap" }}>{chip.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Breakdown Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem", marginBottom: "1rem" }}>
        {breakdownCards.map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "0.8rem" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.color, marginBottom: 2 }}>{rupees(c.value)}</div>
            <div style={{ fontSize: 10, color: c.color, fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Per-SKU Profitability */}
      <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>🏷️ Per-SKU Profitability</h2>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)" }}>Loading...</div>
        ) : perSkuStats.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted-2)", fontSize: 12 }}>Is date range mein koi approved order nahi mila.</div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {perSkuStats.map(row => (
              <div key={row.sku} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ne-text)", marginBottom: 4 }}>{row.sku}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ne-muted)", marginBottom: 2 }}>
                  <span>Orders: {row.orders}</span><span>Revenue: {rupees(row.revenue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "var(--ne-muted)" }}>Cost: <CostCell row={row} /></span>
                  <span style={{ color: row.profit == null ? "var(--ne-muted-2)" : row.profit >= 0 ? "var(--ne-success)" : "var(--ne-danger)", fontWeight: 700 }}>
                    {row.profit == null ? "—" : rupees(row.profit)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  {["SKU", "Orders", "Revenue", "Cost", "Profit"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--ne-muted)", borderBottom: "1px solid var(--ne-border)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perSkuStats.map(row => (
                  <tr key={row.sku}>
                    <td style={{ padding: "7px 8px", color: "var(--ne-text)", fontWeight: 600 }}>{row.sku}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-muted)" }}>{row.orders}</td>
                    <td style={{ padding: "7px 8px", color: "var(--ne-text)" }}>{rupees(row.revenue)}</td>
                    <td style={{ padding: "7px 8px" }}><CostCell row={row} /></td>
                    <td style={{ padding: "7px 8px", fontWeight: 700, color: row.profit == null ? "var(--ne-muted-2)" : row.profit >= 0 ? "var(--ne-success)" : "var(--ne-danger)" }}>
                      {row.profit == null ? "—" : rupees(row.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>+ Add Expense</h2>
            </div>
            <form onSubmit={addExpense} style={{ padding: "16px 18px" }}>
              <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input type="number" placeholder="Amount (Rs.)" value={expenseForm.amount} step="0.01"
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} />
              <input type="date" value={expenseForm.expense_date}
                onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))} style={inputStyle} />
              <textarea placeholder="Notes (optional)" rows={2} value={expenseForm.notes}
                onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

              {expenseError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{expenseError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={expenseSaving}
                  style={{ flex: 1, padding: "10px", background: expenseSaving ? "var(--ne-border)" : "var(--ne-success)", color: expenseSaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: expenseSaving ? "default" : "pointer" }}>
                  {expenseSaving ? "Add ho raha hai..." : "✓ Add Expense"}
                </button>
                <button type="button" onClick={() => setShowExpenseModal(false)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
