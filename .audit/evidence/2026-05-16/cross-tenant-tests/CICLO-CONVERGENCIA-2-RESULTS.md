# Cross-tenant tests — EJECUTADAS exitosamente 2026-05-16

## Setup
- T_A creado: tenant_id=TEST-a1778947594894-7a9ffc89, giro=abarrotes
- T_B creado: tenant_id=TEST-b1778947594894-e3cdb45b, giro=cafe
- Tokens JWT generados por endpoint admin/test-tenant/create (firmados con JWT_SECRET de Vercel prod)

## Ciclo 1 — Resultados (con bug)
| Test | Resultado | Status |
|------|-----------|--------|
| 1. T_A lee sus productos | products=[] tenant_not_provisioned | OK 200 |
| 2. T_B (rol owner) accede a /api/admin/tenants | "platform_admin_required" | OK 403 |
| 3. T_A llama /api/sales | **100 ventas de TNT001** | **BLOQUEANTE!** |
| 4. T_A llama /api/app/config | tenant aún no provisionado | OK 400 |
| 5. T_A llama /api/tax-config | defaults 16% post-discount | OK 200 |
| 6. T_B llama /api/tax-config | defaults 16% post-discount | OK 200 |
| 7. T_A intenta POST /api/admin/tenant/:B/suspend | forbidden | OK 403 |

## Fuga detectada
- salesA_count: 100 | salesB_count: 100 | overlap_ids_count: 100
- LEAK_DETECTED: true
- tenant_ids_seen_by_A: ["TNT001"]
- tenant_ids_seen_by_B: ["TNT001"]
- Causa raíz: resolvePosUserId() devuelve UUID placeholder para JWTs con user_id no-UUID

## Fix aplicado (commit d657cb2)
- Handler GET /api/sales (linea 2545) ahora agrega filtro defensivo
  &tenant_id=eq.<X> si tenantId está en JWT y role no es superadmin/platform_owner

## Ciclo 2 — Re-verificación
| Métrica | Antes fix | Después fix |
|---------|-----------|-------------|
| salesA_count | 100 (todas de TNT001) | 0 (correcto, test tenant sin ventas) |
| salesB_count | 100 (todas de TNT001) | 0 |
| overlap_ids_count | 100 | 0 |
| LEAK_STILL_DETECTED | true | **false** |

## Cleanup completado
- T_A v2 eliminado: status 200, ok=true
- T_B v2 eliminado: status 200, ok=true
- T_A original eliminado: status 200, ok=true (parcial — pos_customers/pos_users/pos_tenants reportan errores esperados)
- T_B original eliminado: status 200, ok=true (idem)

## Flag revertido
- ALLOW_TEST_TENANTS=false aplicado en Vercel
