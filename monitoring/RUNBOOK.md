# RUNBOOK — Volvix POS Monitoring Post-Deploy

Procedimientos para responder a alertas detectadas por `monitoring/alerts.js`.

---

## Setup inicial

Variables de entorno necesarias para `alerts.js` y queries directas:

```bash
export SUPABASE_URL="https://zhvwmzkcqngcaqpdxtwr.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_jwt>"  # de Vercel env
export VOLVIX_EMAIL="admin@volvix.test"
export VOLVIX_PWD="Volvix2026!"
```

Schema de tablas usadas (existentes en Supabase):
- `client_errors` (telemetry persistida via `/api/log/client` — ya existe)
- `audit_alerts` (alertas, fail-open si tabla no existe — fail silencioso OK)

Telemetría almacenada con prefijo `message LIKE 'telemetry.%'`. Tipos:
- `telemetry.queue_fail` — M1
- `telemetry.sale_latency` — M2
- `telemetry.queue_stats` — M3
- `telemetry.smoke_test` — diario smoke

---

## M1 — Alerta: Queue fails >5/hr/tenant

**Significado**: 5+ ventas/productos rechazados por backend en 1 hora desde un tenant. Esto era el síntoma original de BUG-F2 (regresión).

**Pasos**:

1. Query SQL en Supabase (via dashboard SQL editor):
   ```sql
   SELECT meta->>'url' AS url, meta->>'error' AS error, meta->>'reason' AS reason, COUNT(*)
   FROM client_errors
   WHERE message = 'telemetry.queue_fail'
     AND ts >= NOW() - INTERVAL '1 hour'
     AND meta->>'tenant_id' = '<tenant_id_alertado>'
   GROUP BY 1,2,3 ORDER BY 4 DESC;
   ```

2. Si todos los errors dicen `idempotency_key_required` (HTTP 400) → **BUG-F2 regresó**:
   - Verificar que `public/volvix-offline-queue.js` línea ~226 contiene `'Idempotency-Key': String(item.idempotencyKey)`
   - Verificar deploy: `curl https://volvix-pos.vercel.app/volvix-offline-queue.js | grep BUG-F2`
   - Si missing → **rollback**: `git revert <commit_que_quito_fix>` + redeploy

3. Si errors dicen `Failed to fetch` → **BUG-F7 regresó (CORS)**:
   - Verificar `api/index.js` línea 15854: `Access-Control-Allow-Headers` debe incluir `Idempotency-Key`
   - Comando: `curl -i -X OPTIONS https://volvix-pos.vercel.app/api/sales -H "Origin: https://localhost" -H "Access-Control-Request-Headers: idempotency-key" | grep -i allow-headers`
   - Si missing → rollback commit que removió, o re-aplicar el fix (1 línea)

4. Si errors dicen `stock_insuficiente` (HTTP 409) → comportamiento esperado:
   - Cliente intentó vender sin stock. NO es bug. Verificar si el frontend muestra mensaje claro.

5. Si errors dicen otra cosa → investigar específico, documentar en `NEW_BUGS_DETECTED.md`.

---

## M2 — Alerta: Sale p95 >2000ms sostenido 3hrs

**Significado**: ventas tardan > 2 seg en p95. Baseline post-fix es ~909ms.

**Pasos**:

1. Verificar si es backend o red:
   ```sql
   SELECT meta->>'tenant_id', AVG((meta->>'duration_ms')::int), MAX((meta->>'duration_ms')::int)
   FROM client_errors
   WHERE message = 'telemetry.sale_latency' AND ts >= NOW() - INTERVAL '1 hour'
   GROUP BY 1 ORDER BY 2 DESC;
   ```

2. Si **un solo tenant** está afectado → su red/dispositivo es lento, NO es problema sistema.

3. Si **múltiples tenants** afectados → backend Vercel/Supabase está degradado:
   - Verificar Vercel status: https://www.vercel-status.com/
   - Verificar Supabase status: https://status.supabase.com/
   - Comparar con baseline: `node monitoring/daily_smoke.js` → debe responder en <2s

4. Escalar a optimización (OBS-3, OBS-4 de OBSERVACIONES_NO_APLICADAS.md):
   - Cache `tenant_settings.tax_rate`
   - Endpoint `/api/sales/batch`

---

## M3 — Alerta: Items en queue con retries crece >10/día

**Significado**: hay items reintentando por error sin éxito. Posible regresión BUG-F3 (limbo) o nuevo error sistémico.

**Pasos**:

1. Query items con retries:
   ```sql
   SELECT meta->>'tenant_id', MAX((meta->>'with_retries')::int) AS max_retries
   FROM client_errors
   WHERE message = 'telemetry.queue_stats' AND ts >= NOW() - INTERVAL '24 hours'
   GROUP BY 1 ORDER BY 2 DESC;
   ```

2. Si un tenant tiene >50 items con retries → probable BUG-F2 regresión o nuevo error 4xx sistémico.

3. Reproducir manualmente con dispositivo del tenant si posible (smoke test).

---

## M4 — Alerta: Idempotency cache hits >10%

**Significado**: cliente está reintentando POSTs con misma key demasiado. Posible bug de retry agresivo en frontend o conexión inestable que reenvía requests.

**NO bloqueante**. El backend protege correctamente. Pero indica posible problema cliente.

**Pasos**: revisar lógica de retry del frontend que provoque el spam.

---

## M5 — Alerta: LOCAL vs NUBE diff >0.5% por 2 días

**Significado**: registros locales ≠ registros en backend. Desync grave.

**Pasos**:

1. Para el tenant afectado, query backend:
   ```sql
   SELECT COUNT(*) FROM pos_sales WHERE pos_user_id = '<owner_id>' AND created_at >= NOW() - INTERVAL '7 days';
   ```

2. Cliente reporta su count local. Si diff persistente:
   - Forzar full sync: cliente borra IndexedDB de productos/ventas y hace nuevo GET
   - Verificar OfflineQueue no tenga items en limbo (BUG-F3)

3. Escalar a investigación profunda si diff >5%.

---

## Procedimiento de rollback rápido

### Si BUG-F2 regresa (Idempotency-Key header missing)

```bash
cd /d/github/volvix-pos
git log --oneline public/volvix-offline-queue.js | head -10  # encontrar commit que rompió
git revert <commit_hash>
git push  # Vercel redeploya automaticamente
```

Tiempo estimado: 5 min.

### Si BUG-F7 regresa (CORS Allow-Headers missing)

```bash
# Verificar fix actual:
grep "Access-Control-Allow-Headers" api/index.js
# Si NO contiene "Idempotency-Key":
sed -i "s|'Content-Type,Authorization,apikey'|'Content-Type,Authorization,apikey,Idempotency-Key,X-Cart-Token,If-Match'|" api/index.js
git add api/index.js && git commit -m "fix: re-add CORS headers (BUG-F7 regression)" && git push
```

Tiempo estimado: 3 min.

### Si BUG-F6 regresa (overselling)

```sql
-- Detectar productos con stock negativo en últimas 24h
SELECT id, code, name, stock FROM pos_products WHERE stock < 0 ORDER BY stock ASC LIMIT 50;
```

Si hay registros:
1. Bloquear creación de nuevas ventas para esos productos (UPDATE pos_products SET stock = 0 WHERE stock < 0 — emergencia)
2. Verificar `public/salvadorex-pos.html` línea 9067: items.map debe incluir `id: i.id || null,`
3. Si missing → rollback al commit `41e6445` (BUG-F6 fix)

---

## Cuándo escalar vs auto-resolver

| Situación | Auto-resolver | Escalar |
|---|---|---|
| 1 tenant con M1 alta (>5/hr) | Investigar specific tenant | Si >3 tenants en 1 hora |
| M2 p95 >2s breve (<3h) | Esperar 3h, ver si regresa | Si dura 3+ horas |
| M3 crece pero estable | Monitorear | Si crece >50/día |
| M5 diff <1% | Investigar local de cliente | Si diff >1% en cualquier tabla |
| Smoke test daily falla 1 día | Re-ejecutar | Si falla 2 días seguidos |

---

## Cron schedule recomendado

```cron
# Smoke test cada 24h a las 3am UTC
0 3 * * * cd /opt/volvix-pos && VOLVIX_EMAIL=... VOLVIX_PWD=... node monitoring/daily_smoke.js >> /var/log/volvix-smoke.log

# Alerts cada hora
0 * * * * cd /opt/volvix-pos && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node monitoring/alerts.js >> /var/log/volvix-alerts.log
```

O en GitHub Actions:

```yaml
on:
  schedule:
    - cron: '0 3 * * *'
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node monitoring/daily_smoke.js
        env:
          VOLVIX_EMAIL: ${{ secrets.MONITOR_EMAIL }}
          VOLVIX_PWD: ${{ secrets.MONITOR_PWD }}
```
