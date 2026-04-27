# R25 — Webhooks Test (Sin auditor)

**Path:** `C:\Users\DELL\Downloads\verion 340\` · **Implementación:** `api/index.js:3743-3971`

## Endpoints verificados

| Método | Ruta | Roles | Línea |
|---|---|---|---|
| GET | `/api/webhooks` | owner/admin/superadmin | 3885 |
| POST | `/api/webhooks` | idem | 3896 |
| PATCH | `/api/webhooks/:id` | idem | 3918 |
| DELETE | `/api/webhooks/:id` | idem | 3938 |
| POST | `/api/webhooks/:id/test` | idem | 3946 |
| GET | `/api/webhooks/:id/deliveries` | idem | 3961 |

## Eventos soportados (`WEBHOOK_EVENTS`)
`sale.created`, `sale.refunded`, `customer.created`, `inventory.low_stock`, `payment.succeeded`, `payment.failed`.

## Pruebas (resultado)

1. **POST crear** OK — body `{url, events[], active}`. Genera `secret` `whsec_<48hex>` automático si no se manda. URL inválida → 400.
2. **GET listar** OK — secret enmascarado a 8 chars + `...` (ln 3891).
3. **POST :id/test** OK — dispara `_deliverWithRetry` con evento sintético `webhook.test`, registra delivery, retorna `{ok, attempts, status}`.
4. **Sale real → dispatch** OK — `dispatchWebhook(tenant, 'sale.created', saleRow)` invocado en ln 1396; idem `customer.created` ln 1454. Asíncrono vía `setImmediate`, no bloquea respuesta.
5. **Fallback URL inválida** OK — retry con backoff exponencial `2^(n-1)*1000ms` (1s, 2s), máx 3 intentos (ln 3834-3849); registra `last_error` y `status='failed'` en `webhook_deliveries`.

**Graceful 503:** todos los handlers usan `try/catch → sendError`. Si tablas `webhook_endpoints`/`webhook_deliveries` no existen, `supabaseRequest` lanza y se propaga como error HTTP (no crashea). `dispatchWebhook` envuelve todo en try/catch silencioso (ln 3873).

## Cómo agregar un consumer (HMAC verify)

```js
const crypto = require('crypto');
app.post('/hook', express.raw({type:'application/json'}), (req, res) => {
  const sig = req.header('X-Volvix-Signature') || '';        // "sha256=<hex>"
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WHSEC)
    .update(req.body)                                         // body CRUDO
    .digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.sendStatus(401);
  res.sendStatus(200);
});
```

Headers emitidos: `X-Volvix-Signature: sha256=...`, `X-Volvix-Timestamp`, `User-Agent: Volvix-Webhooks/1.0`. Timeout cliente 5000ms.

**Status:** PASS — sistema completo y funcional.
