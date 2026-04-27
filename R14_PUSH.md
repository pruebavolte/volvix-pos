# R14 - Web Push Notifications (VAPID)

Implementacion de notificaciones push web nativas (sin Firebase, sin librerias externas).
Toda la criptografia (JWT ES256 VAPID + ECDH P-256 + HKDF + AES-128-GCM RFC 8291)
se hace con el modulo `crypto` de Node estandar.

## Archivos

| Archivo                              | Rol                                            |
| ------------------------------------ | ---------------------------------------------- |
| `db/R14_PUSH_SUBS.sql`               | Tabla `push_subscriptions` + RLS               |
| `api/index.js` (seccion R14 PUSH)    | 4 endpoints + protocolo Web Push completo      |
| `volvix-push-wiring.js`              | Cliente: registra SW, pide permiso, suscribe   |
| `sw.js` (`push` + `notificationclick`)| Service worker muestra notificacion + abre URL |

## Endpoints

| Metodo | Path                          | Auth         | Descripcion                                  |
| ------ | ----------------------------- | ------------ | -------------------------------------------- |
| GET    | `/api/push/vapid-public-key`  | publica      | Devuelve `VAPID_PUBLIC_KEY`                  |
| POST   | `/api/push/subscribe`         | Bearer JWT   | Body: `{subscription:{endpoint,keys:{p256dh,auth}}}` |
| POST   | `/api/push/unsubscribe`       | Bearer JWT   | Body: `{endpoint}`                           |
| POST   | `/api/push/send`              | admin/owner  | Body: `{user_ids?, tenant_id?, title, body, url?}` |

## Generar las claves VAPID

### Opcion A: con `web-push` (recomendado)

```bash
npx web-push generate-vapid-keys --json
```

Salida ejemplo:

```json
{
  "publicKey":  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
  "privateKey": "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls"
}
```

### Opcion B: nativa con Node (sin dependencias)

```bash
node -e "
const c = require('crypto');
const ecdh = c.createECDH('prime256v1');
ecdh.generateKeys();
const pub  = ecdh.getPublicKey();         // 65 bytes (0x04 + X + Y)
const priv = ecdh.getPrivateKey();        // 32 bytes
const b64u = b => b.toString('base64').replace(/=+\$/g,'').replace(/\+/g,'-').replace(/\//g,'_');
console.log('VAPID_PUBLIC_KEY=',  b64u(pub));
console.log('VAPID_PRIVATE_KEY=', b64u(priv));
"
```

### Opcion C: openssl

```bash
openssl ecparam -name prime256v1 -genkey -noout -out vapid_priv.pem
openssl ec -in vapid_priv.pem -pubout -out vapid_pub.pem
# Convertir a base64url raw con un script (priv = 32 bytes raw, pub = punto sin comprimir)
```

## Variables de entorno

Agregar a Vercel / Railway / `.env`:

```
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa...
VAPID_PRIVATE_KEY=UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls
VAPID_SUBJECT=mailto:admin@volvix-pos.app
```

> `VAPID_PUBLIC_KEY` debe ser punto P-256 sin comprimir (65 bytes empezando en `0x04`)
> codificado en base64url. `VAPID_PRIVATE_KEY` debe ser el escalar privado raw de
> 32 bytes en base64url. El backend valida ambos formatos al firmar.

## Migracion de base de datos

```bash
psql "$SUPABASE_DB_URL" -f db/R14_PUSH_SUBS.sql
```

Crea `public.push_subscriptions` con UNIQUE en `endpoint`, RLS owner-only para
INSERT/SELECT/DELETE y SELECT amplio para roles `ADMIN/SUPERADMIN/OWNER`.
El backend usa `SUPABASE_SERVICE_KEY` (bypassea RLS).

## Integracion frontend

Incluir en cualquier pagina autenticada:

```html
<script src="/volvix-push-wiring.js" defer></script>
```

API expuesta en `window.VolvixPush`:

```js
await VolvixPush.subscribe();    // pide permiso + registra SW + persiste sub
await VolvixPush.unsubscribe();  // desregistra y borra del backend
await VolvixPush.status();       // { supported, permission, subscribed, endpoint }
```

Auto-resuscribe silencioso al cargar la pagina si el permiso ya esta concedido
y el usuario tiene `volvix_token`.

## Enviar push (admin)

```bash
curl -X POST https://<host>/api/push/send \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000000",
    "title": "Inventario bajo",
    "body":  "5 productos por debajo del umbral",
    "url":   "/volvix_owner_panel_v7.html#inventory"
  }'
```

Respuesta:

```json
{ "ok": true, "sent": 12, "total": 14, "results": [...] }
```

Las suscripciones que devuelven 404/410 se purgan automaticamente.

## Detalles del protocolo (referencia)

- JWT VAPID: ES256 firmado con la clave privada importada como JWK; header
  `Authorization: vapid t=<jwt>, k=<vapid_public_b64url>`.
- Encriptacion `aes128gcm` (RFC 8291): ECDH efimero P-256, HKDF-SHA256 para
  derivar IKM (`WebPush: info\0 || ua_pub || as_pub`), luego CEK
  (`Content-Encoding: aes128gcm\0`) y nonce (`Content-Encoding: nonce\0`).
- Header binario: `salt(16) || rs(4 BE = 4096) || idlen(1=65) || keyid(localPub 65)`
  seguido del ciphertext + tag GCM.
- TTL fijo en 60s; ajustar si se requiere persistencia mas larga del lado del push service.

## Estado

- SQL listo
- API listo (4 endpoints, VAPID + cifrado nativo, sin dependencias externas)
- Cliente listo
- Service worker actualizado con `push` + `notificationclick`
- Pendiente: generar y configurar `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` en el entorno
