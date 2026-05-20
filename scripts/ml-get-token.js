#!/usr/bin/env node
/**
 * ml-get-token.js
 *
 * Genera un Mercado Libre Access Token via OAuth Client Credentials grant.
 * Lee MERCADOLIBRE_CLIENT_ID y MERCADOLIBRE_CLIENT_SECRET del .env.
 * Guarda el access_token y refresh_token de vuelta en .env (no los loguea).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// Cargar .env manualmente (sin dependencias)
const envPath = path.join(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
});

const clientId = env.MERCADOLIBRE_CLIENT_ID;
const clientSecret = env.MERCADOLIBRE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌ Falta MERCADOLIBRE_CLIENT_ID o MERCADOLIBRE_CLIENT_SECRET en .env');
  process.exit(1);
}

console.log('═══ ML OAuth Token Request ═══');
console.log('Client ID:', clientId);
console.log('Client Secret length:', clientSecret.length, '(esperado 32)');
console.log('');

const body = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: clientId,
  client_secret: clientSecret,
}).toString();

const req = https.request({
  method: 'POST',
  hostname: 'api.mercadolibre.com',
  path: '/oauth/token',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'User-Agent': 'Volvix-POS/10.40',
    'Content-Length': Buffer.byteLength(body),
  },
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('HTTP:', res.statusCode);
    let parsed;
    try { parsed = JSON.parse(data); } catch (_) { parsed = null; }

    if (res.statusCode === 200 && parsed?.access_token) {
      // NO loguear el access_token
      console.log('✅ Token obtenido — guardando en .env');
      console.log('  Expires in:', parsed.expires_in, 's');
      console.log('  Scope:', parsed.scope);
      console.log('  User ID:', parsed.user_id || '(none — client_credentials)');
      console.log('  Token prefix:', parsed.access_token.slice(0, 12) + '...');

      // Append a .env (sin pisar lo demás)
      let newEnv = envText;
      const updateOrAppend = (key, val) => {
        const re = new RegExp('^' + key + '=.*$', 'm');
        if (re.test(newEnv)) newEnv = newEnv.replace(re, key + '=' + val);
        else newEnv += '\n' + key + '=' + val;
      };
      updateOrAppend('MERCADOLIBRE_ACCESS_TOKEN', parsed.access_token);
      updateOrAppend('MERCADOLIBRE_TOKEN', parsed.access_token); // alias usado por search-public V10.10
      if (parsed.refresh_token) updateOrAppend('MERCADOLIBRE_REFRESH_TOKEN', parsed.refresh_token);
      updateOrAppend('MERCADOLIBRE_TOKEN_EXPIRES_AT', String(Math.floor(Date.now()/1000) + (parsed.expires_in || 21600)));
      fs.writeFileSync(envPath, newEnv);
      console.log('✅ Guardado MERCADOLIBRE_ACCESS_TOKEN y MERCADOLIBRE_TOKEN en .env');
    } else {
      console.error('❌ Error:', res.statusCode);
      console.error('Response:', data.slice(0, 500));
      process.exit(2);
    }
  });
});

req.on('error', e => {
  console.error('❌ Request error:', e.message);
  process.exit(3);
});

req.write(body);
req.end();
