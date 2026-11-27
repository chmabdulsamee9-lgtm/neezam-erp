import { supabase } from "../supabase";

const CF = "https://neezam-erp.chmabdulsamee9.workers.dev";

/** POST to the worker's /nex routes (worker nex.js). Never throws: { error } on any failure. `body` may be a FormData. */
export async function nexApi(path, body = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await fetch(`${CF}/nex/${path}`, {
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

export const NEX_LOGO = "/brand/nex-logo.svg";
