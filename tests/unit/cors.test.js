'use strict';
const assert = require('node:assert/strict');
const { __test } = require('../../api/index.js');
const { applyCorsHeaders, ALLOWED_ORIGINS } = __test;

function mockRes() {
  const r = { _h: {}, setHeader(k, v) { this._h[k] = v; } };
  return r;
}

describe('CORS allowlist', () => {
  test('ALLOWED_ORIGINS is parsed as array', () => {
    assert.ok(Array.isArray(ALLOWED_ORIGINS));
    assert.ok(ALLOWED_ORIGINS.length >= 1);
  });

  test('echoes allowed origin', () => {
    const allowed = ALLOWED_ORIGINS[0];
    const res = mockRes();
    applyCorsHeaders({ headers: { origin: allowed } }, res);
    assert.equal(res._h['Access-Control-Allow-Origin'], allowed);
    assert.equal(res._h['Vary'], 'Origin');
    assert.equal(res._h['Access-Control-Allow-Credentials'], 'true');
  });

  test('rejects unlisted origin (falls back to first allowed)', () => {
    const res = mockRes();
    applyCorsHeaders({ headers: { origin: 'https://evil.example.com' } }, res);
    assert.notEqual(res._h['Access-Control-Allow-Origin'], 'https://evil.example.com');
    assert.equal(res._h['Access-Control-Allow-Origin'], ALLOWED_ORIGINS[0]);
    assert.notEqual(res._h['Vary'], 'Origin');
  });

  test('handles missing origin header', () => {
    const res = mockRes();
    applyCorsHeaders({ headers: {} }, res);
    assert.equal(res._h['Access-Control-Allow-Origin'], ALLOWED_ORIGINS[0]);
  });

  test('always sets credentials true', () => {
    const res = mockRes();
    applyCorsHeaders({ headers: { origin: 'https://random.io' } }, res);
    assert.equal(res._h['Access-Control-Allow-Credentials'], 'true');
  });
});
