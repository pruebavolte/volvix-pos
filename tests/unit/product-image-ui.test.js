'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', '..', 'public', 'salvadorex-pos.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function loadSafeRemoteProductImageUrl() {
  const match = html.match(/function safeRemoteProductImageUrl\(value\) \{[\s\S]*?\n  \}\n  function imageUrlAttr/);
  assert.ok(match, 'safeRemoteProductImageUrl must remain present');
  const functionSource = match[0].replace(/\n  function imageUrlAttr$/, '');
  return Function('window', `${functionSource}\nreturn safeRemoteProductImageUrl;`)({
    location: { href: 'https://negocio.international/salvadorex-pos.html' },
  });
}

describe('POS product remote-image UI contract', () => {
  test('keeps a customer-selected public HTTPS image unchanged', () => {
    const safeImage = loadSafeRemoteProductImageUrl();
    const selected = 'https://cdn.example.com/catalog/filtro.jpg?size=large';
    assert.equal(safeImage(selected), selected);
  });

  test('blocks local and non-HTTPS image targets in the browser', () => {
    const safeImage = loadSafeRemoteProductImageUrl();
    for (const unsafe of [
      'http://cdn.example.com/filtro.jpg',
      'https://localhost/filtro.jpg',
      'https://127.0.0.1/filtro.jpg',
      'https://169.254.169.254/latest/meta-data',
      'https://192.168.1.10/filtro.jpg',
      'https://[::1]/filtro.jpg',
      'https://[fd00::1]/filtro.jpg',
      'https://user:secret@example.com/filtro.jpg',
    ]) assert.equal(safeImage(unsafe), '', unsafe);
  });

  test('wires CSV image columns, exact barcode provenance and privacy-safe rendering', () => {
    assert.match(html, /nombre,codigo,categoria,precio,costo,stock,minimo,image_url,image_source_url,image_provider,image_license/);
    assert.match(html, /matched_by:\s*'barcode',[\s\S]*?exact_match:\s*true/);
    assert.match(html, /referrerpolicy="no-referrer"/);
    assert.match(html, /onerror="this\.dataset\.loadFailed='1'/);
    assert.match(html, /image_provenance:\s*imgUrlMain \? imageProvenance : undefined/);
  });
});
