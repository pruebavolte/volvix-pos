// Fix defensivo para el widget tipo 'booking' que crashea cuando
// `taken` y `active` están en data (no por barbero).
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('D:/github/volvix-pos/public')
  .filter(f => f.endsWith('.html'))
  .map(f => path.join('D:/github/volvix-pos/public', f));

const OLD_PATTERN = `    const renderSlots = (idx) => {
      const b = d.barberos[idx];
      return d.slots.map((h, i) => {
        let cls = 'v-w-book-slot';
        if (b.taken.indexOf(i) !== -1) cls += ' taken';
        if (b.active === i) cls += ' active';
        return \`<button class="\${cls}">\${h}</button>\`;
      }).join('');
    };`;

const NEW_PATTERN = `    const renderSlots = (idx) => {
      const b = d.barberos[idx] || {};
      // V9.0.2 defensive: taken/active pueden estar en data O en barbero
      const _taken = (b.taken && Array.isArray(b.taken)) ? b.taken : (Array.isArray(d.taken) ? d.taken : []);
      const _active = (b.active !== undefined) ? b.active : d.active;
      return d.slots.map((h, i) => {
        let cls = 'v-w-book-slot';
        if (_taken.indexOf(i) !== -1) cls += ' taken';
        if (_active === i) cls += ' active';
        return \`<button class="\${cls}">\${h}</button>\`;
      }).join('');
    };`;

let patched = 0;
let skipped = 0;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (c.includes(OLD_PATTERN)) {
    fs.writeFileSync(f, c.replace(OLD_PATTERN, NEW_PATTERN));
    patched++;
  } else {
    skipped++;
  }
}
console.log(`Patched: ${patched}, Skipped: ${skipped}`);
