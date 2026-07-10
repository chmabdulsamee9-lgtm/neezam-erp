import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { getCachedBookedOrders } from "../ordersCache";
import { syncBookedOrdersCache, bucketFinalStatus } from "../bookedOrdersData";
import dexLogo from "../assets/couriers/dex.png";

const PER_PAGE_OPTIONS = [20, 50, 100];

// Courier company brand colors — jaise Dashboard.jsx ke SOURCE_COLORS (Meta/TikTok/etc),
// yeh company-identity colors hain, theme-reactive semantic vars nahi
const COURIER_COLORS = {
  "PK-DEX": "#5C7CFA",
  "PK-LCS": "#34D88E",
  "PK-TCS": "#FB923C",
  "PK-TRAX": "#3B82F6",
  "PK-MNP-API": "#A855F7",
};
const courierColor = (name) => COURIER_COLORS[name] || "#8C93C4";

const STATUS_BUCKET_META = {
  Delivered: { color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
  Returned: { color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
  "In Transit": { color: "var(--ne-accent)", bg: "var(--ne-accent-soft)" },
  "Failed Delivery": { color: "var(--ne-orange)", bg: "var(--ne-orange-soft)" },
};

// Daraz ke courier_order_status (omsOrderStatus se aaya) ka exact vocabulary sample data
// dekhe bina pata nahi — isliye keyword-based bucketing, exact-string match nahi. Agar
// real data pe grouping galat lage to yahan rules adjust karne honge.
function bucketCourierStatus(raw) {
  const s = (raw || "").toLowerCase();
  if (!s) return "In Transit";
  if (s.includes("return")) return "Returned";
  if (s.includes("fail")) return "Failed Delivery";
  if (s.includes("deliver")) return "Delivered";
  return "In Transit";
}

// Top filter-tabs ka nested taxonomy (bucketCourierStatus/STATUS_BUCKET_META se ALAG/independent
// hai — woh sirf per-card status-badge color ke liye hai, yeh sirf tab-filtering ke liye).
// "To Ship" aur "Shipped" ke apne sub-buckets hain, baaki standalone final-outcome tabs hain.
// Real dex_status/courier_order_status distinct-values (2026-07-09 query) ke against confirmed:
// har value neeche kisi na kisi bucket mein saaf saaf aata hai, koi unclassified case nahi bacha.
const TAB_STRUCTURE = [
  { key: "All", label: "All" },
  { key: "To Ship", label: "To Ship", subs: [
      { key: "Booked", label: "Booked" },
      { key: "Pickup Failed", label: "Pickup Failed" },
    ] },
  { key: "Shipped", label: "Shipped", subs: [
      { key: "Pickup Success", label: "Pickup Success" },
      { key: "Transit to Ship", label: "Transit to Ship" },
      { key: "Arrived at Destination City", label: "Arrived at Destination City" },
      { key: "Out for Delivery", label: "Out for Delivery" },
      { key: "Failed Delivery", label: "Failed Delivery" },
    ] },
  { key: "Delivered", label: "Delivered" },
  { key: "Pending Return", label: "Pending Return" },
  { key: "Returned", label: "Returned" },
  { key: "Lost & Damage", label: "Lost & Damage" },
  { key: "Cancel", label: "Cancel" },
];

// Har order ko exactly ek {tab, sub} mein classify karta hai. bucketFinalStatus() (order_statuses
// ka authoritative courier_order_status-based final-state) pehle check hoti hai; agar abhi koi
// final state nahi hai to pickup_success_at/arrived_at_destination_at/out_for_delivery_at/dex_status
// (jo already Timeline ke liye track ho rahe hain) se in-progress position decide hoti hai.
function classifyTab(o) {
  const ad = o.agent_data;
  const finalStatus = bucketFinalStatus(ad.courier_order_status);

  if (finalStatus === "Delivered") return { tab: "Delivered", sub: null };
  if (finalStatus === "Return Pending") return { tab: "Pending Return", sub: null };
  if (finalStatus === "Returned") return { tab: "Returned", sub: null };
  if (finalStatus === "Lost") return { tab: "Lost & Damage", sub: null };
  if (finalStatus === "Cancelled") return { tab: "Cancel", sub: null };
  if (finalStatus === "Pickup Failed") return { tab: "To Ship", sub: "Pickup Failed" };

  if (!ad.pickup_success_at) return { tab: "To Ship", sub: "Booked" };

  if (finalStatus === "Delivery Failed") return { tab: "Shipped", sub: "Failed Delivery" };
  if (ad.out_for_delivery_at) return { tab: "Shipped", sub: "Out for Delivery" };
  if (ad.arrived_at_destination_at) return { tab: "Shipped", sub: "Arrived at Destination City" };
  if ((ad.dex_status || "").toLowerCase().includes("handover_accepted")) return { tab: "Shipped", sub: "Pickup Success" };
  return { tab: "Shipped", sub: "Transit to Ship" };
}

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

const trackingUrl = (trackingNo) => `https://www.dex.com.pk/tracking?references=${encodeURIComponent(trackingNo || "")}`;

// "Day N" = pickup_success_at (ya na ho to package_created_at) se aaj tak guzre din + 1
// (pickup/creation ke din khud "Day 1" hai). Koi bhi final/terminal courier_order_status
// (Delivered/Returned/Delivery Failed/Return Pending/Lost/Pickup Failed/Cancelled) reach ho
// chuka ho to yeh pill irrelevant hai — sirf abhi-tak-pending orders ke liye relevant hai.
function computeAgingDay(o) {
  const ad = o.agent_data;
  if (bucketFinalStatus(ad.courier_order_status)) return null;
  const refTs = ad.pickup_success_at || ad.package_created_at;
  if (!refTs) return null;
  const days = Math.floor((Date.now() - new Date(refTs).getTime()) / 86400000) + 1;
  return Math.max(1, days);
}

function agingMeta(day) {
  if (day <= 1) return { color: "#22C55E", label: "Great" };
  if (day === 2) return { color: "#84CC16", label: "On Track" };
  if (day === 3) return { color: "#EAB308", label: "Normal" };
  if (day === 4) return { color: "#F97316", label: "Concerning" };
  if (day === 5) return { color: "#EF4444", label: "Alarming" };
  return { color: "#DC2626", label: "Urgent Action Needed", pulse: true };
}

// Final-state color ramp (Aurora Ledger palette, confirmed) — jab order apne final/terminal
// outcome tak pahunch jaye to POORI progress-line isi color mein render hoti hai, sirf last
// dot ka color nahi.
const FINAL_STATE_COLOR = {
  Delivered: "#34D88E",
  "Delivery Failed": "#F2A83E",
  "Return Pending": "#FB923C",
  Returned: "#F26D6D",
  Lost: "#F472B6",
};
const IN_PROGRESS_COLOR = "var(--ne-accent)";

function daysBetween(fromIso, toIso) {
  if (!fromIso) return null;
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  return Math.max(0, Math.floor((to - from) / 86400000));
}

// Booking ke turant baad, bina kisi intermediate status ke, seedha Cancelled/Pickup-Failed ho
// jane wale orders ke liye poora 6-stage timeline misleading hai (jaise "Day 336" dikhana
// jabke woh sirf turant-cancel hua tha, kabhi transit mein gaya hi nahi) — in ke liye sirf
// Booked -> Final ka 2-stage mini-timeline dikhate hain, neutral color mein (koi urgency nahi).
function isBookedToTerminalSpecialCase(finalStatus, ad) {
  return (finalStatus === "Cancelled" || finalStatus === "Pickup Failed") && !ad.pickup_success_at;
}

// Stages: [Created (sirf matched orders ke liye, Shopify raw_data.created_at se) ->] Booked
// [package_created_at] -> In Transit [pickup_success_at] -> Arrived at Destination City
// [arrived_at_destination_at] -> Out for Delivery [out_for_delivery_at] -> Final (courier_order_status
// se decide, color/label badalta hai). Har stage ke upar day-count = us stage aur AGLE known
// checkpoint ke beech ka farq — agla checkpoint maloom ho jaye to yeh count naturally frozen ho
// jata hai (dono timestamps fixed hain), warna aaj tak live badhta rehta hai.
function buildTimeline(o) {
  const ad = o.agent_data;
  const finalStatus = bucketFinalStatus(ad.courier_order_status);

  if (isBookedToTerminalSpecialCase(finalStatus, ad) && ad.package_created_at) {
    const finalAt = ad.logistics_status_at || null;
    return {
      special: true,
      color: "var(--ne-muted-2)",
      currentIdx: -1,
      isReached: true,
      stages: [
        { label: "Booked", at: ad.package_created_at, done: true, days: daysBetween(ad.package_created_at, finalAt) },
        { label: finalStatus, at: finalAt, done: true, days: null, isFinal: true },
      ],
    };
  }

  const finalAt = finalStatus === "Delivered" ? (ad.delivered_at || ad.logistics_status_at)
    : finalStatus === "Returned" ? (ad.return_success_at || ad.logistics_status_at)
    : ad.logistics_status_at;
  const finalMeta = finalStatus && FINAL_STATE_COLOR[finalStatus]
    ? { label: finalStatus, at: finalAt, color: FINAL_STATE_COLOR[finalStatus] }
    : { label: "Delivered", at: null, color: null };
  const isReached = !!finalMeta.color;

  const rawStages = [];
  if (!o.isManual) rawStages.push({ label: "Created", at: o.created_at });
  rawStages.push({ label: "Booked", at: ad.package_created_at });
  rawStages.push({ label: "In Transit", at: ad.pickup_success_at });
  rawStages.push({ label: "Arrived at Destination City", at: ad.arrived_at_destination_at });
  rawStages.push({ label: "Out for Delivery", at: ad.out_for_delivery_at });

  const checkpoints = [...rawStages, finalMeta];
  const stages = rawStages.map((s, i) => {
    const nextKnownAt = checkpoints.slice(i + 1).find((c) => !!c.at)?.at || null;
    return { ...s, done: isReached || !!s.at, days: s.at ? daysBetween(s.at, nextKnownAt) : null };
  });

  let currentIdx = -1;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].at) { currentIdx = i; break; }
  }

  return {
    special: false,
    color: isReached ? finalMeta.color : IN_PROGRESS_COLOR,
    isReached,
    currentIdx: isReached ? -1 : currentIdx,
    stages: [...stages, { label: finalMeta.label, at: finalMeta.at, done: isReached, days: null, isFinal: true }],
  };
}

function Timeline({ order }) {
  const tl = buildTimeline(order);
  return (
    <div style={{ display: "flex" }}>
      {tl.stages.map((s, i) => {
        const isCurrent = i === tl.currentIdx;
        const dotColor = tl.isReached || tl.special ? tl.color : (s.done ? IN_PROGRESS_COLOR : "var(--ne-border)");
        const lineColor = tl.isReached || tl.special ? tl.color : (i > 0 && tl.stages[i - 1].done ? IN_PROGRESS_COLOR : "var(--ne-border)");
        return (
          <div key={s.label} style={{ flex: 1, textAlign: "center", position: "relative", minWidth: 72 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: dotColor, marginBottom: 3, minHeight: 12 }}>
              {s.days !== null && s.days !== undefined ? `${s.days} day${s.days === 1 ? "" : "s"}` : " "}
            </div>
            {i > 0 && (
              <div style={{ position: "absolute", top: 20, left: "-50%", width: "100%", height: 2, background: lineColor }} />
            )}
            <div style={{
              width: 11, height: 11, borderRadius: "50%", margin: "0 auto", position: "relative", zIndex: 1,
              background: dotColor,
              boxShadow: isCurrent ? `0 0 0 4px ${dotColor}33` : "none",
            }} />
            <div style={{ fontSize: 9.5, marginTop: 6, fontWeight: s.done ? 700 : 500, color: s.done ? "var(--ne-text)" : "var(--ne-muted-2)" }}>{s.label}</div>
            <div style={{ fontSize: 8.5, color: "var(--ne-muted-2)", marginTop: 2 }}>{fmtDateTime(s.at) || "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

// Order-number ke numeric-sequence se descending sort (LATEST se OLDEST) — "#DWK8390" se 8390
// nikal ke number compare karte hain, manual orders ke liye manual_order_number use karte hain.
function extractOrderNum(o) {
  const raw = (o.name && o.name !== "—" ? o.name : o.agent_data.manual_order_number) || "";
  const digits = raw.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : -1;
}

export default function BookedOrders({ storeId, ordersStore }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [activeSubTab, setActiveSubTab] = useState(null);
  const [courierFilter, setCourierFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [expandedRemarksIds, setExpandedRemarksIds] = useState(new Set());
  const [remarkDrafts, setRemarkDrafts] = useState({});
  const [remarkSubmitting, setRemarkSubmitting] = useState(null);
  const [loadingCount, setLoadingCount] = useState(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (storeId) loadBooked();
  }, [storeId]);

  // Remarks ke "author" field ke liye current user ka naam (Orders.jsx ke currentProfile
  // fetch jaisa hi pattern)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("id", user.id).single();
      setCurrentProfile(data || null);
    })();
  }, []);

  // App.jsx ka background preload agar pehle hi cache warm kar chuka ho, to yahan turant
  // (spinner ke bina) dikhega — warna yehi function full-load karega. syncBookedOrdersCache()
  // (src/bookedOrdersData.js) hi asal fetch/merge/cache-write karta hai, App.jsx ka
  // fire-and-forget preload bhi isi function ko use karta hai — dono jagah same logic.
  const loadBooked = async () => {
    setError("");
    try {
      const cached = await getCachedBookedOrders(ordersStore?.eneezam_id);
      const cachedForStore = cached.filter((o) => o.agent_data?.store_id === storeId);

      if (cachedForStore.length > 0) {
        setOrders(cachedForStore);
        setLoading(false);
        syncBookedOrdersCache(storeId, ordersStore?.eneezam_id)
          .then(({ rows }) => {
            if (rows.length === 0) return;
            setOrders((prev) => {
              const map = {};
              prev.forEach((o) => { map[o.id] = o; });
              rows.forEach((o) => { map[o.id] = o; });
              return Object.values(map);
            });
          })
          .catch((err) => console.log("Booked delta sync error:", err.message));
        return;
      }

      setLoading(true);
      setLoadingCount(0);
      const { rows } = await syncBookedOrdersCache(storeId, ordersStore?.eneezam_id, (count) => setLoadingCount(count));
      setOrders(rows);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const toggleRemarks = (id) => {
    setExpandedRemarksIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const submitRemark = async (order) => {
    const text = (remarkDrafts[order.id] || "").trim();
    if (!text) return;
    const author = currentProfile?.full_name || currentProfile?.email || "—";
    const optimisticEntry = { text, author, created_at: new Date().toISOString() };

    setRemarkSubmitting(order.id);
    // Optimistic update — turant dikhao, DB confirm hone ka wait nahi
    setOrders((prev) => prev.map((o) => o.id === order.id
      ? { ...o, agent_data: { ...o.agent_data, remarks_log: [...(o.agent_data.remarks_log || []), optimisticEntry] } }
      : o
    ));
    setRemarkDrafts((prev) => ({ ...prev, [order.id]: "" }));

    try {
      const { data, error: rpcError } = await supabase.rpc("append_order_remark", {
        p_order_id: order.agent_data.order_id || null,
        p_manual_order_number: order.agent_data.manual_order_number || null,
        p_text: text,
        p_author: author,
      });
      if (rpcError) throw rpcError;
      // Server ka authoritative array (asal timestamp ke sath) se optimistic entry replace karo
      setOrders((prev) => prev.map((o) => o.id === order.id
        ? { ...o, agent_data: { ...o.agent_data, remarks_log: data || o.agent_data.remarks_log } }
        : o
      ));
    } catch (err) {
      console.log("Remark save error:", err.message);
    }
    setRemarkSubmitting(null);
  };

  const availableCouriers = ["All", ...new Set(orders.map((o) => o.agent_data.courier_name).filter(Boolean))].sort();

  const classified = orders.map((o) => ({ o, cls: classifyTab(o) }));
  const activeTabDef = TAB_STRUCTURE.find((t) => t.key === activeTab);

  const tabCounts = Object.fromEntries(
    TAB_STRUCTURE.map((t) => [t.key, t.key === "All" ? orders.length : classified.filter((c) => c.cls.tab === t.key).length])
  );
  const subTabCounts = Object.fromEntries(
    TAB_STRUCTURE.filter((t) => t.subs).flatMap((t) =>
      t.subs.map((s) => [`${t.key}::${s.key}`, classified.filter((c) => c.cls.tab === t.key && c.cls.sub === s.key).length])
    )
  );

  const filtered = classified.filter(({ o, cls }) => {
    const ad = o.agent_data;
    const fullName = `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.toLowerCase();
    const phone = o.customer?.phone || o.shipping_address?.phone || "";
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      (o.name || "").toLowerCase().includes(q) ||
      fullName.includes(q) ||
      phone.includes(search) ||
      (ad.dex_tracking_number || "").toLowerCase().includes(q);
    const matchTab = activeTab === "All" || (cls.tab === activeTab && (!activeSubTab || cls.sub === activeSubTab));
    const matchCourier = courierFilter === "All" || ad.courier_name === courierFilter;
    return matchSearch && matchTab && matchCourier;
  }).map(({ o }) => o).sort((a, b) => extractOrderNum(b) - extractOrderNum(a));

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pagedFiltered = filtered.slice((page - 1) * perPage, page * perPage);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "18px 20px", marginBottom: 16 };

  if (error) return <div style={{ padding: "2rem", color: "var(--ne-danger)" }}>❌ {error}</div>;

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <style>{"@keyframes ne-aging-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }"}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🚚 Booked Orders</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.store_name} — {filtered.length} shipments</p>
        </div>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11 }}>
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* Search + Courier Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: "0.6rem", flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 Naam, phone, order#, tracking#..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }} />
        <select value={courierFilter} onChange={(e) => { setCourierFilter(e.target.value); setPage(1); }}
          style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "var(--ne-surface-2)", color: "var(--ne-text)", fontSize: 11.5 }}>
          {availableCouriers.map((c) => <option key={c} value={c}>{c === "All" ? "All Couriers" : c}</option>)}
        </select>
      </div>

      {/* Top-level Tabs — "To Ship"/"Shipped" ke apne nested sub-buckets hain, baaki
          (Delivered/Pending Return/Returned/Lost & Damage/Cancel) standalone hain */}
      <div style={{ display: "flex", gap: 7, marginBottom: activeTabDef?.subs ? 6 : "0.75rem", flexWrap: "wrap" }}>
        {TAB_STRUCTURE.map((tab) => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setActiveSubTab(null); setPage(1); }}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab.key ? "transparent" : "var(--ne-border)",
              background: activeTab === tab.key ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab.key ? "#fff" : "var(--ne-muted)" }}>
            {tab.label}
            <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: activeTab === tab.key ? "rgba(255,255,255,0.22)" : "var(--ne-bg)",
              color: activeTab === tab.key ? "#fff" : "var(--ne-muted-2)" }}>
              {tabCounts[tab.key] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Nested sub-tabs — sirf jab active top-level tab ("To Ship"/"Shipped") ke subs hon */}
      {activeTabDef?.subs && (
        <div style={{ display: "flex", gap: 6, marginBottom: "0.75rem", flexWrap: "wrap", paddingLeft: 10, borderLeft: "2px solid var(--ne-border)" }}>
          <button onClick={() => { setActiveSubTab(null); setPage(1); }}
            style={{ padding: "5px 12px", borderRadius: 16, fontSize: 10.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: !activeSubTab ? "transparent" : "var(--ne-border)",
              background: !activeSubTab ? "var(--ne-accent-soft)" : "var(--ne-surface)",
              color: !activeSubTab ? "var(--ne-accent)" : "var(--ne-muted)" }}>
            All {activeTabDef.label}
            <span style={{ marginLeft: 5, opacity: 0.75 }}>{tabCounts[activeTabDef.key] || 0}</span>
          </button>
          {activeTabDef.subs.map((s) => (
            <button key={s.key} onClick={() => { setActiveSubTab(s.key); setPage(1); }}
              style={{ padding: "5px 12px", borderRadius: 16, fontSize: 10.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
                borderColor: activeSubTab === s.key ? "transparent" : "var(--ne-border)",
                background: activeSubTab === s.key ? "var(--ne-accent-soft)" : "var(--ne-surface)",
                color: activeSubTab === s.key ? "var(--ne-accent)" : "var(--ne-muted)" }}>
              {s.label}
              <span style={{ marginLeft: 5, opacity: 0.75 }}>{subTabCounts[`${activeTabDef.key}::${s.key}`] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--ne-muted)" }}>
          Loading{loadingCount > 0 ? ` (${loadingCount} loaded)` : "..."}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>Is filter mein koi booked order nahi.</div>
      ) : (
        <div>
          {pagedFiltered.map((o) => {
            const ad = o.agent_data;
            const bucket = bucketCourierStatus(ad.courier_order_status);
            const finalStatus = bucketFinalStatus(ad.courier_order_status);
            const isSpecialTerminal = finalStatus === "Cancelled" || finalStatus === "Pickup Failed";
            const meta = isSpecialTerminal
              ? { color: "var(--ne-muted)", bg: "var(--ne-muted-soft)" }
              : STATUS_BUCKET_META[bucket] || { color: "var(--ne-muted-2)", bg: "var(--ne-surface)" };
            const fullName = `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim();
            const phone = o.customer?.phone || o.shipping_address?.phone || "";
            const city = o.shipping_address?.city || "";
            const isRemarksOpen = expandedRemarksIds.has(o.id);
            const remarksLog = ad.remarks_log || [];
            const agingDay = computeAgingDay(o);
            const aging = agingDay ? agingMeta(agingDay) : null;
            return (
              <div key={o.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <a href={trackingUrl(ad.dex_tracking_number)} target="_blank" rel="noreferrer"
                        style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
                        {o.name}
                      </a>
                      {/* Is page pe har row hi Dex-booked hai (fetchBookedStatuses sirf
                          dex_tracking_number IS NOT NULL rows leta hai) — courier_name to
                          sirf Dex ka last-mile sub-carrier (PK-TRAX/PK-LCS/waghera) batata
                          hai, booking-platform nahi, isliye logo har card pe unconditional */}
                      <img src={dexLogo} alt="Dex" style={{ height: 16, width: "auto", display: "block" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginTop: 3 }}>
                      {fullName || "—"} · {phone || "—"} · {city || "—"}
                      {ad.logistics_status_at ? ` · ${fmtDateTime(ad.logistics_status_at)}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {o.isManual && (
                      <span title="Shopify mein match nahi mila — sirf Excel se courier data" style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
                        ⚠️ Unmatched/Manual
                      </span>
                    )}
                    {ad.courier_name && (
                      <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: `${courierColor(ad.courier_name)}26`, color: courierColor(ad.courier_name) }}>
                        {ad.courier_name}
                      </span>
                    )}
                    <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: meta.bg, color: meta.color }}>
                      {ad.courier_order_status || bucket}
                    </span>
                    {ad.delivery_attempt_count > 1 && (
                      <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, background: "var(--ne-warning-soft)", color: "var(--ne-warning)" }}>
                        ⚠️ {ad.delivery_attempt_count} attempts
                      </span>
                    )}
                    {aging && (
                      <span style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: `${aging.color}22`, color: aging.color,
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: aging.color, animation: aging.pulse ? "ne-aging-pulse 1.4s ease-in-out infinite" : "none" }} />
                        Day {agingDay} — {aging.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Details Grid — hamesha visible, koi toggle/wrapper nahi */}
                <div style={{
                  display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 14,
                  padding: "14px 0", borderTop: "1px solid var(--ne-border)", borderBottom: "1px solid var(--ne-border)", marginTop: 12, marginBottom: 14,
                }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>Tracking No</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ne-text)", fontFamily: "monospace" }}>{ad.dex_tracking_number || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>Status</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{ad.courier_order_status || bucket}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>Amount (COD)</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ne-text)" }}>{o.total_price ? `Rs. ${Number(o.total_price).toLocaleString()}` : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ne-muted)", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 }}>Delivery Attempts</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ad.delivery_attempt_count > 0 ? "var(--ne-warning)" : "var(--ne-text)" }}>{ad.delivery_attempt_count || 0}</div>
                  </div>
                </div>

                {/* Timeline — hamesha visible, koi toggle/wrapper nahi */}
                <div style={{ marginBottom: 16, overflowX: "auto" }}>
                  <Timeline order={o} />
                </div>

                {ad.latest_fail_reason && (
                  <div style={{ marginBottom: 14, padding: "5px 9px", borderRadius: 8, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content" }}>
                    ⚠️ {ad.latest_fail_reason}
                  </div>
                )}

                {/* Remarks box — YEH pura block hamesha visible hai, sirf iske andar ki
                    .remarks-list collapse/expand hoti hai jab header-button click ho.
                    Background/shadow Orders.jsx ke card-style se exact match (dono modes mein). */}
                <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" }}>
                  <button onClick={() => toggleRemarks(o.id)}
                    style={{ background: "none", border: "none", color: "var(--ne-text)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
                    💬 Remarks <span style={{ fontSize: 10.5, background: "var(--ne-accent)", color: "#fff", padding: "1px 8px", borderRadius: 10 }}>{remarksLog.length}</span>
                  </button>

                  {isRemarksOpen && (
                    <div style={{ marginTop: 12 }}>
                      {remarksLog.map((r, i) => (
                        <div key={i} style={{ background: "var(--ne-surface)", borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 12 }}>
                          <div style={{ color: "var(--ne-text)" }}>{r.text}</div>
                          <div style={{ fontSize: 10, color: "var(--ne-muted-2)", marginTop: 4 }}>
                            {r.author} · {new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <input type="text" placeholder="Naya remark likhein..."
                          value={remarkDrafts[o.id] || ""}
                          onChange={(e) => setRemarkDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") submitRemark(o); }}
                          style={{ flex: 1, background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 8, padding: "9px 12px", color: "var(--ne-text)", fontSize: 12, outline: "none" }} />
                        <button onClick={() => submitRemark(o)} disabled={remarkSubmitting === o.id || !(remarkDrafts[o.id] || "").trim()}
                          style={{ background: "var(--ne-grad)", border: "none", color: "#fff", padding: "9px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: remarkSubmitting === o.id ? "default" : "pointer", whiteSpace: "nowrap" }}>
                          {remarkSubmitting === o.id ? "..." : "Add"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination — Orders.jsx wala exact pattern */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ne-muted-2)" }}>
            Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === 1 ? "transparent" : "var(--ne-surface-2)", color: page === 1 ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === 1 ? "default" : "pointer" }}>‹</button>
            {[...Array(Math.min(5, totalPages))].map((_, idx) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + idx;
              return <button key={p} onClick={() => setPage(p)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === p ? "var(--ne-grad)" : "var(--ne-surface-2)", color: page === p ? "#fff" : "var(--ne-muted)", fontSize: 11, cursor: "pointer", fontWeight: page === p ? 700 : 400 }}>{p}</button>;
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--ne-border)", background: page === totalPages ? "transparent" : "var(--ne-surface-2)", color: page === totalPages ? "var(--ne-muted-2)" : "var(--ne-muted)", fontSize: 11, cursor: page === totalPages ? "default" : "pointer" }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
