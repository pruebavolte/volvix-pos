# Contrato: Screen `corte`
> TIER 1 — DETALLADO
> Wave 2A · 2026-05-15
> Fuente: análisis estático de `public/salvadorex-pos.html` (líneas 4726-4817) + `public/system-map.json` + `.specify/schema-truth.md`

---

## 1. Identidad

| Campo | Valor |
|---|---|
| ID en system-map | `screen_pos_corte` |
| `<section>` HTML | `id="screen-corte"` |
| Ruta de activación | `showScreen('corte')` desde nav-btn `btn_pos__corte` |
| Parent | `mod_pos` |
| Título visible | "Corte de caja" |
| Subtítulo dinámico | `#corte-sub` — "Cierre del turno" (actualizable) |

---

## 2. Responsabilidades

1. Mostrar el resumen financiero del turno abierto (apertura, ventas por método de pago, gastos, saldo esperado).
2. Permitir el conteo físico de billetes y monedas para calcular la discrepancia real vs. esperado.
3. Ejecutar el cierre del corte Z (`/api/cuts/close`).
4. Bloquear el cierre si hay ventas abiertas/impresas no resueltas (GAP-Z1).
5. Registrar ajustes de caja auditados (faltantes, sobrantes, errores de conteo) con aprobación owner para montos > $500 (GAP-Z2).
6. Permitir reabrir un corte Z cerrado con error, solo a owner/superadmin (GAP-Z4).
7. Mostrar historial de cortes anteriores.
8. Redirigir al screen `apertura` si no hay sesión de caja abierta.

---

## 3. UI — Árbol de elementos

```
#screen-corte
  .page-head
    h1.page-title              "Corte de caja"
    p.page-sub#corte-sub       "Cierre del turno"
    .btn-row
      #btn-cuts-history        [📜 Historial]     → abre modal/panel historial
      #btn-cuts-refresh        [🔄 Actualizar]    → recarga loadCorteScreen()

  // Estado A: Sin caja abierta
  #corte-no-session            card visible cuando cut_id = null
    button.accent → showScreen('apertura')

  // Estado B: Caja abierta (grid 2 columnas)
  #r4c-open-sales-alert        [hidden|visible] alerta amarilla GAP-Z1
    #r4c-open-sales-list       lista de ventas pendientes
    #r4c-refresh-pending       [🔄 Revisar de nuevo]

  #r4c-adjustments-bar         [hidden|visible] panel GAP-Z2
    #r4c-show-adj-form         [+ Nuevo ajuste]
    #r4c-adj-form              formulario ajuste
      #r4c-adj-type            <select> tipo (shortage|overage|cash_count_error|voided_sale_compensation)
      #r4c-adj-amount          <input number> monto (negativo = faltante)
      #r4c-adj-reason          <textarea> razón ≥10 chars
      #r4c-adj-submit          [Registrar ajuste]
      #r4c-adj-cancel
    #r4c-adj-list              lista de ajustes previos del turno

  #r4c-reopen-bar              [hidden|visible] panel GAP-Z4 (solo owner)
    #r4c-reopen-reason         <textarea> razón ≥20 chars
    #r4c-reopen-btn            [⚠ Reabrir corte Z]

  #corte-with-session          grid 2-col (hidden hasta que hay sesión)
    // Columna izquierda: Resumen del turno
    card "Resumen del turno"
      #cs-opening              Saldo apertura
      #cs-cash                 Ventas efectivo
      #cs-card                 Ventas tarjeta
      #cs-transfer             Transferencia
      #cs-credits              Abonos
      #cs-expenses             Gastos (rojo)
      #cs-expected             Efectivo esperado (azul, 18px bold) — CALCULADO
      #cs-cut-id               ID del corte
      #cs-opened-at            Fecha/hora apertura

    // Columna derecha: Conteo físico
    card "Conteo físico"
      #cnt-b500 / #cnt-b200 / #cnt-b100 / #cnt-b50 / #cnt-b20   <input number>
      #cnt-coins                Total monedas ($)
      #cnt-total               Total contado (calculado en tiempo real)
      #cnt-diff                Discrepancia = contado - esperado
      #cnt-notes               <textarea> Observaciones
      #btn-close-cut           [✓ Cerrar corte] → closeCut()
```

---

## 4. Estado (State)

| Variable | Tipo | Descripción |
|---|---|---|
| `cutId` (local) | `string \| null` | UUID del corte activo. `null` → mostrar `#corte-no-session` |
| `expected` (local) | `number` | Calculado del server `/api/cuts/{id}/summary` |
| `counted` (local) | `number` | Suma en tiempo real de los inputs de billetes + monedas |
| `discrepancy` (local) | `number` | `counted - expected` |
| `pendingSales[]` | `array` | Ventas abiertas/impresas que bloquean cierre (GAP-Z1) |
| `adjustments[]` | `array` | Ajustes registrados en este turno (GAP-Z2) |

Actualización reactiva: `updateCloseCount()` se llama en `oninput` de cada campo de billete/moneda; recalcula `#cnt-total` y `#cnt-diff` sin redraw.

---

## 5. Endpoints (todos autenticados via `_authFetch`)

| Método | URL | Cuándo |
|---|---|---|
| `POST` | `/api/cuts/open` | Al abrir apertura (no en esta screen, pero produce `cut_id`) |
| `GET` | `/api/cuts/{id}/summary` | Al entrar al screen (llena resumen financiero) |
| `GET` | `/api/cuts/{id}/check-pending` | Al entrar y al pulsar "Revisar de nuevo" — GAP-Z1 |
| `GET` | `/api/cuts/{id}/adjustments` | Al entrar — lista de ajustes GAP-Z2 |
| `POST` | `/api/cuts/{id}/adjustment` | Al registrar ajuste GAP-Z2 |
| `POST` | `/api/cuts/{id}/adjustment/{adjId}/approve` | Owner aprueba ajuste > $500 |
| `POST` | `/api/cuts/{id}/adjustment/{adjId}/reject` | Owner rechaza ajuste |
| `POST` | `/api/cuts/{id}/reopen` | Owner reabre corte Z cerrado con error — GAP-Z4 |
| `POST` | `/api/cuts/close` | Al pulsar "Cerrar corte" |
| `GET` | `/api/cuts` | Al pulsar "Historial" (con params: `date_from`, `date_to`, `cashier`) |

**Nota de deuda (D6 schema-truth):** La tabla puede ser `cuts` o `pos_cortes` — hay divergencia en la API. Verificar en Supabase cuál tiene RLS activo.

---

## 6. Flujo principal — Cerrar corte

```
1. showScreen('corte')
   └─ loadCorteScreen()
      ├─ leer cutId de _vSession() o localStorage
      ├─ si !cutId → mostrar #corte-no-session, SALIR
      ├─ GET /api/cuts/{id}/summary → llenar #cs-*
      ├─ GET /api/cuts/{id}/check-pending
      │    ├─ open_count > 0 → mostrar #r4c-open-sales-alert con lista
      │    └─ open_count === 0 → ocultar alerta
      ├─ GET /api/cuts/{id}/adjustments → renderizar #r4c-adj-list
      └─ mostrar #corte-with-session

2. Usuario completa conteo físico
   └─ oninput → updateCloseCount()
      ├─ cnt-total = Σ(billetes × denominación) + monedas
      └─ cnt-diff = total - expected (verde si >=0, rojo si <0)

3. Usuario pulsa "Cerrar corte"
   └─ closeCut()
      ├─ GUARD: si open_count > 0 → HTTP 409, mostrar lista ventas bloqueantes, SALIR
      ├─ payload: { cut_id, tenant_id, closing_balance, closing_breakdown,
      │             counted_bills, counted_coins, expected_balance,
      │             discrepancy, notes, closed_at }
      ├─ POST /api/cuts/close
      │    ├─ 409 → mostrar alerta GAP-Z1 / GAP-S3 (offline queue)
      │    ├─ 200 → imprimir ticket Z (llamar printZ()) → showScreen('apertura')
      │    └─ error → showToast error, re-habilitar botón
      └─ btn.disabled = true mientras procesa
```

---

## 7. Flujos secundarios

### 7a. Historial de cortes
- Pulsar `#btn-cuts-history` → abre panel/modal con filtros (fecha desde/hasta, cajero)
- GET `/api/cuts?date_from=...&date_to=...&cashier=...`
- Muestra tabla con: fecha, cajero, apertura, cierre, ventas totales, discrepancia

### 7b. Ajuste de caja (GAP-Z2)
- `#r4c-show-adj-form` toggle `#r4c-adj-form`
- Validaciones locales: `amount !== 0`, `reason.length >= 10`
- Si `|amount| > 500` → POST igual pero backend marca como `pending_approval` y notifica owner
- Owner ve botones Aprobar/Rechazar en `#r4c-adj-list`

### 7c. Reabrir Z (GAP-Z4)
- Solo visible si `session.role === 'OWNER' || session.role === 'SUPERADMIN'`
- Require confirm nativo + `reason.length >= 20`
- POST `/api/cuts/{id}/reopen` → corte vuelve a `status='open'`
- Mientras reabierto: botón imprimir Z deshabilitado, todas las ediciones auditadas

---

## 8. Invariantes

- **INV-C1**: `btn-close-cut` NUNCA habilitado si `open_count > 0`. El backend también valida (409).
- **INV-C2**: `discrepancy = counted - expected` — siempre calculado en cliente Y validado en server.
- **INV-C3**: Un corte solo puede cerrarse si `status === 'open'`. Backend rechaza si `status === 'closed'`.
- **INV-C4**: El `tenant_id` del payload se sobre-escribe server-side desde `req.user`. El cliente lo manda por conveniencia pero no se confía en él.
- **INV-C5**: Ajustes > $500 requieren aprobación explícita del owner antes de afectar el saldo final del corte.
- **INV-C6**: Un corte reabierto (GAP-Z4) NO permite imprimir el ticket Z hasta que sea re-cerrado.

---

## 9. Anti-patrones (prohibidos)

- NO cerrar el corte sin haber verificado ventas pendientes (`check-pending` es OBLIGATORIO).
- NO confiar en el `tenant_id` del cliente — el server re-deriva desde JWT.
- NO modificar `expected` en el cliente — es dato de solo lectura del server.
- NO mostrar `#corte-with-session` si `cutId` es null.
- NO hacer el cierre sin `btn.disabled = true` durante el request (previene doble-cierre).
- NO omitir el `closed_at: new Date().toISOString()` en el payload — es timestamp del cliente que el server puede sobreescribir pero necesita como fallback.

---

## 10. Deudas técnicas

| ID | Severidad | Descripción |
|---|---|---|
| DT-C1 | ALTA | **D6 schema-truth**: Tabla `cuts` vs `pos_cortes` — la API llama ambas. Riesgo de RLS divergente. Verificar con `supabase inspect db` cuál tiene políticas. |
| DT-C2 | MEDIA | `system-map.json` reporta `endpoints_propios: []` para `screen_pos_corte` — desactualizado. Los 9 endpoints reales no están mapeados. |
| DT-C3 | MEDIA | Impresión del ticket Z (función `printZ()`) — sin contrato propio. Depende de `/api/printer/raw` según el módulo de impresión. No hay fallback documentado si la impresora no está. |
| DT-C4 | BAJA | `#r4c-reopen-bar` visibilidad no tiene guard de rol en HTML — depende de que el JS lo muestre condicionalmente. Si JS falla, el botón queda visible para todos. |
| DT-C5 | BAJA | El historial de cortes no tiene paginación documentada en el contrato — para negocios con muchos turnos puede ser lento. |

---

## 11. Checklist R9 (listo para producción)

| # | Check | Estado |
|---|---|---|
| R9-C1 | Guard de "caja abierta" antes de renderizar resumen | PRESENTE (`#corte-no-session`) |
| R9-C2 | Bloqueo de doble-cierre (btn.disabled durante request) | PRESENTE |
| R9-C3 | Validación 409 por ventas abiertas | PRESENTE (GAP-Z1) |
| R9-C4 | Ajustes de caja con auditoría | PRESENTE (GAP-Z2) |
| R9-C5 | Reabrir Z solo owner | PRESENTE (GAP-Z4) |
| R9-C6 | tenant_id re-derivado server-side | PRESENTE (comentario SEC3) |
| R9-C7 | Tabla destino en Supabase confirmada | PENDIENTE (deuda DT-C1) |
| R9-C8 | Impresión ticket Z con fallback | PENDIENTE (deuda DT-C3) |
| R9-C9 | Guard de rol para reopen visible en UI | RIESGO (deuda DT-C4) |
