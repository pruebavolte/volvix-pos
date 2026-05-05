// tests/fixtures/data.js
// Test data factories — idempotent, all use a `test_` prefix so cleanup is safe.
const { apiCall } = require('./auth');

const TEST_PREFIX = 'b36test_';

function uniqueSuffix() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Try a list of API paths and return the first 2xx response.
 * Used because endpoint paths may vary slightly between deploys.
 */
async function tryPaths(baseURL, token, method, paths, body) {
  for (const p of paths) {
    const r = await apiCall(baseURL, token, method, p, body);
    if (r.status >= 200 && r.status < 300) return { ...r, path: p };
  }
  return { status: 0, ok: false, body: null, path: null };
}

async function createTestProduct(baseURL, token, data = {}) {
  const sku = data.sku || `${TEST_PREFIX}sku_${uniqueSuffix()}`;
  const payload = {
    sku,
    name: data.name || `${TEST_PREFIX}product_${uniqueSuffix()}`,
    price: data.price ?? 10.00,
    cost:  data.cost  ?? 5.00,
    stock: data.stock ?? 100,
    category: data.category || 'general',
    ...data,
  };
  const res = await tryPaths(baseURL, token, 'post',
    ['/api/products', '/api/v1/products'], payload);
  const id = res.body?.id || res.body?.product_id || res.body?.data?.id;
  return { id, sku, payload, raw: res };
}

async function createTestCustomer(baseURL, token, data = {}) {
  const payload = {
    name: data.name || `${TEST_PREFIX}customer_${uniqueSuffix()}`,
    email: data.email || `${TEST_PREFIX}${uniqueSuffix()}@test.volvix.test`,
    phone: data.phone || '5550000000',
    credit_limit: data.credit_limit ?? 1000,
    ...data,
  };
  const res = await tryPaths(baseURL, token, 'post',
    ['/api/customers', '/api/v1/customers'], payload);
  const id = res.body?.id || res.body?.customer_id || res.body?.data?.id;
  return { id, payload, raw: res };
}

async function createTestUser(baseURL, token, data = {}) {
  const payload = {
    email: data.email || `${TEST_PREFIX}user_${uniqueSuffix()}@test.volvix.test`,
    password: data.password || 'TempPass123!',
    name: data.name || `${TEST_PREFIX}user`,
    role: data.role || 'cajero',
    ...data,
  };
  const res = await tryPaths(baseURL, token, 'post',
    ['/api/users', '/api/v1/users'], payload);
  const id = res.body?.id || res.body?.user_id || res.body?.data?.id;
  return { id, payload, raw: res };
}

/**
 * Best-effort cleanup. Accepts an array of { kind, id } objects.
 * kind: 'product' | 'customer' | 'user' | 'cut'
 */
async function cleanupTestData(baseURL, token, items = []) {
  const results = [];
  for (const it of items) {
    if (!it || !it.id) continue;
    const paths = {
      product:  [`/api/products/${it.id}`,  `/api/v1/products/${it.id}`],
      customer: [`/api/customers/${it.id}`, `/api/v1/customers/${it.id}`],
      user:     [`/api/users/${it.id}`,     `/api/v1/users/${it.id}`],
      cut:      [`/api/cuts/${it.id}`,      `/api/v1/cuts/${it.id}`],
    }[it.kind] || [];
    for (const p of paths) {
      const r = await apiCall(baseURL, token, 'delete', p);
      results.push({ kind: it.kind, id: it.id, path: p, status: r.status });
      if (r.status >= 200 && r.status < 400) break;
    }
  }
  return results;
}

module.exports = {
  TEST_PREFIX,
  uniqueSuffix,
  tryPaths,
  createTestProduct,
  createTestCustomer,
  createTestUser,
  cleanupTestData,
};
