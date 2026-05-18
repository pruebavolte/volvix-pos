# ROADMAP para el Pitch — Qué decir al inversionista

**Fecha del pitch:** mañana
**Versión actual producción:** 1.0.360 (estable, sin tocar)
**Audiencia esperada:** inversionistas / VCs / advisors

---

## La narrativa de 3 minutos

> "Volvix es el primer POS multi-giro SaaS de México que **funciona el día 1** para 217 giros distintos sin que el dueño del negocio configure nada. Detecta automáticamente si eres barbería, dental, taquería o renta de inflables, y muestra la interfaz, los términos y los módulos correctos."

### Tres pruebas tangibles que puedes mostrar en vivo

1. **Marketplace selecciona giro** — abre `https://systeminternational.app`, escribe "sabanas" o "antro" o cualquier giro raro, demuestra que cada uno llega a una landing premium relevante con su identidad propia (paleta, nombre de marca, copy específico del oficio).

2. **POS funcional** — abre `salvadorex-pos.html`, registra una venta real, demuestra el flujo completo: agregar productos, cobrar, imprimir ticket, abrir caja.

3. **Panel de control** — abre `paneldecontrol.html`, demuestra que puedes activar/desactivar módulos por giro.

---

## La sección "Visión y roadmap" del pitch

> "Hoy tenemos 217 marcas premium en marketplace y un núcleo POS funcional. **Ya catalogamos 487 campos posibles por giro** (te los enseño en `CATALOGO-MODULOS.md`) y diseñamos el **Motor Universal de Entidades Operativas** que nos permite escalar a cualquier giro del SCIAN/INEGI sin reescribir código (te lo enseño en `docs/ENTITY-ENGINE-ARCHITECTURE.md`)."

> "Lo que NO está construido aún:
> - El renderer schema-driven de los 487 campos (fase 1 del Entity Engine, 4 semanas)
> - 70 módulos especializados (rentas, citas, expedientes médicos, BOM industrial, IoT, etc., 8-12 meses)
> - Integraciones marketplace (Amazon, MercadoLibre, Shopify)
> - IA predictiva (demanda, merma, precio dinámico)
> - Blockchain/NFT
>
> Esto es exactamente lo que pedimos $X para construir en los próximos 12 meses."

---

## La pregunta clave que te van a hacer

**"¿Por qué creen que pueden competir con Odoo, Shopify, Toast, Square que tienen $100M+ invertidos?"**

Respuesta sugerida:

> "Porque nuestra ventaja NO es features — es **adaptabilidad por giro mexicano**. Odoo es genérico y requiere consultoría de $50,000 USD para customizarlo a un giro específico. Shopify es solo ecommerce. Toast es solo restaurantes. Square es solo retail simple.
>
> Nosotros tenemos **217 'preset' de giros mexicanos pre-configurados**, mapeados al SCIAN del INEGI, con terminologías locales (no traducciones), aliases regionales (tiendita/abarrotes/depósito), y módulos pre-armados. El barbero entra al sistema y ya tiene "cliente / barbero / corte / comisión" en vez de "customer / employee / sale / commission".
>
> No competimos con feature set. Competimos con **tiempo a valor**: ellos requieren 3 meses de implementación; nosotros 5 minutos."

---

## Métricas que SÍ puedes citar (verificadas en producción)

| Métrica | Valor | Fuente |
|---|---|---|
| Giros premium activos en marketplace | **217** | brands.config.js (verificable) |
| Giros mexicanos cubiertos (incluyendo aliases) | **>1,000** | volvix-brand-router.js (verificable) |
| Validación con navegación real | **966 giros en 27 min** | .audit/REPORTE-FINAL-PERFECCIONISTA |
| % giros aterrizan en landing premium relevante | **100%** | Mismo reporte |
| Bugs críticos detectados y arreglados en este sprint | **3** (papelería/colegio, sabanas, antro/librería) | Git log V8.4→V8.9 |
| Versión actual en producción | **1.0.360** | systeminternational.app/version.json |
| Tablas Supabase del backend | **62** | Inventario INVENTARIO-ACTUAL.md |
| Campos catalogados para roadmap | **487** | CATALOGO-MODULOS.md |
| Países cubiertos | **1 (MX)** — diseño multi-país listo | docs/ENTITY-ENGINE-ARCHITECTURE.md §10 |

---

## Cosas que NO debes decir

❌ "Ya tenemos todos los 487 campos implementados" — NO los tenemos. Están catalogados, las migraciones SQL están listas pero NO ejecutadas, el motor schema-driven NO existe aún.

❌ "Compite con Odoo en features" — falso. Compite en tiempo a valor + foco mexicano.

❌ "Ya integramos Amazon/ML/Shopify" — solo está en el roadmap.

❌ "Tenemos IA en producción" — sí hay un AI classifier en el marketplace, pero NO predictivo. Solo clasificación de queries.

❌ "Está listo para enterprise" — está listo para SMB mexicano. Enterprise requiere SSO, audit logs avanzados, multi-país fiscal, todos en roadmap.

---

## Si te preguntan por el código abierto del competidor (Loyverse, Vendo)

> "Loyverse y Vendo son POS genéricos sin foco vertical. **No tienen marcas premium por giro**, no tienen terminologías locales, no tienen catálogo SCIAN. Nuestro diferenciador es la **especialización masiva** por giro mexicano."

---

## El asks (lo que pides)

> "$X USD para 12-18 meses:
>
> - 4 meses: Fase 1 del Entity Engine (schema renderer + 10 módulos core) — 2 senior devs
> - 4 meses: Fase 2 (vertical specialization: 30 giros con flujos especializados) — 2 devs + 1 designer
> - 4 meses: Fase 3 (integraciones marketplace + IA predictiva + multi-país) — 1 senior + 1 ML + 1 product
> - GTM México: $X en marketing + ventas para llegar a 1,000 clientes pagando
> - Reserva operativa: $X para 6 meses post-funding"

---

## Cierre

> "Volvix es a México lo que Toast es a Estados Unidos, Lightspeed a Canadá, y Square a SMB global — pero hecho desde adentro, hablado en mexicano, mapeado al SCIAN, y construido para 217 giros desde el día 1, no para 1 con consultoría a $50K USD.
>
> **El piso lo construimos. La superficie es lo que pedimos financiar.**"

---

## Material de apoyo que tienes listo

| Documento | Para qué sirve en el pitch |
|---|---|
| `.audit/INVENTARIO-ACTUAL.md` | Para mostrar que conoces tu sistema al detalle |
| `.audit/CATALOGO-MODULOS.md` | Visión de futuro: "estos son los 487 campos que vamos a construir" |
| `.audit/TERMINOLOGIAS.json` | "Hablamos mexicano por giro, no traducciones" |
| `.audit/migrations/*.sql` | "Las migraciones SQL están listas, no es vaporware" |
| `docs/ENTITY-ENGINE-ARCHITECTURE.md` | Arquitectura completa con stack, roadmap, fases |
| `.audit/REPORTE-FINAL-PERFECCIONISTA-2026-05-18.md` | Métricas reales de validación masiva |

---

**Recordatorio crítico:** la versión actual de producción NO ha sido modificada. main = 1.0.360 estable. Todo el trabajo de esta noche está en branch `feature/ampliacion-modulos` SIN mergear. La demo en vivo usa el sistema actual, que funciona.
