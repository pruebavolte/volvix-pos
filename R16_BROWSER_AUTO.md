# R16 — Browser Automation (Playwright headless)

**Fecha:** 2026-04-26
**Target:** https://volvix-pos.vercel.app

## Archivos creados
- `tests/browser/run-auto.js` — script principal (chromium headless, 7 pasos)
- `tests/browser/README.md` — instrucciones de instalación/uso

## Estado de ejecución
**No se pudo correr**: módulo `playwright` no instalado en este entorno.
Verificación: `require.resolve('playwright')` -> NOT installed. `npx` sí está disponible.

Para ejecutar:
```bash
cd "C:/Users/DELL/Downloads/verion 340"
npm i -D playwright
npx playwright install chromium
node tests/browser/run-auto.js
```

## Cobertura del script (7 pasos secuenciales)
1. **Login** — fill `#username`/`#password` con `admin`/`admin`, click submit. Selectores con fallback múltiple.
2. **Redirect** — `waitForURL(/salvadorex_web_v25\.html/)` + networkidle.
3. **F3 Productos** — `keyboard.press('F3')` con fallback al botón. Falla si <5 filas.
4. **Nuevo producto** — abre form, llena `nombre=TEST_E2E_<ts>`, `precio=99.99`, `stock=10`, guarda, verifica aparición.
5. **Editar** — localiza fila por nombre, click Editar, cambia precio a 149.50, verifica.
6. **Eliminar** — auto-acepta `dialog`, click Eliminar, verifica desaparición.
7. **F1 Venta** — agrega producto al carrito (dblclick), Cobrar > Efectivo > Confirmar, verifica ticket por regex `/ticket|folio|recibo/i`.

## Salidas previstas (al correr)
- `tests/browser/screenshots/01-login.png` ... `09-ticket.png` (9 capturas, fullPage)
- `tests/browser/last-run.json` con `{steps[], passed, failed}`
- exit 0/1 según resultado

## Configuración
Variables env: `BASE_URL`, `VOLVIX_USER`, `VOLVIX_PASS`, `HEADLESS=false`.
Viewport: 1366x800. Listener `console.error` para capturar errores JS de la página.

## Robustez
- Cada paso es try/catch con captura de error en `last-run.json`.
- Selectores con múltiples fallbacks (nombre, id, placeholder, role, texto).
- Screenshot automático en error fatal (`ERROR-final.png`).

## Próximos pasos
1. Usuario instala playwright (un solo comando).
2. Correr y revisar `last-run.json` + screenshots.
3. Si algún selector falla, ajustar según markup real de `salvadorex_web_v25.html`.
