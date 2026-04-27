# R13 · Reporte de limpieza de secrets en texto plano

**Fecha:** 2026-04-26
**Carpeta:** `C:\Users\DELL\Downloads\verion 340\`
**Alcance:** Eliminar credenciales hardcoded de los archivos auditados en R13.

---

## 1. Archivos modificados

### 1.1 `server.js`

**Líneas cambiadas:** 49 (insertadas) + 103-107 (reemplazadas)

**Antes (líneas 103-107 originales):**
```js
users: [
  { id: 'USR001', email: 'admin@volvix.test', password: 'Volvix2026!', role: 'superadmin', tenant_id: 'TNT001', status: 'active', created: ... },
  { id: 'USR002', email: 'owner@volvix.test', password: 'Volvix2026!', role: 'owner',     tenant_id: 'TNT002', status: 'active', created: ... },
  { id: 'USR003', email: 'cajero@volvix.test', password: 'Volvix2026!', role: 'cajero',    tenant_id: 'TNT001', status: 'active', created: ... },
],
```

**Después:**
- Línea 103 (dentro de `_seed()`):
  ```js
  users: _loadSeedUsers(),
  ```
- Nueva función `_loadSeedUsers()` agregada arriba del `class Store` (DEV-ONLY):
  - Prioridad 1: `process.env.SEED_USERS_JSON` (array JSON completo)
  - Prioridad 2: `process.env.DEV_PASSWORDS_JSON` (mapa email→password)
  - Si no hay env vars, los usuarios semilla quedan con `password: ''` (login local fallará intencionalmente hasta configurar la env var).

**Qué se sacó:** 3 ocurrencias de `Volvix2026!` en código.
**Placeholder:** `_loadSeedUsers()` que lee de `SEED_USERS_JSON` o `DEV_PASSWORDS_JSON`.

---

### 1.2 `TASKS_FOR_NEXT_AI.md`

**Líneas cambiadas:** 23-24 (service_role + anon key) y 26-29 (passwords de prueba).

**Qué se sacó:**
- JWT service_role completo (`eyJhbGciOiJIUzI1Ni...rvPkcyE7Cu1BzAhM_GdZjmqXvQe67gIpPaI7tLESD-Q`)
- JWT anon key completo (`eyJhbGciOiJIUzI1Ni...ygTc754INgqYJEMD0wc_CzRCzRxUfp4hq3rYvJRpjkk`)
- 3 ocurrencias de `Volvix2026!` en el bloque "Usuarios de prueba"

**Placeholder:**
```
Service Key: <<ROTATE_AND_SET_IN_VERCEL_ENV>>
Anon Key:    <<ROTATE_AND_SET_IN_VERCEL_ENV>>
```
Más una nota de seguridad explicando que **las keys originales fueron expuestas en commit anterior y DEBEN rotarse en Supabase Dashboard antes de redeployar** (Settings → API → Reset service_role / anon key), y luego setear los valores nuevos como env vars en Vercel (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`).

Las passwords de prueba se reemplazaron por una nota: las passwords no se documentan en el README; se piden al owner del proyecto o se leen de `DEV_PASSWORDS_JSON`.

---

### 1.3 `VOLVIX_README.md`

**Líneas cambiadas:** 106 y 135.

- **Línea 106 (bloque "Credenciales de demo"):**
  - Antes: `Password: Volvix2026!`
  - Después: `Password: <<test-password>>` + nota explicando que la password real no se publica y se carga vía env var.
- **Línea 135 (instrucciones de "Local en 60 segundos"):**
  - Antes: `... entra con admin@volvix.test / Volvix2026!`
  - Después: `... entra con admin@volvix.test / <<test-password>> (la password real se carga via env var DEV_PASSWORDS_JSON).`

---

### 1.4 `status.json` y `BITACORA_LIVE.html`

Revisados con grep contra patrones `Volvix2026!|eyJhbGc|sbp_|service_role|SUPABASE_SERVICE_KEY`.
**Resultado:** sin coincidencias. **No se modificaron.**

---

## 2. Otros archivos del árbol que contienen secrets (NO modificados — solo reportados)

Búsqueda en `C:\Users\DELL\Downloads\verion 340\` con patrones
`Volvix2026!`, `eyJhbGc`, `sbp_`, `service_role`, `SUPABASE_SERVICE_KEY=eyJ`.

Excluidos (por regla): `node_modules`, `.git`, `.env*`.

Archivos con coincidencias (28 adicionales a los 4 ya tratados):

1. `db\R13_SEED_DATA.sql`
2. `db\R13_RLS_POLICIES.sql`
3. `db\R13_TEST_USERS_INSERT.sh`
4. `db\volvix.db.json`
5. `R13_SECURITY_AUDIT.md`
6. `R13_LOGIN_PHYSICAL_TEST.md`
7. `R13_HARDCODED_AUDIT.md`
8. `VOLVIX_FINAL_REPORT.md`
9. `VOLVIX_FINAL_DOCUMENTATION.md`
10. `salvadorex_web_v25.html`
11. `volvix-qa-scenarios.html`
12. `login.html`
13. `volvix-api-docs.html`
14. `volvix-realtime-wiring.js`
15. `volvix-tests-wiring.js`
16. `REPORTE_FINAL.md`
17. `api\index.js`
18. `LAUNCH_SUMMARY.md`
19. `PRODUCTION_LIVE.md`
20. `test-production.sh`
21. `DEPLOY_VERCEL.md`
22. `QUICKSTART.md`
23. `INTEGRATION_FINAL_STATUS.md`
24. `VERIFICATION_COMPLETE.md`
25. `SALVADOREX_INTEGRATION_COMPLETE.md`
26. `IMPLEMENTATION_COMPLETE.md`
27. `TESTING_RESULTS.md`
28. `INTEGRATION_SUMMARY.md`
29. `public\login.html`

**Recomendación de seguimiento (fuera del alcance de este ticket):**
- `db\volvix.db.json`, `db\R13_TEST_USERS_INSERT.sh`, `api\index.js`, `salvadorex_web_v25.html`, `login.html`, `public\login.html`, `volvix-realtime-wiring.js`, `volvix-tests-wiring.js`, `test-production.sh` son los candidatos más críticos (código ejecutable o DB local con passwords/keys).
- Los `.md` restantes son documentación/reportes; pueden barrerse en un siguiente ticket de "scrub docs".
- **Acción urgente:** rotar las keys de Supabase ya filtradas — siguen válidas mientras no se reseteen en Dashboard.

---

## 3. Resumen ejecutivo

| Archivo | Cambio | Secrets removidos |
|---|---|---|
| `server.js` | 3 passwords hardcoded → `_loadSeedUsers()` desde env | 3× `Volvix2026!` |
| `TASKS_FOR_NEXT_AI.md` | service_role + anon + 3 passwords → placeholders + nota | 2 JWTs + 3× `Volvix2026!` |
| `VOLVIX_README.md` | 2 passwords → `<<test-password>>` + nota | 2× `Volvix2026!` |
| `status.json` | sin cambios (sin secrets) | 0 |
| `BITACORA_LIVE.html` | sin cambios (sin secrets) | 0 |

**Total secrets neutralizados en este pass:** 8 strings de password + 2 JWTs Supabase.
**Pendiente urgente:** rotar service_role + anon en Supabase Dashboard, setear nuevas env vars en Vercel, y limpiar los 29 archivos restantes en un siguiente ticket.
