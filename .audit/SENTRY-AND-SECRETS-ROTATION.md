# Sentry DSN + Rotación de secrets — Guía paso a paso

> Acciones que REQUIEREN tu acción manual (yo no puedo crear cuentas ni acceder a Vercel dashboard).

---

## D. Configurar Sentry DSN (10 min)

### Paso 1 — Crear proyecto Sentry gratis

1. Abre https://sentry.io/signup/ (o login si ya tienes cuenta)
2. Plan **Developer FREE** (5K events/mes, suficiente para empezar)
3. Crea organización si no tienes (ej. "Volvix")
4. **Create Project**:
   - Platform: **Node.js**
   - Alert frequency: "Alert me on every new issue"
   - Project name: `volvix-pos-prod`
5. Te muestra el DSN — algo como:
   ```
   https://abc123def456@o123456.ingest.sentry.io/7890123
   ```
   **Copia ese DSN completo.**

### Paso 2 — Añadir a Vercel

1. Abre https://vercel.com/dashboard
2. Selecciona proyecto **volvix-pos**
3. **Settings** → **Environment Variables**
4. **Add New**:
   - Name: `SENTRY_DSN`
   - Value: el DSN que copiaste
   - Environments: marca **Production**, **Preview**, **Development**
5. **Save**
6. **Deployments** → último deploy → **... menu** → **Redeploy** (para que tome el env var)

### Paso 3 — Verificar (yo lo hago una vez configures)

```bash
curl -s "https://systeminternational.app/api/health" | grep -oE '"sentry"[^,}]*'
# Esperado: "sentry":"configured" o similar
```

---

## E. Rotar JWT_SECRET + ADMIN_API_KEY (15 min)

> **Por qué**: tu CLAUDE.md menciona que estuvieron commiteados en `.env.production`. Aunque ya quitaste el archivo del repo, alguien con acceso al git history pudo verlos. Rotación = generar nuevos y descartar los viejos.

### Paso 1 — Generar nuevos secrets

Corre esto en tu terminal local:

```bash
# JWT_SECRET nuevo (64 bytes hex = 128 chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ADMIN_API_KEY nuevo (32 bytes hex = 64 chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copia los dos valores.** No los pegues en chat, son secretos.

### Paso 2 — Actualizar Vercel

1. Vercel Dashboard → volvix-pos → Settings → Environment Variables
2. Encuentra `JWT_SECRET` → **Edit** → pega valor nuevo → Save
3. Encuentra `ADMIN_API_KEY` → **Edit** → pega valor nuevo → Save
4. **Redeploy** (Deployments → último → ... → Redeploy)

### Paso 3 — Actualizar .env local

En `D:\github\volvix-pos\.env`:
- Reemplaza `JWT_SECRET=...` con el nuevo valor
- Reemplaza `ADMIN_API_KEY=...` con el nuevo valor

### Paso 4 — Efectos colaterales

- **Tokens JWT existentes (sesiones activas) quedarán INVÁLIDOS** después del redeploy. Todos los usuarios tendrán que volver a hacer login. Es esperado.
- Las llamadas a endpoints admin que usen `ADMIN_API_KEY` viejo darán 401. Actualizar si usas alguna integración externa.

### Paso 5 — Verificar (yo lo hago después)

```bash
# Login nuevo debería seguir funcionando con un JWT recién emitido
node .audit/scripts/smoke-test-e2e.js
# Esperado: 11/11 PASS
```

---

## ¿Por qué no puedo hacerlo yo solo?

- **Sentry**: requiere crear cuenta con tu email. Solo tú debes hacerlo (es tu cuenta).
- **Vercel envs**: requiere login en tu cuenta Vercel. Yo no tengo acceso.
- **Secretos**: si los genero yo y te los muestro en chat, quedan en logs. Inseguro.

---

## Una vez hechos, dime "listo" y verifico todo de mi lado.
