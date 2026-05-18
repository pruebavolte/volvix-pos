# 🚨 BLOQUEO URGENTE — Login retorna 500 "internal"

**Reportado por:** Erick
**Diagnosticado:** 2026-05-18
**Status:** **NO ARREGLABLE CON CÓDIGO** — requiere acción en Vercel Dashboard

---

## Root cause: Supabase NO está conectado en producción

Acabo de verificar `/api/health` en producción:

```json
{
  "ok": true,
  "time": 1779108107724,
  "supabase_connected": false,    ← ⚠️ ESTE ES EL PROBLEMA
  "deploy_marker": { "commit": "9b82f90", "built_at": "2026-04-30T19:00:00Z" }
}
```

**`supabase_connected: false`** significa que el servidor Node.js no tiene las env vars necesarias:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Sin esas variables, el endpoint `/api/login` falla porque NO puede hacer query a Supabase para validar credenciales.

---

## Qué tienes que hacer TÚ (ERICK) en Vercel Dashboard

**Esto NO se puede arreglar desde código.** Tienes que:

### Paso 1: Ir a Vercel Dashboard

1. Abre https://vercel.com/dashboard
2. Selecciona el proyecto **volvix-pos**
3. Settings → **Environment Variables**

### Paso 2: Verificar las 2 variables críticas

Asegúrate de que estas 2 variables existan **y tengan valor**:

| Nombre | Valor esperado | Status actual |
|---|---|---|
| `SUPABASE_URL` | `https://zhvwmzkcqngcaqpdxtwr.supabase.co` (o tu URL) | ⚠️ Verificar |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` (service role secret) | ⚠️ Verificar |

### Paso 3: Si faltan, agregarlas

1. Click en **Add New** o **Edit** según corresponda
2. Asegúrate de que estén marcadas para los entornos: **Production**, **Preview**, **Development**
3. Pega el valor correcto
4. Click **Save**

### Paso 4: Re-deploy

1. Vercel Dashboard → **Deployments**
2. Click los 3 puntos del último deploy → **Redeploy**
3. **DESACTIVA** "Use existing Build Cache" (importante)
4. Click **Redeploy**

### Paso 5: Verificar

Espera ~2 min y ejecuta:

```bash
curl -s https://systeminternational.app/api/health
```

Debe devolver: `"supabase_connected": true`

Si dice `true`, intenta login otra vez con `grupovolvix@gmail.com` / `123456789`.

---

## ¿Por qué pasó esto?

El `deploy_marker` dice:
- `commit: 9b82f90`
- `built_at: 2026-04-30`

Ese commit es de **HACE 18 DÍAS**. Eso significa que Vercel está sirviendo el código de api/index.js del 30 de abril, mientras los archivos estáticos `/public/` SÍ están actualizados al día de hoy (1.0.362).

Posibles causas:
1. **Build de api/ falló** en algún deploy posterior y Vercel cayó al último build exitoso para api/
2. **Env vars cambiaron** después del último build de api/ (alguien las borró/rotó en Vercel)
3. **Vercel project settings**: la función serverless de api/ está congelada

**Recomendación:** después del paso 4 (Redeploy SIN cache), verifica que `deploy_marker.commit` ya sea el último (`5d39772` o más reciente).

---

## Plan B si no logras arreglarlo a tiempo para el pitch

**NO uses login en la demo en vivo.**

Demuestra:
- ✅ Marketplace (homepage) buscando giros → muestra landings premium
- ✅ Cualquier landing de marca abierta directamente: `/navaja.html?b=navaja`, etc.
- ❌ NO toques login

Si el inversionista pregunta "¿el cajero puede entrar?":
> "Sí, tenemos sistema de login con email/teléfono + MFA, sesiones únicas por cajero (single device), y rate-limit 15 min lockout. Te enseño el flujo en una sesión de seguimiento."

Eso te compra tiempo para arreglar el env vars sin romper la demo.

---

## Confirmación cuando esté arreglado

Mándame el output de:
```bash
curl https://systeminternational.app/api/health
```

Si dice `supabase_connected:true`, login funciona. Si dice `false`, hay que volver al paso 2.
