#!/usr/bin/env node
// Apply r10d-a-multimoneda-impuestos.sql via Supabase Management API
const fs = require('fs');
const path = require('path');
const https = require('https');

const PAT = process.env.SUPABASE_PAT || 'sbp_b6fe6a70e5176d0662fa19c6363ecb4775a8f72e';
const PROJECT_REF = 'zhvwmzkcqngcaqpdxtwr';

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
      timeout: 120000,
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
  const fp = path.resolve(__dirname, '../migrations/r10d-a-multimoneda-impuestos.sql');
  if (!fs.existsSync(fp)) { console.error('NOT FOUND', fp); process.exit(1); }
  const sql = fs.readFileSync(fp, 'utf8');
  console.log('[r10d-a] applying migration ...');
  const r = await runSQL(sql);
  console.log('status:', r.status);
  console.log('body:', r.body.slice(0, 1500));

  // Verification queries
  console.log('\n[verify] pos_currencies seed:');
  const v1 = await runSQL("SELECT code, name, exchange_rate_to_base FROM pos_currencies ORDER BY code;");
  console.log(v1.status, v1.body.slice(0, 800));

  console.log('\n[verify] pos_sales new columns:');
  const v2 = await runSQL("SELECT column_name FROM information_schema.columns WHERE table_name='pos_sales' AND column_name IN ('currency','exchange_rate_at_sale','total_in_base_currency') ORDER BY column_name;");
  console.log(v2.status, v2.body.slice(0, 600));

  console.log('\n[verify] pos_branches new columns:');
  const v3 = await runSQL("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='pos_branches' AND column_name IN ('allowed_currencies','tax_rate','tax_zone') ORDER BY column_name;");
  console.log(v3.status, v3.body.slice(0, 600));

  console.log('\n[verify] tenant_settings.base_currency:');
  const v4 = await runSQL("SELECT column_name FROM information_schema.columns WHERE table_name='tenant_settings' AND column_name='base_currency';");
  console.log(v4.status, v4.body.slice(0, 300));

  console.log('\n[verify] branch_tax_history exists:');
  const v5 = await runSQL("SELECT 1 FROM information_schema.tables WHERE table_name='branch_tax_history';");
  console.log(v5.status, v5.body.slice(0, 200));

  process.exit((r.status === 200 || r.status === 201) ? 0 : 2);
})();
