# PIPELINE_VALIDATION.md — TAREA 5

## Resultado: PASS

### Datos sintéticos inyectados
- 5 eventos `telemetry.sale_latency` (duration_ms 833-1180)
- 1 evento `telemetry.queue_fail` (synthetic, retries=6, reason=client-error)
- Todos POST 201 a `/rest/v1/observability_events` con `tenant_id=monitoring-bot`

### Verificación por alerts.js
```json
{
  "checked_at": "2026-05-12T22:15:26.880Z",
  "alerts": [],   // sin alertas (datos bajo umbral)
  "metrics": {
    "m1_fails_1h": 1,        // 1 queue_fail detectado (umbral >5)
    "m2_p95_ms": 1234,        // p95 medido (umbral >2000)
    "m3_max_retries": 0       // no había stats event
  }
}
```

### Cleanup
```
DELETE /rest/v1/observability_events?tenant_id=eq.monitoring-bot
→ HTTP 204
GET count tras delete → 0
```

### Pipeline confirmado
- POST a Supabase observability_events: 201
- Query desde alerts.js: lee correctamente
- Threshold logic: identifica datos pero NO dispara alerta cuando bajo umbral
- Cleanup: data sintética eliminada

## Limitación detectada
El `volvix-telemetry.js` del cliente posea a `/api/log/client` que internamente intenta persistir a `client_errors` (tabla NO existente). Para que el pipeline funcione end-to-end desde el frontend, requiere ACCIÓN 2 en HUMAN_ACTION_REQUIRED.md.
