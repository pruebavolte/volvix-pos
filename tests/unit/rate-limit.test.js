'use strict';
const assert = require('node:assert/strict');
const { __test } = require('../../api/index.js');
const { rateLimit, rateBuckets } = __test;

describe('rateLimit', () => {
  test('5 hits allowed, 6th rejected (max=5)', () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    for (let i = 1; i <= 5; i++) {
      assert.equal(rateLimit(key, 5, 60_000), true, `hit ${i} should pass`);
    }
    assert.equal(rateLimit(key, 5, 60_000), false, '6th must be rejected');
    assert.equal(rateLimit(key, 5, 60_000), false, '7th still rejected');
  });

  test('different keys have independent buckets', () => {
    const k1 = `iso:1:${Math.random()}`;
    const k2 = `iso:2:${Math.random()}`;
    for (let i = 0; i < 5; i++) rateLimit(k1, 5, 60_000);
    assert.equal(rateLimit(k1, 5, 60_000), false);
    assert.equal(rateLimit(k2, 5, 60_000), true);
  });

  test('window expiration resets counter', async () => {
    const key = `win:${Math.random()}`;
    assert.equal(rateLimit(key, 2, 50), true);
    assert.equal(rateLimit(key, 2, 50), true);
    assert.equal(rateLimit(key, 2, 50), false);
    await new Promise(r => setTimeout(r, 70));
    assert.equal(rateLimit(key, 2, 50), true, 'after window must reset');
  });

  test('first call always returns true (cold bucket)', () => {
    const key = `cold:${Math.random()}`;
    assert.equal(rateBuckets.has(key), false);
    assert.equal(rateLimit(key, 1, 60_000), true);
    assert.equal(rateBuckets.has(key), true);
  });
});
