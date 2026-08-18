'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const RAILWAY_ENTRY = path.join(ROOT, 'railway-server.js');
const PRODUCTION_ENTRY = path.join(ROOT, 'server.js');
const CANONICAL_REF = 'vnruooisqnbqguavrdvd';
const LEGACY_REF = 'zhvwmzkcqngcaqpdxtwr';

describe('canonical Supabase runtime configuration', () => {
  test('Railway has no alternate database or USR fallback backend', () => {
    const source = fs.readFileSync(RAILWAY_ENTRY, 'utf8');
    const paymentsSource = fs.readFileSync(path.join(ROOT, 'api', 'payments-mercadopago.js'), 'utf8');
    assert.doesNotMatch(source, /USR-/);
    assert.doesNotMatch(source, /cd6936c4-d884-4d4d-ad42-0d74f02aa106/);
    assert.match(source, /const apiHandler = require\('\.\/api\/index\.js'\);/);
    assert.doesNotMatch(source, /register-simple fallback/);
    assert.doesNotMatch(paymentsSource, /zhvwmzkcqngcaqpdxtwr/);
    const productionSource = fs.readFileSync(PRODUCTION_ENTRY, 'utf8');
    assert.match(productionSource, /if \(MUST_LOAD_CANONICAL_API\) throw err;/);
  });

  test('Railway exits instead of booting against a legacy Supabase project', () => {
    for (const entry of [RAILWAY_ENTRY, PRODUCTION_ENTRY]) {
      const result = spawnSync(process.execPath, [entry], {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://zhvwmzkcqngcaqpdxtwr.supabase.co',
          SUPABASE_SERVICE_KEY: 'unit-test-key',
          JWT_SECRET: 'unit-test-secret-at-least-32-bytes',
        },
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.notEqual(result.status, 0, entry);
      assert.match(result.stderr || '', /proyecto canónico/, entry);
    }
  });

  test('active web and mobile surfaces use only the canonical Supabase project', () => {
    const ownerSource = fs.readFileSync(path.join(ROOT, 'public', 'owner.html'), 'utf8');
    const capacitor = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
    const railwaySource = fs.readFileSync(RAILWAY_ENTRY, 'utf8');
    const serverSource = fs.readFileSync(PRODUCTION_ENTRY, 'utf8');
    const vercelSource = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');

    assert.match(ownerSource, new RegExp(`https://${CANONICAL_REF}\\.supabase\\.co`));
    assert.match(ownerSource, /fetch\('\/api\/config\/public'/);
    assert.doesNotMatch(ownerSource, new RegExp(LEGACY_REF));
    assert.ok(capacitor.server.allowNavigation.includes(`${CANONICAL_REF}.supabase.co`));
    assert.equal(capacitor.server.allowNavigation.includes(`${LEGACY_REF}.supabase.co`), false);

    for (const source of [railwaySource, serverSource, vercelSource]) {
      assert.doesNotMatch(source, /(?:public|src)[\\/]api[\\/]index\.js/);
      assert.doesNotMatch(source, new RegExp(LEGACY_REF));
    }
    assert.match(railwaySource, /require\('\.\/api\/index\.js'\)/);
    assert.match(serverSource, /require\('\.\/api\/index\.js'\)/);
    assert.match(vercelSource, /"src": "api\/index\.js"/);
  });
});
