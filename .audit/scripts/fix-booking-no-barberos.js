// Fix definitivo del widget booking: hacerlo defensivo para casos
// donde d.barberos no existe (estructura alt: slots con name/available)
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('D:/github/volvix-pos/public')
  .filter(f => f.endsWith('.html'))
  .map(f => path.join('D:/github/volvix-pos/public', f));

const OLD = `function renderBookingWidget(d){
    const barberos = d.barberos.map((b, i) => \``;
const NEW = `function renderBookingWidget(d){
    // V9.0.4 defensive: si d.barberos no existe pero d.slots sí, usar estructura alt (slots con name/available)
    if (!Array.isArray(d.barberos) && Array.isArray(d.slots)) {
      const cards = d.slots.map(s => {
        const avail = s.available === false ? 'taken' : '';
        const hour = s.hour || s.time || '';
        const name = s.name || (avail ? 'Reservado' : 'Disponible');
        return \`<div class="v-w-book-alt-slot \${avail}"><div class="hour">\${hour}</div><div class="name">\${name}</div></div>\`;
      }).join('');
      return \`<div class="v-widget"><div class="v-widget-bar"><span class="live-dot"></span>Agenda · Hoy<span class="clock" id="ld-date">--</span></div><div class="v-w-book-alt">\${cards}</div></div>\`;
    }
    if (!Array.isArray(d.barberos)) {
      return \`<div class="v-widget"><div class="v-widget-bar">Agenda</div><div style="padding:24px;color:#888">Demo de agenda</div></div>\`;
    }
    const barberos = d.barberos.map((b, i) => \``;

let patched = 0;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (c.includes(OLD)) {
    fs.writeFileSync(f, c.replace(OLD, NEW));
    patched++;
  }
}
console.log(`Patched ${patched} files`);
