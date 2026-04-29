# B37 — Launcher + Security Hardening Report

**Date**: 2026-04-27
**Working dir**: `C:\Users\DELL\Downloads\verion 340\`
**Production URL**: https://volvix-pos.vercel.app

---

## 1. Files created

| File | Purpose | Size |
|------|---------|------|
| `volvix-launcher.html` | Unified portal/launcher; landing after login. Single-file HTML+CSS+JS. | ~660 lines |
| `B37_LAUNCHER_REPORT.md` | This report. | — |

The launcher is self-contained: dark gradient + light themes, command palette (Ctrl/Cmd+K), favorites + recents (localStorage), role-aware app catalog, accordion sections, search, ARIA-labelled, mobile responsive. Uses Google Fonts `Inter` only (no other external deps).

---

## 2. Files modified

### Routing / redirects

| File | Change | Lines |
|------|--------|-------|
| `login.html` | Default post-login redirect changed `/salvadorex_web_v25.html` → `/volvix-launcher.html` (both existing-session check at ~L350 and post-`/api/login` at ~L440). Replaced both occurrences via `replace_all`. | ~350, ~440 |
| `404.html` | Added `/launcher`, `/launcher.html`, `/portal`, `/portal.html`, `/home`, `/home.html` aliases to the `REDIRECTS` map. Added `Launcher / Portal` to `KNOWN_PAGES` for fuzzy suggestions. | ~70-77, ~123 |
| `sitemap.xml` | Added `<url>` entry for `/volvix-launcher.html` priority 0.92. | ~27-32 |

### Security hardening — auth-gate added

Each of the following pages received in `<head>`, immediately after `<title>`:

```html
<!-- B37 Security hardening: auth-gate + role guard ... -->
<script src="/auth-gate.js"></script>
<script>
(function(){
  try {
    var t = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
    if (!t) return; /* auth-gate already redirected */
    var p = JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    var role = (p.role || '').toLowerCase();
    if (/* not allowed */) {
      window.location.replace('/volvix-launcher.html?denied=' + encodeURIComponent(location.pathname));
    }
  } catch(e){}
})();
</script>
```

| File | Required role(s) | Behaviour for wrong role |
|------|------------------|--------------------------|
| `volvix-admin-saas.html` | superadmin | redirect → launcher with `?denied=` |
| `volvix-mega-dashboard.html` | superadmin | redirect → launcher with `?denied=` |
| `volvix-audit-viewer.html` | superadmin OR owner | redirect → launcher with `?denied=` |
| `multipos_suite_v3.html` | superadmin OR owner | redirect → launcher with `?denied=` |
| `volvix-vendor-portal.html` | vendor OR owner OR superadmin | redirect → launcher with `?denied=` |
| `volvix-kds.html` | cajero / manager / owner / superadmin | redirect → launcher with `?denied=` |
| `volvix-onboarding-wizard.html` | any authenticated user | (auth-gate only) |
| `volvix-onboarding-v2.html` | any authenticated user | (auth-gate only) |
| `volvix-sandbox.html` | any authenticated user | (auth-gate only) |
| `volvix-pwa-final.html` | any authenticated user | (auth-gate only) |
| `volvix-modals-demo.html` | any authenticated user | (auth-gate only) |
| `volvix-qa-scenarios.html` | any authenticated user | (auth-gate only) |

**Total: 12 admin pages hardened.**

### Auth-gate intentionally NOT added (and why)

| File | Reason |
|------|--------|
| `landing*.html` (10 verticals + `landing_dynamic.html`) | Marketing pages — must be public for ad campaigns. |
| `volvix-customer-portal.html` / `-v2.html` | Customer-facing portal — needs separate customer auth flow (not POS users). |
| `volvix-shop.html` | Public shop. |
| `volvix-kiosk.html` | Designed to be public (self-service kiosko, signs in via `/api/auth/kiosk-token`). |
| `marketplace.html` | Public marketplace. |
| `volvix-gdpr-portal.html` | Per GDPR rules must be reachable without auth. |
| `volvix-grand-tour.html` | Free guided tour for prospects. |
| `volvix-hub-landing.html` | Public hub landing. |
| `404.html` | Error page — never auth-protected. |
| `BITACORA_LIVE.html` | Internal debug; explicitly listed as exempt. The launcher does expose it but only to `superadmin`. |
| `MATRIZ_PRUEBAS_LOCAL*.html` | Local test pages; explicitly listed as exempt. |
| `salvadorex_web_v25.html` | Constraint — DO NOT modify (other agent). It is currently in `auth-gate.js` PUBLIC_PAGES list (existing). |
| `volvix_owner_panel_v7.html` | Constraint — DO NOT modify (other agent). It already loads auth-gate per existing wiring. |

---

## 3. Launcher feature checklist

- [x] Loads `/auth-gate.js` (redirects to login if no JWT/session)
- [x] Reads role from `volvix_token` JWT (`role`, `email`, `tenant_id`) with fallback to `volvixSession`
- [x] Exposes `window.VolvixAuth.getUser()` for downstream code
- [x] 6 grouped sections, collapsible (state persisted in `localStorage`):
  - Mi POS · Gestión del negocio · Diseño y herramientas · Plataforma SaaS · Marketing y onboarding · Documentación
- [x] Role-based filtering with hierarchy: `kiosk(0) < cajero/vendor(1) < manager(2) < owner(3) < superadmin(4)`
- [x] `cajero` sees Mi POS + AI Academy + AI Support + public marketing/docs only
- [x] `owner` adds Gestión, Diseño, Onboarding, Audit Viewer, MultiPOS, Vendor Portal, Customer Portal
- [x] `superadmin` sees everything (Admin SaaS, Mega Dashboard, Bitácora Live, Volvix Remote)
- [x] Empty state when no apps available (or no search hits)
- [x] Search input with live filter
- [x] Favorites (★) — stored in `vlx-launcher-favs`
- [x] Recents (last 5 launched) — stored in `vlx-launcher-recents`
- [x] Command palette `Ctrl/Cmd + K`, arrow nav, Enter to launch, Esc to close
- [x] Theme toggle (dark/light) persisted to `vlx-theme`, uses `--vlx-bg` system
- [x] User chip in top bar: avatar (initials) + full name + role badge + tenant in subtitle
- [x] Logout button clears `volvix_token` / `volvixAuthToken` / `volvixSession`
- [x] Mobile responsive (single-column grid below 720 px, viewport meta correct)
- [x] ARIA: `aria-label`, `aria-expanded`, `aria-controls`, `role="search"`, `role="dialog"`, `aria-modal`, `aria-live`
- [x] `prefers-reduced-motion` support
- [x] SEO: `noindex` (private), OG tags
- [x] Toast feedback for favorite add/remove

---

## 4. How to test

1. Deploy or open via local server pointing at `C:\Users\DELL\Downloads\verion 340\`.
2. Visit `/login.html` and sign in with each demo account (password `Volvix2026!`):

   | Email | Role | Expected groups |
   |-------|------|-----------------|
   | `cajero@volvix.test` | cajero | Mi POS · Diseño (AI Academy/Support only) · Marketing · Docs (basic) |
   | `owner@volvix.test`  | owner  | adds Gestión, Diseño completo, Audit Viewer, Onboarding, all Docs |
   | `admin@volvix.test`  | superadmin | adds Plataforma SaaS (Admin SaaS, Mega Dashboard, Bitácora Live, Volvix Remote) |

3. After login → should auto-land at `/volvix-launcher.html` (not the POS).
4. Direct navigation tests (must redirect):
   - `cajero@volvix.test` → `/volvix-admin-saas.html` → must bounce to `/volvix-launcher.html?denied=...`
   - `owner@volvix.test`  → `/volvix-admin-saas.html` → must bounce to launcher
   - `admin@volvix.test`  → `/volvix-admin-saas.html` → must load OK
   - logged-out → `/volvix-mega-dashboard.html` → must bounce to `/login.html?expired=0&redirect=...`
5. Search: type "audit" — only Audit Viewer shows.
6. `Ctrl+K` opens command palette; `↓ ↓ Enter` launches app.
7. Click ★ on any card → toast "Añadido a favoritos"; refresh → favorite persists; "Favoritos" pseudo-section appears at top.
8. Theme toggle (sun/moon) flips dark↔light, persists across reload.
9. 404 redirects: `/launcher`, `/portal`, `/home` all bounce to `/volvix-launcher.html`.
10. Logout button: should clear all 3 token keys and bounce to `/login.html`.

---

## 5. Suggested marketing screenshots

1. **Hero shot** (dark theme, superadmin role): full launcher with all 6 sections expanded — shows breadth of platform.
2. **Search in action**: "ai" typed in search bar with 3 AI cards visible.
3. **Command palette**: Ctrl+K open with arrow-key navigation highlight on a result.
4. **Mobile view** (375 px): stacked accordions, "Mi POS" expanded, KDS card visible.
5. **Light theme** flipped: shows polish.
6. **Cajero role**: minimal launcher (only Mi POS + Marketing + basic Docs) — emphasizes role-based UI.
7. **Owner role**: middle ground with Gestión + Audit Viewer visible.
8. **Empty state with `?denied=`**: shows the security message after a forbidden redirect (need to add UI for this — see TODOs).

---

## 6. TODOs / follow-ups

- [ ] **Banner for `?denied=`**: Currently the launcher reads the param implicitly (only via URL). Consider adding a top banner: "No tienes permisos para acceder a `/volvix-admin-saas.html`. Aquí están las apps disponibles para tu rol."
- [ ] **Backend role check**: The role guard is client-side only. Sensitive endpoints already enforce role at API level (`req.user.role !== 'superadmin'` checks in `api/index.js`); confirm those exist for every admin route. Client guard is UX only.
- [ ] **Feature flags integration**: `volvix-feature-flags.js` is owned by another agent. Hook to filter `APPS[]` should be added once that agent exposes a stable `window.VolvixFlags.has(name)` API.
- [ ] **`auth-gate.js` PUBLIC_PAGES**: `salvadorex_web_v25.html` is currently in PUBLIC_PAGES list — that looks accidental but per constraints I did NOT modify it. Consider removing in next PR.
- [ ] **Tenant switcher**: For superadmin, add a "switch tenant" dropdown in the user chip (currently shows tenant from JWT only).
- [ ] **i18n**: Strings are Spanish-only; wire to `volvix-i18n-wiring.js` keys later.
- [ ] **`public/auth-gate.js` parity**: There is a duplicate of `auth-gate.js` at `public/auth-gate.js`; both currently identical — keep them in sync if either is edited.
- [ ] **Service worker / PWA**: Launcher is not registered with the app manifest yet. Add to manifest `start_url` if launching as PWA is desired.
- [ ] **Audit log on access denied**: Wire `?denied=` cases to `/api/audit-log` so security team can see attempted lateral movement.

---

## 7. Acceptance summary

- DELIVERABLE 1 (`volvix-launcher.html`): **DONE**
- DELIVERABLE 2 (auth-gate to 12 admin pages): **DONE**
- DELIVERABLE 3 (routing updates: login.html, 404.html, auth-gate.js): **DONE** (auth-gate.js redirect default already points to `/login.html`; the launcher is the post-login destination via login.html)
- DELIVERABLE 4 (sitemap.xml): **DONE**

Constraints respected:
- ✅ `salvadorex_web_v25.html` NOT modified
- ✅ `volvix_owner_panel_v7.html` NOT modified
- ✅ `api/index.js` and migrations NOT modified
- ✅ `volvix-feature-flags.js` and `volvix-uplift-wiring.js` NOT modified
- ✅ Auth-gate added per the explicit allow list only
- ✅ `auth-gate.js` exists at `/auth-gate.js` (and `/public/auth-gate.js`) — verified
- ✅ Launcher works for unauthenticated users (auth-gate redirects to login)
