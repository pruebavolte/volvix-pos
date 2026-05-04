# R13 — AUDITORÍA DE PERFORMANCE

Proyecto: `C:\Users\DELL\Downloads\verion 340\`
Fecha: 2026-04-26

---

## 1. HTML — Top 10 más pesados

| # | Archivo | Tamaño |
|---|---------|--------|
| 1 | volvix_owner_panel_v7.html  | 214.2 KB |
| 2 | salvadorex_web_v25.html     | 159.1 KB |
| 3 | multipos_suite_v3.html      | 140.2 KB |
| 4 | volvix-grand-tour.html      | 77.4 KB  |
| 5 | volvix-sitemap.html         | 53.8 KB  |
| 6 | volvix-hub-landing.html     | 50.6 KB  |
| 7 | volvix-vendor-portal.html   | 49.1 KB  |
| 8 | volvix-customer-portal.html | 45.4 KB  |
| 9 | volvix_ai_engine.html       | 42.9 KB  |
| 10| volvix-qa-scenarios.html    | 42.8 KB  |

Total HTML: **1,289.5 KB** en 24 archivos.

## 2. Tamaño total de JS wiring

- Archivos `volvix-*wiring*.js`: **127 archivos / 2,261 KB (~2.2 MB)**
- Total JS en raíz: **269 archivos / 4,257 KB (~4.2 MB)**
- Top wiring:
  - volvix-extras-wiring.js: 45.2 KB
  - volvix-multipos-extra-wiring.js: 37.5 KB
  - volvix-pos-extra-wiring.js: 34.6 KB
  - volvix-ai-real-wiring.js: 32.4 KB
  - volvix-calendar-wiring.js: 31.6 KB

## 3. Archivos > 500 KB

**Ninguno.** El más grande es `volvix_owner_panel_v7.html` (214 KB).
Sin embargo, los HTML principales referencian **193–259 scripts externos**, lo que dispara el peso real de carga.

## 4. Service Worker (`sw.js`)

Estrategias actuales:
- **Estáticos**: cache-first + refresh background — correcto.
- **API/Supabase**: network-first con fallback a cache — correcto.
- **HTML/navigate**: network-first con fallback offline — correcto.
- **Background Sync** + **Periodic Sync** + cola IndexedDB — bien implementado.

Problemas detectados:
- `STATIC_FILES` precachea solo **12 recursos**, pero la app carga ~260 scripts por HTML. El 95% del JS no entra al precache hasta que se visita la página.
- No hay versión por hash en URLs; el `VERSION` constante invalida TODO el cache en cada deploy (no granular).
- Falta cache para `/icon-192.png` y `/badge-72.png` referenciados en push.
- No hay limpieza por LRU/quota — el API_CACHE puede crecer sin límite.

## 5. Imágenes (webp/avif)

**No hay imágenes** en el proyecto: 0 archivos `.png/.jpg/.webp/.avif/.svg/.gif`.
Los HTML auditados (top 3) no contienen ninguna etiqueta `<img>`. Toda gráfica parece basarse en CSS/emoji/iconos inline.
- Ahorro potencial: N/A (no aplica).
- Acción: si en el futuro se agregan logos/screenshots, usar **AVIF** (mejor compresión) con fallback **WebP**.

## 6. CSS — inline vs externo

- Archivos `.css` en proyecto: **0**.
- Cada HTML referencia **1 `<link rel="stylesheet">`** (probablemente CDN externo, no auditado en disco).
- El CSS personalizado vive en bloques `<style>` inline dentro de cada HTML.

Problema: CSS duplicado en 24 HTML — no hay shared stylesheet local. Cada página re-descarga su propio CSS embebido.

## 7. Lazy Loading

- `loading="lazy"` en HTML auditados: **0 ocurrencias**.
- No aplica en sentido estricto porque no hay `<img>`, pero **scripts**: `defer/async` se usa en 252 de 259 (97%) en `volvix_owner_panel_v7.html`. Bien.
- Falta: no hay **dynamic import / code-splitting** de los wirings — los 250+ módulos cargan en cada navegación.

---

## RECOMENDACIONES PRIORIZADAS

### P0 — Crítico (bloquea TTI)

1. **Code-splitting de wirings**: 127 archivos wiring (2.2 MB) cargan en TODAS las páginas vía 250+ `<script>`. Agrupar por feature y cargar bajo demanda con `import()` dinámico cuando el usuario abre la sección. Ahorro estimado: **70–80% del JS inicial**.
2. **Bundle de wirings**: usar esbuild/rollup para concatenar y minificar — pasar de 127 requests a 3-5 chunks. Reduce overhead HTTP y parse cost.

### P1 — Alto

3. **Service Worker — precache completo**: generar `STATIC_FILES` automáticamente desde build (incluir los 127 wirings críticos + HTML top). Mover los wirings raros a runtime cache.
4. **Cache versionado por hash**: usar nombres `wiring-<hash>.js` para invalidación granular en lugar de bumpear `VERSION` global.
5. **Extraer CSS común** a un `volvix.css` externo cacheable — elimina duplicación entre 24 HTML.

### P2 — Medio

6. **Lazy `<script>` por viewport/route**: para wirings no-críticos (calendar, reports, A/B testing) cargarlos solo cuando la ruta los necesite.
7. **Quota management en SW**: agregar LRU al `API_CACHE` (ej. máx 50 entradas).
8. **Cachear iconos push**: añadir `/icon-192.png`, `/badge-72.png` a `STATIC_FILES`.

### P3 — Bajo

9. **Comprimir HTML**: `volvix_owner_panel_v7.html` (214 KB) tiene mucho `<style>` inline; mover a CSS externo lo bajaría ~30–40 KB.
10. **Eliminar zips del repo**: `files (2).zip`, `files (3).zip` (~178 KB) no deberían estar en el árbol servido.
11. **Preparar pipeline para futuras imágenes**: AVIF + WebP fallback + `loading="lazy"` por defecto.

---

## MÉTRICAS RESUMEN

| Métrica | Valor | Estado |
|---------|-------|--------|
| HTML total | 1.29 MB | OK |
| JS total (raíz) | 4.16 MB | ⚠️ Alto |
| JS wiring | 2.21 MB en 127 files | ⚠️ Fragmentación |
| Archivos > 500KB | 0 | ✅ |
| Imágenes | 0 (N/A) | — |
| CSS externo | 0 archivos | ⚠️ Duplicado inline |
| Service Worker | Implementado, estrategias correctas | ✅ con mejoras P1 |
| Lazy loading scripts (defer) | 97% | ✅ |
| Lazy loading imágenes | N/A | — |
| Scripts/página (top HTML) | 193–259 | 🔴 Crítico |

**Veredicto**: La arquitectura del SW es sólida, pero el **fan-out de 250+ `<script>` externos por página** es el principal cuello de botella. Bundling + code-splitting es la acción de mayor ROI.
