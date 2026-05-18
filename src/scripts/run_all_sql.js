#!/usr/bin/env node
// Runs all R14/R16/R17/R18 SQL files via Supabase Management API
const fs = require('fs');
const path = require('path');
const https = require('https');

const PAT = process.env.SUPABASE_PAT || 'sbp_b6fe6a70e5176d0662fa19c6363ecb4775a8f72e';
const PROJECT_REF = 'zhvwmzkcqngcaqpdxtwr';

// Skip combined files (we run individual ones), tests
const SKIP = ['R14_ALL_COMBINED.sql', 'R14_ALL_COMBINED_SAFE.sql'];

// Order matters: extensions first, then base, then features
const ORDER = [
  // Extensions are run separately first
  // RLS depends on tables existing, so AT END
  'R14_INDEXES.sql',
  'R14_CURRENCIES.sql',
  'R14_AI_LOG.sql',
  'R14_API_KEYS.sql',
  'R14_AUDIT_GDPR.sql',
  'R14_CASH_SESSIONS.sql',
  'R14_CFDI_TABLES.sql',
  'R14_CREDITS.sql',
  'R14_CUSTOMER_AUTH.sql',
  'R14_EMAIL_LOG.sql',
  'R14_ERROR_LOG.sql',
  'R14_INVENTORY.sql',
  'R14_LOYALTY.sql',
  'R14_MFA.sql',
  'R14_PAYMENTS.sql',
  'R14_PRINTERS.sql',
  'R14_PUSH_SUBS.sql',
  'R14_QUOTATIONS.sql',
  'R14_REALTIME.sql',
  'R14_REPORTS_VIEWS.sql',
  'R14_RETURNS.sql',
  'R14_SAT_CATALOGS.sql',
  'R14_SUBSCRIPTIONS.sql',
  'R14_VERTICAL_TEMPLATES.sql',
  'R14_WEBHOOKS.sql',
  // R17 features
  'R17_APPOINTMENTS.sql',
  'R17_BUNDLES.sql',
  'R17_DISCORD.sql',
  'R17_FRAUD.sql',
  'R17_GEOFENCE.sql',
  'R17_GIFTCARDS.sql',
  'R17_KIOSK.sql',
  'R17_ML.sql',
  'R17_OCR.sql',
  'R17_PROMOTIONS.sql',
  'R17_QR_PAYMENTS.sql',
  'R17_RETURNS_EXTENDED.sql',
  'R17_SEGMENTS.sql',
  'R17_SMS.sql',
  'R17_TELEGRAM.sql',
  'R17_TIPS.sql',
  'R17_WALLETS.sql',
  'R17_WAREHOUSES.sql',
  'R17_WHATSAPP.sql',
  // R18 features
  'R18_ACCOUNTING_SAT.sql',
  'R18_AMAZON.sql',
  'R18_CLOUD_BACKUP.sql',
  'R18_CRM_ADVANCED.sql',
  'R18_HR.sql',
  'R18_KDS.sql',
  'R18_MARKETPLACE.sql',
  'R18_MERCADOLIBRE.sql',
  'R18_NFT_LOYALTY.sql',
  'R18_PAYROLL.sql',
  'R18_SHOP.sql',
  'R18_SHOPIFY.sql',
  'R18_SQUARE_SYNC.sql',
  // RLS and hardening last
  'R13_RLS_POLICIES.sql',
  'R16_RLS_HARDENING.sql',
];

function runSQL(sql) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => resolve({ status: 0, body: String(e.message) }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

(async () => {
  const dbDir = path.resolve(__dirname, '../db');
  const results = { ok: [], fail: [] };

  // 1) Ensure extensions
  console.log('[1/2] Installing extensions...');
  const ext = await runSQL('CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS btree_gin;');
  console.log('  ext status:', ext.status, ext.body.slice(0, 200));

  // 2) Run each file
  console.log('[2/2] Running SQL files...');
  for (const file of ORDER) {
    const fp = path.join(dbDir, file);
    if (!fs.existsSync(fp)) { console.log(`  SKIP ${file} (not found)`); continue; }
    const sql = fs.readFileSync(fp, 'utf8');
    process.stdout.write(`  ${file}... `);
    const r = await runSQL(sql);
    if (r.status === 200 || r.status === 201) {
      console.log('OK');
      results.ok.push(file);
    } else {
      // Many files have minor issues like FK to non-existent tables — log but continue
      const msg = r.body.slice(0, 250).replace(/\n/g, ' ');
      console.log(`FAIL [${r.status}] ${msg}`);
      results.fail.push({ file, status: r.status, msg });
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`OK:    ${results.ok.length}`);
  console.log(`FAIL:  ${results.fail.length}`);
  if (results.fail.length) {
    console.log('\nFailures:');
    results.fail.forEach(f => console.log(`  - ${f.file}: ${f.msg.slice(0, 150)}`));
  }
  fs.writeFileSync(path.resolve(__dirname, '../R19_SQL_RUN_RESULT.json'), JSON.stringify(results, null, 2));
  console.log('\nReport written to R19_SQL_RUN_RESULT.json');
})();
