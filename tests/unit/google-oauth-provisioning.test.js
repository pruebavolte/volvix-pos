'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const api = require('../../api/index.js');
const {
  handlers,
  verifyJWT,
  isExpectedSupabaseUrl,
  EXPECTED_SUPABASE_PROJECT_REF,
  setSupabaseRequestForTest,
  setSupabaseAuthUserForTest,
} = api.__test;

const AUTH_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMAIL = 'marvel@example.com';

function confirmedAuthUser(overrides) {
  return {
    id: AUTH_ID,
    email: EMAIL,
    email_confirmed_at: '2026-08-17T12:00:00.000Z',
    user_metadata: { full_name: 'Marvel Perez' },
    ...(overrides || {}),
  };
}

function mockResponse() {
  let body = '';
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    write(chunk) { if (chunk) body += String(chunk); return true; },
    end(chunk) { if (chunk) body += String(chunk); },
    json() { return JSON.parse(body || '{}'); },
  };
}

async function exchange(accessToken = 'unit-access-token') {
  const req = Readable.from([JSON.stringify({ access_token: accessToken })]);
  req.headers = { 'content-type': 'application/json' };
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = mockResponse();
  await handlers['POST /api/auth/oauth/google/exchange'](req, res);
  return res;
}

async function passwordLogin(email, password) {
  const req = Readable.from([JSON.stringify({ email, password })]);
  req.method = 'POST';
  req.url = '/api/login';
  req.headers = {
    'content-type': 'application/json',
    'user-agent': 'canonical-login-test',
    'x-forwarded-for': '198.51.100.25',
  };
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = mockResponse();
  await handlers['POST /api/login'](req, res);
  return res;
}

function scryptHash(password) {
  const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

async function getProducts(token) {
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = '/api/products';
  req.headers = { authorization: `Bearer ${token}` };
  req.socket = { remoteAddress: '127.0.0.1' };
  const res = mockResponse();
  await handlers['GET /api/products'](req, res);
  return res;
}

function resetOverrides() {
  setSupabaseRequestForTest(null);
  setSupabaseAuthUserForTest(null);
}

describe('Google OAuth canonical POS provisioning', () => {
  test('accepts only the canonical Supabase project outside test mode', () => {
    assert.equal(
      isExpectedSupabaseUrl(`https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`),
      true,
    );
    assert.equal(isExpectedSupabaseUrl('https://zhvwmzkcqngcaqpdxtwr.supabase.co'), false);
    assert.equal(isExpectedSupabaseUrl(`http://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`), false);
    assert.equal(isExpectedSupabaseUrl(`https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co/rest/v1`), false);
  });

  test('escapes PostgREST wildcard characters in canonical email lookup', async () => {
    const specialEmail = 'mar_vel%tag*promo@example.com';
    let emailLookupPath = null;
    const user = {
      id: AUTH_ID,
      email: specialEmail,
      role: 'owner',
      company_id: COMPANY_ID,
      tenant_id: 'TNT-EMAIL-ESCAPE-01',
      is_active: true,
      notes: null,
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: 'TNT-EMAIL-ESCAPE-01',
      owner_user_id: AUTH_ID,
      is_active: true,
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser({ email: specialEmail }));
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) {
        emailLookupPath = path;
        return [user];
      }
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('email-wildcard-token');
      assert.equal(res.statusCode, 200);
      assert.match(emailLookupPath, /email=ilike\.mar%5C_vel%5C%25tag%5C\*promo%40example\.com/);
    } finally {
      resetOverrides();
    }
  });

  test('keeps an existing magic-link/Google user on the same UUID and tenant', async () => {
    const calls = [];
    const tenantId = 'TNT-MARVEL-01';
    const existingUser = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'USER',
      company_id: COMPANY_ID,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'owner', tenant_id: tenantId, source: 'negocio_persona_link' }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: AUTH_ID,
      is_active: true,
      name: 'Marvel Perez',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path, body) => {
      calls.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [existingUser];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [existingUser];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      if (method === 'GET' && path.startsWith('/pos_companies?owner_user_id=eq.')) return [company];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange();
      const payload = res.json();
      assert.equal(res.statusCode, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.user.id, AUTH_ID);
      assert.equal(payload.user.tenant_id, tenantId);
      assert.equal(payload.user.company_id, COMPANY_ID);
      const claims = verifyJWT(payload.token);
      assert.equal(claims.sub, AUTH_ID);
      assert.equal(claims.id, AUTH_ID);
      assert.equal(claims.tenant_id, tenantId);
      assert.equal(claims.company_id, COMPANY_ID);
      assert.equal(claims.owner_user_id, AUTH_ID);
      assert.equal(calls.some((call) => call.method !== 'GET'), false);
    } finally {
      resetOverrides();
    }
  });

  test('provisions a confirmed Google user once with its Supabase UUID', async () => {
    const calls = [];
    let user = null;
    let company = null;
    setSupabaseAuthUserForTest(async () => confirmedAuthUser({ email: 'nuevo@example.com' }));
    setSupabaseRequestForTest(async (method, path, body) => {
      calls.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return user ? [user] : [];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return user ? [user] : [];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return company ? [company] : [];
      if (method === 'GET' && path.startsWith('/pos_companies?owner_user_id=eq.')) return company ? [company] : [];
      if (method === 'POST' && path === '/pos_users') {
        user = { ...body };
        return [user];
      }
      if (method === 'POST' && path === '/pos_companies') {
        company = { ...body };
        return [company];
      }
      if (method === 'PATCH' && path.startsWith('/pos_users?id=eq.')) {
        user = { ...user, ...body };
        return [user];
      }
      if (method === 'PATCH' && path.startsWith('/pos_companies?id=eq.')) {
        company = { ...company, ...body };
        return [company];
      }
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const first = await exchange('first-token');
      const second = await exchange('second-token');
      const firstPayload = first.json();
      const secondPayload = second.json();
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.equal(user.id, AUTH_ID);
      assert.equal(user.phone, `pending:${AUTH_ID}`);
      assert.equal(company.owner_user_id, AUTH_ID);
      assert.equal(user.company_id, company.id);
      assert.equal(firstPayload.user.id, AUTH_ID);
      assert.equal(secondPayload.user.id, AUTH_ID);
      assert.equal(firstPayload.user.tenant_id, secondPayload.user.tenant_id);
      assert.equal(Object.hasOwn(firstPayload.user, 'phone'), false);
      assert.equal(JSON.stringify(firstPayload).includes('pending:'), false);
      assert.match(firstPayload.user.tenant_id, /^TNT-[A-F0-9]{32}$/);
      assert.equal(verifyJWT(firstPayload.token).sub, AUTH_ID);
      assert.equal(verifyJWT(firstPayload.token).company_id, company.id);
      assert.equal(verifyJWT(firstPayload.token).owner_user_id, AUTH_ID);
      assert.equal(verifyJWT(firstPayload.token).role, 'owner');
      assert.equal(calls.filter((call) => call.method === 'POST' && call.path === '/pos_users').length, 1);
      assert.equal(calls.filter((call) => call.method === 'POST' && call.path === '/pos_companies').length, 1);
      assert.equal(calls.some((call) => JSON.stringify(call.body || {}).includes('USR-')), false);
    } finally {
      resetOverrides();
    }
  });

  test('keeps a legitimate member UUID and canonical company owner even when a legacy seed differs', async () => {
    const calls = [];
    // TNT001 has a legacy fallback owner in api/index.js. The company loaded
    // from the canonical DB is intentionally different and must prevail.
    const tenantId = 'TNT001';
    const member = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'USER',
      company_id: COMPANY_ID,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'cajero', tenant_id: tenantId }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: OWNER_ID,
      is_active: true,
      name: 'Negocio compartido',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      calls.push({ method, path });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [member];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [member];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      if (method === 'GET' && path.startsWith('/pos_active_sessions?')) return [];
      if (method === 'GET' && path.startsWith(`/pos_products?pos_user_id=eq.${OWNER_ID}`)) {
        return [{ id: 'product-1', name: 'Producto compartido', price: 10, cost: 5, stock: 2 }];
      }
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const login = await exchange('member-token');
      const payload = login.json();
      assert.equal(login.statusCode, 200);
      assert.equal(payload.user.id, AUTH_ID);
      assert.equal(payload.user.role, 'cajero');
      assert.equal(payload.user.owner_user_id, OWNER_ID);
      const claims = verifyJWT(payload.token);
      assert.equal(claims.sub, AUTH_ID);
      assert.equal(claims.owner_user_id, OWNER_ID);
      assert.equal(claims.company_id, COMPANY_ID);

      const products = await getProducts(payload.token);
      assert.equal(products.statusCode, 200);
      assert.equal(products.json()[0].name, 'Producto compartido');
      assert.ok(calls.some((call) => call.path.startsWith(`/pos_products?pos_user_id=eq.${OWNER_ID}`)));
    } finally {
      resetOverrides();
    }
  });

  test('adopts one active tenant company for an existing Google member without company_id', async () => {
    const tenantId = 'TNT-LEGACY-GOOGLE-01';
    const calls = [];
    let member = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'USER',
      company_id: null,
      tenant_id: null,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'cajero', tenant_id: tenantId }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: OWNER_ID,
      is_active: true,
      name: 'Empresa legacy Google',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path, body) => {
      calls.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [member];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [member];
      if (method === 'GET' && path.startsWith('/pos_companies?owner_user_id=eq.')) return [];
      if (method === 'GET' && path.startsWith('/pos_companies?tenant_id=eq.')) return [company];
      if (method === 'PATCH' && path.startsWith('/pos_users?id=eq.')) {
        member = { ...member, ...body };
        return [member];
      }
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('legacy-google-member-token');
      assert.equal(res.statusCode, 200);
      const claims = verifyJWT(res.json().token);
      assert.equal(claims.sub, AUTH_ID);
      assert.equal(claims.company_id, COMPANY_ID);
      assert.equal(claims.owner_user_id, OWNER_ID);
      assert.ok(calls.some((call) => call.method === 'PATCH'
        && call.path.startsWith('/pos_users?id=eq.') && call.body.company_id === COMPANY_ID));
      assert.equal(calls.some((call) => call.method === 'POST' && call.path === '/pos_companies'), false);
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when a concurrent writer assigns a different company tenant', async () => {
    const tenantId = 'TNT-CAS-COMPANY-01';
    let patchAttempted = false;
    const user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'owner',
      company_id: COMPANY_ID,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'owner', tenant_id: tenantId }),
    };
    const initialCompany = {
      id: COMPANY_ID,
      tenant_id: null,
      owner_user_id: AUTH_ID,
      is_active: true,
      name: 'Empresa CAS',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) {
        return [{ ...initialCompany, tenant_id: patchAttempted ? 'TNT-CONCURRENT-OTHER' : null }];
      }
      if (method === 'PATCH' && path.startsWith('/pos_companies?id=eq.')) {
        assert.match(path, /&tenant_id=is\.null/);
        patchAttempted = true;
        return [];
      }
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('company-cas-conflict');
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_IDENTITY_CONFLICT');
      assert.equal(patchAttempted, true);
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when a concurrent writer links the user to another company', async () => {
    const tenantId = 'TNT-CAS-USER-01';
    let patchAttempted = false;
    const initialUser = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'USER',
      company_id: null,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'cajero', tenant_id: tenantId }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: OWNER_ID,
      is_active: true,
      name: 'Empresa adoptable CAS',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) {
        return [{ ...initialUser, company_id: patchAttempted ? OTHER_ID : null }];
      }
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [initialUser];
      if (method === 'GET' && path.startsWith('/pos_companies?owner_user_id=eq.')) return [];
      if (method === 'GET' && path.startsWith('/pos_companies?tenant_id=eq.')) return [company];
      if (method === 'PATCH' && path.startsWith('/pos_users?id=eq.')) {
        assert.match(path, /&company_id=is\.null/);
        patchAttempted = true;
        return [];
      }
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('user-company-cas-conflict');
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_IDENTITY_CONFLICT');
      assert.equal(patchAttempted, true);
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when canonical notes change during their compare-and-set patch', async () => {
    const tenantId = 'TNT-CAS-NOTES-01';
    let patchAttempted = false;
    const initialUser = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'owner',
      company_id: COMPANY_ID,
      tenant_id: null,
      is_active: true,
      notes: null,
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: AUTH_ID,
      is_active: true,
      name: 'Empresa notes CAS',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) {
        return [{
          ...initialUser,
          notes: patchAttempted
            ? JSON.stringify({ volvix_role: 'owner', tenant_id: 'TNT-CONCURRENT-NOTES' })
            : null,
        }];
      }
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [initialUser];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      if (method === 'PATCH' && path.startsWith('/pos_users?id=eq.')) {
        assert.match(path, new RegExp(`&company_id=eq\\.${COMPANY_ID}`));
        assert.match(path, /&notes=is\.null/);
        patchAttempted = true;
        return [];
      }
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('user-notes-cas-conflict');
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_IDENTITY_CONFLICT');
      assert.equal(patchAttempted, true);
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when an explicitly linked company is missing', async () => {
    const writes = [];
    const user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'USER',
      company_id: COMPANY_ID,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'cajero', tenant_id: 'TNT-MEMBER-01' }),
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method !== 'GET') writes.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange();
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_COMPANY_NOT_FOUND');
      assert.equal(writes.length, 0);
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when the returned company does not match company_id', async () => {
    const user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'USER',
      company_id: COMPANY_ID,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'cajero', tenant_id: 'TNT-MEMBER-01' }),
    };
    const foreignCompany = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenant_id: 'TNT-MEMBER-01',
      owner_user_id: OWNER_ID,
      is_active: true,
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [foreignCompany];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange();
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_IDENTITY_CONFLICT');
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when member notes and company tenant disagree', async () => {
    const user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'USER',
      company_id: COMPANY_ID,
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'cajero', tenant_id: 'TNT-NOTES-01' }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: 'TNT-COMPANY-02',
      owner_user_id: OWNER_ID,
      is_active: true,
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange();
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_IDENTITY_CONFLICT');
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when direct tenant_id and notes.tenant_id contradict each other', async () => {
    const writes = [];
    const user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'manager',
      company_id: COMPANY_ID,
      tenant_id: 'TNT-DIRECT-01',
      is_active: true,
      notes: JSON.stringify({ volvix_role: 'manager', tenant_id: 'TNT-NOTES-02' }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: 'TNT-DIRECT-01',
      owner_user_id: OWNER_ID,
      is_active: true,
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method !== 'GET') writes.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      return [];
    });

    try {
      const res = await exchange('tenant-conflict-token');
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_IDENTITY_CONFLICT');
      assert.equal(writes.length, 0);
    } finally {
      resetOverrides();
    }
  });

  test('fails closed on invalid notes even when the direct tenant is valid', async () => {
    const writes = [];
    const user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'manager',
      company_id: COMPANY_ID,
      tenant_id: 'TNT-DIRECT-03',
      is_active: true,
      notes: '{invalid-json',
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: 'TNT-DIRECT-03',
      owner_user_id: OWNER_ID,
      is_active: true,
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method !== 'GET') writes.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      return [];
    });

    try {
      const res = await exchange('invalid-notes-token');
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error_code, 'POS_IDENTITY_CONFLICT');
      assert.equal(writes.length, 0);
    } finally {
      resetOverrides();
    }
  });

  test('accepts null notes when the direct tenant and company are canonical', async () => {
    const tenantId = 'TNT-DIRECT-04';
    const user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'owner',
      company_id: COMPANY_ID,
      tenant_id: tenantId,
      is_active: true,
      notes: null,
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: AUTH_ID,
      is_active: true,
      name: 'Empresa canónica',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('null-notes-token');
      assert.equal(res.statusCode, 200);
      const claims = verifyJWT(res.json().token);
      assert.equal(claims.tenant_id, tenantId);
      assert.equal(claims.owner_user_id, AUTH_ID);
    } finally {
      resetOverrides();
    }
  });

  test('uses JSON serialization for an object notes snapshot during canonical CAS', async () => {
    const tenantId = 'TNT-OBJECT-NOTES-01';
    let user = {
      id: AUTH_ID,
      email: EMAIL,
      role: 'owner',
      company_id: COMPANY_ID,
      tenant_id: null,
      is_active: true,
      notes: { volvix_role: 'owner', source: 'jsonb-fixture' },
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: AUTH_ID,
      is_active: true,
      name: 'Empresa JSON notes',
    };
    let casPath = '';
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [user];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      if (method === 'PATCH' && path.startsWith('/pos_users?id=eq.')) {
        casPath = path;
        user = { ...user, ...body };
        return [user];
      }
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('object-notes-cas-token');
      assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
      assert.match(casPath, /&notes=eq\.%7B%22volvix_role%22/);
      assert.doesNotMatch(casPath, /object%20Object/);
      assert.equal(verifyJWT(res.json().token).tenant_id, tenantId);
    } finally {
      resetOverrides();
    }
  });

  test('password and Google preserve the same member UUID, tenant, company and owner', async () => {
    const password = 'MemberPass-2026';
    const tenantId = 'TNT-DUAL-AUTH-01';
    const member = {
      id: AUTH_ID,
      email: EMAIL,
      password_hash: scryptHash(password),
      role: 'manager',
      company_id: COMPANY_ID,
      tenant_id: tenantId,
      is_active: true,
      mfa_enabled: false,
      notes: JSON.stringify({
        volvix_role: 'manager',
        tenant_id: tenantId,
        tenant_name: 'Negocio dual',
        password_login_enabled: true,
      }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: OWNER_ID,
      is_active: true,
      name: 'Negocio dual',
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [member];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [member];
      if (method === 'GET' && path.startsWith('/pos_users?email=eq.')) return [member];
      if (method === 'GET' && path.startsWith('/pos_companies?id=eq.')) return [company];
      if (method === 'GET' && path.startsWith('/pos_login_attempts?')) return [];
      if (method === 'GET' && path.startsWith('/pos_active_sessions?')) return [];
      if (method === 'GET' && path.startsWith('/pos_login_fingerprints?')) return [];
      return [];
    });

    try {
      const googleRes = await exchange('dual-google-token');
      const passwordRes = await passwordLogin(EMAIL, password);
      assert.equal(googleRes.statusCode, 200);
      assert.equal(passwordRes.statusCode, 200, JSON.stringify(passwordRes.json()));
      const googleClaims = verifyJWT(googleRes.json().token);
      const passwordClaims = verifyJWT(passwordRes.json().token);
      for (const key of ['sub', 'id', 'email', 'role', 'tenant_id', 'company_id', 'owner_user_id']) {
        assert.equal(passwordClaims[key], googleClaims[key], `claim ${key}`);
      }
      assert.equal(googleClaims.auth_provider, 'google');
      assert.equal(passwordClaims.auth_provider, 'password');
      assert.equal(passwordRes.json().session.owner_user_id, OWNER_ID);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      resetOverrides();
    }
  });

  test('resolves a legacy tenant-only member through exactly one active company', async () => {
    const email = 'legacy-member@example.com';
    const password = 'LegacyPass-2026';
    const tenantId = 'TNT-LEGACY-ONLY-01';
    const legacyMember = {
      id: OTHER_ID,
      email,
      password_hash: scryptHash(password),
      role: 'manager',
      company_id: null,
      tenant_id: null,
      is_active: true,
      mfa_enabled: false,
      notes: JSON.stringify({ tenant_id: tenantId, volvix_role: 'manager', password_login_enabled: true }),
    };
    const company = {
      id: COMPANY_ID,
      tenant_id: tenantId,
      owner_user_id: OWNER_ID,
      is_active: true,
      name: 'Empresa legacy resuelta',
    };
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?email=eq.')) return [legacyMember];
      if (method === 'GET' && path.startsWith('/pos_companies?owner_user_id=eq.')) return [];
      if (method === 'GET' && path.startsWith('/pos_companies?tenant_id=eq.')) return [company];
      if (method === 'GET' && path.startsWith('/pos_login_attempts?')) return [];
      if (method === 'GET' && path.startsWith('/pos_active_sessions?')) return [];
      if (method === 'GET' && path.startsWith('/pos_login_fingerprints?')) return [];
      return [];
    });

    try {
      const res = await passwordLogin(email, password);
      assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
      const claims = verifyJWT(res.json().token);
      assert.equal(claims.sub, OTHER_ID);
      assert.equal(claims.tenant_id, tenantId);
      assert.equal(claims.company_id, COMPANY_ID);
      assert.equal(claims.owner_user_id, OWNER_ID);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      resetOverrides();
    }
  });

  test('allows a platform ADMIN without assigning a tenant or catalog owner', async () => {
    const email = 'platform-admin@example.com';
    const password = 'PlatformPass-2026';
    const platformAdmin = {
      id: OTHER_ID,
      email,
      password_hash: scryptHash(password),
      role: 'ADMIN',
      company_id: null,
      tenant_id: null,
      is_active: true,
      mfa_enabled: false,
      notes: null,
    };
    setSupabaseRequestForTest(async (method, path) => {
      if (method === 'GET' && path.startsWith('/pos_users?email=eq.')) return [platformAdmin];
      if (method === 'GET' && path.startsWith('/pos_login_attempts?')) return [];
      if (method === 'GET' && path.startsWith('/pos_login_fingerprints?')) return [];
      return [];
    });

    try {
      const res = await passwordLogin(email, password);
      assert.equal(res.statusCode, 200, JSON.stringify(res.json()));
      const claims = verifyJWT(res.json().token);
      assert.equal(claims.sub, OTHER_ID);
      assert.equal(claims.role, 'superadmin');
      assert.equal(claims.tenant_id, null);
      assert.equal(claims.company_id, null);
      assert.equal(claims.owner_user_id, null);
      assert.equal(res.json().session.tenant_id, null);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      resetOverrides();
    }
  });

  test('Google keeps an existing platform ADMIN outside every tenant without catalog writes', async () => {
    const email = 'platform-google@example.com';
    const writes = [];
    const platformAdmin = {
      id: OTHER_ID,
      email,
      role: 'ADMIN',
      company_id: null,
      tenant_id: null,
      is_active: true,
      notes: null,
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser({ id: OTHER_ID, email }));
    setSupabaseRequestForTest(async (method, path, body) => {
      if (method !== 'GET') writes.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [platformAdmin];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [platformAdmin];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange('platform-google-token');
      assert.equal(res.statusCode, 200);
      const payload = res.json();
      const claims = verifyJWT(payload.token);
      assert.equal(claims.sub, OTHER_ID);
      assert.equal(claims.role, 'superadmin');
      assert.equal(claims.tenant_id, null);
      assert.equal(claims.company_id, null);
      assert.equal(claims.owner_user_id, null);
      assert.equal(payload.tenant, null);
      assert.equal(payload.redirect, '/volvix-launcher.html');
      assert.equal(writes.length, 0);
    } finally {
      resetOverrides();
    }
  });

  test('fails closed when the email belongs to a different POS UUID', async () => {
    const calls = [];
    const conflictingUser = {
      id: OTHER_ID,
      email: EMAIL,
      role: 'owner',
      company_id: COMPANY_ID,
      is_active: true,
      notes: JSON.stringify({ tenant_id: 'TNT-OTHER-01' }),
    };
    setSupabaseAuthUserForTest(async () => confirmedAuthUser());
    setSupabaseRequestForTest(async (method, path, body) => {
      calls.push({ method, path, body });
      if (method === 'GET' && path.startsWith('/pos_users?id=eq.')) return [];
      if (method === 'GET' && path.startsWith('/pos_users?email=ilike.')) return [conflictingUser];
      throw new Error(`unexpected Supabase call: ${method} ${path}`);
    });

    try {
      const res = await exchange();
      const payload = res.json();
      assert.equal(res.statusCode, 409);
      assert.equal(payload.error_code, 'POS_IDENTITY_CONFLICT');
      assert.equal(calls.some((call) => call.method === 'POST' || call.method === 'PATCH'), false);
    } finally {
      resetOverrides();
    }
  });

  test('rejects an unconfirmed Google email before touching POS data', async () => {
    let databaseCalls = 0;
    setSupabaseAuthUserForTest(async () => confirmedAuthUser({ email_confirmed_at: null, confirmed_at: null }));
    setSupabaseRequestForTest(async () => { databaseCalls += 1; return []; });
    try {
      const res = await exchange();
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().error_code, 'SUPABASE_EMAIL_UNCONFIRMED');
      assert.equal(databaseCalls, 0);
    } finally {
      resetOverrides();
    }
  });
});
