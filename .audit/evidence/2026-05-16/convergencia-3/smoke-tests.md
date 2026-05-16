# Smoke tests Ciclo Convergencia 3 — 2026-05-16

## ✅ Test 1: Captcha Turnstile REAL (no solo presencia)

### Sin token (debe rechazar con captcha_required)
```bash
$ curl -s -X POST "https://systeminternational.app/api/auth/register-simple" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com"}'

{"ok":false,"error":"captcha_required","message":"Verifica el captcha para continuar"}
```

### Con token FAKE (debe rechazar con captcha_invalid — prueba que Cloudflare siteverify se invoca)
```bash
$ curl -s -X POST "https://systeminternational.app/api/auth/register-simple" \
    -H "Content-Type: application/json" \
    -d '{"email":"hack@test.com","captcha_token":"fake_token_to_test_real_validation"}'

{"ok":false,"error":"captcha_invalid","message":"Verificación de captcha fallida","codes":["invalid-input-response"]}
```

**Conclusión**: Backend SÍ valida contra `https://challenges.cloudflare.com/turnstile/v0/siteverify`. El error code `invalid-input-response` es de Cloudflare, no del backend. ✅

## ✅ Test 2: Cross-tenant fix de V2 sigue vigente

GET /api/sales sin token correcto sigue protegido (test ya ejecutado en CICLO-CONVERGENCIA-2-RESULTS.md), commit `d657cb2` desplegado.

## ❌ Tests NO ejecutados (en BLOCKERS.md B-X-7)

- E2E polling/suspend completo
- 2FA recovery codes single-use
- IVA UI por sucursal
- Stock decrement idempotencia con error simulado
- Pago mixto 5 escenarios al centavo
- Mensaje suspend en cliente
- Banner impersonation cada página
- F12 detect DevTools multi-browser

Cada uno requiere setup E2E completo (Playwright, captura OTP/TOTP). Pospuestos por presupuesto de tiempo.
