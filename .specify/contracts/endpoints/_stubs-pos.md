# Stubs — Top 20 Endpoints Exclusivos POS

> Generado por Wave 2C — 2026-05-15
> Fuente: system-map.json nodos con `exclusivo: "POS"` (primeros 20 por orden alfabético de ID)

---

## `POST? /api/admin/backup/trigger`
- Exclusivo: POS
- Auth: TODO (presumiblemente superadmin)
- Tabla(s): TODO
- Notas: Trigger manual de backup — visto solo en comentarios de POS. No hay handler documentado en index.js con este path exacto.

---

## `GET /api/app/branding`
- Exclusivo: POS
- Auth: TODO (probablemente público o tenant-scoped)
- Tabla(s): `pos_app_branding`
- Notas: Devuelve configuración de branding (logo, colores) para la PWA cliente. Ver también PATCH /api/app/branding en index.js línea 41019.

---

## `GET /api/app/branding/` (trailing slash variant)
- Exclusivo: POS
- Auth: TODO
- Tabla(s): `pos_app_branding`
- Notas: Variante con trailing slash — puede ser alias o 404. Verificar normalización de rutas en el router.

---

## `GET|POST /api/app/media`
- Exclusivo: POS
- Auth: TODO (GET probablemente público; POST requiere owner/superadmin)
- Tabla(s): `pos_app_media`
- Notas: Gestión de media (banners, imágenes) para la PWA cliente del tenant. GET retorna lista; POST sube nuevo item.

---

## `GET|POST /api/app/media/` (trailing slash variant)
- Exclusivo: POS
- Auth: TODO
- Tabla(s): `pos_app_media`
- Notas: Variante con trailing slash — verificar router.

---

## `POST /api/audit/manual-search`
- Exclusivo: POS
- Auth: TODO (presumiblemente superadmin o admin)
- Tabla(s): TODO (`audit_log` probable)
- Notas: Búsqueda manual en log de auditoría desde panel superadmin del POS.

---

## `POST /api/auth/heartbeat`
- Exclusivo: POS
- Auth: TODO (probablemente JWT requerido)
- Tabla(s): TODO (posiblemente actualiza `last_seen` en `pos_usuarios`)
- Notas: Keep-alive de sesión. Llamado periódicamente para mantener sesión activa y detectar expiración.

---

## `POST /api/auth/resend-verify`
- Exclusivo: POS
- Auth: TODO
- Tabla(s): TODO
- Notas: Reenvío de email de verificación de cuenta. Botón "Reenviar correo" en POS (handler `window.__vlxResendVerify`).

---

## `GET /api/auth/session-config`
- Exclusivo: POS
- Auth: TODO (probablemente JWT)
- Tabla(s): TODO
- Notas: Configuración de sesión del usuario actual (timeout, permisos). Puede devolver feature flags por sesión.

---

## `POST /api/auth/sessions/revoke`
- Exclusivo: POS
- Auth: TODO (superadmin o el propio usuario)
- Tabla(s): TODO
- Notas: Revocación de sesiones activas. Usado en gestión de seguridad desde config del POS.

---

## `GET /api/barcode-lookup`
- Exclusivo: POS
- Auth: TODO (probablemente JWT + cualquier rol)
- Tabla(s): `pos_products` (probable)
- Notas: Búsqueda de producto por código de barras. Query param `?code=<barcode>`. Core del flujo de cobro en POS.

---

## `GET /api/business-plan`
- Exclusivo: POS
- Auth: TODO (owner/superadmin)
- Tabla(s): `volvix_licencias` o `pos_companies` (probable)
- Notas: Devuelve el plan actual del negocio (starter, pro, enterprise). Usado en pantalla de Licencia del POS config.

---

## `GET|POST /api/cart/draft`
- Exclusivo: POS
- Auth: TODO (JWT + cajero mínimo)
- Tabla(s): TODO (`pos_cart_drafts` probable)
- Notas: Persistencia del carrito en progreso. GET recupera draft activo; POST guarda/actualiza. Permite recuperar ticket tras cierre accidental.

---

## `GET /api/cart/draft.` (variante con punto)
- Exclusivo: POS
- Auth: TODO
- Tabla(s): TODO
- Notas: Variante con punto al final — probablemente artefacto del scanner de system-map. Verificar si es ruta real o falso positivo.

---

## `POST /api/cart/draft/clear`
- Exclusivo: POS
- Auth: TODO (JWT)
- Tabla(s): TODO (`pos_cart_drafts` probable)
- Notas: Limpia/elimina el draft activo del carrito. Llamado al completar o cancelar una venta.

---

## `GET|POST /api/customers`
- Exclusivo: POS
- Auth: TODO (JWT, presumiblemente cajero+)
- Tabla(s): `pos_clientes` o `volvix_clientes` (probable)
- Notas: CRUD de clientes. GET lista clientes del tenant; POST crea nuevo cliente. Alimenta la pantalla de Clientes en POS.

---

## `GET /api/cuts`
- Exclusivo: POS
- Auth: TODO (JWT, cajero+ o admin+)
- Tabla(s): `volvix_ventas` o tabla dedicada de cortes
- Notas: Lista de cortes de caja históricos del tenant.

---

## `GET /api/cuts/` (trailing slash)
- Exclusivo: POS
- Auth: TODO
- Tabla(s): TODO
- Notas: Variante con trailing slash — verificar router.

---

## `POST /api/cuts/close`
- Exclusivo: POS
- Auth: TODO (cajero o admin — rol que puede cerrar turno)
- Tabla(s): `volvix_ventas` + tabla de cortes (probable)
- Notas: Cierra el corte de caja activo. Calcula totales, registra diferencias, genera PDF/ticket de corte. Acción crítica en flujo de POS.

---

## `POST /api/cuts/open`
- Exclusivo: POS
- Auth: TODO (cajero o admin)
- Tabla(s): tabla de cortes (probable)
- Notas: Abre un nuevo turno/corte de caja. Registra monto inicial en caja. Precondición para poder cobrar en POS (pantalla `apertura`).

---
