---
slug: agregar-cajero
title_es: Agregar y administrar cajeros
title_en: Add and manage cashiers
category: equipo
tags: [usuarios, roles, cajeros, permisos]
updated: 2026-04-28
---

# Agregar y administrar cajeros

Los cajeros son usuarios con permisos limitados (solo cobrar, sin acceso a reportes ni configuracion).

## Crear un cajero

1. Como owner, **Equipo > Nuevo cajero**.
2. Captura:
   - Nombre completo
   - Correo (opcional, recomendado para recuperar PIN)
   - PIN de 4 digitos (no usar 1234, 0000)
   - Sucursal asignada
3. Asigna **permisos**:
   - Cobrar: SI por defecto
   - Aplicar descuento: opcional
   - Procesar devolucion: opcional (suele necesitar autorizacion gerente)
   - Ver reportes propios: opcional
4. Guarda.

El cajero recibe correo (si lo capturaste) con sus credenciales.

## Cambiar PIN o resetear

1. **Equipo > [nombre cajero]**.
2. Click **Resetear PIN**.
3. Captura nuevo PIN.

## Bloquear / suspender cajero

1. **Equipo > [nombre cajero] > Suspender**.
2. El cajero no podra iniciar sesion.
3. Sus ventas previas siguen visibles en reportes.

> No se puede **borrar** un cajero con ventas asociadas. Solo suspender.

## Roles disponibles

| Rol | Cobrar | Devolver | Reportes | Inventario | Configuracion |
|-----|--------|----------|----------|------------|---------------|
| Cajero | Si | Limitado | Propios | No | No |
| Gerente | Si | Si | Sucursal | Si | Limitado |
| Owner | Si | Si | Todo | Si | Si |
| Admin | Si | Si | Todo | Si | Si |

Para cambiar rol: **Equipo > [usuario] > Cambiar rol**.

## Auditoria de cajero

1. **Reportes > Auditoria > [cajero]**.
2. Filtra por fecha.
3. Ve cada venta, devolucion, descuento aplicado, login/logout.

Util para investigar discrepancias en cierre Z.

## Limites por plan

| Plan | Cajeros | Sucursales |
|------|---------|------------|
| Starter | 2 | 1 |
| Pro | 10 | 3 |
| Enterprise | Ilimitados | Ilimitadas |

Si superas el limite, se te invita a actualizar plan al crear el cajero numero (limite + 1).

## Buenas practicas

1. **Un cajero por persona** (no compartir cuentas).
2. PINs unicos, no triviales.
3. Cerrar sesion al terminar turno (cajero abandonado = riesgo).
4. Auditoria semanal: revisa devoluciones y descuentos.
5. Capacitacion en politicas: cuando aprobar descuento, cuando llamar al gerente.
