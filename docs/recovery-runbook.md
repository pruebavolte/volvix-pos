# Recovery Runbook — Volvix POS PWA

**Owner:** R10e-C
**Scope:** Recovery total tras suspensión Windows / Windows update / IndexedDB falla / caché corrupto
**Componentes:** `volvix-recovery-wiring.js`, `sw.js` (listener `FORCE_REFRESH`)

---

## 1. Resumen ejecutivo

Cuando un cajero suspende la laptop al cerrar la tapa o Windows aplica
update durante la noche, al volver a abrir el POS la PWA puede quedar
en estado inconsistente:

- JWT vencido pero la UI no lo sabe
- IndexedDB con datos viejos o corruptos
- Caché del Service Worker apuntando a versiones obsoletas
- Carrito local desincronizado del servidor
- Cola offline acumulada sin procesar
- Conexión SSE rota silenciosamente

`volvix-recovery-wiring.js` detecta estos escenarios y orquesta la
recuperación automática con feedback visible al usuario.

---

## 2. Detectores activos

| Detector | Frecuencia | Trigger |
|---|---|---|
| Heartbeat suspensión | cada 30 s | gap > 5 min entre heartbeats |
| Visibility change | event-driven | tab vuelve a foreground |
| Boot timestamp | al cargar | `performance.timeOrigin` salta > 1 h |
| Chrome version mismatch | al cargar | UA Chrome version cambió |
| Online event | event-driven | navegador recupera conexión |

Storage keys (localStorage):

- `volvix_recovery_heartbeat` — timestamp del último heartbeat
- `volvix_recovery_boot_ts` — timestamp del último boot del contexto
- `volvix_recovery_last_chrome_version` — versión de Chrome anterior
- `volvix_recovery_cart_backup` — backup del carrito por si IDB cae
- `volvix_recovery_session_backup` — backup mínimo de sesión
- `volvix_recovery_needs_login` — flag set si JWT expiró durante recovery

---

## 3. Flujo `fullRecovery()`

Se ejecuta automáticamente al detectar resume. 6 pasos en serie con
panel de progreso visible (esquina inferior izquierda):

| # | Paso | Acción | Falla = |
|---|---|---|---|
| 1 | Verificar JWT | `VolvixAuth.heartbeat()` o `GET /api/me` | flag `needs_login` set |
| 2 | Verificar IndexedDB | abrir DB probe, timeout 4 s | dispara `indexedDBRecovery()` |
| 3 | Sincronizar carrito | `VolvixCart.syncFromServer()` | backup local persistido |
| 4 | Refrescar productos | `postMessage('FORCE_REFRESH', {scope:'products'})` al SW | log warn |
| 5 | Procesar cola offline | `postMessage('TRIGGER_SYNC')` al SW | log warn |
| 6 | Reconectar event stream | `VolvixEventStream.reconnect()` | log warn |

**Resultado:**
- `0 errores` → toast verde "Sistema recuperado"
- `1-2 errores` → toast naranja "Recovery parcial"
- `>=3 errores` → toast rojo + ofrece `corruptedCacheRecovery()`

---

## 4. Flujo `corruptedCacheRecovery()`

Confirmación al usuario, luego:

1. Backup carrito a localStorage (key `volvix_recovery_cart_backup`)
2. `caches.delete()` para todas las cachés del SW
3. Mensaje `CLEAR_CACHE` al SW por si controla otros tabs
4. `indexedDB.deleteDatabase()` para todas las DBs `volvix-*`
5. `location.reload()` (hard reload para tomar SW nuevo)

Tras reload, el app inicial debería ofrecer login si `needs_login` está
seteado, o sincronizar todo desde el server.

---

## 5. Flujo `indexedDBRecovery()`

Se ejecuta cuando el probe de IndexedDB falla (`open` da error,
quedó `blocked`, o timeout). Restaura:

- Carrito desde `localStorage.volvix_recovery_cart_backup` o `volvix_cart`
- Sesión desde `localStorage.volvix_recovery_session_backup` o `volvix_session`

Si ninguno existe, deja la sesión vacía y deja que el flujo principal
del app inicie un login.

---

## 6. Listener `FORCE_REFRESH` en sw.js

Agregado al final del bloque `message`. Acepta payload:

```js
sw.postMessage({ type: 'FORCE_REFRESH', payload: { scope: 'products' } });
```

Scopes:
- `'all'` → borra todas las cachés (volvix-*, volvix-api-*, volvix-rt-*)
- `'products'` o `'api'` → solo borra `volvix-api-*` y `volvix-rt-*`

Tras borrar, el SW broadcasts `CACHE_REFRESHED` a todos los clientes:

```js
{ type: 'CACHE_REFRESHED', scope: 'products', cleared: 3 }
```

---

## 7. Pruebas manuales

### 7.1 Simular suspensión

```js
// En DevTools console del POS
localStorage.setItem('volvix_recovery_heartbeat', String(Date.now() - 6 * 60 * 1000));
window.VolvixRecovery.detectResumeFromSuspension();
```

Esperado: panel de recovery aparece con 6 pasos, JWT verifica, etc.

### 7.2 Simular IndexedDB corrupto

```js
indexedDB.deleteDatabase('volvix-cart');
window.VolvixRecovery.indexedDBRecovery();
```

### 7.3 Simular Windows update

```js
localStorage.setItem('volvix_recovery_last_chrome_version', '1.0.0.0');
window.VolvixRecovery.checkWindowsUpdate();
```

### 7.4 Forzar refresh de productos

```js
window.VolvixRecovery._postToSW('FORCE_REFRESH', { scope: 'products' });
```

### 7.5 Recovery total (con confirm)

```js
window.VolvixRecovery.corruptedCacheRecovery();
```

---

## 8. Métricas de éxito

- Tiempo medio de recovery: **< 4 s** (target)
- Tasa de recovery exitoso (0 errores): **> 90 %**
- Falsos positivos de suspensión: **< 1 %**
- Reportes de "se quedó pegado tras tapa cerrada": **0**

---

## 9. Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| Panel de recovery aparece todo el tiempo | tab estuvo bg > 5 min legítimamente | OK, no es bug — es diseño |
| Paso 1 (JWT) siempre falla | `VolvixAuth.heartbeat` no existe o `/api/me` no implementado | Verificar wiring de auth |
| Paso 4 (productos) timeout | SW no controla tab (registró pero no claimed) | Revisar `clients.claim()` en activate |
| Paso 6 (SSE) no reconecta | `VolvixEventStream` no inicializado | Verificar carga de wiring SSE |
| Recovery dispara loop infinito | Heartbeat no se está escribiendo | Revisar quota localStorage |

---

## 10. No tocar

- `api/index.js` — backend, fuera de scope
- `salvadorex_web_v25.html` — otro tenant
- `customer-portal-v2.html` — otra app
- `migrations/`, `scripts/` — DB y operaciones
- `sw.js` aparte del listener `FORCE_REFRESH` agregado

---

## 11. Referencias cruzadas

- R6b — `sw.js` versioning + cache strategy
- R8b — `VolvixCart.syncFromServer()` server-side cart
- R10e-A/B/D/E — agentes paralelos de Nivel 5
