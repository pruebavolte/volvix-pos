# ADR-002: Migrar `SALES` y `CUSTOMERS` de arrays posicionales a arrays de objetos

**Status**: Propuesto
**Fecha**: 2026-05-15

---

## Contexto

Los arrays globales `SALES` y `CUSTOMERS` en `salvadorex-pos.html` son arrays-de-arrays posicionales:

```js
SALES.push(['#000001', '2026-05-15...', 'Juan', 'Admin', 'Efectivo', 250.00, 'completed']);
CUSTOMERS.push(['Juan Pérez', '+5215512345001', 1000, 0, 30, '2026-05-10']);
```

Los consumidores (`renderVentas`, `renderClientes`, `r10aShowSaleDetail`, etc.) acceden por **índice**:
```js
const chip = s[6]==='completed' ? 'ok' : 'warn';  // ¿qué es s[6]?
const phone = c[1];                                // ¿qué es c[1]?
```

**Anti-patrones detectados**:
- AP-V3 / DT-V4 — `SALES` posicional frágil — `ventas.spec.md`
- AP-C4 / DT-C3 — `CUSTOMERS` posicional frágil — `clientes.spec.md`

**Síntoma real**: cuando alguien agrega un campo nuevo al backend (ej. `s.tip`), si lo inserta en posición 5 todos los consumidores que leen `s[5]` rompen sin error explícito. Si el backend cambia el orden de campos en `mapeo`, idem.

## Alternativas consideradas

### A. Cambiar a objetos `{folio, fecha, cliente, ...}` (ideal pero invasivo)
Toca ~30 sitios en `salvadorex-pos.html` donde se accede `s[0..6]`.
**Riesgo**: alto. Cualquier sitio que olvidemos migrar romperá silenciosamente.

### B. Mantener arrays posicionales pero exponer accessors (Proxy/getter)
```js
const sale = SALES[i];
sale.folio   // === sale[0]
sale.fecha   // === sale[1]
```
**Pros**: backward compatible.
**Contras**: difícil debug, magia oculta.

### C. **Híbrido: arrays de objetos con _legacy proxy** (recomendado)
Push como objeto pero con índices numéricos también poblados:
```js
function _saleTuple(s) {
  const obj = {
    folio: '#' + (s.folio || s.id || '').toString().padStart(6, '0'),
    fecha: s.created_at || '',
    cliente: s.customer_name || 'Público general',
    cajero: s.cashier || '',
    pago: s.payment_method || 'Efectivo',
    total: Number(s.total || 0),
    estado: s.status || 'completed'
  };
  // Backward compat — los consumidores legacy siguen funcionando.
  obj[0] = obj.folio; obj[1] = obj.fecha; obj[2] = obj.cliente;
  obj[3] = obj.cajero; obj[4] = obj.pago; obj[5] = obj.total; obj[6] = obj.estado;
  return obj;
}
SALES.push(_saleTuple(s));
```

**Pros**: zero breaking changes. `s[6]` sigue funcionando, `s.estado` también. Permite migración gradual.

**Contras**: técnicamente cada objeto pesa el doble, pero es despreciable.

## Decisión

**Opción C — híbrido**.

### Plan de migración (1 fase, 2h)

1. Crear helpers `_saleTuple()` y `_customerTuple()` en `salvadorex-pos.html`.
2. Reemplazar TODOS los `SALES.push([...])` con `SALES.push(_saleTuple(s))` (4 sitios).
3. Reemplazar TODOS los `CUSTOMERS.push([...])` con `CUSTOMERS.push(_customerTuple(c))` (3 sitios).
4. Reescribir `renderVentas()` y `renderClientes()` para usar `s.folio`, `c.nombre`, etc. en lugar de índices (los índices siguen funcionando como fallback).
5. Test E2E.

## Consecuencias

### Más fácil
- Leer código: `s.cliente` es explícito; `s[2]` no lo es.
- Agregar campos nuevos: solo en el helper, sin cambiar consumidores.
- IDE autocomplete: `s.` muestra todas las propiedades.

### Más difícil
- Nada significativo (objetos con índices funcionan idénticamente).

### Riesgo
Nulo — backward compat total.

## Métricas de éxito
- ✅ `renderVentas` y `renderClientes` usan `s.folio`/`c.nombre` (no índices).
- ✅ `r10aShowSaleDetail` y `verHistorialCliente` usan propiedades nombradas.
- ✅ Test E2E pasa.
