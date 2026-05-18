# Wave 1 — Parche 5: Window vars (state global)

- Estado: ✓
- Archivo generado: scripts/_patches/patch-5.diff.js
- Hallazgos clave:
  - ~25 asignaciones `window.*` de estado (no funciones): `window.VOLVIX`, `window.CART`, `window.IMPERSONATING`, `window.__volvixDevMode`, `window.__impErrs`, etc.
  - Los más riesgosos: `window.IMPERSONATING` (objeto complejo mutable), `window.fetch = origFetch` (monkey-patch que puede no restaurarse en error paths), `window.CART` (array mutado directamente)
  - Funciones asignadas a window (~6): excluidas del conteo — son API pública intencional (`__vlxResendVerify`, `__impLogReader`, etc.)
