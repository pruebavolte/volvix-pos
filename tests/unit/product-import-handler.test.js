'use strict';
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const api = require('../../api/index.js');
const { handlers, signJWT, resolvePosUserId, setSupabaseRequestForTest } = api.__test;

const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '44444444-4444-4444-8444-444444444444';
const COMPANY_ID = '55555555-5555-4555-8555-555555555555';
const TENANT_ID = 'TNT-IMPORT-01';

function memberToken(role = 'manager') {
  return signJWT({
    id: MEMBER_ID,
    sub: MEMBER_ID,
    email: `${role}@example.com`,
    tenant_id: TENANT_ID,
    company_id: COMPANY_ID,
    owner_user_id: OWNER_ID,
    role,
    auth_provider: 'google',
  });
}

async function invoke(route, payload, extraHeaders, token = memberToken()) {
  const req = Readable.from([JSON.stringify(payload)]);
  req.method = 'POST';
  req.url = route.replace('POST ', '');
  req.headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...(extraHeaders || {}),
  };
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = mockResponse();
  await handlers[route](req, res);
  return res;
}

function mockResponse() {
  let body = '';
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(chunk) { if (chunk) body += String(chunk); },
    json() { return JSON.parse(body || '{}'); },
  };
}

describe('transactional product import handler', () => {
  test('rejects injected or cross-tenant catalog owner claims', () => {
    assert.throws(() => resolvePosUserId({ user: {
      id: MEMBER_ID,
      tenant_id: TENANT_ID,
      company_id: null,
      owner_user_id: OWNER_ID,
      role: 'manager',
    } }, TENANT_ID), /claims de catálogo POS no son coherentes/);
    assert.throws(() => resolvePosUserId({ user: {
      id: MEMBER_ID,
      tenant_id: TENANT_ID,
      company_id: COMPANY_ID,
      owner_user_id: OWNER_ID,
      role: 'manager',
    } }, 'TNT-FOREIGN-01'), /claims de catálogo POS no son coherentes/);
    assert.equal(resolvePosUserId({ user: { id: null, tenant_id: 'TNT-UNKNOWN-01' } }, 'TNT-UNKNOWN-01'), null);
  });

  test('persists optional fields and leaves an unknown cost as null', async () => {
    const inserted = [];
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method === 'GET' && path.startsWith('/pos_user_session_invalidations')) return [];
      if (method === 'GET' && path.startsWith('/pos_active_sessions')) return [];
      if (method === 'GET' && path.startsWith('/pos_products?code=eq.')) return [];
      if (method === 'POST' && path === '/pos_products') {
        inserted.push(body);
        return [{ id: '44444444-4444-4444-8444-444444444444', ...body }];
      }
      return [];
    });

    const req = Readable.from([JSON.stringify({
      products: [{
        code: 'DOC-001',
        name: 'Producto desde documento',
        barcode: '7500000000007',
        description: '<b>Descripción importada</b>',
        unit: ' caja ',
        price: 99,
        image_url: 'https://images.example.com/doc-001.jpg',
      }],
    })]);
    req.method = 'POST';
    req.url = '/api/products/import';
    req.headers = {
      authorization: `Bearer ${memberToken()}`,
      'content-type': 'application/json',
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = mockResponse();

    try {
      await handlers['POST /api/products/import'](req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().imported, 1);
      assert.equal(inserted.length, 1);
      assert.equal(inserted[0].pos_user_id, OWNER_ID);
      assert.notEqual(inserted[0].pos_user_id, MEMBER_ID);
      assert.equal(inserted[0].cost, null);
      assert.equal(inserted[0].barcode, '7500000000007');
      assert.equal(inserted[0].description, 'Descripción importada');
      assert.equal(inserted[0].unit, 'caja');
      assert.equal(inserted[0].image_url, 'https://images.example.com/doc-001.jpg');
    } finally {
      setSupabaseRequestForTest(null);
    }
  });

  test('creates a manager product in the owner catalog, never the member partition', async () => {
    const inserted = [];
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method === 'GET' && path.startsWith('/subscriptions?')) return [];
      if (method === 'GET' && path.startsWith('/pos_user_session_invalidations')) return [];
      if (method === 'GET' && path.startsWith('/pos_active_sessions')) return [];
      if (method === 'GET' && path.startsWith(`/pos_products?pos_user_id=eq.${OWNER_ID}`)) return [];
      if (method === 'POST' && path === '/pos_products') {
        inserted.push(body);
        return [{ id: '66666666-6666-4666-8666-666666666666', ...body }];
      }
      return [];
    });

    try {
      const res = await invoke('POST /api/products', {
        code: 'MEMBER-001',
        name: 'Producto compartido',
        price: 25,
      }, { 'x-allow-duplicate': '1' });
      assert.equal(res.statusCode, 200);
      assert.equal(inserted.length, 1);
      assert.equal(inserted[0].pos_user_id, OWNER_ID);
      assert.notEqual(inserted[0].pos_user_id, MEMBER_ID);
    } finally {
      setSupabaseRequestForTest(null);
    }
  });

  test('bulk-import stores every new member item under the canonical owner', async () => {
    const insertedChunks = [];
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method === 'GET' && path.startsWith('/pos_user_session_invalidations')) return [];
      if (method === 'GET' && path.startsWith('/pos_active_sessions')) return [];
      if (method === 'GET' && path.startsWith('/pos_products?tenant_id=eq.')) return [];
      if (method === 'POST' && path === '/pos_products') {
        insertedChunks.push(body);
        return [];
      }
      return [];
    });

    try {
      const res = await invoke('POST /api/products/bulk-import', {
        items: [
          { code: 'BULK-001', name: 'Producto uno', price: 10 },
          { code: 'BULK-002', name: 'Producto dos', price: 20 },
        ],
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().inserted, 2);
      assert.equal(insertedChunks.length, 1);
      assert.equal(Array.isArray(insertedChunks[0]), true);
      for (const row of insertedChunks[0]) {
        assert.equal(row.tenant_id, TENANT_ID);
        assert.equal(row.pos_user_id, OWNER_ID);
        assert.notEqual(row.pos_user_id, MEMBER_ID);
      }
    } finally {
      setSupabaseRequestForTest(null);
    }
  });

  test('transactional and bulk imports reject cashier, vendor and kiosk roles before mutation', async () => {
    const writes = [];
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method === 'GET' && path.startsWith('/pos_user_session_invalidations')) return [];
      if (method === 'GET' && path.startsWith('/pos_active_sessions')) return [];
      if (method !== 'GET') writes.push({ method, path, body });
      return [];
    });

    try {
      for (const role of ['cajero', 'vendor', 'kiosk']) {
        const importRes = await invoke('POST /api/products/import', {
          products: [{ code: `BLOCKED-${role}`, name: 'No permitido', price: 10 }],
        }, undefined, memberToken(role));
        assert.equal(importRes.statusCode, 403, `products/import role=${role}`);

        const bulkRes = await invoke('POST /api/products/bulk-import', {
          items: [{ code: `BULK-BLOCKED-${role}`, name: 'No permitido', price: 10 }],
        }, undefined, memberToken(role));
        assert.equal(bulkRes.statusCode, 403, `products/bulk-import role=${role}`);
      }
      assert.equal(writes.length, 0);
    } finally {
      setSupabaseRequestForTest(null);
    }
  });
});
