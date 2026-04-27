#!/usr/bin/env node
/**
 * Simple test runner without frameworks (uses node:assert).
 * Discovers *.test.js in this directory and runs each test() block.
 *
 * Usage: node tests/unit/run.js
 */
'use strict';

// Set required env BEFORE loading api/index.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-unit-tests-only-32bytes';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ||
  'https://volvix-pos.vercel.app,https://app.volvix.com';

const fs = require('fs');
const path = require('path');

const tests = [];
const suites = [];

global.describe = function describe(name, fn) {
  suites.push(name);
  try { fn(); } finally { suites.pop(); }
};
global.test = global.it = function test(name, fn) {
  tests.push({ name: [...suites, name].join(' > '), fn });
};

// Discover and load all .test.js files in this directory
const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
for (const f of files) require(path.join(dir, f));

// Execute
(async () => {
  let passed = 0, failed = 0;
  const failures = [];
  const t0 = Date.now();

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      process.stdout.write(`[32m  ok[0m ${t.name}\n`);
    } catch (e) {
      failed++;
      failures.push({ name: t.name, err: e });
      process.stdout.write(`[31mFAIL[0m ${t.name}\n`);
    }
  }

  const ms = Date.now() - t0;
  console.log(`\n${passed} passed, ${failed} failed (${tests.length} total) in ${ms}ms`);
  if (failures.length) {
    console.log('\n--- Failures ---');
    for (const f of failures) {
      console.log(`\n[${f.name}]`);
      console.log(f.err && f.err.stack || f.err);
    }
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
