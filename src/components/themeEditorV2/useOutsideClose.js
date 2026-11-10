import { useEffect } from "react";

// Closes a popup on an outside mousedown or Escape while `active`.
export function useOutsideClose(ref, onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [ref, onClose, active]);
}
