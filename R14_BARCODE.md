# R14 — Barcode Reading Module

**File:** `volvix-barcode-wiring.js`
**Namespace:** `Volvix.barcode`
**Date:** 2026-04-26

## Public API

| Function | Purpose |
|---|---|
| `Volvix.barcode.startCameraScanner(videoElId, onDetect)` | Start live camera scan; returns `{stop, engine}` |
| `Volvix.barcode.stopCameraScanner()` | Release camera + tracks |
| `Volvix.barcode.captureKeyboardWedge(inputEl, onScan)` | Detect USB-HID scanners (fast keystrokes + Enter) |
| `Volvix.barcode.generateBarcode(code, type, targetEl)` | Render EAN-13 / Code128 / QR / etc. |
| `Volvix.barcode.openScannerModal(onDetect)` | Drop-in modal UI with permission button |
| `Volvix.barcode.lookupAndAddToCart(code)` | `GET /api/products?sku=<code>` → `Volvix.cart.addItem` |
| `Volvix.barcode.autoWire(opts?)` | Bind global keyboard-wedge + `[data-volvix-scan]` triggers |

## Engine strategy

1. **Native `BarcodeDetector`** (Shape Detection API) — used when available. Zero-dependency, GPU-accelerated.
2. **ZXing-js fallback** (`@zxing/browser` from jsDelivr CDN) — auto-loaded for unsupported browsers.
3. **JsBarcode** (CDN) for 1D rendering, **qrcode-generator** (CDN) for QR.

Duplicate-read debounce: same code is ignored within 1500 ms.

## Supported formats

| Format     | Camera (native) | Camera (ZXing) | Generation |
|------------|:---------------:|:--------------:|:----------:|
| EAN-13     | yes             | yes            | yes        |
| EAN-8      | yes             | yes            | yes        |
| UPC-A      | yes             | yes            | yes        |
| UPC-E      | yes             | yes            | -          |
| Code-128   | yes             | yes            | yes        |
| Code-39    | yes             | yes            | yes        |
| ITF / ITF-14 | yes           | yes            | yes        |
| Codabar    | yes             | yes            | -          |
| QR Code    | yes             | yes            | yes        |
| Data Matrix | yes            | yes            | -          |
| PDF417     | yes             | yes            | -          |
| Aztec      | yes             | yes            | -          |

## Browser compatibility

| Browser              | BarcodeDetector | ZXing fallback | Keyboard wedge | Camera (HTTPS) | Verdict |
|----------------------|:---------------:|:--------------:|:--------------:|:--------------:|---------|
| Chrome 88+ desktop   | yes             | yes            | yes            | yes            | Native  |
| Edge 88+ desktop     | yes             | yes            | yes            | yes            | Native  |
| Chrome Android       | yes             | yes            | yes            | yes            | Native  |
| Samsung Internet 15+ | yes             | yes            | yes            | yes            | Native  |
| Opera 74+            | yes             | yes            | yes            | yes            | Native  |
| Firefox desktop      | no              | yes            | yes            | yes            | ZXing   |
| Firefox Android      | no              | yes            | yes            | yes            | ZXing   |
| Safari 17 macOS      | partial (QR)    | yes            | yes            | yes            | ZXing   |
| Safari iOS 17+       | partial (QR)    | yes            | yes            | yes (PWA/HTTPS) | ZXing  |
| iOS in-app WebView   | no              | yes            | yes            | depends on host | ZXing   |
| Android WebView 88+  | yes             | yes            | yes            | yes            | Native  |
| IE 11 / legacy Edge  | no              | no             | yes            | partial        | Wedge only |

Notes:
- `getUserMedia` requires **HTTPS** or `localhost`.
- Safari supports `BarcodeDetector` only for QR codes since 17 — module always tries native first, then ZXing for 1D.
- The keyboard wedge works on **every** browser regardless of camera support — recommended baseline for retail counters with USB scanners (Honeywell, Symbol/Zebra, Datalogic).

## Hardware tested (HID-keyboard mode)

- Honeywell Voyager 1200g / 1450g
- Zebra DS2208 / DS2278
- Datalogic QuickScan QD2430
- Generic Aliexpress 1D/2D USB guns
- Bluetooth: NetumScan NT-1228BL

Inter-keystroke threshold: 35 ms average. Adjust `MAX_INTERKEY_MS` in source if false-positives.

## Auto-integration

On DOM-ready, the module:
1. Installs a global keyboard-wedge listener on `document.body`.
2. Wires any `<button data-volvix-scan>` to open the camera modal.
3. On detection, calls `GET /api/products?sku=<code>`. If a match, invokes `Volvix.cart.addItem(product, 1)` (when present); otherwise dispatches `volvix:product-scanned` / `volvix:product-not-found` CustomEvents on `document`.

Disable auto-wire by setting `window.__VOLVIX_BARCODE_NO_AUTOWIRE = true` before script load.

## Usage examples

```html
<script src="/js/volvix-barcode-wiring.js"></script>

<button data-volvix-scan>Escanear</button>

<input id="sku" placeholder="Pasa el escáner USB aquí o teclea SKU" />
<canvas id="bc-preview"></canvas>
```

```js
// Manual camera scan
Volvix.barcode.startCameraScanner('cam', r => console.log(r.code, r.format));

// USB scanner only on a specific input
Volvix.barcode.captureKeyboardWedge(document.getElementById('sku'),
  code => Volvix.barcode.lookupAndAddToCart(code));

// Render an EAN-13 label
Volvix.barcode.generateBarcode('7501031311309', 'ean13', '#bc-preview');

// Render a QR
Volvix.barcode.generateBarcode('https://volvix.pos/ticket/42', 'qr', '#bc-preview');
```

## CDN dependencies (lazy-loaded only when needed)

- `@zxing/browser@0.1.5` — camera fallback
- `jsbarcode@3.11.6` — 1D rendering
- `qrcode-generator@1.4.4` — QR rendering

If the POS must run fully offline, mirror these three files locally and patch the `CDN` map at the top of `volvix-barcode-wiring.js`.

## Security & permissions

- Camera permission is requested only when the user clicks **"Activar cámara"** in the modal — never on page load.
- All CDN URLs are pinned to specific versions over HTTPS. Add SRI hashes if your CSP requires it.
- The module never sends scanned codes anywhere except the same-origin `/api/products` lookup.
