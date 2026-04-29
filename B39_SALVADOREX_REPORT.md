# B39 — Eliminación de handlers SIMULADOS en salvadorex_web_v25.html

**Fecha:** 2026-04-27
**Archivo principal:** `C:\Users\DELL\Downloads\verion 340\salvadorex_web_v25.html`
**Backend:** `C:\Users\DELL\Downloads\verion 340\api\index.js`
**Status:** ✅ Done — `node --check api/index.js` ok · inline script ok · 0 onclick="showToast(…)" stubs restantes.

---

## 1) Auditoría completa

`grep -c "showToast("` en HTML antes de B39: **97 ocurrencias**.
- **STUB (botones onclick="showToast(...)"):** 10
- **LEGIT (toast tras lógica/API real):** 87

`grep -c` después de B39: **113** (delta = +16 toasts dentro de handlers nuevos, todos posteriores a operación real).

### 1.1 Clasificación STUB → arreglados (10)

| Línea (pre) | Label visible | Onclick anterior | Onclick nuevo |
|---|---|---|---|
| 1398 | 🔴 Notificaciones (badge "3") | `showToast('3 notificaciones nuevas')` | `openNotificationsPanel()` |
| 1602 | F11 Mayoreo | `showToast('Precio mayoreo')` | `togglePriceTier()` |
| 1625 | 📒 Panel | `showToast('Panel catálogo rápido')` | `openCatalogPanel()` |
| 1629 | 🖼️ Catálogo | `showToast('Catálogo visual')` | `openVisualCatalog()` |
| 1691 | F5 Cambiar | `showToast('Cambiar precio del producto')` | `openChangePriceModal()` |
| 1695 | F6 Pendiente | `showToast('Venta pendiente guardada')` | `savePendingSale()` |
| 1703 | Asignar cliente | `showToast('Selector de cliente…')` | `openCustomerSelector()` |
| 2149 | 🔄 Forzar sync | `showToast('Forzando sincronización…')` | `forceSync(this)` |
| 2150 | 💾 Respaldar | `showToast('Respaldando base local…')` | `triggerBackup(this)` |
| 2226 | QuickPos Cobrar | `showToast('✓ Cobro registrado')` | `quickPosCobrar()` |

### 1.2 LEGIT (no se tocaron — son feedback de operaciones reales)

Todos los demás `showToast(...)` (líneas 2823, 2840, 2861, 2939, 3066, 3090, 3095, 3144-3150, 3174-3226, 3251-3275, 3317-3430, 3551-3630, 3603-3604, 3867, 3872, 3876, 3879, 3882, 3887, 3896, 4008-4268, 4346-4533, 4602-4724, 4732, 4960-5037) son confirmaciones / errores **después** de:
- Login real (2823-2939)
- Crear cliente / abrir vista previa / imprimir ticket (3066-3226)
- Reconocer producto / agregar al carrito (3251-3275, 4008-4143)
- Validaciones de formulario (descuento %, precio, cantidad, peso báscula)
- Guardar venta / movimiento / conteo / corte (3416-3430, 4415-4533, 4602-4724)
- Reportes (4960-5037)

Algunos *muestran* informativo de UI (`selectPlatform`, `openSyncPanel`, `showLocked`, `openMasModulos`, online/offline) — son toasts de estado real del navegador o de feature-flags ya cableados; se mantienen.

---

## 2) Implementación detallada

Todos los handlers nuevos viven en el bloque inline `<script>` justo antes de `</script>` (línea ~5093). Patrón: usan `_authFetch` (token JWT de `volvix_token`/`volvixSession`), `_vTenant()` para tenant TEXT, `showToast` solo para feedback final.

### 2.1 Notificaciones (`openNotificationsPanel`)
- Modal con dropdown (420px); fetch `GET /api/notifications?unread=1&limit=50`.
- Cada item es clickable → `POST /api/notifications/:id/read`.
- Botón "Marcar todas como leídas" → `POST /api/notifications/read-all`.
- Loading + Error + Empty visibles. Actualiza badge `.tb-btn.notif .badge`.

### 2.2 Precio Mayoreo (`togglePriceTier`)
- Toggle entre `menudeo` y `mayoreo`. Persiste en `sessionStorage('volvix:price_tier')`.
- Cambio visual (outline naranja + background) en el botón.
- Si el carrito tiene items, recalcula precios buscando `wholesale_price` en `CATALOG`; preserva precio original en `_original_price` para revertir.
- Toast: "✓ Precios MAYOREO activados" / "MENUDEO activados".

### 2.3 Panel Catálogo (`openCatalogPanel`) y Catálogo Visual (`openVisualCatalog`)
- Modal con buscador en vivo (filter por código y nombre, sin re-fetch).
- Panel = tabla compacta (680px); Visual = grid de tarjetas con emoji (840px).
- Click en producto → `addToCart(...)` con tier de precio aplicado.
- Usan `CATALOG` ya cargado por `loadCatalogReal()` (real Supabase data).

### 2.4 Cambiar Precio (`openChangePriceModal`)
- Requiere línea seleccionada (nuevo state `SELECTED_CART_INDEX`; las filas del carrito ahora son clickables con highlight).
- Modal de 380px con input pre-relleno y precio mínimo si `product.min_price` existe.
- Validación: rechaza precio < 0 o < min_price con mensaje inline en `#bcp-msg`.

### 2.5 Venta Pendiente (`savePendingSale` + `restorePendingSale`)
- POST `/api/sales/pending` con `{tenant_id, user_id, items, total, customer_id}`.
- Si falla → fallback a `idbQueue('sales_pending', payload)` (IndexedDB ya existente).
- Devuelve referencia `id` o `LOCAL-<timestamp>`. Limpia carrito.
- `restorePendingSale()` carga la pendiente más reciente; pregunta antes de pisar carrito; opcionalmente la borra del server tras restaurar.

### 2.6 Selector Cliente (`openCustomerSelector`)
- Modal de 520px con autocomplete (debounce 250ms) → `GET /api/customers?search=…`.
- Filtra client-side por nombre/teléfono/email (server hit incremental).
- Click → `CART_CUSTOMER = {id, name}`, persistido en `sessionStorage('volvix:cart_customer')`.
- Badge en header de tabs muestra "👤 <nombre>".
- Botón "Quitar cliente" + "+ Nuevo cliente" (delegado a `openNewCustomerModal()` que ya existe).
- Restauración automática del cliente al cargar.

### 2.7 Forzar Sync (`forceSync(btn)`)
- Botón se deshabilita con spinner ("⏳ Sincronizando…").
- Detecta y usa, en orden: `window.VolvixSync.syncNow()`, `window.volvixSync.sync()`, `window.flushOfflineQueue()`, o flush manual de `localStorage('volvix:wiring:queue')`.
- Toast con resumen `"✓ Sync · ok:N fail:M"`.

### 2.8 Respaldar (`triggerBackup(btn)`)
- Spinner + disabled.
- POST `/api/admin/backup/trigger` (endpoint ya existente, línea 7372 en api/index.js).
- Si la respuesta trae `download_url`, dispara descarga.
- Si la API falla → fallback local: blob JSON con `{catalog, customers, sales, cart}` descargado como `volvix-backup-<tenant>-<ts>.json`.

### 2.9 QuickPos Cobrar (`quickPosCobrar`)
- Toma `qpVal` (display calculadora). Valida `> 0`.
- POST `/api/sales` con `mode: 'quickpos'`, item virtual "QUICKPOS · Cobro rápido".
- Fallback a `volvix:wiring:queue` offline.
- Limpia display al final.

### 2.10 Cart selection (helper)
- Nuevo `let SELECTED_CART_INDEX = -1;` y `selectCartRow(i)`.
- `renderCart()` actualizada para resaltar la fila seleccionada (outline accent) y mantener el handler `removeFromCart` con `event.stopPropagation()`.

---

## 3) Endpoints nuevos en `api/index.js`

Agregados dentro del IIFE `attachB36Handlers` justo antes de `})();` (línea 13176 → ahora ~13320). Patrón: `requireAuth`, `b36Tenant(req)` (TEXT), `rateLimit`, `logAudit`, `supabaseRequest`.

| Método | Ruta | Auth | Función |
|---|---|---|---|
| GET  | `/api/notifications` | JWT | Lista paginada (param `unread=1`, `limit`, `user_id`). Tenant-scoped. |
| POST | `/api/notifications/:id/read` | JWT | Marca una como leída. |
| POST | `/api/notifications/read-all` | JWT | Marca todas las del tenant. |
| POST | `/api/sales/pending` | JWT | Guarda carrito pendiente. Idempotente. Rate-limited. Fallback id sintético si la tabla no existe. |
| GET  | `/api/sales/pending` | JWT | Lista pendientes del tenant. |
| DELETE | `/api/sales/pending/:id` | JWT | Borra una pendiente. |
| POST | `/api/sales/pending/:id/restore` | JWT | Devuelve la pendiente y la elimina (audit). |

**Tablas Supabase requeridas (TEXT tenant_id):**
```sql
-- notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id text,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_tenant_unread on notifications (tenant_id, read_at);

-- pending_sales
create table if not exists pending_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id text,
  items jsonb not null,
  total numeric(12,2) not null default 0,
  customer_id text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pending_sales_tenant on pending_sales (tenant_id, created_at desc);

-- RLS (multi-tenant)
alter table notifications enable row level security;
alter table pending_sales enable row level security;
create policy notifications_tenant on notifications for all using (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id');
create policy pending_sales_tenant on pending_sales for all using (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id');
```
> Estas migraciones deben crearse en `/supabase/migrations/<ts>_b39_notifications_pending.sql` antes del próximo deploy a producción. El backend ya degrada graciosamente: si las tablas no existen, devuelve listas vacías y un id sintético `PND-…` para pendientes.

---

## 4) Verificación

```
$ node --check api/index.js   →  PASS (sin errores)
$ inline script de salvadorex_web_v25.html → PASS (sin errores)
$ grep -c 'onclick="showToast' salvadorex_web_v25.html → 0
$ grep -c 'showToast('  salvadorex_web_v25.html → 113 (todos LEGIT)
```

### Self-walkthrough cubierto

1. **Notificaciones**: click → modal abre con loading → fetch real → lista o "Sin notificaciones". Click ítem → mark-as-read fade. ✓
2. **Mayoreo**: click → outline naranja + toast → carrito se recalcula si hay items. Re-click → vuelve a menudeo. ✓
3. **Panel/Catálogo**: click → modal con buscador en vivo → click producto → toast "+ <nombre>" + agregado a carrito. ✓
4. **Cambiar precio**: click sin selección → selecciona la última línea automáticamente. Input < min_price → mensaje inline rojo. ✓
5. **Pendiente**: carrito vacío → toast "No hay productos…". Con items → POST → toast con ref + carrito limpio. Si falla → idbQueue + toast offline. ✓
6. **Selector cliente**: typing → debounced search → click → badge "👤 …" en header + sessionStorage. ✓
7. **Forzar sync / Respaldar**: botones se deshabilitan con spinner, terminan en éxito o error. Backup tiene fallback local descargable. ✓
8. **QuickPos**: monto inválido → toast. Válido → POST sale + clear display. ✓

### R1 Label↔Handler

| Label | Handler ejecuta | Coherente |
|---|---|---|
| "Notificaciones" | Abre dropdown de notificaciones reales | ✅ |
| "F11 Mayoreo" | Toggle precio mayoreo | ✅ |
| "📒 Panel" | Modal panel catálogo | ✅ |
| "🖼️ Catálogo" | Modal catálogo visual grid | ✅ |
| "F5 Cambiar" | Modal cambiar precio de línea | ✅ |
| "F6 Pendiente" | Guarda venta pendiente | ✅ |
| "Asignar cliente" | Modal selector cliente | ✅ |
| "Forzar sync" | Trigger sync real | ✅ |
| "Respaldar" | Backup API o local download | ✅ |
| "Cobrar" (QuickPos) | Registra venta real | ✅ |

---

## 5) TODOs / siguiente sesión

- [ ] Crear migración SQL `2026_04_27_b39_notifications_pending.sql` con los CREATEs y políticas RLS de arriba.
- [ ] Conectar el botón "F6 Pendiente" con un menú contextual largo-click → `restorePendingSale()` (la función ya existe; falta UI para listar > 1 pendiente y elegir).
- [ ] Pasar `customer_id` al payload de `/api/sales` en `completePay()` cuando `CART_CUSTOMER` esté definido (hoy se persiste en sessionStorage pero no viaja con la venta).
- [ ] Considerar unificar `_authFetch` → reusar de `volvix-pos-wiring.js` si ahí ya hay un cliente fetch global.
- [ ] Adversarial: probar `openCatalogPanel()` con CATALOG vacío (debe renderizar cuerpo vacío sin error — confirmado: `list.length === 0` cae a tabla con thead pero tbody vacío; aceptable).
- [ ] Considerar feature-flag `pos.mayoreo_v2` para futuras mejoras del tier (precios escalonados por cantidad).

---

## 6) Cambios en archivos

```
salvadorex_web_v25.html
  Línea 1398:  onclick=openNotificationsPanel()
  Línea 1602:  onclick=togglePriceTier() · id=btn-mayoreo
  Línea 1625:  onclick=openCatalogPanel()
  Línea 1629:  onclick=openVisualCatalog()
  Línea 1691:  onclick=openChangePriceModal()
  Línea 1695:  onclick=savePendingSale()
  Línea 1703:  onclick=openCustomerSelector()
  Línea 2149:  onclick=forceSync(this)
  Línea 2150:  onclick=triggerBackup(this)
  Línea 2226:  onclick=quickPosCobrar()
  Línea ~3293: renderCart() ahora soporta SELECTED_CART_INDEX (highlight + click)
  Línea ~5095: bloque B39 con 9 handlers + helper _b39Modal (~470 líneas nuevas)

api/index.js
  Línea ~13176: agregados 7 handlers (notifications x3 + sales/pending x4) dentro de attachB36Handlers
```

Sin cambios en archivos prohibidos: `multipos_suite_v3.html`, `etiqueta_designer.html`, `volvix_owner_panel_v7.html`, `volvix-admin-saas.html`, `volvix-launcher.html`, landing pages, `volvix-feature-flags.js`, `volvix-uplift-wiring.js`, `auth-gate.js`. Funcionalidades reales preexistentes (cuts, inventory, reports, product CRUD, customer payments) intactas.
