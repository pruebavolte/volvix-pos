# R25_AI_TEST — AI Assistant Integration (Test Estatico)

Fecha: 2026-04-27. Modo: revisión de codigo (servidor no booteable sin `SUPABASE_SERVICE_KEY`).

## 1. Endpoints `/api/ai/*` revisados (api/index.js)

| Endpoint | Auth | Sin `ANTHROPIC_API_KEY` | Con key |
|---|---|---|---|
| POST /api/ai/chat (1883) | requireAuth | **503** `ANTHROPIC_API_KEY no configurada` OK | callClaude (haiku, 1024 tok), log a `ai_chat_log` |
| POST /api/ai/insights (1914) | requireAuth + roles `admin/superadmin/owner` | **503** (NO hay fallback local) | calcula KPIs + callClaude |
| GET /api/ai/decisions (1853) | requireAuth roles admin+ | retorna mock estatico (no usa key) | igual |
| POST /api/ai/decide (1825) | requireAuth | callClaude responde "modo simulación" via server.js, o real | OK |
| POST /api/ai/copilot/suggest-product (1959) | requireAuth | **503** (NO hay fallback local) | callClaude haiku |
| POST /api/ai/support (1839) | requireAuth | callClaude (sin guard 503) | OK |

Comportamiento de auth: sin Bearer/cookie -> 401 (linea 799). Con JWT pero rol insuficiente en `/insights` -> 403 (802-804). Rate limit 20/min por usuario aplicado.

## 2. Fallback local SIN ANTHROPIC_API_KEY — DISCREPANCIA

El brief afirma que R23 implementó fallback local para `/insights` y `/copilot/suggest`. **NO encontrado**. Codigo actual (lineas 1916, 1961) hace early-return 503 antes de calcular nada. R23_FINAL_CLEANUP.md no menciona fallback IA.

- `/insights`: tiene la logica local (byHour, anomalies, summary lineas 1925-1938) PERO solo se ejecuta tras pasar el guard 503. Habria que mover el guard al `callClaude` y devolver `summary` siempre.
- `/copilot/suggest-product`: no hay logica local; depende 100% de Claude.
- `/chat`: 503 claro OK (esperado).

## 3. Cliente `volvix-ai-assistant.js`

- Widget flotante (#vai-fab esquina inferior derecha 20px/20px, z-index 99998) — codigo OK.
- Markdown simple: code fences, inline code, bold, italic, links, listas, br — OK (linea 42-62).
- Comandos `/help`, `/sales today` (-> /api/reports/daily), `/inventory low` (-> /api/inventory filtrando stock<=5) — OK.
- Maneja 503/429 con mensajes claros (linea 183-184).
- **PROBLEMA WIRING:** `grep` en `*.html` confirma que NINGUN HTML incluye `<script src="volvix-ai-assistant.js">`. El widget existe pero no está montado.

## 4. Resumen de hallazgos

1. Endpoints `/chat`, `/insights`, `/copilot/suggest-product` retornan **503 correctamente** sin key + 401 sin auth + 403 sin rol. Listo para producción.
2. **Falla declarada vs real:** fallback local de R23 NO existe en el codigo. Ver lineas 1916 y 1961.
3. **Widget no integrado** en HTML — falta `<script src="/volvix-ai-assistant.js" defer></script>` en pagina principal (`salvadorex_web_v25.html` u owner panel).
4. `ai_chat_log` tabla Supabase usada para tracking de costos (best-effort, no bloquea).
