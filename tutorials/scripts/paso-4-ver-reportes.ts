// =========================================================================
// tutorials/scripts/paso-4-ver-reportes.ts
// Tutorial 4 de 4: como ver tus reportes y entender el desempeño del negocio.
// =========================================================================

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { record } from '../lib/recorder';
import { compose } from '../lib/composer';
import type { TutorialConfig } from '../lib/types';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.tutorials') });

const STAGING_URL = process.env.STAGING_URL || 'http://127.0.0.1:3000';
const STAGING_USER = process.env.STAGING_USER || '';
const STAGING_PASS = process.env.STAGING_PASS || '';

if (!STAGING_USER || !STAGING_PASS) {
  console.error('\n❌ Faltan credenciales en .env.tutorials\n');
  process.exit(1);
}

const config: TutorialConfig = {
  id: 'paso-4-ver-reportes',
  title: 'Cómo ver tus reportes',
  outputName: 'paso-4-ver-reportes.mp4',
  viewport: { width: 1280, height: 720 },
  steps: [
    { kind: 'screen', title: '📊 Paso 4 de 4', subtitle: 'Ver el desempeño de tu negocio', ms: 3000 },

    { kind: 'navigate', url: '/salvadorex-pos.html#reportes',
      narrate: 'En la sección de reportes podrás ver el desempeño de tu negocio en tiempo real.' },

    // Resaltar la cabecera de reportes
    { kind: 'highlight', selector: '#screen-reportes .page-head', ms: 2000,
      narrate: 'Tienes varias secciones: ventas totales, productos más vendidos, tus mejores clientes y más.' },

    // Resaltar el grid de tarjetas de reportes
    { kind: 'highlight', selector: '#screen-reportes .card', ms: 1800,
      narrate: 'Cada tarjeta muestra una métrica clave de tu negocio. Puedes hacer clic para ver el detalle completo.' },

    { kind: 'narrate',
      text: 'Estos reportes se cargan automáticamente desde tus ventas reales. No es información inventada — es lo que pasó en tu negocio.',
      ms: 700 },

    { kind: 'narrate',
      text: '¡Y con esto has completado la configuración inicial de System International! Ya estás listo para vender, llevar tu inventario y entender tu negocio. ¡Mucho éxito!',
      ms: 800 },

    { kind: 'screen', title: '🎉 ¡Felicidades!', subtitle: 'Has completado los 4 pasos · Bienvenido a System International', ms: 3500 },
  ],
};

async function main() {
  console.log(`\n▶ Tutorial: ${config.title}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlx-rec-'));
  const outputDir = path.resolve(__dirname, '..', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputMp4 = path.join(outputDir, config.outputName);

  console.log('\n[1/2] Grabando…');
  const { webmPath, narrations } = await record(config, {
    baseUrl: STAGING_URL, email: STAGING_USER, password: STAGING_PASS,
    videoDir: tmpDir, viewport: config.viewport, headed: process.env.TUT_HEADED === '1',
  });
  console.log(`  ✓ Narraciones: ${narrations.length}`);

  console.log('\n[2/2] Mezclando…');
  await compose({ webmPath, narrations, outputMp4Path: outputMp4, fadeMs: 500 });
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  const stat = fs.statSync(outputMp4);
  console.log(`\n✅ ${outputMp4} (${(stat.size / 1024 / 1024).toFixed(1)} MB)\n`);
}

main().catch(err => { console.error('\n❌ ERROR:', err.message); if (err.stack) console.error(err.stack); process.exit(1); });
