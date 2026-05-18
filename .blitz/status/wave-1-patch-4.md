# Wave 1 — Parche 4: Realtime channels

- Estado: ✓
- Archivo generado: scripts/_patches/patch-4.diff.js
- Hallazgos clave:
  - supabase.channel(), WebSocket y EventSource: 0 usos — no hay Realtime de Supabase activo
  - BroadcastChannel: 2 instancias — `volvix-cart-sync` (sincronización de carrito entre tabs, L9631) y un canal de Screen Share colaborativo (L7174)
  - No es deuda: ambos usos son intencionales y encapsulados; verificar que llamen `.close()` al desmontar
