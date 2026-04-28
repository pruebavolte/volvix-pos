# SLA - Service Level Agreement

Volvix POS se compromete a tiempos de respuesta y resolucion segun el plan contratado y la severidad del incidente.

## Tiempos de respuesta por plan

| Plan | Costo | Primera respuesta | Canales | Idiomas | Disponibilidad |
|------|-------|-------------------|---------|---------|----------------|
| **Starter** | Gratis | 48 horas habiles | KB self-service + email | ES | L-V 9-18 GMT-6 |
| **Pro** | $29 USD/mes | 24 horas habiles | Chat + email + KB | ES, EN | L-V 9-18 GMT-6 |
| **Enterprise** | $499 USD/mes | 1 hora | Chat + email + telefono + CSM dedicado | ES, EN, PT | 24/7/365 |

## Severidad de incidentes

### P0 - Critico (sistema caido)

**Definicion**: imposible cobrar, panel inaccesible, datos perdidos, brecha de seguridad.

| Plan | Respuesta inicial | Resolucion objetivo |
|------|-------------------|---------------------|
| Starter | 4 horas | Best effort |
| Pro | 1 hora | 4 horas |
| Enterprise | 15 minutos | 1 hora |

Notificacion proactiva: si Volvix detecta caida masiva, todos los clientes reciben email/SMS antes de notar.

### P1 - Alta (feature critica falla)

**Definicion**: cierre Z falla, CFDI no timbra, cobros con tarjeta caidos, login con problemas intermitentes.

| Plan | Respuesta inicial | Resolucion objetivo |
|------|-------------------|---------------------|
| Starter | 24 horas | 5 dias habiles |
| Pro | 4 horas | 24 horas |
| Enterprise | 30 minutos | 4 horas |

### P2 - Media (no critico pero molesto)

**Definicion**: reportes lentos, error visual en una pantalla, exportacion CSV con encoding raro.

| Plan | Respuesta inicial | Resolucion objetivo |
|------|-------------------|---------------------|
| Starter | 48 horas | Proximo release |
| Pro | 24 horas | 7 dias |
| Enterprise | 4 horas | 48 horas |

### P3 - Baja (mejora / pregunta)

**Definicion**: como hago X, idea de feature, mejora de UX.

| Plan | Respuesta inicial | Resolucion objetivo |
|------|-------------------|---------------------|
| Starter | 7 dias | Backlog |
| Pro | 48 horas | Backlog priorizado |
| Enterprise | 24 horas | Discusion en revision quincenal con CSM |

## SLA de uptime

| Plan | Uptime garantizado | Compensacion si falla |
|------|---------------------|------------------------|
| Starter | 99.0% | Ninguna |
| Pro | 99.5% | 1 mes gratis si baja de 99% |
| Enterprise | 99.9% | Pro-rata segun tiempo caido + multa fija |

Calculo:
- 99.0% = max 7.2 horas caido al mes
- 99.5% = max 3.6 horas
- 99.9% = max 43 minutos

Status publico: `https://status.volvix.app` con incidentes en tiempo real.

## Que NO cubre el SLA

- Caidas de proveedores externos (Stripe, SAT, PAC). Volvix avisa pero no responsabiliza.
- Mantenimiento programado anunciado con 48h.
- Uso fuera de terminos (ej. ataque DDoS desde cuenta cliente).
- Problemas de conectividad del cliente (su WiFi).
- Errores por configuracion incorrecta del cliente (ej. RFC mal capturado).

## Mecanismos de escalacion

### Si no recibo respuesta en SLA

1. Responde el ticket diciendo "ESCALAR".
2. Va al gerente de soporte (`escalation@volvix.app`).
3. Si en 4 horas no hay respuesta, contacta al CEO (`ceo@volvix.app`) - solo casos P0/P1.

### Enterprise: Customer Success Manager

- Llamada quincenal con tu CSM.
- Reuniones trimestrales con product team.
- Acceso prioritario a betas y nuevas features.

## Como reportar un incidente

### Canal preferido por severidad

| Severidad | Canal |
|-----------|-------|
| P0 / P1 | Telefono (Enterprise) o chat live (Pro/Enterprise) |
| P2 | Chat o ticket via boton `?` en app |
| P3 | KB self-service + ticket si KB no resuelve |

### Que incluir en el reporte

- **Que esperabas**: "esperaba que el cierre Z imprimiera totales".
- **Que paso**: "el PDF descargado vino vacio".
- **Pasos para reproducir**: "1) ir a Caja 2) clic Cierre Z 3) capturar $2000 efectivo 4) clic Cerrar".
- **Captura de pantalla** (boton "adjuntar screenshot" del helpdesk).
- **URL** de la pagina (lo capturamos automaticamente).
- **Plan** y **rol** (lo capturamos automaticamente).

## Indicadores de calidad publicos

- **CSAT** (Customer Satisfaction): >4.5/5 mensual.
- **First Response Time** mediana: <2 horas (todos los planes).
- **Resolution Time** P0: 95% bajo SLA.
- **MTBF** (Mean Time Between Failures): >30 dias.

Reporte mensual publicado en `https://volvix.app/transparency/`.

## Cambios al SLA

Modificaciones se anuncian con **30 dias** de aviso. Si reduces beneficios, clientes Enterprise pueden cancelar sin penalizacion.

---

**Vigencia**: 2026-04-28. Este SLA reemplaza versiones anteriores.

**Contacto**:
- Soporte: `soporte@volvix.app`
- Escalaciones: `escalation@volvix.app`
- Enterprise CSM: tu correo dedicado al firmar contrato
- Status: `https://status.volvix.app`
