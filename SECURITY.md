# Security Policy

## Versiones soportadas

| Version | Soporte |
|---------|---------|
| 7.3.x (R24) | si |
| 7.2.x (R23) | si (criticos) |
| 7.1.x (R21-R22) | parches criticos |
| <= 7.0.x | no |

## Reportar una vulnerabilidad

**No abras un issue publico.** Reporta privado a:

- Email: security@volvix.app
- PGP: bajo demanda

Incluye: descripcion, pasos repro, impacto, version (`/api/health`), PoC si tienes.

Respondemos en **48h habiles**. Disclosure coordinado: 90 dias o cuando hay parche, lo que ocurra primero.

## Scope

En scope:
- Autenticacion y autorizacion (JWT, roles, MFA).
- Aislamiento multi-tenant.
- Endpoints `/api/*` (250+ rutas).
- Sync engine offline / reconciliacion.
- Webhooks (Stripe, Shopify, QR, MercadoLibre).
- Manejo de secretos en server.js y api/*.

Fuera de scope:
- DoS volumetrico.
- Rate limiting de paneles publicos demo.
- Self-XSS.

## Practicas

- **Secretos**: solo en env vars. Nunca commitear `.env`. Ver `.env.example`.
- **Headers**: CSP + HSTS + X-Frame en R24 — `R24_SECURITY_HEADERS.md`.
- **HMAC**: webhooks verifican firma — `R16_WEBHOOK_VERIFY_EXAMPLES.md`.
- **JWT**: `JWT_SECRET` rotado por release. Tokens de 60min, refresh 30 dias.
- **Multi-tenant**: cada handler valida `tenant_id` del JWT vs recurso.
- **Seed users**: `SEED_USERS_JSON` solo dev. En prod los users viven en Supabase.
- **CORS**: `ALLOWED_ORIGINS` whitelist en prod.
- **Scan**: `node volvix-security-scan.js` corre en CI.

## Auditoria

Reportes publicos: `R13_SECURITY_AUDIT.md`, `R22_SECURITY_FIXES.md`, `R24_SECURITY_HEADERS.md`.

## Hall of Fame

Investigadores que reportaron responsablemente — bajo demanda, con permiso.
