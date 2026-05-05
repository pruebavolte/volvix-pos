# Browser E2E (Playwright headless)

## Instalación
```bash
npm i -D playwright
npx playwright install chromium
```

## Ejecución
```bash
node tests/browser/run-auto.js
```

Variables opcionales:
- `BASE_URL` (default `https://volvix-pos.vercel.app`)
- `VOLVIX_USER` / `VOLVIX_PASS` (default `admin`/`admin`)
- `HEADLESS=false` para ver el navegador

## Salidas
- `tests/browser/screenshots/*.png` (uno por paso)
- `tests/browser/last-run.json` (resumen pasos OK/FAIL)
- exit code 0 si todo pasa, 1 si algún paso falla

## Pasos cubiertos
1. Login en `/login.html`
2. Verificación redirect a `salvadorex_web_v25.html`
3. F3 Productos (>5 items)
4. + Nuevo producto + verificar
5. Editar producto + verificar
6. Eliminar + verificar desaparición
7. F1 Ventas: agregar al carrito + cobrar efectivo + verificar ticket
