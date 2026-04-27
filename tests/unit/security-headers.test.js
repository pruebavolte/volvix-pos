'use strict';
const assert = require('node:assert/strict');
const { __test } = require('../../api/index.js');
const { setSecurityHeaders } = __test;

function mockRes() {
  const r = { _h: {}, setHeader(k, v) { this._h[k] = v; } };
  return r;
}

describe('setSecurityHeaders', () => {
  test('inserts the 6 expected headers', () => {
    const res = mockRes();
    setSecurityHeaders(res);
    const expected = [
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Content-Security-Policy',
    ];
    for (const h of expected) {
      assert.ok(res._h[h], `missing ${h}`);
    }
    assert.equal(Object.keys(res._h).length, 6);
  });

  test('HSTS is long-lived with preload', () => {
    const res = mockRes();
    setSecurityHeaders(res);
    assert.match(res._h['Strict-Transport-Security'], /max-age=\d+/);
    assert.match(res._h['Strict-Transport-Security'], /includeSubDomains/);
    assert.match(res._h['Strict-Transport-Security'], /preload/);
  });

  test('X-Frame-Options denies framing', () => {
    const res = mockRes();
    setSecurityHeaders(res);
    assert.equal(res._h['X-Frame-Options'], 'DENY');
  });

  test('X-Content-Type-Options is nosniff', () => {
    const res = mockRes();
    setSecurityHeaders(res);
    assert.equal(res._h['X-Content-Type-Options'], 'nosniff');
  });

  test('CSP forbids frame-ancestors', () => {
    const res = mockRes();
    setSecurityHeaders(res);
    assert.match(res._h['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.match(res._h['Content-Security-Policy'], /default-src 'self'/);
  });

  test('Permissions-Policy disables camera/mic/geo/payment', () => {
    const res = mockRes();
    setSecurityHeaders(res);
    const p = res._h['Permissions-Policy'];
    assert.match(p, /geolocation=\(\)/);
    assert.match(p, /camera=\(\)/);
    assert.match(p, /microphone=\(\)/);
    assert.match(p, /payment=\(\)/);
  });

  test('Referrer-Policy is strict-origin-when-cross-origin', () => {
    const res = mockRes();
    setSecurityHeaders(res);
    assert.equal(res._h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  });
});
