# R14 — Realtime (Supabase Realtime)

Implementa eventos en vivo en Volvix POS: ventas que aparecen sin refrescar,
presencia (qué cajeros están online) y broadcast de anuncios entre estaciones
del mismo tenant.

## Archivos

- `public/js/realtime.js` — cliente realtime, expone `window.Volvix.realtime`.
- `db/R14_REALTIME.sql` — añade tablas a `supabase_realtime` y configura
  `REPLICA IDENTITY FULL`.
- `server.js` — endpoint nuevo `GET /api/config/public` que sirve la
  configuración pública (URL + anon key) al frontend.

## Requisito crítico: anon key (NUNCA service key)

El cliente de navegador **solo** debe usar la `SUPABASE_ANON_KEY`.
La `SUPABASE_SERVICE_ROLE_KEY` jamás se envía al cliente (puede leer y
escribir cualquier tabla saltándose RLS).

Variables de entorno relevantes (en el host — Vercel / `.env` local):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...role:anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...role:service_role...   # solo server-side
```

El endpoint `GET /api/config/public` retorna **únicamente**:

```json
{
  "supabase_url": "https://xxxx.supabase.co",
  "supabase_anon_key": "eyJ...anon..."
}
```

`realtime.js` además valida en cliente que el JWT recibido tenga
`role === "anon"` y se rehúsa a inicializar si llega cualquier otra cosa.

## Setup

1. Aplicar SQL:
   ```bash
   # En el SQL editor de Supabase, pegar y ejecutar:
   db/R14_REALTIME.sql
   ```
2. Asegurar `SUPABASE_ANON_KEY` en variables de entorno del servidor.
3. Reiniciar el servidor (`node server.js`) — `/api/config/public` queda activo.
4. En cualquier página, importar como módulo:
   ```html
   <script type="module" src="/js/realtime.js"></script>
   ```

## API (`window.Volvix.realtime`)

### `subscribeSales(tenantId, cb)`
Escucha INSERT en `volvix_ventas` filtrado por `tenant_id`. Muestra un toast
con el total y llama `cb({event, new, old})`.

```js
const sub = await Volvix.realtime.subscribeSales(tenantId, (p) => {
  console.log('Nueva venta', p.new);
});
// más tarde:
sub.unsubscribe();
```

### `subscribePresence(tenantId, onChange?)`
Trackea automáticamente al usuario actual (lee `localStorage.volvix_session`)
y reporta el estado completo de presencia. Muestra toasts cuando otros
cajeros entran/salen.

```js
const pres = await Volvix.realtime.subscribePresence(tenantId, (state) => {
  // state: [{user_id, email, role, since}, ...]
  renderCajerosOnline(state);
});
```

### `broadcastNotification(tenantId, payload)`
Envía un anuncio a todos los clientes suscritos al tenant.

```js
await Volvix.realtime.broadcastNotification(tenantId, {
  title: 'Cierre de caja',
  body: 'Cerrar terminales en 10 min',
  kind: 'warn'  // info | success | warn | error
});
```

Para recibirlos, suscribirse:
```js
await Volvix.realtime.subscribeBroadcast(tenantId);
// (ya muestra toast automáticamente; pasa cb para lógica extra)
```

## Seguridad

- RLS sigue siendo la capa de autorización principal. Realtime respeta RLS
  para `postgres_changes` cuando se usa la anon key, así que los clientes
  solo reciben filas que su política permite leer.
- Los canales presence y broadcast NO consultan tablas, pero sí están
  scopeados por `tenant_id` en el nombre del canal (`presence:<id>`,
  `broadcast:<id>`). Para reforzar, configurar Realtime Authorization en
  Supabase (channel-level RLS) si se requiere bloquear que un tenant
  espíe el canal de otro.
- Nunca commitear la service key. Solo anon va al cliente.

## Verificación

1. Abrir dos tabs de `/pos.html` autenticadas como cajeros del mismo tenant.
2. Hacer una venta en el tab A → debe salir toast verde "Nueva venta $..."
   en el tab B.
3. Tab B se abre/cierra → tab A muestra "X entró" / "X salió".
4. En consola del tab A:
   `Volvix.realtime.broadcastNotification(tenantId, {title:'Hola', body:'test'})`
   → tab B debe mostrar el toast.
