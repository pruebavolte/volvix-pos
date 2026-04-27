# R14 — MFA (TOTP + Backup Codes)

## Resumen
Autenticación de dos factores nativa (sin libs externas) con TOTP RFC 6238 (HMAC-SHA1, 6 dígitos, periodo 30s) y 8 códigos de respaldo de un solo uso.

## Archivos entregados
- `db/R14_MFA.sql` — extensión de `pos_users` y tabla `mfa_attempts`.
- `api/index.js` — helpers TOTP + 4 endpoints + modificación a `/api/login`.
- `volvix-mfa-wiring.js` — cliente con wizard de setup, challenge y disable.

## Cambios SQL (`db/R14_MFA.sql`)
```sql
ALTER TABLE pos_users
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret  text,
  ADD COLUMN IF NOT EXISTS mfa_backup_codes text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS mfa_attempts (
  id      bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES pos_users(id) ON DELETE CASCADE,
  ts      timestamptz NOT NULL DEFAULT now(),
  ip      text,
  success boolean NOT NULL DEFAULT false
);
```
Backup codes se almacenan **hasheados** (SHA-256) en `mfa_backup_codes`. El secret TOTP se guarda en base32 plano (igual que cualquier app TOTP).

## Helper TOTP nativo
- `crypto.createHmac('sha1', secretBuf)` sobre el counter big-endian de 8 bytes.
- Truncamiento dinámico RFC 4226 → mod 1e6 → 6 dígitos zero-padded.
- `verifyTOTP(secret, code, window=1)` tolera ±30 s para skew de reloj.
- `generateMfaSecret()` → 32 bytes random codificados en base32 (~52 chars).
- `buildOtpauthUrl(label, secret, 'Volvix')` → `otpauth://totp/Volvix:user@x?secret=...&algorithm=SHA1&digits=6&period=30` (compatible Google Authenticator).

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/mfa/setup` | Bearer | Genera secret + 8 backup codes. Aún NO activa MFA. Devuelve `secret`, `otpauth_url`, `backup_codes` (texto plano, una sola vez). |
| POST | `/api/mfa/verify` | Bearer | Body `{code}`. Valida primer TOTP → activa MFA (`mfa_enabled=true`). Rate-limit 10/15min por user. |
| POST | `/api/mfa/challenge` | público | Body `{mfa_token, code}`. Acepta TOTP de 6 dígitos o backup code (10 hex con guion). Si valida, emite session JWT igual que `/api/login`. Backup code consumido se elimina del array. |
| POST | `/api/mfa/disable` | Bearer | Body `{password}`. Verifica password actual y limpia `mfa_secret`/`mfa_backup_codes`/`mfa_enabled`. |

## Modificación a `/api/login`
Si `user.mfa_enabled === true`, en lugar de retornar `{token, session}` retorna:
```json
{ "ok": true, "requires_mfa": true, "mfa_token": "<jwt 5min>", "expires_in": 300 }
```
El cliente debe llamar a `/api/mfa/challenge` con ese token + código. El `mfa_token` es un JWT firmado con `JWT_SECRET` con `purpose:"mfa"` y `exp` a 5 min, validado por `verifyMfaToken()`.

## Rate limiting / auditoría
- Login conserva 5/15min por IP existente.
- `/api/mfa/verify`: 10/15min por user.
- `/api/mfa/challenge`: 10/15min por IP.
- Cada intento (éxito o fallo) inserta en `mfa_attempts` para auditoría.

## Cliente (`volvix-mfa-wiring.js`)
```js
// Setup (usuario autenticado)
VolvixMFA.setupWizard(document.getElementById('mfa-setup-mount'));

// Login con MFA
const r = await fetch('/api/login', {...}).then(r => r.json());
await VolvixMFA.handleLoginResponse(r, document.getElementById('mfa-challenge-mount'));

// Desactivar
await VolvixMFA.disable(passwordActual);
```
El wizard pinta el `otpauth_url` como link clicable (deep-link funciona en móvil; en desktop puedes pegar el secret manualmente). No se requiere lib QR — si quieres QR visual, basta con `<canvas>` + cualquier lib QR sobre `data.otpauth_url`.

## Seguridad
- Backup codes: hash SHA-256, single-use (se elimina del array al usarse).
- TOTP `timingSafeEqual` para comparar dígitos.
- `mfa_token` con `purpose` distinto al de session: `verifyMfaToken` rechaza tokens de session, y `requireAuth` rechaza tokens MFA (no tienen `id`/`email`).
- `mfa_enabled` resistente a downgrade: solo `/api/mfa/disable` lo apaga, y exige password.

## Pendientes opcionales
- SMS backup real: requiere proveedor (Twilio). Actualmente el "backup" son los 8 códigos pre-generados, equivalente funcional sin dependencias externas. Para SMS real, agregar columna `mfa_phone` y endpoint `/api/mfa/sms/send` + `/api/mfa/sms/verify` con códigos de 6 dígitos firmados con TTL 5 min.
- Reset administrativo: endpoint `POST /api/admin/users/:id/mfa/reset` (rol admin) que limpia el secret.
