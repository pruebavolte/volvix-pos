'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const api = require('../../api/index.js');
const {
  isSupportedScryptHash,
  hasUsablePasswordLogin,
  canAuthenticatePasswordLogin,
  markPasswordLoginEnabled,
  effectiveUserTenantId,
  handlers,
  setSupabaseRequestForTest,
} = api.__test;

const VALID_SCRYPT = `scrypt$${'ab'.repeat(16)}$${'cd'.repeat(64)}`;
const VALID_SCRYPT_32_BYTE_HASH = `scrypt$${'ab'.repeat(16)}$${'cd'.repeat(32)}`;

function realHash(password) {
  const salt = Buffer.from('ab'.repeat(16), 'hex');
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

describe('password login availability', () => {
  test('hides a disabled Google-only password hash', () => {
    assert.equal(hasUsablePasswordLogin(
      JSON.stringify({ source: 'negocio_persona_link', password_login_enabled: false }),
      VALID_SCRYPT,
    ), false);
  });

  test('hides a legacy Negocio provisioned hash until a real password is enabled', () => {
    assert.equal(hasUsablePasswordLogin(
      JSON.stringify({ source: 'negocio_persona_link' }),
      VALID_SCRYPT,
    ), false);
  });

  test('keeps structurally valid legacy scrypt hashes from other sources available', () => {
    assert.equal(hasUsablePasswordLogin('{}', VALID_SCRYPT), true);
    assert.equal(hasUsablePasswordLogin('{}', VALID_SCRYPT_32_BYTE_HASH), true);
  });

  test('rejects password formats that verifyPassword cannot use', () => {
    for (const hash of [
      '$2b$12$abcdefghijklmnopqrstuvwxyz01234567890123456789012345678',
      'plaintext-password',
      `SCRYPT$${'ab'.repeat(16)}$${'cd'.repeat(64)}`,
      'scrypt$salt$hash',
      'scrypt$abc$00',
      'scrypt$$00',
      `scrypt$${'ab'.repeat(8)}$${'cd'.repeat(64)}`,
      `scrypt$${'ab'.repeat(16)}$${'cd'.repeat(48)}`,
    ]) {
      assert.equal(isSupportedScryptHash(hash), false, hash);
      assert.equal(hasUsablePasswordLogin('{}', hash), false, hash);
    }
  });

  test('requires a stored hash even when explicitly enabled', () => {
    assert.equal(hasUsablePasswordLogin({ password_login_enabled: true }, null), false);
  });

  test('marks string and object notes as password-enabled without losing metadata', () => {
    const fromString = JSON.parse(markPasswordLoginEnabled(JSON.stringify({ tenant_id: 'TNT-1' })));
    const fromObject = markPasswordLoginEnabled({ tenant_id: 'TNT-2' });
    assert.deepEqual(fromString, { tenant_id: 'TNT-1', password_login_enabled: true });
    assert.deepEqual(fromObject, { tenant_id: 'TNT-2', password_login_enabled: true });
  });

  test('serializes null notes for the TEXT column and preserves invalid raw notes', () => {
    assert.equal(markPasswordLoginEnabled(null), JSON.stringify({ password_login_enabled: true }));
    assert.equal(markPasswordLoginEnabled('legacy-not-json'), 'legacy-not-json');
  });

  test('a real password reset enables a Negocio-provisioned account', () => {
    const original = JSON.stringify({ source: 'negocio_persona_link', tenant_id: 'TNT-1' });
    assert.equal(hasUsablePasswordLogin(original, VALID_SCRYPT), false);
    const updated = markPasswordLoginEnabled(original);
    assert.equal(hasUsablePasswordLogin(updated, VALID_SCRYPT), true);
  });

  test('the login handler gate rejects disabled accounts before password verification', () => {
    const passwordHash = realHash('correct-password');
    assert.equal(canAuthenticatePasswordLogin({
      notes: JSON.stringify({ source: 'negocio_persona_link' }),
      password_hash: passwordHash,
    }, 'correct-password'), false);
    assert.equal(canAuthenticatePasswordLogin({
      notes: JSON.stringify({ source: 'negocio_persona_link', password_login_enabled: false }),
      password_hash: passwordHash,
    }, 'correct-password'), false);
    assert.equal(canAuthenticatePasswordLogin({
      notes: JSON.stringify({ source: 'negocio_persona_link', password_login_enabled: true }),
      password_hash: passwordHash,
    }, 'correct-password'), true);
    assert.equal(canAuthenticatePasswordLogin({
      notes: JSON.stringify({ source: 'negocio_persona_link', password_login_enabled: true }),
      password_hash: passwordHash,
    }, 'wrong-password'), false);
  });

  test('POST /api/login applies the disabled-password gate', async () => {
    const calls = [];
    const passwordHash = realHash('unknown-generated-password');
    setSupabaseRequestForTest(async (method, path, body) => {
      calls.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_login_attempts?')) return [];
      if (method === 'GET' && path.startsWith('/pos_users?')) {
        return [{
          id: '00000000-0000-4000-8000-000000000001',
          email: 'disabled@example.com',
          password_hash: passwordHash,
          role: 'USER',
          notes: JSON.stringify({ source: 'negocio_persona_link', password_login_enabled: false }),
          is_active: true,
          mfa_enabled: false,
        }];
      }
      if (method === 'POST' && path === '/pos_login_attempts') return [];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    const req = Readable.from([JSON.stringify({
      email: 'disabled@example.com',
      password: 'unknown-generated-password',
    })]);
    req.headers = { 'content-type': 'application/json', 'user-agent': 'unit-test' };
    req.socket = { remoteAddress: '127.0.0.77' };
    let responseBody = '';
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      write(chunk) { if (chunk) responseBody += String(chunk); return true; },
      end(chunk) { if (chunk) responseBody += String(chunk); },
    };

    try {
      await handlers['POST /api/login'](req, res);
    } finally {
      setSupabaseRequestForTest(null);
    }
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(responseBody).error, 'Credenciales inválidas');
    assert.equal(calls.some((call) => call.method === 'PATCH' && call.path.startsWith('/pos_users?')), false);
  });

  test('admin reset tenant lookup honors the canonical tenant in notes', () => {
    assert.equal(effectiveUserTenantId({
      tenant_id: null,
      company_id: 'company-uuid',
      notes: JSON.stringify({ tenant_id: 'TNT-CANONICAL' }),
    }), 'TNT-CANONICAL');
    assert.equal(effectiveUserTenantId({ tenant_id: 'TNT-COLUMN', company_id: 'company-uuid', notes: null }), 'TNT-COLUMN');
  });
});
