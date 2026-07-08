import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { getCachedBookedOrders } from "../ordersCache";
import { syncBookedOrdersCache } from "../bookedOrdersData";

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

const STATUS_TABS = ["All", "Delivered", "Returned", "In Transit", "Failed Delivery"];
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

const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

const trackingUrl = (trackingNo) => `https://www.dex.com.pk/tracking?references=${encodeURIComponent(trackingNo || "")}`;

// "Day N" = pickup_success_at (ya na ho to package_created_at) se aaj tak guzre din + 1
// (pickup/creation ke din khud "Day 1" hai). Sirf pending orders (na Delivered na Returned)
// ke liye relevant hai — dono complete ho jayein to yeh pill dikhana hi nahi.
function computeAgingDay(ad) {
  if (ad.delivered_at || ad.return_success_at) return null;
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

// Horizontal timeline — Booked/Picked Up ka apna timestamp hai; "In Transit" ka koi alag
// column hi nahi humare schema mein (Dex Excel se yeh granularity kabhi capture nahi hui),
// isliye woh step Picked Up ke sath hi "done" maana jata hai — jo bhi data available hai
// usi ka honest representation hai, guess nahi.
function timelineSteps(ad) {
  const isReturned = !!ad.return_success_at;
  const steps = [
    { label: "Booked", done: !!ad.package_created_at, at: ad.package_created_at },
    { label: "Picked Up", done: !!ad.pickup_success_at, at: ad.pickup_success_at },
    { label: "In Transit", done: !!ad.pickup_success_at, at: null },
    { label: isReturned ? "Returned" : "Delivered", done: isReturned || !!ad.delivered_at, at: isReturned ? ad.return_success_at : ad.delivered_at, isReturn: isReturned },
  ];
  let currentIdx = steps.findIndex((s) => !s.done);
  if (currentIdx === -1) currentIdx = -1; // sab steps done — koi "current" glow nahi
  return { steps, currentIdx };
}

function Timeline({ ad }) {
  const { steps, currentIdx } = timelineSteps(ad);
  return (
    <div style={{ display: "flex" }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ flex: 1, textAlign: "center", position: "relative" }}>
          {i > 0 && (
            <div style={{ position: "absolute", top: 6, left: "-50%", width: "100%", height: 2, background: steps[i - 1].done ? "var(--ne-success)" : "var(--ne-border)" }} />
          )}
          <div style={{
            width: 13, height: 13, borderRadius: "50%", margin: "0 auto", position: "relative", zIndex: 1,
            background: s.done ? (s.isReturn ? "var(--ne-danger)" : "var(--ne-success)") : "var(--ne-border)",
            boxShadow: i === currentIdx ? "0 0 0 5px var(--ne-accent-soft)" : "none",
            border: i === currentIdx ? "2px solid var(--ne-accent)" : "none",
          }} />
          <div style={{ fontSize: 9.5, marginTop: 6, fontWeight: s.done ? 700 : 500, color: s.done ? "var(--ne-text)" : "var(--ne-muted-2)" }}>{s.label}</div>
          <div style={{ fontSize: 8.5, color: "var(--ne-muted-2)", marginTop: 2 }}>{fmtDateTime(s.at) || "—"}</div>
        </div>
      ))}
    </div>
  );
}

export default function BookedOrders({ storeId, ordersStore }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [courierFilter, setCourierFilter] = useState("All");
  const [expandedIds, setExpandedIds] = useState(new Set());
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
      const cached = await getCachedBookedOrders();
      const cachedForStore = cached.filter((o) => o.agent_data?.store_id === storeId);

      if (cachedForStore.length > 0) {
        setOrders(cachedForStore);
        setLoading(false);
        syncBookedOrdersCache(storeId)
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
      const { rows } = await syncBookedOrdersCache(storeId, (count) => setLoadingCount(count));
      setOrders(rows);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
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

  const tabCounts = Object.fromEntries(
    STATUS_TABS.map((t) => [t, t === "All" ? orders.length : orders.filter((o) => bucketCourierStatus(o.agent_data.courier_order_status) === t).length])
  );

  const filtered = orders.filter((o) => {
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
    const matchTab = activeTab === "All" || bucketCourierStatus(ad.courier_order_status) === activeTab;
    const matchCourier = courierFilter === "All" || ad.courier_name === courierFilter;
    return matchSearch && matchTab && matchCourier;
  });

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const pagedFiltered = filtered.slice((page - 1) * perPage, page * perPage);

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "12px 14px", marginBottom: 8 };

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

      {/* Status Tabs */}
      <div style={{ display: "flex", gap: 7, marginBottom: "0.75rem", flexWrap: "wrap" }}>
        {STATUS_TABS.map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: activeTab === tab ? "transparent" : "var(--ne-border)",
              background: activeTab === tab ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted)" }}>
            {tab}
            <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: activeTab === tab ? "rgba(255,255,255,0.22)" : "var(--ne-bg)",
              color: activeTab === tab ? "#fff" : "var(--ne-muted-2)" }}>
              {tabCounts[tab] || 0}
            </span>
          </button>
        ))}
      </div>

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
            const meta = STATUS_BUCKET_META[bucket] || { color: "var(--ne-muted-2)", bg: "var(--ne-surface)" };
            const fullName = `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim();
            const phone = o.customer?.phone || o.shipping_address?.phone || "";
            const city = o.shipping_address?.city || "";
            const isExpanded = expandedIds.has(o.id);
            const isRemarksOpen = expandedRemarksIds.has(o.id);
            const remarksLog = ad.remarks_log || [];
            const agingDay = computeAgingDay(ad);
            const aging = agingDay ? agingMeta(agingDay) : null;

            return (
              <div key={o.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <a href={trackingUrl(ad.dex_tracking_number)} target="_blank" rel="noreferrer"
                      style={{ color: "var(--ne-accent)", fontWeight: 700, textDecoration: "none", fontSize: 14, borderBottom: "1px dashed var(--ne-accent)", paddingBottom: 1 }}>
                      {o.name}
                    </a>
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

                <button onClick={() => toggleExpand(o.id)}
                  style={{ width: "100%", marginTop: 8, padding: "6px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-surface)", color: "var(--ne-muted)", fontSize: 10.5, cursor: "pointer", fontWeight: 600 }}>
                  {isExpanded ? "▲ Kam dikhao" : "▼ Tafseel dikhao"}
                </button>

                {isExpanded && (
                  <div style={{ marginTop: 8, fontSize: 11 }}>
                    {/* Detail Grid */}
                    <div style={{
                      display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 14,
                      padding: "14px 0", borderTop: "1px solid var(--ne-border)", borderBottom: "1px solid var(--ne-border)", marginBottom: 14,
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

                    {/* Timeline */}
                    <div style={{ marginBottom: 16 }}>
                      <Timeline ad={ad} />
                    </div>

                    {ad.latest_fail_reason && (
                      <div style={{ marginBottom: 14, padding: "5px 9px", borderRadius: 8, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontWeight: 600, width: "fit-content" }}>
                        ⚠️ {ad.latest_fail_reason}
                      </div>
                    )}

                    {/* Remarks — timeline ke seedha neeche, bordered-box toggle + count-badge */}
                    <div>
                      <button onClick={() => toggleRemarks(o.id)}
                        style={{ background: "none", border: "1px solid var(--ne-border)", color: "var(--ne-muted)", fontSize: 11.5, fontWeight: 600, padding: "6px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        💬 {isRemarksOpen ? "Hide Remarks" : "Show / Add Remarks"}
                        <span style={{ fontSize: 10, background: "var(--ne-accent)", color: "#fff", padding: "1px 7px", borderRadius: 10 }}>{remarksLog.length}</span>
                      </button>

                      {isRemarksOpen && (
                        <div style={{ marginTop: 12, paddingTop: 2 }}>
                          {remarksLog.map((r, i) => (
                            <div key={i} style={{ padding: "6px 0", fontSize: 12, borderBottom: i === remarksLog.length - 1 ? "none" : "1px solid var(--ne-border)" }}>
                              <div style={{ color: "var(--ne-text)" }}>{r.text}</div>
                              <div style={{ fontSize: 10, color: "var(--ne-muted-2)", marginTop: 3 }}>
                                {r.author} · {new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                              </div>
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <input type="text" placeholder="Naya remark likhein..."
                              value={remarkDrafts[o.id] || ""}
                              onChange={(e) => setRemarkDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") submitRemark(o); }}
                              style={{ flex: 1, background: "transparent", border: "none", borderBottom: "1px solid var(--ne-border)", padding: "6px 2px", color: "var(--ne-text)", fontSize: 12, outline: "none" }} />
                            <button onClick={() => submitRemark(o)} disabled={remarkSubmitting === o.id || !(remarkDrafts[o.id] || "").trim()}
                              style={{ background: "transparent", border: "1px solid var(--ne-accent)", color: "var(--ne-accent)", padding: "6px 14px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: remarkSubmitting === o.id ? "default" : "pointer", whiteSpace: "nowrap" }}>
                              {remarkSubmitting === o.id ? "..." : "Add"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
