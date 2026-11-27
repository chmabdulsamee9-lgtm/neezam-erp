import { supabase } from "../supabase";

const CF = "https://neezam-erp.chmabdulsamee9.workers.dev";

/** POST to the worker's /partners routes (worker partners.js). Never throws: { error } on any failure. `body` may be a FormData. */
export async function partnerApi(path, body = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await fetch(`${CF}/partners/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}`, ...(isForm ? {} : { "Content-Type": "application/json" }) },
      body: isForm ? body : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return data || { error: `HTTP ${res.status}` };
  } catch (err) {
    return { error: err.message || "Connection problem" };
  }
}

/** partners.eneezam.com, or /partners on a dev build */
export function isPartnerSite() {
  const h = window.location.hostname;
  if (h.startsWith("partners.")) return true;
  const dev = h.includes("pages.dev") || h === "localhost" || h === "127.0.0.1";
  return dev && (window.location.pathname === "/partners" || window.location.pathname.startsWith("/partners/"));
}
