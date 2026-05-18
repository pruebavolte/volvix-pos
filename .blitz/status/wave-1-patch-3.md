# Wave 1 — Parche 3: Roles hardcoded

- Estado: ✓
- Archivo generado: scripts/_patches/patch-3.diff.js
- Hallazgos clave:
  - 7 roles distintos detectados en el HTML: `owner`, `admin`, `superadmin`, `manager`, `cashier`, `cajero`, `delivery`
  - 18 comparaciones directas `role === 'x'` dispersas en ~8 zonas del archivo (L2588, L7530-32, L7829, L15001, L16293, L18576, L18660)
  - Variante local `cajero` vs inglesa `cashier` coexisten sin normalización — riesgo de branch muerta si BD cambia un valor
