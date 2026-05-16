# SalvadoreX POS — Resumen Ejecutivo

> URL en vivo: https://systeminternational.app/
> Último commit en producción: `8b1a12d` (Cloudflare Turnstile habilitado)
> Fecha del resumen: 2026-05-16

## Qué hace el sistema

- Punto de venta multi-tenant para comercios mexicanos (POS web + PWA + APK)
- Marketplace de giros con auto-bootstrap de catálogo, registro con OTP y captcha
- Panel super-admin para gestionar tenants, módulos, suspensiones, 2FA, impersonation

## Qué tan seguro es ahora

- Aislamiento cross-tenant verificado en endpoint principal de ventas (commit `d657cb2`: filtro defensivo `&tenant_id=eq.X` añadido tras detectar fuga real entre tenants test)
- Captcha real activo contra Cloudflare siteverify (tokens falsos rechazados con `invalid-input-response`; sin token rechazados con `captcha_required`)
- 2FA con recovery codes en panel admin (TOTP otpauth, AES-256-CBC con IV aleatorio, recovery codes salted)

## Métricas del proceso de QA

- 15+ commits documentados en los tres ciclos de convergencia
- Fuga cross-tenant en `/api/sales` detectada y reparada antes del lanzamiento público
- 3 migraciones SQL aplicadas en Supabase (R32 tax config, R33 enforcement cross-tenant, R34 panel hardening con vista adaptada a esquema legacy)
- 4 de 5 ADRs ejecutados (ADR-001 state unification, ADR-002 polling app config, ADR-003 tabs unification, ADR-005 logout server)
- 8 Bloqueantes confirmados cerrados, 5 Críticos confirmados cerrados, 4 falsos positivos descartados

## Lo que NO tiene todavía

- Load testing con N>1000 usuarios concurrentes no se ha ejecutado
- Auditoría de penetración externa pendiente (no se ha contratado pentester independiente)
- Compliance SAT certificado por contador queda como siguiente paso (la lógica fiscal IVA 16% post-discount está implementada, pero no validada por experto en CFDI 4.0)
- ADR-004 (DROP de tablas legacy) deferida — el código aún tiene 12 referencias a `customers/products/sales` legacy que necesitan refactor previo (decisión documentada en `BLOCKERS.md` B-X-6)
- E2E completo en multi-browser (Chrome/Firefox/Safari/Edge) no automatizado en este ciclo — smoke tests por curl ejecutados

## Veredicto técnico

**PRODUCTION-READY con monitoreo** — vendible a clientes piloto. No recomendado para escala masiva sin completar load testing y pentesting externo.

Score POS: 89/100 · Score Panel: 86/100 (ambos sin movimiento medible en ciclo 3, ver `DECISIONS.md` D-C3-5).
