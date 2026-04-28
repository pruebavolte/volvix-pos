# Volvix POS — Runbook: Feature Flags

> **Round 8e — FIX-DR4**
> Toggleable runtime flags para rollback sin redeploy.

Este runbook explica cómo usar los feature flags definidos en `pos_feature_flags` para mitigar incidentes en producción **sin necesidad de un nuevo deploy**.

---

## 1. ¿Qué son los feature flags aquí?

Son entradas en la tabla `pos_feature_flags` que el backend y el front consultan para decidir si activar/desactivar comportamiento. Cambiar un flag en la DB toma efecto en **segundos**, sin redeploy.

```sql
-- Schema (creado por r8e-dr-feature-flags.sql)
CREATE TABLE pos_feature_flags (
  key       TEXT PRIMARY KEY,
  enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  scope     TEXT NOT NULL DEFAULT 'global'
              CHECK (scope IN ('global', 'tenant', 'user', 'role')),
  scope_id  TEXT,
  payload   JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  ts        TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);
```

---

## 2. Flags disponibles

### `emergency_mode`
**Efecto**: Activa modo de operación mínima. POS regular se deshabilita y los puntos de venta deben usar `volvix-emergency-mode.html` (cash only, IndexedDB local).

**Cuándo activar**:
- DB caída > 5 min
- API tirando 5xx persistente
- Necesidad de seguir vendiendo aunque sea sin tracking en tiempo real

**Cuándo desactivar**: cuando se confirma que `pos_emergency_sync_queue` está vacío y `/api/health/full` reporta `ok:true`.

### `readonly_mode`
**Efecto**: Bloquea todos los writes en POS. Permite consultas, reportes, navegación, pero no permite crear ventas, productos, ni modificar nada.

**Cuándo activar**:
- Mantenimiento programado
- Migración en curso
- Investigación de corrupción de datos

### `disable_promotions`
**Efecto**: El motor de promociones no se aplica. Los precios mostrados son siempre los del producto sin descuento.

**Cuándo activar**:
- Bug en cálculo de promociones detectado
- Promoción mal configurada que está dando productos gratis
- Auditoría regulatoria de precios

### `disable_kds`
**Efecto**: Kitchen Display System se apaga. Las cocinas vuelven a operar con tickets impresos.

**Cuándo activar**:
- Realtime engine caído
- Pantallas de cocina con problemas masivos
- Vertical food service en horario pico requiere downgrade graceful

---

## 3. Cómo togglear un flag

### Vía Supabase SQL (siempre funciona, incluso si la API está caída)

```sql
-- Activar un flag global
UPDATE pos_feature_flags
   SET enabled = TRUE, updated_at = NOW()
   WHERE key = 'emergency_mode' AND scope = 'global';

-- Desactivar
UPDATE pos_feature_flags
   SET enabled = FALSE, updated_at = NOW()
   WHERE key = 'emergency_mode' AND scope = 'global';

-- Activar SOLO para un tenant específico
INSERT INTO pos_feature_flags (key, enabled, scope, scope_id, description)
VALUES ('disable_kds', TRUE, 'tenant', '<tenant-uuid>',
        'KDS bug en tenant XYZ — workaround temporal')
ON CONFLICT (key) DO NOTHING;
```

### Vía API (cuando la API está sana)

```bash
# GET — leer estado actual
curl -H "Authorization: Bearer $JWT" \
     https://volvix-pos.vercel.app/api/feature-flags

# PATCH — actualizar (requiere rol admin/owner/superadmin)
curl -X PATCH \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{"enabled":true}' \
     https://volvix-pos.vercel.app/api/feature-flags/emergency_mode
```

### Vía Owner Panel UI

`https://volvix-pos.vercel.app/volvix_owner_panel_v7.html` → Settings → Feature Flags

(Disponible cuando la API está sana)

---

## 4. Verificación de estado

### Lista todos los flags
```sql
SELECT key, enabled, scope, scope_id, description, updated_at
  FROM pos_feature_flags
  ORDER BY scope, key;
```

### Cuáles están activos
```sql
SELECT key, scope, scope_id, updated_at
  FROM pos_feature_flags
  WHERE enabled = TRUE
  ORDER BY scope, key;
```

### Ver historial de emergency mode
```sql
SELECT activated_at, activated_by, reason, deactivated_at, deactivated_by
  FROM pos_emergency_mode_log
  ORDER BY activated_at DESC
  LIMIT 20;
```

### Comprobar si un flag está activo (helper)
```sql
SELECT is_feature_enabled('emergency_mode');                   -- global
SELECT is_feature_enabled('disable_kds', '<tenant-uuid>');     -- tenant override
```

---

## 5. Precedencia de scopes

Cuando hay múltiples flags con la misma `key` pero distintos `scope`:

1. **`tenant` + `scope_id` matching**: gana sobre todo
2. **`global`**: default si no hay tenant override

Ejemplo:
- `emergency_mode` global = FALSE
- `emergency_mode` para tenant `aaaa-1111-...` = TRUE
- → solo ese tenant ve emergency mode activo

---

## 6. Plantillas de runbook por flag

### Activar emergency_mode

```sql
BEGIN;

UPDATE pos_feature_flags
   SET enabled = TRUE,
       updated_at = NOW(),
       updated_by = '<tu-uuid>'
   WHERE key = 'emergency_mode';

INSERT INTO pos_emergency_mode_log (activated_by, reason, scope, notes)
VALUES (
  '<tu-uuid>',
  'API 5xx > 5 min — fallback cash-only',
  'global',
  'Incidente #123 — IC: @nombre'
);

COMMIT;

-- Verificar
SELECT * FROM pos_feature_flags WHERE key = 'emergency_mode';
```

### Desactivar emergency_mode (después de recovery)

```sql
BEGIN;

-- Verificar que no hay ventas pendientes
SELECT COUNT(*) FROM pos_emergency_sync_queue WHERE processed_at IS NULL;
-- Debe ser 0; si no, NO desactives todavía

UPDATE pos_feature_flags
   SET enabled = FALSE,
       updated_at = NOW(),
       updated_by = '<tu-uuid>'
   WHERE key = 'emergency_mode';

UPDATE pos_emergency_mode_log
   SET deactivated_at = NOW(),
       deactivated_by = '<tu-uuid>'
   WHERE deactivated_at IS NULL;

COMMIT;
```

---

## 7. Logging y auditoría

Cada cambio en `pos_feature_flags`:
- Actualiza `updated_at` (trigger)
- Registra `updated_by` (manual o vía API)
- Las activaciones/desactivaciones de `emergency_mode` se duplican en `pos_emergency_mode_log` para auditoría regulatoria

Para reporte completo de cambios:
```sql
SELECT
  ff.key,
  ff.enabled,
  ff.updated_at,
  u.email AS updated_by_email
FROM pos_feature_flags ff
LEFT JOIN pos_users u ON u.id = ff.updated_by
ORDER BY ff.updated_at DESC;
```

---

## 8. Best practices

- **Documenta SIEMPRE el motivo** en `description` o en `pos_emergency_mode_log.reason`
- **Limita el scope**: prefiere flag por tenant antes que global
- **Comunica al equipo**: postea en `#volvix-eng` cada vez que actives un flag global
- **Revierte rápido**: los flags son **mitigación temporal**, no solución. Abre ticket de fix permanente
- **Drill mensual**: prueba activar/desactivar cada flag en staging para asegurar que el efecto es el esperado
