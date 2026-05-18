# Agente Wave 2C — Endpoints COMPARTIDOS (Tier 1 detallado)

## Misión

Documentar los 8 endpoints compartidos entre POS y PDC. Estos son **acoplamiento crítico** del sistema. Cada uno necesita contrato detallado.

## Lista

Los 8 endpoints (extraer de system-map.json donde `exclusivo === "compartido"`):

```
/api/admin/giros/
/api/admin/tenant/
/api/admin/tenants
/api/app/config
/api/log/client
/api/owner/low-stock
/api/pos/app-orders
/api/users/me
```

## Inputs por cada endpoint

- `.specify/contracts/endpoints/ENDPOINT_TEMPLATE.md`: plantilla.
- `public/system-map.json`: para ver qué módulos/screens lo consumen.
- `.specify/schema-truth.md`: tablas reales en Supabase.
- Búsqueda en los HTML: `grep -n "/api/admin/tenants" public/*.html` para ver cómo se invoca (qué params, qué espera).
- **Si tienes acceso al código backend** (Next.js pages/api o equivalente): leer el handler real.

## Proceso por cada endpoint

### Paso 1: Identificar método y forma

Busca cómo se invoca:

```bash
grep -B 2 -A 5 "'/api/admin/tenants'" public/salvadorex-pos.html | head -30
grep -B 2 -A 5 "'/api/admin/tenants'" public/paneldecontrol.html | head -30
```

Detecta:
- ¿Es GET, POST, PUT, DELETE? (mira `method:` en fetch options)
- ¿Qué body envía? (mira `body: JSON.stringify(...)`)
- ¿Qué hace con la response? (mira `.then(...)` o `await response.json()`)

### Paso 2: Buscar handler backend

```bash
# Buscar archivo del handler
find pages/api server/api app/api src/pages/api -type f -name "*.ts" -o -name "*.js" 2>/dev/null | grep -i "admin/tenants"

# O en repo entero:
grep -rn "router.get('/api/admin/tenants'" --include="*.ts" --include="*.js" 2>/dev/null
```

Si encuentras el handler, leer:
- Validación de body
- Verificación de rol (debería ser server-side)
- Queries a Supabase (`from('...')`, `await supabase.from(X).select()`)
- Forma de la respuesta

### Paso 3: Inferir tablas tocadas

Del paso 2, captura QUE TABLAS de Supabase usa este endpoint. Cruzar con `.specify/schema-truth.md` para validar que existen.

### Paso 4: Generar contrato

Crea `.specify/contracts/endpoints/<METHOD>-<path-sanitized>.spec.md`:

Ej. `/api/admin/tenants` con GET → `GET-api-admin-tenants.spec.md`

Sigue exactamente `ENDPOINT_TEMPLATE.md`. Llena con datos reales. Si algo no se puede determinar, escribe TODO claro.

**Sección crítica**: el bloque "Tablas Supabase que toca". Aquí va lo más importante:

```markdown
## Tablas Supabase que toca

(Determinado leyendo el handler en <ruta-del-handler>)

| Tabla | Operación | Cuándo |
|-------|-----------|--------|
| tenants | SELECT | siempre, listado |
| business_owners | SELECT | join con tenants para get owner info |
| (otras detectadas) | ... | ... |

### Transaccionalidad

✅ / ❌ — declara honestamente.
```

## Crítico: documentar consumidor dual

Cada uno de estos 8 endpoints es consumido por POS Y PDC. Documenta:

```markdown
## Consumidores

- **POS** (`public/salvadorex-pos.html`):
  - Cuándo lo llama: <ej. en screen `config`, en función `loadTenantConfig()`>
  - Línea aprox: <N>
  - Qué hace con la response: <ej. popular dropdown de giros>

- **PDC** (`public/paneldecontrol.html`):
  - Cuándo lo llama: <ej. en perm-tab `users`>
  - Línea aprox: <N>
  - Qué hace con la response: <ej. tabla de tenants para asignar permisos>

## Acoplamiento detectado

¿Los dos consumidores esperan EXACTAMENTE el mismo shape de respuesta?
- ✓ Sí (verificable porque <evidencia>)
- ⚠️ Quizás no (POS hace .map(t => t.id) y PDC hace .map(t => t.nombre); ambos válidos pero diferentes)

Esto es deuda potencial: si POS cambia el shape esperado, rompe PDC.
```

## Reporte

`.blitz/status/wave-2c-shared-endpoints.md`:

```markdown
# Wave 2C — Endpoints compartidos

- Estado: ✓
- Endpoints documentados: 8 / 8
- Contratos creados: <lista de archivos>
- Tablas backend identificadas: <lista>
- Acoplamiento potencial detectado: <lista>
- Deudas:
  - <ej. endpoint /api/admin/tenants no tiene auth check visible>
```
