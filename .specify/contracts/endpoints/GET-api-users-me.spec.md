# Contrato: `GET /api/users/me`

> Tier 1 — COMPARTIDO (POS + PDC)

## Identidad
- Ruta: `/api/users/me`
- Método(s): GET
- Auth requerido: ✅ JWT
- Rol mínimo: cualquier rol autenticado (sin restricción de rol específico)

## Request
- Headers: `Authorization: Bearer <jwt>`
- Body: N/A
- Query params: ninguno

## Response
- 200:
  ```json
  {
    "ok": true,
    "user": {
      "id": "uuid",
      "email": "cajero@negocio.com",
      "role": "cajero",
      "tenant_id": "TNT-XXXXX",
      "name": "...",
      "..." 
    }
  }
  ```
  (El shape exacto de `user` es el contenido del `req.user` del JWT decodificado — depende de los campos incluidos al emitir el token en `/api/login`)
- 401: token ausente/inválido

## Tablas Supabase que toca
| Tabla | Op | Cuándo |
|-------|----|--------|
| ninguna | — | el handler solo devuelve `req.user` (datos del JWT, sin query DB) |

## Consumidores
- **POS** (`salvadorex-pos.html` línea 2655): `refreshUserFromServer()` — llamado periódicamente para re-hidratar `volvix_user` en `localStorage`. Usado para detectar cambios de rol o estado del usuario sin re-login.
- **PDC** (`paneldecontrol.html` línea 2571): misma función `refreshUserFromServer()` — mismo patrón. Al iniciar el panel verifica identidad actual.

## Acoplamiento detectado
✓ Ambos usan el mismo patrón: `GET /api/users/me` → guarda en `localStorage['volvix_user']`. Compatible y simétrico.

⚠️ La respuesta es exactamente el contenido del JWT (sin query DB) — si el JWT fue emitido con datos stale (ej. rol cambiado por superadmin), `users/me` devuelve datos desactualizados hasta que el token expire o el usuario haga re-login. No refleja cambios en tiempo real.

## Deudas
- El handler es de 1 línea: `sendJSON(res, { ok: true, user: req.user })`. No valida que `req.user` tenga los campos esperados — si el JWT decodificado falla parcialmente, puede devolver `user: undefined` con `ok: true`.
- No hay query a DB para validar que el usuario siga activo/no-bloqueado. Un usuario desactivado en `pos_usuarios` puede seguir usando tokens válidos hasta que expiren.
- El `user` object incluye potencialmente campos sensibles del JWT (depende de qué se pone al firmar). No hay proyección/sanitización antes de enviar.
- `volvix_usuarios` (CLAUDE.md) vs tabla real usada en login — verificar que los campos del JWT token matcheen el shape que los frontends esperan en `volvix_user`.
