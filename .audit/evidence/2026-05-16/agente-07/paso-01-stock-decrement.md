# AGENTE 7 — stock decrement local post-venta (parte 1)

## Bug original (B-POS-2)
salvadorex-pos.html: 0 patrones de decremento de CATALOG[].stock encontrados.
Consecuencia: stock en pantalla nunca refleja venta hasta recargar pagina.
Sobreventa posible si dos cajeros venden el mismo producto simultaneamente.

## Fix aplicado (linea ~10305)
Post-POST /api/sales exitoso (despues de __volvixResetCartToken), iterar CART.
Para cada item, encontrar en CATALOG por code/id/barcode y decrementar stock.
Tambien notificar a VolvixState.decrementProductStock para que los nuevos
consumidores (post-AGENTE 8) reciban el evento.

## Test grep

## Resultado
Matches en HTML servido: 3 (esperado: >=2)
