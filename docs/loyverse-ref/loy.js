// Helper adb para explorar la app Loyverse del Motorola SIN modificar nada (solo navegar).
// Uso: node loy.js dump | tap "<texto>" | tapxy X Y | back | shot nombre | tree
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = 'ZT322LGDTN';
const DIR = __dirname;
const BLACK = /eliminar|borrar|cerrar sesi|salir|desconect|cobrar|pagar|reembols|anular|sincroniz|reiniciar|restablec|vaciar|cancelar ticket|borrar cuenta/i;
const adb = (...a) => execFileSync('adb', ['-s', S, ...a], { maxBuffer: 64 * 1024 * 1024 });
function dump() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/ui.xml').toString('utf8');
  const nodes = [];
  const re = /<node [^>]*?text="([^"]*)"[^>]*?class="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?checkable="(\w+)"[^>]*?checked="(\w+)"[^>]*?clickable="(\w+)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(xml))) {
    const [ , text, cls, desc, checkable, checked, clickable, x1, y1, x2, y2 ] = m;
    if (!text && !desc && clickable !== 'true') continue;
    nodes.push({ text, desc, cls: cls.split('.').pop(), clickable: clickable === 'true', checkable: checkable === 'true', checked: checked === 'true', cx: (+x1 + +x2) >> 1, cy: (+y1 + +y2) >> 1, y1: +y1, y2: +y2 });
  }
  return nodes;
}
function show(nodes) {
  return nodes.map(n => `${n.clickable ? '▣' : ' '} ${n.checkable ? (n.checked ? '[x]' : '[ ]') : '   '} ${n.text || ''}${n.desc ? ' {' + n.desc + '}' : ''}  (${n.cls} ${n.cx},${n.cy})`).join('\n');
}
const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'dump') console.log(show(dump()));
else if (cmd === 'tap') {
  if (BLACK.test(a)) { console.log('BLOQUEADO por lista negra:', a); process.exit(0); }
  const n = dump().find(x => (x.text || x.desc).trim().toLowerCase() === a.trim().toLowerCase()) || dump().find(x => (x.text || x.desc).toLowerCase().includes(a.toLowerCase()));
  if (!n) { console.log('no encontrado:', a); process.exit(1); }
  adb('shell', 'input', 'tap', String(n.cx), String(n.cy)); console.log('tap', n.text || n.desc, n.cx, n.cy);
} else if (cmd === 'tapxy') { adb('shell', 'input', 'tap', a, b); console.log('tapxy', a, b); }
else if (cmd === 'back') { adb('shell', 'input', 'keyevent', '4'); console.log('back'); }
else if (cmd === 'shot') { fs.writeFileSync(path.join(DIR, (a || 'x') + '.png'), adb('exec-out', 'screencap', '-p')); console.log('shot', a); }
else if (cmd === 'scroll') { adb('shell', 'input', 'swipe', '360', a === 'up' ? '1200' : '500', '360', a === 'up' ? '500' : '1200', '350'); console.log('scroll', a); }
