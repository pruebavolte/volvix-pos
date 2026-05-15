# Final Report — SalvadoreX SDD Blitz
> Ejecutado: 2026-05-15 · ~3 horas wall-clock
> Método: 20+ sub-agentes paralelos en 4 waves

---

## Resumen ejecutivo

Se documentó el sistema SalvadoreX POS en un día con máximo paralelismo.
El resultado es una **radiografía completa** del sistema: 34 contratos de screens,
9 contratos de endpoints detallados, 5 reportes de validación cruzada,
y **3 vulnerabilidades de seguridad críticas** detectadas.

---

## Lo creado hoy

### Scanner v2 (`scripts/generate-system-map.v2.js`)
- 5 parches aplicados: botón→handler, screen→endpoint, roles, realtime, window vars
- Mapa enriquecido: **144 nodos · 220 relaciones** (antes: 155 relaciones)
- Tamaño: 158.7 KB (antes: 78 KB)
- Todas las 29 screens tienen bloque HTML `<section id="screen-X">` detectado ✅

### Schema-truth (`spec/schema-truth.md`)
- ~200 tablas únicas identificadas por análisis estático
- 11 grupos de duplicación semántica detectados
- Método: grep de `supabaseRequest()` REST paths (el backend NO usa Supabase JS SDK)

### Contratos de screens
| Tier | Count | Archivos |
|------|-------|---------|
| Tier 1 — Detallado | 5 | pos, corte, inventario, clientes, ventas |
| Tier 2 — Stub | 24 | actualizador…usuarios (todos los demás screens) |
| PDC tabs — Stub | 5 | audit, feats, hierarchy, mods, users |
| **Total** | **34** | |

### Contratos de endpoints
| Tipo | Count |
|------|-------|
| Tier 1 compartidos (POS+PDC) | 8 |
| Stubs POS exclusivos | 20 |
| Sin contrato | 57/86 (66%) |

### Reportes de validación (Wave 3)
- `.audit/validation-schema.md` — tablas inventadas vs huérfanas
- `.audit/validation-endpoints.md` — cobertura de endpoints
- `.audit/validation-screens.md` — cobertura de screens
- `.audit/validation-orphans.md` — huérfanos en grafo y BD
- `.audit/validation-coherence.md` — bidireccionalidad
- `.audit/wave-3-summary.md` — consolidación

---

## Métricas finales

| Métrica | Valor |
|---------|-------|
| Nodos en grafo | 144 |
| Relaciones en grafo | 220 |
| Screens documentadas (T1) | 5 / 34 (15%) |
| Screens con stub (T2) | 24 / 34 (71%) |
| Cfg-tabs sin contrato | 9 / 9 (0% cubiertos) |
| Endpoints con contrato | 9 / 86 (10%) |
| Endpoints con stub | 20 / 86 (23%) |
| Endpoints sin nada | 57 / 86 (66%) |
| Score coherencia (bidireccional) | 1 / 66 (1.5%) |
| Tablas BD con cobertura en contratos | ~3 / 31 (10%) |
| Tablas con sufijo prohibido | 1 (`product_variants_v2`) |
| Grupos de duplicación semántica | 11 |

---

## 🔴 Deudas CRÍTICAS — Atacar HOY (seguridad)

### S1 — Cross-tenant stock leak en `/api/owner/low-stock`
**Severidad**: BLOQUEANTE (-20 pts arquitectura)
**Descripción**: El endpoint no filtra por `tenant_id`. Si RLS no está activa en `pos_products`, todos los tenants ven el stock de TODOS los demás negocios.
**Fix**: Añadir filtro `WHERE tenant_id = req.user.tenant_id` en el handler. Verificar RLS en Supabase.

### S2 — JWT stale: usuarios desactivados mantienen acceso en `/api/users/me`
**Severidad**: BLOQUEANTE (-20 pts)
**Descripción**: El endpoint devuelve el payload del JWT sin verificar en DB si el usuario sigue activo. Un empleado despedido con token no expirado (JWT TTL = 24h) sigue teniendo acceso completo.
**Fix**: En `GET /api/users/me`, consultar `pos_users WHERE id = jwt.sub AND active = true`. Si no existe o no está activo → 401.

### S3 — Endpoint público sin auth expone config de cualquier tenant en `/api/app/config`
**Severidad**: CRÍTICO (-15 pts)
**Descripción**: Cualquiera puede hacer `GET /api/app/config?tenant_id=X` y obtener nombre, teléfono, configuración completa del negocio X sin autenticación.
**Fix**: Requerir JWT válido. Si el caso de uso legítimo es carga inicial pública, filtrar el response para exponer solo campos no sensibles (nombre, logo) y requerir auth para el resto.

---

## 🟡 Deudas ALTAS — Atacar esta semana

### A1 — Bug confirmado: filtro de fecha en ventas solo aplica a CSV, no a la tabla
**Evidencia**: Wave 2A screen "ventas", bug AP-V2. El filtro guarda en sessionStorage pero la tabla no se filtra visualmente.
**Fix**: Sincronizar la lógica de filtrado de tabla con la de export.

### A2 — Botón "Ver historial" en clientes sin handler
**Evidencia**: Wave 2A screen "clientes". El botón existe en el DOM pero su onclick está vacío.
**Fix**: Implementar `verHistorialCliente(clienteId)` que llama a `/api/sales?cliente_id=X`.

### A3 — Ambigüedad de tabla de ventas: `pos_sales` vs `sales` vs `volvix_ventas`
**Evidencia**: Schema-truth D2, Wave 3.4. Triple duplicación de alta severidad.
**Fix**: ADR-002 — decidir nombre canónico, migrar, deprecar las otras con alias temporales.

### A4 — Ambigüedad de tabla de tenants: 5 nombres para el mismo concepto
**Evidencia**: Schema-truth D3. `tenants` / `pos_tenants` / `volvix_tenants` / `companies` / `pos_companies`.
**Fix**: ADR-003 — nombre canónico: `pos_companies` (más mencionado en API). Migrar resto.

### A5 — Roles no normalizados: `cashier` (EN) y `cajero` (ES) coexisten
**Evidencia**: Patch 3, 7 roles detectados. Si BD estandariza uno, la mitad de los branches JS quedan muertos.
**Fix**: Centralizar en `const ROLES = { CASHIER: 'cashier', ... }` importado desde config. Estandarizar en BD.

### A6 — Score coherencia: 1.5% (1/66)
**Evidencia**: Wave 3.5. Casi ningún contrato de endpoint menciona qué screens lo consumen.
**Fix**: Al documentar nuevos contratos de endpoint, siempre rellenar la sección "Consumidores".

### A7 — 9 cfg-tabs sin ningún contrato
**Evidencia**: Wave 3.3. `general`, `negocio`, `equipo`, `impuestos`, `impresion`, `modulos`, `licencia`, `sync`, `pwa`, `vista` sin spec.
**Fix**: Wave 2B siguiente iteración enfocada en cfg-tabs.

### A8 — 15 tablas "inventadas" en contratos (no en schema-truth)
**Evidencia**: Wave 3.1. Algunas pueden ser reales pero sin migración documentada.
**Fix**: Verificar en Supabase dashboard cuáles existen. Las que no → corregir contrato. Las que sí → actualizar schema-truth.

### A9 — Guard de rol faltante en UI de "reabrir corte"
**Evidencia**: Wave 2A screen "corte". El botón de reabrir corte no verifica rol en UI (solo en backend).
**Fix**: Añadir verificación `if (session.role !== 'admin') btn.hidden = true`.

### A10 — Endpoints críticos sin contrato: `/api/login`, `/api/payments/*`
**Evidencia**: Wave 3.2. 57 endpoints sin contrato incluyendo login y pagos.
**Fix**: Priorizar Wave 2C siguiente iteración con estos endpoints.

---

## 🟢 Deudas BAJAS — Backlog técnico

- `product_variants_v2` — sufijo prohibido, renombrar
- 2 BroadcastChannels — verificar que llaman `.close()` al desmontar
- `window.CART`, `window.IMPERSONATING`, `window.fetch` — state global de riesgo, encapsular
- 11 grupos de duplicación semántica en tablas (D2-D11 en schema-truth)
- 7+ queries sin caché en `/api/app/config` (cada carga del POS hace N queries)
- Screen `mapa`, `rentas`, `reservaciones`, `quickpos` — endpoints asignados por heurística, no por bloque HTML (posible solapamiento)

---

## Próximos pasos — Mañana y esta semana

### Prioridad 1 (seguridad — hoy/mañana)
1. Fixear S1: `/api/owner/low-stock` + verificar RLS en `pos_products`
2. Fixear S2: `/api/users/me` + verificación DB
3. Fixear S3: `/api/app/config` + auth requerido

### Prioridad 2 (bugs visibles — esta semana)
4. Fix A1: filtro fecha en ventas
5. Fix A2: botón "Ver historial" en clientes
6. Fix A9: guard de rol en UI de corte

### Prioridad 3 (deuda técnica — próxima iteración del blitz)
7. ADR-002: nombre canónico para tabla de ventas
8. ADR-003: nombre canónico para tabla de tenants
9. Normalizar roles (`cashier` = `cajero`)
10. Blitz siguiente: llenar cfg-tabs + endpoints críticos sin contrato

---

## Cómo correr el blitz de nuevo (mañana)

```bash
# Regenerar mapa (corre después de cambios)
node scripts/generate-system-map.v2.js

# Ver reporte de deudas
cat .audit/final-report.md

# Ver mapa interactivo
start public/volvix-system-map-v2.html

# Para siguiente iteración: promote Tier 2 → Tier 1
# Prioridad: corte, inventario (bugs detectados), cfg-tabs, endpoints de pago
```

---

## Archivos del blitz

```
.blitz/status-board.md          ← estado general
.blitz/status/*.md              ← estado por sub-agente
.specify/contracts/screens/*.spec.md    ← 34 contratos
.specify/contracts/endpoints/*.spec.md  ← 9 contratos + _stubs-pos.md
.specify/schema-truth.md        ← ~200 tablas detectadas
.audit/validation-*.md          ← 5 reportes de validación
.audit/wave-3-summary.md        ← consolidación validadores
.audit/final-report.md          ← este archivo
public/system-map.json          ← mapa v2 (158.7 KB)
scripts/generate-system-map.v2.js  ← scanner v2 con 5 patches
scripts/_patches/patch-*.diff.js   ← patches individuales (backup)
```

---

> Generado por el orquestador del Blitz SDD 2026-05-15
> Sub-agentes lanzados: ~20 | Waves completadas: 4/4 ✅
