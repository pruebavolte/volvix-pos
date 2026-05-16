# AGENTE 4 + 12 — UI Seguridad + Dashboard real

Cambios:
- paneldecontrol.html: tab "Seguridad" con 2FA UI + IP allowlist UI + Sesiones activas
- salvadorex-pos.html: KPIs Dashboard ahora dinamicos (no hardcoded \,820/18/\,145/\)
- api/index.js: GET /api/dashboard/summary?range=hoy|semana|mes
- registro.html: captcha_token incluido si existe widget Turnstile

Pendientes documentados en BLOCKERS.md:
- Lib TOTP (otpauth) para 2FA real (endpoints 2FA retornan 501 STUB)
- Cloudflare Turnstile keys para captcha real (flag CAPTCHA_ENABLED=false default)
- Email transaccional (Resend/SendGrid) para notificar impersonation
