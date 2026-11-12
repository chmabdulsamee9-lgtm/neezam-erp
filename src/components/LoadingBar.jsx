import { useEffect, useRef, useState } from "react";
import { subscribeLoading } from "../lib/loadingBar";

// Thin brand-gradient bar across the very top: grows quickly at first, slows down while work is
// still running, jumps to 100% and fades when everything has finished. Short blips (<120 ms) never show.
export default function LoadingBar() {
  const [width, setWidth] = useState(0);
  const [on, setOn] = useState(false);
  const timers = useRef({});

  useEffect(() => {
    const clearAll = () => { Object.values(timers.current).forEach((id) => { clearTimeout(id); clearInterval(id); }); timers.current = {}; };
    const unsubscribe = subscribeLoading((count) => {
      if (count > 0) {
        if (timers.current.finish) { clearTimeout(timers.current.finish); delete timers.current.finish; }
        if (timers.current.tick || timers.current.show) return;
        timers.current.show = setTimeout(() => {
          setOn(true);
          setWidth(18);
          timers.current.tick = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.12 : w)), 220);
        }, 120);
      } else {
        if (timers.current.show && !timers.current.tick) { clearAll(); return; } // finished before it was shown
        if (!timers.current.tick) return;
        clearInterval(timers.current.tick); delete timers.current.tick; delete timers.current.show;
        setWidth(100);
        timers.current.finish = setTimeout(() => { setOn(false); timers.current.reset = setTimeout(() => setWidth(0), 300); }, 250);
      }
    });
    return () => { unsubscribe(); clearAll(); };
  }, []);

  return (
    <div className={`ne-loadbar${on ? " on" : ""}`} role="progressbar" aria-hidden={!on} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}>
      <div className="ne-loadbar-fill" style={{ width: `${width}%` }} />
      {on && width < 100 && <div className="ne-loadbar-shine" />}
    </div>
  );
}
