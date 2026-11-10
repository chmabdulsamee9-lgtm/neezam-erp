# Meta data sharing levels and the Conversions API: plan and open questions

Status: built and deployed dormant. Nothing is active until `docs/sql/stage-meta-capi.sql` is run. Where I could not verify something in Meta's documentation it says "not sure".

## What was built

- Levels per store (`stores.meta_data_sharing`): Standard (browser pixel only), Enhanced (+ hashed customer data), Maximum (Enhanced + server events through the Conversions API, de-duplicated with the browser by the same `event_id`).
- Server events use the store's existing Meta token (the 60-day user token from Meta Connect). Purchase is sent from `place-order` in the background (`waitUntil`, errors swallowed). The other events are forwarded by the storefront script to `POST /meta-capi-event`.
- Graph API version for the Conversions API: the same `GRAPH_VERSION` constant as the connect flow (v27.0). One constant, so it moves together with the rest.

## 1. Token lifetime

Today the connection holds a user access token that lasts about 60 days. When it expires (or Meta answers error 190) the connection shows "reconnect" and server events pause; the browser pixel keeps working, because it does not use the token.

Options:

| Option | Lifetime | Notes |
| --- | --- | --- |
| A. Keep the user token (current) | about 60 days | Works today. Needs the merchant to reconnect every ~2 months. The ERP warns 7 days before and when expired. |
| B. Business-integration system-user token from Facebook Login for Business | configurable in the configuration (expiring or non-expiring is offered for system-user type) | Not sure. Meta's documentation describes choosing the token type (user or system-user) and expiry in the Login for Business configuration, and the Conversions API onboarding template uses a system-user token plus `GET /me?fields=client_business_id`. I could not confirm that the non-expiring option is available to every app / every business without extra review. |
| C. Per-pixel Conversions API token from Events Manager (Settings > Conversions API > Generate access token) | does not expire until regenerated | Simple and documented, but the merchant has to copy a secret and paste it. It needs a new field and the same secret-storage rules as the Meta token (stored only in the database, never returned, never logged). |

Recommendation: ship with A now (done), then move to B if the app's Login for Business configuration allows a non-expiring system-user token, because it removes the 60-day reconnect without making merchants handle a secret. Keep C as the fallback if B is not offered. I would not store a second token before the owner decides, to avoid a second secret to protect.

What the owner would change in the Meta dashboard for B: in the app's Facebook Login for Business configuration, set the token type to system-user (business integration) and the token expiration to the longest option, then reconnect each store. Not sure this option is shown for your app; check the configuration screen.

## 2. Ad account business name

We request only `ads_read` and `ads_management`. Reading the business that owns an ad account (`business` field) may need `business_management`; Meta's older material says the field needs permission on the business. Not sure for the current API version. Per the instruction, no scope was added. How to check: call `GET /act_<id>?fields=business` with an ads_read-only token. If it comes back empty or with a permissions error, the business name needs `business_management` and the ERP keeps showing the ad account name only.

## 3. "Connected partner" label

I found no Meta documentation that describes a "Connected partner" label or what unlocks it. Not sure. The related path is Meta's partner integrations (a CRM/partner integration needs an allow-listed app and the `manage_business_extension` permission), which is a Meta approval process, not something code can switch on.

`partner_agent`: documented as a string identifying a partner or agency that sends events on behalf of advertisers, normally agreed with a Meta representative. It is not needed for events to be accepted, and a wrong or unregistered value could be attributed incorrectly. Not sent. Revisit only if Meta assigns a partner string.

## 4. Graph version

The Conversions API call uses `https://graph.facebook.com/v27.0/<pixel_id>/events`, the same `GRAPH_VERSION` as the OAuth, pixel and ad-account calls. The access token is sent in the request body, not in the URL. Not sure whether Meta also accepts it in an Authorization header for this endpoint, so the documented body form is used.

## Privacy rules enforced in code

- Standard: the page has no hashing code at all and no personal data is sent.
- Enhanced / Maximum: email, phone (Pakistan numbers normalised to 92xxxxxxxxxx), first and last name, city, state and country are lower-cased, trimmed and hashed with SHA-256; the street address is never sent.
- Maximum: client IP and user agent come from the request headers of the event and are passed to Meta; they are not stored or logged. The rate limit uses a salted hash kept in memory only.
- Logs contain only the Meta error code, never customer data.

## What the owner must do

1. Run `docs/sql/stage-meta-capi.sql` when ready (until then everything stays Standard).
2. Nothing else is required in the Meta dashboard for option A. For B, see section 1.
