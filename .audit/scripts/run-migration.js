// Aplica una migration SQL contra Supabase Management API
// Uso: node .audit/scripts/run-migration.js <ruta-sql>
const fs = require('fs');
const path = require('path');
const https = require('https');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const PAT_RAW = process.env.SUPABASE_PAT || '';
// Strip quotes, literal \n, whitespace
const PAT = PAT_RAW.replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim();
const URL = (process.env.SUPABASE_URL || '').replace(/^["']|["']$/g, '').trim();
const REF = URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!PAT || !REF) {
  console.error('Missing SUPABASE_PAT or SUPABASE_URL');
  process.exit(1);
}

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-migration.js <file.sql>');
    process.exit(1);
  }
  console.log(`PAT prefix: ${PAT.slice(0, 8)}... len=${PAT.length}`);
  console.log(`Project ref: ${REF}`);
  console.log(`Migration: ${file}`);
  const sql = fs.readFileSync(file, 'utf8');
  console.log(`SQL bytes: ${sql.length}`);
  console.log('Running...');
  const res = await runSql(sql);
  console.log(`HTTP ${res.status}`);
  console.log(res.body.slice(0, 2000));
}

main().catch(e => { console.error(e); process.exit(2); });
