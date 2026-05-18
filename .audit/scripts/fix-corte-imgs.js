const fs = require('fs');
const vm = require('vm');

let c = fs.readFileSync('D:/github/volvix-pos/public/brands.config.js','utf8');
const start = c.indexOf('const BRAND_CORTE = {');
let depth = 0, i = start + 22, inStr = null;
let end = -1;
while (i < c.length) {
  const ch = c[i];
  if (inStr) {
    if (ch === '\\') { i += 2; continue; }
    if (ch === inStr) inStr = null;
  } else {
    if (ch === "'" || ch === '"' || ch === '`') inStr = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') { if (depth === 0) { end = i + 1; break; } depth--; }
  }
  i++;
}

let block = c.slice(start, end);

const realImgs = [
  'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f',
  'https://images.unsplash.com/photo-1588168333986-5078d3ae3976',
  'https://images.unsplash.com/photo-1551782450-a2132b4ba21d',
  'https://images.unsplash.com/photo-1574781330855-d0db8cc6a79c',
  'https://images.unsplash.com/photo-1542751110-97427bbecf20'
];

let idx = 0;
block = block.replace(/'https:\/\/source\.unsplash\.com\/random\/[^']+'/g, () => {
  const img = realImgs[idx % realImgs.length];
  idx++;
  return "'" + img + "?w=1200&h=900&fit=crop&q=80'";
});

c = c.slice(0, start) + block + c.slice(end);
fs.writeFileSync('D:/github/volvix-pos/public/brands.config.js', c);
console.log('Replaced ' + idx + ' source.unsplash URLs in BRAND_CORTE');

try {
  vm.runInThisContext(c);
  console.log('Syntax OK');
} catch (e) {
  console.log('SYNTAX ERROR:', e.message);
}
