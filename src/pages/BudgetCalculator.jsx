import { useState, useEffect, useMemo } from "react";

const rupees = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

// ordersData se approved% nikal kar delivery rate ka suggestion deta hai (auto-suggest, optional)
const suggestDeliveryRate = (ordersData) => {
  if (!ordersData?.length) return null;
  const withStatus = ordersData.filter(o => o.agent_status);
  if (!withStatus.length) return null;
  const approved = withStatus.filter(o => o.agent_status === "Approved").length;
  return Math.round((approved / withStatus.length) * 100);
};

export default function BudgetCalculator({ ordersData }) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [targetMode, setTargetMode] = useState("orders"); // "orders" | "revenue"
  const [targetOrders, setTargetOrders] = useState("50");
  const [targetRevenue, setTargetRevenue] = useState("100000");
  const [aov, setAov] = useState("2000");
  const [productCost, setProductCost] = useState("600");
  const [courierCost, setCourierCost] = useState("250");
  const [packagingCost, setPackagingCost] = useState("50");
  const [deliveryRate, setDeliveryRate] = useState("");
  const [cpa, setCpa] = useState("300");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const suggestedRate = useMemo(() => suggestDeliveryRate(ordersData), [ordersData]);

  useEffect(() => {
    if (deliveryRate === "" && suggestedRate != null) setDeliveryRate(String(suggestedRate));
  }, [suggestedRate]);

  // ---------- CALCULATIONS (real-time, koi button nahi) ----------
  const rate = Math.max(0.01, Math.min(100, Number(deliveryRate) || 0)) / 100;
  const avgOrderValue = Number(aov) || 0;
  const costPerOrder = Number(productCost) || 0;
  const courierPerOrder = Number(courierCost) || 0;
  const packagingPerOrder = Number(packagingCost) || 0;
  const costPerApproved = Number(cpa) || 0;

  // Target delivered orders (chahe direct daale ho ya revenue se derive ho)
  const targetDelivered = targetMode === "orders"
    ? (Number(targetOrders) || 0)
    : avgOrderValue > 0 ? (Number(targetRevenue) || 0) / avgOrderValue : 0;

  // Delivery rate ki wajah se, utne delivered orders lane ke liye zyada "confirmed/approved" orders chahiye
  const requiredApprovedOrders = rate > 0 ? targetDelivered / rate : 0;
  const requiredDailyAdBudget = requiredApprovedOrders * costPerApproved;

  // Per-delivered-order effective ad cost — CPA ko delivery rate se adjust karke
  const effectiveCostPerDelivered = rate > 0 ? costPerApproved / rate : 0;

  const revenue = targetDelivered * avgOrderValue;
  const cogs = targetDelivered * costPerOrder;
  const courierTotal = targetDelivered * courierPerOrder;
  const packagingTotal = targetDelivered * packagingPerOrder;
  const netProfitPerDay = revenue - cogs - courierTotal - packagingTotal - requiredDailyAdBudget;
  const netProfitPerMonth = netProfitPerDay * 30;

  const profitMargin = revenue > 0 ? (netProfitPerDay / revenue) * 100 : 0;

  // Break-even ROAS: kitna revenue-per-ad-rupee chahiye taake profit na ho na loss
  const totalCostPerDelivered = costPerOrder + courierPerOrder + packagingPerOrder + effectiveCostPerDelivered;
  const breakEvenROAS = avgOrderValue > 0 && effectiveCostPerDelivered > 0
    ? avgOrderValue / effectiveCostPerDelivered
    : null;

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--ne-border)",
    background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 13, boxSizing: "border-box", marginBottom: 12,
  };
  const labelStyle = { color: "var(--ne-muted)", fontSize: 11.5, display: "block", marginBottom: 4, fontWeight: 600 };

  const outputCards = [
    { label: "Required Daily Ad Budget", value: rupees(requiredDailyAdBudget), color: "var(--ne-accent)", bg: "var(--ne-accent-soft)", note: `~${Math.ceil(requiredApprovedOrders)} confirmed orders chahiye ${Math.round(targetDelivered)} delivered ke liye` },
    { label: "Break-even ROAS", value: breakEvenROAS ? `${breakEvenROAS.toFixed(2)}x` : "—", color: "var(--ne-warning)", bg: "var(--ne-warning-soft)", note: "Isse kam ROAS pe loss hoga" },
    { label: "Net Profit / Day", value: rupees(netProfitPerDay), color: netProfitPerDay >= 0 ? "var(--ne-success)" : "var(--ne-danger)", bg: netProfitPerDay >= 0 ? "var(--ne-success-soft)" : "var(--ne-danger-soft)", note: `Month: ${rupees(netProfitPerMonth)}` },
    { label: "Profit Margin", value: `${profitMargin.toFixed(1)}%`, color: profitMargin >= 0 ? "var(--ne-success)" : "var(--ne-danger)", bg: profitMargin >= 0 ? "var(--ne-success-soft)" : "var(--ne-danger-soft)", note: "Revenue ka % jo profit hai" },
  ];

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🧮 Budget Calculator</h1>
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>Ad budget aur profit ka andaza lagao — sab kuch real-time calculate hota hai</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>

        {/* Inputs */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1.25rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: 14, color: "var(--ne-text)", fontWeight: 700 }}>Inputs</h2>

          <label style={labelStyle}>Target</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button type="button" onClick={() => setTargetMode("orders")}
              style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1px solid", borderColor: targetMode === "orders" ? "transparent" : "var(--ne-border)", background: targetMode === "orders" ? "var(--ne-grad)" : "var(--ne-bg)", color: targetMode === "orders" ? "#fff" : "var(--ne-muted)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              Orders / Day
            </button>
            <button type="button" onClick={() => setTargetMode("revenue")}
              style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1px solid", borderColor: targetMode === "revenue" ? "transparent" : "var(--ne-border)", background: targetMode === "revenue" ? "var(--ne-grad)" : "var(--ne-bg)", color: targetMode === "revenue" ? "#fff" : "var(--ne-muted)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              Revenue / Day
            </button>
          </div>

          {targetMode === "orders" ? (
            <>
              <label style={labelStyle}>Target Delivered Orders / Day</label>
              <input type="number" value={targetOrders} onChange={e => setTargetOrders(e.target.value)} style={inputStyle} />
            </>
          ) : (
            <>
              <label style={labelStyle}>Target Revenue / Day (Rs.)</label>
              <input type="number" value={targetRevenue} onChange={e => setTargetRevenue(e.target.value)} style={inputStyle} />
            </>
          )}

          <label style={labelStyle}>Average Order Value (Rs.)</label>
          <input type="number" value={aov} onChange={e => setAov(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Product Cost per Order (Rs.)</label>
          <input type="number" value={productCost} onChange={e => setProductCost(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Courier Cost per Order (Rs.)</label>
          <input type="number" value={courierCost} onChange={e => setCourierCost(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Packaging Cost per Order (Rs.)</label>
          <input type="number" value={packagingCost} onChange={e => setPackagingCost(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>
            COD Approval/Delivery Rate (%)
            {suggestedRate != null && <span style={{ color: "var(--ne-accent)", fontWeight: 400 }}> — suggested: {suggestedRate}%</span>}
          </label>
          <input type="number" value={deliveryRate} onChange={e => setDeliveryRate(e.target.value)} placeholder="e.g. 55" style={inputStyle} />

          <label style={labelStyle}>Current CPA — Cost per Confirmed/Approved Order (Rs.)</label>
          <input type="number" value={cpa} onChange={e => setCpa(e.target.value)} style={inputStyle} />
        </div>

        {/* Outputs */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr", gap: "0.6rem", marginBottom: "0.75rem" }}>
            {outputCards.map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: "1rem" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.color, marginBottom: 3 }}>{c.value}</div>
                <div style={{ fontSize: 10.5, color: c.color, fontWeight: 700, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: "var(--ne-muted)" }}>{c.note}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📐 Per-Order Cost Breakdown</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--ne-muted)" }}>Per Confirmed Order — Ad Cost (CPA)</span>
                <span style={{ color: "var(--ne-text)", fontWeight: 600 }}>{rupees(costPerApproved)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--ne-muted)" }}>Per Delivered Order — Effective Ad Cost</span>
                <span style={{ color: "var(--ne-warning)", fontWeight: 700 }}>{rupees(effectiveCostPerDelivered)}</span>
              </div>
              <p style={{ margin: "2px 0 4px", fontSize: 10.5, color: "var(--ne-muted-2)", lineHeight: 1.5 }}>
                Delivery rate {Math.round(rate * 100)}% ka matlab: {Math.round(1 / rate * 100) / 100}x confirmed orders chahiye har ek delivered order ke liye — isliye per-delivered ad cost, per-confirmed CPA se zyada hoti hai.
              </p>
              <div style={{ borderTop: "1px solid var(--ne-border)", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--ne-muted)" }}>Total Cost per Delivered Order</span>
                <span style={{ color: "var(--ne-danger)", fontWeight: 700 }}>{rupees(totalCostPerDelivered)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--ne-muted)" }}>Profit per Delivered Order</span>
                <span style={{ color: (avgOrderValue - totalCostPerDelivered) >= 0 ? "var(--ne-success)" : "var(--ne-danger)", fontWeight: 700 }}>{rupees(avgOrderValue - totalCostPerDelivered)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
