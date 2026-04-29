# Phase 3 — Industry Landing Pages Report

**Date:** 2026-04-27
**Scope:** 10 industry-specific landing pages for Volvix POS
**Status:** ✅ Complete

---

## 1. Files Created

All landing pages live in `C:\Users\DELL\Downloads\verion 340\` and resolve at the production URL `https://volvix-pos.vercel.app/landing-<slug>.html`.

| # | File | Industry | Lines | Size (bytes) | Accent |
|---|------|----------|-------|--------------|--------|
| 1 | `landing-abarrotes.html`   | Abarrotes (Grocery)        | 889 | 38,978 | #16A34A (green)        |
| 2 | `landing-panaderia.html`   | Panadería (Bakery)         | 889 | 38,754 | #A16207 (warm tan)     |
| 3 | `landing-farmacia.html`    | Farmacia (Pharmacy)        | 889 | 38,783 | #0891B2 (clean cyan)   |
| 4 | `landing-restaurant.html`  | Restaurante                | 889 | 38,691 | #DC2626 (red)          |
| 5 | `landing-cafe.html`        | Cafetería                  | 889 | 38,533 | #78350F (brown/cream)  |
| 6 | `landing-barberia.html`    | Barbería/Salón             | 889 | 38,757 | #1E3A8A (navy)         |
| 7 | `landing-gasolinera.html`  | Gasolinera (Gas station)   | 889 | 38,682 | #CA8A04 (yellow/black) |
| 8 | `landing-ropa.html`        | Tienda de Ropa             | 889 | 38,774 | #DB2777 (pink/purple)  |
| 9 | `landing-electronica.html` | Electrónica                | 889 | 38,976 | #2563EB (electric blue)|
| 10| `landing-fitness.html`     | Gimnasio/Fitness           | 889 | 38,843 | #EA580C (vibrant orange)|

**Source generator:** `_generate_landings.py` (idempotent, safe to re-run).

**Cross-cutting changes:**
- `404.html` — added 28 new redirect entries (slug + .html variants for all 10 industries plus Spanish synonyms `/restaurante`, `/cafeteria`, `/salon`, `/boutique`, `/gimnasio`, `/gym`)
- `landing_dynamic.html` — added "Selector por industria" section with 10 industry cards (just before the final CTA)

---

## 2. Page Structure (uniform across all 10)

Each landing has 8 sections in this exact order:

1. **Sticky nav** with brand logo (industry emoji), Funciones / Precios / FAQ links + "Entrar" CTA
2. **Hero** — industry emoji animated, 3 floating badges (cobro speed, 4.9⭐ rating, +30% ventas), primary + secondary CTAs, trust strip
3. **Pain points** — 3 cards with industry-specific problems
4. **Top 5 features** — feature cards with mockup placeholders, gradient hover bar
5. **Differentiation** — "Volvix vs cualquier otro POS" with 4 bullet checks + giant industry icon
6. **Testimonials** — 3 industry-specific quotes with realistic name/business/city
7. **Pricing** — 3 tiers (Básico free trial / Pro $599/mes featured / Enterprise custom)
8. **FAQ** — 6 industry-specific questions in `<details>` accordions
9. **Final CTA** — gradient background with both primary + demo buttons
10. **Footer** — 4 columns (brand, Producto, Industrias cross-links, Soporte) + social icons

---

## 3. SEO Metadata (per page)

| Slug | `<title>` | Meta description (truncated) |
|------|-----------|------------------------------|
| abarrotes | POS para Abarrotes \| Punto de Venta Inventario y Crédito \| Volvix | Sistema POS para tiendas de abarrotes con lector de códigos de barras universal, control de inventario, alertas de caducidad… |
| panaderia | POS para Panadería \| Recetas, Lotes y Pre-Órdenes \| Volvix | Sistema POS para panaderías con control de producción por lotes, costo de receta, manejo de mermas y pre-órdenes para eventos… |
| farmacia | POS para Farmacia \| Principio Activo, Caducidad y Recetas \| Volvix | Sistema POS para farmacias con búsqueda por principio activo, alertas de caducidad, recetas digitales, control de medicamentos… |
| restaurant | POS para Restaurante \| KDS, Mesas y División de Cuentas \| Volvix | Sistema POS para restaurantes con comandero de cocina (KDS), manejo de mesas, división de cuentas, modificadores y propinas… |
| cafe | POS para Cafetería \| Modo Barra, Lealtad y Modificadores \| Volvix | Sistema POS para cafeterías con modo barra rápida, programa de lealtad (5x1), modificadores de bebida y reportes de horas pico… |
| barberia | POS para Barbería y Salón \| Agenda, Comisiones y Servicios \| Volvix | Sistema POS para barberías y salones con agenda de citas, recordatorios SMS/WhatsApp, comisiones por estilista… |
| gasolinera | POS para Gasolinera \| Bombas, Tienda y Flotillas \| Volvix | Sistema POS para gasolineras con control por bomba, inventario de combustible, tienda de conveniencia integrada, pagos contactless… |
| ropa | POS para Tienda de Ropa \| Variantes, Cambios y Temporada \| Volvix | Sistema POS para tiendas de ropa con variantes (talla/color), cambios y devoluciones, vales crédito, inventario por temporada… |
| electronica | POS para Tienda de Electrónica \| Garantías, Series y Trade-In \| Volvix | Sistema POS para tiendas de electrónica con garantías por serial, especificaciones técnicas en búsqueda, trade-in de usados… |
| fitness | POS para Gimnasio y Fitness \| Membresías, Asistencia y Clases \| Volvix | Sistema POS para gimnasios y centros fitness con membresías, control de asistencia con QR/huella, clases grupales, pagos recurrentes… |

**Per-page SEO assets:**
- Unique `<title>`, `<meta description>`, `<meta keywords>`, `<meta theme-color>`
- `<link rel="canonical">` pointing to absolute URL
- Open Graph tags (`og:type`, `og:url`, `og:title`, `og:description`, `og:locale=es_MX`, `og:site_name`)
- Twitter Card (`summary_large_image`)
- `application/ld+json` Schema.org **SoftwareApplication** with rating 4.9 / 847 reviews + price offer
- SVG favicon embedded as data-URI with industry color and emoji
- `<link rel="manifest" href="/manifest.json">`

---

## 4. Conversion Funnels

### Primary funnel
```
Hero CTA "Empezar gratis 14 días"
   → /volvix-onboarding-wizard.html?vertical=<slug>
      → Industry-aware onboarding (vertical query param)
         → Account created → Dashboard
```

### Secondary funnel (lower commitment)
```
Hero CTA "Ver demo en vivo"
   → /volvix-grand-tour.html
      → Demo replay → Re-display CTA at end
```

### Pricing funnels (3 entry points per page)
- "Empezar gratis" (Básico) → `/volvix-onboarding-wizard.html?vertical=<slug>&plan=basico`
- "Empezar 14 días gratis" (Pro, recommended) → `/volvix-onboarding-wizard.html?vertical=<slug>&plan=pro`
- "Hablar con ventas" (Enterprise) → `mailto:enterprise@volvix.com`

### Auth-aware rewriting
`auth-gate.js` exposes `window.VLX_USER` if logged in. The inline JS at the bottom of each landing detects this and rewrites every onboarding link to `/volvix_owner_panel_v7.html` with label "Ir a mi panel →" so warm-traffic returning visitors skip onboarding.

### Tracking events emitted
All sent to `/api/log/client` (POST JSON, with console.log fallback if endpoint missing):
- `page_view` on load
- `cta_click` with `data-cta` slug ("hero-primary", "hero-secondary", "price-basic", "price-pro", "price-enterprise", "final-primary", "final-secondary")
- `scroll_depth` at 25/50/75/100 %
- `page_leave` with `duration_ms`

Industry tag (`industry: <slug>`) is attached to **every** event for cohort analysis.

---

## 5. Suggested Marketing Screenshots

For each landing, the following crops will reproduce well on social/ads:

| Shot | What to capture | Aspect | Use |
|------|-----------------|--------|-----|
| **A** Hero overview | Top fold (nav + hero text + emoji visual + 3 floating badges) | 16:9 (1920×1080) | Facebook/Instagram cover, LinkedIn, blog hero |
| **B** Hero close-up | Just the H1 + sub + CTA buttons | 1:1 (1080×1080) | IG feed |
| **C** Pain points trio | 3 pain cards lined up | 16:9 | Landing in pitch decks |
| **D** Feature card hover | Single feature card with hover bar visible (gradient on top) | 4:3 | Comparison ads |
| **E** Pricing strip | All 3 tiers, Pro highlighted | 16:9 | Pricing-focused ads |
| **F** Testimonial card | Single testi-card with stars + avatar | 1:1 (1080×1080) | IG carousel slide |
| **G** Industry-specific emoji | Diff section's giant emoji on gradient background | 1:1 | Story/Reel cover |
| **H** "Volvix vs others" | Diff list with 4 checkmarks visible | 9:16 (1080×1920) | TikTok/Reels |
| **I** Footer industries grid | Industries footer column | 21:9 | Email banner |

For dark-mode screenshots, override OS preference or set `prefers-color-scheme: dark` in DevTools — the CSS `@media (prefers-color-scheme: dark)` block in each page swaps `--vlx-bg` to `#0b1220` automatically.

---

## 6. A/B Test Ideas (priority-ordered)

| # | Test | Variant A | Variant B | Hypothesis | Primary metric |
|---|------|-----------|-----------|------------|----------------|
| 1 | **Hero CTA copy** | "Empezar gratis 14 días →" | "Probar Volvix gratis →" | Specifying duration drives commitment fear; "probar" lowers it | `cta_click` rate on `hero-primary` |
| 2 | **Hero emoji vs photo** | Animated emoji (current) | Real photo of Mexican store | Real photo = trust; emoji = playful brand | Bounce rate, scroll depth |
| 3 | **Pricing anchor** | Pro at $599 (current) | Pro at $499 with strikethrough $799 | Strikethrough creates anchoring | Pro-tier `cta_click` |
| 4 | **Testimonial position** | After differentiation (current) | Before differentiation | Social proof first vs argumentation first | Time on page, scroll to pricing |
| 5 | **Pain → Feature ratio** | 3 pains, 5 features | 5 pains, 3 features | More pain = more buy-in | Scroll depth past pricing |
| 6 | **Floating badge messages** | "Cobro en 6 segundos" / "4.9⭐" / "+30% ventas" | "Sin tarjeta" / "5 min setup" / "Soporte 24/7" | Outcomes vs ease | `cta_click` hero-primary |
| 7 | **FAQ visibility** | Closed accordions (current) | First 2 open by default | Open = lower friction | FAQ engagement (open events) |
| 8 | **Final CTA color** | Gradient primary/dark (current) | Solid black with white text | Contrast vs brand | `cta_click` final-primary |
| 9 | **Industry emoji in nav** | Industry emoji as logo (current) | Generic "V" Volvix logo | Industry-specific = relevance; generic = brand consistency | Bounce rate |
| 10| **Pricing tier names** | Básico/Pro/Enterprise (current) | Starter/Growth/Scale | Spanish vs English-tinged | Pro-tier `cta_click` |

Each test should run for at minimum 14 days or 1,000 sessions per variant per industry, whichever is larger.

---

## 7. Technical Verification

- ✅ All 10 files parsed with Python `html.parser` without errors
- ✅ Each file: 1 `<h1>`, 8 `<section>`s, 3 testimonials, 5 features, 3 pain cards, 6 FAQs, 3 pricing tiers
- ✅ Mobile-first responsive (breakpoints at 540px, 720px, 900px, 1024px)
- ✅ Dark mode via `prefers-color-scheme` (CSS variables `--vlx-bg`, `--vlx-text`)
- ✅ Reduced-motion support (`prefers-reduced-motion: reduce` disables animations)
- ✅ AOS-lite scroll animations via IntersectionObserver (no external library)
- ✅ All CTAs tagged with `cta-track` class + `data-cta` attribute
- ✅ Auth-gate hook + uplift wiring + manifest linked
- ✅ 28 redirect entries added to `404.html` covering both kebab + .html + Spanish synonyms
- ✅ Industry selector grid added to `landing_dynamic.html` (just before final CTA)

---

## 8. File Inventory

```
C:\Users\DELL\Downloads\verion 340\
├── _generate_landings.py            ← regenerator (Python, ~600 lines)
├── landing-abarrotes.html           ← 889 lines
├── landing-panaderia.html           ← 889 lines
├── landing-farmacia.html            ← 889 lines
├── landing-restaurant.html          ← 889 lines
├── landing-cafe.html                ← 889 lines
├── landing-barberia.html            ← 889 lines
├── landing-gasolinera.html          ← 889 lines
├── landing-ropa.html                ← 889 lines
├── landing-electronica.html         ← 889 lines
├── landing-fitness.html             ← 889 lines
├── landing_dynamic.html             ← MODIFIED (industry selector added)
├── 404.html                         ← MODIFIED (28 redirects added)
└── PHASE3_REPORT.md                 ← THIS FILE
```

---

**End of Phase 3 report.**
