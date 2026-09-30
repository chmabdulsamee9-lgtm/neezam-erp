// Reusable loading skeletons (Meta-Ads style). Sirf layout ka dhancha — koi text nahi, isliye i18n ki zaroorat nahi.
// Rang .ne-skel class se aata hai (theme.css: light/dark alag), cards theme variables se.
const card = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14 };
const wrap = { padding: "1rem", display: "flex", flexDirection: "column", gap: 16 };
const rowStyle = { display: "flex", gap: 12, flexWrap: "wrap" };

export function SkelBar({ h = 14, w = "100%", style }) {
  return <div className="ne-skel" style={{ height: h, width: w, ...style }} />;
}

export function SkelHeader({ actions = 0 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
        <SkelBar h={20} w="180px" />
        <SkelBar h={11} w="120px" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[...Array(actions)].map((_, i) => <SkelBar key={i} h={30} w="96px" style={{ borderRadius: 20 }} />)}
      </div>
    </div>
  );
}

export function SkelPills({ n = 5 }) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {[...Array(n)].map((_, i) => <SkelBar key={i} h={28} w="76px" style={{ borderRadius: 20 }} />)}
    </div>
  );
}

export function SkelCards({ n = 4, h = 84, min = 160 }) {
  return (
    <div style={rowStyle}>
      {[...Array(n)].map((_, i) => (
        <div key={i} style={{ ...card, flex: `1 1 ${min}px`, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <SkelBar h={11} w="55%" />
          <SkelBar h={Math.max(h - 44, 14)} w="70%" />
        </div>
      ))}
    </div>
  );
}

export function SkelChart({ h = 240 }) {
  return (
    <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <SkelBar h={14} w="160px" />
      <SkelBar h={h} />
    </div>
  );
}

export function SkelTable({ cols = 6, rows = 8 }) {
  const grid = { display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, alignItems: "center" };
  return (
    <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={grid}>{[...Array(cols)].map((_, i) => <SkelBar key={i} h={12} w="70%" />)}</div>
      {[...Array(rows)].map((_, r) => (
        <div key={r} style={grid}>{[...Array(cols)].map((_, c) => <SkelBar key={c} h={14} w={c === 0 ? "90%" : "65%"} />)}</div>
      ))}
    </div>
  );
}

export function SkelCardList({ n = 5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[...Array(n)].map((_, i) => (
        <div key={i} style={{ ...card, padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
          <SkelBar h={48} w="48px" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <SkelBar h={14} w="45%" />
            <SkelBar h={11} w="70%" />
          </div>
          <SkelBar h={26} w="80px" style={{ borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

export function SkelTabs({ n = 6 }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {[...Array(n)].map((_, i) => <SkelBar key={i} h={30} w="92px" style={{ borderRadius: 8 }} />)}
    </div>
  );
}

function SkelSearchRow() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <SkelBar h={34} w="260px" style={{ borderRadius: 9 }} />
      <SkelBar h={34} w="140px" style={{ borderRadius: 9 }} />
      <SkelBar h={34} w="110px" style={{ borderRadius: 9 }} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelPills n={5} />
      <div style={{ ...card, padding: 18, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 180 }}>
          <SkelBar h={12} w="120px" />
          <SkelBar h={30} w="200px" />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[...Array(5)].map((_, i) => <SkelBar key={i} h={44} w="78px" />)}
        </div>
      </div>
      <SkelCards n={11} h={60} min={120} />
      <SkelChart h={220} />
      <SkelChart h={180} />
      <div style={rowStyle}>
        <div style={{ flex: "1 1 280px" }}><SkelCardList n={4} /></div>
        <div style={{ flex: "1 1 280px" }}><SkelCardList n={4} /></div>
      </div>
    </div>
  );
}

export function OrdersSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={3} />
      <SkelPills n={5} />
      <SkelSearchRow />
      <SkelTabs n={6} />
      <SkelTable cols={9} rows={8} />
    </div>
  );
}

export function BookedSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={1} />
      <SkelSearchRow />
      <SkelTabs n={10} />
      <SkelCardList n={5} />
    </div>
  );
}

export function ProductsSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={2} />
      <SkelSearchRow />
      <SkelCardList n={6} />
    </div>
  );
}

export function TableSkeleton({ cols = 6, rows = 8, actions = 1 }) {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={actions} />
      <SkelSearchRow />
      <SkelTable cols={cols} rows={rows} />
    </div>
  );
}

export function PnlSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelPills n={5} />
      <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <SkelBar h={12} w="140px" />
        <SkelBar h={32} w="220px" />
      </div>
      <SkelCards n={4} />
      <SkelTable cols={5} rows={6} />
    </div>
  );
}

export function LedgerSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={1} />
      <SkelCards n={6} h={96} min={220} />
    </div>
  );
}

export function CourierDashSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={1} />
      <SkelPills n={5} />
      <SkelCards n={4} />
      <SkelChart h={200} />
      <div style={rowStyle}>
        <div style={{ flex: "1 1 280px" }}><SkelChart h={160} /></div>
        <div style={{ flex: "1 1 280px" }}><SkelChart h={160} /></div>
      </div>
    </div>
  );
}

export function CourierDetailSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={0} />
      <SkelTabs n={3} />
      <SkelTable cols={9} rows={8} />
    </div>
  );
}

export function FinanceSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={1} />
      <SkelCardList n={4} />
    </div>
  );
}

export function TeamSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelHeader actions={1} />
      <SkelCardList n={4} />
    </div>
  );
}

export function GenericSkeleton() {
  return (
    <div style={wrap} aria-busy="true">
      <SkelBar h={32} w="45%" />
      <SkelCards n={4} />
      <SkelChart h={220} />
      <SkelChart h={160} />
    </div>
  );
}

// App.jsx se: orders load hone tak activeMenu ke hisaab se sahi skeleton.
export function PageSkeletonFor({ menu }) {
  switch (menu) {
    case "dashboard": return <DashboardSkeleton />;
    case "orders": return <OrdersSkeleton />;
    case "courier": return <BookedSkeleton />;
    case "products": return <ProductsSkeleton />;
    case "inventory": return <TableSkeleton cols={6} rows={8} actions={1} />;
    case "product-costing": return <TableSkeleton cols={8} rows={8} actions={3} />;
    case "finance-statement": return <FinanceSkeleton />;
    case "pnl": return <PnlSkeleton />;
    case "ledger": return <LedgerSkeleton />;
    case "courier-dashboard": return <CourierDashSkeleton />;
    case "courier-dashboard/detailed": return <CourierDetailSkeleton />;
    case "team": return <TeamSkeleton />;
    default: return <GenericSkeleton />;
  }
}
