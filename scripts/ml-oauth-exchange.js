#!/usr/bin/env node
/**
 * ml-oauth-exchange.js
 *
 * Después de OAuth flow exitoso, intercambia `code` por access+refresh tokens.
 * Guarda en .env y actualiza MERCADOLIBRE_TOKEN_EXPIRES_AT.
 *
 * Uso:
 *   node scripts/ml-oauth-exchange.js <code>
 *
 * Para auto-refresh (cron / loop):
 *   node scripts/ml-oauth-exchange.js --refresh
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const https = require('https');

const CID = (process.env.MERCADOLIBRE_CLIENT_ID || '').trim();
const CSECRET = (process.env.MERCADOLIBRE_CLIENT_SECRET || '').trim();
const REDIRECT = 'https://www.systeminternational.app/api/oauth/mercadopago/callback';

function postOAuth(body) {
  return new Promise((resolve, reject) => {
    const data = Object.entries(body).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    const req = https.request({
      hostname: 'api.mercadolibre.com',
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch(e) { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function saveTokensToEnv(tok) {
  let env = fs.readFileSync('.env', 'utf8');
  const expiresAt = Math.floor(Date.now() / 1000) + (tok.expires_in || 21600);
  const updates = {
    MERCADOLIBRE_ACCESS_TOKEN: tok.access_token,
    MERCADOLIBRE_TOKEN: tok.refresh_token || process.env.MERCADOLIBRE_TOKEN,
    MERCADOLIBRE_TOKEN_EXPIRES_AT: expiresAt,
  };
  Object.entries(updates).forEach(([k, v]) => {
    if (!v) return;
    const re = new RegExp('^' + k + '=.*$', 'm');
    if (re.test(env)) env = env.replace(re, k + '=' + v);
    else env += '\n' + k + '=' + v;
  });
  fs.writeFileSync('.env', env);
  console.log('✅ .env updated.');
  console.log('   access_token len=' + tok.access_token.length);
  console.log('   refresh_token len=' + (tok.refresh_token||'').length);
  console.log('   expires_at=' + new Date(expiresAt * 1000).toISOString());
}

async function testApi(accessToken) {
  return new Promise((res) => {
    const req = https.request({
      hostname: 'api.mercadolibre.com',
      path: '/sites/MLM/search?q=sushi+roll&limit=2',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Accept': 'application/json' },
    }, r => {
      let b = '';
      r.on('data', c => b += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(b);
          if (j.error) { console.log('❌ /sites/MLM/search:', r.statusCode, j.error, '-', j.message?.slice(0, 100)); res(false); }
          else { console.log('✅ /sites/MLM/search: total=' + (j.paging?.total||0)); res(true); }
        } catch(e) { console.log('❌ parse err'); res(false); }
      });
    });
    req.on('error', e => { console.log('❌ ' + e.message); res(false); });
    req.end();
  });
}

(async () => {
  const arg = process.argv[2];
  if (!arg) { console.error('Usage: node scripts/ml-oauth-exchange.js <code|--refresh>'); process.exit(1); }
  if (!CID || !CSECRET) { console.error('Missing CLIENT_ID or CLIENT_SECRET in .env'); process.exit(1); }

  let result;
  if (arg === '--refresh') {
    const RTOK = (process.env.MERCADOLIBRE_TOKEN || '').trim();
    if (!RTOK) { console.error('No refresh_token in .env'); process.exit(1); }
    console.log('Refreshing token...');
    result = await postOAuth({ grant_type: 'refresh_token', client_id: CID, client_secret: CSECRET, refresh_token: RTOK });
  } else {
    console.log('Exchanging authorization code...');
    result = await postOAuth({ grant_type: 'authorization_code', client_id: CID, client_secret: CSECRET, code: arg, redirect_uri: REDIRECT });
  }

  if (result.data.error) {
    console.error('❌ OAuth failed:', result.data.error, '-', result.data.message || '');
    process.exit(1);
  }
  saveTokensToEnv(result.data);
  console.log('');
  console.log('Testing /sites/MLM/search with new token...');
  const ok = await testApi(result.data.access_token);
  if (ok) console.log('🎉 Mercado Libre API READY');
  else console.log('⚠️ Token guardado pero /sites/search sigue bloqueado (PolicyAgent — app no certificada)');
})();
