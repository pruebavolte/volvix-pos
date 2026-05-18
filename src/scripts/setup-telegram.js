#!/usr/bin/env node
// scripts/setup-telegram.js — registra el webhook de Telegram contra Vercel.
// Uso: TELEGRAM_BOT_TOKEN=xxx node scripts/setup-telegram.js
//      TELEGRAM_BOT_TOKEN=xxx WEBHOOK_URL=https://volvix-pos.vercel.app/api/telegram/webhook node scripts/setup-telegram.js

const https = require('https');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://volvix-pos.vercel.app/api/telegram/webhook';

if (!TOKEN) {
  console.error('ERROR: define TELEGRAM_BOT_TOKEN en el entorno antes de correr este script.');
  process.exit(1);
}

function call(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.telegram.org/bot${TOKEN}${path}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log(`[setup-telegram] registrando webhook en: ${WEBHOOK_URL}`);
  const setRes = await call(`/setWebhook?url=${encodeURIComponent(WEBHOOK_URL)}`);
  console.log('[setWebhook]', JSON.stringify(setRes, null, 2));

  const info = await call('/getWebhookInfo');
  console.log('[getWebhookInfo]', JSON.stringify(info, null, 2));

  if (!setRes.ok) {
    console.error('FALLO al registrar webhook.');
    process.exit(2);
  }
  console.log('OK — webhook registrado. Manda /start a tu bot para probar.');
})().catch((e) => {
  console.error('ERROR:', e);
  process.exit(3);
});
