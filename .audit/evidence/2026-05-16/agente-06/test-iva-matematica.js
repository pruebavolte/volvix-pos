// AGENTE 6 — Verificacion matematica de IVA
// Escenario: 3 productos con precios feos + descuento  + IVA 16% post-descuento
const cart = [
  { price: 33.33, qty: 1 },  // .33
  { price: 17.77, qty: 2 },  // .54
  { price: 99.99, qty: 1 }   // .99
];
const grossSubtotal = 33.33 + 35.54 + 99.99;  // = 168.86
const discount = 20.00;
const taxableBase = grossSubtotal - discount;  // = 148.86
const ivaAmount = +(taxableBase * 0.16).toFixed(2);  // = 23.82
const total = +(taxableBase + ivaAmount).toFixed(2);  // = 172.68

console.log('grossSubtotal:', grossSubtotal);  // 168.86
console.log('discount:', discount);             // 20.00
console.log('taxableBase:', taxableBase);       // 148.86
console.log('ivaAmount:', ivaAmount);           // 23.82
console.log('total:', total);                   // 172.68

// Esperado: total = 172.68 (cuadra al centavo)
const expected = 172.68;
if (Math.abs(total - expected) > 0.01) {
  throw new Error('IVA calculo NO cuadra. Total: ' + total + ' Esperado: ' + expected);
}
console.log('OK matematica IVA cuadra al centavo');
