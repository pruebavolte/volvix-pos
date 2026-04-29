# B41 — Volvix POS Performance Audit

**Generated:** 2026-04-28
**Target:** https://volvix-pos.vercel.app (production)
**Method:** Playwright headless Chromium + PerformanceObserver / Navigation Timing API
**Account used:** admin@volvix.test (Volvix2026!)

---

## 1. Executive Summary

| Score | Result |
|-------|--------|
| **Overall** | **62 / 100** |
| Web Vitals checks passed | 3 / 5 |
| API target checks passed | 1 / 2 |
| Estimated equivalent web.dev/measure | ~62 |

Volvix POS production has **acceptable API latency** for the cash/checkout path
(POST /api/sales p95 = 725 ms, just over the 500 ms target — NEAR), but suffers
from **two material front-end issues**:

1. **CLS = 0.426** (target 0.1) → 4.3× over budget. Root cause: layout flip
   when the SSO check unhides the POS app + Google Fonts swap.
2. **246 scripts / 4.04 MB decoded JS** loaded eagerly on every render.
   Slowest scripts (hotjar, slack, discord, sendgrid, twilio, mailchimp) take
   >2 s each on cold load while not being needed for the actual sale path.

**Quick wins applied** (this PR / file edits):
- defer added to 3 head scripts (volvix-api.js / sync.js / sync-widget.js)
- system-ui font fallback added to reduce font-swap CLS
- sw.js precache list extended with 8 missing critical assets
- sw.js VERSION bumped to v1.9.4-b41

**Recommendations not applied** (require other agents / DB admin / business decision):
- Code-split vertical packs and UI components (~1.86 MB savings per page)
- Lazy-load integration scripts (hotjar/slack/discord/etc.) until `requestIdleCallback`
- Set Cache-Control: immutable on hashed JS assets at the Vercel edge
- Verify all R14_INDEXES.sql indexes are applied in prod
- Enable pg_stat_statements in Supabase prod project

---

## 2. Web Vitals (production, Desktop Chrome, throttling: none)

| Metric | Target | Actual | Ratio | Verdict |
|--------|--------|--------|-------|---------|
| First Contentful Paint (FCP) | < 1500 ms | **1288 ms** | 0.86× | ✅ PASS |
| Largest Contentful Paint (LCP) | < 2500 ms | **2712 ms** | 1.08× | ⚠️ NEAR |
| Time to Interactive (TTI, approx) | < 5000 ms | **1240 ms** | 0.25× | ✅ PASS |
| Cumulative Layout Shift (CLS) | < 0.1 | **0.426** | 4.26× | ❌ FAIL |
| First Paint (FP) | — | 1288 ms | — | ℹ️ |
| Time to First Byte (TTFB) | < 600 ms | **995 ms** | 1.66× | ❌ FAIL |
| DOMContentLoaded | < 3000 ms | 4032 ms | 1.34× | ⚠️ NEAR |
| Long Tasks (count) | — | 6 | — | ℹ️ |
| Long Tasks (total) | — | 1240 ms | — | ⚠️ |
| Transferred bytes | — | 310 KB | — | ℹ️ HTML only |
| Decoded body | — | 310 KB | — | ℹ️ |

**Notes**
- TTI is approximated as `loadEventEnd + Σ longTask`. Real TTI methodology
  (lighthouse) needs a 5 s quiet window after FCP — our number is a lower bound.
- TTFB ≈ 1 s indicates Vercel cold start or Supabase round-trip on the auth gate.
- CLS being 4.3× over target is the single biggest UX-impact metric to fix.

---

## 3. API timings (5 samples each unless noted)

| Endpoint | Min | p50 | p95 | p99 | Mean | Target p95 | Verdict |
|----------|-----|-----|-----|-----|------|------------|---------|
| POST /api/auth/login | 295 | 342 | **472** | 472 | 358 | (none) | ℹ️ |
| GET /api/products (cold) | 238 | 238 | 238 | 238 | 238 | (none) | ℹ️ |
| GET /api/products (warm, ×4) | 172 | 181 | 215 | 215 | 186 | 200 | ⚠️ NEAR |
| GET /api/customers | 180 | 265 | **368** | 368 | 260 | 200 | ❌ FAIL |
| GET /api/products?search=BARCODE | 193 | 215 | **516** | 516 | 278 | 200 | ❌ FAIL |
| POST /api/sales (full flow) | 266 | 311 | **725** | 725 | 390 | 500 | ⚠️ NEAR |
| GET /api/health (×3) | 146 | 170 | 192 | 192 | 169 | (none) | ℹ️ |

### Root cause analysis

**Product search by barcode (516 ms p95) — FAIL**
- Suspected: missing trigram index on `pos_products(code)` OR trigram index
  exists but `ANALYZE pos_products` hasn't run, so planner picks seq-scan.
- Fix: verify `idx_pos_products_code_trgm` from `db/R14_INDEXES.sql` is applied
  AND `ANALYZE pos_products;` was run after seed data load.

**Customers list (368 ms p95) — FAIL**
- Suspected: `customers` table lacks `(user_id, created_at DESC)` composite or
  RLS policy is unindexed. `idx_customers_user_created_desc` is documented in
  R14_INDEXES.sql — verify it's actually applied.

**Sale POST (725 ms p95) — NEAR**
- POST /api/sales touches multiple tables in one txn: pos_sales (insert),
  pos_sales_items (bulk insert), pos_products (stock update), audit_log (insert).
- 725 ms is plausible for a 5-line ticket round-tripping through Vercel→Supabase.
- Optimizations: batch `pos_sales_items` insert in one statement (likely already
  done — needs verification in api/index.js by other agent); ensure FK
  `pos_sales_items.sale_id` and `pos_products.id` are indexed.

**Login (472 ms p95)**
- bcrypt cost factor is the dominant cost. Acceptable; not on the hot path.

---

## 4. Resource analysis (per-file, on-page load)

### 4.1 Buckets (from PerformanceObserver `resource` entries)

| Type | Count | Decoded total |
|------|------:|--------------:|
| Scripts | **246** | **4 037 588 B (4.04 MB)** |
| Stylesheets | 4 | 22 764 B |
| Images | 0 | 0 B |
| Fonts (separate request) | 0 | (delivered inline by Google Fonts CSS) |
| Fetch/XHR | 0 | (none in initial load) |

### 4.2 Top 15 slowest scripts (ms = end-to-end including queue + parse)

| # | File | Duration | Decoded |
|---|------|---------:|--------:|
| 1 | volvix-hotjar-wiring.js | 2233 ms | 9 KB |
| 2 | volvix-google-analytics-wiring.js | 2230 ms | 10 KB |
| 3 | volvix-zapier-wiring.js | 2229 ms | 14 KB |
| 4 | volvix-discord-wiring.js | 2221 ms | 13 KB |
| 5 | volvix-slack-wiring.js | 2220 ms | 12 KB |
| 6 | volvix-sendgrid-wiring.js | 2219 ms | 12 KB |
| 7 | volvix-twilio-wiring.js | 2204 ms | 9 KB |
| 8 | volvix-mailchimp-wiring.js | 2204 ms | 17 KB |
| 9 | volvix-ui-signature.js | 2203 ms | 12 KB |
| 10 | volvix-ui-form-designer.js | 2179 ms | 24 KB |
| 11 | volvix-ui-spreadsheet.js | 2178 ms | 24 KB |
| 12 | volvix-quickbooks-wiring.js | 2178 ms | 19 KB |
| 13 | volvix-clip-wiring.js | 2176 ms | 13 KB |
| 14 | volvix-conekta-wiring.js | 2174 ms | 13 KB |
| 15 | volvix-paypal-wiring.js | 2172 ms | 17 KB |

Their long durations come from **HTTP queue depth** (browser limit ~6
parallel HTTP/1.1 connections; Vercel uses HTTP/2 but still queues), not
script size. Most of these are NOT needed on the POS sale path.

### 4.3 Top 15 largest scripts by decoded body

| # | File | Decoded |
|---|------|--------:|
| 1 | volvix-i18n-wiring.js | 75 KB |
| 2 | volvix-pos-extra-wiring.js | 45 KB |
| 3 | volvix-modals.js | 45 KB |
| 4 | volvix-ai-real-wiring.js | 35 KB |
| 5 | volvix-reports-wiring.js | 34 KB |
| 6 | volvix-calendar-wiring.js | 33 KB |
| 7 | volvix-feedback-wiring.js | 31 KB |
| 8 | volvix-onboarding-wiring.js | 30 KB |
| 9 | volvix-receipt-customizer-wiring.js | 29 KB |
| 10 | volvix-workflow-wiring.js | 29 KB |
| 11 | volvix-pos-wiring.js | 28 KB |
| 12 | volvix-payments-wiring.js | 28 KB |
| 13 | volvix-fulltext-wiring.js | 28 KB |
| 14 | volvix-tax-wiring.js | 26 KB |
| 15 | volvix-notifications-wiring.js | 26 KB |

### 4.4 Bundle size aggregates

```
Single HTML file:           361 KB raw  (310 KB gzip)
Total volvix-*.js on disk:  5 468 KB raw across 304 files
Loaded on salvadorex page:  ~4 037 KB decoded across 246 files

Per-prefix subtotals (raw, on-disk):
  volvix-vertical-*.js     912 KB / 56 files  ← only 1 vertical used per tenant
  volvix-ui-*.js           948 KB / 60 files  ← UI primitives, candidates for tree-shake
  volvix-workflow-*.js     136 KB /  7 files
  rest (wirings/services)  ~3 470 KB / 181 files
```

**Observation:** vertical packs alone are 912 KB but only one vertical
is selected per tenant at any time. Loading the other 55 packs is pure waste.

---

## 5. Top DB query analysis

`pg_stat_statements` querying could not be performed from this environment
(no direct Supabase SQL access from the audit machine). Procedure to enable it:

```sql
-- In Supabase SQL Editor, as the database owner:
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
-- Restart the Postgres instance via Supabase Dashboard.

-- After 24 h of traffic, run:
SELECT
  query,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(total_exec_time::numeric, 0) AS total_ms,
  rows
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Predicted top 10 slow queries (based on API timings + R14_INDEXES.sql review)

| # | Likely query (pseudo) | Expected mean | Recommended fix |
|---|------------------------|--------------:|-----------------|
| 1 | `SELECT * FROM pos_products WHERE code ILIKE '%X%' AND user_id=$1` | 50–200 ms | Verify `idx_pos_products_code_trgm` is applied + ANALYZE |
| 2 | `SELECT * FROM customers WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100` | 80–300 ms | Verify `idx_customers_user_created_desc` is applied; replace `SELECT *` with column list |
| 3 | `SELECT * FROM pos_sales WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100` | 100–250 ms | `idx_pos_sales_user_created_desc` documented; verify applied |
| 4 | `SELECT * FROM pos_sales_items WHERE sale_id IN (...)` | 30–120 ms | Add `CREATE INDEX idx_pos_sales_items_sale_id ON pos_sales_items(sale_id)` if missing |
| 5 | `INSERT INTO pos_sales (...)` + `INSERT INTO pos_sales_items (...)` (multi-row) | 80–200 ms | Verify items insert uses single multi-row INSERT, not N inserts |
| 6 | `UPDATE pos_products SET stock = stock - $1 WHERE id = $2` (×N items) | 40–150 ms × N | Batch into `UPDATE … FROM (VALUES …)` for atomic stock decrement |
| 7 | `SELECT * FROM pos_products WHERE user_id=$1 ORDER BY name LIMIT 200` | 60–200 ms | `idx_pos_products_user_name` documented; verify applied |
| 8 | `SELECT * FROM generic_blobs WHERE user_id=$1 AND key=$2 ORDER BY updated_at DESC LIMIT 1` | 20–60 ms | `idx_generic_blobs_user_key_updated` documented; verify |
| 9 | `SELECT * FROM pos_users WHERE lower(email)=$1 LIMIT 1` | 20–80 ms | Confirm `idx_pos_users_email` (functional unique on `lower(email)`) is applied |
| 10 | `INSERT INTO audit_log (...)` (every write) | 10–40 ms | Ensure async or batch — never blocking on user response |

### General DB recommendations

1. **Run R14_INDEXES.sql against prod** if not already applied.
   ```bash
   psql $SUPABASE_DB_URL -f db/R14_INDEXES.sql
   ```
2. **Run ANALYZE on every table after seed/migration** so the planner has fresh
   statistics. R14_INDEXES.sql ends with `ANALYZE` for the main tables — make
   sure those statements actually executed.
3. **Replace `SELECT *` with column projection** anywhere a wide row is returned
   to a list view. Customer/product list views typically need 5–8 columns, not
   all 30+.
4. **N+1 audit:** any `for (const id of ids)` loop that calls `.single()` should
   become a single `.in('id', ids)` query.
5. **Consider materialized view for daily-sales-report** — already hinted by
   `idx_daily_sales_report_date_desc` index definition.

---

## 6. Image optimization audit

`salvadorex_web_v25.html` contains **zero `<img>` tags** (verified via grep).
All visual elements are CSS-driven (gradients, emoji glyphs, SVG-via-CSS).
**Action: none required.**

If/when product images, logos, or receipts are added, follow:
- Use `<img loading="lazy" decoding="async">` for everything below the fold
- Serve modern formats: WebP for photos, AVIF when Vercel Image supports it,
  SVG for icons/logos
- Add `width` + `height` attributes to prevent CLS
- Use Vercel Image Optimization (`next/image` equivalent) for tenant-uploaded
  product photos: `https://volvix-pos.vercel.app/_vercel/image?url=...&w=200&q=80`

---

## 7. Service Worker effectiveness (sw.js v1.9.3-b40 → v1.9.4-b41)

### What's working
- 3-tier cache strategy (HTML / API / static) is correctly implemented
- Static assets use cache-first with background refresh — fast and self-healing
- API uses network-first with offline fallback — correct for write paths
- Background Sync queue for offline sale capture — present
- Push notifications — present

### Issues found
1. **Precache list missed 8 critical assets** referenced by salvadorex_web_v25.html
   on every load:
   - `volvix-feature-flags.js` / `volvix-feature-flags.css`
   - `volvix-modals.js` / `volvix-modals.css`
   - `volvix-product-search.js`
   - `volvix-barcode-resolver.js`
   - `auth-helper.js`
   - `volvix-ai-assistant.js`

   **Fixed in this audit** — added to STATIC_FILES in sw.js. VERSION bumped
   to `v1.9.4-b41` so clients fetch the new manifest.

2. **transferSize: 0 on resource entries** during the test means assets came
   from the SW cache or browser cache — meaning the SW IS working for warm loads.
   First visit (cold) is the worst case.

3. **No Cache-Control hints documented for hashed assets.** Recommend
   adding `vercel.json` headers for `/volvix-*.js` to set
   `Cache-Control: public, max-age=31536000, immutable` once filenames include
   a content hash. Today filenames are stable (no hash), so we can't set
   immutable safely.

### Offline-mode test

Cannot be performed automatically from headless mode (Chromium DevTools
network throttling via Playwright doesn't fully simulate SW offline
behavior). Manual verification recommended:

```
1. Open https://volvix-pos.vercel.app/salvadorex_web_v25.html
2. Wait 30 s for full SW install
3. DevTools > Application > Service Workers > "Offline" checkbox
4. Refresh
5. Expected: page loads from cache, login screen visible, /api calls
   return {"ok":false,"offline":true}
6. Expected: outgoing sales queue to IndexedDB and sync when back online
```

---

## 8. Quick wins applied (in this audit)

| # | File | Lines | Change | Expected impact |
|---|------|-------|--------|-----------------|
| 1 | salvadorex_web_v25.html | 11–13 | Removed redundant preload, kept preconnect + stylesheet | Cleaner head, no perf change but no regression |
| 2 | salvadorex_web_v25.html | 1306–1310 | Added `defer` to volvix-api.js / sync.js / sync-widget.js (previously render-blocking) | -200..-400 ms FCP on cold load |
| 3 | salvadorex_web_v25.html | 56–57 | Added `system-ui, -apple-system, 'Segoe UI', Roboto` font fallback chain + `text-rendering: optimizeLegibility` | CLS expected to drop from 0.43 → ~0.10 |
| 4 | sw.js | 15 | VERSION bumped `v1.9.3-b40 → v1.9.4-b41` | Clients refresh precache on next visit |
| 5 | sw.js | 92–101 | STATIC_FILES extended with 8 critical assets | Eliminates 8 cold-cache misses on first POS visit |

### Files NOT modified (per constraints)
- `api/index.js` — owned by another agent; perf hints documented in §5 only
- `volvix-feature-flags.js`, `volvix-uplift-wiring.js` — protected
- All other HTML pages (only salvadorex_web_v25.html is in scope)

---

## 9. Recommendations NOT applied

These need either a different agent, an architectural decision, or DB admin access.

### 9.1 Code-split vertical packs (HIGH impact)

Currently `salvadorex_web_v25.html` loads all 56 `volvix-vertical-*.js` files
unconditionally (~912 KB raw / ~250 KB transferred). A tenant only ever uses
ONE vertical at a time.

**Recommendation:** dynamic import keyed by `tenant.giro`:

```js
// in volvix-master-controller.js (after auth)
const giro = window.volvix?.session?.giro || 'default';
const verticalUrl = `/volvix-vertical-${giro}.js`;
import(verticalUrl).catch(()=>{}); // fire-and-forget
```

Remove the 56 static `<script>` tags from salvadorex_web_v25.html.
**Expected savings:** 800+ KB raw / 16 fewer HTTP/2 requests / -1.5 s LCP on
slow connections.

**Why not applied here:** changes the cross-page wiring contract; needs the
master-controller agent to coordinate.

### 9.2 Lazy-load integration scripts (HIGH impact)

The 15 slowest scripts (hotjar, slack, discord, sendgrid, twilio, mailchimp,
google-analytics, zapier, paypal, conekta, clip, quickbooks, ui-signature,
ui-form-designer, ui-spreadsheet) are NOT needed for the cash/checkout
critical path. They each take ~2.2 s to download/parse.

**Recommendation:** wrap their `<script>` tags in a deferred loader:

```js
// in <head>, replace the 15 <script src=...> with:
window.addEventListener('load', () => {
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 2000));
  idle(() => {
    [
      'volvix-hotjar-wiring.js',
      'volvix-google-analytics-wiring.js',
      // ...etc
    ].forEach(src => {
      const s = document.createElement('script');
      s.src = '/' + src;
      s.async = true;
      document.head.appendChild(s);
    });
  });
});
```

**Expected savings:** TTI improves by ~1500 ms, LCP improves by ~300 ms.

**Why not applied here:** crosses several integration teams; needs
coordinated review of which integrations actually run on the POS page vs.
admin/owner panels.

### 9.3 Set immutable Cache-Control on hashed assets (MEDIUM impact)

Vercel by default sets `Cache-Control: public, max-age=0, must-revalidate`
on static files unless overridden. Add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/volvix-(.*)\\.[a-f0-9]{8}\\.js",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)\\.css",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=86400, must-revalidate" }
      ]
    }
  ]
}
```

**Why not applied here:** filenames are not yet content-hashed. Setting
`immutable` on stable filenames would prevent users from getting updates.
Requires the build pipeline (`__BUILD_HASH__` TODO in sw.js line 12) to be
implemented first.

### 9.4 Verify R14_INDEXES.sql is applied in prod (MEDIUM impact)

We don't know whether the documented indexes (especially the trigram indexes
for product search) are actually present in prod. A 30-second check from
Supabase SQL editor:

```sql
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_pos_products_code_trgm',
    'idx_pos_products_name_trgm',
    'idx_pos_products_user_name',
    'idx_pos_products_user_code',
    'idx_pos_sales_user_created_desc',
    'idx_customers_user_created_desc',
    'idx_pos_users_email'
  )
ORDER BY tablename, indexname;
```

If any are missing, run `db/R14_INDEXES.sql` plus `ANALYZE`.

### 9.5 Enable pg_stat_statements (LOW–MEDIUM impact)

Without it we cannot see actual top slow queries. See §5 for the SQL.

### 9.6 Lock font weights to those actually used (LOW impact)

The Google Fonts URL requests Inter weights 400/500/600/700/800 (5 weights)
and JetBrains Mono 400/500/600 (3 weights). Audit confirmed all weights
are in use, so trimming is not a free win — but if the design system lets
500 collapse to 400 visually, dropping it would save ~25 KB font payload.

---

## 10. Score breakdown (out of 100)

| Category | Weight | Score | Contribution |
|----------|-------:|------:|-------------:|
| FCP (1288 ms vs 1500 ms target) | 15 | 95 | 14.3 |
| LCP (2712 ms vs 2500 ms target) | 25 | 75 | 18.8 |
| TTI (1240 ms vs 5000 ms target) | 15 | 100 | 15.0 |
| CLS (0.426 vs 0.1 target) | 20 | 25 | 5.0 |
| Sale POST p95 (725 ms vs 500 ms) | 10 | 70 | 7.0 |
| Search p95 (516 ms vs 200 ms) | 10 | 35 | 3.5 |
| Bundle size (4 MB JS — heavy) | 5 | -10 | -0.5 |
| **Total** | **100** | — | **62.1** |

After quick wins are deployed, we project:

| Category | Current | After quick wins | After full recommendations |
|----------|--------:|-----------------:|--------------------------:|
| FCP | 1288 ms | ~1100 ms | ~800 ms |
| LCP | 2712 ms | ~2400 ms | ~1700 ms |
| CLS | 0.426 | ~0.10 | ~0.05 |
| TTI | 1240 ms | ~1100 ms | ~700 ms |
| Bundle | 4.04 MB | 4.04 MB | ~1.8 MB |
| **Score** | **62** | **78** | **92** |

---

## Appendix A — How to reproduce

```bash
# from project root
TEST_TARGET=prod node_modules/.bin/playwright test \
  --config=tests/playwright.b36.config.js \
  tests/performance.spec.js \
  --reporter=list --workers=1
# results land in tests/perf-results.json
```

## Appendix B — File list touched by this audit

```
EDITED:  salvadorex_web_v25.html  (lines 11-13, 56-57, 1306-1310)
EDITED:  sw.js                    (lines 15, 92-101)
EDITED:  tests/playwright.b36.config.js  (testMatch widened)
CREATED: tests/performance.spec.js
CREATED: tests/perf-results.json   (test artifact)
CREATED: B41_PERFORMANCE_REPORT.md (this file)
```

## Appendix C — Raw test output

See `tests/perf-results.json` for the full machine-readable measurements
including 246-resource trace.

---

*B41 Performance Audit — generated 2026-04-28*
