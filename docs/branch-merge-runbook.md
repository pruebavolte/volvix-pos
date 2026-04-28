# Runbook: Fusión de sucursales y cierre histórico

> **Audiencia:** superadmin / DevOps. Aplica cuando el endpoint
> `POST /api/branches/merge` o `PATCH /api/branches/:id { status:'closed' }`
> aún no está deployeado y hay que ejecutar la operación manualmente
> contra Postgres / Supabase.

---

## 1. Preparación obligatoria (antes de tocar SQL)

1. Confirma con el dueño del tenant que:
   - No hay cortes de caja abiertos en la sucursal origen.
   - El inventario fue auditado (snapshot exportado a CSV).
   - Los empleados ya fueron notificados / re-asignados.
2. Toma un backup puntual:
   ```sql
   -- snapshot de la sucursal origen + sus referencias
   COPY (SELECT * FROM branches WHERE id = :from_id)
     TO '/tmp/branch_merge_backup_branches.csv' WITH CSV HEADER;
   COPY (SELECT * FROM products WHERE branch_id = :from_id)
     TO '/tmp/branch_merge_backup_products.csv' WITH CSV HEADER;
   COPY (SELECT * FROM sales WHERE branch_id = :from_id)
     TO '/tmp/branch_merge_backup_sales.csv' WITH CSV HEADER;
   COPY (SELECT id, branch_scope FROM users WHERE :from_id = ANY(branch_scope))
     TO '/tmp/branch_merge_backup_users.csv' WITH CSV HEADER;
   ```
3. Anota en bitácora: `tenant_id`, `from_id`, `into_id`, razón, hora.

---

## 2. FIX-N4-3 — Fusión de dos sucursales (consolidación)

> Mueve productos, ventas, inventario y usuarios de `from_id` → `into_id`
> y marca la sucursal origen como `merged`.

```sql
BEGIN;

-- 0. Validar pre-condiciones
SELECT
  (SELECT count(*) FROM cash_register_sessions
     WHERE branch_id = :from_id AND closed_at IS NULL) AS open_cash,
  (SELECT count(*) FROM products  WHERE branch_id = :from_id) AS prods,
  (SELECT count(*) FROM sales     WHERE branch_id = :from_id) AS sales,
  (SELECT count(*) FROM users     WHERE :from_id = ANY(branch_scope)) AS users;
-- abortar si open_cash > 0

-- 1. Mover productos (mismo tenant)
UPDATE products
   SET branch_id = :into_id, updated_at = NOW()
 WHERE branch_id = :from_id;

-- 2. Re-asignar ventas históricas (auditoría: dejamos rastro en metadata)
UPDATE sales
   SET branch_id = :into_id,
       metadata  = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('merged_from_branch', :from_id::text,
                                         'merged_at', NOW())
 WHERE branch_id = :from_id;

-- 3. Mover líneas de venta / inventory_movements / cortes (mismo patrón)
UPDATE sale_items            SET branch_id = :into_id WHERE branch_id = :from_id;
UPDATE inventory_movements   SET branch_id = :into_id WHERE branch_id = :from_id;
UPDATE cash_register_sessions SET branch_id = :into_id WHERE branch_id = :from_id;

-- 4. Re-asignar branch_scope de usuarios
UPDATE users
   SET branch_scope = array_remove(
                        array_append(array_remove(branch_scope, :from_id), :into_id),
                        NULL)
 WHERE :from_id = ANY(branch_scope);

-- 5. Marcar sucursal origen como merged (NO la borramos por auditoría)
UPDATE branches
   SET status        = 'merged',
       merged_into   = :into_id,
       merged_at     = NOW(),
       merged_reason = :reason
 WHERE id = :from_id;

-- 6. Log de auditoría
INSERT INTO audit_log (tenant_id, user_id, action, resource, resource_id, after, ts)
VALUES (
  :tenant_id, :actor_id, 'branch.merge', 'branch', :from_id,
  jsonb_build_object('from', :from_id, 'into', :into_id, 'reason', :reason),
  NOW()
);

COMMIT;
```

**Rollback:** sólo posible desde el backup CSV (no hay UNDO automático).

---

## 3. FIX-N4-4 — Cierre histórico de sucursal (mantener auditoría)

> NO borra nada: deja la sucursal como `closed` con timestamp y razón.
> Las consultas de reportes deben aceptar `?include_closed=1` para verla.

```sql
BEGIN;

-- 1. Cierre lógico
UPDATE branches
   SET status        = 'closed',
       closed_at     = NOW(),
       closed_reason = :reason
 WHERE id = :branch_id
   AND status = 'active';

-- 2. Bloquear nuevas ventas a nivel app (si hay flag por tabla)
UPDATE branch_settings
   SET accepts_new_sales = FALSE
 WHERE branch_id = :branch_id;

-- 3. Audit log
INSERT INTO audit_log (tenant_id, user_id, action, resource, resource_id, after, ts)
VALUES (
  :tenant_id, :actor_id, 'branch.close', 'branch', :branch_id,
  jsonb_build_object('closed_at', NOW(), 'reason', :reason),
  NOW()
);

COMMIT;
```

**Re-apertura:**
```sql
UPDATE branches
   SET status = 'active', closed_at = NULL, closed_reason = NULL
 WHERE id = :branch_id AND status = 'closed';
```

---

## 4. FIX-N4-5 — Permisos granulares por sucursal (matriz)

> Set masivo de `branch_scope` desde la matriz user × branch.

```sql
-- Por usuario (lo que hace el endpoint)
UPDATE users
   SET branch_scope = :branch_ids::text[]
 WHERE id = :user_id
   AND tenant_id = :tenant_id;
```

`branch_scope = '{}'` (array vacío) significa "acceso a TODAS las sucursales del tenant" (default).

**RLS recomendado** (ya debería estar en migrations):
```sql
CREATE POLICY branch_scope_filter ON sales FOR SELECT
USING (
  tenant_id = auth.jwt()->>'tenant_id'
  AND (
    array_length(
      (SELECT branch_scope FROM users WHERE id = auth.uid()),
      1
    ) IS NULL
    OR branch_id = ANY(
      (SELECT branch_scope FROM users WHERE id = auth.uid())
    )
  )
);
```

---

## 5. Validación post-fusión / cierre

```sql
-- contar
SELECT
  (SELECT count(*) FROM products WHERE branch_id = :into_id) AS prods_in_dest,
  (SELECT count(*) FROM products WHERE branch_id = :from_id) AS prods_in_orig, -- debe ser 0
  (SELECT count(*) FROM sales    WHERE branch_id = :from_id) AS sales_orig,    -- debe ser 0
  (SELECT status, merged_into, closed_at FROM branches WHERE id = :from_id);
```

---

## 6. Endpoints REST esperados (cuando se deployen)

| Método | Ruta                                   | Body                                            | Quién |
|-------:|----------------------------------------|-------------------------------------------------|-------|
|  POST  | `/api/branches/merge`                  | `{ from, into, reason }`                        | superadmin |
|   GET  | `/api/branches/merge/preview`          | query `?from=&into=`                            | superadmin |
|  PATCH | `/api/branches/:id`                    | `{ status:'closed', closed_reason }`            | owner / admin |
|  PATCH | `/api/users/:id/branch-scope`          | `{ branch_ids: [...] }`                         | owner / superadmin |

> Mientras no existan, las UIs muestran un mensaje y apuntan a este runbook.

---

## 7. Bitácora obligatoria

Después de aplicar cualquier operación manual, registra en `OPS_BITACORA.md`:

```
2026-04-28 14:32 — FIX-N4-3 fusión sucursales
   tenant: <id>  from: <id>  into: <id>
   actor: <email>  razón: "<txt>"
   conteos: prods 12, sales 4321, users 3
   verificado por: <ingeniero>
```
