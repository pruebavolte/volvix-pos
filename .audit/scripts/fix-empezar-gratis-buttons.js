// Reemplaza href="#cta" por href="/registro.html?giro=<slug>" en todos los landings premium.
// "#cta" era un anchor que NO redirigía. El usuario quería ir a registro.
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
// Use forward slashes for glob (Windows backslash compatibility issue)
const files = glob.sync('public/*.html', { cwd: path.join(__dirname, '..', '..') }).map(f => path.join(__dirname, '..', '..', f)).filter(f => {
  const name = path.basename(f);
  // Skip pages que NO son landings premium (registro, login, POS, panel, etc)
  return !['registro.html','login.html','marketplace.html','index.html','volvix-launcher.html'].some(skip => name === skip)
    && !name.startsWith('landing-') // landings planas viejas
    && !name.startsWith('pos')
    && !name.startsWith('paneldecontrol')
    && !name.startsWith('salvadorex')
    && !name.startsWith('volvix_owner_panel')
    && !name.startsWith('multipos')
    && !name.startsWith('etiqueta')
    && !name.startsWith('volvix-')
    && !name.startsWith('volvix_')
    && !name.startsWith('test-')
    && !name.startsWith('fase4-')
    && !name.startsWith('admin-')
    && !name.startsWith('customer-portal');
});

let totalReplaced = 0;
let filesChanged = 0;
const errors = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const slug = path.basename(f, '.html');
  // Reemplazo cuidadoso: solo href="#cta" exacto (no #cta-secondary u otros)
  const re = /href="#cta"/g;
  const matches = src.match(re);
  if (!matches) continue;
  const out = src.replace(re, `href="/registro.html?giro=${slug}"`);
  fs.writeFileSync(f, out);
  totalReplaced += matches.length;
  filesChanged++;
}

console.log(`Archivos modificados: ${filesChanged}`);
console.log(`Total botones reparados: ${totalReplaced}`);
if (errors.length) console.log('Errores:', errors);
