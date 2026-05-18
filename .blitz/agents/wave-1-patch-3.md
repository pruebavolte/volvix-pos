# Agente Wave 1 — Parche 3: Roles hardcoded

## Misión

Detectar referencias a roles en el frontend para auditoría de seguridad.

## Output esperado

Crea `scripts/_patches/patch-3.diff.js`:

```js
// PATCH 3: Roles hardcoded en frontend

// AGREGAR a scanFile() después de extraer endpoints:
// --- INICIO PARCHE ---
const knownRoles = ['platform_owner', 'business_owner', 'admin', 'cashier', 'waiter', 'delivery', 'owner', 'super_admin', 'manager'];
const roleRegex = new RegExp(`['"](?:${knownRoles.join('|')})['"]`, 'g');
const roles = uniqueMatches(text, roleRegex).map(s => s.replace(/['"]/g, ''));

const roleChecks = [];
const roleCheckRegex = /(?:role|userRole|currentRole|user\.role|tenant\.role)\s*===?\s*['"]([a-z_]+)['"]/gi;
let rcm;
while ((rcm = roleCheckRegex.exec(text)) !== null) {
  roleChecks.push(rcm[1]);
}
// --- FIN PARCHE ---

// EN RETURN agregar:
//   roles_mencionados: roles,
//   role_checks_count: roleChecks.length,
//   role_checks_summary: Object.fromEntries(
//     [...new Set(roleChecks)].map(r => [r, roleChecks.filter(x => x === r).length])
//   )
```

## Reporte

`.blitz/status/wave-1-patch-3.md`:

```markdown
# Wave 1 — Parche 3: Roles hardcoded

- Estado: ✓
- Detecta: referencias a roles en strings + checks `role === '...'`
- Útil para: auditoría de seguridad (qué roles se usan dónde)
```
