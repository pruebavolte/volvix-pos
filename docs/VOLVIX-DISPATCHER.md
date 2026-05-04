# DISPATCHER — pegar al inicio de cada sesión nueva

Sesión nueva. Procedimiento estricto:

1. `bash scripts/preflight.sh`. Si exit 1, reporta y para.
2. Lee `VOLVIX-FIX-PLAN.md` y dime cuál bloque sigue PENDIENTE.
3. Resúmeme en 5 líneas: qué archivos vas a tocar, tiempo estimado, riesgos.
4. Lista los tests ejecutables que vas a usar como definición de hecho.
5. Espera mi "OK procede".

Cuando yo diga "OK procede":

6. `git checkout -b fix/B<n>-<short>`
7. Ejecuta el bloque siguiendo SU definición de hecho. Test por test.
8. Después de cada fix: `bash scripts/postfix-verify.sh <fixed_url> <changed_file> <regr1> <regr2> <regr3>`. Si falla: rollback automático y reintento UNA vez. Si falla otra vez: para.
9. Cuando todos los tests pasen:
   a) Actualiza `VOLVIX-FIX-PLAN.md` (bloque COMPLETO + bitácora con bugs, score, tiempo real)
   b) Calcula score nuevo (suma puntos de los bugs verificados)
   c) Commit con mensaje convencional: `fix(B<n>): <resumen>`
   d) Merge de la rama a main (`git checkout main && git merge fix/B<n>-<short>`)
   e) Deploy a Vercel (`vercel --prod --yes`)
   f) Verificación pública final con Playwright contra URL pública

10. Reporta cierre: bugs arreglados, score, regresiones, próximo bloque.

PROHIBIDO:
- Saltar a un bloque que no es el siguiente PENDIENTE
- Reportar "completo" sin actualizar `VOLVIX-FIX-PLAN.md`
- Inflar score
- Saltar `postfix-verify.sh` "porque ya verifiqué"
- Spawn de subagentes para fixing (Playwright workers sí, agentes no)
- Hacer fixes sin estar en una rama `fix/B<n>-<short>`

NOTAS:
- `SYSTEM-INVENTORY.json` se regenera SOLO con `bash scripts/refresh-inventory.sh` o si pasaron >7 días desde `generated_at`. No re-escanees el repo cada sesión.
- Si el bloque es **paralelizable con otro** (B3/B4), puedes correrlos en sesiones gemelas en máquinas distintas. Cada sesión solo toca su rama.
- Score calculation:
  - Bloqueante = -20 al detectar, +20 al cerrar verificado
  - Crítico    = -10 / +10
  - Alto       = -5 / +5
  - Medio      = -3 / +3
  - Solo cuenta si Playwright lo confirma contra URL pública
