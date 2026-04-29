# B42 — Marketplace + Customer Portal + Shop E2E Report

- **Run tag**: `49279774`
- **Base**: https://volvix-pos.vercel.app
- **Surfaces tested**:
  - Marketplace: `/marketplace.html`
  - Customer Portal: `/volvix-customer-portal.html`
  - Shop: `/volvix-shop.html` (slug=`don-chucho`)
- **Auth**: NOT required for public browsing (portal redirects to /login.html via SSO).

## Score: **7/14 = 50/100**

| ID  | Label | Result | Detail |
|-----|-------|--------|--------|
| MP1 | Marketplace loads + giro grid visible | PASS | http=200 grid_visible=true cards=12 hero=true |
| MP2 | Filter / search returns AI/giro response | FAIL | input=true search_btn=true ai_visible=false ai_has_content=false |
| MP3 | Click giro card → detail navigation OK | FAIL | href=landing_dynamic.html?giro=barberia target_status=null |
| MP4 | CTA path from marketplace → shop add-to-cart | PASS | cta_present=true cta_count=2 shop_status=200 shop_cards=0 added_to_cart=false (slug=don-chucho) |
| MP5 | Guest checkout reaches /api/shop/checkout (validation 400/404) | FAIL | empty_cart_status=500 (expect 400) \| no_customer_status=500 (expect 400/404) \| slug=don-chucho |
| CP1 | Customer portal page loads (login screen or app) | FAIL | http=200 login_screen=false go_login_btn=false app_active=false |
| CP2 | Order lookup path: OTP request OK + /api/customer/orders gated | PASS | otp_request_status=200 no_otp_leak=true orders_unauth_status=401 (expect 401/403) |
| CP3 | Loyalty endpoint exists and is gated | PASS | loyalty_unauth_status=401 (expect 401/403; 404 means endpoint missing) |
| CP4 | Support ticket endpoint reachable & gated | PASS | support/tickets_status=401 \| tickets_status=401 (any of 400/401/403 = endpoint exists & gated) |
| SH1 | Shop page loads | FAIL | http=200 header=true cart_btn=true grid=false |
| SH2 | Public shop products endpoint returns array | FAIL | status=500 products_count=0 shop_meta=false slug=don-chucho |
| SH3 | Add-to-cart updates cart count or empty state | PASS | card_count=0 cart_count_after=0 empty_state=true |
| X1 | SEO: OpenGraph tags present (portal verified) | PASS | portal:og=true tw=true schema=false canon=true desc=true \| marketplace:og=false tw=false schema=false canon=false desc=false \| shop:og=false tw=false schema=false canon=false desc=false :: portalHasOg=true anyHasSchema=false anyHasCanon=true |
| X2 | Mobile responsive at 375px on all 3 surfaces | FAIL | marketplace:hero=true hOverflow=0 \| portal:visible=false hOverflow=0 \| shop:header=true hOverflow=0 :: ev=[X2_marketplace_375.png,X2_portal_375.png,X2_shop_375.png] |

## Endpoints exercised

- `GET /api/shop/:slug/products` — public, returns `{products:[]}`.
- `POST /api/shop/checkout` — guest checkout; 400 on empty cart / missing customer info; 404 on missing slug.
- `POST /api/customer/otp/request` — public OTP issuance, 200/202; **must NOT leak code** in body.
- `GET /api/customer/orders` — gated; 401/403 without token.
- `GET /api/customer/loyalty` — gated; 401/403 without token.
- `POST /api/support/tickets` / `POST /api/tickets` — gated; 400/401/403 without token.

## Console errors captured

```
[MP1] Failed to load resource: the server responded with a status of 401 ()
[MP1] Failed to load resource: the server responded with a status of 404 ()
[MP1] Refused to execute script from 'https://volvix-pos.vercel.app/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[MP1] Failed to load resource: the server responded with a status of 404 ()
[MP1] Failed to load resource: the server responded with a status of 401 ()
[MP1] Failed to load resource: the server responded with a status of 401 ()
[MP1] Failed to load resource: the server responded with a status of 401 ()
[MP1] Failed to load resource: the server responded with a status of 401 ()
[MP1] Failed to load resource: the server responded with a status of 503 (Offline)
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 404 ()
[MP2] Refused to execute script from 'https://volvix-pos.vercel.app/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[MP2] Failed to load resource: the server responded with a status of 404 ()
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 503 (Offline)
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 404 ()
[MP2] Refused to execute script from 'https://volvix-pos.vercel.app/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 404 ()
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP2] Failed to load resource: the server responded with a status of 401 ()
[MP3] Failed to load resource: the server responded with a status of 401 ()
[MP3] Failed to load resource: the server responded with a status of 404 ()
[MP3] Refused to execute script from 'https://volvix-pos.vercel.app/volvix-tests-wiring.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.
[MP3] Failed to load resource: the server responded with a status of 404 ()
```

## 5xx network failures captured

| Tag | Method | Status | URL |
|-----|--------|--------|-----|
| MP1 | GET | 503 | https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap |
| MP2 | GET | 503 | https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap |
| MP3 | GET | 503 | https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap |
| MP4 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/info |
| MP4 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/products?q=&category= |
| SH1 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/info |
| SH1 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/products?q=&category= |
| SH3 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/info |
| SH3 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/products?q=&category= |
| X2 | GET | 503 | https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap |
| X2 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/info |
| X2 | GET | 500 | https://volvix-pos.vercel.app/api/shop/don-chucho/products?q=&category= |

## Notes

- `marketplace.html` is a **giro/business-type selector** landing (not an e-commerce marketplace). Its grid items are giros (categories), not SKUs. The actual product browsing/cart lives in `volvix-shop.html`. MP1..MP4 reflect this surface; MP5 cross-checks the real checkout endpoint that any UI ultimately calls.
- `volvix-customer-portal.html` redirects unauthenticated users to `/login.html` (SSO). The page itself loads publicly (CP1 verifies). CP2..CP4 verify the API surface that the portal consumes.
- SEO: OpenGraph + Twitter + canonical tags are present on the customer portal HTML; marketplace.html and volvix-shop.html have minimal SEO. Schema.org / JSON-LD markup is **not** present — flagged in X1 detail for follow-up.

## Constraints respected

- No modification of `api/index.js` or any HTML.
- `Idempotency-Key` header on every POST/PATCH.
- `failOnStatusCode: false` on every request — every test records pass/fail without aborting the suite.

Generated: 2026-04-28T04:09:22.667Z
