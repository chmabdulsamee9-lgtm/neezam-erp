import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";

const BATCH_SIZE = 1000;

async function fetchAllShipments(storeId) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("dex_shipments_import")
      .select("*")
      .eq("store_id", storeId)
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  return allRows;
}

const fmtHours = (h) => {
  if (h == null || isNaN(h)) return "—";
  const days = Math.floor(h / 24);
  const hrs = Math.round(h % 24);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${h.toFixed(1)}h`;
};

export default function CourierDashboard({ storeId }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    setErrorMsg("");
    fetchAllShipments(storeId)
      .then(setShipments)
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  }, [storeId]);

  const stats = useMemo(() => {
    const total = shipments.length;
    const delivered = shipments.filter((s) => s.delivered_time).length;
    const returned = shipments.filter((s) => s.return_success_time || s.failed_return_time).length;
    const pending = total - delivered - returned;
    const successRate = total ? Math.round((delivered / total) * 100) : 0;

    const deliveryDurations = shipments
      .filter((s) => s.delivered_time && s.package_created_time)
      .map((s) => (new Date(s.delivered_time) - new Date(s.package_created_time)) / 3600000)
      .filter((h) => h >= 0);
    const avgDeliveryHours = deliveryDurations.length
      ? deliveryDurations.reduce((a, b) => a + b, 0) / deliveryDurations.length
      : null;

    const reasonCounts = {};
    const reasonCols = [
      "failed_pickup_reason",
      "first_failed_delivery_attempt_reason",
      "second_failed_delivery_attempt_reason",
      "third_failed_delivery_attempt_reason",
      "fourth_failed_delivery_attempt_reason",
    ];
    shipments.forEach((s) => {
      reasonCols.forEach((col) => {
        const reason = s[col];
        if (reason) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });
    });
    const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const cityMap = {};
    shipments.forEach((s) => {
      const city = s.receiver_level3_address || "Unknown";
      if (!cityMap[city]) cityMap[city] = { total: 0, delivered: 0 };
      cityMap[city].total++;
      if (s.delivered_time) cityMap[city].delivered++;
    });
    const topCities = Object.entries(cityMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([city, v]) => ({ city, ...v, rate: v.total ? Math.round((v.delivered / v.total) * 100) : 0 }));

    const statusCounts = {};
    shipments.forEach((s) => {
      const status = s.logistics_current_status || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    const statusFunnel = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

    return { total, delivered, returned, pending, successRate, avgDeliveryHours, topReasons, topCities, statusFunnel };
  }, [shipments]);

  if (loading) {
    return <div style={{ padding: "3rem", textAlign: "center", color: "var(--ne-muted)" }}>Loading courier data...</div>;
  }

  if (errorMsg) {
    return <div style={{ padding: "1.5rem", color: "var(--ne-danger)", fontSize: 13 }}>{errorMsg}</div>;
  }

  if (stats.total === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--ne-muted)" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
        <p>Abhi koi Dex shipment data nahi mila. "Courier Connect" page se Excel upload karo.</p>
      </div>
    );
  }

  const heroChips = [
    { label: "Total Shipments", value: stats.total },
    { label: "Delivered", value: stats.delivered },
    { label: "Returned/Failed", value: stats.returned },
    { label: "Pending/In-Transit", value: stats.pending },
    { label: "Avg Delivery Time", value: fmtHours(stats.avgDeliveryHours) },
  ];

  return (
    <div style={{ padding: "1rem", color: "var(--ne-text)" }}>
      {/* Hero */}
      <div style={{ background: "var(--ne-grad)", borderRadius: 18, padding: "1.4rem", marginBottom: "0.75rem", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", fontWeight: 600, marginBottom: 4 }}>Success Rate</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#fff" }}>{stats.successRate}%</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {heroChips.map((chip) => (
            <div key={chip.label} style={{ background: "rgba(255,255,255,.16)", borderRadius: 10, padding: "8px 14px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{chip.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", fontWeight: 600, whiteSpace: "nowrap" }}>{chip.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {/* Status Funnel */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>📋 Status Funnel</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {stats.statusFunnel.map(([status, count]) => {
              const p = stats.total ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{status}</span>
                  <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, background: "var(--ne-grad)", height: "100%", borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 55, textAlign: "right", fontWeight: 600 }}>{count} ({p}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Failed Reason Breakdown */}
        <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
          <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>⚠️ Failed Delivery Reasons</h2>
          {stats.topReasons.length === 0 ? (
            <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi failed-attempt data nahi</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {stats.topReasons.map(([reason, count]) => {
                const p = stats.total ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={reason} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{reason}</span>
                    <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, background: "var(--ne-danger)", height: "100%", borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 30, textAlign: "right", fontWeight: 600 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* City Performance */}
      <div style={{ background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "1rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600 }}>🗺️ City Performance</h2>
        {stats.topCities.length === 0 ? (
          <p style={{ color: "var(--ne-muted-2)", fontSize: 12 }}>Koi data nahi</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {stats.topCities.map(({ city, total, delivered, rate }) => (
              <div key={city} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--ne-text)", minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{city}</span>
                <div style={{ flex: 1, background: "var(--ne-bg)", borderRadius: 999, height: 12, overflow: "hidden" }}>
                  <div style={{ width: `${rate}%`, background: "var(--ne-grad)", height: "100%", borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--ne-muted)", minWidth: 110, textAlign: "right", fontWeight: 600 }}>
                  {delivered}/{total} delivered ({rate}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
