# Agente Wave 2C — Endpoints _INDEX (stubs masivos)

## Misión

Para los ~100 endpoints restantes (después de los detallados y los batch de 10), NO crear un archivo por cada uno. En su lugar, crear UN solo archivo índice con una línea por endpoint.

## Inputs

- `public/system-map.json` para la lista total de endpoints
- Las listas de endpoints ya documentados (de Wave 2C tasks anteriores) para EXCLUIR

## Proceso

1. Lee system-map.json y extrae TODOS los endpoint nodes (`tipo === 'endpoint'`).
2. Lee la carpeta `.specify/contracts/endpoints/` y haz lista de los archivos ya creados.
3. Para cada endpoint que NO tiene archivo propio, agrégalo al índice.

## Output

Crea `.specify/contracts/endpoints/_INDEX.md`:

```markdown
# Índice de Endpoints — SalvadoreX

> Lista completa de endpoints `/api/*` detectados. Los marcados como ✓ tienen
> contrato dedicado. Los marcados como ⚠️ son stubs en este índice (Tier 3).
>
> Generado por blitz Wave 2C · <timestamp>

## Estadísticas

- Total endpoints: <N>
- Con contrato dedicado: <N>
- En este índice (Tier 3): <N>

## Endpoints compartidos POS + PDC (8)

| Endpoint | Método | Contrato dedicado |
|----------|--------|-------------------|
| /api/admin/giros/    | <m> | ✓ [link](./GET-api-admin-giros.spec.md) |
| /api/admin/tenant/   | <m> | ✓ [link](...) |
| ... | ... | ... |

## Endpoints exclusivos POS

### Documentados (Tier 1/2)

| Endpoint | Método | Contrato |
|----------|--------|----------|
| /api/sales/create | POST | ✓ [link](...) |
| /api/products/list | GET | ✓ [link](...) |
| ... | ... | ... |

### Pendientes (Tier 3, stubs aquí)

| Endpoint | Método (detectado) | Notas inferidas |
|----------|-------------------|-----------------|
| /api/cuts/open | POST | Probable: abre corte de caja → toca `cuts` |
| /api/cuts/close | POST | Probable: cierra corte → toca `cuts` + `sales` |
| /api/inventory/adjust | POST | Probable: ajuste de stock → toca `products` |
| /api/reports/sales-summary | GET | Probable: reporte agregado de ventas |
| ...

## Endpoints exclusivos PDC

| Endpoint | Método | Notas |
|----------|--------|-------|
| /api/admin/remote-support/request | POST | Soporte remoto, probable: log |
| ... | ... | ... |

## Cómo promover un stub a contrato dedicado

Cuando un endpoint cause bugs, sea critico, o cambien sus internals:

1. Crear archivo dedicado en `.specify/contracts/endpoints/` siguiendo `ENDPOINT_TEMPLATE.md`.
2. Borrar la entrada de este _INDEX o marcarla como "✓ promovido".
3. Volver a correr el scanner.

## Próximos a promover (prioridad sugerida)

Basado en frecuencia de uso y criticidad:

1. /api/sales/create (crítico operacional)
2. /api/sales/cancel
3. /api/cuts/open + /api/cuts/close
4. /api/inventory/adjust
5. /api/customers/credit/update
6. (los siguientes según uso real)
```

## Reporte

`.blitz/status/wave-2c-index.md`:

```markdown
# Wave 2C — Endpoints _INDEX

- Estado: ✓
- Total endpoints en el sistema: N
- Documentados con archivo: N (compartidos + batch dedicados)
- Stubbed en _INDEX.md: N
- Próximos sugeridos a promover: <top 10>
- Endpoints sin método detectado: <N>
```
