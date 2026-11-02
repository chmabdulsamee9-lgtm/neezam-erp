import { supabase } from "../supabase";

// Small shared helpers for the Settings sections that talk to the worker's admin endpoints.

/** authed JSON fetch against the worker; never throws, returns { status, data } */
export async function workerFetch(cfUrl, path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch(`${cfUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, ...(opts.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.message } };
  }
}

/** public (no auth) JSON GET */
export async function publicFetch(cfUrl, path) {
  try {
    const res = await fetch(`${cfUrl}${path}`);
    return { status: res.status, data: await res.json() };
  } catch (err) {
    return { status: 0, data: { error: err.message } };
  }
}

/** best-effort activity_log row for a user action */
export async function logStoreActivity(storeId, actionType, details) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("activity_log").insert({
      store_id: storeId, user_id: user.id, user_name: user.email,
      action_type: actionType, order_id: null, details: details || null,
    });
  } catch { /* best-effort */ }
}
