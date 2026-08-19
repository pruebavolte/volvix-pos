'use strict';
const assert = require('node:assert/strict');
const api = require('../../api/index.js');
const {
  normalizeHttpsImageUrl,
  normalizeProductImportInput,
  sanitizeProductImageProvenance,
  productImageJson,
  normalizeGtinBarcode,
  uniqueBulkImportName,
  mergeBulkImportDescription,
  buildBulkImportProduct,
  buildBulkImportUpdatePayload,
} = api.__test;

describe('bulk product import sanitization', () => {
  test('accepts only credential-free HTTPS image URLs', () => {
    assert.equal(normalizeHttpsImageUrl('https://cdn.example.com/catalog/producto.png'), 'https://cdn.example.com/catalog/producto.png');
    for (const unsafe of [
      'http://cdn.example.com/producto.png',
      'javascript:alert(1)',
      'data:image/png;base64,AA==',
      'file:///tmp/producto.png',
      'https://user:secret@example.com/producto.png',
      'https://localhost/producto.png',
      'https://127.0.0.1/producto.png',
      'https://10.20.30.40/producto.png',
      'https://172.16.0.1/producto.png',
      'https://192.168.1.10/producto.png',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/producto.png',
      'https://metadata.google.internal/producto.png',
      'not-a-url',
    ]) {
      assert.equal(normalizeHttpsImageUrl(unsafe), null, unsafe);
    }
  });

  test('normalizes Spanish CSV aliases and flat image provenance fields', () => {
    const normalized = normalizeProductImportInput({
      codigo: 'DOC-IMG-01',
      nombre: 'Producto con foto',
      precio: '25.50',
      imagen_url: 'https://cdn.example.com/producto.jpg',
      fuente_imagen_url: 'https://tienda.example.com/producto',
      proveedor_imagen: 'tienda_ejemplo',
      licencia_imagen: 'publicada_por_comercio',
    });
    assert.equal(normalized.code, 'DOC-IMG-01');
    assert.equal(normalized.name, 'Producto con foto');
    assert.equal(normalized.price, '25.50');
    assert.equal(normalized.image_url, 'https://cdn.example.com/producto.jpg');
    assert.deepEqual(normalized.image_provenance, {
      source_url: 'https://tienda.example.com/producto',
      provider: 'tienda_ejemplo',
      license: 'publicada_por_comercio',
    });
  });

  test('persists remote-link provenance and drops an unsafe provenance source URL', () => {
    const safe = sanitizeProductImageProvenance({
      source_url: 'https://169.254.169.254/latest/meta-data',
      provider: ' catálogo externo ',
      matched_by: 'barcode',
      exact_match: true,
      verified_at: '2026-08-18T12:00:00Z',
    }, 'https://cdn.example.com/producto.jpg');
    assert.deepEqual(safe, {
      url: 'https://cdn.example.com/producto.jpg',
      storage: 'remote_link',
      provider: 'catálogo externo',
      matched_by: 'barcode',
      exact_match: true,
      verified_at: '2026-08-18T12:00:00.000Z',
    });
    assert.deepEqual(productImageJson({ provider: 'catalog' }, 'https://cdn.example.com/producto.jpg'), [{
      url: 'https://cdn.example.com/producto.jpg',
      storage: 'remote_link',
      provider: 'catalog',
    }]);
  });

  test('keeps only valid GTIN-8/12/13/14 barcodes', () => {
    for (const code of ['087295151013', '744926070722', '7501034119018', '00012345600012']) {
      assert.equal(normalizeGtinBarcode(code), code);
    }
    for (const code of ['01', '03', '14055F4304', '90505912', '750103411901']) {
      assert.equal(normalizeGtinBarcode(code), null, code);
    }
  });

  test('preserves an overlong source name in description instead of losing it', () => {
    const rawName = `Producto ${'compatibilidad '.repeat(20)}`.trim();
    const built = buildBulkImportProduct({
      name: rawName,
      code: '087295151013',
      price: 35,
      stock: 8,
      category: null,
    }, 0, 'TNT-1', 'user-1', new Set());
    assert.equal(built.error, undefined);
    assert.equal(built.product.name.length, 200);
    assert.equal(built.product.description, rawName);
    assert.equal(built.product.category, 'Sin departamento');
    assert.equal(built.product.barcode, '087295151013');
  });

  test('keeps an explicit description together with a long or suffixed original name', () => {
    const longName = `Filtro ${'compatibilidad '.repeat(20)}`.trim();
    assert.equal(
      mergeBulkImportDescription(longName, 'Descripción curada', longName.slice(0, 200)),
      `${longName}\n\nDescripción curada`,
    );
    const exactLengthName = 'X'.repeat(200);
    const seen = new Set([exactLengthName.toLowerCase()]);
    const suffixed = uniqueBulkImportName(exactLengthName, '087295151013', seen);
    assert.equal(mergeBulkImportDescription(exactLengthName, null, suffixed), exactLengthName);
  });

  test('removes markup from document names and descriptions before persistence', () => {
    const built = buildBulkImportProduct({
      name: '<b>Filtro seguro</b>',
      description: '<img src=x onerror=alert(1)>Compatibilidad',
    }, 0, 'TNT-1', 'user-1', new Set());
    assert.equal(built.product.name, 'Filtro seguro');
    assert.equal(built.product.description, 'Compatibilidad');
  });

  test('does not copy an internal SKU or invalid checksum into barcode', () => {
    const internal = buildBulkImportProduct({ name: 'Manguera', code: '14055F4304' }, 0, 'TNT-1', 'user-1', new Set());
    const invalidExplicit = buildBulkImportProduct({ name: 'Pastilla', code: '90505912', barcode: '90505912' }, 1, 'TNT-1', 'user-1', new Set());
    assert.equal(internal.product.barcode, null);
    assert.equal(invalidExplicit.product.barcode, null);
  });

  test('falls back to a valid product code when an explicit barcode is invalid', () => {
    const built = buildBulkImportProduct({
      name: 'Filtro',
      code: '087295151013',
      barcode: '90505912',
    }, 0, 'TNT-1', 'user-1', new Set());
    assert.equal(built.product.barcode, '087295151013');
  });

  test('disambiguates duplicate names deterministically without changing their codes', () => {
    const seen = new Set();
    const first = buildBulkImportProduct({ name: 'ACEITE GREEN OIL QS 846ML. T/M SAE 250', code: '7502240723549' }, 0, 'TNT-1', 'user-1', seen);
    const second = buildBulkImportProduct({ name: 'ACEITE GREEN OIL QS 846ML. T/M SAE 250', code: '7502240723556' }, 1, 'TNT-1', 'user-1', seen);
    assert.equal(first.product.name, 'ACEITE GREEN OIL QS 846ML. T/M SAE 250');
    assert.equal(second.product.name, 'ACEITE GREEN OIL QS 846ML. T/M SAE 250 - EAN 7502240723556');
    assert.equal(first.product.code, '7502240723549');
    assert.equal(second.product.code, '7502240723556');
  });

  test('rejects an empty product name', () => {
    assert.equal(buildBulkImportProduct({ name: '  ' }, 0, 'TNT-1', 'user-1', new Set()).error, 'nombre_vacio');
  });

  test('unique name helper stays within the database-facing 200 character contract', () => {
    const seen = new Set();
    const base = 'X'.repeat(200);
    uniqueBulkImportName(base, '087295151013', seen);
    const duplicate = uniqueBulkImportName(base, '744926070722', seen);
    assert.equal(duplicate.length, 200);
    assert.match(duplicate, / - EAN 744926070722$/);
  });

  test('reimport preserves an existing description when the source has none', () => {
    const withoutDescription = buildBulkImportProduct({
      name: 'Filtro corto',
      code: '087295151013',
    }, 0, 'TNT-1', 'user-1', new Set());
    const withDescription = buildBulkImportProduct({
      name: 'Filtro corto',
      description: 'Compatibilidad completa',
      code: '087295151013',
    }, 0, 'TNT-1', 'user-1', new Set());
    assert.equal(Object.hasOwn(buildBulkImportUpdatePayload({ ...withoutDescription.product, _importFields: withoutDescription.updateFields }), 'description'), false);
    assert.equal(buildBulkImportUpdatePayload({ ...withDescription.product, _importFields: withDescription.updateFields }).description, 'Compatibilidad completa');
  });

  test('reimport does not erase a manually curated category or barcode when the source omits them', () => {
    const built = buildBulkImportProduct({
      name: 'Manguera',
      code: '14055F4304',
    }, 0, 'TNT-1', 'user-1', new Set());
    const patch = buildBulkImportUpdatePayload({ ...built.product, _importFields: built.updateFields });
    assert.equal(Object.hasOwn(patch, 'category'), false);
    assert.equal(Object.hasOwn(patch, 'barcode'), false);
  });

  test('keeps missing document cost as null on insert and preserves it on reimport', () => {
    const withoutCost = buildBulkImportProduct({
      name: 'Producto sin costo conocido',
      code: '087295151013',
    }, 0, 'TNT-1', 'user-1', new Set());
    const withCost = buildBulkImportProduct({
      name: 'Producto con costo',
      code: '744926070722',
      cost: '12.50',
      unit: ' caja ',
    }, 1, 'TNT-1', 'user-1', new Set());
    assert.equal(withoutCost.product.cost, null);
    assert.equal(Object.hasOwn(
      buildBulkImportUpdatePayload({ ...withoutCost.product, _importFields: withoutCost.updateFields }),
      'cost',
    ), false);
    assert.equal(withCost.product.cost, 12.5);
    assert.equal(withCost.product.unit, 'caja');
    assert.equal(buildBulkImportUpdatePayload({ ...withCost.product, _importFields: withCost.updateFields }).cost, 12.5);
    assert.equal(buildBulkImportUpdatePayload({ ...withCost.product, _importFields: withCost.updateFields }).unit, 'caja');
  });

  test('rejects a malformed document cost instead of silently converting it', () => {
    assert.equal(buildBulkImportProduct({
      name: 'Producto con costo inválido',
      cost: '-1',
    }, 0, 'TNT-1', 'user-1', new Set()).error, 'costo_invalido');
  });

  test('persists a valid source image and preserves an existing image when omitted', () => {
    const withImage = buildBulkImportProduct({
      name: 'Filtro con imagen',
      code: '087295151013',
      image_url: 'https://images.example.com/filtro.jpg',
      image_provenance: {
        source_url: 'https://shop.example.com/filtro',
        provider: 'shop',
        matched_by: 'document_exact_sku',
        exact_match: true,
      },
    }, 0, 'TNT-1', 'user-1', new Set());
    const withoutImage = buildBulkImportProduct({
      name: 'Filtro sin imagen nueva',
      code: '744926070722',
    }, 1, 'TNT-1', 'user-1', new Set());
    assert.equal(withImage.product.image_url, 'https://images.example.com/filtro.jpg');
    assert.deepEqual(withImage.product.images, [{
      url: 'https://images.example.com/filtro.jpg',
      storage: 'remote_link',
      source_url: 'https://shop.example.com/filtro',
      provider: 'shop',
      matched_by: 'document_exact_sku',
      exact_match: true,
    }]);
    const imagePatch = buildBulkImportUpdatePayload({ ...withImage.product, _importFields: withImage.updateFields });
    assert.equal(imagePatch.image_url, 'https://images.example.com/filtro.jpg');
    assert.deepEqual(imagePatch.images, withImage.product.images);
    assert.equal(Object.hasOwn(withoutImage.product, 'image_url'), false);
    assert.equal(Object.hasOwn(
      buildBulkImportUpdatePayload({ ...withoutImage.product, _importFields: withoutImage.updateFields }),
      'image_url',
    ), false);
    assert.equal(Object.hasOwn(
      buildBulkImportUpdatePayload({ ...withoutImage.product, _importFields: withoutImage.updateFields }),
      'images',
    ), false);
  });

  test('rejects unsafe image schemes instead of silently importing without the image', () => {
    const built = buildBulkImportProduct({
      name: 'Producto seguro',
      code: '087295151013',
      image_url: 'data:image/png;base64,AA==',
    }, 0, 'TNT-1', 'user-1', new Set());
    assert.equal(built.error, 'imagen_url_invalida');
  });
});
