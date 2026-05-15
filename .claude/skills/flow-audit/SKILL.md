---
name: flow-audit
description: Runs an end-to-end audit of the entire system. Use when the user asks to "audit everything", "review the whole system", "check why nothing works", "qué está roto", "auditoría completa", or before declaring anything production-ready. Combines verify-schema + sst-validator + executes the flows in .specify/flows/ with Playwright AND verifies BD state via MCP after each step. Returns a single consolidated report. Does NOT fix anything, only diagnoses.
---

# flow-audit

Auditoría sistémica end-to-end. La única forma confiable de saber si Volvix POS funciona de verdad.

## Cuándo se activa

- Usuario pide "audita el sistema", "revisa todo", "qué está roto".
- Antes de release o demo importante.
- Después de un refactor grande.

## Fases

### Fase 1. Inventario (sin tocar nada)

1. Listar archivos HTML/JS/TS principales en el repo.
2. Para cada uno, leer el header/comentarios y deducir propósito declarado.
3. Listar tablas reales de Supabase (vía MCP).
4. Listar contratos en `.specify/contracts/`.
5. Generar matriz `módulo → tabla → contrato` en `.audit/matriz.md`.

### Fase 2. Verificaciones estáticas

1. Invocar skill `verify-schema` → compara MCP vs schema-truth.md.
2. Invocar skill `sst-validator` → detecta duplicaciones.
3. Validar que cada contrato apunta a archivos que existen.
4. Validar que cada módulo en código tiene un contrato.

Genera `.audit/estatico.md`.

### Fase 3. Verificaciones dinámicas (Playwright + BD)

Para cada archivo en `.specify/flows/*.md`, ejecutar:

1. Levantar el sistema (`npm run dev` o equivalente).
2. Correr Playwright siguiendo los pasos del flow.
3. Después de **cada paso**, hacer query a Supabase via MCP para verificar el estado de BD esperado.
4. Capturar screenshot después de cada paso.
5. Registrar pass/fail por checkpoint (CK1.1, CK1.2, etc.).

Genera `.audit/dinamico.md` con tabla:

```
| Flow                     | Checkpoint | BD | UI | Resultado |
|--------------------------|------------|-----|-----|-----------|
| cobro-end-to-end         | CK5.1      | ✅  | ✅  | PASS      |
| cobro-end-to-end         | CK7.2      | -   | ❌  | FAIL: cliente anterior aún visible |
| cobro-end-to-end         | CK8.1      | ✅  | ❌  | FAIL: ticket no aparece en historial sin recargar |
```

### Fase 4. Reporte consolidado

Genera `.audit/REPORTE.md` con:

```markdown
# Reporte de auditoría sistémica — <fecha>

## Resumen ejecutivo

- Total de checkpoints: N
- Pass: X (Y%)
- Fail: Z (W%)
- Severidad de fallas: <crítica/alta/media>

## Top 5 problemas críticos

1. **CK8.1 (cobro)**: Ticket recién cobrado no aparece en historial sin recargar.
   - Causa probable: módulo historial no está suscrito a Realtime, o filtro de fecha excluye el ticket.
   - Archivo afectado: `pos/historial.js:34`
   - Fix sugerido: agregar `.on('postgres_changes', ...)` y asegurar que filtro default sea últimas 24h.

2. ...

## Problemas no críticos

...

## Deuda arquitectónica detectada

- Tabla `productos_v2` paralela a `productos`.
- Función `buscarClienteRapido()` duplica `buscarCliente()`.

## Recomendaciones de orden de fix

1. Primero crítico CK8.1 (1 archivo).
2. Luego deuda de tablas duplicadas (requiere migración + ADR).
3. Luego consolidación de funciones duplicadas.
```

## Regla dura

**Este skill NO ejecuta fixes**. Solo audita y reporta. El usuario decide qué arreglar y en qué orden. Esto evita que la IA "arregle" 5 cosas a la vez y rompa otras 10.

## Output

Tres archivos: `.audit/matriz.md`, `.audit/estatico.md`, `.audit/dinamico.md`, `.audit/REPORTE.md`.

El reporte final debe ser **honesto**:

- Lo que SÍ se verificó (con evidencia).
- Lo que NO se pudo verificar (con razón).
- Lo que falta.

**Prohibido** decir "todo bien" si no se ejecutó cada checkpoint.
