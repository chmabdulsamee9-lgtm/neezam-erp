import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// Phones: the app scrolls inside its own boxes, so the browser's own pull-to-refresh never fires.
// Pull down while every scrolling box under your finger (and the page) is at its top, past the threshold, and let go:
// the page reloads. Works whichever box scrolls (the content area, a list, or the page itself).
const THRESHOLD = 70; // finger distance in px

const scrollsY = (el) => {
  const s = getComputedStyle(el);
  return /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
};
function atTop(target) {
  if ((window.scrollY || document.documentElement.scrollTop || 0) > 0) return false;
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (scrollsY(el) && el.scrollTop > 0) return false;
  }
  return true;
}

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(null);
  const pullRef = useRef(0);
  const set = (v) => { pullRef.current = v; setPull(v); };

  useEffect(() => {
    const onStart = (e) => {
      start.current = null;
      if (e.touches.length !== 1) return;
      const t = e.target;
      if (t.closest?.(".ne-sheet, [role='dialog'], input, textarea, select, .ne-filterpanel, .ne-popover")) return;
      if (!atTop(t)) return;
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, target: t };
    };
    const onMove = (e) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy || !atTop(start.current.target)) { set(0); return; }
      set(Math.min(130, dy));
    };
    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD) { setRefreshing(true); setTimeout(() => window.location.reload(), 200); }
      else set(0);
    };
    document.addEventListener("touchstart", onStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onMove, { passive: true, capture: true });
    document.addEventListener("touchend", onEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onEnd, { passive: true, capture: true });
    return () => {
      document.removeEventListener("touchstart", onStart, { capture: true });
      document.removeEventListener("touchmove", onMove, { capture: true });
      document.removeEventListener("touchend", onEnd, { capture: true });
      document.removeEventListener("touchcancel", onEnd, { capture: true });
    };
  }, []);

  if (pull < 8 && !refreshing) return null;
  const ready = refreshing || pull >= THRESHOLD;
  return (
    <div className={`ne-ptr${refreshing ? " spin" : ""}${ready ? " ready" : ""}`}
      style={{ opacity: refreshing ? 1 : Math.min(1, pull / 50), transform: `translateY(${refreshing ? 24 : pull * 0.45}px) rotate(${refreshing ? 0 : pull * 2.6}deg)` }} aria-hidden="true">
      <Icon name={ready ? "refresh" : "chevronDown"} size={16} />
    </div>
  );
}
