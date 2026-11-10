# Meta connect audit (read-only)

Date: 2026-11-06. Scope: neezam-erp (`dev`), neezam-erp-worker (`main`). Nothing was changed, deployed, or called on Meta. "Not sure" marks what could not be verified from code alone (mostly Supabase RLS and Meta's current rules).

## 1. Where it lives and the flow

| Piece | File |
|---|---|
| Connect screen (Settings > Meta Connect, nav id `meta-connect`) | `src/pages/MetaConnect.jsx` (route in `src/App.jsx:117,2521`; also mounted in `src/pages/Settings.jsx:176`) |
| OAuth callback page | `src/pages/MetaCallback.jsx`, routed at path `/auth/meta-callback` (`src/App.jsx:2015`) |
| Ads dashboard | `src/pages/AdsAnalytics.jsx` (campaign/adset/ad creation, insights, balance) |
| Profit and loss ad spend | `src/pages/ProfitLoss.jsx:346-350` (`/meta-insights`) |
| Worker | `neezam-erp-worker/index.js`: constants `:24-27`, `metaGraphRequest` and `requireMetaStore` `:1999-2026`, endpoints `:8104-8371` |

Flow today:
1. Connect button (`MetaConnect.jsx:38`) sends the browser to `facebook.com/v21.0/dialog/oauth` with `client_id`, `redirect_uri`, `scope`, and `state=<storeId>`.
2. Meta redirects to `https://neezam-erp.pages.dev/auth/meta-callback?code&state`.
3. `MetaCallback.jsx` POSTs `{storeId, code}` to the worker `/meta-token`. This endpoint is **public (no auth)**.
4. The worker exchanges the code for a short-lived token, then for a long-lived token, then lists `/me/adaccounts`. It **returns the long-lived token and the ad accounts to the browser**.
5. If there is one account it is auto-selected, otherwise the user picks one. The browser POSTs `{storeId, accessToken, adAccountId, adAccountName}` to `/meta-select-account` (Bearer auth plus `hasStoreAccess`).
6. The worker writes the token and account columns on the `stores` row with the service key.
7. Every `/meta-*` call goes through `requireMetaStore` (login, `hasStoreAccess`, store connected), reads the token from the store row, and calls Graph.

Disconnect: `MetaConnect.jsx:47`. The browser itself nulls the five columns with `supabase.from("stores").update(...)`. This depends on RLS allowing the update (not sure). There is no call to Meta to revoke the permission.

## 2. OAuth details

- Redirect URI (hardcoded, one value, identical in the ERP and the worker): `https://neezam-erp.pages.dev/auth/meta-callback`. Preview or dev deploy URLs would not match it, and portal.eneezam.com is not registered anywhere in the code.
- Scopes requested (`MetaConnect.jsx:8`): `ads_management, ads_read, business_management, catalog_management, leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_ads, pages_manage_metadata`.
- Graph version: `v21.0` in both the dialog URL (hardcoded string in `MetaConnect.jsx:40`) and the worker constant. v21.0 is old; Meta retires versions about 2 years after release (not sure of the exact current cutoff). Plan to move to a current version.
- Long-lived exchange: yes (`grant_type=fb_exchange_token`, `index.js:8129`).
- Expiry handling: `meta_token_expires_at` is set to a fixed **now + 59 days** (`:8171`), ignoring the `expires_in` Meta returns. Nothing ever reads this column. No refresh, no warning in the UI, no "reconnect" prompt.
- When the token dies, Meta returns an error JSON (code 190). The worker passes it through as HTTP 200 (`jsonResponse(data)`) and the UI has no special handling (not sure how `AdsAnalytics` renders it, likely a generic error or an empty view).

## 3. App id and secret

- Secret: env var name `META_APP_SECRET` (Worker secret, used at `index.js:8121,8132`). It is not in `wrangler.toml`.
- **App id is hardcoded, not an env var**, in three places: `index.js:26`, `src/pages/MetaConnect.jsx:6`, and (copies, not live code) `C:\Users\Sami\Desktop\neezam-erp-worker-export.txt` and `neezam-erp-export.txt`. The storefront has no app id. `META_REDIRECT_URI` is hardcoded in the same three places.
- Also hardcoded in `index.js:19`: the Supabase anon key (public by design, relevant to section 4).

## 4. Token storage and exposure

- Storage: table `stores`, columns `meta_access_token`, `meta_ad_account_id`, `meta_ad_account_name`, `meta_connected_at`, `meta_token_expires_at`. **Plain text, not encrypted.** There is no SQL file in either repo, so schema and RLS are not verifiable here (not sure).
- Reaches the browser, by design:
  - `/meta-token` returns the token to `MetaCallback.jsx`.
  - If there is no session at that moment, it is saved to `localStorage["pending_meta_account"]` in plain text (`MetaCallback.jsx:72`), and **nothing ever reads that key back**, so the token just stays in localStorage and the connect silently fails.
  - `MetaConnect.jsx:31` and `App.jsx:1470,1847,1865` load `stores select('*')`, so the token is in the React state of every logged-in user who can read that store row. `ordersStore.meta_access_token` is read client-side in `ProfitLoss.jsx:623`, `MetaConnect.jsx:36`.
  - `/meta-select-account` echoes the whole store row (token included) back in its response.
- **Possible serious leak, not sure:** the worker's `getStores()` (`index.js:215`) reads `stores?select=*` with the **anon key**, and `requireMetaStore` uses it. For that to work, anon must be able to read the `stores` table including the token column. The anon key is public (embedded in the ERP bundle and the worker). If RLS allows it, anyone can read every store's Meta (and likely Shopify) token. This must be checked with a SQL query on `pg_policies` (see the owner checklist).
- Logs: Meta code does not call `logDevMonitoring` or write `activity_log`. Error text from `fetch` could contain a URL with `access_token=` (the token is sent as a query parameter in `metaGraphRequest`); not sure whether Workers include the URL in error messages. Use the `Authorization: Bearer` header instead.
- `state`: **not a CSRF token.** It is just the store id. Nothing generates or validates a nonce. Result: an attacker can send a victim an `/auth/meta-callback?code=<attacker code>&state=<victim store id>` link and bind the attacker's ad account to the victim's store (login CSRF). `/meta-token` does not know the user or store at all, and `/meta-select-account` trusts the client-supplied `accessToken`, so any user with access to a store can store any token.
- Tie to user and store: only at the last step (`/meta-select-account` and `requireMetaStore` use `getAuthedProfile` plus `hasStoreAccess`). Creator can access all stores. `requireAdmin` is passed `false` everywhere, so **any user with access to the store, including staff without the "ads" page permission, can create campaigns, ad sets and ads and spend money** (the page gate is UI-only, `hasAccess` in `App.jsx:2150`).

## 5. Graph calls made today

| Endpoint | Where | Purpose | Permission it needs |
|---|---|---|---|
| `GET /oauth/access_token` (code, then `fb_exchange_token`) | `/meta-token` | token exchange | none |
| `GET /me/adaccounts` (id,name,account_id,currency,timezone_name,amount_spent,balance) | `/meta-token` | pick account | `ads_read` |
| `GET /act_{id}/campaigns` | `/meta-campaigns` | list campaigns | `ads_read` |
| `POST /act_{id}/campaigns` | `/meta-create-campaign` | create (default PAUSED) | `ads_management` |
| `POST /{campaignId}` | `/meta-update-campaign` | pause, resume, edit | `ads_management` |
| `POST /act_{id}/adsets` | `/meta-create-adset` | create | `ads_management` |
| `POST /act_{id}/ads` | `/meta-create-ad` | create, with `creative` from the client | `ads_management`, plus Page access for page-based creatives (`pages_show_list` / `pages_read_engagement`, maybe `pages_manage_ads`; not sure) |
| `GET /act_{id}/insights` (spend, impressions, clicks, ctr, cpc, reach) | `/meta-insights` | Ads page, P&L | `ads_read` |
| `GET /act_{id}` (amount_spent, balance, spend_cap, currency) | `/meta-account-balance` | balance | `ads_read` |

Notes:
- **No call lists pixels, pages or businesses.** There is no pixel feature in the code today, in the ERP, worker, or storefront. The storefront only records `has_fbclid` and ignores `_fbp/_fbc` for caching.
- Scopes with **no call at all**: `business_management`, `catalog_management`, `leads_retrieval`, `pages_manage_metadata`. `pages_show_list`, `pages_read_engagement` and `pages_manage_ads` are not called directly either; they are only relevant if ad creatives use a Page.
- `/meta-update-campaign` builds the path from the client-supplied `campaignId` and passes arbitrary `updates`; it is not checked that the id belongs to the store's ad account, so the store's token can be pointed at any node it can reach (medium risk).
- The `ads` UI chain is: create campaign, then ad set, then ad (`AdsAnalytics.jsx:192-224`).

## 6. Minimal permissions for planned features

| Feature | Permissions | Notes |
|---|---|---|
| (a) List and select pixels of the ad account | `ads_read` (reads `GET /act_{id}/adspixels`). `ads_management` is certainly enough; whether `ads_read` alone is enough is **not sure**, check the Graph docs when building | Pixel creation would need `ads_management` |
| (b) Create ads and campaigns (later) | `ads_management`, `ads_read`. Page-based creative needs `pages_show_list` and `pages_read_engagement`, and possibly `pages_manage_ads` (not sure) | Keep creative simple (e.g. no Page, or ask for page scopes later in a second review) |
| (c) Server-side Conversions API (later) | Sending events needs a token that can write to the pixel: `ads_management` on the user token, **or** an access token generated in Events Manager per pixel (no app permission at all, owner pastes it), **or** a system user token (needs Business Manager) | Not sure which is easiest to review; the per-pixel token avoids needing `ads_management` for CAPI |

Drop to make review easier: `business_management`, `catalog_management`, `leads_retrieval`, `pages_manage_metadata`, and `pages_manage_ads` unless a Page ad creative is really built. For Development mode with a first pixel feature, start with `ads_read` only (+ `ads_management` if pixel creation is wanted). Each permission needs its own screencast and usage text, so fewer is faster. Advanced Access to `ads_management` / `ads_read` for unrelated businesses normally also needs Business Verification (not sure of the current exact requirement; confirm in the dashboard).

## 7. App Review readiness

| Item | Status |
|---|---|
| Public terms page | Exists: `/terms` (`src/pages/public/Terms.jsx`, `App.jsx:89`). Text covers courier booking only, not ads or Meta data |
| Public privacy policy page | **Missing.** No `/privacy` route, no privacy text in the repo |
| Data deletion instructions page or deletion callback | **Missing** |
| Deauthorize callback endpoint | **Missing** (worker has no such route) |
| App domains | The only candidate domains in code: `neezam-erp.pages.dev` (current redirect URI) and `portal.eneezam.com` per the owner. Both would be set in Meta App Settings (App Domains, Valid OAuth Redirect URIs, Privacy Policy URL, User Data Deletion). Not configured by code |
| Where each permission is visible to a reviewer | Ads page (`AdsAnalytics`) shows insights, balance, campaigns, create flow (covers `ads_read`, `ads_management`). Profit and loss shows ad spend. Nothing shows pixels, pages, catalogs or leads (so no way to demonstrate those permissions) |
| Test-user flow | Not defined. Needs a reviewer-friendly path: a test ERP login with a store and the Meta test user as an app role |
| Data stored | Token, ad account id and name, connect time, a computed expiry. Insights are fetched live and not stored (as far as the code shows). Retention: until disconnect, no automatic expiry or purge |
| Disconnect deletes data | Yes for the five columns, via a client-side update (RLS-dependent, not sure). It does not revoke the permission on Meta, and nothing is logged |

Also needed for review: the app must be switched to Live mode, app icon, category, business verification, and the privacy policy URL.

## 8. Multi-user readiness

- Scoped per store: yes, columns live on `stores`, so two stores can connect different ad accounts. Within a store, only one ad account at a time.
- Per user: the token belongs to whichever user connected it, but is stored on the store, so all users with store access share it. If that Facebook user leaves or loses ad-account access, the store breaks for everyone.
- Access checks: login plus `hasStoreAccess` on all `/meta-*` calls, but no staff permission check in the worker, and `/meta-token` is public.
- What breaks at scale: no rate-limit handling (Graph app-level limits are shared by all stores on one app; errors are passed through), no token expiry monitor, no retry. One fetch per page load for insights and balance and campaigns, so many stores viewing at once multiplies calls. Worker Free plan subrequest limits (noted in code comments) could matter.

## 9. Switching to a new app id and secret

- Existing tokens belong to the old app. Once the secret changes or the old app is disabled, every stored token fails (error 190 / invalid app), because Meta ties the token to the issuing app. The app id and redirect URI are hardcoded, so the change needs a code change in 3 files and a deploy, plus the new `META_APP_SECRET` via `wrangler secret put`.
- Current behaviour on failure: `stores.meta_ad_account_id` is still set, so the UI shows "Connected" and the Ads page loads with a Meta error or empty data. There is no expired state and no reconnect prompt.
- Reconnect UX today: the user must notice, click Disconnect, then Connect again. That works only because Disconnect clears the columns.
- Suggested: add a "connection invalid" state (when Graph returns code 190 or expiry passes), and a one-click "Reconnect" in `MetaConnect`. One-off option: a migration that nulls the Meta columns for all stores on cutover (needs SQL; not run by me).

## 10. Gaps, ordered

Effort: S under half a day, M 1-2 days, L several days.

**First: working pixel setup in Development mode**
1. S: move app id and redirect URI to env vars (worker) and a Vite env (ERP); register the real redirect URIs in the new app.
2. M: do the token exchange fully server-side: a signed, short-lived `state` (store id, user id, nonce) created by an authed worker call; `/meta-callback` on the worker (or authed `/meta-token`) validates it, binds the token to that user and store, stores it, and never returns it to the browser. Remove `pending_meta_account` localStorage. This also fixes the CSRF and public-endpoint issues.
3. S: reduce scopes to what the pixel feature needs (`ads_read`, plus `ads_management` only if pixel creation is wanted).
4. M: new worker endpoint `GET /meta-pixels?store_id` (authed, store access, staff permission) and a pixel picker in `MetaConnect`; store `meta_pixel_id` (SQL migration needed).
5. S: stop selecting `*` for stores in the ERP; use a column list or a view without token columns. M if RLS must also be fixed.
6. S/M: verify RLS on `stores` (anon read, token column visibility); if anon can read it, fix first. This is a security issue regardless of review.
7. S: handle code 190: return 401/`meta_token_invalid`, show "Reconnect" in the UI. Use `expires_in`, not a fixed 59 days.
8. S: worker permission checks: `/meta-create-*` and `/meta-update-campaign` require the staff "ads" permission or admin; validate `campaignId` belongs to the account; pass the token in the Authorization header, not the query string.

**Second: submission-ready App Review**
9. M: public `/privacy` page (data collected, Meta data, retention, contact, deletion), in ur and en.
10. M: extend `/terms` to cover Meta ads features, or add a short separate section.
11. S/M: data deletion callback (`POST` signed request parsing with the app secret, returns `{url, confirmation_code}`) plus a status page, and the Deauthorize callback (clears the store's Meta columns). Worker endpoints, public, signature-verified.
12. S: Disconnect via the worker (server-side clear and `DELETE /me/permissions` on Meta), and log it in `activity_log` without the token.
13. M: reviewer path: demo store, test credentials, a pixel screen and an ads screen that clearly show each requested permission; record one screencast per permission.
14. M: move to a current Graph version, one shared constant (ERP and worker).
15. L: business verification, app live mode, review submissions (owner-driven, waits on Meta).
16. S: i18n and no emoji in `MetaCallback.jsx` (currently hardcoded Roman Urdu with emoji).

## Recommended plan

1. Check RLS on `stores` now (item 6); if the token is anon-readable, fix before anything else.
2. Create the new Meta app (Development mode), keep old app untouched.
3. Do items 1-5, 7, 8 as one change, test with your own Facebook user (app admin/role) on the stable ERP domain.
4. Build the pixel list (item 4) and test in Development mode.
5. Write privacy, terms, deletion and deauthorize pages and endpoints (items 9-12).
6. Record screencasts (item 13), complete Business Verification, switch to Live, submit.

## Owner checklist: Meta developer dashboard (in order)

1. Create a new app (type Business, or Other then Business) under the right Business Portfolio; note the App ID and App Secret (keep the secret out of chat and out of git).
2. Add the Facebook Login for Business / Facebook Login product and the Marketing API product.
3. Settings > Basic: app name, contact email, app icon, category; add App Domains (the ERP domain you will use, e.g. `portal.eneezam.com`); add the Privacy Policy URL and Terms URL once those pages are live; add User Data Deletion URL (or instructions URL).
4. Facebook Login > Settings: add the exact Valid OAuth Redirect URI(s) (must match the code character for character), enable Client OAuth Login and Web OAuth Login, and set the Deauthorize Callback URL once built. Turn on Strict Mode for redirect URIs.
5. App Roles: add yourself and a test user (and a reviewer test user later) as Admin/Developer/Tester so Development mode works with real ad accounts you own.
6. Pick the Graph API version shown for the new app and tell me, so code uses the same.
7. Start Business Verification for your business (can take days; needed for Advanced Access on most ads permissions).
8. Give me the new App ID; run `wrangler secret put META_APP_SECRET` for the new secret (production worker, and staging if used).
9. Test connect in Development mode with your own account and one pixel.
10. In App Review > Permissions and Features, request only the minimal set (section 6), each with a screencast and usage text; add test instructions and a test login.
11. Switch the app to Live mode, then submit for review.
