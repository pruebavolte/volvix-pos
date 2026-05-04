# R17 — Voice POS (comandos por voz)

## Resumen
Comandos por voz nativos en el POS usando Web Speech API. Sin dependencias externas, sin coste por minuto. Un endpoint local de parser convierte la transcripción en `{intent, entities, action}` por regex/keyword (no requiere IA).

## Archivos
- `public/volvix-voice-wiring.js` — cliente: SpeechRecognition + SpeechSynthesis, botón flotante, waveform, dispatcher de acciones contra `Volvix.cart`, `Volvix.catalog` y `/api/sales/today`.
- `api/index.js` — `POST /api/voice/parse` (auth) registrado junto a sales extras (~línea 5763).

## Comandos soportados (es-MX)
| Frase | intent | action |
|---|---|---|
| "agregar 2 cocas" | `add_to_cart` | `cart.add {qty,query}` |
| "buscar leche" | `search` | `catalog.filter {query}` |
| "cobrar efectivo" / "cobrar tarjeta" / "cobrar transferencia" | `checkout` | `sale.checkout {payment_method}` |
| "cuánto vendí hoy" / "ventas de hoy" | `sales_today` | `report.sales_today` (lee `/api/sales/today` y lo verbaliza) |
| "siguiente cliente" / "nuevo cliente" | `next_customer` | `cart.reset` |
| "cancelar" / "cancelar venta" | `cancel` | `sale.cancel` |

Cualquier otra frase devuelve `intent: "unknown"` y el cliente dice "No entendí, repite".

## Endpoint
`POST /api/voice/parse` → body `{ "text": "..." }` → `{ ok, intent, entities, action, original }`. Requiere JWT o `X-API-Key`. Respuestas 4xx siguen la spec R15.

## Uso desde la app
```html
<script src="/volvix-voice-wiring.js"></script>
<script>
  Volvix.voice.setApiBase(''); // mismo origen
  // opcional: interceptar acciones
  Volvix.voice.onAction(async (a) => { console.log('voice', a); return false; });
  // arranque programático (gesto de usuario requerido por el navegador):
  document.getElementById('btnTalk')?.addEventListener('click', () => Volvix.voice.start());
</script>
```

El script ya inserta un FAB (botón flotante) en la esquina inferior izquierda y un waveform animado durante la escucha.

## Compatibilidad de navegadores
| Navegador | SpeechRecognition | SpeechSynthesis | es-MX | Veredicto |
|---|---|---|---|---|
| Chrome desktop ≥ 88 | Sí (`webkitSpeechRecognition`, requiere red) | Sí | Sí | **Soportado** |
| Edge desktop ≥ 90 (Chromium) | Sí | Sí | Sí | **Soportado** |
| Chrome Android | Parcial (depende de Google Speech Services) | Sí | Sí | Soportado con red |
| Safari macOS 14+ | Sí (on-device) | Sí | Limitado (es-ES más fiable) | Aceptable |
| Safari iOS 14.5+ | Sí pero con prompt nativo | Sí | Limitado | Aceptable, UX pobre |
| Firefox desktop | **No** (sin `SpeechRecognition`) | Sí | n/a | **No soportado** — el botón avisa por TTS |
| Opera / Brave | Igual que Chrome si no se desactiva el motor | Sí | Sí | Soportado |

Recomendación de soporte: **Chrome / Edge desktop con `lang=es-MX`**. El módulo detecta soporte (`Volvix.voice.supported`) y degrada silenciosamente.

## Notas
- Requiere HTTPS (o `localhost`) para acceso al micrófono.
- Reconocimiento por turnos (`continuous=false`) — un comando por activación. Evita falsos positivos en ambientes ruidosos de tienda.
- El parser es 100 % local, sin llamadas a Anthropic ni OpenAI.
- Tests manuales sugeridos: catálogo, carrito, cobro efectivo, "cuánto vendí hoy".
