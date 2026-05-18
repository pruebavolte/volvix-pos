// V2: encuentra <a> con texto que contenga "empezar" y href="#" o vacío → /registro.html?giro=<slug>
// Trabaja con regex sobre el HTML directo (no parser DOM completo, demasiado lento para 218 archivos).
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('public/*.html', { cwd: path.join(__dirname, '..', '..') })
  .map(f => path.join(__dirname, '..', '..', f))
  .filter(f => {
    const name = path.basename(f);
    return !['registro.html','login.html','marketplace.html','index.html','volvix-launcher.html'].some(skip => name === skip)
      && !name.startsWith('landing-') && !name.startsWith('pos') && !name.startsWith('paneldecontrol')
      && !name.startsWith('salvadorex') && !name.startsWith('volvix_owner_panel') && !name.startsWith('multipos')
      && !name.startsWith('etiqueta') && !name.startsWith('volvix-') && !name.startsWith('volvix_')
      && !name.startsWith('test-') && !name.startsWith('fase4-') && !name.startsWith('admin-')
      && !name.startsWith('customer-portal');
  });

// Regex: <a ... href="#" ... > Empezar gratis </a>
// Cubre: <a href="#" class="..."> Empezar gratis →</a>
// También: <a class="..." href="#" > Empezar gratis </a>
// Captura el TAG completo y reemplaza href="#"
const RE = /<a\b([^>]*?)href="#"([^>]*?)>([^<]{0,80}empezar[^<]{0,80})<\/a>/gi;

let totalReplaced = 0;
let filesChanged = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const slug = path.basename(f, '.html');
  const replacement = `<a$1href="/registro.html?giro=${slug}"$2>$3</a>`;
  const out = src.replace(RE, (match, p1, p2, p3) => {
    totalReplaced++;
    return `<a${p1}href="/registro.html?giro=${slug}"${p2}>${p3}</a>`;
  });
  if (out !== src) {
    fs.writeFileSync(f, out);
    filesChanged++;
  }
}

console.log(`Archivos modificados: ${filesChanged}`);
console.log(`Total botones href="#" empezar reparados: ${totalReplaced}`);
