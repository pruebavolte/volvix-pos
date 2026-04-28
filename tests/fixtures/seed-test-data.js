// tests/fixtures/seed-test-data.js
// Idempotent seeders. Use a fixed prefix so re-running doesn't double-seed.
const { createTestProduct, createTestCustomer, cleanupTestData, TEST_PREFIX } = require('./data');
const { apiCall } = require('./auth');

const SEED_PREFIX = `${TEST_PREFIX}seed_`;

async function seedProducts(baseURL, token, count = 10) {
  const created = [];
  for (let i = 0; i < count; i++) {
    const sku = `${SEED_PREFIX}prod_${i}`;
    // Check if already exists (idempotency)
    const search = await apiCall(baseURL, token, 'get', `/api/products?sku=${encodeURIComponent(sku)}`);
    let existing = null;
    if (search.status === 200) {
      const arr = Array.isArray(search.body) ? search.body : (search.body?.data || search.body?.items || []);
      existing = arr.find(p => p.sku === sku);
    }
    if (existing?.id) {
      created.push({ kind: 'product', id: existing.id, sku, reused: true });
      continue;
    }
    const p = await createTestProduct(baseURL, token, {
      sku,
      name: `${SEED_PREFIX}Producto ${i}`,
      price: 10 + i,
      cost: 5 + i,
      stock: 50 + i,
    });
    if (p.id) created.push({ kind: 'product', id: p.id, sku, reused: false });
  }
  return created;
}

async function seedCustomers(baseURL, token, count = 5) {
  const created = [];
  for (let i = 0; i < count; i++) {
    const email = `${SEED_PREFIX}cust_${i}@test.volvix.test`;
    const search = await apiCall(baseURL, token, 'get', `/api/customers?email=${encodeURIComponent(email)}`);
    let existing = null;
    if (search.status === 200) {
      const arr = Array.isArray(search.body) ? search.body : (search.body?.data || search.body?.items || []);
      existing = arr.find(c => c.email === email);
    }
    if (existing?.id) {
      created.push({ kind: 'customer', id: existing.id, email, reused: true });
      continue;
    }
    const c = await createTestCustomer(baseURL, token, {
      email,
      name: `${SEED_PREFIX}Cliente ${i}`,
      phone: `555000000${i}`,
      credit_limit: 1000 + (i * 100),
    });
    if (c.id) created.push({ kind: 'customer', id: c.id, email, reused: false });
  }
  return created;
}

async function cleanupAllSeed(baseURL, token, items) {
  return cleanupTestData(baseURL, token, items);
}

module.exports = {
  SEED_PREFIX,
  seedProducts,
  seedCustomers,
  cleanupAllSeed,
};
