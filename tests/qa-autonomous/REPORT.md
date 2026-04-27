# Reporte QA Autónomo - Volvix POS

**Target:** https://volvix-pos.vercel.app
**Suite:** tests/qa-autonomous/

## Resumen ejecutivo

| Categoría | Total | Pass | Fail |
|-----------|------:|-----:|-----:|
| Auth | _ | _ | _ |
| POS Flow | _ | _ | _ |
| CRUD | _ | _ | _ |
| Caja | _ | _ | _ |
| CFDI | _ | _ | _ |
| Multitenant | _ | _ | _ |
| Security | _ | _ | _ |
| Human/Edge | _ | _ | _ |
| DB Validation | _ | _ | _ |

## 1. Errores críticos (P0)
- [ ] Llenar tras ejecutar `npx playwright test` (incluir spec, screenshot, URL).

## 2. Errores menores (P1)
- [ ] Doble click cobrar genera 2 ventas (phase3_human.spec.js).
- [ ] Mensaje genérico tras login fallido.

## 3. Mejoras UX
- [ ] Toast tras crear/editar.
- [ ] Persistir carrito en localStorage.
- [ ] Indicador de tenant activo en header.
- [ ] Bloqueo PIN tras 3 intentos.

## 4. Mejoras técnicas
- [ ] idempotency-key en POST /api/sales.
- [ ] RLS Supabase con tenant_id.
- [ ] Headers seguridad (CSP, HSTS, X-Frame, nosniff) en vercel.json.
- [ ] Rate-limit en /api/auth/login.
- [ ] Sanitización HTML server-side.
- [ ] Deny rules para /.env, /.git, /server.js, /db/*.

## 5. Oportunidades de negocio
- [ ] Validación RFC vs API SAT.
- [ ] Alerta variance > umbral al owner.
- [ ] BroadcastChannel multi-tab sync.
- [ ] Onboarding guiado para owner.
- [ ] Detector de fraude por patrones de doble-venta.

## Anexos
- Inventario: artifacts/INVENTORY.json
- Screenshots: artifacts/phase1_screens/, artifacts/*.png
- HTML report: artifacts/html-report/index.html
- JSON: artifacts/results.json

## Comandos
```
node phase1_explore.js
npx playwright test
npx playwright show-report artifacts/html-report
```
