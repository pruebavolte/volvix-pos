const crypto = require('crypto');
const secret = process.env.JWT_SECRET;
if (!secret) { console.error('NO_SECRET'); process.exit(1); }
const now = Math.floor(Date.now() / 1000);
const payload = {
  id: 'agente0-test-admin',
  email: 'test-agent@volvix.local',
  role: 'superadmin',
  tenant_id: null,
  jti: crypto.randomBytes(8).toString('hex'),
  iat: now,
  exp: now + 3600 // 1 hora
};
const b64 = (s) => Buffer.from(JSON.stringify(s)).toString('base64url');
const h = b64({ alg: 'HS256', typ: 'JWT' });
const p = b64(payload);
const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
console.log(`${h}.${p}.${sig}`);
