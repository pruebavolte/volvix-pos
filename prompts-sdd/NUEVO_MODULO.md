# NUEVO MÓDULO — Prompt copy-paste

> Úsalo cada vez que necesites un módulo nuevo en Volvix POS. Te obliga a definir el contrato primero, después el código. Así la IA no improvisa.

---

```
MODO: CREAR MÓDULO NUEVO — Spec-Driven

Vas a crear el módulo: <RELLENA: ej. "Gestión de proveedores">

REGLAS DE ESTA CORRIDA:
1. NO escribas código todavía.
2. Lee las fuentes de verdad PRIMERO.
3. Define el contrato del módulo en .specify/contracts/<modulo>.spec.md
4. Espera mi "GO" para implementar.

═══════════════════════════════════════════════════════════════════
PASO 1 — LEER FUENTES DE VERDAD
═══════════════════════════════════════════════════════════════════

- CLAUDE.md
- .specify/constitution.md
- .specify/domain.md
- .specify/schema-truth.md (regenéralo si está más viejo que 1 día)
- .specify/contracts/*.spec.md (todos, para no duplicar patrones)

═══════════════════════════════════════════════════════════════════
PASO 2 — VALIDAR QUE NO EXISTE YA
═══════════════════════════════════════════════════════════════════

Invoca el skill sst-validator buscando si:
- Ya hay una tabla con propósito similar.
- Ya hay un módulo/archivo con propósito similar.
- Ya hay funciones que harían lo mismo.

Si encuentras algo, NO crees módulo nuevo. Repórtame qué hay y discutamos si:
(a) Se reutiliza lo existente.
(b) Se consolida.
(c) Realmente se necesita uno nuevo (en cuyo caso, ADR primero).

═══════════════════════════════════════════════════════════════════
PASO 3 — ESCRIBIR EL CONTRATO
═══════════════════════════════════════════════════════════════════

Crea .specify/contracts/<modulo>.spec.md siguiendo el template de
los contratos existentes (productos.spec.md, tickets.spec.md, etc.).

Debe incluir:

A. Identidad (nombre, archivos, tabla(s))
B. Responsabilidades (qué hace, qué NO hace)
C. Campos / schema de inputs
D. Operaciones (CRUD + búsquedas reutilizables) con queries y flujo
E. Invariantes (qué debe cumplirse siempre)
F. Eventos que emite (Realtime)
G. Anti-patrones a evitar
H. Checklist de verificación R7 (BD + UI)

═══════════════════════════════════════════════════════════════════
PASO 4 — ESCRIBIR ADR SI APLICA
═══════════════════════════════════════════════════════════════════

Si el módulo nuevo requiere:
- Tabla nueva → ADR
- Columna nueva en tabla existente → ADR
- Nueva dependencia en stack → ADR
- Cambio en flujo crítico → ADR

Crea .specify/decisions/ADR-NNN-<tema>.md siguiendo el formato del
README de esa carpeta.

═══════════════════════════════════════════════════════════════════
PASO 5 — ESCRIBIR FLOW END-TO-END
═══════════════════════════════════════════════════════════════════

Crea .specify/flows/<modulo>-end-to-end.md con:
- Pre-condiciones
- Pasos numerados (cómo se usa el módulo de principio a fin)
- Checkpoints por paso (BD + UI)
- Anti-patrones que el flow detecta

═══════════════════════════════════════════════════════════════════
PASO 6 — REPORTE Y ESPERA
═══════════════════════════════════════════════════════════════════

Reportame:
- Contrato creado en: <ruta>
- ADR creado (si aplica) en: <ruta>
- Flow creado en: <ruta>
- Tablas nuevas necesarias (si las hay): <lista>
- Cambios al schema existente: <lista>

Espera mi "GO" para implementar el código.

═══════════════════════════════════════════════════════════════════
DESPUÉS DE MI "GO" (PASO 7+)
═══════════════════════════════════════════════════════════════════

Cuando te dé GO:

7. Si hay ADR aprobado, corre la migración (con backup previo).
8. Implementa el código siguiendo EXACTAMENTE el contrato.
9. Después de cada operación implementada, verifica BD (MCP) Y UI (Playwright/screenshot).
10. Si hay un checkpoint del flow que no pasa, NO marques como hecho. Reporta el fail.
11. Al terminar, ejecuta el flow end-to-end completo y entrega resultados.

Tu reporte final debe seguir la regla R9 de CLAUDE.md:
- ✅ Lo que SÍ verificaste (con evidencia)
- ⚠️ Lo que NO pudiste verificar (con razón)
- ❌ Lo que falta

NUNCA digas "todo funciona" si no pasaste cada checkpoint.

EMPIEZA POR EL PASO 1.
```
