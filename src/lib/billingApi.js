import { supabase } from "../supabase";

const CF = "https://neezam-erp.chmabdulsamee9.workers.dev";

/** POST to the worker's /billing routes. Never throws: { error } on any failure. `body` may be a FormData. */
export async function billingApi(path, body = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await fetch(`${CF}/billing/${path}`, {
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

export const rs = (n) => `Rs ${Number(n || 0).toLocaleString("en-PK")}`;
export const dayText = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

const PLAN_KEY = "ne_signup_plan";
const CODE_KEY = "ne_signup_code";

/** remembers ?plan= and ?code= from the pricing page until the checkout opens */
export function rememberSignupChoice(search) {
  try {
    const q = new URLSearchParams(search);
    if (q.get("plan")) localStorage.setItem(PLAN_KEY, q.get("plan").slice(0, 30).toLowerCase());
    if (q.get("code")) localStorage.setItem(CODE_KEY, q.get("code").slice(0, 30).toUpperCase());
  } catch { /* private window */ }
}
export function signupChoice() {
  try { return { plan: localStorage.getItem(PLAN_KEY) || "", code: localStorage.getItem(CODE_KEY) || "" }; } catch { return { plan: "", code: "" }; }
}
export function clearSignupChoice() {
  try { localStorage.removeItem(PLAN_KEY); localStorage.removeItem(CODE_KEY); } catch { /* private window */ }
}
