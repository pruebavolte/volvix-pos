// Wrap cada llamada a renderXxxWidget en try/catch para que un widget roto
// no mate el render completo del brand. El brand renderiza sin el widget.
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('D:/github/volvix-pos/public')
  .filter(f => f.endsWith('.html'))
  .map(f => path.join('D:/github/volvix-pos/public', f));

let patched = 0;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  // Buscar el patrón típico de renderLiveDemo
  if (!c.includes("if (ld.type === 'stock'")) continue;
  // Si ya tiene try, skip
  if (c.includes("// V9.0.6 try-catch widgets")) continue;

  // Reemplazar el bloque de if (ld.type === ...) con un try/catch
  const oldBlock = `    if (ld.type === 'stock')   widget = renderStockWidget(ld.data);
    if (ld.type === 'kds')     widget = renderKdsWidget(ld.data);
    if (ld.type === 'booking') widget = renderBookingWidget(ld.data);
    if (ld.type === 'expiry')  widget = renderExpiryWidget(ld.data);
    if (ld.type === 'fiado')   widget = renderFiadoWidget(ld.data);`;
  const newBlock = `    try { // V9.0.6 try-catch widgets — un widget roto NO mata el brand
      if (ld.type === 'stock')   widget = renderStockWidget(ld.data);
      if (ld.type === 'kds')     widget = renderKdsWidget(ld.data);
      if (ld.type === 'booking') widget = renderBookingWidget(ld.data);
      if (ld.type === 'expiry')  widget = renderExpiryWidget(ld.data);
      if (ld.type === 'fiado')   widget = renderFiadoWidget(ld.data);
    } catch (_e) {
      widget = '<div class="v-widget"><div class="v-widget-bar">Demo en vivo</div><div style="padding:24px;color:#888">Vista previa del módulo \\u00b7 contáctanos para demo completo</div></div>';
    }`;

  if (c.includes(oldBlock)) {
    c = c.replace(oldBlock, newBlock);
    fs.writeFileSync(f, c);
    patched++;
  }
}
console.log(`Patched ${patched} files with try/catch widgets`);
