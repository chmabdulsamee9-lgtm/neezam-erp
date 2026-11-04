import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "./Icon";

// Online Store speed + traffic strip: one rounded card, date filter on the left, metric cells in a horizontally
// scrollable row with arrow buttons. Every value comes from the worker (/get-performance-stats); a metric with no
// data says "No data yet", nothing is invented.

export const RANGES = [7, 30, 90];

// Core Web Vitals bands (good / needs improvement), see web.dev/vitals
const BANDS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };
export function bandOf(kind, value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const [good, mid] = BANDS[kind];
  return value <= good ? "good" : value <= mid ? "moderate" : "poor";
}
const BAND_COLOR = { good: "var(--ne-success)", moderate: "var(--ne-warning)", poor: "var(--ne-danger)" };

function Chip({ band, t }) {
  if (!band) return null;
  return (
    <span style={{ display: "inline-block", marginTop: 6, padding: "2px 8px", borderRadius: 8, fontSize: 10.5, fontWeight: 700, color: BAND_COLOR[band], border: `1px solid ${BAND_COLOR[band]}` }}>
      {t(`onlineStore.status_${band}`)}
    </span>
  );
}

// lowerIsBetter: for LCP / INP / CLS a rise is bad
function Trend({ pct, lowerIsBetter, t }) {
  if (pct == null) return <span style={{ fontSize: 11.5, color: "var(--ne-muted)" }}>{t("onlineStore.noComparison")}</span>;
  const up = pct > 0, flat = pct === 0;
  const good = flat ? null : lowerIsBetter ? !up : up;
  const color = good == null ? "var(--ne-muted)" : good ? "var(--ne-success)" : "var(--ne-danger)";
  return (
    <span title={t("onlineStore.vsPrevious")} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 700, color }}>
      {!flat && <Icon name={up ? "arrowUp" : "arrowDown"} size={11} />}{Math.abs(pct)}%
    </span>
  );
}

function Sparkline({ series }) {
  const pts = series.map((p, i) => ({ i, v: p.value })).filter((p) => p.v != null);
  if (pts.length < 2) return null;
  const W = 120, H = 28, max = Math.max(...pts.map((p) => p.v)), min = Math.min(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i) => (i / Math.max(1, series.length - 1)) * W;
  const y = (v) => H - 3 - ((v - min) / span) * (H - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" style={{ display: "block", marginTop: 6, maxWidth: "100%" }}>
      <polyline fill="none" stroke="var(--ne-accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} />
    </svg>
  );
}

const cell = { flex: "0 0 auto", minWidth: 190, padding: "14px 18px", borderLeft: "1px solid var(--ne-border)", scrollSnapAlign: "start", boxSizing: "border-box" };
const label = { margin: "0 0 6px", fontSize: 11.5, fontWeight: 700, color: "var(--ne-muted)" };
const big = { margin: 0, fontSize: 20, fontWeight: 800, color: "var(--ne-text)", lineHeight: 1.2 };
const small = { fontSize: 12, fontWeight: 600, color: "var(--ne-muted)" };

const Skel = ({ w = 80, h = 18 }) => <div aria-hidden="true" style={{ width: w, height: h, borderRadius: 6, background: "var(--ne-border)", opacity: 0.6, marginTop: 4 }} />;
const NoData = ({ t }) => <p style={{ margin: 0, fontSize: 13, color: "var(--ne-muted)" }}>{t("onlineStore.noDataYet")}</p>;

export default function StoreMetricsStrip({ range, onRange, stats, loading, error, onRetry, t }) {
  const rowRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    const start = pos > 1, end = pos < max - 1;
    setCanLeft(rtl ? end : start);
    setCanRight(rtl ? start : end);
  }, []);
  useEffect(() => {
    measure();
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, stats, loading]);
  const scrollBy = (dir) => rowRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });

  const cur = stats?.current;
  const prev = stats?.change || {};
  const dev = cur?.devices || { mobile: 0, desktop: 0, tablet: 0, other: 0 };
  const devTotal = dev.mobile + dev.desktop + dev.tablet + dev.other;
  const devRows = [["mobile", dev.mobile], ["desktop", dev.desktop], ["tablet", dev.tablet], ["other", dev.other]];
  const devMax = Math.max(...devRows.map((r) => r[1]));
  const hasDevice = !!stats && stats.device_supported !== false && devTotal > 0;

  const metricCell = (key, labelText, value, unit, kind, changePct) => (
    <div key={key} style={cell} role="group" aria-label={labelText}>
      <p style={label}>{labelText}</p>
      {loading ? <Skel w={110} h={22} /> : value == null ? <NoData t={t} /> : (
        <>
          <p style={big}>{value} <span style={small}>{unit}</span></p>
          <div style={{ marginTop: 4 }}><Trend pct={changePct} lowerIsBetter t={t} /></div>
          <Chip band={bandOf(kind, Number(value))} t={t} />
        </>
      )}
    </div>
  );

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "stretch", background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ flex: "0 0 auto", padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="calendar" size={16} />
          <select aria-label={t("onlineStore.rangeLabel")} value={range} onChange={(e) => onRange(Number(e.target.value))}
            style={{ background: "var(--ne-bg)", color: "var(--ne-text)", border: "1px solid var(--ne-border)", borderRadius: 9, padding: "7px 10px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {RANGES.map((d) => <option key={d} value={d}>{t(`onlineStore.range${d}`)}</option>)}
          </select>
        </div>
        <div ref={rowRef} onScroll={measure} tabIndex={0} aria-label={t("onlineStore.metricsLabel")}
          style={{ flex: "1 1 0", minWidth: 0, display: "flex", overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {metricCell("lcp", t("onlineStore.mLcp"), cur?.lcp_p75 != null ? Math.round(cur.lcp_p75) : null, t("onlineStore.unitMs"), "lcp", prev.lcp)}
          {metricCell("inp", t("onlineStore.mInp"), cur?.inp_p75 != null ? Math.round(cur.inp_p75) : null, t("onlineStore.unitMs"), "inp", prev.inp)}
          <div style={cell} role="group" aria-label={t("onlineStore.mCls")}>
            <p style={label}>{t("onlineStore.mCls")}</p>
            {loading ? <Skel w={70} h={22} /> : cur?.cls_p75 == null ? <NoData t={t} /> : (
              <>
                <p style={big}>{Number(cur.cls_p75).toFixed(3)}</p>
                <div style={{ marginTop: 4 }}><Trend pct={prev.cls} lowerIsBetter t={t} /></div>
                <Sparkline series={stats.cls_series || []} />
                <Chip band={bandOf("cls", Number(cur.cls_p75))} t={t} />
              </>
            )}
          </div>
          <div style={cell} role="group" aria-label={t("onlineStore.mSessions")}>
            <p style={label}>{t("onlineStore.mSessions")}</p>
            {loading ? <Skel w={60} h={22} /> : !cur || cur.sessions === 0 ? <NoData t={t} /> : (
              <>
                <p style={big}>{cur.sessions}</p>
                <div style={{ marginTop: 4 }}><Trend pct={prev.sessions} t={t} /></div>
              </>
            )}
          </div>
          <div style={{ ...cell, minWidth: 230 }} role="group" aria-label={t("onlineStore.mDevices")}>
            <p style={label}>{t("onlineStore.mDevices")}</p>
            {loading ? <Skel w={140} h={60} /> : !hasDevice ? (
              <>
                <NoData t={t} />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ne-muted)" }}>{t("onlineStore.deviceHint")}</p>
              </>
            ) : (
              <div style={{ display: "grid", gap: 5 }}>
                {devRows.map(([k, n]) => (
                  <div key={k}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: "var(--ne-text)" }}>
                      <span>{t(`onlineStore.dev_${k}`)}</span><span style={{ fontWeight: 700 }}>{n}</span>
                    </div>
                    {n === devMax && n > 0 && (
                      <div aria-hidden="true" style={{ height: 4, borderRadius: 4, background: "var(--ne-border)", marginTop: 3 }}>
                        <div style={{ width: `${Math.round((n / devTotal) * 100)}%`, height: "100%", borderRadius: 4, background: "var(--ne-accent)" }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 4, padding: "0 10px", borderLeft: "1px solid var(--ne-border)" }}>
          <button type="button" onClick={() => scrollBy(-1)} disabled={!canLeft} aria-label={t("onlineStore.scrollLeft")} title={t("onlineStore.scrollLeft")}
            style={{ background: "none", border: "none", padding: 6, borderRadius: 8, color: "var(--ne-text)", cursor: canLeft ? "pointer" : "default", opacity: canLeft ? 1 : 0.3 }}><Icon name="chevronLeft" size={16} /></button>
          <button type="button" onClick={() => scrollBy(1)} disabled={!canRight} aria-label={t("onlineStore.scrollRight")} title={t("onlineStore.scrollRight")}
            style={{ background: "none", border: "none", padding: 6, borderRadius: 8, color: "var(--ne-text)", cursor: canRight ? "pointer" : "default", opacity: canRight ? 1 : 0.3 }}><Icon name="chevronRight" size={16} /></button>
        </div>
      </div>
      {error && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 12.5, color: "var(--ne-danger)" }}>
          <span>{error}</span>
          <button type="button" onClick={onRetry} style={{ background: "transparent", color: "var(--ne-text)", border: "1px solid var(--ne-border)", borderRadius: 9, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("onlineStore.retry")}</button>
        </div>
      )}
    </div>
  );
}
