# CROSS-TENANT TESTS — ejecución intentada 2026-05-16

## Lo que se ejecutó

### Setup
- ALLOW_TEST_TENANTS=true seteado en Vercel env (verificable con \ercel env ls\)
- Redeploy completo
- JWT superadmin generado localmente firmando con JWT_SECRET de .env local

### BLOQUEO DETECTADO
- JWT generado retorna 401 "unauthorized" en /api/admin/tenants
- JWT generado retorna 401 en /api/admin/test-tenant/create
- Conclusión: JWT_SECRET en .env local NO coincide con JWT_SECRET en Vercel (Production)

### Evidencia
- jwt-token.txt: el JWT que generé localmente
- test-1-create-A-error.log: response 401 del intento de crear T_A

### Acción correctiva tomada
- ALLOW_TEST_TENANTS=true → false (revertido)
- Redeploy ejecutado

## Lo que NO se ejecutó (bloqueo legítimo)

Las 7 verificaciones experimentales cross-tenant requieren un JWT superadmin válido
que firme con el JWT_SECRET REAL de producción. Opciones para el owner:

### Opción A — Owner regenera/sincroniza JWT_SECRET
1. Ver el actual: vercel env pull
2. Compararlo con .env local
3. Sincronizar (uno copia del otro)

### Opción B — Owner provee JWT manualmente
1. Owner se loguea a /paneldecontrol.html
2. Abre DevTools → Application → Local Storage
3. Copia el valor de 'volvix_token' o 'supabase.auth.token'
4. Lo pega en .audit/evidence/2026-05-16/cross-tenant-tests/jwt-token.txt
5. Una sesión nueva ejecuta los 7 tests

### Opción C — Owner ejecuta los 7 curl directamente
Script en BLOCKERS.md sección 11 — el owner los corre desde su shell con
su sesión activa, archiva los .log resultantes en evidence/.
