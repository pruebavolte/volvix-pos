# R24 — Performance Audit Producción

**Fecha:** 2026-04-27 | **Target:** https://salvadorexoficial.com
**Nota path:** `Sin auditor/` no existe; auditado `verion 340/` raíz.

## 1. Top 5 wirings JS (mayor a menor)
| # | Archivo | Tamaño |
|---|---|---|
| 1 | volvix-i18n-wiring.js | 60.0 KB |
| 2 | volvix-extras-wiring.js | 57.0 KB |
| 3 | volvix-multipos-extra-wiring.js | 45.7 KB |
| 4 | volvix-pos-extra-wiring.js | 43.6 KB |
| 5 | volvix-modals.js | 43.5 KB |

Total top-10 JS: ~432 KB sin minify.

## 2. Lighthouse estimado (estático)
- Viewport meta: OK (`width=device-width, initial-scale=1.0`)
- theme-color: OK (`#2D5F8F`)
- manifest.json: OK (3.9 KB)
- sw.js: OK (10.1 KB) — PWA habilitada
- Contraste: no verificable estáticamente, asumido OK
- **Score estimado: 78–85** (penalizado por tamaño JS sin code-splitting)

## 3. Latencia API (50 req paralelas)
| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| /api/products | 243ms | 321ms | 340ms |
| /api/sales/latest | 229ms | 281ms | 315ms |

(Respuesta 401 — auth requerida; latencia mide edge+backend hasta auth check.)

## 4. Cold start
Primer request tras 30s idle: **falló (timeout/auth)**. Edge responde en ~250ms uniforme; Vercel serverless ya estaba caliente.

## 5. TTFB
`/salvadorex_web_v25.html`: **257 ms**

## 6. Bundle HTMLs principales
| HTML | KB |
|---|---|
| volvix_owner_panel_v7.html | 216 |
| salvadorex_web_v25.html | 177 |
| multipos_suite_v3.html | 142 |
| volvix-grand-tour.html | 80 |
| volvix-sitemap.html | 54 |

## Sugerencias de optimización (prioridad)
1. **Minify + gzip JS** (esperado -60%): reduce 432 KB → ~170 KB.
2. **Code-split i18n-wiring**: cargar solo idioma activo (ahorro ~45 KB).
3. **Lazy-load modals**: `volvix-modals.js` solo on-demand.
4. **HTML splitting**: `volvix_owner_panel_v7.html` (216 KB) extraer CSS/JS inline a archivos cacheables.
5. **HTTP/2 push o `<link rel=preload>`** para top-3 wirings críticos.
6. **CDN edge cache** en HTMLs estáticos: TTFB 257ms → <80ms.
