# Roadmap post-production — Después de los primeros pilotos

> Lo que sigue una vez que arranquen los 2-5 clientes piloto. Ordenado por impacto.

## Trimestre actual (siguientes 30-60 días)

### 1. Refactor api/index.js → tablas pos_* (B-X-6)
- **Trabajo**: bulk replace de 28 referencias legacy + tests endpoint-por-endpoint
- **Bloqueo previo**: aplicar R37_CREATE_POS_CUSTOMERS.sql en Supabase (ya escrita)
- **Por qué**: cierra ADR-004 5/5 → score POS sube +2 puntos
- **Esfuerzo**: 3-5 horas
- **Riesgo**: medio (requiere E2E exhaustivo antes de prod)

### 2. R35 — DROP tablas legacy
- **Bloqueo previo**: refactor del punto 1 completo + E2E verde
- **Trabajo**: copiar/pegar R35 en Supabase SQL Editor
- **Por qué**: deja la DB limpia, sin tablas duplicadas
- **Esfuerzo**: 30 min después del refactor
- **Riesgo**: bajo si el refactor está completo

### 3. Suite Playwright multi-browser (B-X-7)
- **Trabajo**: tests E2E automatizados para los 10 flows críticos
- **Cobertura**: Chrome, Firefox, WebKit (Safari simulado)
- **Flows**: registro→OTP→login→POS→venta IVA+descuento+pago mixto→ticket→corte→panel→2FA→suspend
- **Por qué**: replaces uso manual + da confianza para escalar
- **Esfuerzo**: 4-6 horas iniciales + mantenimiento continuo
- **Riesgo**: bajo (no toca producción, solo tests)

## Trimestre +1 (60-120 días)

### 4. UI completa del Tab Seguridad en panel
- 2FA setup interactivo (escanear QR, validar primer código, ver recovery codes)
- IP allowlist editable (agregar/quitar IPs, validar formato CIDR)
- Audit log de impersonation visible al super-admin
- Sessions activas con botón "revocar todas"
- **Por qué**: cierra promesas hechas en el panel (códigos ya existen en backend)
- **Esfuerzo**: 2-3 horas
- **Riesgo**: bajo

### 5. Tab Pilotos completo en panel
- Lista de tenants con `is_pilot=true` (R38 ya tiene la tabla)
- Stats por piloto: días activos, total ventas, última venta, feedback count
- Feedback recibido con filtros por severidad y resuelto/pendiente
- Botón "marcar como cliente pagando" que setea `pilot_converted_at`
- **Por qué**: medir conversión de piloto → cliente real
- **Esfuerzo**: 2-3 horas
- **Riesgo**: bajo

### 6. Load testing con k6
- 100 → 500 → 1000 → 2000 usuarios concurrentes
- Identificar bottlenecks (Supabase pooler, Vercel, etc.)
- Definir capacidad real del sistema
- **Por qué**: saber a qué escala vender sin riesgo
- **Esfuerzo**: 2-3 horas

## Trimestre +2 (120-180 días, después de tener 5+ clientes pagando)

### 7. Pentest externo
- Contratar consultor de seguridad independiente
- Auditoría de: cross-tenant, OWASP Top 10, JWT, captcha bypass attempts, etc.
- **Costo estimado**: $20-40k MXN
- **Por qué**: validar el aislamiento técnico ante un atacante real
- **Riesgo de no hacerlo**: cero ahora, alto cuando vendamos a empresas medianas

### 8. CFDI 4.0 / facturación electrónica
- Integración con PAC certificado (Facturama / SW Sapien / Solución Factible)
- Tab "Facturas" en panel del dueño
- Generación de XML + timbrado + email al cliente
- Cancelación de facturas
- **Por qué**: requisito legal para muchos clientes
- **Esfuerzo**: 8-12 horas + costo del PAC ($5-15k MXN setup + por timbre)

### 9. Compliance SAT verificado por contador
- Auditoría con contador público certificado
- Revisión de IVA, IEPS, retenciones, régimen fiscal
- Certificado de cumplimiento para mostrar a clientes
- **Costo estimado**: $5-15k MXN

## Trimestre +3 (post 6 meses, escalando)

### 10. App nativa iOS
- React Native o Flutter (decidir)
- Misma UX que el PWA pero como app de la App Store
- **Por qué**: clientes Apple lo piden
- **Esfuerzo**: 40-80 horas + costo de cuenta dev Apple ($1.5k MXN/año)

### 11. Modo offline-first completo
- IndexedDB para cache de productos y ventas locales
- Sync en background cuando regrese internet
- Conflict resolution para ventas concurrentes
- **Esfuerzo**: 20-40 horas
- **Por qué**: clientes en zonas con internet inestable

### 12. Modo restaurante con mesas + cocina
- Flujo mesa → cocina → mesero → cuenta
- Estado de mesa (ocupada, esperando, cobrada)
- Impresora de cocina con comandas
- División de cuenta por persona
- **Esfuerzo**: 30-60 horas
- **Por qué**: restaurantes formales lo necesitan

## Lo que NO está en roadmap

- Multiidioma (solo español por ahora — mercado mexicano)
- Multimoneda (solo MXN — clientes mexicanos)
- Cripto (sin demanda real en PyME)
- Marketplace de plugins/extensions (overhead innecesario)

## Cómo priorizar cada trimestre

Cada trimestre revisar:
1. ¿Qué piden los pilotos / clientes pagando con más frecuencia? → priorizar
2. ¿Qué impide cerrar venta nueva? → priorizar
3. ¿Qué representa riesgo de fallo / pérdida de datos? → priorizar máxima
4. Lo demás se queda en backlog

NO trabajar features por gusto técnico si no hay demanda de cliente.
