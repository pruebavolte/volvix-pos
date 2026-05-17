# 🚀 HANDOFF — Próxima sesión empieza AQUÍ

> **Para Claude/IA que retoma este proyecto**: lee este documento PRIMERO. Tiene todo el contexto comprimido.

---

## 📍 DÓNDE NOS QUEDAMOS (estado actual exacto)

| Item | Valor |
|---|---|
| **Fecha último commit** | 2026-05-17 |
| **Último commit prod** | `5249576` (feat(v6-motor-v3): 6 marcas premium nuevas) |
| **Versión producto** | **1.0.344** |
| **URL en vivo** | https://systeminternational.app/ |
| **Tag** | `v1.0-production-ready` |
| **Repo** | github.com/pruebavolte/volvix-pos |
| **Branch** | main |
| **Working dir local** | `D:\github\volvix-pos\` |
| **Worktree** | `D:\github\volvix-pos\.claude\worktrees\mystifying-raman-33a025\` |

---

## 🎯 LO QUE EL USUARIO QUIERE AHORA

**Objetivo final**: 460 landings premium con identidad única (60 reparaciones + 400 nuevas)

**Approach acordado**:
- Usuario genera marcas en formato JSON usando el template
- Entrega ZIPs con 5-50 marcas por batch
- Yo (Claude) hago la integración mecánica al sistema

**Por qué este approach**:
- 460 landings × 70KB HTML = imposible en una sesión Claude (40-80 hrs continuas)
- Usuario tiene acceso a otras IAs que pueden generar landings en paralelo
- Yo solo necesito hacer integración: parsear JSON → agregar a brands.config.js → crear HTML → actualizar router → commit + push

---

## 📂 ESTADO DEL SISTEMA

### Marcas premium activas (11)

| # | Marca | Slug | Giro | Vibe |
|---|---|---|---|---|
| 1 | Pareo | pareo | Zapatería | editorial |
| 2 | Comandero | comandero | Restaurante | vibrant |
| 3 | Navaja | navaja | Barbería | darkPremium |
| 4 | Receta | receta | Farmacia | clinical |
| 5 | Tendito | tendito | Abarrotes | warmLocal |
| 6 | Espuma | espuma | Cafetería | warmCozy |
| 7 | Pata | pata | Veterinaria | playful |
| 8 | Refacciona | refacciona | Taller mecánico | industrial |
| 9 | Pétalo | petalo | Florería | romantic |
| 10 | Repe | repe | Gimnasio | athletic |
| 11 | Burbuja | burbuja | Lavandería | fresh |

URL de cada una: `https://systeminternational.app/{slug}.html`
Cobertura SMB mexicano: **~90%**

### Landings genéricas (60) — pendientes de reparar

Archivos `public/landing-*.html` con template plano que todas se ven iguales.
Lista completa en: `.audit/evidence/2026-05-17/listas-giros/B-60-giros-a-reparar.txt`

### 400 giros nuevos por generar

Lista completa en: `.audit/evidence/2026-05-17/listas-giros/C-400-giros-nuevos.txt`
Distribuidos en 9 sectores:
- Alimentos y Bebidas (60)
- Salud y Bienestar (50)
- Belleza y Estética (45)
- Retail y Tiendas (60)
- Servicios Técnicos (50)
- Educación (30)
- Servicios Profesionales (35)
- Deporte y Recreación (35)
- Entretenimiento y Eventos (35)

---

## 🔧 ARQUITECTURA DEL SISTEMA

### Stack
- **Frontend**: HTML/CSS/JS vanilla + PWA (sw.js) + Capacitor bridge para APK
- **Backend**: Node.js HTTP nativo en `api/index.js` (~41k líneas)
- **Deploy**: Vercel serverless functions
- **DB**: Supabase (PostgreSQL + Realtime + RLS)
- **Auth**: JWT HS256 con jti para revocación
- **Captcha**: Cloudflare Turnstile (real, validando contra siteverify)

### Variables de entorno Vercel production
```
SUPABASE_URL=https://zhvwmzkcqngcaqpdxtwr.supabase.co
SUPABASE_SERVICE_KEY=eyJ... (configurada)
TURNSTILE_SITE_KEY=0x4AAAAAADQl0S9UlQgcmAQg
TURNSTILE_SECRET_KEY=0x4AAAAAADQl0WhnqNX3oPUPx4F6bHswWTw
CAPTCHA_ENABLED=true
JWT_SECRET=(configurada en Vercel)
RESEND_API_KEY=(configurada)
ALLOW_TEST_TENANTS=false
```

### Archivos clave del marketplace (NO TOCAR sin razón)

| Archivo | Función |
|---|---|
| `public/marketplace.html` | Landing principal `/`. Contiene `searchGiro()`, `quickSearch()`. ID críticos: `#giro-input`, `#popular-grid`, `#industry-filters`, `#ai-response` |
| `public/volvix-brand-router.js` | Intercepta `quickSearch`/`searchGiro`, mapea giro → marca premium (líneas ~24-90 son los aliases). Usa `window.load` (no DOMContentLoaded) para no ser sobrescrito por marketplace |
| `public/brands.config.js` | Define `const BRAND_X` para cada marca (28KB+). Al final: `const BRANDS = {...}` y `const SOCIAL_PROOF = [...]`. NO expone a window (es scope-local pero compartido entre scripts) |
| `public/motor.html` | Template universal (no se usa directo, cada marca tiene su propio archivo que copia este) |
| `public/{slug}.html` | Cada marca tiene su archivo (pareo.html, comandero.html, etc.) que es copia del motor con `?b={slug}` como default |

### Cómo funciona el render
1. Usuario navega a `/pareo.html` → carga el motor template
2. Script JS embebido lee `?b=pareo` del URL
3. Carga `brands.config.js` (define `BRANDS.pareo`)
4. Render motor llama `renderBrand(BRANDS.pareo)` que arma el DOM
5. Renderiza: nav, hero, gallery, **livedemo**, features, stats, quote, thefts, cta, footer + sticky CTA + social proof toast

### Tipos de liveDemo soportados (NO inventar nuevos)
- `stock` → grid tallas × colores (zapatería, ropa, joyería)
- `kds` → cocina en vivo con órdenes (cafetería, restaurante, florería)
- `booking` → agenda con barberos/slots (barbería, vet, taller, gym)
- `expiry` → fechas de vencimiento (farmacia, lavandería con entregas)
- `fiado` → pizarra de deudas (abarrotes, tiendas de barrio)

---

## ⚠️ BUGS HISTÓRICOS — NO REPETIR

### Bug 1: Reload loop por `window.location.search = ...`
- **Síntoma**: HTMLs del motor cargan title pero body queda vacío (11 nodes)
- **Causa**: línea `window.location.search = window.location.search || '?b=X'` causa reload del browser
- **Fix**: SIEMPRE eliminar esa línea. Usar solo `history.replaceState(null, '', '?b=X')`
- **Aplicado en**: pareo.html, comandero.html, navaja.html, receta.html, tendito.html + 6 nuevas

### Bug 2: `searchGiro`/`quickSearch` no en window
- **Síntoma**: click "Buscar mi sistema" no hace nada, console error "ReferenceError: searchGiro is not defined"
- **Causa**: Funciones definidas dentro de `DOMContentLoaded` callback son scope-local
- **Fix**: Después de definirlas, `window.searchGiro = searchGiro; window.quickSearch = quickSearch;`
- **Aplicado en**: marketplace.html líneas 1662 y 2139

### Bug 3: Brand-router overridden por marketplace
- **Síntoma**: router parece cargarse pero `quickSearch` retorna versión vieja
- **Causa**: marketplace.html en DOMContentLoaded reasigna `window.quickSearch = quickSearch` DESPUÉS del router
- **Fix**: brand-router usa `window.addEventListener('load', init)` que dispara DESPUÉS de DOMContentLoaded + setTimeout 50ms para re-aplicar
- **Aplicado en**: volvix-brand-router.js líneas 263-275

### Bug 4: CSP bloquea Turnstile
- **Síntoma**: registro.html muestra error "captcha_required" pero widget no aparece
- **Causa**: CSP no incluye `challenges.cloudflare.com`
- **Fix**: agregar a script-src + connect-src + frame-src
- **Aplicado en**: vercel.json línea 64, api/index.js línea 725

### Bug 5: CTAs muertos (`href="#"`) en landings nuevas
- **Síntoma**: cliente llega a landing, click "Empezar gratis" no hace nada
- **Causa**: Generador inicial puso `href="#"` en todos los CTAs
- **Fix**: sed batch reemplaza:
  - `href="#" v-btn-primary v-btn-lg` → `/registro.html?giro={giro}`
  - `href="#" v-btn-ghost (Acceder)` → `/login.html`
  - `href="#" Hablar con humano` → `https://wa.me/528112345678`
  - `<li><a href="#">Crear cuenta</a></li>` → `<li><a href="/registro.html?giro={giro}">Crear cuenta</a></li>`
  - Soporte/Privacidad/Términos/Nosotros → URLs reales

### Bug 6: Service Worker cache stale
- **Síntoma**: Cambios en `brands.config.js` no se reflejan
- **Causa**: SW cachea archivos JS
- **Fix natural**: deploy nuevo invalida cache. Hard refresh (Ctrl+Shift+R) si urgente
- **Indicador**: si `BRAND_X` aparece undefined en runtime pero archivo está bien → SW cache

### Bug 7: Encoding inconsistente
- Algunos archivos en CRLF (Windows) otros LF (Unix). Git warning normal, no afecta función

---

## 📋 PLANTILLA DE INTEGRACIÓN — Qué hacer cuando llega un ZIP del usuario

Cuando el usuario diga "@C:\Users\DELL\Downloads\volvix-marcas-batch-N.zip lo integras":

### Step 1: Extracción y validación
```bash
cd /d/github/volvix-pos
mkdir -p .audit/_user_batch_N
cd .audit/_user_batch_N
unzip -o '/c/Users/DELL/Downloads/volvix-marcas-batch-N.zip'

# Listar
ls *.json
```

### Step 2: Validar schema de cada JSON
Por cada marca, validar que tiene:
- slug, brand, tagline, giro, giroPlural, vibe
- palette con 8 colores (bg, surface, paper, ink, ink2, muted, line, accent, accent2)
- fonts con 4 (display, body, script, mono)
- hero (eyebrow, h1, deck, ctaPrimary, ctaSecondary, metaLine)
- images con hero + 9 showcase + 3 context (URLs Unsplash)
- liveDemo con type (uno de 5 válidos) + data
- features (exactamente 6)
- stats (exactamente 4)
- quote (text, sig, role)
- thefts (exactamente 3)

### Step 3: Para cada JSON válido, integrar en `brands.config.js`

1. **Convertir JSON a JavaScript const**:
```javascript
// =============================================================
// BRAND_X — {Giro} ({vibe} vibe)
// =============================================================
const BRAND_X = {
  slug:'x', brand:'X', tagline:'...',
  // ... resto del config
};
```

2. **Insertar** ANTES de `// SOCIAL PROOF` (línea ~480)

3. **Registrar** en BRANDS:
```javascript
const BRANDS = {
  pareo: BRAND_PAREO,
  // ...
  x: BRAND_X,   // ← agregar aquí
};
```

4. **Agregar social proof entry**:
```javascript
const SOCIAL_PROOF = [
  // ...
  {brand:'X', biz:'{nombre real}', city:'{ciudad}, EDO', when:'hace {N} min'},
];
```

### Step 4: Crear archivo HTML
```bash
cp public/pareo.html public/{slug}.html
sed -i "s|history.replaceState(null, '', '?b=pareo')|history.replaceState(null, '', '?b={slug}')|g" public/{slug}.html
# Actualizar title con sed
```

### Step 5: Actualizar router
Editar `public/volvix-brand-router.js` agregando aliases del ROUTER-MAPPINGS.json del usuario:
```javascript
var VLX_BRANDS = {
  // ...
  '{alias_giro}': { brand: 'X', url: '{slug}.html' },
};
```

### Step 6: Bump version + commit + push
```bash
# Actualizar public/version.json a +1 patch
git add public/brands.config.js public/volvix-brand-router.js public/{slug}.html public/version.json
git commit -m "feat(motor): N marcas premium nuevas - {lista nombres}"
git push origin main
```

### Step 7: Verificar deploy
```bash
until curl -s "https://systeminternational.app/version.json" | grep -q '"version": "1.0.X"'; do sleep 6; done

# Verificar cada landing
for slug in {lista_slugs}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://systeminternational.app/${slug}.html")
  echo "$slug: HTTP $code"
done
```

### Step 8: Visual check (opcional, una marca)
Abrir Chrome MCP → navegar a `https://systeminternational.app/{slug}.html` → screenshot → confirmar hero renderiza

---

## 🗂 ARCHIVOS CLAVE PARA LA PRÓXIMA SESIÓN

### Reportes finales por ciclo
- `.audit/REPORTE-FINAL-V6-VISUAL.md` — Último audit visual completo
- `.audit/REPORTE-FINAL-V5.md` — ADR-004 cerrado
- `.audit/REPORTE-FINAL-V4.md` — Kit comercial entregado
- `.audit/REPORTE-FINAL-V3.md` — Cycle 3 cerrado

### Listas operativas
- `.audit/evidence/2026-05-17/listas-giros/C-400-giros-nuevos.txt` — 400 giros pendientes
- `.audit/evidence/2026-05-17/listas-giros/TEMPLATE-MARCA.json` — Template para usuario
- `.audit/evidence/2026-05-17/listas-giros/ROUTER-MAPPINGS-EJEMPLO.json` — Estructura router updates

### Documentación
- `.audit/README.md` — Índice navegación
- `.audit/ROADMAP-POST-PRODUCTION.md` — Qué sigue post-pilotos
- `.audit/BLOCKERS.md` — Bloqueantes abiertos (B-X-7 = E2E Playwright pendiente)
- `.audit/DECISIONS.md` — Decisiones técnicas con justificación

### Kit comercial (para owner usar)
- `docs/ONBOARDING-CLIENTE-PILOTO.md`
- `docs/venta/01-pitch-1pagina.md`
- `docs/venta/02-script-demo-30min.md`
- `docs/venta/03-faq-clientes.md`
- `docs/venta/04-pricing-tiers.md`
- `docs/venta/05-email-invitacion-piloto.md`
- `docs/venta/06-acuerdo-piloto.md`

### Backups
- `public/brands.config.js.bak-pre-motorv2` — backup pre-motor v2
- `public/comandero.html.bak-pre-motor` — backup pre-motor v1
- `public/marketplace.html.bak-pre-step2step1` — backup pre Step2

---

## 🔐 CHROME MCP — Cómo retomar

El usuario tiene Chrome con extensión Claude MCP. Cuando entres a próxima sesión:

1. `list_connected_browsers` → toma deviceId
2. `select_browser` con ese deviceId
3. `tabs_context_mcp createIfEmpty:true` → obtén tab
4. Navega a la URL que necesites

**Sesiones activas que el owner tiene abiertas** (suelen estar):
- https://systeminternational.app/ (marketplace)
- https://systeminternational.app/paneldecontrol.html (panel super-admin con cuenta grupovolvix@gmail.com)
- https://systeminternational.app/salvadorex-pos.html (POS de Fruteria bartola)
- https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/ (SQL editor — para aplicar migraciones)

---

## 💰 COSTOS Y DEPENDENCIAS EXTERNAS

### Generador AI (bundle v9/v11) — NO ACTIVADO
Si el usuario decide activarlo después:
- **ANTHROPIC_API_KEY** (~$0.04 USD por marca generada)
- **UNSPLASH_ACCESS_KEY** (gratis, 50/hora)
- **Adaptación a Vercel serverless** + cache Supabase (~2-4 horas mi trabajo)
- **Pre-warm 400 marcas** = $16 USD una sola vez

Archivos guardados en: `.audit/_v6_generator_v2/inner/generator/`

### Cloudflare Turnstile — YA ACTIVO
- Cuenta: grupovolvix@gmail.com en Cloudflare
- Site key público: `0x4AAAAAADQl0S9UlQgcmAQg`
- Secret key: configurado en Vercel

### Resend — YA ACTIVO
- OTP por email funcional

---

## 🎬 INICIO DE PRÓXIMA SESIÓN — COPIA-PEGA ESTO

Cuando inicies próxima sesión, pega este prompt al usuario para retomar exactamente aquí:

```
Lee D:\github\volvix-pos\.audit\HANDOFF-NEXT-SESSION.md COMPLETO.
Eso tiene TODO el contexto comprimido de la sesión anterior.
NO empieces desde cero. NO audites de nuevo. Solo retoma desde donde quedamos:
estamos generando marcas premium con identidad propia, el usuario me va a entregar
ZIPs con archivos JSON usando TEMPLATE-MARCA.json, yo solo integro mecánicamente.
Versión actual: 1.0.344, commit 5249576, 11 marcas premium activas en producción.
```

---

## 📊 SCORES ACTUALES

| Métrica | Valor |
|---|---|
| Score POS | 93/100 |
| Score Panel | 88/100 |
| Score Marketplace | 95/100 |
| Score Técnico | 100/100 |
| Score Visual UX | 80/100 (subió de 75 con las 6 nuevas marcas) |
| **🎯 SCORE GLOBAL** | **93/100** — PRODUCTION-READY con monitoreo |

---

## ✅ CHECKLIST PRÓXIMA SESIÓN

Cuando arranque la próxima sesión:

- [ ] Leer este documento completo
- [ ] Si usuario tiene ZIP nuevo → seguir "PLANTILLA DE INTEGRACIÓN" arriba
- [ ] Si usuario quiere reparar landings genéricas → empezar por más populares: cafeteria/papeleria/optica/juguetería
- [ ] Si usuario quiere activar generador AI → pedir API keys + adaptar a Vercel serverless
- [ ] NO repetir audits (ya hicimos 305+ pruebas, todas PASS)
- [ ] NO regenerar landings que ya existen (5 hero + 6 nuevas = 11)
- [ ] SÍ verificar cualquier nueva landing con screenshot Chrome MCP después de integrar

---

## 🧠 RESUMEN DE 6 CICLOS DE TRABAJO

**V1** (inicial): score 22/15, sistema con bugs
**V2**: cross-tenant leak detectado y reparado (commit d657cb2), score 89/86
**V3**: captcha Turnstile + audit real, score 89/86
**V4**: kit comercial entregado (6 docs venta + onboarding), score 89/86
**V5**: ADR-004 5/5 — R37 + refactor 28 refs + R35, score 93/88
**V6**: prod audit + 4 fixes (marketplace search + paneldecontrol escapeAttr + /api/admin/pilots + Turnstile CSP), score 93/88
**V6 motor**: 5 landings imagen-rich con galerías Unsplash
**V6 motor v2**: + demos vivos + sticky CTA + social proof toast
**V6 motor v3** (hoy): 6 marcas nuevas premium (Espuma, Pata, Refacciona, Pétalo, Repe, Burbuja)

---

## 📞 COMUNICACIÓN CON EL USUARIO

- Usuario escribe en MAYÚSCULAS cuando es urgente o quiere énfasis
- Usuario habla español mexicano
- Aprecia evidencia visual (screenshots) y verificación física en Chrome
- Prefiere "no importa el costo de tokens" → ser exhaustivo, no escatimar verificaciones
- Quiere acciones concretas, no propuestas vagas
- Si propone algo y se contradice con decisión anterior → preguntarle para clarificar

---

**Fin del HANDOFF. Próxima sesión: leer esto, NO empezar desde cero, continuar exactamente donde quedamos.**
