# FAQ — Preguntas frecuentes de clientes

## 1. ¿Funciona sin internet?

**Respuesta honesta:** No completamente. El sistema requiere conexión a internet para vender. Si se cae la conexión 5–10 minutos, puedes seguir registrando en el POS y se sincroniza al regresar (PWA con service worker). Pero si la conexión cae 1+ hora, no podrás procesar ventas nuevas.

**Roadmap:** modo offline-first completo está planeado para Q3-2026.

## 2. ¿Genera CFDI / factura electrónica?

**Respuesta honesta:** Todavía no de forma nativa. El sistema genera ticket interno con folio, pero NO emite CFDI 4.0 con timbrado de PAC.

**Workaround actual:** exportas las ventas a Excel/CSV y tu contador las pasa a su sistema de facturación.

**Roadmap:** integración con PAC certificado (Facturama, SW Sapien, Solución Factible) en Q2-2026 para los clientes que la necesiten.

## 3. ¿Cuánto cuesta al mes?

| Plan | Precio | Para quién |
|---|---|---|
| Básico | $399 MXN/mes | 1 sucursal, 1 cajero, hasta 100 productos |
| Pro | $899 MXN/mes | 3 sucursales, 5 cajeros, hasta 1000 productos |
| Enterprise | $1,499 MXN/mes | Ilimitado |

**Piloto:** 90 días gratis para los primeros 5 clientes. Sin compromiso de pago al terminar.

## 4. ¿Puedo cancelar cuando quiera?

**Sí.** No hay contrato a término. Cancelas con 30 días de aviso (suficiente para que migres tus datos a otra plataforma). Tus datos se exportan en CSV antes de cerrar la cuenta.

## 5. ¿Mis datos son seguros?

**Sí.** Tres puntos concretos:
- **Aislamiento entre clientes verificado**: cada negocio solo ve sus propios datos, probado con auditoría externa (commit `d657cb2` documenta la verificación)
- **Captcha real anti-bots** en el registro: protege contra ataques automatizados
- **2FA con códigos de recuperación** en el panel de administración: protege contra robo de credenciales

**Lo que NO tenemos:** pentest externo certificado (planeado para cuando haya volumen de clientes pagando) y compliance SAT (requiere contador certificado, planeado igual).

## 6. ¿Funciona con mi báscula / impresora térmica / lector de código de barras?

**Lectores de código de barras USB:** sí, funcionan como teclado, plug-and-play.

**Impresora térmica USB/Bluetooth:**
- ESC/POS estándar: sí, funciona vía Web USB (Chrome) o Web Bluetooth
- Modelos probados: Epson TM-T20, Star TSP100, Bematech MP-4200
- Otros modelos: probablemente sí, pero requieren prueba previa

**Báscula:**
- Si tu báscula tiene salida USB con protocolo serial estándar: sí
- Si es báscula propietaria de algún sistema cerrado: no garantizado

## 7. ¿Tienen app móvil?

**Respuesta honesta:** El POS funciona en navegador móvil (PWA instalable como app). Hay también una APK Android disponible. La experiencia es la misma que en navegador.

**App nativa iOS:** todavía no, planeada para Q4-2026.

## 8. ¿Puedo migrar mis datos del sistema actual?

**Respuesta honesta:** Sí, pero manualmente vía importación CSV. Te damos plantillas para que vacíes tus productos y clientes en el formato correcto, y las subes desde el panel.

**Migración automatizada desde sistemas comunes (Soft Restaurant, etc.):** planeada cuando haya 3+ clientes pidiéndolo.

## 9. ¿Cuántos cajeros puedo tener?

Depende del plan:
- Básico: 1 cajero
- Pro: 5 cajeros (con permisos diferenciados: ver ventas, no ver costos)
- Enterprise: ilimitados

## 10. ¿Soporta restaurante con cocina/comandas?

**Respuesta honesta:** Soporta comandas a impresora de cocina (módulo activable) pero no el flujo completo de mesa→cocina→mesero→cuenta. Eso está en roadmap para Q3-2026.

Para restaurantes simples (café, taquería, comida rápida) funciona bien. Para restaurantes de mesa con flujo complejo, todavía no es la mejor opción.

## 11. ¿Qué pasa si el sistema se cae?

- **Uptime histórico:** 99.5%+ desde lanzamiento
- **Status público:** consultable en cualquier momento
- **Soporte de emergencia:** WhatsApp 24/7 para clientes Pro y Enterprise
- **Backup automático:** ventas e inventario se respaldan automáticamente en Supabase + replicación

## 12. ¿Quién está detrás?

**GrupoVolvix** — empresa mexicana en Monterrey, NL. Asociada a CAINTRA y COPARMEX.

Equipo: dueño + equipo técnico. NO somos startup con inversión de fondo gringo. Somos empresa local que quiere atender comercios mexicanos con software hecho aquí.

## 13. ¿Tienen referencias de clientes?

**Respuesta honesta:** Estamos arrancando con los primeros 5 pilotos. Si te conviertes en uno de ellos, tu testimonio (anonimizable si prefieres) ayuda a los siguientes. A cambio recibes 90 días gratis.

## 14. ¿Cómo me dan soporte?

| Plan | Canal | SLA respuesta |
|---|---|---|
| Básico | Email | 24 horas hábiles |
| Pro | WhatsApp + Email | 4 horas hábiles |
| Enterprise | WhatsApp directo + Email + ocasional video | 1 hora hábil |

## 15. ¿Y si mi negocio crece, el sistema crece conmigo?

Sí. Puedes upgrade de plan en cualquier momento sin perder datos. Si pasas de 1 a 3 sucursales: subes a Pro y se habilita el módulo multi-sucursal automáticamente.
