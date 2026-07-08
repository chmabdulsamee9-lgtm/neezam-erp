import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";

const DEX_IMPORT_BATCH = 1000;

// Temporary bridge: jab tak Dex live API bind nahi hoti, Excel-uploaded
// (dex_shipments_import) data hi "booked" orders ka stand-in hai. Live data
// (order_statuses.dex_*) hamesha priority leta hai — jaise hi live API se
// koi order bind hoga, excel wala fallback khud-ba-khud overridden ho jayega.
async function fetchAllDexShipments(storeId) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("dex_shipments_import")
      .select("*")
      .eq("store_id", storeId)
      .range(from, from + DEX_IMPORT_BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < DEX_IMPORT_BATCH) break;
    from += DEX_IMPORT_BATCH;
  }
  return allRows;
}

// Dex externalOrderId format: "PREFIX[-VARIANT]_shopifyId_suffix" -> Shopify order
// name ("#DWK2366") sirf prefix hota hai (variant/suffix hataa kar)
const extractOrderRef = (externalOrderId) => {
  if (!externalOrderId) return null;
  const beforeUnderscore = String(externalOrderId).split("_")[0];
  const prefix = beforeUnderscore.split("-")[0];
  return prefix ? `#${prefix}` : null;
};

// Real status mapping (Worker se verified) — label + Aurora Ledger color mapping
const DEX_STATUSES = [
  { label: "Pickup Success", color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
  { label: "Pickup Failed", color: "var(--ne-danger)", bg: "var(--ne-danger-soft)" },
  { label: "Transit to Ship", color: "var(--ne-accent)", bg: "var(--ne-accent-soft)" },
  { label: "Last Mile Inbound", color: "var(--ne-accent2)", bg: "rgba(168,85,247,.15)" },
  { label: "Shipping", color: "var(--ne-warning)", bg: "var(--ne-warning-soft)" },
  { label: "Delivery Attempt Failed", color: "var(--ne-orange)", bg: "var(--ne-orange-soft)" },
  { label: "Delivered", color: "var(--ne-success)", bg: "var(--ne-success-soft)" },
];
const statusMeta = (label) => DEX_STATUSES.find(s => s.label === label) || { color: "var(--ne-muted-2)", bg: "var(--ne-surface)" };

export default function BookedOrders({ ordersData, setOrdersData, storeId, ordersStore, cfUrl }) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [trackingModal, setTrackingModal] = useState(null); // { order, timeline, status }
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState(null);
  const [excelShipments, setExcelShipments] = useState([]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    fetchAllDexShipments(storeId).then(setExcelShipments).catch(() => setExcelShipments([]));
  }, [storeId]);

  const isDexConnected = !!ordersStore?.dex_seller_id;

  const excelByOrderRef = useMemo(() => {
    const map = {};
    excelShipments.forEach((s) => {
      const ref = extractOrderRef(s.external_order_id);
      if (ref) map[ref] = s;
    });
    return map;
  }, [excelShipments]);

  // Live Dex API data (order_statuses.dex_*) hamesha priority leta hai; Excel-uploaded
  // data sirf tab tak stand-in hai jab tak live shipment na bane
  const getBookedInfo = (o) => {
    if (o.agent_data?.dex_package_code) {
      return { trackingNumber: o.agent_data.dex_tracking_number, status: o.agent_data.dex_status || "Processing", source: "live" };
    }
    const excel = excelByOrderRef[o.name];
    if (excel) {
      return { trackingNumber: excel.tracking_no, status: excel.logistics_current_status || "Processing", source: "excel" };
    }
    return null;
  };

  const bookedOrders = (ordersData || []).filter(o => getBookedInfo(o) !== null);
  const eligibleOrders = (ordersData || []).filter(o => o.agent_status === "Approved" && getBookedInfo(o) === null);

  const tabCounts = { All: bookedOrders.length };
  DEX_STATUSES.forEach(s => { tabCounts[s.label] = bookedOrders.filter(o => getBookedInfo(o)?.status === s.label).length; });
  const filteredBooked = statusFilter === "All" ? bookedOrders : bookedOrders.filter(o => getBookedInfo(o)?.status === statusFilter);

  const buildShipmentPayload = (order) => {
    const agentData = order.agent_data || {};
    const receiverName = agentData.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
    const phone = agentData.phone || order.customer?.phone || order.shipping_address?.phone || "";
    const address = agentData.address || order.shipping_address?.address1 || "";
    const city = agentData.city || order.shipping_address?.city || "";
    return {
      store_id: storeId,
      order_id: order.id,
      packageType: "Sales_order",
      externalOrderId: order.name,
      platformOrderCreationTime: order.created_at,
      dangerousGood: false,
      items: (order.line_items || []).map(li => ({ name: li.title, sku: li.sku || "", quantity: li.quantity || 1, price: String(li.price || "0") })),
      destination: { name: receiverName, phone, address, city },
      payment: { totalAmount: order.total_price || "0", currency: "PKR", paymentType: "COD" },
      deliveryOption: "standard",
    };
  };

  const createShipment = async (order) => {
    setError("");
    setBusyOrderId(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/dex-create-shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(buildShipmentPayload(order)),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setBusyOrderId(null); return; }
      setOrdersData?.(prev => prev.map(o => o.id === order.id
        ? { ...o, agent_data: { ...o.agent_data, dex_package_code: data.packageCode, dex_tracking_number: data.trackingNumber, dex_status: "Processing" } }
        : o
      ));
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
  };

  const printAwb = async (order) => {
    setError("");
    setBusyOrderId(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ store_id: storeId, package_code: order.agent_data.dex_package_code }).toString();
      const res = await fetch(`${cfUrl}/dex-print-awb?${qs}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setBusyOrderId(null); return; }
      const url = data.url || data.data?.url || data.pdfUrl;
      if (url) window.open(url, "_blank");
      else setError("AWB URL response mein nahi mila — raw response: " + JSON.stringify(data));
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
  };

  const trackShipment = async (order) => {
    setError("");
    setBusyOrderId(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const trackingNumber = order.agent_data?.dex_tracking_number || getBookedInfo(order)?.trackingNumber;
      const qs = new URLSearchParams({ store_id: storeId, tracking_number: trackingNumber, order_id: String(order.id) }).toString();
      const res = await fetch(`${cfUrl}/dex-track-shipment?${qs}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setBusyOrderId(null); return; }
      const mappedStatus = data.mappedStatus || "Processing";
      setOrdersData?.(prev => prev.map(o => o.id === order.id ? { ...o, agent_data: { ...o.agent_data, dex_status: mappedStatus } } : o));
      setTrackingModal({ order, timeline: data.timeline || data.data?.timeline || [], status: mappedStatus });
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
  };

  const doCancelShipment = async () => {
    const order = cancelConfirmOrder;
    if (!order) return;
    setBusyOrderId(order.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${cfUrl}/dex-cancel-shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ store_id: storeId, order_id: order.id, payload: { packageCode: order.agent_data.dex_package_code } }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setBusyOrderId(null);
        setCancelConfirmOrder(null);
        return;
      }
      setOrdersData?.(prev => prev.map(o => o.id === order.id
        ? { ...o, agent_data: { ...o.agent_data, dex_package_code: null, dex_tracking_number: null, dex_status: null } }
        : o
      ));
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
    setCancelConfirmOrder(null);
  };

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" };
  const btnStyle = (bg, color) => ({ padding: "6px 12px", borderRadius: 8, border: "none", background: bg, color, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" });

  // Live connection na ho tab bhi Excel-uploaded data agar mila ho to page dikhega
  // (temporary bridge) — sirf tab block karo jab dono me se koi bhi source na ho
  if (!isDexConnected && excelShipments.length === 0) {
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🚚 Booked Orders</h1>
        <div style={{ marginTop: "1.5rem", background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          Daraz Express (Dex) abhi connected nahi hai. Pehle <strong>Courier Connect</strong> page se connect karo (ya Excel data upload karo).
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🚚 Booked Orders</h1>
      <p style={{ margin: "2px 0 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>Daraz Express (Dex)</p>

      {error && (
        <div style={{ marginTop: 12, background: "var(--ne-danger-soft)", border: "1px solid var(--ne-danger)", color: "var(--ne-danger)", padding: "10px 14px", borderRadius: 9, fontSize: 12 }}>
          ❌ {error}
        </div>
      )}

      {/* Status Filter Tabs */}
      <div style={{ display: "flex", gap: 7, margin: "1rem 0", flexWrap: "wrap" }}>
        {["All", ...DEX_STATUSES.map(s => s.label)].map(tab => (
          <button key={tab} onClick={() => setStatusFilter(tab)}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 11.5, cursor: "pointer", fontWeight: 700, border: "1px solid",
              borderColor: statusFilter === tab ? "transparent" : "var(--ne-border)",
              background: statusFilter === tab ? "var(--ne-grad)" : "var(--ne-surface-2)",
              color: statusFilter === tab ? "#fff" : "var(--ne-muted)" }}>
            {tab}
            <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: statusFilter === tab ? "rgba(255,255,255,0.22)" : "var(--ne-bg)",
              color: statusFilter === tab ? "#fff" : "var(--ne-muted-2)" }}>
              {tabCounts[tab] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Booked Orders */}
      {filteredBooked.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>Is filter mein koi booked order nahi.</div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: "1.5rem" }}>
          {filteredBooked.map(o => {
            const info = getBookedInfo(o);
            const status = info?.status || "Processing";
            const meta = statusMeta(status);
            const receiverName = o.agent_data?.customer_name || `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim();
            const phone = o.agent_data?.phone || o.customer?.phone || o.shipping_address?.phone || "";
            return (
              <div key={o.id} style={{ ...cardStyle, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ne-text)" }}>{o.name}</span>
                    <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: meta.bg, color: meta.color }}>{status}</span>
                    {info?.source === "excel" && (
                      <span title="Excel upload se aaya hai — live API bind hone tak temporary data"
                        style={{ padding: "2px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "var(--ne-accent-soft)", color: "var(--ne-accent)" }}>
                        📊 Excel
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ne-muted)", marginTop: 3 }}>
                    Tracking: {info?.trackingNumber || "—"} · {receiverName || "—"} · {phone || "—"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--ne-muted-2)", marginTop: 2 }}>Delivery Option: Standard</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button disabled={busyOrderId === o.id} onClick={() => printAwb(o)} style={btnStyle("var(--ne-success-soft)", "var(--ne-success)")}>🖨️ Print AWB</button>
                  <button disabled={busyOrderId === o.id} onClick={() => trackShipment(o)} style={btnStyle("var(--ne-accent-soft)", "var(--ne-accent)")}>📍 Track</button>
                  <button disabled={busyOrderId === o.id} onClick={() => setCancelConfirmOrder(o)} style={btnStyle("var(--ne-danger-soft)", "var(--ne-danger)")}>✕ Cancel</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Eligible Orders */}
      <h2 style={{ fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, margin: "1.25rem 0 0.75rem" }}>✅ Shipment Banane ke liye Eligible ({eligibleOrders.length})</h2>
      {eligibleOrders.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>Koi approved order nahi jiske liye shipment banayi ja sake.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {eligibleOrders.map(o => (
            <div key={o.id} style={{ ...cardStyle, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ne-text)" }}>{o.name}</div>
                <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>
                  {o.agent_data?.customer_name || `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim()} · Rs. {Number(o.total_price).toLocaleString()}
                </div>
              </div>
              <button disabled={busyOrderId === o.id} onClick={() => createShipment(o)} style={btnStyle("var(--ne-grad)", "#fff")}>
                {busyOrderId === o.id ? "⏳..." : "+ Create Shipment"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tracking Timeline Modal */}
      {trackingModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 460, maxWidth: "94vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>📍 Tracking — {trackingModal.order.name}</h2>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>
                Status: <span style={{ color: statusMeta(trackingModal.status).color, fontWeight: 700 }}>{trackingModal.status}</span>
              </p>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              {trackingModal.timeline.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--ne-muted-2)", fontSize: 12 }}>Koi timeline data nahi mila.</div>
              ) : (
                trackingModal.timeline.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "var(--ne-accent)", flexShrink: 0 }}>●</span>
                    <div>
                      <div style={{ color: "var(--ne-text)", fontWeight: 600 }}>{t.status || t.description || JSON.stringify(t)}</div>
                      {(t.time || t.timestamp) && <div style={{ color: "var(--ne-muted-2)" }}>{t.time || t.timestamp}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setTrackingModal(null)}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelConfirmOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000000 }}>
          <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 16, width: 380, maxWidth: "94vw", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ne-border)" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--ne-text)" }}>✕ Cancel Shipment</h2>
            </div>
            <div style={{ padding: "14px 18px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--ne-muted)" }}>
                <strong style={{ color: "var(--ne-text)" }}>{cancelConfirmOrder.name}</strong> ka Dex shipment cancel karna chahte ho?
              </p>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ne-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setCancelConfirmOrder(null)} disabled={busyOrderId === cancelConfirmOrder.id}
                style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--ne-border)", background: "transparent", color: "var(--ne-muted)", fontSize: 12, cursor: "pointer" }}>
                Wapas
              </button>
              <button onClick={doCancelShipment} disabled={busyOrderId === cancelConfirmOrder.id}
                style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--ne-danger)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {busyOrderId === cancelConfirmOrder.id ? "Cancel ho raha hai..." : "✕ Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
