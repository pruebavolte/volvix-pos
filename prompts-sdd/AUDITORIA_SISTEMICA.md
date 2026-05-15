# AUDITORÍA SISTÉMICA AUTÓNOMA — Volvix POS

> Copia y pega este prompt completo en Claude Code cuando quieras una auditoría sistémica completa SIN que la IA toque código todavía. Diagnóstico primero, fix después.

---

```
MODO: AUDITORÍA SISTÉMICA AUTÓNOMA
NO preguntes, ejecuta. NO arregles nada en esta corrida, solo diagnostica.
Si te falta acceso a algo (MCP, archivo, BD), repórtalo en el reporte final, no te detengas.

═══════════════════════════════════════════════════════════════════
FUENTES DE VERDAD (leer en este orden ANTES de empezar)
═══════════════════════════════════════════════════════════════════

1. CLAUDE.md (raíz del repo)
2. .specify/constitution.md
3. .specify/domain.md
4. .specify/schema-truth.md  (si está desactualizado, regenéralo PRIMERO)
5. .specify/contracts/*.spec.md  (todos)
6. .specify/flows/*.md  (todos)

═══════════════════════════════════════════════════════════════════
FASE 0 — REGENERAR SCHEMA-TRUTH
═══════════════════════════════════════════════════════════════════

Usa el MCP de Supabase (project zhvwmzkcqngcaqpdxtwr) para listar:
- Todas las tablas del schema `public`
- Columnas, tipos, nullable, defaults
- Primary keys
- Foreign keys
- Índices
- Políticas RLS

Sobrescribe .specify/schema-truth.md con esta info real.
Agrega timestamp UTC al final.

═══════════════════════════════════════════════════════════════════
FASE 1 — INVENTARIO
═══════════════════════════════════════════════════════════════════

A. Listar cada archivo del frontend (HTML/JS/TS):
   - Ruta, propósito declarado (de los comentarios o nombre)
   - Tabla(s) que consume (grep `from('...')`)
   - Tabla(s) en que escribe (grep `insert`, `update`, `delete`)

B. Listar cada tabla real de Supabase (de la fase 0).

C. Cruzar A y B en una matriz módulo→tablas.

Guarda en: .audit/matriz.md

═══════════════════════════════════════════════════════════════════
FASE 2 — DETECCIÓN DE INCONSISTENCIAS
═══════════════════════════════════════════════════════════════════

Para CADA módulo, valida:

[ ] ¿La tabla que dice usar (en su contrato o comentarios) es la que realmente usa?
[ ] ¿Hay otra tabla con propósito duplicado? (productos vs productos_v2, tickets vs pedidos, etc.)
[ ] ¿El módulo "Lista de X" lee de la MISMA tabla donde "Guardar X" escribe?
[ ] ¿Después de guardar, hay invalidación de cache o suscripción Realtime?
[ ] ¿Los forms se limpian post-submit? (buscar `form.reset()`, `setState({...})` o equivalente)
[ ] ¿El orden por defecto en listados es DESC por created_at?
[ ] ¿El filtro de fecha default es últimas 24h y no semanas atrás?
[ ] ¿La función de búsqueda (productos, clientes) es ÚNICA en el codebase?

Para cada inconsistencia, reporta:
- Archivo:línea afectado
- Tabla/columna afectada
- Severidad: CRÍTICA / ALTA / MEDIA
- Fix sugerido (pero NO ejecutar)

Guarda en: .audit/inconsistencias.md

═══════════════════════════════════════════════════════════════════
FASE 3 — FLUJOS END-TO-END (Playwright + MCP)
═══════════════════════════════════════════════════════════════════

Para cada archivo en .specify/flows/:

1. Levanta el sistema (npm run dev / serve, lo que aplique).
2. Corre Playwright siguiendo los pasos del flow.
3. DESPUÉS DE CADA PASO, querea Supabase via MCP para verificar el estado de BD esperado.
4. Captura screenshot post-cada-paso.
5. Registra pass/fail por checkpoint (CK1.1, CK1.2, ...).

Ejemplos de verificación post-paso (cobro-end-to-end):
- CK5.1: SELECT COUNT(*) FROM tickets WHERE created_at > NOW() - INTERVAL '10 seconds' AND usuario_id = $cajero
- CK7.2: assert(inputCliente.value === '')
- CK8.1: el ticket está en la lista DOM sin recargar (Playwright assertion)

Guarda en: .audit/flujos.md con tabla:

| Flow | Checkpoint | BD | UI | Resultado | Evidencia |

═══════════════════════════════════════════════════════════════════
FASE 4 — REPORTE CONSOLIDADO
═══════════════════════════════════════════════════════════════════

Genera .audit/REPORTE.md con:

1. Resumen ejecutivo (números: total, pass, fail, % crítico)
2. Top 5 problemas críticos con archivo, causa, fix sugerido
3. Deuda arquitectónica detectada (tablas duplicadas, funciones duplicadas)
4. Lista completa ordenada por severidad
5. Orden recomendado de fix (qué primero, qué después)
6. Lo que NO se pudo verificar y por qué

═══════════════════════════════════════════════════════════════════
REGLAS DURAS DE ESTA CORRIDA
═══════════════════════════════════════════════════════════════════

❌ NO crees tablas, columnas, archivos, ni hagas migraciones.
❌ NO "arregles" nada todavía.
❌ NO inventes problemas que no detectaste empíricamente.
❌ NO digas "todo OK" si no corriste cada checkpoint.

✅ SÍ regenera schema-truth.md.
✅ SÍ genera todos los archivos en .audit/.
✅ SÍ cita archivo:línea, tabla:columna específicos.
✅ SÍ sé honesto: "no pude verificar X porque Y".

═══════════════════════════════════════════════════════════════════
FORMATO DE REPORTES PROGRESIVOS
═══════════════════════════════════════════════════════════════════

Reporta al usuario al terminar CADA fase (no esperes a tener todo).

Fase 0 listo → 1 párrafo + ruta de schema-truth.md
Fase 1 listo → 1 párrafo + ruta de matriz.md
Fase 2 listo → 1 párrafo + top 3 hallazgos críticos
Fase 3 listo → 1 párrafo + summary de pass/fail
Fase 4 listo → resumen ejecutivo + ruta de REPORTE.md

EMPIEZA YA.
```

---

## Cuándo usar este prompt

- Al menos **1 vez por semana** durante desarrollo activo.
- **Antes** de cualquier release.
- **Antes** de una demo a cliente o inversionista.
- Cada vez que pienses "algo no funciona y no sé qué".

## Después del reporte

NO arregles todo de un jalón. Toma el reporte, escoge el problema #1, y pídele a Claude Code:

> "Arregla solo el problema #1 del reporte de auditoría. Sigue el contrato correspondiente. Después de arreglar, vuelve a correr la fase 3 SOLO para ese flow y reporta si pasa."

Iteras así, un problema a la vez. Cada fix tiene su propia verificación BD+UI.
