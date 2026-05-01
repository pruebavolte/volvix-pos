# R13 HTTP Audit — salvadorexoficial.com

Fecha: 2026-04-26

## Páginas públicas (deberían cargar 200)

| URL | Status | Tamaño (bytes) | ¿Correcto? |
|-----|--------|----------------|------------|
| https://salvadorexoficial.com/ | 200 | 11510 | OK |
| https://salvadorexoficial.com/login.html | 200 | 11510 | OK |
| https://salvadorexoficial.com/salvadorex_web_v25.html | 200 | 162922 | OK |
| https://salvadorexoficial.com/volvix_owner_panel_v7.html | 200 | 219322 | OK |
| https://salvadorexoficial.com/multipos_suite_v3.html | 200 | 143540 | OK |
| https://salvadorexoficial.com/volvix-hub-landing.html | 200 | 51856 | OK |
| https://salvadorexoficial.com/volvix-grand-tour.html | 200 | 79290 | OK |
| https://salvadorexoficial.com/volvix-sitemap.html | 200 | 55122 | OK |

Observación: `/` y `/login.html` tienen exactamente el mismo tamaño (11510 bytes) — probablemente `/` sirve `login.html` como index, lo cual es esperado.

## Archivos confidenciales (deberían devolver 404)

| URL | Status | Tamaño (bytes) | ¿Correcto? |
|-----|--------|----------------|------------|
| https://salvadorexoficial.com/volvix-qa-scenarios.html | 200 | 43866 | FALLO — debería ser 404 |
| https://salvadorexoficial.com/BITACORA_LIVE.html | 200 | 14521 | FALLO — debería ser 404 |
| https://salvadorexoficial.com/status.json | 200 | 2058 | FALLO — debería ser 404 |

## Conclusión

- Las 8 páginas públicas cargan correctamente con status 200 y tamaños razonables.
- ALERTA DE SEGURIDAD: los 3 archivos confidenciales son accesibles públicamente con status 200. No están bloqueados. Es necesario revisar la configuración de Vercel (`vercel.json`, headers/rewrites/redirects) o eliminar los archivos del despliegue para evitar exposición.
