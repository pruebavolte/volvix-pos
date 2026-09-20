// Helper adb para explorar la app Loyverse del Motorola SIN modificar nada (solo navegar).
// Uso: node loy.js dump | tap "<texto>" | tapxy X Y | back | shot nombre | snap nombre [png] | scroll up|down
// snap: espera 1.3 s y guarda nombre.txt (texto de la pantalla, sin coordenadas) y, con 'png', nombre.png. NUNCA toca guardar/cobrar/borrar.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = 'ZT322LGDTN';
const DIR = __dirname;
const BLACK = /eliminar|borrar|cerrar sesi|salir|desconect|cobrar|pagar|reembols|anular|sincroniz|reiniciar|restablec|vaciar|cancelar ticket|borrar cuenta|guardar|confirmar|depositar|pagos\/salidas|retirar|combinar|fusionar|imprimir|enviar|compartir|invitar|crear|registrar|aplicar|descartar|si, |sí, /i;
// Reintenta: con poca RAM en la PC adb/spawn fallan de forma intermitente (bad_alloc / UNKNOWN)
const adb = (...a) => {
  let err;
  for (let i = 0; i < 4; i++) {
    try { return execFileSync('adb', ['-s', S, ...a], { maxBuffer: 64 * 1024 * 1024 }); }
    catch (e) { err = e; try { execFileSync('ping', ['-n', '3', '127.0.0.1'], { stdio: 'ignore' }); } catch (_) {} }
  }
  throw err;
};
// GUARDIA: solo se toca la pantalla si la app en primer plano es Loyverse (una notificacion de WhatsApp
// puede robar el toque y abrir un chat del dueno: ya paso una vez). Si no lo es, NO toca nada.
function fgOk() {
  try {
    const out = adb('shell', 'dumpsys', 'activity', 'activities').toString('utf8');
    const m = out.match(/topResumedActivity=ActivityRecord\{[^}]*? ([\w.]+)\//);
    return !!(m && m[1] === 'com.loyverse.sale');
  } catch (_) { return false; }
}
// Una notificacion emergente (heads-up de WhatsApp, etc.) es una ventana de SystemUI encima de Loyverse y se
// come el toque: se detecta por nodos de com.android.systemui con texto y debajo de la barra de estado.
function headsUp() {
  try {
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
    const xml = adb('exec-out', 'cat', '/sdcard/ui.xml').toString('utf8');
    return xml.split('<node ').some((n) => /package="com\.android\.systemui"/.test(n) && /\btext="[^"]+"/.test(n) && +((n.match(/bounds="\[\d+,(\d+)\]/) || [])[1] || 0) >= 80);
  } catch (_) { return false; }
}
function needFg() {
  if (!fgOk()) { console.log('ABORTADO: Loyverse no esta en primer plano; no se toca nada'); process.exit(3); }
  for (let i = 0; i < 10 && headsUp(); i++) { if (i === 9) { console.log('ABORTADO: notificacion emergente encima; no se toca nada'); process.exit(4); } execFileSync('ping', ['-n', '2', '127.0.0.1'], { stdio: 'ignore' }); }
}
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
  needFg();
  if (BLACK.test(a)) { console.log('BLOQUEADO por lista negra:', a); process.exit(0); }
  const n = dump().find(x => (x.text || x.desc).trim().toLowerCase() === a.trim().toLowerCase()) || dump().find(x => (x.text || x.desc).toLowerCase().includes(a.toLowerCase()));
  if (!n) { console.log('no encontrado:', a); process.exit(1); }
  adb('shell', 'input', 'tap', String(n.cx), String(n.cy)); console.log('tap', n.text || n.desc, n.cx, n.cy);
} else if (cmd === 'tapxy') { needFg(); adb('shell', 'input', 'tap', a, b); console.log('tapxy', a, b); }
else if (cmd === 'back') { adb('shell', 'input', 'keyevent', '4'); console.log('back'); }
else if (cmd === 'shot') { fs.writeFileSync(path.join(DIR, (a || 'x') + '.png'), adb('exec-out', 'screencap', '-p')); console.log('shot', a); }
else if (cmd === 'scroll') { needFg(); adb('shell', 'input', 'swipe', '360', a === 'up' ? '1200' : '500', '360', a === 'up' ? '500' : '1200', '350'); console.log('scroll', a); }
else if (cmd === 'snap') {
  require('child_process').execSync('ping -n 2 127.0.0.1 >nul 2>&1', { shell: true });
  const nodes = dump();
  const txt = nodes.map(n => (n.clickable ? '[btn] ' : '') + (n.checkable ? (n.checked ? '[x] ' : '[ ] ') : '') + (n.text || '') + (n.desc ? ' {' + n.desc + '}' : '') + (n.cls ? ' <' + n.cls + '>' : '')).join('\n');
  fs.writeFileSync(path.join(DIR, a + '.txt'), txt + '\n');
  if (b === 'png') fs.writeFileSync(path.join(DIR, a + '.png'), adb('exec-out', 'screencap', '-p'));
  console.log('snap', a, nodes.length + ' nodos', b === 'png' ? '+png' : '');
}
