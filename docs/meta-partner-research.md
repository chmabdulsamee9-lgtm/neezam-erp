# Meta partner integration research (Shopify-style Meta connection)

Research only. No code, SQL, deploy, Meta dashboard change or Meta API call was made for this.

**Web access: YES** (web search and page fetch). Method note: for the official developers.facebook.com pages I read a tool-generated summary of the page with quoted sentences, not the raw page, so quotes are the tool's quotes. Facebook Business Help Center pages (facebook.com/business/help/...) returned only their title, so nothing on them is verified. Third-party blogs are marked "blog" and are never used as VERIFIED.

Legend: VERIFIED = stated on an official Meta page (URL given). NOT VERIFIED = not found on an official page, or only a blog says it.

---

## 1. What is the "Connected partner" entry in Events Manager?

- NOT VERIFIED. I found no official Meta page that defines the "Connected partner" label, what produces it, or how a merchant adds a partner from it. The official "Set up Conversions API as a Platform" page does not mention the term.
- VERIFIED (related, not the label itself): platforms that send Conversions API events for clients identify themselves with `partner_agent`, an identifier "agreed with your Facebook Representative" (https://developers.facebook.com/documentation/ads-commerce/conversions-api/set-up-conversions-api-as-a-platform).
- VERIFIED (related): partners onboard merchants' pixels through Facebook/Meta Business Extension (FBE), which needs the private permission `manage_business_extension`, added to an allow list by your Facebook representative (https://developers.facebook.com/docs/facebook-business-extension/fbe/get-started/pixel-capi-onboarding/).
- Likely but NOT VERIFIED: the label appears when a Meta-registered partner integration (FBE and/or a registered `partner_agent`) is attached to the pixel. Which of these actually triggers it is not stated anywhere I could read. Ask the Meta representative.
- Separate, VERIFIED but different thing: a merchant can share a pixel/dataset with another business as a "partner" with task levels ANALYZE, UPLOAD, ADVERTISE, EDIT (https://developers.facebook.com/docs/business-management-apis/business-asset-management/guides/business-pixel-sharing/). That is business-to-business asset sharing, not the Shopify-style label. Whether it shows under "Connected partner" is NOT VERIFIED.

## 2. Which program/status makes a platform a listed partner?

| Program | What it is | Can eNeezam qualify? |
| --- | --- | --- |
| Tech Provider | Meta's status for apps that serve other businesses with business APIs. VERIFIED that Facebook Login for Business is "Tech Providers only" and the Conversions API login template says "Complete Tech Provider onboarding" (https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business, .../conversions-api-integration-template/). Exact onboarding steps and fees: NOT VERIFIED (the official tech-provider page returned 404 here). | Probably yes in principle (a SaaS serving many merchants is the stated audience), but the exact eligibility for a small Pakistan company is NOT VERIFIED. |
| Facebook / Meta Business Extension (FBE) for pixel + CAPI | Merchant-facing flow that lets a merchant create or select Business Manager, Page and Pixel, and returns a system-user token for CAPI. VERIFIED. Prerequisites VERIFIED: app owned by a verified business, Advanced Access, Ads Management Standard Access, `ads_management`, `pages_read_engagement`, `ads_read`, and `manage_business_extension` which "requires your Facebook representative to add your app to the allow list". | Needs a Facebook representative. Whether Meta assigns one to a small SaaS is NOT VERIFIED. |
| Conversions API partner integration | The route in "Set up Conversions API as a Platform". VERIFIED prerequisites: Facebook representative, App Review, Advanced Access for `ads_management`, `pages_read_engagement`, `ads_read`, Marketing API Access Tier, user notice and consent under the Business Tools Terms. Meta's CRM-platform page estimates 3-4 weeks (3-7 weeks if already integrated) (https://developers.facebook.com/documentation/ads-commerce/conversions-api/guides/conversions-api-crm-for-platforms; the timeline came from a search summary, not read on the page itself, so NOT VERIFIED). | Same as above: needs a representative. |
| Meta Business Partner program (formerly Marketing Partners) | Badge and directory listing. VERIFIED only that a verified business is required and that the badge is for participants who meet program criteria (https://www.facebook.com/business/marketing-partners/become-a-partner/fmp-product-policies). Spend thresholds and tiers are only in blogs: NOT VERIFIED. | Not a near-term goal. Thresholds unknown. |
| Tech Partner | Upgrade from Tech Provider (blog: requires Tech Provider first). NOT VERIFIED. | Unknown. |
| Commerce partner | Catalog/checkout partners (https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/onboarding-integration appeared in search). Not read. NOT VERIFIED. FBE pixel flow itself says "This flow does not have Catalog capabilities" (VERIFIED). | Not relevant now. |

Requirements I could not find officially: fees (none stated anywhere I read; NOT VERIFIED), minimum scale, support obligations, review time (except the 3-4 week CRM estimate above), data protection assessments. Where to apply: through App Dashboard (Tech Provider onboarding) and by asking Meta for a Facebook representative (a partner manager) for FBE / partner_agent. The channel for requesting a representative is NOT VERIFIED.

## 3. Is Tech Provider required? Does it give non-expiring tokens?

- VERIFIED: serving businesses you do not own or manage requires Advanced Access through App Review ("your app must be approved for Advanced Access via Meta's App Review"), with Ongoing Review afterwards (Facebook Login for Business page).
- VERIFIED: Facebook Login for Business is limited to Tech Providers; "business integration system user (BISU) tokens are for Tech Providers only", web surfaces only, and the app must be tied to a business portfolio the developer fully controls (same page).
- VERIFIED: BISU tokens "default to never expire", and a 60-day expiry can be requested when generating a token (same page).
- NOT VERIFIED: the date when Tech Provider status became mandatory for ads_read/ads_management/business_management, and the exact onboarding steps (official page 404). A blog says Meta removed the separate Access Verification step from Tech Provider onboarding (October 2025 per one blog); NOT VERIFIED officially.
- So non-expiring tokens come from the BISU path, which needs Tech Provider status. They do not come from App Review alone.

## 4. Facebook Login for Business: non-expiring token, config, business picking

- Token: yes, a configuration can use token type "business integration system user", which defaults to never expire (VERIFIED, https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business). Today's flow uses a user token (60 days).
- Dashboard change: create a Facebook Login for Business configuration in the App Dashboard that sets token type, assets and permissions, and use its Configuration ID in the login URL with `response_type=code`, because BISUs "require the authorization code grant type" (VERIFIED, conversions-api-integration-template page). Our current flow is plain scope-based login (`META_SCOPES = ads_read,ads_management`), not a configuration.
- Permissions: the CAPI template sets `ads_read` and `business_management` ("recommended permissions to set up the Conversions API"); the page also lists `ads_management` or `business_management`, `pages_read_engagement`, `ads_read` as required for production Advanced Access (VERIFIED). The business-integration token API itself requires `business_management`.
- Business picking: for BISU the client business "designates which assets to share during the flow" and the app only gets those assets (VERIFIED). After the code exchange the app reads the client business id from `/me` and lists `owned_pixels` and `client_pixels` (VERIFIED). Whether the dialog shows a Shopify-style Business then Ad account then Pixel picker is NOT VERIFIED on the pages I read.
- Requires: Tech Provider onboarding, Advanced Access (the CAPI template page also quotes at least 1,500 Marketing API calls in 15 days and an error rate below 15%; the other page quotes 500 calls, so the number is inconsistent: NOT VERIFIED which applies).

## 5. `partner_agent`

- VERIFIED: it is a top-level field that lets a platform "attribute Conversions API events to your platform", with an identifier you "work with your Facebook Representative" to agree (https://developers.facebook.com/documentation/ads-commerce/conversions-api/set-up-conversions-api-as-a-platform).
- NOT VERIFIED: what happens if an unregistered platform sets it (rejection, ignored, or mis-attribution). No page says.
- Recommendation: do not send it until Meta assigns a string. Risk of a made-up value is unknown, benefit is none before registration. (Unchanged from `docs/meta-capi-plan.md`; our code sends none.)

## 6. Standard / Enhanced / Maximum

- NOT VERIFIED that these are Meta-defined. A blog (not official) describes them as Shopify's own settings. Meta's Shopify help page appears to tell merchants to pick Enhanced or Maximum, which suggests they are the partner's labels inside Meta's partner integration (https://www.facebook.com/business/help/646757258759189, title and search snippet only; body not read).
- VERIFIED (general Meta rules we already follow): customer information parameters (email, phone, first/last name, city, state, zip, country, etc.) must be normalised and SHA-256 hashed; IP, user agent, `fbp`, `fbc` are not hashed (https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/). Deduplication uses the same `event_name` and `event_id` from browser and server.
- VERIFIED (partner flow): "Appropriate notice to and consent from your users for the sharing of event data" is required (Business Tools Terms, set-up-as-a-platform page).
- Limited Data Use: NOT VERIFIED, nothing read. We do not implement it.
- So the three level names are free for us to use; nothing says Meta defines them.

## 7. A lighter path without partner status?

- Path A (works for any developer, VERIFIED pieces): merchant shares the pixel/dataset with our business as a partner (Business Settings > Datasets > Assign partner; tasks ANALYZE/UPLOAD/ADVERTISE/EDIT, https://developers.facebook.com/docs/business-management-apis/business-asset-management/guides/business-pixel-sharing/), then our system user (assigned the pixel with Manage Pixel) sends events with a system-user token. Meta lists "Client pixel sharing" as an authorization path (set-up-as-a-platform page). Needs our own Business, app and system user; permission needs on our side are ads_management plus business_management for the sharing API calls. Whether a non-partner app can call the pixel-sharing API for other businesses without Advanced Access/App Review: NOT VERIFIED, likely needs it for other people's businesses.
- Path B (VERIFIED): merchant creates a system-user token in Events Manager Pixel Settings and gives it to us (Client-created token path). No Meta approval, but the merchant handles a secret; this matches option C in `docs/meta-capi-plan.md`.
- Path C: keep today's user token (60 days). Works in Development mode only for people with a role on the app.
- None of these produces the "Connected partner" label (NOT VERIFIED).

## 8. Recommendation in three phases

**NOW (no Meta approval).** Build: keep the current flow. Optional: per-pixel Events Manager token (Path B) so server events do not stop every 60 days; a merchant-guided "assign our business as partner" help page (Path A, unverified for apps without review). Owner does: nothing in Meta. Impossible: Business-picker login for other merchants (needs review), non-expiring token via login, "Connected partner" label.

**AFTER App Review and Business Verification.** Build: a Facebook Login for Business configuration with `response_type=code` and BISU token type, exchange the code, read `client_business_id` from `/me`, list `owned_pixels`/`client_pixels`, store the BISU token (never expires unless the merchant removes the app), Business then Ad account then Pixel selection from those lists. Owner does: Business Verification, Tech Provider onboarding, App Review with Advanced Access for `ads_read`, `ads_management`, `business_management`, `pages_read_engagement` (screencast of the full flow), switch the app to Live. Still impossible: the "Connected partner" label (needs a registered partner integration, see 1).

**LATER (partner program).** Build: FBE pixel/CAPI onboarding and `partner_agent` once assigned. Owner does: get a Facebook/Meta representative, ask for `manage_business_extension` allow listing and a `partner_agent` string, ask what exactly produces the "Connected partner" entry. Still impossible without Meta: the label itself.

## Conflicts with partner requirements in OUR current code (names only)

- Meta scope and flow: `shared/meta-oauth.js` (`META_SCOPES`, authorize URL builder, `expiryFromExpiresIn`) uses scope-based user login; a BISU flow needs `config_id` and `response_type=code` instead.
- Token handling: `index.js` `handleMetaNew` routes (`/meta-oauth-start`, the callback, `/meta-status`, `/meta-ad-accounts`, `/meta-set-account`, `/meta-pixels`, `/meta-set-pixel`, `/meta-remove-pixel`); expiry fields `meta_token_expires_at` assume a 60-day token; `needsReconnect` logic in `/meta-status`.
- Server events: `index.js` `sendCapi`, `capiPurchaseTask`, `loadCapiTarget`, route `/meta-capi-event`; no `partner_agent`, token sent as body parameter, one app for all merchants (Meta advises one app per partner so events are identifiable; that already holds).
- Pixel selection: `/meta-pixels` lists pixels via the ad account; a BISU flow lists `owned_pixels`/`client_pixels` of the business instead.
- UI: `src/pages/MetaConnect.jsx` (ad account first, then pixel; no Business step; expiry banners tied to 60 days).
- Storefront: `storefront/src/v2/engine/pixel.js` (`pixelSnippet`, `pixelConfig`) and `shared/meta-capi.js` (`hashUserData`, `buildCapiEvent`) are compatible; consent: partner terms require notice and consent, and we have no consent banner or Limited Data Use handling (privacy text only).

## Owner checklist (Meta side, plain steps)

1. Confirm the Meta app sits under a Business portfolio you fully control; start Business Verification for that business (Business Settings > Security Center).
2. In the App Dashboard add Facebook Login for Business and open the Tech Provider onboarding for the app; follow what it asks.
3. Request Advanced Access via App Review for `ads_read`, `ads_management`, `business_management`, `pages_read_engagement` (prepare a screencast of connect, pick account, pick pixel, send an event, disconnect; privacy policy and data deletion URLs already exist).
4. After approval create a Facebook Login for Business configuration with token type "Business integration system user", needed assets (ad account, pixel/dataset) and permissions; send us the Configuration ID.
5. Ask Meta for a partner contact (Facebook representative) and ask: what produces the "Connected partner" entry, how to get `manage_business_extension` and a `partner_agent` string, and what a company of our size must show.

## Open questions for the Meta representative

- What exactly adds a platform under "Connected partner" in Events Manager?
- Is Tech Provider status enough for BISU tokens in production, and is there any fee?
- Are Standard/Enhanced/Maximum Meta-defined settings for partners or the partner's own?
- What happens when an unregistered platform sends `partner_agent`?
