import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// Phones: the app scrolls inside .ne-content, so the browser's own pull-to-refresh never fires.
// Pull down from the very top of the page by more than THRESHOLD px and let go: the page reloads.
const THRESHOLD = 80;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(null);
  const pullRef = useRef(0);
  const set = (v) => { pullRef.current = v; setPull(v); };

  useEffect(() => {
    const scroller = () => document.querySelector(".ne-content");
    const onStart = (e) => {
      const el = scroller();
      if (!el || el.scrollTop > 0 || e.touches.length !== 1) { start.current = null; return; }
      if (e.target.closest?.(".ne-sheet, [role='dialog'], input, textarea, select")) { start.current = null; return; }
      start.current = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (start.current === null) return;
      const el = scroller();
      const dy = e.touches[0].clientY - start.current;
      if (!el || el.scrollTop > 0 || dy <= 0) { set(0); return; }
      set(Math.min(140, dy * 0.6));
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD * 0.6) { setRefreshing(true); setTimeout(() => window.location.reload(), 250); }
      else set(0);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);

  if (!pull && !refreshing) return null;
  const ready = refreshing || pull >= THRESHOLD * 0.6;
  return (
    <div className={`ne-ptr${refreshing ? " spin" : ""}`} style={{ opacity: Math.min(1, pull / 40) || 1, transform: `translateY(${refreshing ? 20 : pull / 2}px) rotate(${refreshing ? 0 : pull * 3}deg)` }} aria-hidden="true">
      <Icon name={ready ? "refresh" : "chevronDown"} size={16} />
    </div>
  );
}
