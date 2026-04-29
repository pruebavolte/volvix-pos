# B43 — Marketplace SEO + UX Fix Report

**Fecha:** 2026-04-27
**Scope:** marketplace.html, volvix-shop.html, volvix-customer-portal.html
**Trigger:** R6-H audit found ZERO OG/Twitter/canonical/Schema.org tags + customer portal blank-screen bug + mobile breaks

---

## Resumen ejecutivo

| Tarea | Estado | Notas |
|---|---|---|
| T1 — Marketplace SEO | DONE | Full OG, Twitter, JSON-LD WebSite+Organization+WebPage+SoftwareApplication, canonical, favicons referenced |
| T2 — Shop SEO | DONE | Full OG, Twitter, JSON-LD Store+WebPage, canonical, favicons, Product microdata en cards |
| T3 — Customer Portal SSO loader | DONE | Three-state machine: loader (default) → app | login (fallback). Safety timeout 5s evita pantalla en blanco |
| T4 — Mobile responsive | DONE | Breakpoints 1024px / 768px / 640px / 480px / 380px en los 3 archivos |
| T5 — OG image generation hint | DONE | `marketplace-assets/README.md` con specs, templates y checklist de generación |

**Verificación final:** `python html.parser` parsea los 3 archivos sin errores. Todos los meta tags requeridos presentes. JSON-LD válido en los 3.

---

## Archivos modificados

### 1. `marketplace.html` (1132 → 1216 líneas, +84 líneas netas)

**HEAD adicionado (líneas 4-130):**
- `<meta name="description">` 151 chars (sweet spot 150-160)
- `<meta name="keywords">`, `author`, `robots`, `theme-color #2D5F8F`
- `<link rel="canonical">`
- 8 OG tags (type, site_name, locale es_MX, title, description, image, image:width/height/alt, url)
- 6 Twitter tags (card=summary_large_image, site, title, description, image, image:alt)
- 4 favicon links (16x16, 32x32, apple-touch-icon, site.webmanifest)
- JSON-LD `@graph` con 4 nodos: `WebSite` (con SearchAction), `Organization`, `WebPage` (con BreadcrumbList), `SoftwareApplication` (con AggregateRating)

**BODY adicionado:**
- `<noscript>` fallback SEO con CTA al wizard (línea ~520)
- `aria-label`/`role="search"`/`<label for>` para accesibilidad en hero search
- Stat "37 páginas dedicadas con demos en vivo" añadido al stats grid (sustituye al stat redundante de "3 plataformas")

**CSS adicionado (líneas 503-565):**
- `@media (max-width: 1024px)` — tablet adjustments
- `@media (max-width: 640px)` — mobile completo: nav wrap, search-box vertical, AI card stacked, popular grid 2-col, etc.
- `@media (max-width: 380px)` — extra-small phones

### 2. `volvix-shop.html` (266 → 388 líneas, +122 líneas netas)

**HEAD reemplazado (líneas 4-100):**
- Title: "Tienda Volvix · Productos POS, accesorios y servicios"
- `<meta name="description">` 159 chars
- 8 OG + 6 Twitter tags
- 3 favicons referenciados
- JSON-LD `@graph` con 2 nodos: `Store` (con `hasOfferCatalog`, `paymentAccepted`, `currenciesAccepted=MXN`, `areaServed=MX`) y `WebPage` con BreadcrumbList

**BODY adicionado:**
- `<noscript>` fallback
- `role="banner"`, `role="main"`, `role="search"`, `aria-label`, `<label>` ocultos para a11y
- Product cards ahora son `<article itemscope itemtype="https://schema.org/Product">` con `itemprop` en `name`, `image`, `sku`, `category`, y `<meta itemprop="price">` + `priceCurrency` + `availability=InStock` dentro del `Offer`

**CSS adicionado:**
- Media query 780px ampliada
- Media query 480px (productos en 2-col, header wrap)
- Media query 380px (productos en 1-col, imagen grande)

### 3. `volvix-customer-portal.html` (662 → 808 líneas, +146 líneas netas)

**HEAD ampliado:**
- Añadidos: `keywords`, `author`, `og:site_name`, `og:locale=es_MX`, `og:image:width/height`, `twitter:site`, 3 favicons, JSON-LD `WebApplication` con publisher
- Robots cambiado de `index, follow` → `noindex, follow` (correcto: portal autenticado no debe indexarse)
- Imagen OG cambiada de `/og-default.png` → `/marketplace-assets/og-default.png` (consistente con resto)

**BODY/SSO loader fix (líneas ~175-200, ~510-590):**
- Nuevo elemento `#ssoLoader` con spinner CSS visible por defecto
- `#loginScreen` ahora `display:none` por defecto (lo activa JS si no hay JWT)
- Función `_ssoSetState('loader'|'app'|'login')` centraliza el control de visibilidad
- IIFE `customerSSOCheck` actualizado:
  1. Default state = `loader` (spinner visible mientras verifica JWT)
  2. Sin JWT → intenta `location.replace('/login.html?...')`. Si redirect tarda >1.2s, fallback a estado `login` con CTA visible.
  3. JWT inválido/malformado → limpia tokens + estado `login`
  4. JWT expirado → limpia + redirect + fallback timer
  5. JWT válido → `enterApp()` que llama `_ssoSetState('app')`
  6. Safety net: a 5s, si seguimos en loader, forzar `login` para nunca dejar pantalla en blanco
- `enterApp` ahora usa `_ssoSetState('app')` en vez de manipular DOM directamente

**CSS adicionado:**
- `.sso-loader` + `.sso-spinner` con animation
- Media query 768px ampliada (stats grid responsive, reward-list 2-col, login-card padding)
- Media query 640px nueva (todo el portal compacto: topbar wrap, stats 2x2, tabla compacta, modal margin)
- Media query 380px nueva (stats 1-col, ocultar columnas 4+ de tablas)

### 4. `marketplace-assets/README.md` (NEW, 132 líneas)

Especifica:
- 3 imágenes OG 1200×630 requeridas (`og-marketplace`, `og-shop`, `og-default`)
- 4 favicons (16, 32, apple-touch, .ico)
- 3 PWA icons (192, 512, logo Schema.org) + plantilla `site.webmanifest`
- Plan de generación recomendado (Figma → realfavicongenerator.net)
- Validadores externos (FB Debugger, Twitter Validator, schema.org validator, Google Rich Results)
- Brand colors `#2D5F8F` / `#EA580C` documentados

---

## SEO Checklist (verificado con Python regex)

| Tag | marketplace | shop | portal |
|---|---|---|---|
| `<title>` | OK | OK | OK |
| `description` 150-160 chars | OK 151 | OK 159 | OK 116 (noindex) |
| `keywords` | OK | OK | OK |
| `author` | OK | OK | OK |
| `robots` | OK index | OK index | OK noindex |
| `theme-color` | OK #2D5F8F | OK #2D5F8F | OK #1e3a8a |
| `canonical` | OK | OK | OK |
| `viewport` (con viewport-fit=cover) | OK | OK | OK |
| `og:type` | OK | OK | OK |
| `og:site_name` | OK | OK | OK |
| `og:locale` es_MX | OK | OK | OK |
| `og:title` | OK | OK | OK |
| `og:description` | OK | OK | OK |
| `og:image` 1200×630 | OK | OK | OK |
| `og:image:width/height` | OK | OK | OK |
| `og:image:alt` | OK | OK | — |
| `og:url` | OK | OK | OK |
| `twitter:card` summary_large_image | OK | OK | OK |
| `twitter:site` @VolvixPOS | OK | OK | OK |
| `twitter:title/description/image` | OK | OK | OK |
| `twitter:image:alt` | OK | OK | — |
| Favicons (16/32/apple-touch) | OK | OK | OK |
| Web Manifest | OK | — | — |
| JSON-LD válido | OK 4 nodos | OK 2 nodos | OK 1 nodo |
| Schema.org tipos | WebSite, Organization, WebPage, SoftwareApplication | Store, WebPage | WebApplication |
| Microdata Product en cards | — | OK itemscope/itemprop | — |
| BreadcrumbList | OK | OK | — |
| `<noscript>` fallback | OK | OK | — |
| ARIA labels | OK | OK | OK existente |

---

## Mobile breakpoints añadidos

| Breakpoint | marketplace | shop | portal |
|---|---|---|---|
| 1024px (tablet) | OK | — | — |
| 780px | — | OK ampliado | — |
| 768px (tablet/phone) | — | — | OK ampliado |
| 640px (phone) | OK completo | — | OK nuevo |
| 480px (small phone) | — | OK nuevo | — |
| 380px (xs phone) | OK | OK | OK |

**Patrones de adaptación:**
- Nav: `flex-wrap: wrap`, ocultar links secundarios en <640px
- Grids: 4-col → 2-col → 1-col según viewport
- Search box: horizontal → vertical (input full-width arriba, botón abajo)
- Modales: padding reducido, márgenes laterales 8px
- Tablas: ocultar columnas no críticas en <380px
- Topbar / header: wrap + flex 1 en `<h1>` para que ocupe primera fila

---

## Customer Portal SSO loader fix — verificación lógica

**Estados antes (BUG):**
- `#loginScreen` `display:flex` por defecto → "Redirigiendo al login…"
- `#app.active` siempre oculto hasta `enterApp()`
- Si redirect fallaba o tardaba, usuario veía mensaje sin CTA útil
- R6-H audit: ambos elementos parecían invisibles → diagnosis "blank screen"

**Estados ahora (FIX):**
- Estado inicial: `#ssoLoader` (spinner azul Volvix con texto "Verificando tu sesión…")
- Estado `app`: `#app.active` (portal cargado)
- Estado `login`: `#loginScreen.display=flex` (CTA "Iniciar sesión" + link "Volver al inicio")

**Transiciones:**
1. Page load → loader visible
2. Has valid JWT → `enterApp(email)` → state=`app`
3. No JWT → intenta `location.replace('/login.html?redirect=...')`. Si redirect no dispara en 1.2s, state=`login`
4. JWT expirado → limpia tokens, intenta redirect, fallback `login`
5. JWT malformado → limpia tokens, state=`login` directo
6. **Safety timeout 5s:** si por cualquier razón seguimos en loader (catch silencioso, etc.), forzar `login` para nunca dejar pantalla en blanco

**Self-walkthrough (R5 charter):**
- Usuario abre portal sin sesión → ve spinner azul ~200ms → redirect a /login.html (caso normal). Si /login.html cae, después de 1.2s ve pantalla con CTA "Iniciar sesión" y "Volver al inicio". 
- Usuario abre con JWT válido → spinner ~50ms → portal carga normal. 
- Usuario abre con JWT roto/expirado → spinner → tokens limpiados → redirect O fallback login screen. 
- Caso peor (JS falla en mid-stream) → 5s timeout → login screen. NUNCA pantalla en blanco. 

---

## Pendientes (out of scope B43)

- [ ] Generar las 3 imágenes OG físicas en `marketplace-assets/` (specs documentadas en README)
- [ ] Generar favicons + manifest (specs documentadas)
- [ ] Verificar OG previews tras deploy con Facebook Sharing Debugger / Twitter Validator
- [ ] Conectar el `<link rel="manifest">` con un `site.webmanifest` real (PWA install prompt)
- [ ] Confirmar que `/login.html` central (referenciado por SSO) existe y maneja `?redirect=` y `?expired=1`

---

## Constraints respetados

- NO se modificó `api/index.js` ni `salvadorex_web_v25.html`
- NO se modificó `volvix-feature-flags.js` ni `auth-gate.js`
- Brand colors: marketplace y shop ahora usan `theme-color=#2D5F8F` (azul primario Volvix); portal mantiene `#1e3a8a` (su tono ya existente, dentro de gama azul Volvix)
- Los 3 HTML parsean limpio con `python html.parser`
- JSON-LD válido en los 3 (verificado con `json.loads`)

---

## Comandos de verificación reproducibles

```bash
# Parse + meta tag check
cd "C:/Users/DELL/Downloads/verion 340"
python -c "import html.parser, re
class V(html.parser.HTMLParser):
    def __init__(self): super().__init__(); self.tags=[]
    def handle_starttag(self,t,a): self.tags.append(t)
for f in ['marketplace.html','volvix-shop.html','volvix-customer-portal.html']:
    p=V(); open(f,encoding='utf-8').read() and p.feed(open(f,encoding='utf-8').read())
    print(f'{f}: OK ({len(p.tags)} tags)')"

# JSON-LD check
python -c "import re,json
for f in ['marketplace.html','volvix-shop.html','volvix-customer-portal.html']:
    c=open(f,encoding='utf-8').read()
    for b in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', c, re.DOTALL):
        json.loads(b)  # raises if invalid
    print(f'{f}: JSON-LD OK')"
```

---

_B43 fix completado · marketplace.html + volvix-shop.html + volvix-customer-portal.html + marketplace-assets/README.md_
