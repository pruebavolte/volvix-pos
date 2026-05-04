# B42 — Users Multi-Tenant E2E Audit Report

**Run:** 2026-04-28 (UTC) · **Target:** https://salvadorexoficial.com · **Tag:** `46282719`
**Test file:** `tests/users-multitenant-e2e.spec.js`
**Config:** `tests/playwright.b42.config.js`
**Run command:** `npx playwright test --config=tests/playwright.b42.config.js`

This report is an HONEST audit. Each U test is a real call against production with the demo accounts (`admin@volvix.test`, `owner@volvix.test`, `cajero@volvix.test`, password `Volvix2026!`). API contract was learned from `api/index.js` — no app source was modified, only a new test spec + a dedicated playwright config were added.

---

## Score

| Dimension | Result |
|-----------|--------|
| Tests passing | **4 / 10** |
| Multi-tenant flow working | **40 %** |
| Cross-tenant data leaks found | **0** (good) |
| Critical breakage detected | **YES — fundamental MVP flow broken at U2/U6** |

---

## Per-test results

| ID | Test | Status | Detail |
|----|------|--------|--------|
| U1 | Admin creates a sub-tenant | **PASS** | `POST /api/owner/tenants` → 201, returned `sub_tenant_id=9f072f31-12d2-42f3-8f92-c7d6c85039cb` (uuid) under `parent_tenant_id=TNT001`. |
| U2 | Admin creates a user in that sub-tenant | **FAIL** | `POST /api/sub-tenants/{id}/users` → **HTTP 500** `{"error":"internal","message":"Error interno del servidor","request_id":"eb3cd7dd-..."}`. Reproduced in 2 separate runs and via direct `curl` — server log path stays at `request_id`. |
| U3 | New user can login + JWT carries correct tenant_id | **FAIL (cascading)** | `POST /api/login` for the new email → 401 `{"error":"Credenciales inválidas"}`. Direct consequence of U2 (no row was created). |
| U4 | New user sees ONLY their tenant data (no leak from TNT001) | **N/A — skipped** | Could not exercise: no token from U3. |
| U5 | New user creates products; admin TNT001 does NOT see them | **N/A — skipped** | Could not exercise: no token from U3. |
| U6 | Admin (superadmin) can see ALL tenants including the new one | **FAIL** | `GET /api/owner/tenants?all=true` → 200, count=4, but the just-created sub-tenant is **NOT** in the list. The handler at `api/index.js:2036-2037` reads `pos_companies` for superadmin while `POST /api/owner/tenants` (line 12786) writes to `sub_tenants`. Two tables, no JOIN — superadmin literally cannot see what they just created. |
| U7 | Owner of TNT002 lists users — cajero@volvix.test (TNT001) NOT in list | **PASS** | `GET /api/users` (owner@TNT002) → 200, `count=0`, no leak. Tenant scoping at `api/index.js:12235` (`tenant_id=eq.${tnt}`) is honored. |
| U8 | Feature flags resolve per user; toggle module.recargas → disabled | **PASS (partial)** | `GET /api/feature-flags?user_id=...` → 200 with resolved modules object. **However** the override write (`PATCH /api/users/{id}/permissions`) returned 200 with `applied=0` — silent no-op. After re-read `module.recargas=enabled` (unchanged). The flag pipeline reads correctly but writing user-scoped overrides does not persist (likely missing table `user_module_overrides` or RPC `resolve_features_for_user` in production schema). |
| U9 | Soft-delete user; login fails afterwards | **N/A — skipped** | No new user was created in U2. |
| U10 | Cross-tenant attack: owner@TNT002 → customer of TNT001 | **PASS** | `GET /api/customers/{id_TNT001}` with owner-TNT002 token → **404**. Defense-in-depth honored (404 not 403). No body leak. |

Detailed JSON output: `tests/b42-results.json`

---

## Token claims verified per tenant

Decoded from real JWTs returned by `POST /api/login`:

| Account | role (claim) | tenant_id (claim) | user_id (claim) |
|---------|--------------|-------------------|-----------------|
| admin@volvix.test | `superadmin` | `TNT001` | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1` |
| owner@volvix.test | `owner` | `TNT002` | `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1` |
| cajero@volvix.test | `cajero` | `TNT001` | `cccccccc-cccc-cccc-cccc-ccccccccccc1` |

All three demo logins return JWTs with the expected role + tenant_id. The JWT contract is fine.

**However**, the tenant-id semantics is mixed:
- Demo seeds use **TEXT slugs** (`TNT001`, `TNT002`).
- New sub-tenants created via `POST /api/owner/tenants` get a **UUID** (`9f072f31-...`).
- This dual-typing leaks throughout the codebase: `b40AssertSubTenantOwnership` (line 12858) compares `parent_tenant_id` against `req.user.tenant_id` with `String()` cast — works because the parent slug is stored as text — but the sub-tenant's own `id` is a uuid that NO existing user has in their JWT, so a sub-tenant user cannot be created via `pos_users` with `tenant_id=TNT001` (the parent's slug) AND simultaneously be filtered by `tenant_id=eq.{uuid}` in `/api/users`.

This is the root architectural gap behind U2 / U3 / U6.

---

## Architectural grietas (root causes)

### G1 — `tenant_users` write path is broken (U2, U3, U9 cascade)
**Endpoint:** `POST /api/sub-tenants/{id}/users` — `api/index.js:13929-13956`

The handler inserts into `/tenant_users` with columns `password_salt`, `display_name` and `tenant_id` set to a uuid. In production this insert returns 500 (NOT NULL violation, missing column, or table doesn't exist with expected schema). `tenant_users` is **not** the same table that `POST /api/login` reads (`pos_users` at line 1080) — so even a successful insert here would not produce a usable login.

**Impact:** A SaaS owner cannot create the first user of a new tenant. The MVP flow described in the mission ("SaaS owner creates the tenant → tenant gets first owner user (login)") **does not work in production today**.

**Suggested fix:**
- Decide on ONE users table (`pos_users`).
- `POST /api/sub-tenants/{id}/users` should insert into `pos_users` with `tenant_id` = the sub_tenant uuid AND `company_id` = parent_tenant company id (the NOT NULL `company_id` constraint just bit us in the inline owner-creation path too — see G2).
- Or, if `tenant_users` is intentional, expose a separate `/api/login/sub-tenant` that reads from there + ensure schema migrations are deployed in production.

### G2 — Inline owner creation also breaks on `pos_users.company_id NOT NULL`
**Endpoint:** `POST /api/owner/tenants` body shortcut `{owner_email, owner_password}` — `api/index.js:12796-12838`

Direct curl reproduces the bug: `Supabase 400: {"code":"23502","details":"Failing row contains (df90fb37-..., null, scrypt$..., owner, salvadorex-demo, ...)"}`. The handler does not set `company_id` on the `pos_users` insert. Because `company_id` is NOT NULL in production, the inline owner-user creation always fails — even though the response is `201` with `warning: "tenant_created_but_owner_user_failed"` (which is itself misleading — semantic 201 with a "failed" payload is a bug).

### G3 — Superadmin tenants listing is split-brain (U6)
**Endpoint:** `GET /api/owner/tenants` — `api/index.js:2029-2057`

```js
if (role === 'superadmin') {
  companies = await supabaseRequest('GET', '/pos_companies?...');
} else {
  // owner: reads sub_tenants
}
```

Superadmin reads `pos_companies` only. New sub-tenants created via `POST /api/owner/tenants` go to `sub_tenants`. So the superadmin **cannot see in the listing the tenants they just created** — they exist in the DB but are invisible to the platform owner. In a SaaS context this is a critical UX/operational bug (no way to manage what you can't see).

**Suggested fix:** for superadmin, UNION `pos_companies` + `sub_tenants` (same shape, both have `id, name, plan, is_active, created_at`). Or migrate everything to a single canonical table.

### G4 — Feature flag user overrides do not persist (U8)
**Endpoint:** `PATCH /api/users/{id}/permissions` — `api/index.js:12382-12430`

Returned `200 OK` but `applied: []` (count 0). The handler iterates `body.modules`, does an existence check on `user_module_overrides`, then PATCH or POST. None of the writes succeeded silently because the table likely does not exist in production (or RLS denies it for the service role). The endpoint should at minimum surface a 503/500 when zero rows applied AND the input had non-empty modules.

**Suggested fix:**
- Add a "no rows applied" guard returning 503 when the request had ≥1 module but applied=0.
- Run the feature-flags migration in production.

---

## Cross-tenant violations found

**0** — none of the active tests detected a leak. This is the genuinely strong area:
- U7: owner@TNT002 cannot see cajero@TNT001 in `/api/users`.
- U10: owner@TNT002 cannot read a customer of TNT001 (404 returned, defense-in-depth).
- U4 / U5: could not be exercised (cascading skip from U2), but the prior test `tests/e2e/05_multi_tenant.spec.js` already exercises the same dimension for cajero@TNT001 → TNT002 and is green in this codebase.

---

## Feature flags actually applied

**Read pipeline:** working. `GET /api/feature-flags?user_id={uuid}` returns a `modules` object with resolved status per key (e.g. `{"module.recargas":"enabled", ...}`). Status = 200.

**Write pipeline (user override):** broken. `PATCH /api/users/{id}/permissions` accepts the request and returns `200 OK applied:[]` — but no row is persisted. The flag stays `enabled` after the toggle attempt. This is **silent failure** — UI and audit logs would show "200 success" while nothing changed in the DB.

---

## Cleanup

- The test sub-tenant `9f072f31-...` was disabled at the end via `DELETE /api/owner/tenants/{id}` in `afterAll()`. The test customer created in U10 (`b236fab4-...`) was reused from existing TNT001 data (no new creation needed). No new users persisted (because U2 always 500'd, ironically nothing to delete).
- Stale test sub-tenant from earlier exploration (`a8175b43-...`, "Test Round2 Inline") still active; can be cleaned with `DELETE /api/owner/tenants/a8175b43-2c5b-49f4-8e4a-b94ea9b1325e` if desired.

---

## Final verdict

**Multi-tenant flow score: 40 % (4/10).**

| What works | What is broken |
|------------|----------------|
| Sub-tenant creation (U1) | Sub-tenant user creation (U2 → 500) |
| Tenant scoping in `/api/users` (U7) | `/api/login` for new sub-tenant users (U3) |
| Feature-flag READ (U8 partial) | Superadmin tenants listing UNION (U6) |
| Cross-tenant attack prevention (U10) | Feature-flag user-override WRITE (U8 partial) |
| Demo accounts + JWT contract | Inline owner creation in `POST /api/owner/tenants` (G2 — silent 201) |

**Verdict: NOT READY.** The fundamental MVP flow ("SaaS owner creates tenant → tenant gets first user → user logs in") is broken at step 2 in production today. Multi-tenant isolation in the dimensions we COULD test is solid (no data leaks observed), but you cannot onboard a new tenant end-to-end without fixing G1 + G2 + G3.

**Priority fixes (in order):**
1. **G1** — Fix `POST /api/sub-tenants/{id}/users` 500. Pick one users table and stick to it. Without this, no new tenants can have users.
2. **G2** — Fix `pos_users.company_id` NOT NULL violation in inline owner creation. Either set it to the new sub-tenant id or drop NOT NULL in the schema.
3. **G3** — UNION `pos_companies` + `sub_tenants` in superadmin's `GET /api/owner/tenants`, or migrate to single table.
4. **G4** — Fail loudly when feature-flag overrides apply 0 rows.

---

## Files added by this audit (no app code modified)

- `tests/users-multitenant-e2e.spec.js` — the 10-test suite (U1-U10)
- `tests/playwright.b42.config.js` — config pointing the test runner at the new spec
- `tests/b42-results.json` — machine-readable per-test results (auto-generated)
- `tests/b42-playwright-results.json` — Playwright JSON reporter output
- `B42_USERS_MULTITENANT_REPORT.md` — this report
