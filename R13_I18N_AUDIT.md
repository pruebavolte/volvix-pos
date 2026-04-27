# R13 — Auditoría de Internacionalización (i18n)

**Proyecto:** Volvix POS (`C:\Users\DELL\Downloads\verion 340\`)
**Fecha:** 2026-04-26
**Idiomas objetivo:** `es` / `en` / `pt`

---

## 1. ¿Existe sistema i18n?

**SÍ — existe un único archivo de i18n:**

- `C:\Users\DELL\Downloads\verion 340\volvix-i18n-wiring.js` (637 líneas)

Características:
- Diccionario inline `TRANSLATIONS` con 3 idiomas (`es`, `en`, `pt`).
- ~110 keys por idioma, cubriendo: `login.*`, `nav.*`, `pos.*`, `product.*`, `inv.*`, `customer.*`, `report.*`, `action.*`, `msg.*`, `time.*`, `plural.*`.
- API global expuesta: `window.t(key, fallback, params)`, `window.tPlural`, `window.setLanguage`, `window.formatNumber`, `window.formatCurrency`, `window.formatDate`, `window.formatDateTime`, y namespace `window.I18nAPI`.
- Persistencia: `localStorage['volvix:lang']`. Detecta `navigator.language` con fallback a `es`.
- Locales/monedas configurados: `es-MX/MXN`, `en-US/USD`, `pt-BR/BRL`.
- Selector flotante UI: botón circular fijo `top:140px right:20px` con dropdown de banderas.
- DOM scanning automático: `[data-i18n]`, `[data-i18n-placeholder]`, `[data-i18n-title]`, `[data-i18n-value]`.
- Re-traducción cada 3 s + `MutationObserver` para SPA dinámicas.

**Veredicto:** infraestructura presente y razonablemente robusta. **El problema NO es la falta de motor i18n, sino la falta de adopción.**

---

## 2. Strings hardcodeados en español (sin pasar por t()/i18n.t())

**Hallazgo crítico:**

| Métrica | Valor |
|---|---|
| Archivos `.js` que invocan `t('…')` o `i18n.t(`… | **0** |
| Atributos `data-i18n` en todo el repo | **4** (sólo dentro del propio `volvix-i18n-wiring.js` como ejemplos) |
| Strings con texto español tipo `>Palabra<` en HTML (heurística regex `>[A-ZÁÉÍÓÚÑ]…<`) | **1 652 ocurrencias en 25 archivos HTML** |

**Conclusión:** la cobertura efectiva del sistema i18n es **~0 %**. Ningún HTML/JS productivo está cableado a `data-i18n` ni llama a `window.t()`. El motor existe pero está huérfano.

### Top 20 archivos con más strings hardcodeados (en español)

| # | Archivo | Strings ES estimados |
|---|---|---:|
| 1  | `multipos_suite_v3.html` | 236 |
| 2  | `volvix_owner_panel_v7.html` | 177 |
| 3  | `salvadorex_web_v25.html` | 156 |
| 4  | `volvix-hub-landing.html` | 152 |
| 5  | `volvix-grand-tour.html` | 130 |
| 6  | `volvix-sitemap.html` | 130 |
| 7  | `volvix-api-docs.html` | 109 |
| 8  | `volvix-sandbox.html` | 92 |
| 9  | `volvix-vendor-portal.html` | 94 |
| 10 | `volvix-customer-portal.html` | 85 |
| 11 | `volvix-admin-saas.html` | 64 |
| 12 | `volvix-onboarding-wizard.html` | 55 |
| 13 | `etiqueta_designer.html` | 30 |
| 14 | `volvix-pwa-final.html` | 31 |
| 15 | `volvix-mega-dashboard.html` | 27 |
| 16 | `volvix_ai_engine.html` | 17 |
| 17 | `volvix_ai_support.html` | 17 |
| 18 | `marketplace.html` | 11 |
| 19 | `BITACORA_LIVE.html` | 6 |
| 20 | `volvix_ai_academy.html` | 4 |

> Cifras vía `rg ">[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+…<"` (sólo cuenta encabezados/labels textuales en mayúscula inicial; los strings reales —incluyendo botones, títulos, alerts, toasts, console logs— son **bastante mayores**, posiblemente 2-3x).

Adicionalmente, **48 archivos `.js`** contienen literales con palabras como `idioma|locale|language|getLanguage` pero **ninguno** delega en el i18n central — la mayoría son strings hardcodeados (`'Configuración'`, `'Inventario'`, `'Cargando…'`, etc.) usados directamente en `innerHTML`/`alert`/`toast`.

---

## 3. Tablas Supabase con columnas multi-idioma

**Archivos revisados:**
- `C:\Users\DELL\Downloads\verion 340\db\R13_RLS_POLICIES.sql`
- `C:\Users\DELL\Downloads\verion 340\db\volvix.db.json`

**Resultado:** **NO** existen columnas multi-idioma. Búsqueda por `_es|_en|_pt|locale|i18n|language|name_es|title_en|description_pt` → **0 coincidencias** en ambos archivos.

Tampoco hay tabla `translations` ni `i18n_strings`. Los catálogos verticales (productos, categorías, recetas, pasos de onboarding) se almacenan únicamente en español.

**Riesgo:** un usuario que conmute a `en` o `pt` verá la UI traducida pero los datos del backend (nombres de productos, categorías, tickets, recibos) seguirán en español → experiencia rota.

---

## 4. ¿Funciona el selector de idioma?

**Selector UI:** sí, implementado en `volvix-i18n-wiring.js` (líneas 545-592). Crea un botón flotante con dropdown.

**Integración real:** **NO.** El selector se renderiza solo si la página carga `volvix-i18n-wiring.js` con `<script src="…">`. Búsqueda `i18n-wiring` en HTMLs → **0 archivos lo incluyen.** Está huérfano del bundle.

**Conclusión:**
- En memoria: `window.setLanguage('en')` cambiaría `localStorage`, dispararía `volvix:langchange`, re-escanearía `[data-i18n]`. Como casi no hay `data-i18n`, el cambio sería imperceptible.
- En producción: el script ni siquiera se carga, por lo que el botón **no aparece**.

---

## Plan de migración (recomendado, fases)

### Fase 0 — Habilitar el motor (1-2 h)
1. Añadir `<script src="/volvix-i18n-wiring.js" defer></script>` en los 25 HTML productivos.
2. Verificar que el selector flotante aparezca y `window.I18nAPI.current()` responda en consola.
3. Decidir si el selector flotante (`top:140px right:20px`) colisiona con otros widgets (currency, voice, a11y) — re-stack o mover a header.

### Fase 1 — Migrar layout estático (5-8 h por archivo grande)
Prioridad por volumen e impacto:
1. `multipos_suite_v3.html` (236) — app principal POS.
2. `volvix_owner_panel_v7.html` (177).
3. `salvadorex_web_v25.html` (156).
4. `volvix-hub-landing.html` (152) — landing pública, alto impacto SEO/marketing.
5. `volvix-grand-tour.html` (130).

Patrón de migración:
```html
<!-- antes -->
<button>Guardar</button>
<input placeholder="Buscar producto">

<!-- después -->
<button data-i18n="action.save">Guardar</button>
<input data-i18n-placeholder="pos.search.product" placeholder="Buscar producto">
```

### Fase 2 — Migrar strings dinámicos en JS (10-15 h)
Reemplazar literales en `innerHTML`, `alert`, `toast`, `confirm` por `t('key')`. Crear keys faltantes en `TRANSLATIONS` (es/en/pt). Estimado: ~300-500 keys nuevas.

Archivos prioritarios (mayor superficie dinámica):
- `volvix-master-controller.js`
- `volvix-pos-*.js` / `volvix-workflow-*.js`
- Los 40+ `volvix-vertical-*.js` (cada vertical mete su propio glosario; conviene namespace `vertical.farmacia.*`, `vertical.gym.*`, …).

### Fase 3 — Multi-idioma en datos (Supabase) (8-12 h)
Opción A (simple): columna `name_i18n JSONB` con `{"es":"…","en":"…","pt":"…"}` en tablas `products`, `categories`, `verticals`, `onboarding_steps`, `email_templates`. Helper SQL `get_i18n(col, lang)`.

Opción B (normalizada): tabla `translations(entity_type, entity_id, lang, field, value)` con índice compuesto.

Recomendación: **Opción A** (JSONB) por velocidad de implementación y cero JOINs. Migración de datos existentes: `UPDATE products SET name_i18n = jsonb_build_object('es', name, 'en', name, 'pt', name)` (rellenar es=actual, en/pt iguales hasta traducir).

Tablas que requieren multi-idioma confirmadas:
- `products` (`name`, `description`)
- `categories` (`name`)
- `email_templates` (`subject`, `body`)
- `onboarding_steps` (`title`, `description`)
- Catálogos verticales (recetas, servicios, paquetes)

Tablas que NO necesitan: `customers`, `sales`, `payments`, `users`, `audit_log` (datos de usuario).

### Fase 4 — QA y traducciones (5-8 h)
- Pasar todas las keys por revisor nativo `en` y `pt` (las traducciones actuales son aceptables pero el `pt` para `customer.rfc` = `'CNPJ/CPF'` mezcla concepto, puede romper layouts).
- Tests E2E: cargar app con `localStorage['volvix:lang']='en'` y `='pt'`, capturar screenshots, validar que no haya texto español residual.
- Activar `lang` HTML attr correcto para SEO/screen readers (ya lo hace en `setLanguage` línea 505).

### Fase 5 — Optimizaciones (opcional)
- Externalizar `TRANSLATIONS` a `i18n/es.json`, `i18n/en.json`, `i18n/pt.json` y lazy-load por idioma activo (reduce bundle inicial ~60 KB).
- Reemplazar `setInterval(translateAll, 3000)` (línea 610) por sólo `MutationObserver` — el polling de 3 s es desperdicio de CPU.
- Añadir CI check: `grep -E "data-i18n" *.html` debe crecer; falla PR si introduce nuevos textos sin marcar.

---

## Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Existe i18n? | Sí, motor completo en `volvix-i18n-wiring.js`. |
| ¿Está adoptado? | **No.** 0 archivos productivos lo cargan, 0 atributos `data-i18n` en HTML productivo. |
| Strings hardcodeados ES | ≥ **1 652** en 25 HTMLs (sólo headers visibles); total real ~3 000-5 000 contando JS dinámico. |
| Multi-idioma en BD | **No existe.** Sin columnas `_es/_en/_pt` ni tabla `translations`. |
| Selector funciona | Codeado correctamente, pero **no se renderiza** porque el script no está incluido en ningún HTML. |
| Esfuerzo total estimado | **30-50 h** de trabajo de ingeniería + revisión nativa de traducciones. |
