// Reemplaza https://source.unsplash.com/random/WIDTHxHEIGHT/?KEYWORDS&q=Q
// por      https://loremflickr.com/WIDTH/HEIGHT/KEYWORDS
// en public/brands.config.js (y cualquier .js que use el mismo patrón).
const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, '..', '..', 'public', 'brands.config.js'),
];

// Pattern: https://source.unsplash.com/random/WIDTHxHEIGHT/?KEYWORDS[&q=Q]
const RE = /https:\/\/source\.unsplash\.com\/random\/(\d+)x(\d+)\/\?([^'"&]+)(?:&q=\d+)?/g;

let totalReplaced = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) { console.log('Skip (no existe):', file); continue; }
  const src = fs.readFileSync(file, 'utf8');
  let count = 0;
  const out = src.replace(RE, (_m, w, h, kw) => {
    count++;
    // loremflickr acepta múltiples keywords separados por coma (tag matching).
    // Limpiamos caracteres no válidos (mantenemos letras, dígitos, coma, guión).
    const cleanKw = kw.split(',').map(k => encodeURIComponent(k.trim())).join(',');
    return `https://loremflickr.com/${w}/${h}/${cleanKw}`;
  });
  if (count > 0) {
    fs.writeFileSync(file + '.bak', src); // backup
    fs.writeFileSync(file, out);
    console.log(`✅ ${file}: ${count} URLs reemplazadas (backup: ${file}.bak)`);
    totalReplaced += count;
  } else {
    console.log(`Skip (sin matches): ${file}`);
  }
}

console.log(`\nTotal URLs reemplazadas: ${totalReplaced}`);

// Smoke check rápido
const sample = fs.readFileSync(targets[0], 'utf8').match(/https:\/\/loremflickr\.com\/\d+\/\d+\/[^'"]+/g) || [];
console.log(`Primeras 3 URLs nuevas:`);
sample.slice(0, 3).forEach(s => console.log(' -', s));

// Verifica que NO quede source.unsplash
const remaining = fs.readFileSync(targets[0], 'utf8').match(/source\.unsplash\.com/g) || [];
console.log(`source.unsplash.com restantes: ${remaining.length}`);
