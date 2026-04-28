# Volvix System Monitor — Runbook

**Componente:** `volvix-system-monitor.js` (R10d-C / FIX-N4-6)
**Alcance:** Monitor cliente-side de salud del dispositivo del usuario.
**No es:** monitor de servidor (eso es `/api/health/full` + `status-page.html`).

---

## ¿Qué hace?

Detecta cinco problemas de Nivel 4 (sistema operativo / dispositivo) que rompen
la operación del POS sin que la app lo sepa:

| Check | Detecta | API usada |
|---|---|---|
| `storage` | Disco / cuota local llena | `navigator.storage.estimate()` |
| `indexeddb` | IndexedDB no funciona (incógnito, corrupto) | `indexedDB.open()` |
| `antivirus` | Antivirus/firewall bloqueando recursos | `fetch('/sw.js', HEAD)` |
| `visibility` | Tablet/laptop volvió tras suspensión >5 min | `visibilitychange` |
| `clock` | Reloj local desincronizado >5 min vs servidor | `fetch('/api/health')` Date header |

Frecuencia: una corrida al cargar + cada hora. Resultados en `window.VolvixSysMon.checks`.

---

## Carga del script

Incluir en `<head>` de cualquier HTML público:

```html
<script src="/volvix-system-monitor.js" defer></script>
```

Auto-arranca en `DOMContentLoaded`. No requiere init manual.

Para forzar una corrida:

```js
await window.VolvixSysMon.runAll();
console.table(window.VolvixSysMon.checks);
```

---

## Alertas (banners) y resolución

Cada alert genera un banner naranja sticky en el top de la página. Tipos:

### `storage_low`
**Mensaje:** `Disco XX% lleno. Libera espacio para evitar fallos al guardar.`
**Causa:** `navigator.storage.estimate()` reporta `usage/quota > 85%`.
**Resolución:**
1. Abrir DevTools → Application → Storage → Clear site data (no auth-related).
2. Limpiar cache del navegador (no localStorage).
3. Si persiste: el SO tiene disco lleno → liberar archivos del dispositivo.

### `indexeddb_fail`
**Mensaje:** `IndexedDB no funciona. Modo offline puede fallar. Revisa modo privado/incógnito.`
**Causa:** `indexedDB.open()` falla (modo privado, perfil corrupto, política empresarial).
**Resolución:**
1. Salir de modo incógnito/privado.
2. Verificar perfil del navegador: settings → privacy → cookies & site data permitido.
3. En empresa: revisar GPO bloqueando IndexedDB.

### `antivirus_block`
**Mensaje:** `Antivirus o firewall puede estar bloqueando recursos. Revisa configuración o whitelist este dominio.`
**Causa:** `/sw.js` no responde 200. Antivirus (Kaspersky, Bitdefender, ESET)
suele bloquear service workers.
**Resolución:**
1. Whitelist el dominio en antivirus.
2. Desactivar protección de tráfico HTTPS temporalmente para verificar.
3. Si es firewall corporativo: pedir whitelist a IT.

### `resumed`
**Mensaje:** `Sistema reanudado tras XX min en pausa. Verifica tu sesión.`
**Causa:** Tablet/laptop suspendida >5 min. Sesión puede haber expirado.
**Resolución:**
1. Si hay heartbeat (`window.__volvixHeartbeat`), se dispara automático.
2. Si banner persiste → recargar página para revalidar sesión.

### `clock_drift`
**Mensaje:** `Reloj del dispositivo difiere XX min del servidor. Sincroniza tu hora para evitar errores de auth.`
**Causa:** Reloj local difiere >5 min del servidor (según header `Date`).
**Impacto:** JWT validation puede fallar (tokens "del futuro" o "expirados").
**Resolución:**
1. Windows: Configuración → Hora e idioma → "Sincronizar ahora".
2. macOS: System Settings → General → Date & Time → Set automatically.
3. Android/iOS: Settings → Date & time → Automatic.

---

## Integración con status-page.html

`status-page.html` escucha el evento `volvix-sysmon-update` y renderiza una
sección "Tu dispositivo" con cada check en verde/amarillo/rojo.

Si el usuario reporta "no me carga el POS", pedirle abrir `/status-page.html`
y revisar esa sección antes de escalar a soporte.

---

## Debug rápido (consola del navegador)

```js
// Ver últimos checks
window.VolvixSysMon.checks

// Forzar nueva corrida
await window.VolvixSysMon.runAll()

// Probar un alert manualmente
window.VolvixSysMon.alert('test', 'Mensaje de prueba')

// Limpiar todos los banners
Object.keys(window.VolvixSysMon._activeBanners).forEach(t => window.VolvixSysMon.dismiss(t))
```

---

## Limitaciones conocidas

- `navigator.storage.estimate()` no está en Safari iOS <13.4 → check reporta `unavailable`.
- IndexedDB en modo incógnito: algunos browsers lo permiten con quota muy baja → falsa
  alarma posible. Mitigado: solo alertamos si `open()` realmente falla.
- Clock drift requiere `/api/health` accesible. Si está caído, no alertamos drift
  (el dueño/ops ya verá `status-page.html` en rojo).
- Antivirus check usa `/sw.js`. Si el sitio aún no tiene service worker desplegado,
  reporta falso positivo → desactivar el check temporalmente.

---

## Owners

- Code: `volvix-system-monitor.js`
- CSS: `volvix-shared.css` (sección `.volvix-sysmon-banner`)
- Status integration: `status-page.html` sección "Tu dispositivo"
- Generado por: agente R10d-C, ciclo Nivel 4 / FIX-N4-6 + FIX-N4-7
