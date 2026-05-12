# HUMAN_ACTION_REQUIRED.md

Acciones que NO se pudieron automatizar y requieren intervención manual del usuario.

---

## ACCIÓN 1 — Activación de workflows nuevos en GitHub ✅ RESUELTO

**Estado**: ✅ **COMPLETADO 2026-05-12 22:31 UTC**.

**ROOT CAUSE encontrado**: el `default_branch` del repo era `master`, no `main`. GitHub Actions solo indexa workflows del default branch, por eso los pushes a `main` no producían workflows visibles.

**Fix aplicado** (vía API, sin intervención humana):
```bash
curl -X PATCH /repos/pruebavolte/volvix-pos -d '{"default_branch":"main"}'
```

**Verificación**:
- `gh workflow list` ahora muestra los 9 workflows incluyendo `Monitoring Cron` y `Week 1 Final Report`
- Primer run manual: https://github.com/pruebavolte/volvix-pos/actions/runs/25766086128 → **success** en 17s
- Ambos jobs (`alerts` y `smoke`) pasaron todos los steps

Ver `monitoring/CIERRE_DEFINITIVO.md` para reporte completo.

---

## ACCIÓN 2 — Crear tabla `client_errors` en Supabase (opcional)

**Estado**: backend `/api/log/client` endpoint (línea 1955 de api/index.js) intenta persistir a tabla `client_errors` que **NO EXISTE** en Supabase. Falla silenciosamente con `.catch(() => {})` y devuelve 200 al cliente.

**Workaround actual**: el monitoreo lee de `observability_events` (tabla que SÍ existe). Para que el flujo de telemetría desde el frontend persista correctamente, una de estas dos:

### Opción A — Crear `client_errors` (más simple)

Ejecutar en Supabase SQL Editor (https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql):

```sql
CREATE TABLE IF NOT EXISTS public.client_errors (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT NOW(),
  level TEXT,
  message TEXT,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  ip TEXT,
  meta JSONB
);
CREATE INDEX IF NOT EXISTS idx_client_errors_msg_ts ON public.client_errors(message, ts);

-- RLS: service_role puede todo; anon no puede leer
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.client_errors FOR ALL USING (auth.role() = 'service_role');
```

### Opción B — Modificar backend para usar `observability_events` (más invasivo)

Editar `api/index.js` línea 1955:
```js
// ANTES:
await supabaseRequest('POST', '/client_errors', safe).catch(() => {});
// DESPUES:
await supabaseRequest('POST', '/observability_events', {
  type: safe.message, severity: safe.level, message: safe.message,
  tenant_id: safe.meta?.tenant_id, payload: safe.meta, user_agent: safe.user_agent
}).catch(() => {});
```

**Recomendado**: Opción A (no toca backend, 1 vez ejecutar).

---

## ACCIÓN 3 — Configurar webhook Slack/Discord/Telegram (opcional)

**Estado**: TAREA 8 — no se encontraron credenciales de webhook en `.env`.

**Si quieres notificaciones push de alertas P0**:

1. Crear webhook en tu plataforma:
   - Slack: https://api.slack.com/messaging/webhooks
   - Discord: server settings → Integrations → Webhooks
   - Telegram: BotFather → crear bot → `/api/sendMessage`

2. Agregar secret en GitHub:
   ```bash
   gh secret set MONITORING_WEBHOOK --repo pruebavolte/volvix-pos --body "https://hooks.slack.com/services/XXX"
   ```

3. Agregar al final de `monitoring/alerts.js` después del último `console.log`:
   ```js
   if (alerts.length > 0 && process.env.MONITORING_WEBHOOK) {
     await new Promise(resolve => {
       const u = new URL(process.env.MONITORING_WEBHOOK);
       const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
         headers: { 'Content-Type': 'application/json' } }, () => resolve());
       r.on('error', () => resolve());
       r.write(JSON.stringify({ text: `Volvix monitoring alerts: ${alerts.map(a=>a.msg).join(', ')}` }));
       r.end();
     });
   }
   ```

---

## ACCIÓN 4 — GitHub secret `SUPABASE_SERVICE_ROLE_KEY` ya configurado correctamente

**Estado**: actualizado el 2026-05-12 22:14 con el valor de `SUPABASE_SERVICE_KEY` del `.env` local (la key correcta, no la _ROLE_ que estaba mal nombrada).

Verificar:
```bash
gh secret list --repo pruebavolte/volvix-pos
```

Debe mostrar 4 secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (apunta al valor de SUPABASE_SERVICE_KEY del .env, correcto)
- `MONITOR_EMAIL`
- `MONITOR_PWD`

---

## Resumen de acciones pendientes

| # | Acción | Tiempo estimado | Prioridad |
|---|---|---|---|
| 1 | Activar workflows en GitHub UI | 3 min | P1 (no urgente, ya validado local) |
| 2 | Crear tabla `client_errors` SQL | 30 segundos | P2 (workaround activo) |
| 3 | Configurar webhook (opcional) | 5 min | P3 |
| 4 | Verificar secrets | ya hecho | — |
