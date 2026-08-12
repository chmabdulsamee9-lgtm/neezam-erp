import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { useLanguage, useTranslation } from "../i18n";

const DATE_FILTER_LABEL_KEYS = { today: "dashboard.dateFilter.today", yesterday: "dashboard.dateFilter.yesterday", "7days": "dashboard.dateFilter.7days", "30days": "dashboard.dateFilter.30days", custom: "dashboard.dateFilter.custom" };
const DATE_FILTERS = ["today", "yesterday", "7days", "30days", "custom"];

const EXPENSE_CATEGORIES = [
  { value: "ad_spend", labelKey: "pnl.expenseCategory.ad_spend" },
  { value: "courier", labelKey: "pnl.expenseCategory.courier" },
  { value: "packaging", labelKey: "pnl.expenseCategory.packaging" },
  { value: "return_damage", labelKey: "pnl.expenseCategory.return_damage" },
  { value: "salary", labelKey: "pnl.expenseCategory.salary" },
  { value: "misc", labelKey: "pnl.expenseCategory.misc" },
];

const rupees = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

// Local-calendar-date string (not UTC) — same convention as ProductCosting.jsx's
// toDateStr/effective_from handling, so "today" and order-date comparisons agree
// across both pages of the rate-history system.
const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};

export default function ProfitLoss({ ordersData, storeId }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [dateFilter, setDateFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [expenses, setExpenses] = useState([]);
  // productCostRows: ALL product_costs rows (every SKU, every effective_from version) —
  // NOT collapsed to "latest per SKU", since COGS now needs to resolve the rate that was
  // effective as of each individual order's booked date, not just today's rate.
  const [productCostRows, setProductCostRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [variantSkuRows, setVariantSkuRows] = useState([]); // lightweight products_cache projection (raw_data->variants only) for the live-SKU lookup, Orders.jsx/BookedOrders.jsx jaisa hi

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: "ad_spend", amount: "", expense_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState("");

  const [editingCostSku, setEditingCostSku] = useState(null);
  const [editingCostValue, setEditingCostValue] = useState("");
  const [costDateMode, setCostDateMode] = useState("immediate"); // 'immediate' | 'scheduled'
  const [costDateValue, setCostDateValue] = useState("");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) fetchAll();
  }, [storeId]);

  // Live SKU lookup (Orders.jsx/BookedOrders.jsx jaisa hi) — "raw_data->variants" sirf,
  // taake per-SKU stats mein product page pe baad mein badla hua SKU bhi live reflect ho.
  useEffect(() => {
    if (!storeId) return;
    supabase.from("products_cache").select("shopify_product_id, raw_data->variants").eq("store_id", storeId)
      .then(({ data, error }) => { if (!error) setVariantSkuRows(data || []); });
  }, [storeId]);

  const variantSkuMap = useMemo(() => {
    const map = new Map();
    variantSkuRows.forEach((row) => {
      (row.variants || []).forEach((v) => {
        if (v?.id != null) map.set(String(v.id), v.sku || "");
      });
    });
    return map;
  }, [variantSkuRows]);

  // Override items "Default Title" ke liye "" store karte hain, raw Shopify line_items
  // literal "Default Title" — dono ko ek hi canonical form pe laate hain taake
  // product_id::variant_title key dono taraf match kare.
  const normVariantTitle = (vt) => (vt && vt !== "Default Title" ? vt : "Default Title");

  // Fallback map jab variant_id se lookup fail ho jaye (variant delete karke usi naam
  // se dobara banaya gaya — naya variant_id, lekin product_id + title same rehte hain).
  const productVariantSkuMap = useMemo(() => {
    const map = new Map();
    variantSkuRows.forEach((row) => {
      if (row.shopify_product_id == null) return;
      (row.variants || []).forEach((v) => {
        map.set(`${row.shopify_product_id}::${normVariantTitle(v?.title)}`, v?.sku || "");
      });
    });
    return map;
  }, [variantSkuRows]);

  // Priority: line item ka apna stored sku (order ke purchase-time ka frozen record —
  // Shopify variant_id ko baad mein kisi bilkul different variant ke liye REUSE kar
  // sakta hai, is liye "live" lookup order ke asal SKU se unrelated cheez wapas de
  // sakta hai; raw sku hamesha sahi hota hai jab tak khaali na ho) -> variant_id se
  // fresh products_cache lookup (sirf jab raw sku khaali ho) -> product_id +
  // variant_title se lookup.
  const liveSkuForLineItem = useCallback((li) => {
    const rawSku = (li?.sku || "").trim();
    if (rawSku) return rawSku;
    const key = li?.variant_id != null ? String(li.variant_id) : null;
    if (key && variantSkuMap.has(key)) return variantSkuMap.get(key);
    const productId = li?.product_id ?? li?.shopify_product_id;
    if (productId != null) {
      const pvKey = `${productId}::${normVariantTitle(li?.variant_title)}`;
      if (productVariantSkuMap.has(pvKey)) return productVariantSkuMap.get(pvKey);
    }
    return "";
  }, [variantSkuMap, productVariantSkuMap]);

  // Koi bhi lookup SKU resolve na kar paye to "(no SKU)" ke ek hi shared bucket mein
  // sab kuch lump karne ke bajaye product ka apna title + variant ko grouping key
  // banate hain — alag products ka revenue/cost ab ek hi row mein mix nahi hoga.
  const displaySkuForLineItem = useCallback((li) => {
    const sku = (liveSkuForLineItem(li) || "").trim();
    if (sku) return sku;
    const variantTitle = li?.variant_title && li.variant_title !== "Default Title" ? li.variant_title : "";
    return [li?.title || "", variantTitle].filter(Boolean).join(" - ") || "(no SKU)";
  }, [liveSkuForLineItem]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: expenseRows }, { data: costRows }] = await Promise.all([
      supabase.from("expenses").select("*").eq("store_id", storeId).order("expense_date", { ascending: false }),
      supabase.from("product_costs").select("*").eq("store_id", storeId),
    ]);
    setExpenses(expenseRows || []);
    setProductCostRows(costRows || []);
    setLoading(false);
  };

  // Har SKU ke saare versions, effective_from descending sorted (null = "hamesha se
  // effective", ProductCosting.jsx wala hi defensive fallback — isliye sabse purana/last
  // treat hota hai, sirf tab select hota hai jab koi dated row bhi qualify na kare).
  const costVersionsBySku = useMemo(() => {
    const map = {};
    productCostRows.forEach((r) => {
      if (!map[r.sku]) map[r.sku] = [];
      map[r.sku].push(r);
    });
    Object.values(map).forEach((rows) => rows.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01")));
    return map;
  }, [productCostRows]);

  // Us SKU ki rate jo `dateStr` (order ke booked-date) tak effective thi — ProductCosting.jsx
  // ke get_product_cost_as_of()-equivalent client-side resolution, sirf "aaj" ki jagah
  // arbitrary date ke against.
  const resolveCostAsOf = useCallback((sku, dateStr) => {
    const versions = costVersionsBySku[sku];
    if (!versions) return null;
    const hit = versions.find((r) => (r.effective_from || "0000-01-01") <= dateStr);
    return hit ? Number(hit.cost_price) : null;
  }, [costVersionsBySku]);

  // Order ka "booked" date — package_created_at (courier ke saath book hone ki date,
  // order_statuses trigger wala hi field) — lekin "Approved" bucket ke bohot se orders
  // abhi tak courier se booked hi nahi hote, is liye package_created_at na ho to order ke
  // apne created_at (Shopify order date) pe fallback karte hain, taake un orders ka COGS
  // bhi resolve ho sake (na ke hamesha "aaj" ki rate lag jaye, jo is poore feature ka
  // maqsad hi khatam kar degi).
  const orderDateStr = (o) => {
    const raw = o.agent_data?.package_created_at || o.created_at;
    return raw ? toDateStr(new Date(raw)) : null;
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
      const itemsOverride = o.agent_data?.line_items_override;
      const usingOverride = itemsOverride?.length > 0;
      const items = usingOverride ? itemsOverride : (o.line_items || []);
      const orderDate = orderDateStr(o);
      const seenInOrder = new Set();
      items.forEach(li => {
        // Priority: override item's own sku (staff ne manually chosen tha, isse trust
        // karo) -> live products_cache lookup by variant_id -> product_id+variant_title
        // lookup -> raw line_items sku -> title+variant display -> "(no SKU)".
        const overrideSku = usingOverride ? (li.sku || "").trim() : "";
        const sku = overrideSku || displaySkuForLineItem(li);
        const qty = Number(li.quantity || 1);
        const lineRevenue = Number(li.price || 0) * qty;
        if (!map[sku]) map[sku] = { sku, orders: 0, qty: 0, revenue: 0, cost: 0, costedQty: 0, hasMissingRate: false };
        if (!seenInOrder.has(sku)) { map[sku].orders += 1; seenInOrder.add(sku); }
        map[sku].qty += qty;
        map[sku].revenue += lineRevenue;
        // Is order ke apne booked-date (ya created_at fallback) ke hisaab se us waqt
        // effective rate — total qty pe ek hi "aaj" wali rate multiply karne ke bajaye,
        // taake purane orders ka profit rate change hone pe retroactively na badle.
        const rate = orderDate != null ? resolveCostAsOf(sku, orderDate) : null;
        if (rate != null) {
          map[sku].cost += rate * qty;
          map[sku].costedQty += qty;
        } else {
          map[sku].hasMissingRate = true;
        }
      });
    });
    return Object.values(map).map(row => {
      const cost = row.costedQty > 0 ? row.cost : null;
      const costPer = cost != null ? cost / row.costedQty : null;
      const profit = cost != null ? row.revenue - cost : null;
      // Sirf tab flag karo jab COST PARTIALLY resolve hua ho (kuch line items costed,
      // kuch nahi) — agar koi bhi rate resolve nahi hui (cost === null), woh "Cost Not
      // Set" wali existing UI se already saaf zahir hai, dobara warning ki zaroorat nahi.
      const hasIncompleteCost = cost != null && row.hasMissingRate;
      return { sku: row.sku, orders: row.orders, qty: row.qty, revenue: row.revenue, costPer, cost, profit, hasIncompleteCost };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [approvedOrders, resolveCostAsOf, displaySkuForLineItem]);

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
  const returnDamageLoss = sumByCategory(["return_damage"]);
  const otherExpenses = sumByCategory(["salary", "misc"]);

  const netProfit = revenue - totalCOGS - adSpend - courier - packaging - returnDamageLoss - otherExpenses;

  const dateFilterLabel = t(DATE_FILTER_LABEL_KEYS[dateFilter] || "dashboard.dateFilter.today");

  const heroChips = [
    { label: t("pnl.chip.revenue"), value: rupees(revenue) },
    { label: t("pnl.chip.totalCogs"), value: rupees(totalCOGS) },
    { label: t("pnl.chip.adSpend"), value: rupees(adSpend) },
    { label: t("pnl.chip.courier"), value: rupees(courier) },
    { label: t("pnl.chip.otherExpenses"), value: rupees(otherExpenses) },
  ];

  const breakdownCards = [
    { label: t("pnl.breakdown.revenue"), value: revenue, color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
    { label: t("pnl.breakdown.cogs"), value: totalCOGS, color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
    { label: t("pnl.breakdown.adSpend"), value: adSpend, color: "var(--ne-accent)", bg: "var(--ne-accent-soft)" },
    { label: t("pnl.breakdown.courier"), value: courier, color: "var(--ne-warning)", bg: "var(--ne-warning-soft)" },
    { label: t("pnl.breakdown.packaging"), value: packaging, color: "var(--ne-pink)", bg: "var(--ne-pink-soft)" },
    { label: t("pnl.breakdown.returnDamage"), value: returnDamageLoss, color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
    { label: t("pnl.breakdown.misc"), value: otherExpenses, color: "var(--ne-orange)", bg: "var(--ne-orange-soft)" },
  ];

  const addExpense = async (e) => {
    e.preventDefault();
    setExpenseError("");
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      setExpenseError(t("pnl.validAmountRequired"));
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
    setCostDateMode("immediate");
    setCostDateValue(addDays(toDateStr(new Date()), 1));
  };

  // Quick "Set Cost" shortcut — product_costs versioned hai ab, isliye yeh ek versioned
  // row likhta hai (Apply Immediately = aaj, Apply From Date = chuni hui future date) —
  // agar us exact date pe row already hai to in-place update, warna naya row, taake purane
  // orders ka profit retroactively na badle. Naya row banate waqt SKU ke sabse recent
  // pehle wale row ka return_value/supplier_id carry-forward hota hai (ProductCosting.jsx
  // ke applyCostVersion() jaisa hi) — sirf cost_price set karne se yeh dono fields ab
  // khaali nahi hote.
  const saveCost = async (sku) => {
    if (!editingCostValue || Number(editingCostValue) < 0) return;
    const value = Number(editingCostValue);
    const todayStr = toDateStr(new Date());
    const effectiveFromStr = costDateMode === "scheduled" ? costDateValue : todayStr;
    if (costDateMode === "scheduled" && !effectiveFromStr) return;
    const now = new Date().toISOString();
    const versions = costVersionsBySku[sku] || []; // effective_from descending sorted
    const existing = versions.find((r) => (r.effective_from || "0000-01-01") === effectiveFromStr);
    let savedRow;
    if (existing) {
      const { data, error } = await supabase.from("product_costs")
        .update({ cost_price: value, updated_at: now }).eq("id", existing.id).select().single();
      if (error) return;
      savedRow = data;
    } else {
      const mostRecentPrior = versions[0];
      const { data, error } = await supabase.from("product_costs")
        .upsert({
          store_id: storeId, sku, cost_price: value, effective_from: effectiveFromStr,
          return_value: mostRecentPrior?.return_value ?? null, supplier_id: mostRecentPrior?.supplier_id ?? null,
          updated_at: now,
        }, { onConflict: "store_id,sku,effective_from" })
        .select().single();
      if (error) return;
      savedRow = data;
    }
    setProductCostRows((prev) => {
      const idx = prev.findIndex((r) => r.id === savedRow.id);
      if (idx === -1) return [...prev, savedRow];
      const next = [...prev];
      next[idx] = savedRow;
      return next;
    });
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
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", maxWidth: 220 }}>
          <input type="number" autoFocus value={editingCostValue} onChange={e => setEditingCostValue(e.target.value)}
            style={{ width: 70, padding: "3px 6px", borderRadius: 5, border: "1px solid var(--ne-accent)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 11 }} />
          <select value={costDateMode} onChange={e => setCostDateMode(e.target.value)}
            style={{ padding: "3px 4px", borderRadius: 5, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 10 }}>
            <option value="immediate">{t("pnl.applyImmediately")}</option>
            <option value="scheduled">{t("pnl.applyFromDate")}</option>
          </select>
          {costDateMode === "scheduled" && (
            <input type="date" value={costDateValue} min={addDays(toDateStr(new Date()), 1)} onChange={e => setCostDateValue(e.target.value)}
              style={{ padding: "3px 5px", borderRadius: 5, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 10, width: 118 }} />
          )}
          <button onClick={() => saveCost(row.sku)}
            style={{ background: "var(--ne-grad)", border: "none", borderRadius: 5, color: "#fff", padding: "3px 8px", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center" }}><Icon name="check" size={9} /></button>
          <button onClick={() => setEditingCostSku(null)}
            style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 5, color: "var(--ne-text)", padding: "3px 8px", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center" }}><Icon name="close" size={9} /></button>
        </div>
      );
    }
    if (row.costPer == null) {
      return (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "var(--ne-muted-2)", fontSize: 11 }}>{t("pnl.costNotSet")}</span>
          <button onClick={() => openSetCost(row.sku, null)}
            style={{ background: "var(--ne-accent-soft)", border: "none", borderRadius: 6, color: "var(--ne-accent)", padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
            {t("pnl.setCost")}
          </button>
        </div>
      );
    }
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span onClick={() => openSetCost(row.sku, row.costPer)} style={{ cursor: "pointer", fontSize: 11.5, color: "var(--ne-text)" }} title={t("pnl.editCostTitle")}>
          {rupees(row.cost)}
        </span>
        {row.hasIncompleteCost && (
          <span title={t("pnl.incompleteCostTooltip")} style={{ display: "inline-flex", color: "var(--ne-warning)" }}>
            <Icon name="warning" size={11} />
          </span>
        )}
      </span>
    );
  };

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="trending" size={17} /> {t("pnl.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{t("pnl.subtitle")}</p>
        </div>
        <button onClick={() => setShowExpenseModal(true)}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {t("pnl.addExpense")}
        </button>
      </div>

      {/* Date Filter */}
      <div style={{ display: "flex", gap: 7, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
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

      {/* Hero Net Profit Card */}
      <div style={{ background: "var(--ne-grad)", borderRadius: 18, padding: "1.4rem", marginBottom: "0.75rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontWeight: 600, marginBottom: 4 }}>
            {dateFilterLabel} {t("pnl.netProfitSuffix")}
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
        <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><Icon name="tag" size={13} /> {t("pnl.perSkuTitle")}</h2>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted)" }}>{t("pnl.loading")}</div>
        ) : perSkuStats.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--ne-muted-2)", fontSize: 12 }}>{t("pnl.noApprovedOrders")}</div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {perSkuStats.map(row => (
              <div key={row.sku} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ne-text)", marginBottom: 4 }}>{row.sku}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ne-muted)", marginBottom: 2 }}>
                  <span>{t("pnl.ordersLabel")} {row.orders}</span><span>{t("pnl.revenueLabel")} {rupees(row.revenue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "var(--ne-muted)" }}>{t("pnl.costLabel")} <CostCell row={row} /></span>
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
                  {[t("pnl.table.sku"), t("pnl.table.orders"), t("pnl.table.revenue"), t("pnl.table.cost"), t("pnl.table.profit")].map(h => (
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
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>{t("pnl.addExpense")}</h2>
            </div>
            <form onSubmit={addExpense} style={{ padding: "16px 18px" }}>
              <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
              </select>
              <input type="number" placeholder={t("pnl.amountPlaceholder")} value={expenseForm.amount} step="0.01"
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} />
              <input type="date" value={expenseForm.expense_date}
                onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))} style={inputStyle} />
              <textarea placeholder={t("pnl.notesPlaceholder")} rows={2} value={expenseForm.notes}
                onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

              {expenseError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{expenseError}</p>}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={expenseSaving}
                  style={{ flex: 1, padding: "10px", background: expenseSaving ? "var(--ne-border)" : "var(--ne-success)", color: expenseSaving ? "var(--ne-muted)" : "#0A2E1A", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: expenseSaving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {expenseSaving ? t("pnl.addingExpense") : (<><Icon name="check" size={13} /> {t("pnl.addExpenseButton")}</>)}
                </button>
                <button type="button" onClick={() => setShowExpenseModal(false)}
                  style={{ padding: "10px 16px", background: "transparent", color: "var(--ne-muted)", border: "1px solid var(--ne-border)", borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {t("pnl.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
