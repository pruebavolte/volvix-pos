# Plan POST-PITCH — Qué hacer después de impresionar al inversionista

**Fecha generación:** 2026-05-18
**Branch del sprint nocturno:** `feature/ampliacion-modulos`
**Branch de producción:** `main` (intacta, NO mergear hasta después del pitch)

---

## Decisión inmediata después del pitch

### Escenario A — El pitch va BIEN, recibes inversión o promesa firme

**Mergear `feature/ampliacion-modulos` a `main` con cuidado:**

1. NO hacer merge automático. Primero verifica el diff con git:
   ```bash
   git diff main feature/ampliacion-modulos --stat
   ```

2. Si hay archivos modificados en `public/*.html` o `api/*.js` que NO esperabas:
   - **NO mergees**.
   - El sprint nocturno NO debió tocar HTML/JS de producción (regla #0).
   - Si Claude Code tocó algo, fue un error. Revierte ese archivo específico antes de merge.

3. Si solo hay archivos `.audit/*`, `docs/*`, `.audit/migrations/*` — esos son SEGUROS de mergear:
   ```bash
   git checkout main
   git merge feature/ampliacion-modulos --no-ff
   git push origin main
   ```

4. Después del merge: NO ejecutar migrations todavía. Espera 24-48 horas viendo si producción sigue estable.

5. Ejecutar migrations en orden:
   ```bash
   # Backup primero
   pg_dump -h supabase-host -U postgres -d volvix > backup-pre-migrations-$(date +%Y%m%d).sql

   # Ejecutar UNA migration a la vez con validación entre cada una
   psql -h supabase-host -U postgres -d volvix -f .audit/migrations/01-extend-pos-products.sql
   # Verifica que el POS sigue funcionando antes de seguir
   psql ... -f 02-extend-pos-customers.sql
   psql ... -f 03-extend-pos-users.sql
   psql ... -f 04-create-volvix-vendors-extended.sql
   psql ... -f 05-create-giros-terminologias.sql
   psql ... -f 06-create-pos-appointments-extended.sql
   ```

6. Si algo se rompe en cualquier paso: ejecuta `07-rollback-all.sql` y `git revert` el merge commit.

### Escenario B — El pitch va REGULAR, te dan retroalimentación constructiva

Probable feedback de inversionistas:

- **"Muéstrenme analytics reales"** — instrumentar `saveContext()` en el router para guardar queries reales (instrumentación 2 semanas).
- **"¿Cuántos clientes pagando?"** — diseñar GTM, demo a 50 negocios mexicanos antes de programar más features (1 mes).
- **"El diseño se ve genérico"** — invertir en designer dedicado para refinamiento visual (1 mes).

En este caso: **NO empezar a programar más features**. Recopilar datos y demos antes.

### Escenario C — El pitch va MAL, no consigues inversión

1. No te desanimes. Tienes un sistema funcional en producción con 217 marcas. Eso es MÁS de lo que el 95% de startups tienen al hacer pitch.

2. Estrategia:
   - **Bootstrap por 6 meses:** consigue 10-20 clientes mexicanos pagando $200-500 MXN/mes = $4,000-10,000 MXN/mes de runway personal.
   - Con 10 clientes pagando, vuelves al pitch con tracción real.
   - El producto está. Lo que falta es validación de mercado, no más código.

3. NO sigas construyendo el Entity Engine en este escenario hasta no tener clientes pagando que LO PIDAN.

---

## Backlog técnico priorizado (cuando vuelvas a programar)

### Sprint 1 (después del pitch) — 2 semanas, sin presión

**Objetivo:** preparar el terreno para construir el Entity Engine sin romper nada.

- [ ] Ejecutar migrations 01-06 en Supabase con backup previo y validación entre cada una
- [ ] Migrar 1 tenant de prueba para que use las columnas nuevas (sin afectar UI todavía)
- [ ] Crear endpoint `/api/giros/config?giro=X` que devuelve `terminologias` + `modulos_activos` desde la nueva tabla `giros_terminologias`
- [ ] Cargar las 30 terminologías del archivo `TERMINOLOGIAS.json` a la nueva tabla
- [ ] Endpoint admin para crear/editar terminologías por tenant

### Sprint 2 — 3 semanas

**Objetivo:** schema-driven renderer básico (sin todavía tocar el modal real).

- [ ] Crear `public/entity-modal.html` (HTML aislado, NO toca salvadorex-pos.html)
- [ ] Renderer JS que lee un schema JSON y construye el form
- [ ] 5 schemas seed (producto, servicio, cliente, proveedor, empleado)
- [ ] Demo: tenant restaurante ve modal de producto con campos kitchen; tenant retail ve modal con variantes
- [ ] Documentación + tests

### Sprint 3 — 3 semanas

**Objetivo:** reemplazar gradualmente los modales de salvadorex-pos.html con el renderer schema-driven.

- [ ] Empezar por el modal MÁS USADO: agregar producto
- [ ] Feature flag por tenant: `use_schema_modal=true/false`
- [ ] Beta con 5 tenants amigables (los que ya conoces personalmente)
- [ ] Iterar 2 semanas con feedback
- [ ] Si OK: rollout gradual al 20% → 50% → 100%

### Sprint 4-8 — 12 semanas

**Objetivo:** los 30 módulos vertical-specific.

- [ ] Módulo kitchen (KDS, modificadores, mesas) — restaurantes
- [ ] Módulo medical (expediente, recetas, dosis) — clínicas
- [ ] Módulo appointments avanzado (recurrencia, recordatorios) — barbería/salones
- [ ] Módulo rentals (calendario, contratos) — rentas
- [ ] Módulo automotive (VIN, compatibilidad) — talleres
- [ ] ...etc

---

## Métricas a trackear post-pitch

| Métrica | Cómo medir | Frecuencia |
|---|---|---|
| Giros más buscados en marketplace | Instrumentar `saveContext()` → tabla `search_log` | Diario |
| Conversion marketplace → registro | Funnel en analytics | Semanal |
| Tenants activos por giro | Query agrupada `pos_tenants.giro_slug` | Semanal |
| Bugs reportados por usuarios | Sentry + tickets | Diario |
| Velocidad de respuesta del POS | New Relic / Datadog | Continuo |
| % uptime | Status page público | Continuo |

---

## Riesgos identificados

### 🔴 Riesgo ALTO

1. **El backend `api/giros.js` tiene 30+ giros con landing planas viejas.** El fix V8.9 redirige 30 al premium pero pueden quedar otros. Audita los logs de `/api/giros/search` post-pitch para detectar cualquier `landing: '/landing-*.html'` que aún se sirva.

2. **Las migraciones SQL pueden romper queries existentes** si añaden columnas con DEFAULT y los SELECT * van con orden de columnas hardcoded. Solución: ejecutar migraciones en horario nocturno + tener rollback listo (`07-rollback-all.sql`).

### 🟡 Riesgo MEDIO

3. **El Entity Engine es proyecto de meses.** Si el inversionista espera prototipo en 2 semanas, NO subestimes el alcance. Es honesto decir "Fase 1 lista en 4 semanas, fases siguientes 3-4 meses cada una."

4. **Multi-tenant data isolation con Supabase RLS.** Las nuevas tablas (`giros_terminologias`) deben tener policies de Row-Level Security para que un tenant solo vea SUS overrides, no los de otros.

### 🟢 Riesgo BAJO

5. **Performance con JSONB attributes.** Es bajo riesgo porque ya validado por Stripe/GitHub/Notion. Pero monitorear queries lentas tras migration.

---

## Recordatorios para Erick

- 🔔 **NUNCA hagas merge a main sin verificar diff primero.**
- 🔔 **NO ejecutes migrations sin backup previo.**
- 🔔 **NO subestimes el tiempo del Entity Engine.** Es lo que define si tu startup sobrevive o muere.
- 🔔 **Documentación > código** en pre-pitch. Después del pitch, código > documentación.
- 🔔 **Tu sistema ACTUAL ya funciona.** No lo arruines por agregar features apresuradamente.

---

## Archivos generados en este sprint nocturno

```
.audit/
├── INVENTARIO-ACTUAL.md           — Estado actual del sistema
├── CATALOGO-MODULOS.md            — 487 campos universales catalogados
├── TERMINOLOGIAS.json             — Diccionario por giro (30 giros + inferencia para 187)
├── ROADMAP-DEMO.md                — Qué decir al inversionista
├── PLAN-POST-PITCH.md             — Este archivo
└── migrations/
    ├── 01-extend-pos-products.sql
    ├── 02-extend-pos-customers.sql
    ├── 03-extend-pos-users.sql
    ├── 04-create-volvix-vendors-extended.sql
    ├── 05-create-giros-terminologias.sql
    ├── 06-create-pos-appointments-extended.sql
    └── 07-rollback-all.sql

docs/
└── ENTITY-ENGINE-ARCHITECTURE.md  — Diseño completo del Motor Universal
```

**Total:** 11 archivos nuevos. Cero líneas de HTML/JS de producción modificadas. Cero migraciones ejecutadas. Cero commits a main. Sistema en producción intacto.
