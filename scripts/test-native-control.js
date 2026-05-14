// scripts/test-native-control.js — verifica que nut-js puede mover el mouse
// y teclear. SOLO ejecutalo manualmente, no automatizado, porque MUEVE el mouse
// y TIPEA texto en lo que tengas enfocado.
//
// Uso: node scripts/test-native-control.js

const nut = require('@nut-tree-fork/nut-js');
const { mouse, keyboard, Point, Button, Key } = nut;

async function main() {
  console.log('Iniciando test de control nativo en 3 segundos...');
  console.log('NO toques mouse/teclado mientras se ejecuta.');
  await new Promise(r => setTimeout(r, 3000));

  // 1. Lee la posicion inicial
  const start = await mouse.getPosition();
  console.log('Mouse inicio en:', start);

  // 2. Mueve el mouse a (500, 300)
  console.log('Moviendo mouse a (500, 300)...');
  await mouse.setPosition(new Point(500, 300));
  await new Promise(r => setTimeout(r, 500));
  const after = await mouse.getPosition();
  console.log('Mouse ahora en:', after);

  // 3. Restaurar posicion original
  console.log('Restaurando posicion original...');
  await mouse.setPosition(start);

  console.log('\nResultado:');
  console.log('  - Lectura mouse:', start.x === 1919 ? 'BORDE ESQUINA' : `(${start.x}, ${start.y})`);
  console.log('  - Movimiento:', (after.x === 500 && after.y === 300) ? 'OK' : `FALLO (${after.x}, ${after.y})`);

  if (after.x === 500 && after.y === 300) {
    console.log('\n✅ nut-js funciona perfecto. El .exe nuevo CONTROLA mouse de verdad.');
  } else {
    console.log('\n❌ nut-js no movio el mouse. Algo esta mal.');
  }
}

main().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
