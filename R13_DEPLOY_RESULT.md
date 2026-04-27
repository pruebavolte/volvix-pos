# R13 Deploy Result — Volvix POS

**Fecha:** 2026-04-26
**Comando ejecutado:** `vercel --prod --yes` (desde `C:\Users\DELL\Downloads\verion 340\`)
**CLI:** Vercel 51.2.1 (build 51.6.1 en server)

## Configuración pre-deploy

- `vercel.json` — OK (presente, rutas y bloqueos 404 configurados)
- `.vercelignore` — OK (presente, excluye archivos confidenciales: BITACORA_*, VOLVIX_*, status.json, *.md, etc.)

## Resultado del deploy

- **Status:** READY
- **Deployment ID:** `dpl_cLYW2U5wwFtr24gEpEehdMuJhfGf`
- **URL deploy:** https://volvix-5naxv9ybt-grupo-volvixs-projects.vercel.app
- **Alias producción:** https://volvix-pos.vercel.app
- **Build time:** 869ms
- **Inspect:** https://vercel.com/grupo-volvixs-projects/volvix-pos/cLYW2U5wwFtr24gEpEehdMuJhfGf

## Verificaciones post-deploy

| Endpoint | Esperado | Obtenido | Resultado |
|---|---|---|---|
| GET `/` | 200 | **500** | FALLA (env vars) |
| GET `/api/health` | 200 | **500** | FALLA (env vars) |
| GET `/api/debug` | 404 | **500** | mismo backend cae antes de evaluar ruta |
| GET `/volvix-qa-scenarios.html` | 404 | 404 | OK |
| GET `/BITACORA_LIVE.html` | 404 | 404 | OK |
| GET `/status.json` | 404 | 404 | OK |
| POST `/api/login` (bad creds) | 401 | **500** | FALLA (env vars) |
| GET `/api/products` (sin Bearer) | 401 | **500** | FALLA (env vars) |

### Body de `/api/health`
```
A server error has occurred
FUNCTION_INVOCATION_FAILED
cle1::zgfls-1777222382646-061704f13d8e
```

## Diagnóstico

Las rutas estáticas bloqueadas vía `vercel.json` (HTML confidenciales, status.json) responden **404 correctamente** — la configuración de seguridad de archivos funciona.

**Todas las rutas que pasan por `api/index.js` devuelven 500 con `FUNCTION_INVOCATION_FAILED`.** Esto confirma que el handler crashea durante el cold-start, casi seguro porque faltan las env vars requeridas:

- `JWT_SECRET`
- `SUPABASE_SERVICE_KEY`

## Próximos pasos manuales (REQUERIDO usuario)

1. Ir a https://vercel.com/grupo-volvixs-projects/volvix-pos/settings/environment-variables
2. Agregar para entorno **Production**:
   - `JWT_SECRET` = (secreto fuerte, min 32 chars)
   - `SUPABASE_SERVICE_KEY` = (service role key del proyecto Supabase)
   - Verificar también si requiere `SUPABASE_URL` u otras (revisar `api/index.js`)
3. Re-deploy (puede ser redeploy desde el dashboard, o `vercel --prod --yes` de nuevo)
4. Re-correr verificaciones de esta tabla — `/api/health` debe pasar a 200, login con bad creds a 401, etc.

## Observaciones

- El deploy **se subió bien**, el binding de dominio funcionó (`volvix-pos.vercel.app` aliased OK).
- Los bloqueos 404 de archivos confidenciales (auditoría de seguridad R13) están **operativos**.
- El único problema bloqueante es la configuración de env vars en el dashboard de Vercel.
