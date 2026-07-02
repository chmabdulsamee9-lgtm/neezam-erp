import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function CourierTracking({ ordersData, setOrdersData, storeId, ordersStore, cfUrl }) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isDexConnected = !!ordersStore?.dex_access_token;

  const eligibleOrders = (ordersData || []).filter(o => o.agent_status === "Approved" && !o.agent_data?.dex_shipment_id);
  const activeShipments = (ordersData || []).filter(o => o.agent_data?.dex_shipment_id);

  const callDex = async (path, params) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${cfUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ store_id: storeId, params }),
    });
    return res.json();
  };

  // dex_* fields order_statuses table mein persist karta hai aur local ordersData bhi update karta hai
  const persistDexFields = async (order, patch) => {
    const existing = order.agent_data || {};
    const now = new Date().toISOString();
    await supabase.from("order_statuses").upsert({
      order_id: String(order.id),
      status: order.agent_status || null,
      customer_name: existing.customer_name || null,
      phone: existing.phone || null,
      address: existing.address || null,
      city: existing.city || null,
      discount: existing.discount || null,
      notes: existing.notes || null,
      product: existing.product || null,
      sku: existing.sku || null,
      shipping: existing.shipping || null,
      remarks: existing.remarks || null,
      cancellation_reason: existing.cancellation_reason || null,
      dex_shipment_id: patch.dex_shipment_id !== undefined ? patch.dex_shipment_id : (existing.dex_shipment_id || null),
      dex_tracking_number: patch.dex_tracking_number !== undefined ? patch.dex_tracking_number : (existing.dex_tracking_number || null),
      dex_status: patch.dex_status !== undefined ? patch.dex_status : (existing.dex_status || null),
      updated_at: now,
      last_edited_at: now,
    }, { onConflict: "order_id" });

    setOrdersData?.(prev => prev.map(o => o.id === order.id
      ? { ...o, agent_data: { ...existing, ...patch }, last_edited_at: now }
      : o
    ));
  };

  const createShipment = async (order) => {
    setError("");
    setBusyOrderId(order.id);
    try {
      const agentData = order.agent_data || {};
      const customerName = agentData.customer_name || `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();
      const phone = agentData.phone || order.customer?.phone || order.shipping_address?.phone || "";
      const address = agentData.address || order.shipping_address?.address1 || "";
      const city = agentData.city || order.shipping_address?.city || "";
      const codAmount = order.total_price || "0";

      // ⚠️ Yeh param names DEX_API_PATHS.createOrder jaisa hi placeholder hain — Daraz docs se confirm karo
      const data = await callDex("/dex-create-order", {
        order_reference: order.name,
        customer_name: customerName,
        phone,
        address,
        city,
        cod_amount: codAmount,
      });

      if (data.error) {
        setError(data.error);
        setBusyOrderId(null);
        return;
      }

      await persistDexFields(order, {
        dex_shipment_id: data.order_id || data.trade_order_id || data.shipment_id || JSON.stringify(data),
        dex_tracking_number: data.tracking_number || data.awb_no || null,
        dex_status: data.status || "created",
      });
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
  };

  const refreshTracking = async (order) => {
    setError("");
    setBusyOrderId(order.id);
    try {
      const data = await callDex("/dex-track-shipment", { shipment_id: order.agent_data.dex_shipment_id });
      if (data.error) {
        setError(data.error);
        setBusyOrderId(null);
        return;
      }
      await persistDexFields(order, { dex_status: data.status || data.order_status || JSON.stringify(data) });
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
  };

  const printAwb = async (order) => {
    setError("");
    setBusyOrderId(order.id);
    try {
      const data = await callDex("/dex-print-awb", { shipment_id: order.agent_data.dex_shipment_id });
      if (data.error) {
        setError(data.error);
        setBusyOrderId(null);
        return;
      }
      const url = data.pdf_url || data.document_url || data.url;
      if (url) window.open(url, "_blank");
      else setError("AWB URL response mein nahi mila — raw response: " + JSON.stringify(data));
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
  };

  const cancelShipment = async (order) => {
    if (!window.confirm(`${order.name} ka Dex shipment cancel karna chahte ho?`)) return;
    setError("");
    setBusyOrderId(order.id);
    try {
      const data = await callDex("/dex-cancel-shipment", { shipment_id: order.agent_data.dex_shipment_id });
      if (data.error) {
        setError(data.error);
        setBusyOrderId(null);
        return;
      }
      await persistDexFields(order, { dex_shipment_id: null, dex_tracking_number: null, dex_status: null });
    } catch (err) {
      setError(err.message);
    }
    setBusyOrderId(null);
  };

  const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.18)" };
  const btnStyle = (bg, color) => ({ padding: "6px 12px", borderRadius: 8, border: "none", background: bg, color, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" });

  if (!isDexConnected) {
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🚚 Courier Tracking</h1>
        <div style={{ marginTop: "1.5rem", background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          Daraz Express (Dex) abhi connected nahi hai. Pehle <strong>Store Connect</strong> page se connect karo.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🚚 Courier Tracking</h1>
      <p style={{ margin: "2px 0 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>Daraz Express (Dex)</p>

      {error && (
        <div style={{ marginTop: 12, background: "var(--ne-danger-soft)", border: "1px solid var(--ne-danger)", color: "var(--ne-danger)", padding: "10px 14px", borderRadius: 9, fontSize: 12 }}>
          ❌ {error}
        </div>
      )}

      {/* Active Shipments */}
      <h2 style={{ fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, margin: "1.25rem 0 0.75rem" }}>📦 Active Shipments ({activeShipments.length})</h2>
      {activeShipments.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--ne-muted-2)", fontSize: 12 }}>Abhi koi shipment nahi bani.</div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: "1.5rem" }}>
          {activeShipments.map(o => (
            <div key={o.id} style={{ ...cardStyle, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ne-text)" }}>{o.name}</div>
                <div style={{ fontSize: 11, color: "var(--ne-muted)" }}>
                  Tracking: {o.agent_data.dex_tracking_number || o.agent_data.dex_shipment_id} · Status: <span style={{ color: "var(--ne-accent)", fontWeight: 600 }}>{o.agent_data.dex_status || "—"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button disabled={busyOrderId === o.id} onClick={() => refreshTracking(o)} style={btnStyle("var(--ne-accent-soft)", "var(--ne-accent)")}>🔄 Refresh</button>
                <button disabled={busyOrderId === o.id} onClick={() => printAwb(o)} style={btnStyle("var(--ne-success-soft)", "var(--ne-success)")}>🖨️ Print AWB</button>
                <button disabled={busyOrderId === o.id} onClick={() => cancelShipment(o)} style={btnStyle("var(--ne-danger-soft)", "var(--ne-danger)")}>✕ Cancel</button>
              </div>
            </div>
          ))}
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
    </div>
  );
}
