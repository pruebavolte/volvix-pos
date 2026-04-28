# Escenario 05 — Boutique con 3 sucursales (multi-tenant + branches)

> Tiempo estimado: **25 minutos** para configurar 3 sucursales con stock independiente y reportes consolidados.
> Dificultad: Alta. Requiere planeación de roles + permisos.

## Cliente dice (WhatsApp textual)

> "Tengo 3 boutiques de ropa: Polanco, Roma Norte y Santa Fe. Quiero ver las ventas consolidadas pero también por sucursal. Cada sucursal tiene su propio inventario y empleados. Necesito que la encargada de cada tienda solo vea lo suyo, pero yo veo todo desde mi laptop."

## Tu respuesta inicial (template)

> "Caso clásico multi-sucursal. SalvadoreX lo soporta nativo: 1 cuenta dueño + 3 sub-tenants (uno por boutique) + reportes consolidados.
>
> Plan **Business** $799/mes (incluye sucursales ilimitadas + usuarios ilimitados). Te configuramos en 25 min.
>
> Confirma:
> 1) Nombre legal del grupo (la empresa madre)
> 2) Nombre de cada boutique
> 3) Encargadas de cada sucursal (nombre + email + teléfono)
> 4) ¿Comparten catálogo o cada boutique tiene su catálogo único?"

## Pasos exactos

### Paso 1 — Crear cuenta master (1 min)
1. URL: `/web/v25/admin/create-tenant`.
2. Plan: **Business** ($799/mes).
3. Tipo: **Multi-sucursal master**.
4. Bootstrap demo: catálogo 30 productos ropa.

### Paso 2 — Crear las 3 sub-sucursales (3 min)
URL: `/web/v25/branches/create`

Crear:
1. **Boutique Polanco**
   - Dirección, RFC sucursal (puede heredar del master)
   - Encargada: María González
2. **Boutique Roma Norte**
   - Encargada: Lucia Hernández
3. **Boutique Santa Fe**
   - Encargada: Sofía Pérez

Cada branch tiene su propio:
- Inventario (stock independiente).
- Cortes Z.
- Caja chica.
- Reportes locales.
- Usuarios.

### Paso 3 — Configurar catálogo compartido o por sucursal (5 min)
URL: `/web/v25/inventory/strategy`

Opción A: **Catálogo compartido, stock independiente** (recomendado para boutique)
- Mismos SKUs en las 3 tiendas.
- Cada tienda lleva cuántos tiene.
- Permite traspasos.

Opción B: **Catálogos separados**
- Cada boutique sus propios productos.
- No hay traspasos.

Cliente eligió Opción A.

### Paso 4 — Cargar catálogo + asignar stock inicial (10 min)
1. Subir CSV master `/web/v25/inventory/import-csv`.
2. Por cada producto, asignar stock inicial por sucursal:

```csv
sku,nombre,precio,stock_polanco,stock_roma,stock_santa_fe
ROPA001,Vestido Floreado M,890,15,8,12
ROPA002,Blusa Lino L,650,20,5,10
...
```

3. Sistema valida y carga.

### Paso 5 — Crear usuarios + permisos (3 min)
URL: `/web/v25/users/create`

Roles disponibles:
- **owner** (dueño): ve todo, configura todo.
- **branch_manager** (encargada): solo ve su branch, configura su branch.
- **cashier** (cajera): solo POS de su branch.
- **inventory** (almacén): solo inventario de su branch.

Usuarios:
1. Dueño Carlos → `owner` global.
2. María (Polanco) → `branch_manager` de Polanco.
3. Lucia (Roma) → `branch_manager` de Roma.
4. Sofía (Santa Fe) → `branch_manager` de Santa Fe.
5. (Más cajeras según necesidad)

### Paso 6 — Configurar traspasos (2 min)
URL: `/web/v25/branches/transfers`

Permitir traspasos automáticos:
- Encargada hace solicitud → otra encargada aprueba → stock se mueve.
- Audit log registra origen/destino/motivo.

### Paso 7 — Reportes consolidados (1 min)
URL: `/web/v25/reports/consolidated`

Dueño ve:
- Ventas totales del grupo.
- Ranking sucursales.
- Top productos por sucursal.
- Comparativo mes anterior.
- Heatmap horarios pico por sucursal.

Encargada ve solo:
- Ventas de su sucursal.
- Su inventario.
- Sus empleados.

## Tiempo total

| Paso | Tiempo |
|---|---|
| Cuenta master | 1 min |
| Crear 3 sucursales | 3 min |
| Catálogo strategy | 5 min |
| Carga + stock | 10 min |
| Usuarios + roles | 3 min |
| Traspasos | 2 min |
| Reportes consolidados | 1 min |
| **Total** | **25 min** |

## Screenshots

- `docs/screenshots/scenarios/05/01-multi-tenant-master.png`
- `docs/screenshots/scenarios/05/02-branches-list.png`
- `docs/screenshots/scenarios/05/03-stock-per-branch.png`
- `docs/screenshots/scenarios/05/04-roles-matrix.png`
- `docs/screenshots/scenarios/05/05-consolidated-report.png`
- `docs/screenshots/scenarios/05/06-transfer-flow.png`

## Errores comunes y soluciones

### Error 1: "La encargada ve ventas de otra sucursal"
**Causa**: RLS policy mal configurada.
**Solución**: Verificar `branch_id = current_user_branch()` en policy. Audit log debe rechazar cross-branch.

### Error 2: "Un producto se vende en Polanco pero descuenta de Roma"
**Causa**: branch_id no se está pasando en `create_sale`.
**Solución**: Verificar header `X-Branch-Id` en request. POS debe set en login.

### Error 3: "Reporte consolidado tarda mucho"
**Causa**: Sin índice en `tenant_id + branch_id + created_at`.
**Solución**: Migration con índice compuesto.

### Error 4: "Quiero un branch_manager que vea 2 sucursales pero no las 3"
**Solución**: Tabla `user_branches` permite many-to-many. Asignar branch_ids específicos.

### Error 5: "Dueño quiere transferir TODO el stock de Polanco a Santa Fe"
**Solución**: Bulk transfer en `/web/v25/branches/{id}/bulk-transfer-out`.

## Casos avanzados

### Multi-tenant + multi-empresa (group)
Si el dueño tiene también un restaurante además de las boutiques:
- Crear 2 grupos: "Boutiques Carlos" y "Restaurante Carlos".
- Cada grupo tiene sus sub-branches.
- Reporte super-consolidado a nivel cuenta.

### Franquicias
Si las boutiques son franquicias (mismo dueño paga, otros operan):
- Cada franquicia es **tenant separado** con su propio plan.
- Master ve consolidado vía API publica con tokens.
- Cobro automático de regalías por SaaS.
