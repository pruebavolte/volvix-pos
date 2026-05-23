# HANDOFF — Resumen de toda la conversación del 2026-05-17/18

> Para próxima sesión: lee esto primero. Tiene TODO el contexto comprimido.

---

## Quién soy / Quién es el usuario

- **Usuario:** Erick (dueño de Volvix POS / SalvadoreX)
- **Pitch:** HOY 2026-05-18 — necesita demo funcional
- **Plan Anthropic:** Max 20x (NO tiene API key Anthropic, USA Claude Code dentro de su sesión)
- **Plan Supabase:** Pro ($25 USD/mes — RECIÉN PAGADO en este turno)
- **Tenant principal:** "Fruteria bartola" (TNT-P5E74)
- **Login:** grupovolvix@gmail.com / 123456789 (must_change_password:true)

---

## Estado actual de producción

- **URL:** https://systeminternational.app/
- **Versión:** 1.0.380
- **Supabase:** ✅ Conectado (pagado plan Pro)
- **Login:** ✅ Funciona (HTTP 200, token JWT 8h)
- **3 URLs del pitch:** ✅ HTTP 200
- **Marcas premium:** 217
- **Giros mapeados:** ~1100+ con HARD_EXCEPTIONS

---

## Lo COMPLETO desde inicio de conversación

### Sprint pre-pitch (V8.x → V9.6.3)

| Versión | Qué hizo |
|---|---|
| V8.3 | Marca DISCRETO para sexshop |
| V8.4 | HARD_EXCEPTIONS routing (papelería, sabanas, etc.) |
| V8.5-V8.7 | 200+ aliases SMB MX, fix pareo/comandero/refacciona en VLX_BRANDS |
| V8.8 | Test masivo 1081 giros, 100% caen en landing premium |
| V8.9 | **BUG CRÍTICO**: backend api/giros.js servía templates planos → fix PLAIN_TO_PREMIUM |
| V9.0-V9.0.7 | Hotfixes brand pages render (bloque/pata/gateo crash widget booking) |
| V9.1-V9.2 | Content pack JSON: 5 brands hero con 6 dolores reales c/u (Navaja, Comandero, Tendito, Receta, Corte) |
| V9.3-V9.3.1 | Heading "Estos son los dolores que sí te resolvemos" + 25 imágenes Unsplash descargadas a `/landings-assets/{slug}/N.jpg` |
| V9.4-V9.5.1 | 51 bugs routing (puerta→viruta, ferretería→yunque, cevichería→marea, hotel→folio, etc.) |
| V9.6-V9.6.3 | 18 bugs stress test 100 (raspados→nieve, michelada→tarima, ropa de bebé→mochila, vinatería backend) |

### Sprint nocturno (branch feature/ampliacion-modulos, NO mergeada)

**Branch:** `feature/ampliacion-modulos` (separada de main, segura)

Archivos generados:
- `.audit/INVENTARIO-ACTUAL.md` — Mapeo completo modales + 62 tablas Supabase
- `.audit/CATALOGO-MODULOS.md` — **487 campos catalogados** en 9 módulos
- `.audit/TERMINOLOGIAS.json` — Diccionario por 30 giros + 187 inferidos
- `.audit/migrations/01-08.sql` — 8 migrations SQL (NUNCA ejecutadas)
- `.audit/AUDIO-FEATURES.md` — 11 módulos extraídos de audios (OSINT, OCR menús, B2B marketplace, fees, reportes custom, WhatsApp CRM, soporte autónomo, business plan generator, Meta Ads, geo, migración 3ros)
- `docs/ENTITY-ENGINE-ARCHITECTURE.md` — Diseño "Motor Universal de Entidades"
- `public/js/applyGiroConfig.js` — Schema-driven UI engine
- `public/js/vlxPanelDrawer.js` — Drawer "Config por Giro"
- `public/data/giros-terminologias.json` — JSON con 30 giros + inferencia
- `public/test-schema-ui.html` — Página standalone para validar

### Validación masiva (varios sprints)

| Test | Resultado |
|---|---|
| 453 giros V8.8 | 100% landing premium |
| 1081 giros V8.8 | 100% landing premium |
| 966 giros con Puppeteer real | 100% (1 bug: backend giros.js) |
| 51 giros agent validator | 100% PASS |
| 113 giros stress test | 91% pass + 0 fallos críticos |
| 100 giros V9.6 stress | 84/100 + 0 críticos |

---

## Lo que QUEDABA pendiente (por Supabase suspendido)

**Ahora SÍ se puede hacer** (Supabase pagado):

| # | Tarea | Status |
|---|---|---|
| 1 | Ejecutar migrations 01-08 en Supabase Pro | ⏳ Pendiente |
| 2 | Seed tabla `giros_terminologias` con 30 giros | ⏳ Pendiente |
| 3 | Merge feature/ampliacion-modulos a main | ⏳ Pendiente (era pre-pitch rule) |
| 4 | Endpoint `/api/giros/config?giro=X` | ⏳ Pendiente |
| 5 | E2E test: login + crear venta + POS funcional | ⏳ Pendiente |
| 6 | Validar SalvadoreX POS carga tras login real | ⏳ Pendiente |
| 7 | Implementación módulos audios (11 módulos) | 🔴 Solo scaffolding SQL, NO lógica (proyecto de meses) |

**No se puede sin API key Anthropic:**
- Validación semántica/visual con Claude Haiku Vision (el usuario nunca proveyó key)

---

## Bugs documentados en este chat

1. **Supabase egress quota exceeded** → resuelto (usuario pagó Pro)
2. **Vercel api/index.js viejo (commit 9b82f90 del 30-abr)** → sigue así, pero funciona porque mis fixes están en public/* que SÍ se actualizan
3. **Picker h1 "Motor de marcas Volvix" visible** → arreglado (CSS body.loaded #picker {display:none})
4. **Widget booking crash 'b.taken undefined'** → arreglado con defensive + try/catch
5. **Backend api/giros.js mapeaba a templates planos** → arreglado con PLAIN_TO_PREMIUM (~80 mappings)
6. **Partial-match captura "fruta" en "puerta"** → resuelto con HARD_EXCEPTIONS antes del partial-match

---

## Archivos clave (rutas absolutas)

```
D:\github\volvix-pos\
├── public/
│   ├── brands.config.js           ← 217 marcas, hero+thefts+imgs
│   ├── volvix-brand-router.js     ← Router con 90+ HARD_EXCEPTIONS
│   ├── salvadorex-pos.html        ← POS principal (23k líneas)
│   ├── paneldecontrol.html        ← Admin panel (9k líneas)
│   ├── marketplace.html           ← Home con buscador
│   ├── version.json               ← 1.0.380
│   ├── landings-assets/{slug}/    ← 25 imágenes descargadas
│   ├── js/applyGiroConfig.js      ← Schema-driven UI (en main? verificar)
│   └── data/giros-terminologias.json
├── api/
│   ├── index.js                   ← 35k líneas, login en línea 1670
│   └── giros.js                   ← PLAIN_TO_PREMIUM en línea 186
├── .audit/
│   ├── HANDOFF-CONVERSACION-RESUMEN.md  ← ESTE archivo
│   ├── INVENTARIO-ACTUAL.md
│   ├── CATALOGO-MODULOS.md
│   ├── TERMINOLOGIAS.json
│   ├── AUDIO-FEATURES.md
│   ├── migrations/01-08.sql       ← NO EJECUTADAS
│   └── scripts/                   ← Todos los validators
└── docs/
    └── ENTITY-ENGINE-ARCHITECTURE.md
```

---

## Credenciales Supabase (.env local)

```
SUPABASE_URL=https://zhvwmzkcqngcaqpdxtwr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[set, 223 chars]
SUPABASE_SERVICE_KEY=[set, 221 chars] ← Esta es la usada por api/index.js
SUPABASE_PAT=[set, 48 chars] ← Personal Access Token, sirve para Management API (crear migrations remoto)
JWT_SECRET=[set, 132 chars]
ADMIN_API_KEY=[set, 68 chars]
```

---

## Próximas acciones recomendadas (en orden)

1. ✅ **Esta sesión:** Crear HANDOFF (este archivo)
2. 🔄 **Esta sesión (next):** Ejecutar migrations 01-08 en Supabase con backup
3. 🔄 **Esta sesión:** Seed giros_terminologias
4. 🔄 **Esta sesión:** Test E2E login + verificar POS carga
5. 🔄 **Esta sesión:** Merge feature/ampliacion-modulos a main
6. 📋 **Próxima sesión:** Endpoint /api/giros/config
7. 📋 **Después del pitch:** 11 módulos de audios (4 meses con equipo)
