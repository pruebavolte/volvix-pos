# R17 — Telegram Admin Bot

Volvix POS GODMODE 3.4.0 — bot de Telegram para administradores.

## Componentes

| Pieza | Ruta |
|-------|------|
| Webhook + comandos | `api/index.js` (sección R17, antes de MAIN HANDLER) |
| SQL tablas | `db/R17_TELEGRAM.sql` |
| Setup webhook | `scripts/setup-telegram.js` |

## Comandos soportados

- `/start` — devuelve `chat_id` para que un admin lo vincule manualmente en `telegram_admins`.
- `/sales today` — total y conteo de tickets de hoy del tenant del admin.
- `/inventory low` — productos con `stock < 5` (top 20).
- `/alert <mensaje>` — difunde a todos los admins del mismo tenant.
- `/dashboard` — MRR / ARR / subs activas.

Si el `chat_id` no esta vinculado en `telegram_admins`, el bot responde pidiendo vinculacion.

## Endpoint

`POST /api/telegram/webhook` — sin autenticacion (Telegram lo invoca). Si falta `TELEGRAM_BOT_TOKEN` -> `503 service_unavailable`.

## Tablas (R17_TELEGRAM.sql)

- `telegram_admins(chat_id PK, user_id, tenant_id, linked_at)` — RLS solo `service_role`.
- `telegram_alerts(id, type, sent_to_chat, body, ts)` — bitacora de mensajes salientes.

## Variables de entorno

```
TELEGRAM_BOT_TOKEN=123456:ABC...   # token de BotFather
WEBHOOK_URL=https://volvix-pos.vercel.app/api/telegram/webhook  # opcional override
```

## Instrucciones BotFather

1. En Telegram abre @BotFather y ejecuta `/newbot`.
2. Elige nombre publico (`Volvix POS Admin`) y username unico (`volvix_pos_admin_bot`).
3. BotFather devuelve un token con formato `123456789:AA...`. Copialo.
4. En Vercel: Project Settings -> Environment Variables, agrega `TELEGRAM_BOT_TOKEN` = ese token (Production + Preview).
5. Redeploy para que el endpoint deje de devolver 503.
6. Registra el webhook desde tu maquina:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC node scripts/setup-telegram.js
   ```
   Debe responder `{"ok": true, "result": true}`.
7. Ejecuta `db/R17_TELEGRAM.sql` en Supabase (SQL Editor).
8. Inserta el primer admin manualmente:
   ```sql
   INSERT INTO telegram_admins (chat_id, user_id, tenant_id)
   VALUES (123456789, '<uuid_user>', '<uuid_tenant>');
   ```
   Para obtener `chat_id` manda `/start` al bot.
9. Opcional: en BotFather configura comandos con `/setcommands`:
   ```
   start - Vincular este chat
   sales - Ver ventas (sales today)
   inventory - Productos bajo stock (inventory low)
   alert - Enviar alerta a todos los admins
   dashboard - Metricas MRR/ARR
   ```

## Seguridad

- El token nunca esta en el repo (solo `process.env`).
- Las tablas solo aceptan `service_role` (RLS).
- El webhook valida que el `chat_id` este previamente vinculado antes de ejecutar comandos sensibles.
- `/start` solo expone el `chat_id` propio, no datos del tenant.

## Smoke test

```
curl -X POST https://volvix-pos.vercel.app/api/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":1},"text":"/start","from":{"username":"test"}}}'
```
Debe devolver `{"ok": true}`.
