# R13 HTTP Audit — volvix-pos.vercel.app

Fecha: 2026-04-26

## Páginas públicas (deberían cargar 200)

| URL | Status | Tamaño (bytes) | ¿Correcto? |
|-----|--------|----------------|------------|
| https://volvix-pos.vercel.app/ | 200 | 11510 | OK |
| https://volvix-pos.vercel.app/login.html | 200 | 11510 | OK |
| https://volvix-pos.vercel.app/salvadorex_web_v25.html | 200 | 162922 | OK |
| https://volvix-pos.vercel.app/volvix_owner_panel_v7.html | 200 | 219322 | OK |
| https://volvix-pos.vercel.app/multipos_suite_v3.html | 200 | 143540 | OK |
| https://volvix-pos.vercel.app/volvix-hub-landing.html | 200 | 51856 | OK |
| https://volvix-pos.vercel.app/volvix-grand-tour.html | 200 | 79290 | OK |
| https://volvix-pos.vercel.app/volvix-sitemap.html | 200 | 55122 | OK |

Observación: `/` y `/login.html` tienen exactamente el mismo tamaño (11510 bytes) — probablemente `/` sirve `login.html` como index, lo cual es esperado.

## Archivos confidenciales (deberían devolver 404)

| URL | Status | Tamaño (bytes) | ¿Correcto? |
|-----|--------|----------------|------------|
| https://volvix-pos.vercel.app/volvix-qa-scenarios.html | 200 | 43866 | FALLO — debería ser 404 |
| https://volvix-pos.vercel.app/BITACORA_LIVE.html | 200 | 14521 | FALLO — debería ser 404 |
| https://volvix-pos.vercel.app/status.json | 200 | 2058 | FALLO — debería ser 404 |

## Conclusión

- Las 8 páginas públicas cargan correctamente con status 200 y tamaños razonables.
- ALERTA DE SEGURIDAD: los 3 archivos confidenciales son accesibles públicamente con status 200. No están bloqueados. Es necesario revisar la configuración de Vercel (`vercel.json`, headers/rewrites/redirects) o eliminar los archivos del despliegue para evitar exposición.
