#!/usr/bin/env node
/**
 * supa-runner.js — utility para ejecutar SQL via Supabase Management API
 */
'use strict';
require('dotenv').config();
const https = require('https');

const PAT = (process.env.SUPABASE_PAT || '').trim();
const URL = (process.env.SUPABASE_URL || '').trim();
const REF = URL.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1];

if (!PAT || !REF) {
  console.error('Missing SUPABASE_PAT or SUPABASE_URL');
  process.exit(1);
}

function runSQL(query, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); try { req.destroy(); } catch(_){} } }, timeoutMs);
    const req = https.request({
      hostname: 'api.supabase.com',
      path: '/v1/projects/' + REF + '/database/query',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + PAT,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        try {
          const j = JSON.parse(buf);
          resolve({ status: res.statusCode, data: j });
        } catch(e) {
          resolve({ status: res.statusCode, data: buf });
        }
      });
    });
    req.on('error', e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    req.write(body);
    req.end();
  });
}

module.exports = { runSQL };

// CLI
if (require.main === module) {
  const sql = process.argv.slice(2).join(' ') || 'SELECT NOW() AS now';
  runSQL(sql).then(r => {
    console.log('Status:', r.status);
    console.log(JSON.stringify(r.data, null, 2));
  }).catch(e => { console.error('ERR:', e.message); process.exit(1); });
}
