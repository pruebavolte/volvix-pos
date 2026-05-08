// =========================================================================
// tutorials/lib/narrator.ts
// Wrapper de TTS usando msedge-tts (gratis, sin API key, voz neural natural).
// Cachea cada audio por SHA256 del texto + voz para evitar re-generar.
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
// @ts-ignore - msedge-tts no trae tipos formales pero la API es estable
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const VOICE = 'es-MX-DaliaNeural';
const RATE = '-10%'; // un poco mas lento para tutoriales

const CACHE_DIR = path.join(__dirname, '..', 'narration', '.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashKey(text: string): string {
  return crypto
    .createHash('sha256')
    .update(VOICE + '|' + RATE + '|' + text.trim())
    .digest('hex')
    .slice(0, 32);
}

/**
 * Genera (o reusa de cache) un MP3 con la narracion.
 * @param text  Texto en español a narrar
 * @returns Path absoluto al archivo .mp3 generado/cacheado
 */
export async function narrate(text: string): Promise<string> {
  if (!text || !text.trim()) throw new Error('narrate: text vacio');
  const key = hashKey(text);
  // msedge-tts toFile() trata el primer arg como DIRECTORIO y genera
  // <dir>/audio.mp3 dentro. Por eso usamos un dir-por-hash.
  const dirPath = path.join(CACHE_DIR, key);
  fs.mkdirSync(dirPath, { recursive: true });
  const cachedPath = path.join(dirPath, 'audio.mp3');
  if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 1000) {
    return cachedPath;
  }
  // Generacion fresca
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const res: any = await tts.toFile(dirPath, text, { rate: RATE });
  const finalPath: string = res?.audioFilePath || cachedPath;
  if (!fs.existsSync(finalPath)) {
    throw new Error('narrator: no se genero el archivo de audio para: ' + text.slice(0, 60));
  }
  return finalPath;
}

/** Duracion aproximada del audio MP3 en ms (lee header, sin ffprobe). */
export async function audioDurationMs(audioPath: string): Promise<number> {
  // Estimacion conservadora: ~150 caracteres por segundo a velocidad -10%
  // Para precision real usariamos ffprobe; mantenemos simple aqui.
  // En sync.ts usaremos un timeout de seguridad alrededor del audio.
  const buf = fs.readFileSync(audioPath);
  // MP3 a 24kHz mono 48kbps: 6 KB ~ 1 segundo
  const sizeBytes = buf.length;
  const seconds = sizeBytes / 6000;
  return Math.max(800, Math.round(seconds * 1000));
}
