# R14 — Monitoring & Observability

Implementación de observabilidad para Volvix POS. Mantiene compatibilidad
total con el middleware `requireAuth` de R13. No se introducen dependencias
externas (todo con stdlib de Node).

## Cambios

### 1. `api/index.js` — métricas in-memory + logging estructurado
- Buffer ring de **últimas 1000 latencias** (`METRICS.latencies`).
- Contadores `requestCount` / `errorCount` (5xx).
- Helpers: `recordMetric()`, `computeLatencyStats()` (p50/p95/p99),
  `logRequest()` (1 línea JSON por request a stdout).
- Hook en `module.exports`: `res.on('finish'|'close')` finaliza con
  guard `__logged` para evitar doble registro.
- Errores no atrapados en handlers incrementan `errorCount` y emiten
  log `level:"error"`.

### 2. Endpoint `GET /api/metrics` — admin only
Roles permitidos: `admin`, `owner`, `superadmin`.
Devuelve:
```json
{
  "ok": true,
  "uptime_ms": 123456, "uptime_sec": 123,
  "request_count": 42, "error_count": 0,
  "latency_ms": { "samples": 42, "p50": 18, "p95": 92, "p99": 184 },
  "supabase_health": { "ok": true, "latency_ms": 47 },
  "env_status": {
    "SUPABASE_URL": true, "SUPABASE_SERVICE_KEY": true,
    "JWT_SECRET": true, "ANTHROPIC_API_KEY": true,
    "ALLOWED_ORIGINS": true, "NODE_ENV": true
  },
  "version": "7.3.0-r14",
  "memory_mb": 64
}
```
`env_status` solo expone presencia (boolean), nunca el valor.

### 3. Endpoint `GET /api/health/deep` — público
Verifica:
- Supabase responde (con latencia).
- `JWT_SECRET` configurado.
- `ALLOWED_ORIGINS` no vacío.
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` presentes.

Devuelve **200** si todo ok, **503** si algún check falla. Útil para
probes de Vercel / Railway / load balancer.

### 4. Endpoint `POST /api/errors/log` — captura cliente
- Auth opcional: si llega `Authorization: Bearer <jwt>`, se asocia
  `pos_user_id` + `tenant_id`. Si no, se acepta como anónimo
  (errores en login.html, etc.).
- Rate-limit: **30 errores/min por IP** (anti-spam).
- Persiste en tabla `error_log` (Supabase). Si la tabla no existe,
  el fallo se loguea servidor-side y NO rompe al cliente.

### 5. Logging estructurado (JSON line por request)
Formato exacto (request normal, en stdout):
```json
{"ts":"2026-04-26T20:11:03.211Z","method":"GET","path":"/api/products","status":200,"duration_ms":47,"user_id":"...","tenant_id":"TNT001","ip":"x.x.x.x"}
```
Campos en errores: `level:"error"`, `msg`, `err`. Ingerible por
Datadog / Loki / Vercel logs sin parser custom.

### 6. `volvix-error-tracker.js` (cliente)
Captura `window.onerror` + `unhandledrejection` y envía a
`/api/errors/log`. Throttle cliente 10 errores/min. Usa
`fetch keepalive` → fallback `sendBeacon` → fallback `XHR`.

Token leído de:
- `localStorage["volvix_token"]`
- `localStorage["token"]`
- `window.VOLVIX_SESSION.token`

API manual: `window.VolvixErrorTracker.capture(err, meta)`.

**Integración**: agregar antes de `</head>` o como `defer` en `login.html`,
`multipos_suite_v3.html`, `volvix_owner_panel_v7.html`, etc.:
```html
<script src="/volvix-error-tracker.js" defer></script>
```

### 7. `db/R14_ERROR_LOG.sql`
- Tabla `public.error_log` (idempotente, `IF NOT EXISTS`).
- Índices: `created_at DESC`, `type`, `pos_user_id`, `tenant_id`.
- RLS habilitado; políticas para `service_role` (full) y `authenticated`
  (read).
- Comentario sugerido para retención de 90 días vía pg_cron.

## Compatibilidad

- `requireAuth` no se modificó. Todos los endpoints existentes siguen
  funcionando idénticos.
- `/api/metrics` usa `requireAuth(handler, ['admin','owner','superadmin'])`
  — mismo patrón que `/api/owner/*`.
- `/api/health/deep` y `/api/errors/log` quedan **públicos**, igual que
  `/api/health` y `/api/login` en R13.
- CORS, security headers y rate limit de R13/R14 siguen aplicados.

## Plan de pruebas

```bash
# Health deep
curl -s https://salvadorexoficial.com/api/health/deep | jq

# Metrics (requiere JWT admin)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://salvadorexoficial.com/api/metrics | jq

# Error log (anon)
curl -s -X POST https://salvadorexoficial.com/api/errors/log \
  -H "Content-Type: application/json" \
  -d '{"type":"test","message":"manual test","url":"https://x"}'
```

Aplicar SQL:
```bash
psql "$SUPABASE_DB_URL" -f db/R14_ERROR_LOG.sql
```

## Archivos tocados/creados
- `api/index.js` — métricas, logging, 3 endpoints nuevos.
- `volvix-error-tracker.js` — nuevo (cliente).
- `db/R14_ERROR_LOG.sql` — nuevo (schema + RLS).
- `R14_MONITORING.md` — este reporte.
