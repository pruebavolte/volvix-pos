// Agrega protección defensiva: ocultar #picker explícitamente con JS
// al inicio del IIFE, ANTES del render. Evita flash visual + cualquier
// caso donde el CSS body.loaded #picker no aplique a tiempo.
const fs = require('fs');
const path = require('path');
const glob = (dir, ext) => fs.readdirSync(dir).filter(f => f.endsWith(ext)).map(f => path.join(dir, f));

const files = glob('D:/github/volvix-pos/public', '.html').filter(f => {
  const c = fs.readFileSync(f, 'utf8');
  return c.includes("if (slug && BRANDS[slug])") && c.includes('document.getElementById(\'picker\')') === false;
});

console.log(`Will patch ${files.length} brand HTMLs`);

let patched = 0;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  // Buscar el patrón:  if (slug && BRANDS[slug]) {\n    renderBrand(BRANDS[slug]);
  // Reemplazar para hide picker INMEDIATAMENTE antes del render
  const oldPattern = `if (slug && BRANDS[slug]) {
    renderBrand(BRANDS[slug]);`;
  const newPattern = `if (slug && BRANDS[slug]) {
    // V9.0 defensive: ocultar picker INMEDIATAMENTE (antes incluso del CSS load)
    var _picker = document.getElementById('picker');
    if (_picker) _picker.style.display = 'none';
    renderBrand(BRANDS[slug]);`;

  if (c.includes(oldPattern)) {
    c = c.replace(oldPattern, newPattern);
    fs.writeFileSync(f, c);
    patched++;
  }
}
console.log(`Patched ${patched} files`);
