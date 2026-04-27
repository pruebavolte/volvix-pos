#!/usr/bin/env node
/**
 * Volvix POS — Generador VAPID nativo (Node crypto, sin dependencias).
 *
 * Genera un par EC P-256 y lo emite en base64url:
 *   - VAPID_PUBLIC_KEY  : punto sin comprimir (65 bytes, prefijo 0x04)
 *   - VAPID_PRIVATE_KEY : escalar privado (32 bytes)
 *
 * Listo para pegar en Vercel Environment Variables.
 *
 * Uso:
 *   node tests/generate-vapid.js
 *   node tests/generate-vapid.js --json
 *   node tests/generate-vapid.js --env       (formato KEY=value)
 */
'use strict';

const crypto = require('crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generate() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });

  // JWK contiene x, y (coords pub) y d (escalar priv) en base64url.
  const pubJwk  = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });

  // Decodifica coords y construye punto sin comprimir 0x04 || X || Y.
  const fromB64Url = (s) => Buffer.from(
    s.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - s.length % 4) % 4),
    'base64'
  );

  const x = fromB64Url(pubJwk.x);
  const y = fromB64Url(pubJwk.y);
  const d = fromB64Url(privJwk.d);

  if (x.length !== 32 || y.length !== 32 || d.length !== 32) {
    throw new Error(`tamaños inesperados x=${x.length} y=${y.length} d=${d.length}`);
  }

  const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]); // 65 bytes
  return {
    publicKey:  b64url(uncompressed),
    privateKey: b64url(d),
    subject:    'mailto:admin@volvix-pos.app',
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const keys = generate();

  if (args.has('--json')) {
    process.stdout.write(JSON.stringify({
      VAPID_PUBLIC_KEY:  keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT:     keys.subject,
    }, null, 2) + '\n');
    return;
  }

  if (args.has('--env')) {
    process.stdout.write(
      `VAPID_PUBLIC_KEY=${keys.publicKey}\n` +
      `VAPID_PRIVATE_KEY=${keys.privateKey}\n` +
      `VAPID_SUBJECT=${keys.subject}\n`
    );
    return;
  }

  // Salida humana para copiar a Vercel.
  console.log('================================================================');
  console.log(' Volvix POS — VAPID keys generadas (P-256, base64url)');
  console.log('================================================================');
  console.log('Pegar en Vercel → Project Settings → Environment Variables:\n');
  console.log(`  VAPID_PUBLIC_KEY   = ${keys.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY  = ${keys.privateKey}`);
  console.log(`  VAPID_SUBJECT      = ${keys.subject}`);
  console.log('\nFormatos:');
  console.log('  - PUBLIC : punto sin comprimir 65B (prefijo 0x04) → ' +
              `${Buffer.from(keys.publicKey.replace(/-/g,'+').replace(/_/g,'/'), 'base64').length} bytes`);
  console.log('  - PRIVATE: escalar 32B');
  console.log('\nNo subir estas keys a git. Una vez configuradas, /api/push/vapid-public-key responderá ok:true.');
  console.log('================================================================');
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('error:', e && e.message || e); process.exit(1); }
}

module.exports = { generate };
