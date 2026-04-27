# R14 — Drivers de Impresion Termica (Receipt Printers)

Volvix POS soporta cuatro modos de impresion + un fallback HTML universal.

## Componentes entregados

| Archivo | Proposito |
|---|---|
| `volvix-printer-wiring.js` | Drivers cliente (ESC/POS, Bluetooth, USB, Network, fallback) |
| `api/index.js` :: `POST /api/printer/raw` | Endpoint de auditoria (NO imprime, solo registra) |
| `db/R14_PRINTERS.sql` | Tablas `printer_configs` + `printer_audit_log` con RLS |

## API JS expuesta

```js
Volvix.printer.escpos.build(saleData)        // → Uint8Array (buffer ESC/POS)
Volvix.printer.escpos.openDrawer()           // → Uint8Array (kick cajon)
Volvix.printer.bluetooth.connect()           // → Web Bluetooth (BLE)
Volvix.printer.bluetooth.send(buffer)
Volvix.printer.usb.connect()                 // → WebUSB
Volvix.printer.usb.send(buffer)
Volvix.printer.network.send(ip, port, buf)   // → bridge local 127.0.0.1:9101 + fallback /api/printer/raw
Volvix.printer.fallbackPrint(saleData)       // → window.print() con HTML 80mm
Volvix.printer.printReceipt(saleId)          // → orquestador (lee config y elige driver)
Volvix.printer.setConfig({type, address, port, paper_width})
Volvix.printer.getConfig()
```

## Compatibilidad por marca/modelo

### USB (WebUSB) — Vendor IDs precargados

| Marca | Modelos verificados | Vendor ID | Notas |
|---|---|---|---|
| Epson | TM-T20II, TM-T20III, TM-T82, TM-T88V/VI, TM-m30 | 0x04B8 | Driver ESC/POS estandar. Excelente. |
| Star Micronics | TSP100 (futurePRNT), TSP143IIIU, TSP650, mPOP | 0x0519 | Algunos requieren modo "ESC/POS legacy" en utilidad Star. |
| Bixolon | SRP-330II, SRP-350III, SRP-Q300 | 0x1504 | ESC/POS nativo. |
| Citizen | CT-S310II, CT-S4000, CT-E351 | 0x0FE6 | Soporta ESC/POS y CITIZEN cmds. Usar ESC/POS. |
| Xprinter | XP-58 / XP-80 / XP-Q200 | 0x0416 | Compatibles genericas chinas (clones Epson). Funcionan bien. |
| Sewoo, SNBC, MUNBYN | varios | varios | Mayoria son ESC/POS compatible — agregar vendor en `USB_VENDORS`. |

> WebUSB requiere **HTTPS** y permiso explicito del usuario. Solo Chromium (Chrome/Edge/Opera/Brave). Firefox y Safari NO lo soportan — usar Bluetooth o fallback.

### Bluetooth (Web Bluetooth API) — BLE termicas

| Marca | Modelos verificados | Servicio GATT |
|---|---|---|
| Generic 58mm BLE | MTP-II, GOOJPRT PT-210, MUNBYN ITPP047 | `000018f0-...` (write 2af1) |
| Star mPOP, SM-S230i | — | servicio propio Star (acepta ESC/POS por write char) |
| Sunmi V2 / V2s (interno) | dispositivos Android Sunmi | usar SDK nativo, NO Web Bluetooth |
| Epson TM-P20, TM-P80 (BT clasico) | — | ⚠ Bluetooth **clasico** no BLE — Web Bluetooth NO los ve. Usar puente USB o red. |

> Web Bluetooth solo soporta **BLE**, no Bluetooth clasico (RFCOMM/SPP). Impresoras Bluetooth clasicas necesitan un puente nativo o conexion USB.

### Network (TCP RAW 9100)

Casi cualquier impresora termica con puerto Ethernet:
- Epson TM-T88V-i (i = ethernet), TM-T20III-NT, TM-m30
- Star TSP143IIILAN, TSP100ECO LAN
- Bixolon SRP-350plusIII (LAN)
- Citizen CT-S310II-LAN

**Restriccion del navegador**: el browser NO puede abrir sockets TCP raw a 9100. Solucion:
1. **Volvix Print Bridge** (helper local opcional) escucha en `http://127.0.0.1:9101/print`, recibe `{ip, port, data: base64}` y abre TCP a la impresora LAN.
2. Si no hay bridge, el driver hace POST a `/api/printer/raw` que **solo registra para auditoria** (no reenvia a internet — el servidor cloud no tiene ruta a la LAN del cliente).

## Endpoint de auditoria

```
POST /api/printer/raw
Authorization: Bearer <jwt>
Body: { "ip": "192.168.1.50", "port": 9100, "data": "<base64>", "length": 1234 }

Response 200: { ok:true, audit_only:true, message:"...", ip, port, bytes }
```

Validaciones:
- Solo acepta IPs privadas (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.1).
- `length <= 512KB`.
- `data` debe ser base64 valido.
- Inserta fila en `printer_audit_log` con tenant, user, IP origen, UA.

## Tablas (SQL)

```sql
printer_configs(id uuid pk, tenant_id, name, type[bluetooth/usb/network/fallback],
                address, port, paper_width, default_for jsonb, active, created_at, updated_at)
printer_audit_log(id, tenant_id, user_id, printer_id, type, ip, port, bytes,
                  status, ip_origin inet, user_agent, created_at)
```

RLS: aislamiento por `tenant_id` via `current_setting('app.tenant_id')`.

## Fallback `window.print()`

Si la config es `type:'fallback'`, no hay impresora termica detectada, o el driver falla, se abre una ventana popup con HTML 80mm y se llama `window.print()` automaticamente. Funciona con **cualquier** impresora del SO (laser, inkjet, PDF virtual). Usar en kioscos web sin hardware termico.

## Flujo recomendado

1. Admin entra a `Configuracion → Impresoras`, agrega su impresora (probar conexion).
2. Se guarda en `printer_configs` y se replica a `localStorage.volvix_printer_config` del POS.
3. Al cobrar venta: `Volvix.printer.printReceipt(saleId)` → ESC/POS al hardware.
4. Si falla cualquier paso → fallback a `window.print()`.

## Limitaciones conocidas

- **iOS Safari**: no soporta WebUSB ni Web Bluetooth → siempre fallback HTML.
- **Bluetooth clasico** (no BLE): no accesible desde el navegador, requiere bridge nativo o USB.
- **Linux**: WebUSB requiere reglas udev para que el usuario tenga acceso al device.
- **Windows**: Si Windows tiene driver instalado para la impresora USB, puede bloquear `claimInterface()` — desinstalar driver Windows o usar Zadig (WinUSB) para impresoras puramente WebUSB.
