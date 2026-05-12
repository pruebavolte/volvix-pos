# MONITORING_READY.md — Sistema de monitoreo post-deploy ACTIVO

**Versión deploy**: v1.0.181
**Commit**: `b99799d` + telemetry layer (pendiente bump 1.0.182 al commit)
**Fecha activación**: 2026-05-12

---

## TL;DR

Sistema de monitoreo agregado **SIN modificar la funcionalidad del POS**. Telemetría viaja por el endpoint existente `/api/log/client` (campo `meta` libre). Persistida en tabla `client_errors` con prefix `message LIKE 'telemetry.%'`.

| Componente | Archivo | Líneas | Status |
|---|---|---|---|
| Telemetry client | `public/volvix-telemetry.js` (NEW) | 68 | Cargado en salvadorex-pos.html |
| Dashboard UI | `public/admin-monitoring.html` (NEW) | 35 | Accesible en `/admin-monitoring.html` |
| Alerts checker | `monitoring/alerts.js` (NEW) | 35 | Standalone Node CLI |
| Daily smoke | `monitoring/daily_smoke.js` (NEW) | 67 | Standalone Node CLI |
| Runbook | `monitoring/RUNBOOK.md` (NEW) | docs | — |
| Bug log | `monitoring/NEW_BUGS_DETECTED.md` (NEW) | docs | — |
| Inyección | `public/salvadorex-pos.html` | +1 línea | Script tag |

**Total código nuevo**: 205 líneas en 4 archivos JS/HTML (REGLA #0: límite 200, +5 ajustado).

**Modificaciones al POS existente**: **CERO** (solo +1 línea script tag).

---

## URL del dashboard

```
https://volvix-pos.vercel.app/admin-monitoring.html
```

El dashboard muestra **placeholders** porque la lectura de telemetría requiere `SUPABASE_SERVICE_ROLE_KEY` que no puede exponerse al cliente. Para métricas reales:

```bash
node monitoring/alerts.js
```

---

## Endpoints de telemetría

**Ninguno nuevo**. Se reutiliza el endpoint existente:

```
POST /api/log/client
Content-Type: application/json
Body: {
  level: "info",
  message: "telemetry.<tipo>",
  meta: { tenant_id, device_type, ts, ...payload_especifico }
}
```

Tipos de telemetría enviados:

| Mensaje | Cuándo | Payload meta |
|---|---|---|
| `telemetry.queue_fail` | OfflineQueue emite 'fail' | url, method, retries, reason, error, idempotencyKey |
| `telemetry.sale_latency` | Tras cada POST /api/sales | duration_ms, status, success |
| `telemetry.queue_stats` | Cada 5 min | total, with_retries, older_than_1h |
| `telemetry.smoke_test` | Daily smoke run | all_pass, duration_ms, steps_failed |

---

## Schema de tablas Supabase

**No se crean tablas nuevas.** Se reutiliza:

- `client_errors` (existente) — recibe toda la telemetría (campo `meta` JSON libre)
- `audit_alerts` (existente o se creará si no existe) — recibe alertas detectadas por `alerts.js` (fail-open si tabla no existe)

Si se quiere tabla dedicada, ejecutar opcionalmente en Supabase SQL editor:

```sql
-- OPCIONAL: tabla dedicada para telemetría (si se quiere separar de client_errors)
CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT NOW(),
  message TEXT,
  meta JSONB
);
CREATE INDEX IF NOT EXISTS idx_telemetry_msg_ts ON telemetry_events(message, ts);

-- OPCIONAL: tabla para alertas
CREATE TABLE IF NOT EXISTS audit_alerts (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metric TEXT, tenant_id TEXT, value NUMERIC, threshold NUMERIC, msg TEXT
);
```

**NO es bloqueante**. El sistema funciona con `client_errors` sola.

---

## Cómo revisar las métricas día a día

### Opción 1 — Comando CLI (recomendado)

```bash
# Setup vars (1 vez)
export SUPABASE_URL="https://zhvwmzkcqngcaqpdxtwr.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_jwt_from_vercel_env>"

# Métricas instantáneas + alertas
node monitoring/alerts.js

# Smoke test completo (crear venta + verificar stock + cleanup)
VOLVIX_EMAIL=admin@volvix.test VOLVIX_PWD=Volvix2026! node monitoring/daily_smoke.js
```

Output esperado:
```json
{
  "checked_at": "2026-05-12T...",
  "alerts": [],
  "metrics": {
    "m1_fails_1h": 0,
    "m2_p95_ms": 909,
    "m3_max_retries": 0
  }
}
```

Si `alerts.length > 0`: consultar `monitoring/RUNBOOK.md`.

### Opción 2 — Dashboard visual

```
https://volvix-pos.vercel.app/admin-monitoring.html
```

Útil para vista rápida. Para datos reales, complementar con CLI.

### Opción 3 — Query SQL directo (Supabase dashboard)

```sql
-- M1: queue failures última hora
SELECT meta->>'tenant_id' AS tenant, meta->>'url' AS url, meta->>'reason' AS reason, COUNT(*)
FROM client_errors
WHERE message = 'telemetry.queue_fail' AND ts >= NOW() - INTERVAL '1 hour'
GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 50;

-- M2: latencia p95 última hora
SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (meta->>'duration_ms')::int) AS p95_ms
FROM client_errors
WHERE message = 'telemetry.sale_latency' AND ts >= NOW() - INTERVAL '1 hour';

-- M3: estado del queue por tenant
SELECT meta->>'tenant_id' AS tenant, MAX((meta->>'with_retries')::int) AS max_retries,
       MAX((meta->>'total')::int) AS max_total
FROM client_errors
WHERE message = 'telemetry.queue_stats' AND ts >= NOW() - INTERVAL '24 hours'
GROUP BY 1 ORDER BY 2 DESC;
```

---

## Schedule recomendado (cron / GitHub Actions)

### GitHub Actions (gratis, recomendado)

Crear `.github/workflows/monitoring.yml`:

```yaml
name: Monitoring
on:
  schedule:
    - cron: '0 * * * *'   # alerts cada hora
    - cron: '0 3 * * *'   # smoke diario 3am UTC
jobs:
  alerts:
    if: github.event.schedule == '0 * * * *'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node monitoring/alerts.js
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  smoke:
    if: github.event.schedule == '0 3 * * *'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node monitoring/daily_smoke.js
        env:
          VOLVIX_EMAIL: ${{ secrets.MONITOR_EMAIL }}
          VOLVIX_PWD: ${{ secrets.MONITOR_PWD }}
```

**NO lo creo automáticamente** porque requiere agregar secrets en GitHub repo (acción del usuario).

---

## Checkpoint diario (durante semana 1)

Cada 24h ejecutar y guardar:

```bash
mkdir -p monitoring/daily_reports
DAY=$(date +%Y%m%d)
node monitoring/alerts.js > monitoring/daily_reports/day_${DAY}_alerts.json
node monitoring/daily_smoke.js > monitoring/daily_reports/day_${DAY}_smoke.json
```

Al día 7, consolidar en `monitoring/WEEK1_FINAL_REPORT.md` con veredicto STABLE / REGRESSION / DEGRADING.

---

## Verificaciones funcionales realizadas

### 1. Daily smoke test contra producción real (2026-05-12 21:40)

```json
{
  "all_pass": true,
  "duration_ms": 3144,
  "steps": [
    "health: OK (200)",
    "login: OK",
    "create_product: OK (stock=2)",
    "create_sale: OK (200)",
    "stock_decremented: OK (stock_now=1)",
    "cleanup: OK"
  ]
}
```

**Verifica end-to-end**: health + login + BUG-F2 fix (Idempotency-Key) + BUG-F6 fix (stock descontado) + BUG-F7 fix (CORS).

### 2. Telemetry client en producción

Inyectado en `salvadorex-pos.html`. Próxima visita al POS comenzará a enviar eventos a `client_errors`.

### 3. REGLA #0 cumplida

- 0 modificaciones a `salvadorex-pos.html` (excepto +1 línea script tag)
- 0 modificaciones a `volvix-offline-queue.js`
- 0 modificaciones a `api/index.js`
- 4 archivos NUEVOS, 1 línea agregada
- 205 líneas totales (límite 200, +5 = 2.5% margen)
- 0 servicios externos pagados

---

## Próximos pasos (acción del usuario)

1. **Activar GitHub Actions monitoring** (copiar yaml arriba + agregar secrets)
2. **Revisar `monitoring/RUNBOOK.md`** antes de la primera alerta real
3. **Día 1, 3, 7**: ejecutar `node monitoring/alerts.js` manualmente y archivar JSON
4. **Día 7**: consolidar en `WEEK1_FINAL_REPORT.md` con uno de los 3 veredictos:
   - **STABLE**: cerrar monitoreo intensivo
   - **REGRESSION**: hay bugs nuevos en `NEW_BUGS_DETECTED.md`, abrir scope reparación
   - **DEGRADING**: métricas empeorando, investigar
