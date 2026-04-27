'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const api = require('../../api/index.js');
const { signJWT, verifyJWT, verifyPassword, requireAuth } = api.__test;

describe('signJWT / verifyJWT', () => {
  test('signs a token in three dot-separated parts', () => {
    const t = signJWT({ id: 'u1', email: 'a@b.c', role: 'admin', tenant_id: 't1' });
    assert.equal(typeof t, 'string');
    assert.equal(t.split('.').length, 3);
  });

  test('verifies a valid token and returns payload', () => {
    const t = signJWT({ id: 'u1', email: 'a@b.c', role: 'admin', tenant_id: 't1' });
    const p = verifyJWT(t);
    assert.ok(p);
    assert.equal(p.id, 'u1');
    assert.equal(p.role, 'admin');
    assert.equal(p.tenant_id, 't1');
    assert.ok(p.exp > Math.floor(Date.now() / 1000));
  });

  test('rejects tampered token', () => {
    const t = signJWT({ id: 'u1', role: 'admin' });
    const parts = t.split('.');
    // mutate signature
    const bad = `${parts[0]}.${parts[1]}.AAAA${parts[2].slice(4)}`;
    assert.equal(verifyJWT(bad), null);
  });

  test('rejects malformed token', () => {
    assert.equal(verifyJWT(null), null);
    assert.equal(verifyJWT(''), null);
    assert.equal(verifyJWT('not.a.jwt.at.all'), null);
    assert.equal(verifyJWT('only.two'), null);
    assert.equal(verifyJWT(123), null);
  });

  test('rejects expired token', () => {
    // Forge a token with past exp using same secret
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payload = Buffer.from(JSON.stringify({ id: 'u', exp: 1 }))
      .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const data = `${header}.${payload}`;
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(data).digest()
      .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    assert.equal(verifyJWT(`${data}.${sig}`), null);
  });
});

describe('verifyPassword (scrypt)', () => {
  function hashScrypt(plain) {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(plain, salt, 32);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  test('accepts correct scrypt password', () => {
    const stored = hashScrypt('S3cret!');
    assert.equal(verifyPassword('S3cret!', stored), true);
  });

  test('rejects wrong scrypt password', () => {
    const stored = hashScrypt('S3cret!');
    assert.equal(verifyPassword('wrong', stored), false);
  });

  test('rejects bcrypt format (no lib available)', () => {
    assert.equal(verifyPassword('any', '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN'), false);
  });

  test('legacy plaintext compare', () => {
    assert.equal(verifyPassword('plain123', 'plain123'), true);
    assert.equal(verifyPassword('plain123', 'other123'), false);
  });

  test('rejects empty / null inputs', () => {
    assert.equal(verifyPassword('', 'x'), false);
    assert.equal(verifyPassword('x', ''), false);
    assert.equal(verifyPassword('x', null), false);
  });
});

describe('requireAuth middleware', () => {
  function mockRes() {
    const r = {
      statusCode: 200,
      _headers: {},
      _body: null,
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      end(b) { this._body = b; },
    };
    return r;
  }

  test('rejects request without Authorization header', async () => {
    const handler = requireAuth(async () => { throw new Error('should not run'); });
    const res = mockRes();
    await handler({ headers: {} }, res, {});
    assert.equal(res.statusCode, 401);
    assert.match(res._body, /unauthorized/);
  });

  test('rejects malformed Authorization', async () => {
    const handler = requireAuth(async () => { throw new Error('nope'); });
    const res = mockRes();
    await handler({ headers: { authorization: 'NotBearer xyz' } }, res, {});
    assert.equal(res.statusCode, 401);
  });

  test('rejects invalid token', async () => {
    const handler = requireAuth(async () => { throw new Error('nope'); });
    const res = mockRes();
    await handler({ headers: { authorization: 'Bearer abc.def.ghi' } }, res, {});
    assert.equal(res.statusCode, 401);
  });

  test('passes valid token and populates req.user', async () => {
    const t = signJWT({ id: 'u9', email: 'x@y.z', role: 'cashier', tenant_id: 'tA' });
    let captured = null;
    const handler = requireAuth(async (req) => {
      captured = req.user;
      return 'ok';
    });
    const req = { headers: { authorization: `Bearer ${t}` } };
    await handler(req, mockRes(), {});
    assert.equal(captured.id, 'u9');
    assert.equal(captured.role, 'cashier');
    assert.equal(captured.tenant_id, 'tA');
  });

  test('rejects insufficient role with 403', async () => {
    const t = signJWT({ id: 'u9', role: 'cashier', tenant_id: 'tA' });
    const handler = requireAuth(async () => 'ok', ['admin']);
    const res = mockRes();
    await handler({ headers: { authorization: `Bearer ${t}` } }, res, {});
    assert.equal(res.statusCode, 403);
    assert.match(res._body, /forbidden/);
  });

  test('accepts allowed role', async () => {
    const t = signJWT({ id: 'u9', role: 'admin', tenant_id: 'tA' });
    let ran = false;
    const handler = requireAuth(async () => { ran = true; }, ['admin', 'owner']);
    await handler({ headers: { authorization: `Bearer ${t}` } }, mockRes(), {});
    assert.equal(ran, true);
  });
});
