# Secret rotation checklist

**Until stage 1f (stores) and stage 2 (secret columns) are applied, every secret stored in the `stores` table must be treated as exposed.** The Supabase anon key is public and, until then, anyone on the internet could read (and change) the `stores` table. Rotate after stage 2, not before: rotating while the table is still open only leaks the new values.

## Order
1. Apply stages per `docs/db-access-audit.md` section 8 (stage 1f and stage 2 are the ones that close the leak). Confirm with `select count(*)` that anon cannot read `stores` (use the API with the anon key from a terminal).
2. Rotate in the order below (highest impact first).

## 1. Meta
- **1** store holds a Meta token. Old app (id 1554596542737935): its stored token (`stores.meta_access_token`) dies automatically when you switch to the new Meta app, and the old app stays unused. Do both: in the old app's dashboard set the app to **Disabled** or remove its Facebook Login redirect URI so stolen tokens cannot be used through it. Rotate the old app secret anyway (Meta dashboard > Settings > Basic > Reset).
- New app: keep its secret only in the Worker (`npx wrangler secret put META_APP_SECRET`), never in code or chat.
- After the cutover, every store reconnects Meta once (Meta Connect > Disconnect, Connect).
- Sanity check on Meta: Business settings > Security Center > list of apps with access; remove the old app from every ad account.

## 2. DEX
Your results show **0** DEX tokens in `stores` (`dex_access_token` / `dex_refresh_token` are empty or unused; the code never reads them), so there is nothing to rotate in the database.
- `DEX_APP_KEY` is in `wrangler.toml` in plain text (both environments), so it is in git history. Ask DEX to rotate it, then move it to a secret: `npx wrangler secret put DEX_APP_KEY` and delete the `[vars]` line.
- Stores connected through the integration code (`/dex-bind-account`): re-bind after DEX rotates the key.

## 3. Shopify (per store)
Your results: **5** stores hold an `api_token` and **4** hold a `shopify_client_secret` (of 9 stores). Each store with a Shopify link has up to two secrets: the access token in `api_token` and, for stores with their own custom app, `shopify_client_secret`.
- Which stores: `select id, store_name, shopify_url, (api_token is not null) as has_token, (shopify_client_secret is not null) as has_client_secret from stores order by store_name;` (9 stores; DR GLOW runs on the native storefront and may have none).
- `api_token`: in the Shopify admin of each store, open the app that created it and **uninstall / reinstall** it (or revoke the token), then in the ERP: Store Connect > reconnect. The new token is saved by the worker (`/shopify-save-token`).
- `shopify_client_secret`: in each store's custom app (Shopify admin > Settings > Apps and sales channels > Develop apps > API credentials), rotate the API secret key, then update the column by SQL (`update stores set shopify_client_secret = '<new>' where id = '<id>'`, run by you; this column is never written by the app).
- The shared Shopify app secret (`SHOPIFY_CLIENT_SECRET`, Worker secret): rotate it in the Shopify Partner dashboard and run `npx wrangler secret put SHOPIFY_CLIENT_SECRET`. The webhook HMAC check uses it too, so re-register webhooks afterwards (reconnect).

## 4. Supabase
- **Anon key**: no rotation needed. It is public by design (it ships in every browser bundle); its power is exactly what RLS and grants allow, which is what stages 0 to 4 fix. Rotating it would not close any hole.
- **Service-role key** (`SUPABASE_SECRET_KEY` in the Worker): rotate only if it may have been exposed. Signs of exposure: it appears in git history (`git log -S"service_role"` across both repos and the old `neezam-storefront` folder), in a screenshot or chat, in a `console.log` that reached Cloudflare logs, or in any frontend bundle (search `dist/` for `"role":"service_role"` after decoding a JWT). The Worker never returns it in a response (tests assert that no response names a secret column, and the key is only read from `env`). If unsure, rotate: Supabase dashboard > Project settings > API > regenerate, then `npx wrangler secret put SUPABASE_SECRET_KEY` (and `--env staging`), and update any other service using it (n8n, WhatsApp bot, edge functions).
- JWT secret rotation invalidates every user session; do it only if the service key was exposed.

## 5. Other secrets worth a look (not in `stores`)
`GEMINI` keys, `RESEND`/email keys, Cloudflare API tokens used by the worker: if any were ever shared, rotate them with the same `wrangler secret put` command.

## 6. After rotating
- Re-run the status check on drglow.online and the ERP smoke test.
- Record the rotation date for each secret here (or in your password manager).
