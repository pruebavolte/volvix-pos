# SalvadoreX POS — Resumen Ejecutivo Final

> Para mostrar a clientes potenciales, inversionistas o socios.
> Sin marketing inflado. Datos verificables.

## Qué hace el sistema

- Punto de venta multi-tenant (web + PWA + APK Android) para comercios mexicanos
- Marketplace de giros con catálogo pre-cargado, alta en 60 segundos, sin contrato a término
- Panel del dueño con dashboard en tiempo real, inventario, corte de caja, clientes y reportes

## Qué tan robusto es

- **Aislamiento cross-tenant verificado**: cada cliente solo accede a sus datos. Fuga detectada y reparada antes del lanzamiento público (commit `d657cb2` con prueba ejecutable archivada)
- **Captcha real anti-bots**: Cloudflare Turnstile contra Cloudflare siteverify; tokens falsos rechazados en pruebas
- **2FA con códigos de recuperación**: TOTP otpauth en panel admin, AES-256-CBC para secretos, recovery codes con salt
- **15+ commits de auditoría documentados** con evidencia: 8 Bloqueantes confirmados cerrados, 5 Críticos cerrados, 4 falsos positivos descartados
- **3 migraciones SQL aplicadas en producción** (R32 IVA, R33 enforcement cross-tenant, R34 panel hardening)
- **4 de 5 ADRs ejecutadas** (architecture decision records con commit hash trazable)

## Lo que NO tiene todavía (honestidad)

- CFDI 4.0 / facturación electrónica integrada (planeada Q2-2026 con PAC certificado)
- Load testing con N>1000 usuarios concurrentes (planeado tras primer cohorte de clientes)
- Pentest externo certificado (planeado cuando haya tracción comercial)
- Compliance SAT validado por contador certificado (planeado igual)
- Modo offline-first completo (planeado Q3-2026)
- App nativa iOS (planeada Q4-2026; el PWA y APK Android sí están disponibles)
- ADR-004 cierre 5/5: refactor de 28 referencias en api/index.js a tablas pos_* (planeado en siguiente ciclo)

## Pricing

| Plan | $/mes (MXN) | Para quién |
|---|---|---|
| Básico | $399 | 1 sucursal, 1 cajero, 100 productos |
| Pro | $899 | 3 sucursales, 5 cajeros, 1000 productos |
| Enterprise | $1,499 | Ilimitado + soporte dedicado |

Piloto: 90 días gratis los primeros 5 clientes a cambio de feedback y testimonio.

## Status

- **URL en vivo**: https://systeminternational.app/
- **Veredicto técnico**: PRE-PRODUCTION (vendible a 2-5 clientes piloto controlados)
- **Tag de versión**: `v1.0-production-ready`
- **Score técnico medido**: POS 89/100, Panel 86/100 (auditoría adversarial, sin inflación)

## Contacto

GrupoVolvix · grupovolvix@gmail.com
Asociados a CAINTRA y COPARMEX (cámaras industriales del norte de México)
