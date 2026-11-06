# Database access audit (2026-11-06)

Scope: neezam-erp (`dev`) and neezam-erp-worker (`main`). Based on a grep of both repos; there is no schema or SQL file in either repo, so anything about columns, triggers and policies that code cannot show is marked NEEDS-CHECK and has a read-only query in `docs/sql/needed-queries.sql` (Q1 to Q13).

Keys in use:
- **anon key**: public, in `src/supabase.js` and (before this change) in the worker. In the worker it is now used for exactly one thing: verifying a caller's JWT at `auth/v1/user`. It no longer reads any table.
- **user JWT**: the browser's `supabase` client after login (role `authenticated`).
- **service key**: Worker secret `env.SUPABASE_SECRET_KEY` (existing name, reused). Used by every worker table access.

## 1. Access map

Browser = `src/` through the supabase client (anon key before login, user JWT after). Worker = `index.js`, service key.

| Table | Browser (ops, files) | Worker (service key) |
|---|---|---|
| stores | select: App.jsx (3x), MetaConnect, CourierConnect, OnlineStore, StoreConnect, ProductsManagement, ThemeEditorV2, EneezamLabel, WhatsApp; insert: Login (sign-up), Settings (add brand); update: App.jsx (creator renames store), CourierConnect (weights, label mode), MetaConnect (disconnect, **moved**), ShopifyCallback (token, **moved**); delete: StoreConnect | select (`getStores`, `getStoreById`, many); insert (create native store, shopify-save-token); patch (themes, domains, dex bind, meta select, settings) |
| store_themes | none | all (list, get, create, update, publish, delete) |
| store_custom_domains | embedded select inside stores (`store_custom_domains(domain, role, status)`) | all |
| whatsapp_sessions | none | none (no code in either repo; an outside writer may exist, NEEDS-CHECK) |
| courier_feedback_log | select (BookedOrders) | insert |
| export_history | select, insert (BookedOrders) | none |
| dex_tracking_events | select (BookedOrders) | insert, select |
| returns | select (ProfitLoss) | select; written by receive_return / create_return_record_if_needed |
| dropship_debit_log | none | none directly (charge_dropship_debit_for_order / sync_all_dropship_debits) |
| gemini_match_log | none | insert, select, patch |
| inventory_deduction_log | select (ProfitLoss) | none directly (deduct_inventory_for_order / sync_all_inventory_deductions) |
| dev_monitoring_log | insert (App.jsx logDevMonitoring, dev hosts only); select (DevMonitor, DevMonitorDetailed, GeminiUsageMonitor) | insert, delete (cleanup) |
| dex_rate_card | none | select, patch |
| store_subscriptions | select, insert, update (App.jsx: module access, quota, creator approvals), insert (Login sign-up, status pending_approval) | select, insert, patch (quota) |
| order_statuses | select (Orders, Booked, Finance, bookedOrdersData, App.jsx), upsert (Orders.jsx, 7 sites) | select, insert, patch (sync, courier status) |
| order_sync_history | select all rows with no filter, upsert, delete (Orders.jsx) | none |
| profiles | select own + teammates + creator list, insert (sign-up), update (own, creator edits) | select, insert, put, delete (staff creation, store deletion) |
| shopify_orders_cache | select (App.jsx, bookedOrdersData, EneezamLabel, GlobalSearch, BookedOrders, StoreConnect) | select, insert, patch (sync, webhooks) |
| user_stores | select (App.jsx, Team), insert (Login, Settings), update + delete (Team) | select, insert, delete |
| activity_log | insert (many pages), select (ActivityLog) | insert, delete (cleanup) |

Browser RPCs: `get_store_stats` (App.jsx), `append_order_remark` (BookedOrders.jsx). Everything else (`orders_page`, `booked_page`, `home_*`, ...) is called by the worker.

## 2. `has_store_access` (derived from the worker)

`hasStoreAccess(env, userId, role, storeId)` in `index.js`: role `creator` is allowed for every store; anyone else only when a row exists in `user_stores` with that `user_id` and `store_id`. **There is no admin rule and no `stores.user_id` rule in the worker.** Staff are further limited by `user_stores.permissions` (page ids such as `orders`, `online-store`, `meta-connect`) in selected endpoints only.

SQL (`docs/sql/stage0-helpers.sql`): `has_store_access(uuid)` = creator OR membership; overloads for text store ids and for `eneezam_id` (store_subscriptions is keyed by `stores.eneezam_id`). `is_store_admin(uuid)` = creator OR `stores.user_id = auth.uid()` OR an admin linked to the store, used for team management and store deletion. The stores policies add the owner clause (`user_id = auth.uid()`) so that a brand just inserted can be read back before its `user_stores` link exists.

## 3. Secret columns of `stores`

Secrets: `meta_access_token`, `dex_access_token`, `dex_refresh_token`, `shopify_client_secret`, `api_token`.

| Secret | Who touched it before | Now |
|---|---|---|
| meta_access_token | MetaConnect (`select *`, disconnect update), ProfitLoss:623 (`!!token` check), worker `/meta-select-account` (write), `/meta-*` (read) | browser reads only `meta_ad_account_id` (connected flag); disconnect goes to new worker `POST /meta-disconnect` (auth, store access, staff `meta-connect` permission, activity log); `/meta-select-account` response goes through `publicStore()` |
| api_token (Shopify) | ShopifyCallback (write), Orders.jsx (sent as `token` to `/shopify-update-order`, 2 sites), Login/Settings inserts (`api_token: null`), worker (read) | write moved to new worker `POST /shopify-save-token`; Orders.jsx no longer sends it and `/shopify-update-order` reads the token from the store row (a `token` in the body is ignored, old ERP builds still send it); inserts no longer name the column |
| shopify_client_secret | worker only (`/shopify-token`, webhook HMAC check); set by SQL | unchanged, server-side only |
| dex_access_token / dex_refresh_token | no code reads or writes them (DEX uses app-level env keys + `dex_seller_id`) | NEEDS-CHECK: columns may be unused leftovers; Q13 and the rotation checklist cover them |

Worker responses that returned store rows: `/create-native-store` (store), `/dex-bind-account` (store), `/meta-select-account` (store). All three now use `publicStore()` from `shared/store-secrets.js`. `/get-store-by-subdomain` and `/get-store-by-domain` already selected explicit non-secret columns. **Still true:** `/shopify-token` (public, unchanged for old-ERP compatibility) returns the Shopify access token from the OAuth exchange to the browser, and the Meta OAuth `/meta-token` returns the Meta token; both remain until the production ERP is on the new code (see the final report).

Browser reads: `SAFE_STORE_COLUMNS` in `src/lib/storeColumns.js` replaces every `stores.select('*')` (App.jsx x3, MetaConnect, CourierConnect). Tests fail if `select('*')` or `select()` returns on `stores` in `src/`, or if any browser file names a secret column.

## 4. Functions (finding 7, pg_trgm excluded)

| Function | Kind | Caller |
|---|---|---|
| append_order_remark | SECURITY DEFINER | browser rpc (BookedOrders, 2 sites): needs authenticated + an internal guard (stage 4b template) |
| delete_store_cascade | SECURITY DEFINER | worker only (`/admin-delete-store`) |
| get_next_local_order_number | SECURITY DEFINER | worker only |
| protect_profile_privileged_fields | trigger fn (definer) | trigger on profiles |
| rls_auto_enable | event-trigger fn (definer) | event trigger |
| charge_dropship_debit_for_order, deduct_inventory_for_order | write | not called by code: trigger chain or unused (NEEDS-CHECK Q7) |
| create_return_record_if_needed, receive_return, sync_all_dropship_debits, sync_all_inventory_deductions, handle_dispatch_event | write | worker only |
| handle_* , order_statuses_*, set_eneezam_id | trigger fns | triggers (definitions not in repo) |
| generate_eneezam_id | helper | called by the set_eneezam_id trigger fn (kept for authenticated) |
| booked_classify, booked_final_bucket, build_matched_address, get_product_cost_as_of, norm_pk_phone, normalize_addr_text, order_skus, order_source, soc_phone_key | read helpers | used inside dashboard functions (kept for authenticated, anon revoked) |
| get_store_stats | read | browser rpc (App.jsx) |
| match_address | read | worker (21 sites) |
| next_store_order_number | already authenticated-only | worker only (optional hardening in stage 4b) |

## 5. Triggers on the 6 RLS-disabled tables

**Not derivable from the repos** (no migrations). The query is Q6 in `needed-queries.sql`. What matters: a trigger function that runs as the invoking user and writes into an RLS-protected table. Reasoning per table:
- shopify_orders_cache: all writers are the worker (service key, bypasses RLS), so no trigger fires under a browser user. Low risk.
- order_statuses: the browser upserts here, so its triggers (`order_statuses_*`, `handle_*`) run as the logged-in user. Targets suspected: returns, inventory_deduction_log, dropship_debit_log, order_sync_history. After stage 3 the first three are SELECT-only for authenticated, which is what they already were, so no new failure is expected. Any trigger that writes order_sync_history / shopify_orders_cache / profiles / user_stores as the invoker is **flagged NEEDS-CHECK**; the fix (mark the function SECURITY DEFINER with `set search_path = public`) is a template in stage 4c-3, not applied blindly.
- profiles: `protect_profile_privileged_fields` (kept; stage 4c-5 relies on it).
- user_stores, order_sync_history, whatsapp_sessions: unknown.

## 6. Columns of the 6 RLS-disabled tables (inferred)

| Table | Known from code | NEEDS-CHECK |
|---|---|---|
| order_statuses | id, order_id, store_id, status, manual_order_number, dex_tracking_number, dex_package_code, delivered_at, return_success_at, synced_at, updated_at, last_edited_at, cancellation_reason, customer_name, phone, address, city, matched_* | rows with store_id null (Q12) |
| order_sync_history | order_id (upsert key) + snapshot columns | **whether it has store_id** (stage 4c-1 has both variants) |
| profiles | id, email, full_name, phone, role, approved | trigger coverage |
| shopify_orders_cache | id, store_id, raw_data | null store_id (Q12) |
| user_stores | user_id, store_id, permissions | column types |
| whatsapp_sessions | nothing (no code) | everything (Q2) |

## 7. Code changes made in this run

Worker (commit 72b2250, deployed): service key in `getStores` / `getStoreById` (now env-taking, with a direct by-id query); `shared/store-secrets.js` (`publicStore`); `/meta-disconnect`, `/shopify-save-token`; `/shopify-update-order` token from the row; tests `test/store-secrets.test.mjs`. ERP (dev): `src/lib/storeColumns.js`, MetaConnect, ShopifyCallback, Login, Settings, CourierConnect, ProfitLoss, App.jsx, Orders.jsx (store_id on 5 order_statuses upserts, no token), i18n, test `src/lib/storeSecrets.test.mjs`.

Found while auditing, not fixable in code alone: `order_sync_history` is read whole (all stores) by Orders.jsx; stage 4c-1 scopes it.

## 8. Order of work

1. This run: code (done) and SQL files (written, not run).
2. Merge dev ERP to production (owner). Until then do NOT run stage 2, 4c-3 or 4c-4/5's insert paths (they break the old ERP).
3. SQL: stage 0, 1a..1e, 3a..3h, 4a, 4c-1, 4c-2, then (after merge) 1f, 2, 4c-3, 4c-4, 4c-5, 4d. One file at a time with the smoke test. Run Q1..Q13 first.
4. Rotation (`docs/security-rotation-checklist.md`).

## 9. Smoke test after every SQL file

Production ERP (portal.eneezam.com) AND the dev preview: login (admin, creator, staff), Home, Orders (list, Edit Items, cancel on a TEST order only), Booked, Returns, Online Store, Meta Connect, Settings, Team. Plus drglow.online home/product/cart/checkout. On any breakage run that file's ROLLBACK block at once.
