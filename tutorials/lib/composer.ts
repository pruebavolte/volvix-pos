// =========================================================================
// tutorials/lib/composer.ts
// Wrapper de ffmpeg para:
//   1) Convertir el .webm de Playwright a .mp4 (H.264/AAC)
//   2) Construir un track de audio sincronizado a partir de las narraciones
//      (concatenando con silencios para que cada audio caiga en su atMs)
//   3) Mezclar audio + video con fade in/out
// =========================================================================

import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export type Narration = { atMs: number; audioPath: string; durationMs: number; text: string };

export type ComposeOptions = {
  webmPath: string;
  narrations: Narration[];
  outputMp4Path: string;
  fadeMs?: number;
  /** Duracion total estimada del video en ms (para validar) */
  videoDurationMs?: number;
};

function ff(args: string[]): { code: number; stderr: string } {
  const res = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  return { code: res.status ?? 1, stderr: (res.stderr || '').toString() };
}

function probeDurationMs(file: string): number {
  const res = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8' });
  const seconds = parseFloat((res.stdout || '0').trim());
  return Math.max(0, Math.round((isNaN(seconds) ? 0 : seconds) * 1000));
}

/**
 * Genera el archivo MP4 final mezclando el video de Playwright con las
 * narraciones temporizadas (msedge-tts) usando ffmpeg.
 */
export async function compose(opts: ComposeOptions): Promise<string> {
  const fadeMs = opts.fadeMs ?? 500;
  const videoDur = opts.videoDurationMs ?? probeDurationMs(opts.webmPath);
  if (videoDur === 0) throw new Error('composer: video duracion 0; verifica el webm');

  // 1) Construir un audio track que caiga bien en el video
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlx-tut-'));
  let audioTrack: string | null = null;
  if (opts.narrations.length > 0) {
    audioTrack = await buildAudioTrack(opts.narrations, videoDur, tmpDir);
  }

  // 2) ffmpeg: muxear video webm + audio mp3 → mp4 con fades
  const fadeOutAt = Math.max(0, (videoDur - fadeMs) / 1000);
  const args: string[] = ['-y', '-i', opts.webmPath];
  if (audioTrack) args.push('-i', audioTrack);
  // Filtros de video: fade in/out
  args.push(
    '-vf', `fade=t=in:st=0:d=${fadeMs / 1000},fade=t=out:st=${fadeOutAt}:d=${fadeMs / 1000}`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
  );
  if (audioTrack) {
    args.push(
      '-c:a', 'aac',
      '-b:a', '160k',
      '-shortest',
      '-map', '0:v:0',
      '-map', '1:a:0',
    );
  } else {
    args.push('-an');
  }
  args.push(opts.outputMp4Path);

  const r = ff(args);
  if (r.code !== 0) {
    throw new Error('ffmpeg fallo (mux):\n' + r.stderr.slice(-2000));
  }
  if (!fs.existsSync(opts.outputMp4Path)) {
    throw new Error('ffmpeg: archivo final no existe: ' + opts.outputMp4Path);
  }
  // Cleanup tmp
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  return opts.outputMp4Path;
}

/**
 * Crea un MP3 sintetico de longitud videoDur con cada narracion alineada
 * a su atMs (tiempo donde se reprodujo durante la grabacion). El espacio
 * entre narraciones se rellena con silencio.
 */
async function buildAudioTrack(narrations: Narration[], videoDurMs: number, tmpDir: string): Promise<string> {
  // Estrategia: para cada narracion, generamos un fragmento que arranca con
  // un silencio de duracion atMs - cursorMs, luego el audio de la narracion.
  // Concatenamos todos en orden y truncamos a videoDur.
  const parts: string[] = [];
  let cursorMs = 0;

  // Asegurar orden por atMs
  const sorted = [...narrations].sort((a, b) => a.atMs - b.atMs);

  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    const gapMs = Math.max(0, n.atMs - cursorMs);
    if (gapMs > 50) {
      const silencePath = path.join(tmpDir, `silence-${i}.mp3`);
      const r = ff([
        '-y',
        '-f', 'lavfi',
        '-i', `anullsrc=channel_layout=mono:sample_rate=24000`,
        '-t', (gapMs / 1000).toFixed(3),
        '-q:a', '9',
        '-acodec', 'libmp3lame',
        silencePath,
      ]);
      if (r.code !== 0) throw new Error('ffmpeg silence fallo: ' + r.stderr.slice(-400));
      parts.push(silencePath);
    }
    parts.push(n.audioPath);
    cursorMs = n.atMs + n.durationMs;
  }

  // Padding final hasta videoDurMs
  const tailMs = Math.max(0, videoDurMs - cursorMs);
  if (tailMs > 50) {
    const silencePath = path.join(tmpDir, 'silence-tail.mp3');
    const r = ff([
      '-y',
      '-f', 'lavfi',
      '-i', `anullsrc=channel_layout=mono:sample_rate=24000`,
      '-t', (tailMs / 1000).toFixed(3),
      '-q:a', '9',
      '-acodec', 'libmp3lame',
      silencePath,
    ]);
    if (r.code !== 0) throw new Error('ffmpeg tail silence fallo: ' + r.stderr.slice(-400));
    parts.push(silencePath);
  }

  // Concatenar usando concat demuxer
  const listFile = path.join(tmpDir, 'concat.txt');
  fs.writeFileSync(listFile, parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const finalAudio = path.join(tmpDir, 'narration-track.mp3');
  const r = ff([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c:a', 'libmp3lame',
    '-b:a', '160k',
    finalAudio,
  ]);
  if (r.code !== 0) throw new Error('ffmpeg concat fallo: ' + r.stderr.slice(-800));
  return finalAudio;
}
