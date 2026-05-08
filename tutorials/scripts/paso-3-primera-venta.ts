// =========================================================================
// tutorials/scripts/paso-3-primera-venta.ts
// Tutorial 3 de 4: como hacer tu primera venta en el POS.
//
// Selectores REALES verificados en salvadorex-pos.html:
//   - input barcode/codigo:        #barcode-input
//   - boton ENTER agregar producto: button[onclick*="searchProduct"]
//   - boton F12 Cobrar:             button.btn-cobrar  o  button[data-vlx-button="F12_cobrar"]
//   - total-big:                    #total-big
//   - F5 Cambiar / F6 Pendiente / Eliminar / Asignar cliente / F12 Cobrar
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
  id: 'paso-3-primera-venta',
  title: 'Cómo realizar tu primera venta',
  outputName: 'paso-3-primera-venta.mp4',
  viewport: { width: 1280, height: 720 },
  steps: [
    { kind: 'screen', title: '🛒 Paso 3 de 4', subtitle: 'Realiza tu primera venta', ms: 3000 },

    // Navegar al POS principal
    { kind: 'navigate', url: '/salvadorex-pos.html',
      narrate: 'Bienvenido al punto de venta. Aquí es donde haces dinero. Te voy a mostrar lo básico.' },

    // Resaltar el campo de código de producto
    { kind: 'highlight', selector: '#barcode-input', ms: 2200,
      narrate: 'Aquí escaneas el código de barras del producto, o escribes su código manualmente.' },

    // Resaltar la barra de acciones rápidas del POS
    { kind: 'highlight', selector: '.pos-actions', ms: 1800,
      narrate: 'Aquí tienes botones de acceso rápido: artículos varios, búsqueda, mayoreo, descuentos y más.' },

    // El total
    { kind: 'highlight', selector: '#total-big', ms: 2000,
      narrate: 'En este recuadro grande verás el total de la venta en tiempo real conforme agregas productos.' },

    // El botón cobrar
    { kind: 'highlight', selector: '.btn-cobrar', ms: 2500,
      narrate: 'Cuando termines de agregar todo lo que el cliente lleva, presiona F12 o haz clic aquí para cobrar.' },

    // Cierre
    { kind: 'narrate',
      text: 'Una vez cobres, podrás elegir el método de pago — efectivo, tarjeta, transferencia o lo que tengas configurado. ¡Y listo, tu primera venta!',
      ms: 800 },

    { kind: 'screen', title: '🎉 ¡Tu primera venta!', subtitle: 'Ya estás listo para vender en grande', ms: 2500 },
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
