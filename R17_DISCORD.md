# R17 - Discord Notifications

## Resumen
Integracion de Discord Webhooks por tenant para notificar eventos clave del POS.

## Archivos
- `api/index.js` - bloque "R17 - DISCORD WEBHOOKS" con helpers + rutas REST
- `db/R17_DISCORD.sql` - tabla `discord_webhooks` con RLS por tenant
- `volvix-discord-config.js` - UI cliente para owners/admins

## Endpoints (admin: owner/admin/superadmin)
| Metodo | Ruta | Proposito |
|---|---|---|
| GET    | `/api/discord/webhooks` | Lista webhooks del tenant (URL enmascarada) |
| POST   | `/api/discord/webhooks` | Crea webhook `{name, url, events[], active}` |
| PATCH  | `/api/discord/webhooks/:id` | Actualiza |
| DELETE | `/api/discord/webhooks/:id` | Elimina |
| POST   | `/api/discord/webhooks/:id/test` | Envia embed de prueba |
| POST   | `/api/discord/notify` | Envio directo `{webhook_url, content?, embeds[]?}` |

## Eventos
| Evento | Disparador | Color |
|---|---|---|
| `sale.created`   | venta total > $1000 | verde 0x2ecc71 |
| `low_stock`      | stock <= min_stock | amarillo 0xf1c40f |
| `new_user`       | alta de usuario | azul 0x3498db |
| `error_critical` | excepcion fatal | rojo 0xe74c3c |

## Helper `sendDiscordEmbed(url, opts)`
Devuelve `Promise<{ok, status?, error?}>`. Valida URL contra `discord.com/api/webhooks/`,
arma embed con titulo, descripcion, color, fields[], footer, timestamp, y POSTea con
timeout 5s y `User-Agent: Volvix-Discord/1.0`. Expuesto como `global.sendDiscordEmbed`.

## Dispatcher `dispatchDiscord(tenantId, event, payload)`
- Filtra eventos no soportados.
- Para `sale.created` exige `total > 1000`.
- Carga `discord_webhooks` activos del tenant que incluyan el evento.
- Genera embed segun `_embedForEvent` y dispara en paralelo.

## Schema
```
discord_webhooks(id uuid pk, tenant_id text, name text, url text CHECK discord.com,
                 events text[], active bool, created_at, updated_at)
```
Indices: tenant, (tenant,active), gin(events). RLS por `tenant_id` JWT, override owner/superadmin.

## Cliente
`DiscordConfigUI.mount('#discord-config')` renderiza form de alta + lista con acciones
Test/Activar/Eliminar. Valida URL Discord en cliente antes de POST.

## Deploy
1. Aplicar SQL: `R17_DISCORD.sql` en Supabase.
2. Redeploy `api/index.js` en Vercel (rutas se registran al boot).
3. Servir `volvix-discord-config.js` como asset estatico.
4. Enganchar `dispatchDiscord(tenantId, 'sale.created', saleRow)` junto al
   `dispatchWebhook` existente en el handler de POST `/api/sales` (mismo punto).

## Estado
- Codigo insertado: api/index.js
- SQL listo: db/R17_DISCORD.sql
- UI lista: volvix-discord-config.js
- Wiring de dispatchDiscord en eventos: pendiente (anadir junto a dispatchWebhook)
