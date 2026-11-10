import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { SkelCardList } from "../components/Skeletons";
import { useLanguage, useTranslation } from "../i18n";

const CF_URL = "https://neezam-erp.chmabdulsamee9.workers.dev";
const SCANNER_ELEMENT_ID = "returns-barcode-reader";

const cardStyle = { background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, padding: "14px 16px" };

export default function Returns({ storeId, ordersStore, cfUrl = CF_URL }) {
  const [lang] = useLanguage();
  const t = useTranslation(lang);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 760);

  const [pendingReturns, setPendingReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scannedResult, setScannedResult] = useState(null); // {return_id, order_id, order_number, line_items}

  const [condition, setCondition] = useState(null); // 'ok' | 'damaged'
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [receiveSuccess, setReceiveSuccess] = useState(null);

  const scannerRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const authedFetch = async (path, opts = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${cfUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, ...(opts.headers || {}) },
    });
    return res.json();
  };

  const loadPendingReturns = async () => {
    setLoading(true);
    setListError("");
    try {
      const data = await authedFetch(`/returns-list?store_id=${encodeURIComponent(storeId)}&status=pending_receipt`);
      if (data.error) setListError(data.error);
      else setPendingReturns(data.returns || []);
    } catch (err) {
      setListError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (storeId) loadPendingReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Camera lifecycle — html5-qrcode's Html5Qrcode class (not the pre-built widget) so the
  // surrounding UI (error banner, cancel button) stays in our own styling. Stops itself on
  // the first successful decode; cleanup on unmount/cancel always calls stop()+clear().
  useEffect(() => {
    if (!scanning) return;
    let qrInstance = null;
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        qrInstance = new Html5Qrcode(SCANNER_ELEMENT_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = qrInstance;
        await qrInstance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          async (decodedText) => {
            if (stopped) return;
            stopped = true;
            try { await qrInstance.stop(); } catch { /* already stopped */ }
            setScanning(false);
            handleScanned(decodedText);
          },
          () => { /* per-frame "no code found yet" — expected, not an error */ }
        );
      } catch (err) {
        setScanError(err.message || t("returns.cameraError"));
        setScanning(false);
      }
    })();
    return () => {
      stopped = true;
      if (qrInstance) {
        qrInstance.stop().then(() => qrInstance.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const startScan = () => {
    setScanError("");
    setScannedResult(null);
    setCondition(null);
    setReceiveError("");
    setReceiveSuccess(null);
    setScanning(true);
  };

  const handleScanned = async (scannedCode) => {
    setScanError("");
    try {
      const data = await authedFetch("/return-scan", {
        method: "POST",
        body: JSON.stringify({ scannedCode, storeId }),
      });
      if (data.error) { setScanError(data.error); return; }
      setScannedResult(data);
    } catch (err) {
      setScanError(err.message);
    }
  };

  const confirmReceive = async () => {
    if (!condition || !scannedResult) return;
    setReceiving(true);
    setReceiveError("");
    try {
      const data = await authedFetch("/return-receive", {
        method: "POST",
        body: JSON.stringify({ returnId: scannedResult.return_id, storeId, condition, notes: receiveNotes.trim() || null }),
      });
      if (data.error) { setReceiveError(data.error); setReceiving(false); return; }
      setReceiveSuccess({ condition, restocked_count: data.restocked_count || 0, credited_count: data.credited_count || 0 });
      setScannedResult(null);
      setCondition(null);
      setReceiveNotes("");
      await loadPendingReturns();
    } catch (err) {
      setReceiveError(err.message);
    }
    setReceiving(false);
  };

  const cancelScan = () => {
    setScanning(false);
    setScanError("");
  };

  if (!ordersStore?.shopify_url) {
    return (
      <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="undo" size={17} /> {t("returns.title")}</h1>
        <div style={{ ...cardStyle, marginTop: "1.5rem", textAlign: "center", color: "var(--ne-muted)" }}>
          {t("returns.connectStoreFirst")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "1rem" : "1.5rem", color: "var(--ne-text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Icon name="undo" size={17} /> {t("returns.title")}</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ne-muted)" }}>{ordersStore?.store_name} — {pendingReturns.length} {t("returns.pendingSuffix")}</p>
        </div>
        {!scanning && !scannedResult && (
          <button onClick={startScan}
            style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "var(--ne-grad)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Icon name="camera" size={14} /> {t("returns.scanToReceive")}
          </button>
        )}
      </div>

      {receiveSuccess && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "var(--ne-success-soft)", color: "var(--ne-success)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} />
          {receiveSuccess.condition === "ok"
            ? `${t("returns.receivedOkSummaryPrefix")} ${receiveSuccess.restocked_count} ${t("returns.restockedSuffix")}, ${receiveSuccess.credited_count} ${t("returns.creditedSuffix")}`
            : t("returns.receivedDamagedSummary")}
        </div>
      )}

      {scanning && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ne-text)" }}>{t("returns.scanningPrompt")}</span>
            <button onClick={cancelScan}
              style={{ background: "transparent", border: "1px solid var(--ne-border)", borderRadius: 7, color: "var(--ne-muted)", padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>
              {t("returns.cancelScan")}
            </button>
          </div>
          <div id={SCANNER_ELEMENT_ID} style={{ width: "100%", maxWidth: 420, margin: "0 auto", borderRadius: 10, overflow: "hidden" }} />
          {scanError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginTop: 10, textAlign: "center" }}>{scanError}</p>}
        </div>
      )}

      {!scanning && scanError && !scannedResult && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "var(--ne-danger-soft)", color: "var(--ne-danger)", fontSize: 12.5 }}>
          {scanError}
        </div>
      )}

      {scannedResult && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ne-text)" }}>#{scannedResult.order_number}</span>
            <button onClick={() => { setScannedResult(null); setCondition(null); }}
              style={{ background: "transparent", border: "none", color: "var(--ne-muted)", cursor: "pointer", display: "flex" }}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {(scannedResult.line_items || []).map((li, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--ne-muted)" }}>
                {li.quantity}x {li.title}{li.variant_title && li.variant_title !== "Default Title" ? ` — ${li.variant_title}` : ""}
                {li.sku && <span style={{ fontFamily: "monospace", color: "var(--ne-muted-2)" }}> ({li.sku})</span>}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={() => setCondition("ok")}
              style={{ flex: 1, minWidth: 160, padding: "10px", borderRadius: 9, border: condition === "ok" ? "2px solid var(--ne-success)" : "1px solid var(--ne-border)", background: condition === "ok" ? "var(--ne-success-soft)" : "transparent", color: condition === "ok" ? "var(--ne-success)" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              {t("returns.receivedOkButton")}
            </button>
            <button onClick={() => setCondition("damaged")}
              style={{ flex: 1, minWidth: 160, padding: "10px", borderRadius: 9, border: condition === "damaged" ? "2px solid var(--ne-danger)" : "1px solid var(--ne-border)", background: condition === "damaged" ? "var(--ne-danger-soft)" : "transparent", color: condition === "damaged" ? "var(--ne-danger)" : "var(--ne-text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              {t("returns.receivedDamagedButton")}
            </button>
          </div>

          {condition && (
            <>
              <textarea placeholder={t("returns.notesPlaceholder")} rows={2} value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ne-border)", background: "var(--ne-bg)", color: "var(--ne-text)", fontSize: 12, boxSizing: "border-box", marginBottom: 10, resize: "vertical", fontFamily: "inherit" }} />
              {receiveError && <p style={{ color: "var(--ne-danger)", fontSize: 12, marginBottom: 10 }}>{receiveError}</p>}
              <button onClick={confirmReceive} disabled={receiving}
                style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: receiving ? "var(--ne-border)" : "var(--ne-grad)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: receiving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {receiving ? t("returns.receiving") : (<><Icon name="check" size={13} /> {t("returns.confirmReceive")}</>)}
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ ...cardStyle }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ne-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="clock" size={13} /> {t("returns.pendingListTitle")}
        </h2>
        {listError && <p style={{ color: "var(--ne-danger)", fontSize: 12 }}>{listError}</p>}
        {loading ? (
          <SkelCardList n={3} />
        ) : pendingReturns.length === 0 ? (
          <p style={{ textAlign: "center", padding: "1.5rem", color: "var(--ne-muted-2)", fontSize: 12.5 }}>{t("returns.noPendingReturns")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingReturns.map((r) => (
              <div key={r.id} style={{ background: "var(--ne-surface)", border: "1px solid var(--ne-border)", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ne-text)" }}>#{r.order_number}</div>
                  {r.notes && <div style={{ fontSize: 11, color: "var(--ne-muted-2)", marginTop: 2 }}>{r.notes}</div>}
                </div>
                <span style={{ fontSize: 11, color: r.days_pending > 3 ? "var(--ne-warning)" : "var(--ne-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {r.days_pending} {t("returns.daysPendingSuffix")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
