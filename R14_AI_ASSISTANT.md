# R14 — AI Assistant (Claude API)

Integración del asistente conversacional con la API de Anthropic (Claude) en Volvix POS.

## Componentes entregados

| Archivo | Propósito |
|---|---|
| `api/index.js` | Endpoints `POST /api/ai/chat`, `POST /api/ai/insights`, `POST /api/ai/copilot/suggest-product` |
| `volvix-ai-assistant.js` | Widget flotante de chat (esquina inferior derecha) con markdown, historia local y comandos |
| `db/R14_AI_LOG.sql` | Tabla `ai_chat_log` + vista `ai_chat_cost_monthly` para tracking de costo |

## Endpoints

### `POST /api/ai/chat` (auth)
- Body: `{ "message": string, "context"?: object }`
- Modelo: `claude-3-5-haiku-20241022`
- System prompt: "Eres asistente de Volvix POS. Ayuda con preguntas sobre el sistema, productos, ventas, configuración."
- Rate limit: 20 req/min/usuario (compartido con resto de `/api/ai/*`).
- Si falta `ANTHROPIC_API_KEY` -> `503`.

### `POST /api/ai/insights` (admin / superadmin / owner)
- Lee últimas 100 ventas de Supabase (`pos_sales`).
- Calcula localmente: ventas por hora, ticket promedio/máx/mín, anomalías (> 3x promedio).
- Pide a Claude 3 insights accionables sobre los KPIs.
- Devuelve `{ summary, anomalies, insights, simulated }`.

### `POST /api/ai/copilot/suggest-product` (auth)
- Body: `{ "customer_id": string, "history": Array }`
- Pide JSON `{ upsell, cross_sell }` para upsell/cross-sell.

Todos persisten tokens consumidos en `ai_chat_log` (best-effort, no bloquea respuesta).

## Setup `ANTHROPIC_API_KEY`

1. Obtener una API key en <https://console.anthropic.com/settings/keys>.
2. Configurarla como variable de entorno en el deploy:
   - **Vercel**: Project Settings -> Environment Variables -> `ANTHROPIC_API_KEY` = `sk-ant-...`
   - **Local**: `.env` con `ANTHROPIC_API_KEY=sk-ant-...`
   - **Producción on-prem**: `export ANTHROPIC_API_KEY=...` antes de iniciar el proceso.
3. Reiniciar la API. El endpoint `GET /api/health` muestra si la key está cargada (campo `env_keys`).
4. Aplicar el SQL: `psql ... -f db/R14_AI_LOG.sql` o ejecutarlo en el SQL editor de Supabase.
5. Incluir el widget en cualquier página autenticada:
   ```html
   <script src="/volvix-ai-assistant.js" defer></script>
   ```

Sin `ANTHROPIC_API_KEY` los endpoints devuelven `503` (en lugar de degradar a modo simulación, para que el frontend lo detecte).

## Costo estimado mensual

Modelo `claude-3-5-haiku-20241022` (precios oficiales Anthropic, 2025):

| Concepto | Precio |
|---|---|
| Tokens de entrada | $0.80 / 1M tokens |
| Tokens de salida | $4.00 / 1M tokens |

### Supuestos para estimación

- 1 conversación promedio = 600 tokens input + 400 tokens output
- Mezcla por día por tenant: 50 chats + 5 insights (4k input/600 output) + 30 sugerencias copiloto (300/200)

### Cálculo por tenant / mes (30 días)

| Endpoint | Llamadas/mes | Input tokens | Output tokens | Costo USD |
|---|---:|---:|---:|---:|
| `/api/ai/chat` | 1,500 | 900,000 | 600,000 | $3.12 |
| `/api/ai/insights` | 150 | 600,000 | 90,000 | $0.84 |
| `/api/ai/copilot/suggest-product` | 900 | 270,000 | 180,000 | $0.94 |
| **Total** | **2,550** | **1.77M** | **0.87M** | **~$4.90 / mes / tenant** |

### Escenarios

| Escala | Tenants | Costo aprox. mensual |
|---|---:|---:|
| Piloto | 5 | ~$25 |
| SMB | 50 | ~$245 |
| Mid-market | 500 | ~$2,450 |
| Enterprise | 2,000 | ~$9,800 |

> El rate limit de 20 req/min/usuario y la vista `ai_chat_cost_monthly` permiten auditar y poner alertas si algún tenant excede el presupuesto. Para ahorrar más se puede activar prompt caching de Claude (hasta 90% en input repetido).

## Tracking de costo

Vista lista para usar:

```sql
SELECT * FROM ai_chat_cost_monthly
WHERE month = date_trunc('month', NOW())
ORDER BY estimated_cost_usd DESC;
```

## Comandos del widget

- `/help` — lista de comandos
- `/sales today` — invoca `GET /api/reports/daily`
- `/inventory low` — lista productos con stock <= 5

Cualquier otra cosa va a `/api/ai/chat`. Historia almacenada en `localStorage.volvix_ai_history` (últimas 50 entradas).
