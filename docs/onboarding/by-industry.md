# SalvadoreX — Onboarding por Industria (Top 10 Giros)

> Guía rápida del Customer Success: qué activar, qué cargar primero, y cómo hacer la PRIMERA venta exitosa por giro.
> Versión 2026-04-28.

---

## TABLA MAESTRA

| # | Giro | Módulos esenciales | Módulos opcionales | Tutorial first sale |
|---|---|---|---|---|
| 1 | **Cafetería** | POS, Inv, Cortes Z, Customers | Promos, Loyalty | Espresso → cobrar tarjeta |
| 2 | **Restaurante** | POS, KDS, Mesas, Inv, MultiPOS | Reservas, Loyalty | Tomar comanda mesa 5 → enviar cocina |
| 3 | **Boutique ropa** | POS, Inv, Cortes Z, Etiquetas | Loyalty, Promos | Vestido + descuento → cobrar tarjeta |
| 4 | **Farmacia** | POS, Inv (lotes/caducidad), CFDI | Customers RFC | Paracetamol con CFDI auto |
| 5 | **Abarrotes** | POS, Inv, Cortes Z | Promos, Customers crédito | Combo cliente fiado |
| 6 | **Gimnasio** | POS, Customers, Memberships | Loyalty, Reservas | Inscribir socio mensualidad |
| 7 | **Salón belleza** | POS, Servicios, Reservas | Customers, Memberships | Corte + tinte → cobrar |
| 8 | **Vendedor móvil** | POS PWA Offline, Inv simple | — | Venta offline → sync |
| 9 | **E-commerce** | Catálogo, CFDI, Inv | Shopify integ, Stripe | Orden online → CFDI auto |
| 10 | **Coworking** | Memberships, Reservas espacios | Reportes uso, CFDI | Hot desk día → cobrar |

---

## 1. CAFETERÍA

### Módulos a activar

```
[x] POS                  - cobrar
[x] Inventario           - control granos, leche, vasos
[x] Cortes Z             - cierre día firmado
[x] Customers            - clientes frecuentes
[x] Promociones          - happy hour 7-9am
[x] Loyalty              - tarjeta puntos (10 cafés = 1 gratis)
[ ] KDS                  - opcional si tienes 2+ baristas
[ ] Multi-Pos            - opcional si tienes 2+ cajas
[ ] CFDI                 - opcional, mayoría no factura
```

### Productos a cargar primero (top 15 cafetería típica)

```
Bebidas calientes:
- Espresso $25
- Americano $30
- Capuccino $40
- Latte $45
- Mocha $50
- Chai latte $50

Bebidas frías:
- Iced coffee $40
- Frappé $55
- Smoothie frutas $60

Panadería:
- Croissant $25
- Concha $20
- Empanada $30
- Sandwich $65

Otros:
- Agua embotellada $20
- Jugo natural $40
```

### Tutorial first sale (3 minutos)

```
Cliente entra al POS. Sigues:
1. Click "Nueva venta"
2. Click "Espresso" → carrito
3. Click "Croissant" → carrito
4. Total: $50. Click "Cobrar"
5. Selecciona "Tarjeta" → modal Stripe
6. Tap tarjeta en lector (o sandbox 4242 4242 4242 4242)
7. Aprueba → ticket imprime
8. ¡Listo! Tu primera venta real.
```

### Configuración recomendada

- **Ticket template**: 80mm con logo + redes sociales.
- **Promociones default**: 2x1 lunes-miércoles 7-9am.
- **Loyalty**: 10 puntos = 1 café gratis (auto-aplica al 10mo).
- **Categorías**: Bebidas calientes, frías, panadería, otros.

### Errores típicos primer día

- "Olvidé descontar leche del inventario" → activar auto-descuento por receta.
- "Cliente quiere descuento que no existe" → crear promo "10% empleados".

---

## 2. RESTAURANTE

### Módulos a activar

```
[x] POS                  - cobrar
[x] KDS                  - cocina ve órdenes
[x] Mesas                - mapa salón
[x] MultiPOS             - meseros simultáneos
[x] Inventario           - ingredientes
[x] Cortes Z             - cierre
[x] Reportes             - top platillos
[ ] Reservas             - opcional
[ ] CFDI                 - si factura
[ ] Loyalty              - clientes regulares
```

### Productos a cargar primero (menú típico mexicano)

```
Entradas:
- Guacamole $90
- Sopa azteca $80
- Ensalada César $110

Platos fuertes:
- Tacos al pastor (3pz) $120
- Enchiladas verdes $140
- Mole poblano $160
- Chiles en nogada $220 (temporada)

Bebidas:
- Agua fresca $40
- Refresco $35
- Cerveza $55
- Margarita $90

Postres:
- Flan $60
- Tres leches $70
```

### Tutorial first sale (5 minutos)

```
1. Mesero abre POS en su celular
2. Click "Mesa 5" en mapa salón
3. Agregar:
   - 2 Tacos al pastor
   - 1 Margarita
   - 1 Agua fresca
4. Modificadores: "Sin cebolla" en tacos
5. Click "Enviar a cocina"
6. ✓ KDS recibe orden, cocinero ve en pantalla
7. Cocinero hace tap "Listo" cuando termine
8. Mesero recibe notificación, lleva a mesa
9. Cliente pide cuenta → mesero "Cobrar Mesa 5"
10. Selecciona método pago, divide cuenta si pide
11. Cobro + propina + ticket
```

### Configuración recomendada

- **Mesas**: numerar visible + zonas.
- **KDS**: 1 pantalla cocina + 1 barra (si separas).
- **Modificadores**: por platillo (sin algo, extra algo, término).
- **Propina**: sugerir 10/15/18% en pantalla cobro.
- **División cuenta**: activar para grupos.

---

## 3. BOUTIQUE DE ROPA

### Módulos a activar

```
[x] POS                  - cobrar
[x] Inventario           - tallas, colores, stock
[x] Etiquetas            - barcode + precio
[x] Cortes Z
[x] Loyalty              - clientes vip
[x] Promociones          - 2x1, descuentos
[ ] CFDI                 - opcional
[ ] Multi-sucursal       - si tiene varias
```

### Productos a cargar primero

```
Por categoría con variantes (talla + color):

Vestidos:
- Vestido floreado (XS, S, M, L, XL) x (rojo, azul, verde) = 15 SKUs
- Vestido corto noche (S, M, L) x (negro, dorado) = 6 SKUs

Blusas:
- Blusa lino (XS-XL) x (blanco, beige, rosa) = 15 SKUs
- Blusa estampada (S-L) = 3 SKUs

Pantalones, faldas, shorts...
```

### Tutorial first sale

```
1. POS → escanear código barras del vestido
2. Sistema reconoce: "Vestido floreado talla M rojo $890"
3. Cliente quiere también blusa → escanear
4. Aplica promo automático "2 prendas = 10% off"
5. Total $1,500 - 10% = $1,350
6. Cobrar tarjeta
7. Imprimir ticket + entregar bolsa con etiqueta
```

### Configuración recomendada

- **Etiquetas**: imprimir lote al recibir mercancía.
- **Variantes**: matriz talla × color por producto.
- **Inventario**: alertar cuando stock < 3 unidades por variante.
- **Loyalty**: $5,000 acumulados = 15% off siguiente compra.

---

## 4. FARMACIA

### Módulos a activar

```
[x] POS
[x] Inventario + LOTES + CADUCIDAD
[x] CFDI                 - obligatorio
[x] Customers + RFC
[x] Cortes Z
[x] Reportes (con foco caducidades)
[ ] Loyalty
```

### Productos a cargar primero

```
50 medicamentos top:
- Paracetamol 500mg $45
- Ibuprofeno 400mg $55
- Amoxicilina 500mg $180 (controlado)
- Metformina 850mg $90
- Loratadina 10mg $60
- Naproxeno 250mg $50
...

Cada uno con:
- Clave SAT (51160100 medicamentos)
- Unidad SAT (H87 pieza)
- Lote + caducidad por entrada
```

### Tutorial first sale CFDI

```
1. Cliente llega → "Necesito paracetamol y un ibuprofeno"
2. POS → escanear ambos
3. Cliente: "Quiero factura"
4. Selecciona cliente con RFC (o lo crea rápido)
5. Cobrar tarjeta
6. Click "Facturar" → CFDI auto vía Facturama
7. PDF + XML al email del cliente
8. Ticket imprime con folio CFDI
```

### Configuración crítica

- **Caducidad**: alerta 30 días antes (email) + 7 días (push).
- **Lotes**: FIFO por defecto (vende primero el más viejo).
- **CSD**: subir cert + key + password en setup CFDI.
- **Régimen fiscal**: 612 (Personas Físicas Actividad Empresarial).
- **Auto-bloqueo caducados**: ON.

---

## 5. ABARROTES / TIENDA DE BARRIO

### Módulos a activar

```
[x] POS
[x] Inventario
[x] Cortes Z
[x] Customers (clientes "fiados")
[x] Promos (martes 2x1 cervezas)
[ ] CFDI (raramente factura)
```

### Productos típicos

```
Top 30 abarrotes:
- Coca cola 600ml $20
- Sabritas $20
- Cigarros Marlboro $80
- Cerveza Tecate $25
- Pan Bimbo $45
- Leche 1L $26
- Tortillas 1kg $25
...
```

### Tutorial first sale

```
1. Cliente trae 6 cervezas + sabritas
2. POS → escanear uno por uno (o teclear código)
3. Cliente: "Apúntalo, paso el viernes"
4. Seleccionar cliente "Don Juan" (fiado)
5. Método pago: "Crédito"
6. Saldo Don Juan: era $0, ahora $170
7. Imprime ticket "PENDIENTE PAGO"
```

---

## 6. GIMNASIO

### Módulos a activar

```
[x] POS (extras: shakes, ropa)
[x] Customers
[x] Memberships (recurrente)
[x] Stripe Connect (cobro auto)
[x] Cortes Z
[x] Reportes (MRR, churn)
```

### Planes membresía típicos

```
- Básico mensual: $500 (pesas + cardio)
- Premium mensual: $800 (todo + clases)
- Anual: $5,400 (10% off vs mensual)
- Día visita: $80
```

### Tutorial first sale (inscripción)

```
1. Nuevo socio llega
2. /web/v25/customers/new → llenar datos
3. Asignar plan "Básico mensual" $500
4. Cobrar primer mes en POS
5. Pedir tarjeta para auto-renovación → tokenizar Stripe
6. Sistema crea membership con cobro día 1 cada mes
7. Imprimir credencial PDF (con QR de acceso)
```

---

## 7. SALÓN DE BELLEZA

### Módulos a activar

```
[x] POS
[x] Servicios (tipo de producto)
[x] Reservas (turnos)
[x] Customers + historial
[x] Memberships (paquetes prepagados)
```

### Productos / Servicios típicos

```
Servicios:
- Corte mujer $300
- Corte hombre $200
- Tinte completo $800
- Mechas $1,200
- Manicure $150
- Pedicure $200
- Limpieza facial $400

Productos venta:
- Shampoo profesional $250
- Tratamiento $400
```

### Tutorial first sale

```
1. Cliente con cita 4pm "Corte + tinte"
2. /web/v25/reservations → ver agenda
3. Marca cita como "En curso"
4. Estilista hace su trabajo
5. Al terminar → "Cobrar"
6. POS pre-cargado con servicios reservados
7. Cliente quiere agregar shampoo → escanear
8. Total $1,150. Cobrar.
9. Sugerir reservar próxima cita.
```

---

## 8. VENDEDOR MÓVIL / AMBULANTE

### Módulos a activar

```
[x] POS PWA
[x] Modo Offline (CRÍTICO)
[x] Inventario simple (5-20 productos)
[x] Cortes Z
[ ] Resto OFF
```

### Productos típicos

```
- Tamal verde $15
- Tamal rojo $15
- Atole $25
- Empanada $30
```

### Tutorial first sale offline

```
1. Vendedor abre PWA (sin internet)
2. POS carga desde cache
3. 2 tamales + 1 atole
4. Total $55. Efectivo. Cambio $5.
5. Imprime ticket Bluetooth (o muestra en pantalla)
6. Sistema guarda en IndexedDB
7. Al regresar a casa con WiFi → auto sync
8. Ventas aparecen en panel admin
```

---

## 9. E-COMMERCE

### Módulos a activar

```
[x] Catálogo + variantes
[x] Inventario
[x] Stripe online
[x] CFDI auto
[x] Shopify integration (si usa)
[x] WhatsApp Business (notif pedidos)
[x] Reportes
```

### Tutorial first sale online

```
1. Cliente en tu tienda online (Shopify/WooCommerce/SalvadoreX shop)
2. Agrega productos al carrito
3. Checkout con Stripe (tarjeta)
4. Webhook llega a SalvadoreX
5. Sistema:
   - Crea venta automática
   - Descuenta inventario
   - Genera CFDI auto
   - Envía email cliente con CFDI + tracking
6. Notif WhatsApp Business al dueño
7. Imprime etiqueta envío
```

---

## 10. COWORKING

### Módulos a activar

```
[x] Memberships (varios tiers)
[x] Reservas espacios (sala juntas, oficina)
[x] Customers
[x] CFDI (B2B obligatorio)
[x] POS (extras: café, snacks)
```

### Planes típicos

```
- Day pass: $200
- Hot desk mensual: $1,500
- Oficina privada 1 persona: $5,000/mes
- Oficina privada 4 personas: $15,000/mes
- Sala juntas: $200/hora
```

### Tutorial first sale

```
1. Nuevo coworker llega → registro
2. Plan "Hot desk mensual" $1,500
3. Cobro mensual auto Stripe
4. CFDI mensual al emisor
5. App genera QR de acceso (cliente entra al edificio escaneando)
6. Reserva sala juntas: 1 hora gratis incluida/mes, después $200/h
```

---

## CHECKLIST GENERAL DE ONBOARDING (CUALQUIER GIRO)

Customer Success debe asegurar:

- [ ] Cuenta creada con plan correcto.
- [ ] Bootstrap demo data según giro.
- [ ] Dueño hace login, cambia password.
- [ ] Activa SOLO los módulos esenciales (no todos).
- [ ] Carga primer batch de productos (manual o CSV).
- [ ] Configura ticket template + logo.
- [ ] Crea al menos 1 usuario adicional (cajera, mesero, etc).
- [ ] Hace 1 venta de prueba completa.
- [ ] Genera 1 corte Z de prueba.
- [ ] Si CFDI: configurar Facturama keys.
- [ ] Si Stripe: keys producción + test charge.
- [ ] Si móvil: instalar PWA.
- [ ] Si offline crítico: probar avión mode.
- [ ] Hand-off a Customer Success con tarea seguimiento día 3.
- [ ] Slack `#new-customers` notificado.

## TIEMPO PROMEDIO DE ONBOARDING

| Giro | Tiempo total |
|---|---|
| Cafetería simple | 8 min |
| Boutique con etiquetas | 10 min |
| Restaurante con KDS+mesas | 15 min |
| Multi-sucursal | 25 min |
| Gimnasio con memberships | 15 min |
| Farmacia con CFDI | 28 min (espera Facturama) |

---

## RECURSOS POR GIRO

Cada giro tiene templates específicos:

- `/templates/csv/cafeteria-products.csv`
- `/templates/csv/restaurant-menu.csv`
- `/templates/csv/boutique-fashion.csv`
- `/templates/csv/pharmacy-meds.csv`
- `/templates/csv/abarrotes-top100.csv`
- `/templates/csv/gym-members.csv`
- `/templates/csv/salon-services.csv`
- `/templates/csv/coworking-plans.csv`

Pedir al cliente que use estos templates ahorra 80% del setup.
