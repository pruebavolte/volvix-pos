'use strict';
const assert = require('node:assert/strict');
const { __test } = require('../../api/index.js');
const { isUuid, isInt, pickFields, ALLOWED_FIELDS_PRODUCTS, ALLOWED_FIELDS_USERS } = __test;

describe('isUuid', () => {
  test('accepts canonical UUIDs', () => {
    assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.equal(isUuid('550E8400-E29B-41D4-A716-446655440000'), true);
  });
  test('rejects non-UUIDs', () => {
    assert.equal(isUuid(''), false);
    assert.equal(isUuid('not-a-uuid'), false);
    assert.equal(isUuid('550e8400-e29b-41d4-a716-44665544000'), false); // short
    assert.equal(isUuid(null), false);
    assert.equal(isUuid(123), false);
    assert.equal(isUuid('550e8400e29b41d4a716446655440000'), false); // no dashes
  });
});

describe('isInt', () => {
  test('accepts integer strings', () => {
    assert.equal(isInt('0'), true);
    assert.equal(isInt('42'), true);
    assert.equal(isInt('-7'), true);
    assert.equal(isInt(99), true); // coerced
  });
  test('rejects non-integers', () => {
    assert.equal(isInt(''), false);
    assert.equal(isInt('1.5'), false);
    assert.equal(isInt('abc'), false);
    assert.equal(isInt('1e3'), false);
    assert.equal(isInt(' 5 '), false);
  });
});

describe('pickFields (input sanitization)', () => {
  test('keeps only allowed product fields', () => {
    const body = {
      code: 'P1', name: 'Coke', price: 20,
      __proto__: { polluted: true },
      isAdmin: true, role: 'admin', cost: 10,
    };
    const out = pickFields(body, ALLOWED_FIELDS_PRODUCTS);
    assert.deepEqual(Object.keys(out).sort(), ['code', 'cost', 'name', 'price']);
    assert.equal(out.isAdmin, undefined);
    assert.equal(out.role, undefined);
  });

  test('keeps only allowed user fields (no role-injection beyond allowed)', () => {
    const body = { email: 'a@b.c', role: 'admin', is_active: true, password: 'X', tenant_id: 'evil' };
    const out = pickFields(body, ALLOWED_FIELDS_USERS);
    // role is in ALLOWED_FIELDS_USERS but password/tenant_id are not
    assert.equal(out.email, 'a@b.c');
    assert.equal(out.role, 'admin');
    assert.equal(out.is_active, true);
    assert.equal(out.password, undefined);
    assert.equal(out.tenant_id, undefined);
  });

  test('handles null / undefined / empty body', () => {
    assert.deepEqual(pickFields(null, ALLOWED_FIELDS_PRODUCTS), {});
    assert.deepEqual(pickFields(undefined, ALLOWED_FIELDS_PRODUCTS), {});
    assert.deepEqual(pickFields({}, ALLOWED_FIELDS_PRODUCTS), {});
  });

  test('does not invent fields not present in body', () => {
    const out = pickFields({ name: 'X' }, ALLOWED_FIELDS_PRODUCTS);
    assert.deepEqual(out, { name: 'X' });
  });
});
