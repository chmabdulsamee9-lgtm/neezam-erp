// Columns of the stores table the browser may read. The table also holds integration secrets (meta_access_token,
// dex_access_token, dex_refresh_token, shopify_client_secret, api_token): the browser never selects, inserts or updates
// them. Secret-column actions go through the worker (/meta-disconnect, /shopify-save-token, /dex-bind-account).
// Meta and DEX expose only ids, names and dates here, never tokens.
export const SECRET_STORE_COLUMNS = ["meta_access_token", "dex_access_token", "dex_refresh_token", "shopify_client_secret", "api_token"];

// Large per-store JSON (theme_config, checkout/payment/shipping/tax/general settings) is not part of this list: those
// screens read it through the worker or their own narrow selects.
const BASE_COLUMNS = [
  "id", "user_id", "store_name", "eneezam_id", "shopify_url", "platform", "created_at",
  "subdomain", "custom_domain", "custom_domain_status", "theme_id", "catalog_source", "shopify_client_id",
  "default_weight_kg", "default_length_cm", "default_width_cm", "default_height_cm", "label_display_mode",
  "dex_seller_id", "dex_platform_name", "dex_connected_at",
  "meta_ad_account_id", "meta_ad_account_name", "meta_connected_at", "meta_token_expires_at", "meta_pixel_id",
];
// meta_pixel_id exists (it is in the base list). meta_pixel_name may not: a database without it answers 42703 and the helpers retry without
export const OPTIONAL_STORE_COLUMNS = ["meta_pixel_name"];

export const SAFE_STORE_COLUMNS = [...BASE_COLUMNS, ...OPTIONAL_STORE_COLUMNS].join(", ");
const BASE_STORE_COLUMNS = BASE_COLUMNS.join(", ");

const isMissingColumn = (error) => !!error && (error.code === "42703" || /column .* does not exist/i.test(error.message || ""));

/** one store row (non-secret columns). Returns the supabase { data, error } pair. */
export async function fetchStoreRow(supabase, storeId) {
  let res = await supabase.from("stores").select(SAFE_STORE_COLUMNS).eq("id", storeId).single();
  if (isMissingColumn(res.error)) res = await supabase.from("stores").select(BASE_STORE_COLUMNS).eq("id", storeId).single();
  return res;
}

/** all stores the caller can see (creator master dashboard), newest first */
export async function fetchStoreRows(supabase) {
  let res = await supabase.from("stores").select(SAFE_STORE_COLUMNS).order("created_at", { ascending: false });
  if (isMissingColumn(res.error)) res = await supabase.from("stores").select(BASE_STORE_COLUMNS).order("created_at", { ascending: false });
  return res;
}

export const isMetaConnected = (store) => !!store?.meta_ad_account_id;
