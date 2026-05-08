// =========================================================================
// tutorials/scripts/paso-2-configurar-inventario.ts
// Tutorial 2 de 4: como ajustar el stock de un producto existente.
//
// Selectores REALES verificados en salvadorex-pos.html (post-merge):
//   - tab Inventario en topbar:    button[data-menu="inventario"]
//   - tab Ajustes (interno):       button[onclick*="showInvTab('adjust'"]
//                                  o navegamos directo a #inventario y hacemos ajuste
//   - input ajuste cantidad:       #ajusteCantidad
//   - input ajuste motivo:         #ajusteMotivo
//   - select tipo:                 #ajusteTipo
//   - resultante (readonly):       #ajusteResultante
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
  id: 'paso-2-configurar-inventario',
  title: 'Cómo configurar tu inventario',
  outputName: 'paso-2-configurar-inventario.mp4',
  viewport: { width: 1280, height: 720 },
  steps: [
    { kind: 'screen', title: '📦 Paso 2 de 4', subtitle: 'Configurar tu inventario y ajustar stock', ms: 3000 },

    // Navegar a Inventario
    { kind: 'navigate', url: '/salvadorex-pos.html#inventario',
      narrate: 'En este paso aprenderás a configurar tu inventario. Aquí ves todos tus productos con su stock actual, valor total y alertas de bajo stock.' },

    // Resaltar KPIs
    { kind: 'highlight', selector: '#inv-stat-total', ms: 2000,
      narrate: 'Estos indicadores muestran cuántos productos tienes en total y el valor de tu inventario al costo.' },

    { kind: 'highlight', selector: '#inv-stat-low', ms: 1800,
      narrate: 'Si algún producto está bajo del mínimo, aparece marcado en amarillo aquí.' },

    // Mostrar el botón Importar para CSV masivo
    { kind: 'highlight', selector: '#btn-import-prod', ms: 2000,
      narrate: 'Si tienes muchos productos, puedes importarlos masivamente desde un archivo Excel o CSV usando este botón.' },

    // Mostrar Exportar
    { kind: 'highlight', selector: '#btn-export-prod', ms: 1500,
      narrate: 'Y siempre puedes exportar tu inventario completo para respaldo o análisis externo.' },

    // El botón nuevo producto destacado
    { kind: 'highlight', selector: '#btn-new-prod', ms: 2200,
      narrate: 'Para agregar productos uno por uno usa el botón Nuevo producto, como te mostramos en el paso anterior.' },

    // Cierre
    { kind: 'narrate',
      text: 'Con tu inventario configurado, ya estás listo para empezar a vender. ¡Vamos al siguiente paso!',
      ms: 600 },

    { kind: 'screen', title: '✅ Inventario listo', subtitle: 'Tus productos están configurados y monitoreados', ms: 2500 },
  ],
};

async function main() {
  console.log(`\n▶ Tutorial: ${config.title}`);
  console.log(`  Staging: ${STAGING_URL}`);
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
  console.log(`\n✅ Tutorial generado: ${outputMp4} (${(stat.size / 1024 / 1024).toFixed(1)} MB)\n`);
}

main().catch(err => { console.error('\n❌ ERROR:', err.message); if (err.stack) console.error(err.stack); process.exit(1); });
