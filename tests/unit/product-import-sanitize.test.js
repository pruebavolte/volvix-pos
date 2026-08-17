'use strict';
const assert = require('node:assert/strict');
const api = require('../../api/index.js');
const {
  normalizeGtinBarcode,
  uniqueBulkImportName,
  mergeBulkImportDescription,
  buildBulkImportProduct,
  buildBulkImportUpdatePayload,
} = api.__test;

describe('bulk product import sanitization', () => {
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
});
