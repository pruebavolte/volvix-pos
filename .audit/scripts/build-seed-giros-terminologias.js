// Genera un INSERT SQL idempotente para giros_terminologias desde giros-terminologias.json
// Output: .audit/migrations/05-seed-giros-terminologias.sql (paste-ready)
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'data', 'giros-terminologias.json'),
  'utf8'
));

const NAMES = {
  default: 'Genérico',
  restaurante: 'Restaurante',
  cafeteria: 'Cafetería',
  taqueria: 'Taquería',
  navaja: 'Barbería',
  brillo: 'Estética',
  receta: 'Farmacia',
  pulso: 'Clínica / Dental',
  pata: 'Veterinaria',
  tendito: 'Abarrotes',
  folio: 'Hotel / Hospedaje',
  forja: 'Taller / Refaccionaria',
  tarima: 'Vinatería / Bar',
  refacciona: 'Refaccionaria',
  pareo: 'Boutique / Ropa',
  bloque: 'Construcción',
  gateo: 'Guardería',
  burbuja: 'Lavandería',
  almohada: 'Mueblería / Persianas',
  quilate: 'Joyería',
  tictac: 'Relojería',
  armazon: 'Óptica',
  mochila: 'Bebés / Maternidad',
  asa: 'Bolsas / Mercería',
  discreto: 'Sexshop',
  comedor: 'Comedor / Fonda',
  consome: 'Caldos / Sopas',
  nieve: 'Nieves / Helados',
  merengue: 'Postres / Repostería'
};

const lines = [];
lines.push("-- Seed giros_terminologias (30 giros prioritarios)");
lines.push("-- Generado por build-seed-giros-terminologias.js");
lines.push("-- Idempotente: usa ON CONFLICT (giro_slug, tenant_id) DO UPDATE");
lines.push("");
lines.push("BEGIN;");
lines.push("");

let count = 0;
for (const [slug, entry] of Object.entries(data)) {
  if (slug.startsWith('_')) continue;
  if (!entry.terminologias && !entry.modulos_activos) continue;
  const name = NAMES[slug] || slug;
  const terms = JSON.stringify(entry.terminologias || {}).replace(/'/g, "''");
  const modActive = JSON.stringify(entry.modulos_activos || []).replace(/'/g, "''");
  const modInactive = JSON.stringify(entry.modulos_inactivos || []).replace(/'/g, "''");
  lines.push(`INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)`);
  lines.push(`VALUES ('${slug}', '${name.replace(/'/g, "''")}', '${terms}'::jsonb, '${modActive}'::jsonb, '${modInactive}'::jsonb)`);
  lines.push(`ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET`);
  lines.push(`  terminologias = EXCLUDED.terminologias,`);
  lines.push(`  modulos_activos = EXCLUDED.modulos_activos,`);
  lines.push(`  modulos_inactivos = EXCLUDED.modulos_inactivos,`);
  lines.push(`  giro_name = EXCLUDED.giro_name,`);
  lines.push(`  updated_at = now();`);
  lines.push("");
  count++;
}

lines.push("COMMIT;");
lines.push("");
lines.push(`-- Total giros seedeados: ${count}`);
lines.push(`-- Verificar: SELECT count(*) FROM giros_terminologias; -- Esperado: >= ${count}`);

const out = path.join(__dirname, '..', 'migrations', '05-seed-giros-terminologias.sql');
fs.writeFileSync(out, lines.join('\n'));
console.log(`Wrote ${out}`);
console.log(`Total giros seedeados: ${count}`);
