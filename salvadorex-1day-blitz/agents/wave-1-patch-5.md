# Agente Wave 1 — Parche 5: Window vars (state global)

## Misión

Detectar variables globales expuestas en `window.*` que NO son funciones — es decir, **state compartido**.

## Output esperado

Crea `scripts/_patches/patch-5.diff.js`:

```js
// PATCH 5: Variables window globales (state)

// AGREGAR a scanFile():
// --- INICIO PARCHE ---
// Captura window.X = valor (donde valor NO es función ni arrow function)
const winVarRegex = /window\.([a-zA-Z_$][\w$]*)\s*=\s*(?!(?:async\s+)?function|\([^)]*\)\s*=>|[a-zA-Z_$][\w$]*\s*=>)([^;\n]{1,80})/g;
const windowVars = new Map();
let wvm;
while ((wvm = winVarRegex.exec(text)) !== null) {
  const name = wvm[1];
  if (name.length <= 2) continue;
  const value = wvm[2].trim();
  // Inferir tipo
  let tipo = 'unknown';
  if (/^['"]/.test(value)) tipo = 'string';
  else if (/^[\d.]+$/.test(value)) tipo = 'number';
  else if (value === 'true' || value === 'false') tipo = 'boolean';
  else if (value === 'null') tipo = 'null';
  else if (value.startsWith('{')) tipo = 'object';
  else if (value.startsWith('[')) tipo = 'array';
  else if (value.startsWith('new Map')) tipo = 'Map';
  else if (value.startsWith('new Set')) tipo = 'Set';

  if (!windowVars.has(name)) windowVars.set(name, { tipo, ejemplo_valor: value.slice(0, 50) });
}
// --- FIN PARCHE ---

// EN RETURN:
//   window_vars: Object.fromEntries(windowVars),
//   window_vars_count: windowVars.size
```

## Reporte

`.blitz/status/wave-1-patch-5.md`:

```markdown
# Wave 1 — Parche 5: Window vars

- Estado: ✓
- Detecta: state global en window.*
- Útil para entender qué state hay que conservar entre screens
```
