# Contrato: `POST /api/log/client`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta: `/api/log/client`
- Método(s): POST
- Auth requerido: ❌ público (sin `requireAuth`)
- Rol mínimo: N/A
- Rate limit: 30 req/min por IP (in-memory)

## Request
- Headers: ninguno requerido
- Body (JSON, max 8 KB):
  ```json
  {
    "level": "error" | "warn" | "info",
    "message": "string (max 500 chars)",
    "stack": "string (max 2000 chars)",
    "url": "string (max 300 chars)",
    "meta": {}
  }
  ```
- Query params: ninguno

## Response
- 200: `{ "ok": true }`
- 200 (throttled): `{ "throttled": true }` — respuesta inyectada por el interceptor de fetch del frontend ANTES de llegar al servidor (flood throttle en cliente, 1 req/30s por ruta)
- 429: `{ "error": "rate_limited", "retryAfter": <ms> }` — límite de 30/min/IP alcanzado en servidor

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| `client_errors` | INSERT | best-effort (catch silencioso si tabla no existe) |

## Consumidores
- **POS** (`salvadorex-pos.html`): el interceptor global de fetch (línea 114) throttlea llamadas a esta ruta a máx 1 cada 30 segundos. El handler de errores JS globales llama `POST /api/log/client` con `level: "error"` al capturar excepciones no manejadas.
- **PDC** (`paneldecontrol.html` línea 34/41): mismo interceptor de flood throttle. Errores JS del panel se reportan aquí.

## Acoplamiento detectado
✓ Ambos frontends usan idéntico interceptor de flood-throttle (30s gap) y el mismo payload shape. Compatible.

## Deudas
- Tabla `client_errors` no figura en el schema-truth del CLAUDE.md. Puede no existir en Supabase — el INSERT falla silenciosamente sin logging de la falla.
- El flood throttle vive en el cliente (puede bypassearse). El rate limit de servidor (30/min) es la única protección real.
- No hay validación de `url` field contra dominios esperados — un atacante puede inyectar cualquier URL string.
- `user_agent` se toma del header HTTP del request (confiable), no del body (podría ser manipulado).
