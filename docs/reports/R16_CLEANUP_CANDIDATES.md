# R16 — Cleanup Candidates (NO BORRAR — solo reporte)

Auditoría de archivos no referenciados / backups / zips en la raíz.
Generado: 2026-04-26.

## Confirmados (alta confianza)

| Path | Size | Razón |
|------|------|-------|
| `C:\Users\DELL\Downloads\verion 340\files (2).zip` | 27,523 B (~27 KB) | ZIP descargado de Vercel/GitHub. Sin referencias en código. |
| `C:\Users\DELL\Downloads\verion 340\files (3).zip` | 182,637 B (~178 KB) | ZIP descargado de Vercel/GitHub. Sin referencias en código. |
| `C:\Users\DELL\Downloads\verion 340\MATRIZ_PRUEBAS_LOCAL_v1_backup.html` | 24,765 B (~24 KB) | Backup explícito (`_v1_backup`) de `MATRIZ_PRUEBAS_LOCAL.html` (37 KB). Sin referencias. |

## Probables (revisar antes de borrar)

| Path | Size | Razón |
|------|------|-------|
| `C:\Users\DELL\Downloads\verion 340\volvix-customer-portal.html` | 47,182 B | Existe `volvix-customer-portal-v2.html` (14,978 B) más reciente (15:49 vs 10:53). Ambos referenciados solo en docs/sitemap; v2 parece ser el activo. |
| `C:\Users\DELL\Downloads\verion 340\volvix-onboarding-wizard.html` | 24,031 B | Existe `volvix-onboarding-v2.html` (23,701 B, 12:38) más reciente. Wizard parece superseded. Verificar enlace en login.html antes. |

## Notas

- No se hallaron archivos `.bak`, `.tmp`, `.old`, ni prefijo `OLD_*` en raíz ni `api/`.
- `backups/test-backup.sh` NO es candidato — es un script funcional del sistema de respaldos.
- `volvix-backup-wiring.js` NO es candidato — wiring activo.
- 56 archivos `volvix-vertical-*.js` se conservan: cargados dinámicamente por sistema de verticales.
- Total recuperable confirmado: ~230 KB (3 archivos).

**ACCIÓN REQUERIDA**: Ninguna automática. Esperar aprobación del supervisor para borrar.
