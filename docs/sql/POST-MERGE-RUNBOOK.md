# Post-merge SQL runbook

Written for the owner. Nothing in this file has been run by Claude. Run ONE file at a time in the Supabase SQL editor, in the order below, and do the file's own smoke test and ROLLBACK block if anything breaks. The longer rules, STD test and rotation steps stay in `RUNBOOK.md` (same folder); this file is the order of work after the merge to master.

Status words: ALREADY APPLIED (you ran it), NOT APPLIED (still to do).

## What the merge to master changed in SQL terms
- No new tables and no new columns are needed by the merged code. The merged code works on the current database.
- The "What is new" popup keeps its content in the app itself. It needs NO SQL.
- No new `grant ... to service_role` is needed: no new table was added.
- Data sharing levels need `stage-meta-capi.sql`, which you already applied.

## 0. ALREADY APPLIED (nothing to run)
| File / change | Status | What it changed |
| --- | --- | --- |
| `stage0-helpers.sql` | ALREADY APPLIED | Helper checks (who is creator / admin) and safer defaults. Users see no change. |
| `stage4c5a-profiles-privilege-fix.sql` | ALREADY APPLIED | An admin can no longer promote themselves or approve their own account. |
| `stores.meta_pixel_id`, `meta_user_id`, `meta_pixel_name` columns | ALREADY APPLIED | Lets a store save its Meta pixel. |
| `stage-service-role-grants.sql`, main block (store_subscriptions + 18 more tables, sequences) | ALREADY APPLIED | Gives the server's key the access it lost, so sign-up and background jobs work. |
| `stage-service-role-grants.sql`, deployment_log block | ALREADY APPLIED | Lets the creator-only deployment log be written. |
| `stage-meta-capi.sql` | ALREADY APPLIED | Adds `meta_data_sharing` and `meta_capi_test_code`, so the Standard / Enhanced / Maximum choice can be saved. |

## 1. GROUP 1: ALREADY APPLIED (2026-11-11, run by Claude in the SQL editor with the owner's go-ahead)
All 9 files below were applied and verified: anon can execute none of the listed functions, authenticated keeps the trigger chains, the
4b wrappers refuse another store's order (tested in a rolled-back transaction: 42501 forbidden) and are a silent no-op for an order with
no status row, all 7 tables have RLS on with only the ne_ policies, anon has no SELECT. Smoke test on production after each step: Home,
Orders, Booked, Returns, Finance Statement, P&L, Online Store, Store Connect (TEST32 and Doctor Rubina), drglow storefront: no 4xx/5xx.
Not tested: a staff login and adding a Booked remark on a real order (no test orders with a tracking number exist).
Also applied the same day: `perf-orders-filter-options.sql`.

Original instructions (kept for the rollback blocks):
Order (each needs stage 0, which is applied):

| # | File | Risk | What it changes for users or security | After deploy only? |
| --- | --- | --- | --- | --- |
| 1 | `stage1b-store_custom_domains.sql` | medium | Only the store's own team can see or change its custom domains. | No |
| 2 | `stage1e-store_themes.sql` | medium | Only the store's own team can open or edit its themes. The public storefront keeps working. | No |
| 3 | `stage3b-returns.sql` | low-medium | Returns data visible only to the owning store. Must be before 4c3. | No |
| 4 | `stage3c-dropship_debit_log.sql` | low-medium | Supplier debit log visible only to the owning store. Must be before 4c3. | No |
| 5 | `stage3e-inventory_deduction_log.sql` | low-medium | Stock deduction log visible only to the owning store. Must be before 4c3. | No |
| 6 | `stage3d-gemini_match_log.sql` | low | Address-match log visible only to the owning store. | No |
| 7 | `stage3f-dex_rate_card.sql` | low | Courier rate card readable by signed-in users, changeable only by the creator. | No |
| 8 | `stage4a-functions.sql` | low-medium | Removes public access to internal database functions. | No |
| 9 | `stage4b-definer-guards.sql` | medium | Internal functions now refuse another store's orders. Needs 4a first. | No |

Optional, only if needed: `stage4c5b-service-role-check.sql` (only if creating a staff user from Team fails after 4c5a).

## 2. GROUP 2: NOT APPLIED. ONLY after the master deploy is live and you have tested it
Reason: these tables are still read or written directly by the OLD production app. The merged app (now on master) sends the extra information they need. Run them only after production shows the new version and the STD test passes.

| # | File | Risk | What it changes | Prereq |
| --- | --- | --- | --- | --- |
| 10 | `stage1c-courier_feedback_log.sql` | low-medium | Courier history visible only to the owning store. | 0 |
| 11 | `stage1d-export_history.sql` | low | Export history visible only to the owning store. | 0 |
| 12 | `stage3a-dex_tracking_events.sql` | low | Courier tracking events visible only to the owning store. | 0 |
| 13 | `stage3g-dev_monitoring_log.sql` | low | Only the creator can read the developer monitor. | 0 |
| 14 | `stage3h-store_subscriptions.sql` | medium | Store plan and quota rows are protected. | 0 |
| 15 | `stage4c1-order_sync_history.sql` | medium | Order sync history protected per store. | 0 |
| 16 | `stage4c2-shopify_orders_cache.sql` | HIGH | Customer names, phones and addresses become visible only to their own store. | 0 |
| 17 | `stage1f-stores.sql` | HIGH | The stores table is protected per store. | 0, new app live |
| 18 | `stage2-stores-secret-columns.sql` | HIGH | The browser can no longer read the secret columns of stores at all. | 17, new app live |
| 19 | `stage4c3-order_statuses.sql` | HIGHEST | Order statuses protected per store. | 3, 4, 5, 8, new app live |
| 20 | `stage4c4-user_stores.sql` | HIGH | Store membership and staff permissions protected. | 0, new app live |
| 21 | `stage4c5-profiles.sql` | HIGH | Profiles (roles, approval, phone, email) protected. | 4c5a, 20, new app live |
| 22 | `stage4d-anon-grants.sql` | medium | Final sweep: logged-out visitors lose leftover access. | 10 to 21 |

## 3. GROUP 3: NOT APPLIED. Optional, after Group 2
| # | File | Risk | What it changes | Prereq |
| --- | --- | --- | --- | --- |
| 23 | `stage5a-public-role-policies.sql` | low-medium | Switches a few leftover open policies to signed-in users only. Save its NOTICE output. | 0, production deployed |
| 24 | `stage5b-storage-courier-exports.sql` | low-medium | Courier export files visible only to their own store folder. | 0, production deployed |

## 4. BLOCKED
- `stage5c-whatsapp.sql`: BLOCKED until you answer: is there another server or script that writes the WhatsApp tables, and does it use the service key? Never run it before that answer.

## Read-only helpers (safe any time)
- `needed-queries.sql`: the questions to run before the security files (Q1, Q11 first to save the current state).
- `signup-diagnostics.sql`: read-only checks for a failed sign-up.

## After Group 2
Rotate the secrets listed under "Rotation" in `RUNBOOK.md` (old Meta app, Shopify client secrets and API tokens, DEX key).
