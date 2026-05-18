/**
 * PATCH 4: Realtime channels (WebSocket / BroadcastChannel / SSE)
 * ================================================================
 * Detecta canales de comunicación en tiempo real en archivos HTML/JS.
 *
 * HALLAZGOS REALES en salvadorex-pos.html:
 *   - supabase.channel(): 0 usos — NO se usa Realtime de Supabase
 *   - new WebSocket(...): 0 usos — sin WebSocket crudo
 *   - new EventSource(...): 0 usos — sin SSE
 *   - new BroadcastChannel(...): 2 usos
 *       L7174: this.channel = new BroadcastChannel(CHANNEL_NAME);  [clase ScreenShare/collab]
 *       L9631: try { return new BroadcastChannel('volvix-cart-sync'); } catch (_) { return null; }
 *
 * DIAGNÓSTICO: No hay deuda de Realtime no gestionado.
 *   Los 2 BroadcastChannels son intencionales:
 *     1. Canal de sincronización de carrito entre tabs (volvix-cart-sync) — patrón sano
 *     2. Canal de Screen Share colaborativo — bien encapsulado en clase
 *   No hay listener .on('message') sin cleanup detectado, pero conviene verificar
 *   que ambos canales llamen a .close() al desmontar.
 *
 * HOW TO INTEGRATE: Añadir a scanFile() de generate-system-map.js.
 */

// ---------------------------------------------------------------------------
// SNIPPET PARA INSERTAR EN scanFile()
// ---------------------------------------------------------------------------

/**
 * Detecta canales realtime y websockets en el texto de un archivo.
 * @param {string} text - contenido completo del archivo
 * @returns {RealtimeReport}
 */
function detectRealtimeChannels(text) {
  const results = {
    supabase_channels: [],
    websockets: [],
    event_sources: [],
    broadcast_channels: [],
    summary_count: 0,
  };

  // 1. supabase.channel('xxx')
  const sbRegex = /supabase\.channel\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = sbRegex.exec(text)) !== null) {
    results.supabase_channels.push(m[1]);
  }

  // 2. new WebSocket(url)
  const wsRegex = /new\s+WebSocket\(\s*(['"`][^'"`]*['"`]|[^)]+)\)/g;
  while ((m = wsRegex.exec(text)) !== null) {
    results.websockets.push(m[1].trim().slice(0, 100));
  }

  // 3. new EventSource(url)
  const esRegex = /new\s+EventSource\(\s*(['"`][^'"`]*['"`]|[^)]+)\)/g;
  while ((m = esRegex.exec(text)) !== null) {
    results.event_sources.push(m[1].trim().slice(0, 100));
  }

  // 4. new BroadcastChannel(name)
  const bcRegex = /new\s+BroadcastChannel\(\s*(['"`]([^'"`]*)['"`]|[^)]+)\)/g;
  while ((m = bcRegex.exec(text)) !== null) {
    results.broadcast_channels.push(m[1].trim().slice(0, 100));
  }

  results.summary_count =
    results.supabase_channels.length +
    results.websockets.length +
    results.event_sources.length +
    results.broadcast_channels.length;

  return results;
}

// ---------------------------------------------------------------------------
// INTEGRACIÓN EN scanFile() — agregar al objeto de retorno:
// ---------------------------------------------------------------------------
//
//   const realtimeData = detectRealtimeChannels(text);
//   return {
//     ...existingReturn,
//     realtime_channels: realtimeData,
//   };
//
// ---------------------------------------------------------------------------

module.exports = { detectRealtimeChannels };
