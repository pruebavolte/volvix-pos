---
slug: cfdi-error
title_es: Errores comunes al timbrar CFDI 4.0
title_en: CFDI 4.0 errors
category: facturacion
tags: [cfdi, sat, factura, mexico]
updated: 2026-04-28
---

# Errores comunes al timbrar CFDI 4.0

Volvix timbra facturas via PAC (FacturaLO, Solucion Factible, Edicom). Si ves un error, casi siempre es por dato faltante o incorrecto.

## Errores SAT mas comunes

### CFDI40118 - RFC del receptor invalido

**Causa**: el RFC tiene formato incorrecto, o no esta en la lista del SAT.

**Solucion**:
- Verifica que tenga 12 (PM) o 13 (PF) caracteres.
- Sin guiones ni espacios.
- Sube tu **constancia de situacion fiscal** del cliente para auto-validar.

### CFDI40137 - Codigo postal del receptor

**Causa**: CP no coincide con el RFC en padron SAT.

**Solucion**: pide al cliente su **constancia de situacion fiscal** y copia el CP de ahi (no el de domicilio actual).

### CFDI40158 - Regimen fiscal del receptor

**Causa**: el regimen no aplica para el RFC capturado.

**Solucion**: tipos comunes:
- **601**: Persona moral general.
- **612**: Personas fisicas con actividad empresarial.
- **616**: Sin obligaciones fiscales (publico general).
- Si es publico general, usa RFC `XAXX010101000` y regimen `616`.

### CFDI40169 - Uso de CFDI

**Causa**: el uso no coincide con regimen.

**Solucion**: usos validos por regimen estan en **Configuracion > CFDI > Tabla SAT**.

### NomEmis - Razon social del emisor

**Causa**: la razon social en Volvix no coincide con tu CSD.

**Solucion**: **Configuracion > Datos fiscales** y copia la razon social **exactamente** como aparece en tu certificado SAT (con o sin "S.A. de C.V.").

## Errores tecnicos

| Error | Causa | Solucion |
|-------|-------|----------|
| `Timeout PAC` | El servicio del PAC esta caido | Espera 5 min y reintenta |
| `CSD vencido` | Tu certificado expiro | Renueva en SAT > Tramites |
| `Saldo insuficiente` | Folios agotados | Compra paquete en **Configuracion > Folios CFDI** |
| `XML invalido` | Caracter especial en concepto | Quita acentos en descripcion del producto |

## Cancelacion de CFDI

1. **Facturas > [folio] > Cancelar**.
2. Elige motivo:
   - **01**: Comprobante con errores.
   - **02**: Comprobante con errores sin relacion.
   - **03**: No se llevo a cabo la operacion.
   - **04**: Operacion nominativa relacionada en factura global.
3. Si es **01**, escribe folio fiscal sustituto.
4. Confirma.

> Cancelacion necesita aceptacion del receptor (Plazo SAT: 72 horas auto-aceptacion).

## Soporte

Si el error persiste, abre el chat (`?` esquina inferior) con:
- Folio del intento de timbrado
- Codigo de error exacto
- Captura de pantalla
