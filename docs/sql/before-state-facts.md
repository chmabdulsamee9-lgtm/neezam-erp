# Before-state facts (from the owner's SQL results; ground truth for every file in docs/sql/)

Recorded as given by the owner. Anything not in this list is unknown and marked NEEDS-CHECK in the file that depends on it.

## Row-level security and privileges
- **RLS DISABLED:** order_statuses, order_sync_history, profiles, shopify_orders_cache, user_stores, whatsapp_sessions. anon AND authenticated hold ALL privileges (including TRUNCATE, TRIGGER, REFERENCES) on these.
- anon also has full privileges on stores, store_custom_domains, whatsapp_replies and password_reset_requests (insert/select/update); SELECT on addons and plans; INSERT + SELECT on courier_feedback_log, export_history, dev_monitoring_log; and REFERENCES / TRIGGER / TRUNCATE on every public table.
- anon has NO INSERT grant on contact_submissions.

## Policies
- stores, store_themes, store_custom_domains, whatsapp_sessions: one policy, roles {public}, ALL, true.
- courier_feedback_log, export_history: public SELECT true + INSERT true.
- store_subscriptions: `authenticated INSERT with_check true` plus creator-only policies. Its `store_id` is TEXT = `stores.eneezam_id` (not uuid); the SELECT policy maps through `stores.eneezam_id`.
- dex_tracking_events, returns, dropship_debit_log, gemini_match_log, inventory_deduction_log: `authenticated SELECT true` + service_role ALL, and NO authenticated INSERT policy.
- dex_rate_card: authenticated ALL true.
- dev_monitoring_log: INSERT for anon / authenticated / service_role + authenticated SELECT true.
- activity_log, expenses, suppliers, product_costs and others already have good member / creator policies. **Several carry a {public}-role member policy** (anon never needs them): cost_component_labels, inventory_levels, pickup_addresses, product_collections, product_cost_components, product_costs, products_cache, store_collections, suppliers, product_variant_archive, app_settings, gemini_api_keys, dex_shipments_import, dex_serviceable_cities. Handled in `stage5-public-role-policies.sql`.
- profiles: ONLY `profiles_update_self_or_privileged` (UPDATE, authenticated: self OR creator OR admin sharing a store; it queries profiles itself, recursion risk). No SELECT policy and no INSERT policy (irrelevant today because RLS is off). Trigger `trg_protect_profile_fields` is BEFORE UPDATE only (not INSERT). Function `protect_profile_privileged_fields` is SECURITY DEFINER without `search_path`.
- Roles in use: admin 9, creator 1, staff 2, all approved. user_stores: 11 rows, no trigger, columns user_id, store_id, permissions. 9 stores; the creator is a member of none.

## Triggers and functions
- order_statuses AFTER UPDATE: `handle_order_returned`, `handle_order_shipped_dropship_debit`. BEFORE UPDATE: `order_statuses_preserve_set_once`, `order_statuses_touch_updated_at`.
- product_costs AFTER INSERT/UPDATE: `handle_product_cost_dropship_backfill`. stores BEFORE INSERT: `set_eneezam_id` (calls `generate_eneezam_id`).
- All of the above are SECURITY INVOKER: they run as the logged-in user. They write dropship_debit_log, supplier_transactions, expenses, inventory_deduction_log, returns (via `create_return_record_if_needed` / `handle_dispatch_event`) and read shopify_orders_cache, products_cache, suppliers, order_statuses, inventory_levels.
- Invoker call chains: handle_dispatch_event -> charge_dropship_debit_for_order, deduct_inventory_for_order; handle_order_returned -> get_product_cost_as_of; handle_order_shipped_dropship_debit, handle_product_cost_dropship_backfill, sync_all_dropship_debits -> charge_dropship_debit_for_order; set_eneezam_id -> generate_eneezam_id; sync_all_inventory_deductions -> deduct_inventory_for_order; match_address -> normalize_addr_text; booked_page -> booked_classify -> booked_final_bucket; orders_page, dashboard_stats, orders_filter_options -> order_skus, order_source, soc_phone_key. EXECUTE is checked on nested calls, so **authenticated must keep EXECUTE on all of these**.
- Definer functions, as described by the owner (the bodies were NOT pasted, so no file re-creates a body):
  - `append_order_remark(p_order_id text, p_manual_order_number text, p_text text, p_author text)`: updates order_statuses by order_id or manual_order_number, no store check.
  - `delete_store_cascade(p_store_id uuid)` returns uuid[] (user ids): deletes activity_log, dex_shipments_import, expenses, local_order_counter, order_statuses, product_costs, shopify_orders_cache, supplier_transactions, suppliers, store_subscriptions (by eneezam_id), user_stores, stores. No guard.
  - `get_next_local_order_number(p_store_id uuid)`: increments local_order_counter. No guard.
  - `protect_profile_privileged_fields` (trigger function, no search_path). `rls_auto_enable` (event trigger, search_path pg_catalog, fine).

## Data
- Secrets present: 1 meta token, 0 dex tokens, 4 shopify client secrets, 5 api_tokens (of 9 stores).
- Storage: bucket `courier-exports` has authenticated SELECT and INSERT policies for `bucket_id = 'courier-exports'` with no store scoping.
- Sign-up uses an email OTP. The Supabase "Confirm email" dashboard value is unknown.
- No tampering found: 12 profiles and 11 user_stores rows match expectation.
