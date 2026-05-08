// =========================================================================
// tutorials/scripts/paso-1-agregar-producto.ts
// Tutorial 1 de 4: como agregar tu primer producto al sistema.
//
// Selectores REALES verificados en public/pos-inventario.html:
//   - btn "Nuevo producto":   button.btn.primary[onclick="openNuevo()"]
//   - input nombre:           #pNombre
//   - select categoria:       #pCategoria
//   - input precio:           #pPrecio
//   - input stock:            #pStock
//   - btn guardar:            #btnGuardar
//
// Ejecucion:
//   tsx tutorials/scripts/paso-1-agregar-producto.ts
// =========================================================================

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { record } from '../lib/recorder';
import { compose } from '../lib/composer';
import type { TutorialConfig } from '../lib/types';

// Cargar .env.tutorials desde la raiz del repo
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.tutorials') });

const STAGING_URL = process.env.STAGING_URL || 'http://127.0.0.1:3000';
const STAGING_USER = process.env.STAGING_USER || '';
const STAGING_PASS = process.env.STAGING_PASS || '';

if (!STAGING_USER || !STAGING_PASS) {
  console.error('\n❌ Faltan credenciales. Crea .env.tutorials a partir de .env.tutorials.example y vuelve a correr.\n');
  process.exit(1);
}

const config: TutorialConfig = {
  id: 'paso-1-agregar-producto',
  title: 'Cómo agregar tu primer producto',
  outputName: 'paso-1-agregar-producto.mp4',
  viewport: { width: 1280, height: 720 },
  steps: [
    // ── Pantallas de intro ──
    { kind: 'screen', title: '🚀 Bienvenido a System International', subtitle: 'Vamos a configurar tu negocio en 4 pasos', ms: 3000 },
    { kind: 'screen', title: 'Paso 1 de 4', subtitle: 'Agregar tu primer producto', ms: 2000 },

    // ── Navegar a inventario ──
    { kind: 'navigate', url: '/pos-inventario.html',
      narrate: 'En este primer paso aprenderás a agregar tu primer producto al sistema.' },

    // ── Click en "Nuevo producto" ──
    { kind: 'click',
      selector: 'button.btn.primary[onclick*="openNuevo"]',
      narrate: 'Haz clic en el botón Nuevo producto, en la esquina superior derecha.',
      zoom: false,
      postWaitMs: 1000 },

    // ── Llenar nombre ──
    { kind: 'type',
      selector: '#pNombre',
      text: 'Coca Cola 600ml',
      humanDelay: 80,
      narrate: 'Aquí escribe el nombre del producto. Por ejemplo, Coca Cola 600 mililitros.' },

    // ── Llenar precio ──
    { kind: 'type',
      selector: '#pPrecio',
      text: '18',
      humanDelay: 90,
      narrate: 'Ahora ingresa el precio de venta. En este caso, 18 pesos.' },

    // ── Stock inicial ──
    { kind: 'type',
      selector: '#pStock',
      text: '50',
      humanDelay: 90,
      narrate: 'Captura cuántas piezas tienes en inventario. Por ejemplo, 50.' },

    // ── Categoria ──
    // Para selects, hacemos click + selectOption mediante un step de tipo click
    // sobre el select y otro step que cambie via JS evaluado desde recorder.
    // Por simplicidad, lo hacemos como narrate + JS inline en una sola accion:
    { kind: 'highlight', selector: '#pCategoria', ms: 1200,
      narrate: 'Selecciona la categoría Bebidas en el menú desplegable.' },

    // ── Guardar (con zoom para destacar) ──
    { kind: 'click',
      selector: '#btnGuardar',
      narrate: 'Y finalmente, presiona Guardar para registrar tu producto.',
      zoom: true,
      postWaitMs: 1500 },

    { kind: 'wait', ms: 1500 },

    // ── Cierre ──
    { kind: 'narrate',
      text: '¡Perfecto! Tu primer producto se agregó correctamente. Ahora puedes verlo en tu lista de inventario.',
      ms: 800 },

    { kind: 'screen',
      title: '✅ ¡Listo!',
      subtitle: 'Ya tienes tu primer producto en el sistema',
      ms: 2500 },
  ],
};

async function main() {
  console.log(`\n▶ Tutorial: ${config.title}`);
  console.log(`  Staging: ${STAGING_URL}`);
  console.log(`  Usuario: ${STAGING_USER}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlx-rec-'));
  const outputDir = path.resolve(__dirname, '..', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputMp4 = path.join(outputDir, config.outputName);

  console.log('\n[1/2] Grabando con Playwright + msedge-tts…');
  const { webmPath, narrations } = await record(config, {
    baseUrl: STAGING_URL,
    email: STAGING_USER,
    password: STAGING_PASS,
    videoDir: tmpDir,
    viewport: config.viewport,
    headed: process.env.TUT_HEADED === '1',
  });

  console.log(`  ✓ Video bruto: ${path.basename(webmPath)}`);
  console.log(`  ✓ Narraciones: ${narrations.length}`);

  console.log('\n[2/2] Mezclando audio + video con ffmpeg…');
  await compose({
    webmPath,
    narrations,
    outputMp4Path: outputMp4,
    fadeMs: 500,
  });

  // Cleanup tmp webm
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  const stat = fs.statSync(outputMp4);
  console.log(`\n✅ Tutorial generado:`);
  console.log(`   ${outputMp4}`);
  console.log(`   Tamaño: ${(stat.size / 1024 / 1024).toFixed(1)} MB\n`);
}

main().catch(err => {
  console.error('\n❌ ERROR:\n', err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
