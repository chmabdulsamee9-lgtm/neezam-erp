# Database security runbook (final order)

Run by the owner, ONE file at a time, in the Supabase SQL editor. Claude never ran any of it. After every file do its smoke test; if anything breaks, run that file's own ROLLBACK block (bottom of the file) at once. Every file's header repeats its group, prerequisites and one-line smoke test.

**STD test** (use it when the table says "STD"): on **production ERP** (portal.eneezam.com) and the **dev preview**: log in as admin, creator and staff; Home; Orders (list; Edit Items and cancel on a TEST order only); Booked; Returns; Online Store; Meta Connect; Settings; Team. And on **drglow.online**: home, collection, a product, cart, checkout (all 200).

## Before you start
1. Run `needed-queries.sql` Q1 (save the current policies), Q11 (save the profiles trigger function), then Q2, Q3, Q4, Q6, Q7, Q8, Q9. Paste anything unexpected back to me.
2. **Rule used for the groups:** any file that changes a table the OLD production ERP still reads or writes from the browser is GROUP 2 ONLY, run after production runs the security hotfix (`security-hotfix` branch, or dev) and you tested it there.

## BLOCKED until the owner answers
- **`stage5c-whatsapp.sql` stays BLOCKED, and last.** Is there another server or script that writes `whatsapp_sessions` / `whatsapp_replies`? Neither repo does. Run it only after you answer "no such server" or "it uses the service key".
- **Supabase "Confirm email"** (Authentication > Providers > Email, or Q2). Not needed for the order below (sign-up is done by the worker on the new code), but tell me ON or OFF.
- **Group 2 is blocked until the hotfix is merged to master and production is redeployed** (your decision; not done by me).

## GROUP 1: safe before the merge
| # | File | Risk | Prereq | One-line test | If it fails |
|---|---|---|---|---|---|
| 1 | `stage0-helpers.sql` | low | none | STD, nothing changes | its ROLLBACK |
| 2 | `stage4c5a-profiles-privilege-fix.sql` **URGENT** | low, high value | 1 | TEST admin console: updating own role / approved changes nothing; Team teammate edit, My account edit, creator approving a TEST account, TEST sign-up still work | its ROLLBACK (paste the exact function saved from Q11 first) |
| 3 | `stage1b-store_custom_domains.sql` | medium | 1 | Online Store shows the domain | its ROLLBACK |
| 4 | `stage1e-store_themes.sql` | medium | 1 | Online Store opens the editor (no publish / save); drglow.online home + product | its ROLLBACK |
| 5 | `stage3b-returns.sql` | low-med | 1 | Returns page; change a TEST order status | its ROLLBACK |
| 6 | `stage3c-dropship_debit_log.sql` | low-med | 1 | Supplier Ledger; change a TEST order status | its ROLLBACK |
| 7 | `stage3e-inventory_deduction_log.sql` | low-med | 1 | P&L; change a TEST order status | its ROLLBACK |
| 8 | `stage3d-gemini_match_log.sql` | low | 1 | Orders: address match on a TEST order | its ROLLBACK |
| 9 | `stage3f-dex_rate_card.sql` | low | 1 | Finance Statement | its ROLLBACK |
| 10 | `stage4a-functions.sql` | low-med | 1 | Booked add remark; change a TEST status; edit a product cost (fires triggers) | its ROLLBACK |
| 11 | `stage4b-definer-guards.sql` | **medium** | 1, 10 | Booked remark on a TEST order works; a foreign store's order is refused; create a TEST native order; do NOT delete a real store | per-function ROLLBACK (restores the original exactly); re-running the file is safe |

## GROUP 2 ONLY: after production redeploy (hotfix live and tested)
| # | File | Risk | Prereq | One-line test | If it fails |
|---|---|---|---|---|---|
| 12 | `stage1c-courier_feedback_log.sql` | low-med | 1 | Booked: expand an order's courier history | its ROLLBACK |
| 13 | `stage1d-export_history.sql` | low | 1 | Booked: export, history list, download | its ROLLBACK |
| 14 | `stage3a-dex_tracking_events.sql` | low | 1 | Booked list + export (failure reasons) | its ROLLBACK |
| 15 | `stage3g-dev_monitoring_log.sql` | low | 1 | creator opens Dev Monitor; a normal admin cannot | its ROLLBACK |
| 16 | `stage3h-store_subscriptions.sql` | **medium** | 1 | admin sees modules, no quota error; creator approves a TEST store; TEST sign-up | its ROLLBACK |
| 17 | `stage4c1-order_sync_history.sql` | medium | 1 | Orders: Sync then Undo on a TEST order | its ROLLBACK |
| 18 | `stage4c2-shopify_orders_cache.sql` | **HIGH** | 1 | Orders list + search, Booked, second-tab realtime | its ROLLBACK (instant) |
| 19 | `stage1f-stores.sql` | **HIGH** | 1, hotfix live | add a brand on a TEST account; TEST sign-up; Courier Connect weights; drglow.online | its ROLLBACK |
| 20 | `stage2-stores-secret-columns.sql` | **HIGH** | 19, hotfix live | Meta Connect, Store Connect, Courier Connect load, no "permission denied for column" | its one-line ROLLBACK |
| 21 | `stage4c3-order_statuses.sql` | **HIGHEST** | 5, 6, 7, 10, hotfix live | on a TEST order: change status, Edit Items, cancel; Returns; edit a product cost; Booked; Home | its ROLLBACK (instant) |
| 22 | `stage4c4-user_stores.sql` | **HIGH** | 1, hotfix live | Team: change a staff permission; Settings > add a brand on a TEST account | its ROLLBACK |
| 23 | `stage4c5-profiles.sql` | **HIGH** | 2, 22, hotfix live | log in as admin, creator, staff; creator approves a TEST account; Team shows names | its ROLLBACK |
| 24 | `stage4d-anon-grants.sql` | medium | 12 to 23 | logged out: pricing, Contact form, sign-up OTP mail; then log in | its ROLLBACK |

## GROUP 3: optional, last
| # | File | Risk | Prereq | One-line test | If it fails |
|---|---|---|---|---|---|
| 25 | `stage5a-public-role-policies.sql` | low-med | 1, production redeployed | Products, Suppliers, pickup addresses, product costing load. SAVE the NOTICE output (rollback record) | alter the saved policies back |
| 26 | `stage5b-storage-courier-exports.sql` | low-med | 1, production redeployed; Q6 returns 0 | Booked export upload + download | its ROLLBACK |
| 27 | `stage5c-whatsapp.sql` **BLOCKED** | unknown | the WhatsApp answer above | TEST WhatsApp message (if a server exists) | its ROLLBACK |

## Rotation (after steps 19 and 20)
Counts from your results: 1 Meta token, 0 DEX tokens, 4 Shopify client secrets, 5 Shopify api_tokens (of 9 stores).
1. **Meta:** the one token disappears with the new Meta app (disable the old app; each store reconnects once).
2. **Shopify:** rotate the 4 client secrets and the 5 api_tokens (uninstall / reinstall per store, then reconnect in Store Connect).
3. **DEX:** nothing in `stores` (0 tokens). Ask DEX to rotate `DEX_APP_KEY` (it sits in `wrangler.toml`) and move it to a Worker secret.
4. **Supabase service key:** only if it may have been exposed (see `docs/security-rotation-checklist.md`). The anon key never needs rotating.
