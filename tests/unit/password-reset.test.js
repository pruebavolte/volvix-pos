'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const api = require('../../api/index.js');

const {
  handlers,
  signJWT,
  signResetToken,
  normalizePasswordResetBaseUrl,
  buildPasswordResetLink,
  canAuthenticatePasswordLogin,
  setSupabaseRequestForTest,
} = api.__test;

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = 'TNT-PASSWORD-01';

function ownerToken(userId = OWNER_ID) {
  return signJWT({
    id: userId,
    sub: userId,
    email: userId === OWNER_ID ? 'owner@example.com' : 'user@example.com',
    tenant_id: TENANT_ID,
    company_id: COMPANY_ID,
    owner_user_id: OWNER_ID,
    role: userId === OWNER_ID ? 'owner' : 'cajero',
    auth_provider: 'password',
  });
}

function mockResponse() {
  let body = '';
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    write(chunk) { if (chunk) body += String(chunk); return true; },
    end(chunk) { if (chunk) body += String(chunk); },
    on() {},
    json() { return JSON.parse(body || '{}'); },
    text() { return body; },
  };
}

async function invoke(route, payload, token, params) {
  const req = Readable.from([JSON.stringify(payload || {})]);
  const space = route.indexOf(' ');
  req.method = route.slice(0, space);
  req.url = route.slice(space + 1)
    .replace(':id', (params && params.id) || USER_ID);
  req.headers = { 'content-type': 'application/json' };
  if (token) req.headers.authorization = `Bearer ${token}`;
  req.socket = { remoteAddress: '127.0.0.91' };
  const res = mockResponse();
  await handlers[route](req, res, params || {});
  return res;
}

function canonicalNotes(extra) {
  return JSON.stringify({
    source: 'negocio_persona_link',
    tenant_id: TENANT_ID,
    auth_user_id: USER_ID,
    ...(extra || {}),
  });
}

describe('canonical password reset contract', () => {
  test('admin reset updates the existing canonical pos_users UUID without creating a parallel account', async () => {
    const calls = [];
    setSupabaseRequestForTest(async (method, requestPath, body) => {
      calls.push({ method, path: requestPath, body });
      if (method === 'GET' && requestPath.startsWith('/pos_user_session_invalidations')) return [];
      if (method === 'GET' && requestPath.startsWith('/pos_active_sessions')) return [];
      if (method === 'GET' && requestPath.startsWith(`/pos_users?id=eq.${USER_ID}`)) {
        return [{
          id: USER_ID,
          tenant_id: null,
          company_id: COMPANY_ID,
          email: 'user@example.com',
          notes: canonicalNotes({ password_login_enabled: false }),
        }];
      }
      return [];
    });

    try {
      const res = await invoke('POST /api/users/:id/reset-password', {
        reason: 'unit_test',
      }, ownerToken(), { id: USER_ID });
      assert.equal(res.statusCode, 200);
      const result = res.json();
      assert.equal(result.ok, true);
      assert.equal(typeof result.temporary_password, 'string');
      assert.equal(result.temporary_password.length, 12);

      const userWrites = calls.filter(call => call.path.startsWith('/pos_users'));
      const passwordWrite = userWrites.find(call => call.method === 'PATCH');
      assert.ok(passwordWrite);
      assert.equal(passwordWrite.path, `/pos_users?id=eq.${USER_ID}`);
      assert.equal(userWrites.some(call => call.method === 'POST'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'id'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'tenant_id'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'company_id'), false);
      const notes = JSON.parse(passwordWrite.body.notes);
      assert.equal(notes.source, 'negocio_persona_link');
      assert.equal(notes.tenant_id, TENANT_ID);
      assert.equal(notes.auth_user_id, USER_ID);
      assert.equal(notes.password_login_enabled, true);
      assert.equal(notes.must_change_password, true);
      assert.equal(canAuthenticatePasswordLogin({
        notes: passwordWrite.body.notes,
        password_hash: passwordWrite.body.password_hash,
      }, result.temporary_password), true);
      const invalidation = calls.find(call => call.method === 'POST' && call.path === '/pos_user_session_invalidations');
      assert.equal(invalidation.body.user_id, USER_ID);
      assert.equal(invalidation.body.tenant_id, TENANT_ID);
      assert.equal(calls.some(call => call.path.startsWith('/auth/v1/')), false);
    } finally {
      setSupabaseRequestForTest(null);
    }
  });

  test('authenticated password change keeps the same UUID, tenant and company source row', async () => {
    const calls = [];
    const currentPassword = 'Current-Test-42';
    const currentHash = (() => {
      const crypto = require('node:crypto');
      const salt = Buffer.from('ab'.repeat(16), 'hex');
      return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(currentPassword, salt, 64).toString('hex')}`;
    })();
    setSupabaseRequestForTest(async (method, requestPath, body) => {
      calls.push({ method, path: requestPath, body });
      if (method === 'GET' && requestPath.startsWith('/pos_user_session_invalidations')) return [];
      if (method === 'GET' && requestPath.startsWith('/pos_active_sessions')) return [];
      if (method === 'GET' && requestPath.startsWith(`/pos_users?id=eq.${USER_ID}`)) {
        return [{
          id: USER_ID,
          password_hash: currentHash,
          tenant_id: TENANT_ID,
          notes: canonicalNotes({ password_login_enabled: true, must_change_password: true }),
        }];
      }
      return [];
    });

    try {
      const res = await invoke('POST /api/users/me/change-password', {
        current_password: currentPassword,
        new_password: 'Changed-Test-84',
      }, ownerToken(USER_ID));
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().ok, true);
      const userWrites = calls.filter(call => call.path.startsWith('/pos_users'));
      const passwordWrite = userWrites.find(call => call.method === 'PATCH');
      assert.equal(passwordWrite.path, `/pos_users?id=eq.${USER_ID}`);
      assert.equal(userWrites.some(call => call.method === 'POST'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'id'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'tenant_id'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'company_id'), false);
      const notes = JSON.parse(passwordWrite.body.notes);
      assert.equal(notes.source, 'negocio_persona_link');
      assert.equal(notes.tenant_id, TENANT_ID);
      assert.equal(notes.auth_user_id, USER_ID);
      assert.equal(notes.password_login_enabled, true);
      assert.equal(notes.must_change_password, false);
      assert.equal(canAuthenticatePasswordLogin({
        notes: passwordWrite.body.notes,
        password_hash: passwordWrite.body.password_hash,
      }, 'Changed-Test-84'), true);
      assert.equal(calls.some(call => call.path.startsWith('/auth/v1/')), false);
    } finally {
      setSupabaseRequestForTest(null);
    }
  });

  test('public email confirmation updates the same user and revokes previous sessions', async () => {
    const calls = [];
    setSupabaseRequestForTest(async (method, requestPath, body) => {
      calls.push({ method, path: requestPath, body });
      if (method === 'GET' && requestPath.startsWith(`/pos_users?id=eq.${USER_ID}`)) {
        return [{
          id: USER_ID,
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          notes: canonicalNotes({ password_login_enabled: false, must_change_password: true }),
        }];
      }
      return [];
    });

    try {
      const token = signResetToken(USER_ID, 'user@example.com');
      const res = await invoke('POST /api/auth/password-reset/confirm', {
        token,
        new_password: 'Recovered-Test-63',
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().ok, true);
      const userWrites = calls.filter(call => call.path.startsWith('/pos_users'));
      const passwordWrite = userWrites.find(call => call.method === 'PATCH');
      assert.equal(passwordWrite.path, `/pos_users?id=eq.${USER_ID}`);
      assert.equal(userWrites.some(call => call.method === 'POST'), false);
      const notes = JSON.parse(passwordWrite.body.notes);
      assert.equal(notes.auth_user_id, USER_ID);
      assert.equal(notes.password_login_enabled, true);
      assert.equal(notes.must_change_password, false);
      assert.equal(canAuthenticatePasswordLogin({
        notes: passwordWrite.body.notes,
        password_hash: passwordWrite.body.password_hash,
      }, 'Recovered-Test-63'), true);
      assert.ok(calls.find(call => call.method === 'PATCH' && call.path.startsWith('/pos_active_sessions?user_id=eq.')));
      assert.ok(calls.find(call => call.method === 'POST' && call.path === '/pos_user_session_invalidations'));
    } finally {
      setSupabaseRequestForTest(null);
    }
  });

  test('database-token recovery updates that same canonical UUID and tenant', async () => {
    const crypto = require('node:crypto');
    const calls = [];
    const rawToken = 'database-reset-token-for-test';
    const salt = Buffer.from('cd'.repeat(16), 'hex');
    const tokenHash = `scrypt$${salt.toString('hex')}$${crypto.scryptSync(rawToken, salt, 32).toString('hex')}`;
    setSupabaseRequestForTest(async (method, requestPath, body) => {
      calls.push({ method, path: requestPath, body });
      if (method === 'GET' && requestPath.startsWith('/pos_password_reset_tokens?')) {
        return [{
          id: '44444444-4444-4444-8444-444444444444',
          user_id: USER_ID,
          token_hash: tokenHash,
          expires_at: '2099-01-01T00:00:00.000Z',
        }];
      }
      if (method === 'GET' && requestPath.startsWith(`/pos_users?id=eq.${USER_ID}`)) {
        return [{
          id: USER_ID,
          tenant_id: TENANT_ID,
          company_id: COMPANY_ID,
          notes: canonicalNotes({ password_login_enabled: false, must_change_password: true }),
        }];
      }
      return [];
    });

    try {
      const res = await invoke('POST /api/auth/reset', {
        token: rawToken,
        new_password: 'Recovered-Database-27',
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().ok, true);
      const userWrites = calls.filter(call => call.path.startsWith('/pos_users'));
      const passwordWrite = userWrites.find(call => call.method === 'PATCH');
      assert.equal(passwordWrite.path, `/pos_users?id=eq.${USER_ID}`);
      assert.equal(userWrites.some(call => call.method === 'POST'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'tenant_id'), false);
      assert.equal(Object.hasOwn(passwordWrite.body, 'company_id'), false);
      const notes = JSON.parse(passwordWrite.body.notes);
      assert.equal(notes.auth_user_id, USER_ID);
      assert.equal(notes.tenant_id, TENANT_ID);
      assert.equal(notes.password_login_enabled, true);
      assert.equal(notes.must_change_password, false);
      assert.equal(canAuthenticatePasswordLogin({
        notes: passwordWrite.body.notes,
        password_hash: passwordWrite.body.password_hash,
      }, 'Recovered-Database-27'), true);
      const invalidation = calls.find(call => call.method === 'POST' && call.path === '/pos_user_session_invalidations');
      assert.equal(invalidation.body.user_id, USER_ID);
      assert.equal(invalidation.body.tenant_id, TENANT_ID);
      assert.equal(calls.some(call => call.path.startsWith('/auth/v1/')), false);
    } finally {
      setSupabaseRequestForTest(null);
    }
  });

  test('public reset page supports both issued token formats and strips the token from browser history', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'reset-password.html'), 'utf8');
    const login = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'login.html'), 'utf8');
    assert.match(login, /\/api\/auth\/password-reset\/request/);
    assert.match(page, /\/api\/auth\/password-reset\/confirm/);
    assert.match(page, /\/api\/auth\/reset/);
    assert.match(page, /history\.replaceState\(null, '', window\.location\.pathname\)/);
    assert.match(page, /name="referrer" content="no-referrer"/);
    assert.match(page, /autocomplete="new-password"/);
  });

  test('the canonical server serves reset-password.html instead of the former 404', async () => {
    const req = Readable.from([]);
    req.method = 'GET';
    req.url = '/reset-password.html?token=redacted';
    req.headers = { host: 'systeminternational.app' };
    req.socket = { remoteAddress: '127.0.0.92' };
    const res = mockResponse();
    await api(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['Content-Type'] || res.headers['content-type']), /text\/html/);
    assert.match(res.text(), /Restablece tu contraseña/);
  });

  test('password reset links default to the canonical public app and reject unsafe base URLs', () => {
    assert.equal(normalizePasswordResetBaseUrl('https://systeminternational.app/'), 'https://systeminternational.app');
    assert.equal(normalizePasswordResetBaseUrl('http://systeminternational.app'), null);
    assert.equal(normalizePasswordResetBaseUrl('https://user:secret@systeminternational.app'), null);
    assert.equal(
      buildPasswordResetLink('token con espacios', 'https://systeminternational.app/'),
      'https://systeminternational.app/reset-password.html?token=token%20con%20espacios',
    );
    assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'index.js'), 'utf8'),
      /process\.env\.PASSWORD_RESET_BASE_URL \|\| process\.env\.APP_URL \|\| 'https:\/\/systeminternational\.app'/);
  });
});
