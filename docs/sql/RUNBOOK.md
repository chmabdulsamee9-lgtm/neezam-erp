# Database security runbook

Run by the owner, one file at a time, in the Supabase SQL editor. Nothing here was run by Claude. After EVERY step do its test, and if anything breaks run that file's ROLLBACK block at once (each file has one at the bottom).

**Standard test (STD)** on three places: **production ERP** (portal.eneezam.com) and the **dev preview**: login as admin, creator and staff; Home; Orders (list; Edit Items and cancel on a TEST order only); Booked; Returns; Online Store; Meta Connect; Settings; Team. And **drglow.online**: home, collection, a product, cart, checkout (all 200).

## Blocked until the owner confirms
- **(a) WhatsApp server.** Is there a separate server or script that writes `whatsapp_sessions` / `whatsapp_replies`? Neither repo does. If yes, does it use the **service** key? `stage5c` is blocked until you answer "no such server" or "it uses the service key".
- **(b) Supabase "Confirm email"** (Authentication > Providers > Email), or run Q2 in `needed-queries.sql`. If it is **ON**, the OLD production sign-up already has no session; the new code does not care. It matters only if you want 4c-4 / 4c-5 to run before the merge (they are placed after it, so you can skip this question).
- Run Q1 (save current policies), Q3, Q4, Q6, Q7, Q8, Q9 in `needed-queries.sql` before group 1 and paste anything unexpected back.

## Prerequisite already done
Worker commits 72b2250 + f66a444 are deployed (service key everywhere, `/signup-create-account`, `/meta-disconnect`, `/shopify-save-token`). The hotfix branch `security-hotfix` (see the report) carries the matching ERP code.

## GROUP 1: safe BEFORE the merge (old production ERP keeps working)
| # | File | Risk | Extra test | If it fails |
|---|---|---|---|---|
| 1 | `stage0-helpers.sql` | low | STD (nothing should change) | its ROLLBACK block |
| 2 | `stage1b-store_custom_domains.sql` | medium | Online Store shows the domain | its ROLLBACK |
| 3 | `stage1c-courier_feedback_log.sql` | low-med | Booked: expand an order's courier history | its ROLLBACK (if CREATE POLICY failed, nothing changed: use variant B) |
| 4 | `stage1d-export_history.sql` | low | Booked: export, list, download | its ROLLBACK |
| 5 | `stage1e-store_themes.sql` | medium | Online Store, open editor (NO publish / save); drglow.online home/product | its ROLLBACK |
| 6 | `stage3a-dex_tracking_events.sql` | low | Booked export (failure reasons) | its ROLLBACK |
| 7 | `stage3b-returns.sql` | low-med | Returns page; P&L; change a TEST order status | its ROLLBACK |
| 8 | `stage3c-dropship_debit_log.sql` | low-med | Supplier Ledger; change a TEST order status | its ROLLBACK |
| 9 | `stage3e-inventory_deduction_log.sql` | low-med | P&L; Products | its ROLLBACK |
| 10 | `stage3d-gemini_match_log.sql` | low | Orders: address match on a TEST order | its ROLLBACK |
| 11 | `stage3f-dex_rate_card.sql` | low | Finance Statement | its ROLLBACK |
| 12 | `stage3g-dev_monitoring_log.sql` | low | creator opens Dev Monitor; a normal admin cannot | its ROLLBACK |
| 13 | `stage3h-store_subscriptions.sql` | **medium** | normal admin sees modules and no quota error; creator approves a TEST store; TEST sign-up on dev preview | its ROLLBACK |
| 14 | `stage4a-functions.sql` | low-med | Booked add remark; change a TEST order status; edit a product cost (fires the dropship backfill trigger); Supplier Ledger | its ROLLBACK |
| 15 | `stage4b-definer-guards.sql` | **medium** | Booked add remark on a TEST order works; another store's admin calling it must fail (VERIFY); create a TEST native order; do NOT delete a real store | per-function ROLLBACK (restores the original exactly) |
| 16 | `stage4c1-order_sync_history.sql` | medium | Orders: Sync then Undo on a TEST order | its ROLLBACK |
| 17 | `stage4c2-shopify_orders_cache.sql` | **HIGH** | Orders list + search, Booked, global search, label print; two tabs: a status change on a TEST order appears in the other tab (realtime) | its ROLLBACK (instant) |

## GROUP 2: AFTER the hotfix branch (or dev) is merged to master AND production is redeployed
Do not start until production runs the new ERP. Test: on production, sign up a throwaway TEST account first (it must land under pending approvals), add a brand in Settings on a TEST account, and confirm the Orders actions below.
| # | File | Risk | Extra test | If it fails |
|---|---|---|---|---|
| 18 | `stage1f-stores.sql` | **HIGH** | STD + Settings > add brand + sign-up TEST account + Courier Connect weights + drglow.online | its ROLLBACK |
| 19 | `stage2-stores-secret-columns.sql` | **HIGH** | Meta Connect (connect, disconnect), Store Connect (reconnect Shopify on a TEST store), Courier Connect, everything loads (no "permission denied for column") | its one-line ROLLBACK |
| 20 | `stage4c3-order_statuses.sql` | **HIGHEST** | Orders list; change courier/status on a TEST order only; Edit Items; cancel a TEST order; Returns; Products > edit a cost; Booked (list, remark); Home. Needs steps 7, 8, 9 and 14 done | its ROLLBACK (instant) |
| 21 | `stage4c4-user_stores.sql` | **HIGH** | login admin / creator / staff; Team: change a permission, remove a TEST member; Settings > add brand; sign-up TEST | its ROLLBACK |
| 22 | `stage4c5-profiles.sql` | **HIGH** | login all three roles; creator approves a TEST account; Team shows names; My account edit; sign-up TEST | its ROLLBACK |
| 23 | `stage4d-anon-grants.sql` | medium | logged OUT: landing, pricing, Contact form (TEST message), sign-up OTP mail, forgot-password; then STD | its ROLLBACK |

## GROUP 3: optional, last
| # | File | Risk | Notes |
|---|---|---|---|
| 24 | `stage5a-public-role-policies.sql` | low-med | SAVE the NOTICE output (it is the rollback record). Test Products, Suppliers, pickup addresses, product costing |
| 25 | `stage5b-storage-courier-exports.sql` | low-med | Run Q6 first (expect 0). Test an export upload and download |
| 26 | `stage5c-whatsapp.sql` | unknown | **BLOCKED** until (a) is answered |

## Rotation (after steps 18 and 19; treat the tokens as exposed until then)
Counts from your results: 1 Meta token, 0 DEX tokens, 4 Shopify client secrets, 5 Shopify api_tokens (of 9 stores).
1. **Meta**: the one token disappears with the new Meta app (old app unused; also disable it in the Meta dashboard). Each store reconnects once.
2. **Shopify**: rotate the 4 client secrets (each custom app's API secret key, then `update stores set shopify_client_secret = ...` by SQL) and the 5 api_tokens (uninstall / reinstall the app per store, then reconnect in Store Connect). Also rotate the shared `SHOPIFY_CLIENT_SECRET` Worker secret if unsure.
3. **DEX**: nothing in `stores` to rotate (0 tokens). `DEX_APP_KEY` sits in `wrangler.toml`: ask DEX to rotate it and move it to a Worker secret when convenient.
4. **Supabase service key**: only if it may have been exposed (details in `docs/security-rotation-checklist.md`). The anon key never needs rotating: it is public by design.
