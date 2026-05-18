# Agente Wave 1 — Parche 4: Realtime channels

## Misión

Detectar canales de Supabase Realtime u otros suscriptores en tiempo real.

## Output esperado

Crea `scripts/_patches/patch-4.diff.js`:

```js
// PATCH 4: Realtime channels y suscripciones

// AGREGAR a scanFile():
// --- INICIO PARCHE ---
const realtimeChannels = uniqueMatches(text, /supabase\.channel\(['"]([^'"]+)['"]/g);
const wsConnections = uniqueMatches(text, /new\s+WebSocket\(['"]([^'"]+)['"]/g);
const eventSources = uniqueMatches(text, /new\s+EventSource\(['"]([^'"]+)['"]/g);
const broadcastChannels = uniqueMatches(text, /new\s+BroadcastChannel\(['"]([^'"]+)['"]/g);

const realtimeFeatures = {
  supabase_channels: realtimeChannels,
  websockets: wsConnections,
  server_sent_events: eventSources,
  broadcast_channels: broadcastChannels,
  total: realtimeChannels.length + wsConnections.length + eventSources.length + broadcastChannels.length
};
// --- FIN PARCHE ---

// EN RETURN:
//   realtime: realtimeFeatures
```

## Reporte

`.blitz/status/wave-1-patch-4.md`:

```markdown
# Wave 1 — Parche 4: Realtime

- Estado: ✓
- Detecta: Supabase Realtime, WebSocket, SSE, BroadcastChannel
- Si tu sistema NO usa nada de esto, el output será arrays vacíos
  (no es deuda, es información).
```
