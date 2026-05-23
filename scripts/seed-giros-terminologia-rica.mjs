#!/usr/bin/env node
/**
 * seed-giros-terminologia-rica.mjs
 *
 * Enriquece metadata.terminologia para los TOP 20 giros con terminología
 * real y rica (15+ keys cada uno) para que applyGiroConfig.js tenga
 * material suficiente para diferenciar visualmente cada giro.
 *
 * Estrategia:
 *   1. Fetch row existente (giros_maestro?slug=eq.X&select=metadata)
 *   2. Mergear con array metadata.terminologia previo (preservar lo que no choca por `generico`)
 *   3. PATCH giros_maestro
 *
 * NOTA: No usamos UPSERT porque hay constraint NOT NULL en `nombre`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const raw = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf-8');
  const env = {};
  raw.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      env[m[1]] = v.replace(/\\n$/, '');
    }
  });
  return env;
}
const env = readEnv();
const SUPA_URL = env.SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_URL || !SUPA_KEY) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
  process.exit(1);
}

// ============================================================================
// TERMINOLOGÍA RICA — 20 giros × 15+ keys
// ============================================================================
const TERMINOLOGIA = {
  restaurante: {
    cliente: 'Comensal',
    producto: 'Platillo',
    platillo: 'Platillo',
    ticket: 'Comanda',
    venta: 'Pedido',
    pedido: 'Pedido',
    cobrar: 'Cobrar cuenta',
    inventario: 'Despensa',
    almacen: 'Cocina',
    agregar: 'Agregar al pedido',
    nuevo: 'Nueva comanda',
    buscar: 'Buscar platillo',
    pagar: 'Cerrar cuenta',
    caja: 'Caja',
    corte: 'Corte de caja',
    mesa: 'Mesa',
    punto_de_venta: 'Cocina',
    servicio: 'Servicio a mesa',
    empleado: 'Mesero',
    carrito: 'Comanda',
  },
  taqueria: {
    cliente: 'Cliente',
    producto: 'Taco',
    platillo: 'Orden',
    ticket: 'Orden',
    venta: 'Orden',
    pedido: 'Orden',
    cobrar: 'Cobrar',
    inventario: 'Insumos',
    almacen: 'Cocina',
    agregar: 'Agregar a la orden',
    nuevo: 'Nueva orden',
    buscar: 'Buscar taco',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    mesa: 'Mesa',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Taquero',
    carrito: 'Orden',
  },
  cafeteria: {
    cliente: 'Cliente',
    producto: 'Bebida',
    platillo: 'Bebida',
    ticket: 'Orden',
    venta: 'Orden',
    pedido: 'Orden',
    cobrar: 'Cobrar',
    inventario: 'Insumos',
    almacen: 'Barra',
    agregar: 'Agregar a la orden',
    nuevo: 'Nueva orden',
    buscar: 'Buscar bebida',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    mesa: 'Mesa',
    punto_de_venta: 'Barra',
    servicio: 'Servicio',
    empleado: 'Barista',
    carrito: 'Orden',
  },
  abarrotes: {
    cliente: 'Cliente',
    producto: 'Producto',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Inventario',
    almacen: 'Bodega',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar producto',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte de caja',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Encargado',
    carrito: 'Ticket',
    proveedor: 'Proveedor',
  },
  minisuper: {
    cliente: 'Cliente',
    producto: 'Producto',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Inventario',
    almacen: 'Bodega',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar producto',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte de caja',
    punto_de_venta: 'Caja',
    servicio: 'Servicio',
    empleado: 'Cajero',
    carrito: 'Carrito',
    proveedor: 'Proveedor',
  },
  farmacia: {
    cliente: 'Paciente',
    producto: 'Medicamento',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Inventario',
    almacen: 'Bodega',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar medicamento',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte de caja',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Farmacéutico',
    carrito: 'Receta',
    receta: 'Receta',
    lote: 'Lote',
  },
  fruteria: {
    cliente: 'Cliente',
    producto: 'Fruta',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Mostrador',
    almacen: 'Mostrador',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar fruta',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Encargado',
    carrito: 'Bolsa',
    granel: 'Granel',
  },
  carniceria: {
    cliente: 'Cliente',
    producto: 'Corte',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Cámara fría',
    almacen: 'Cámara fría',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar corte',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Carnicero',
    carrito: 'Pedido',
    kilo: 'Kilo',
  },
  polleria: {
    cliente: 'Cliente',
    producto: 'Pollo',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Cámara fría',
    almacen: 'Cámara fría',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar producto',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Pollero',
    carrito: 'Pedido',
    pieza: 'Pieza',
  },
  panaderia: {
    cliente: 'Cliente',
    producto: 'Pan',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Producción',
    almacen: 'Horno',
    agregar: 'Agregar a la charola',
    nuevo: 'Nueva venta',
    buscar: 'Buscar pan',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Panadero',
    carrito: 'Charola',
    pieza: 'Pieza',
  },
  pasteleria: {
    cliente: 'Cliente',
    producto: 'Pastel',
    ticket: 'Pedido',
    venta: 'Pedido',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Producción',
    almacen: 'Cocina',
    agregar: 'Agregar al pedido',
    nuevo: 'Nuevo pedido',
    buscar: 'Buscar pastel',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Pastelero',
    carrito: 'Pedido',
    anticipo: 'Anticipo',
  },
  barberia: {
    cliente: 'Cliente',
    producto: 'Servicio',
    ticket: 'Cita',
    venta: 'Servicio',
    pedido: 'Cita',
    cobrar: 'Cobrar servicio',
    inventario: 'Productos',
    almacen: 'Almacén',
    agregar: 'Agregar servicio',
    nuevo: 'Nueva cita',
    buscar: 'Buscar servicio',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Barbero',
    carrito: 'Cita',
    cita: 'Cita',
    comision: 'Comisión',
  },
  'salon-belleza': {
    cliente: 'Cliente',
    producto: 'Servicio',
    ticket: 'Cita',
    venta: 'Servicio',
    pedido: 'Cita',
    cobrar: 'Cobrar servicio',
    inventario: 'Productos',
    almacen: 'Almacén',
    agregar: 'Agregar servicio',
    nuevo: 'Nueva cita',
    buscar: 'Buscar servicio',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Recepción',
    servicio: 'Servicio',
    empleado: 'Estilista',
    carrito: 'Cita',
    cita: 'Cita',
    comision: 'Comisión',
  },
  veterinaria: {
    cliente: 'Dueño',
    producto: 'Producto/Tratamiento',
    ticket: 'Consulta',
    venta: 'Consulta',
    pedido: 'Consulta',
    cobrar: 'Cobrar consulta',
    inventario: 'Inventario',
    almacen: 'Almacén',
    agregar: 'Agregar a la consulta',
    nuevo: 'Nueva consulta',
    buscar: 'Buscar producto',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Recepción',
    servicio: 'Servicio',
    empleado: 'Veterinario',
    carrito: 'Consulta',
    paciente: 'Mascota',
    expediente: 'Expediente',
  },
  'clinica-dental': {
    cliente: 'Paciente',
    producto: 'Tratamiento',
    ticket: 'Consulta',
    venta: 'Consulta',
    pedido: 'Consulta',
    cobrar: 'Cobrar consulta',
    inventario: 'Insumos',
    almacen: 'Almacén',
    agregar: 'Agregar tratamiento',
    nuevo: 'Nueva consulta',
    buscar: 'Buscar tratamiento',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Recepción',
    servicio: 'Tratamiento',
    empleado: 'Doctor',
    carrito: 'Consulta',
    cita: 'Cita',
    expediente: 'Expediente',
  },
  optica: {
    cliente: 'Paciente',
    producto: 'Armazón',
    ticket: 'Orden',
    venta: 'Venta',
    pedido: 'Orden de trabajo',
    cobrar: 'Cobrar',
    inventario: 'Inventario',
    almacen: 'Almacén',
    agregar: 'Agregar a la orden',
    nuevo: 'Nueva orden',
    buscar: 'Buscar armazón',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Mostrador',
    servicio: 'Examen',
    empleado: 'Optometrista',
    carrito: 'Orden',
    receta: 'Graduación',
    anticipo: 'Anticipo',
  },
  ferreteria: {
    cliente: 'Cliente',
    producto: 'Artículo',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Inventario',
    almacen: 'Bodega',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar artículo',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte de caja',
    punto_de_venta: 'Mostrador',
    servicio: 'Servicio',
    empleado: 'Vendedor',
    carrito: 'Ticket',
    cotizacion: 'Cotización',
    proveedor: 'Proveedor',
  },
  ropa: {
    cliente: 'Cliente',
    producto: 'Prenda',
    ticket: 'Ticket',
    venta: 'Venta',
    pedido: 'Pedido',
    cobrar: 'Cobrar',
    inventario: 'Inventario',
    almacen: 'Bodega',
    agregar: 'Agregar al ticket',
    nuevo: 'Nueva venta',
    buscar: 'Buscar prenda',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte de caja',
    punto_de_venta: 'Probador',
    servicio: 'Servicio',
    empleado: 'Vendedor',
    carrito: 'Bolsa',
    talla: 'Talla',
    devolucion: 'Devolución',
  },
  'taller-mecanico': {
    cliente: 'Cliente',
    producto: 'Refacción',
    ticket: 'Orden de servicio',
    venta: 'Servicio',
    pedido: 'Orden de servicio',
    cobrar: 'Cobrar servicio',
    inventario: 'Refacciones',
    almacen: 'Almacén',
    agregar: 'Agregar a la orden',
    nuevo: 'Nueva orden',
    buscar: 'Buscar refacción',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Recepción',
    servicio: 'Servicio',
    empleado: 'Mecánico',
    carrito: 'Orden de servicio',
    vehiculo: 'Vehículo',
    cotizacion: 'Cotización',
  },
  gimnasio: {
    cliente: 'Miembro',
    producto: 'Membresía',
    ticket: 'Recibo',
    venta: 'Cobro',
    pedido: 'Inscripción',
    cobrar: 'Cobrar membresía',
    inventario: 'Inventario',
    almacen: 'Almacén',
    agregar: 'Agregar al recibo',
    nuevo: 'Nueva membresía',
    buscar: 'Buscar miembro',
    pagar: 'Pagar',
    caja: 'Caja',
    corte: 'Corte del día',
    punto_de_venta: 'Recepción',
    servicio: 'Clase',
    empleado: 'Entrenador',
    carrito: 'Recibo',
    membresia: 'Membresía',
    asistencia: 'Asistencia',
  },
};

// ============================================================================
// Helpers Supabase
// ============================================================================
async function fetchRow(slug) {
  const url = `${SUPA_URL}/rest/v1/giros_maestro?slug=eq.${encodeURIComponent(slug)}&select=slug,nombre,metadata`;
  const r = await fetch(url, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  if (!r.ok) throw new Error(`GET ${slug} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const arr = await r.json();
  return arr[0] || null;
}

async function patchRow(slug, patch) {
  const url = `${SUPA_URL}/rest/v1/giros_maestro?slug=eq.${encodeURIComponent(slug)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`PATCH ${slug} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/**
 * Merge: nuevo wins por key `generico`. Conservamos entradas previas que
 * no choquen (i.e. genericos que no estén en el nuevo objeto).
 */
function mergeTerminologia(prevArr, newObj) {
  const prev = Array.isArray(prevArr) ? prevArr : [];
  const seen = new Set(Object.keys(newObj));
  const merged = [];
  // entradas nuevas
  for (const [generico, este_giro] of Object.entries(newObj)) {
    merged.push({ generico, este_giro });
  }
  // preservar entradas previas que no choquen
  for (const entry of prev) {
    if (entry && entry.generico && !seen.has(entry.generico)) {
      merged.push(entry);
    }
  }
  return merged;
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  const slugs = Object.keys(TERMINOLOGIA);
  console.log(`Procesando ${slugs.length} giros TOP...\n`);

  let updated = 0;
  let failed = 0;
  let notFound = 0;
  const keysPerGiro = [];

  for (const slug of slugs) {
    try {
      const row = await fetchRow(slug);
      if (!row) {
        console.warn(`  [WARN] ${slug} no encontrado en giros_maestro`);
        notFound++;
        continue;
      }
      const meta = Object.assign({}, row.metadata || {});
      const newTerm = TERMINOLOGIA[slug];
      meta.terminologia = mergeTerminologia(meta.terminologia, newTerm);
      await patchRow(slug, { metadata: meta });
      keysPerGiro.push(meta.terminologia.length);
      updated++;
      console.log(`  [OK] ${slug.padEnd(20)} → ${meta.terminologia.length} keys`);
    } catch (e) {
      failed++;
      console.error(`  [FAIL] ${slug}:`, e.message);
    }
  }

  const avg = keysPerGiro.length
    ? (keysPerGiro.reduce((a, b) => a + b, 0) / keysPerGiro.length).toFixed(1)
    : 0;

  console.log('\n=== RESUMEN ===');
  console.log(`  Actualizados: ${updated}/${slugs.length}`);
  console.log(`  Falló: ${failed}`);
  console.log(`  No encontrados: ${notFound}`);
  console.log(`  Promedio keys/giro: ${avg}`);

  // Verificación final: 3 giros sample
  console.log('\n=== VERIFICACIÓN (3 samples) ===');
  for (const slug of ['restaurante', 'barberia', 'fruteria']) {
    const row = await fetchRow(slug);
    if (!row) {
      console.log(`\n  ${slug}: NO ENCONTRADO`);
      continue;
    }
    const term = (row.metadata && row.metadata.terminologia) || [];
    console.log(`\n  ${slug} (${term.length} keys):`);
    term.forEach((t) => console.log(`    ${(t.generico || '').padEnd(20)} → ${t.este_giro}`));
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
