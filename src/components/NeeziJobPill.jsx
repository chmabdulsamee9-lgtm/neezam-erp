// Floating pill shown while Neezi sets up a store and the setup window is closed. Click it to open the window again.
import { useNeeziJob, setNeeziOpen, clearNeeziJob, isNeeziBusy } from "../lib/neeziJob";

export default function NeeziJobPill({ onOpen }) {
  const job = useNeeziJob();
  if (!job || job.open || job.phase === "choose") return null;
  const busy = isNeeziBusy(job);
  const last = [...job.timeline].reverse().find((s) => s.status !== "info") || job.timeline[job.timeline.length - 1];
  const text = job.phase === "done" ? "Neezi finished your store setup" : job.phase === "review" ? "Neezi is waiting for your review" : job.error && !busy ? "Neezi needs your attention" : last?.text || "Neezi is working…";
  const pct = Math.round(job.percent || 0);
  return (
    <div role="status" style={{ position: "fixed", right: 18, bottom: 18, zIndex: 2900, width: 300, background: "var(--ne-surface-2)", border: "1px solid var(--ne-border)", borderRadius: 14, boxShadow: "0 12px 34px rgba(0,0,0,.28)", padding: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--ne-grad)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{pct}%</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>Neezi store setup · {job.storeName || ""}</div>
          <div style={{ fontSize: 11.5, color: "var(--ne-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</div>
        </div>
        {!busy && <button aria-label="Dismiss" onClick={clearNeeziJob} style={{ background: "transparent", border: 0, color: "var(--ne-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "var(--ne-border)", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--ne-grad)", transition: "width .6s" }} /></div>
      <button onClick={() => { setNeeziOpen(true); onOpen?.(); }} style={{ background: "transparent", border: "1px solid var(--ne-border)", borderRadius: 9, padding: "6px 10px", color: "var(--ne-text)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{job.phase === "review" ? "Review now" : job.phase === "done" ? "See what Neezi did" : "Open"}</button>
    </div>
  );
}
