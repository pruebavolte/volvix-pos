require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zhvwmzkcqngcaqpdxtwr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const PORT = parseInt(process.env.PORT || '3000');
const SENTRY_DSN = process.env.SENTRY_DSN || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; // sandbox

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── RESEND (Email) ────────────────────────────────────────────────────────────
let resend = null;
try {
  const Resend = require('resend');
  if (RESEND_API_KEY) {
    resend = new Resend.Resend(RESEND_API_KEY);
    console.log('[Resend] Inicializado');
  }
} catch (_) { /* resend no instalado, ignorar */ }

// ─── TWILIO (WhatsApp) ────────────────────────────────────────────────────────
let twilio = null;
try {
  const TwilioClient = require('twilio');
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilio = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('[Twilio] Inicializado');
  }
} catch (_) { /* twilio no instalado, ignorar */ }

// ─── OTP Store (en-memoria para desarrollo; en producción usar Redis/Supabase) ────
const otpStore = new Map(); // { email+telefono: { code, expires_at, attempts } }

// ─── SENTRY (opcional — activa si existe SENTRY_DSN) ──────────────────────────
let Sentry = null;
if (SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
    console.log('[Sentry] Inicializado');
  } catch (_) { /* @sentry/node no instalado, ignorar */ }
}

function captureError(err, ctx = {}) {
  console.error('[Error]', ctx, err);
  if (Sentry) Sentry.captureException(err, { extra: ctx });
}

// ─── RATE LIMITER (100 req / 60s por IP) ──────────────────────────────────────
const rateBuckets = new Map();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100');
const RATE_WINDOW = 60_000; // 60 segundos

function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
}

// Limpiar buckets cada 5 min
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, b] of rateBuckets) {
    if (b.start < cutoff) rateBuckets.delete(ip);
  }
}, 5 * 60_000);

// ─── ZOD SCHEMAS ──────────────────────────────────────────────────────────────
const schemas = {
  tenant: z.object({
    nombre:       z.string().min(1).max(120),
    tipo_negocio: z.string().optional(),
    email:        z.string().email().optional(),
    telefono:     z.string().optional(),
    plan:         z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
  }),
  producto: z.object({
    tenant_id:  z.string().uuid(),
    nombre:     z.string().min(1).max(200),
    precio:     z.number().nonnegative(),
    stock:      z.number().int().nonnegative().optional(),
    categoria:  z.string().optional(),
    codigo:     z.string().optional(),
  }),
  venta: z.object({
    tenant_id:       z.string().uuid(),
    total:           z.number().nonnegative(),
    metodo_pago:     z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']).optional(),
    items:           z.array(z.any()).optional(),
    cajero_id:       z.string().optional(),
    notas:           z.string().optional(),
  }),
  ticket: z.object({
    tenant_id:   z.string().uuid(),
    asunto:      z.string().min(1).max(200),
    descripcion: z.string().optional(),
    prioridad:   z.enum(['baja', 'media', 'alta', 'critica']).optional(),
    categoria:   z.string().optional(),
  }),
  feature: z.object({
    tenant_id:  z.string().uuid(),
    feature:    z.string().min(1),
    activo:     z.boolean().optional(),
    datos_uso:  z.record(z.any()).optional(),
  }),
  licencia: z.object({
    tenant_id:   z.string().uuid(),
    plan:        z.string().min(1),
    vigencia:    z.string().optional(),
    activo:      z.boolean().optional(),
  }),
  aiActivate: z.object({
    tenant_id:     z.string().uuid(),
    tipo_negocio:  z.string().optional(),
    datos_uso:     z.record(z.any()).optional(),
  }),
  login: z.object({
    email:    z.string().email(),
    password: z.string().min(1),
  }),
  sendOtp: z.object({
    email:            z.string().email(),
    telefono:         z.string().min(10),
    nombre_negocio:   z.string().min(1).max(120),
    giro:             z.string().min(1),
  }),
  verifyOtp: z.object({
    email:            z.string().email(),
    telefono:         z.string().min(10),
    otp_code:         z.string().regex(/^\d{6}$/),
    nombre_negocio:   z.string().min(1).max(120),
    giro:             z.string().min(1),
  }),
};

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return { ok: false, errors };
  }
  return { ok: true, data: result.data };
}

// ─── MIME TYPES ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ─── JSON HELPERS ──────────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function bodyJSON(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e6) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
  });
}

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

// ─── HTTP SERVER ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const parsed = new URL(url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const ip = getIP(req);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    });
    res.end(); return;
  }

  // ── Rate limiting solo en /api/ ──
  if (pathname.startsWith('/api/') && !checkRateLimit(ip)) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': '60',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Max 100 req/min.' }));
    return;
  }

  // ── API routes ──
  if (pathname.startsWith('/api/')) {
    try {
      await handleAPI(req, res, method, pathname, parsed);
    } catch (err) {
      captureError(err, { method, pathname, ip });
      json(res, 500, { error: 'Internal server error' });
    }
    return;
  }

  // ── Static files ──
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'public', 'index.html');
  } else {
    filePath = path.join(__dirname, 'public', pathname.replace(/^\//, ''));
  }
  serveFile(res, filePath);
});

// ─── STRIPE PAYMENTS (R14) ────────────────────────────────────────────────────
let stripeApi = null;
try { stripeApi = require('./api'); } catch (_) { /* api/index.js opcional */ }

// ─── API HANDLER ───────────────────────────────────────────────────────────────
async function handleAPI(req, res, method, pathname, parsed) {
  // /api/payments/*  → delegar a api/index.js (Stripe)
  if (stripeApi && pathname.startsWith('/api/payments/')) {
    const handled = await stripeApi.handleStripe(req, res, method, pathname, parsed);
    if (handled !== false) return;
  }

  // /api/health
  if (pathname === '/api/health') {
    return json(res, 200, { ok: true, ts: Date.now(), version: '2.0.0' });
  }

  // /api/test
  if (pathname === '/api/test') {
    return json(res, 200, { test: 'endpoint works', method, pathname });
  }

  // /api/config/public — Config segura para el cliente (solo URL + anon key).
  // NUNCA expone SUPABASE_SERVICE_ROLE_KEY. Usado por public/js/realtime.js.
  if (pathname === '/api/config/public' && method === 'GET') {
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodndtemtjcW5nY2FxcGR4dHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNjcwMTgsImV4cCI6MjA3OTc0MzAxOH0.ygTc754INgqYJEMD0wc_CzRCzRxUfp4hq3rYvJRpjkk';
    // Defensa en profundidad: nunca devolver una key que sea service_role,
    // aún si alguien por error puso la service en SUPABASE_ANON_KEY.
    let safeKey = ANON_KEY;
    try {
      const parts = ANON_KEY.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.role && payload.role !== 'anon') {
          captureError(new Error(`SUPABASE_ANON_KEY tiene role=${payload.role}`), { context: 'config_public' });
          return json(res, 500, { error: 'Config pública mal configurada' });
        }
      }
    } catch (_) { /* si no se puede decodificar, devolverla igual */ }
    return json(res, 200, {
      supabase_url: SUPABASE_URL,
      supabase_anon_key: safeKey,
    });
  }

  // /api/login
  if (pathname === '/api/login' && method === 'POST') {
    try {
      const body = await bodyJSON(req);
      const v = validate(schemas.login, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });

      const { email, password } = v.data;

      // Use anon key client for auth (same as browser)
      const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodndtemtjcW5nY2FxcGR4dHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNjcwMTgsImV4cCI6MjA3OTc0MzAxOH0.ygTc754INgqYJEMD0wc_CzRCzRxUfp4hq3rYvJRpjkk';
      const authClient = createClient(SUPABASE_URL, ANON_KEY);

      // Authenticate user
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
        email, password,
      });

      if (authError || !authData.user) {
        return json(res, 401, { error: 'Credenciales inválidas' });
      }

      const supaUser = authData.user;
      const supaSession = authData.session;

      // Get volvix user data (role, tenant)
      const { data: volvixUser, error: userError } = await supabase
        .from('volvix_usuarios')
        .select('rol, tenant_id')
        .eq('user_id', supaUser.id)
        .maybeSingle();

      if (userError) {
        captureError(userError, { context: 'login_get_volvix_user' });
        return json(res, 500, { error: 'Error consultando usuario' });
      }

      // If user not in volvix_usuarios, create default owner session
      let rol = volvixUser?.rol || 'owner';
      let tenantId = volvixUser?.tenant_id;

      // Get tenant info
      let tenant = null;
      if (tenantId) {
        const { data: t, error: tenantError } = await supabase
          .from('volvix_tenants')
          .select('id, nombre, plan, owner_user_id')
          .eq('id', tenantId)
          .single();

        if (tenantError) {
          captureError(tenantError, { context: 'login_get_tenant' });
        } else {
          tenant = t;
        }
      }

      // Build session object
      const session = {
        user_id: supaUser.id,
        email: supaUser.email,
        role: rol,
        tenant_id: tenantId || null,
        tenant_name: tenant?.nombre || 'Mi Negocio',
        access_token: supaSession?.access_token || '',
        expires_at: Date.now() + (3600 * 1000), // 1 hour in milliseconds
        plan: tenant?.plan || 'free',
      };

      return json(res, 200, { ok: true, session });
    } catch (err) {
      captureError(err, { context: 'login_handler', pathname });
      return json(res, 500, { error: 'Error en login' });
    }
  }

  // /api/auth/send-otp — Enviar OTP via Email (Resend) + WhatsApp (Twilio)
  if (pathname === '/api/auth/send-otp' && method === 'POST') {
    try {
      const body = await bodyJSON(req);
      const v = validate(schemas.sendOtp, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });

      const { email, telefono, nombre_negocio, giro } = v.data;
      const otpKey = `${email}:${telefono}`;

      // Verificar que no exista este usuario ya registrado (BUG-T1 fix)
      const { data: existingUser } = await supabase
        .from('pos_users')
        .select('id')
        .or(`email.eq.${email},telefono.eq.${telefono}`)
        .single();

      if (existingUser) {
        // Si el email existe, error genérico
        if (existingUser.email === email) {
          return json(res, 400, { error: 'Este email ya está registrado' });
        }
        // Si el teléfono existe, error específico SIN exponer SQL (BUG-T1 fix)
        return json(res, 400, { error: 'Este teléfono ya está registrado, intenta otro o haz login' });
      }

      // Generar OTP aleatorio (6 dígitos)
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 minutos

      // Guardar OTP en memoria (en producción, usar Redis)
      otpStore.set(otpKey, {
        code: otp,
        expires_at: expiresAt,
        attempts: 0,
        email,
        telefono,
        nombre_negocio,
        giro,
        ip_address: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
        user_agent: req.headers['user-agent']
      });

      // Enviar email via Resend
      let emailSent = false;
      if (resend) {
        try {
          const result = await resend.emails.send({
            from: 'Volvix POS <noreply@volvix.mx>',
            to: email,
            subject: `Tu código de verificación: ${otp}`,
            html: `
              <h2>Bienvenido a Volvix POS</h2>
              <p>Tu código de verificación es:</p>
              <h1 style="font-size: 36px; letter-spacing: 4px; color: #667eea;">${otp}</h1>
              <p>Este código expira en 5 minutos.</p>
              <p style="color: #999; font-size: 12px;">Si no solicitaste este código, ignora este email.</p>
            `
          });
          emailSent = true;
          console.log(`[Email] OTP enviado a ${email}:`, result);
        } catch (emailErr) {
          captureError(emailErr, { context: 'resend_send', email });
          console.log(`[Email] Fallo enviando a ${email}:`, emailErr.message);
        }
      }

      // Enviar WhatsApp via Twilio (sandbox)
      let whatsappSent = false;
      if (twilio) {
        try {
          const result = await twilio.messages.create({
            from: TWILIO_WHATSAPP_FROM,
            to: `whatsapp:${telefono}`,
            body: `Tu código de verificación Volvix POS es: ${otp}\nExpira en 5 minutos.`
          });
          whatsappSent = true;
          console.log(`[WhatsApp] OTP enviado a ${telefono}:`, result.sid);
        } catch (whatsappErr) {
          captureError(whatsappErr, { context: 'twilio_send', telefono });
          console.log(`[WhatsApp] Fallo enviando a ${telefono}:`, whatsappErr.message);
        }
      }

      return json(res, 200, {
        ok: true,
        message: 'OTP enviado',
        email_sent: emailSent,
        whatsapp_sent: whatsappSent,
        otp_dev: process.env.NODE_ENV === 'development' ? otp : undefined // Solo en dev
      });
    } catch (err) {
      captureError(err, { context: 'send_otp', pathname });
      return json(res, 500, { error: 'Error enviando OTP' });
    }
  }

  // /api/auth/verify-otp — Verificar OTP y crear tenant + bootstrap productos
  if (pathname === '/api/auth/verify-otp' && method === 'POST') {
    try {
      const body = await bodyJSON(req);
      const v = validate(schemas.verifyOtp, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });

      const { email, telefono, otp_code, nombre_negocio, giro } = v.data;
      const otpKey = `${email}:${telefono}`;
      const storedOtp = otpStore.get(otpKey);

      // Validar OTP
      if (!storedOtp) {
        return json(res, 400, { error: 'OTP no encontrado. Intenta nuevamente' });
      }

      if (new Date() > storedOtp.expires_at) {
        otpStore.delete(otpKey);
        return json(res, 400, { error: 'OTP expirado. Solicita uno nuevo' });
      }

      if (storedOtp.code !== otp_code) {
        storedOtp.attempts++;
        if (storedOtp.attempts >= 3) {
          otpStore.delete(otpKey);
          return json(res, 400, { error: 'Demasiados intentos fallidos. Solicita uno nuevo' });
        }
        return json(res, 400, { error: 'OTP inválido. Intenta nuevamente' });
      }

      // OTP válido — crear tenant + productos
      otpStore.delete(otpKey);

      // 1. Crear tenant (sin owner_user_id por ahora)
      const { data: newTenant, error: tenantError } = await supabase
        .from('volvix_tenants')
        .insert({
          nombre: nombre_negocio,
          tipo_negocio: giro,
          email,
          telefono,
          activo: true,
          plan: 'free'
        })
        .select()
        .single();

      if (tenantError) {
        captureError(tenantError, { context: 'create_tenant', email });
        return json(res, 500, { error: 'Error creando tenant' });
      }

      const tenantId = newTenant.id;
      console.log(`[Tenant] Creado: ${tenantId} (${nombre_negocio})`);

      // 2. Bootstrap productos demo (BUG-T2 fix: filtrar por giro, BUG-T3 fix: ON CONFLICT)
      const { data: demoProducts, error: demoErr } = await supabase
        .from('pos_products_demo')
        .select('nombre, precio, costo, stock, categoria')
        .eq('giro', giro);

      if (demoErr) {
        captureError(demoErr, { context: 'fetch_demo_products', giro });
        // Continuar igualmente, no es fatal
      } else if (demoProducts && demoProducts.length > 0) {
        // Insertar productos demo para este tenant (cada producto una sola vez)
        const productsToInsert = demoProducts.map(p => ({
          tenant_id: tenantId,
          nombre: p.nombre,
          precio: p.precio,
          costo: p.costo,
          stock: p.stock,
          categoria: p.categoria || 'General',
          activo: true
        }));

        const { error: insertErr } = await supabase
          .from('volvix_productos')
          .insert(productsToInsert)
          .select();

        if (insertErr) {
          captureError(insertErr, { context: 'bootstrap_products', tenantId, giro });
          // Continuar igualmente
        } else {
          console.log(`[Bootstrap] Insertados ${productsToInsert.length} productos para tenant ${tenantId}`);
        }
      }

      // 3. Guardar registro en pos_users
      const { error: posUserErr } = await supabase
        .from('pos_users')
        .insert({
          email,
          telefono,
          nombre_negocio,
          giro,
          tenant_id: tenantId,
          otp_verified_at: new Date().toISOString(),
          ip_address: storedOtp.ip_address,
          user_agent: storedOtp.user_agent
        });

      if (posUserErr) {
        captureError(posUserErr, { context: 'create_pos_user', email });
        // No es fatal, el tenant ya existe
      }

      return json(res, 200, {
        ok: true,
        tenant_id: tenantId,
        message: 'Registro completado exitosamente'
      });
    } catch (err) {
      captureError(err, { context: 'verify_otp', pathname });
      return json(res, 500, { error: 'Error verificando OTP' });
    }
  }

  // /api/tenants
  if (pathname === '/api/tenants') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('volvix_tenants').select('*').order('created_at', { ascending: false });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.tenant, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_tenants').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  if (pathname.match(/^\/api\/tenants\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    if (method === 'GET') {
      const { data, error } = await supabase.from('volvix_tenants').select('*').eq('id', id).single();
      if (error) return json(res, 404, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'PUT') {
      const body = await bodyJSON(req);
      const v = validate(schemas.tenant.partial(), body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_tenants').update(v.data).eq('id', id).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'DELETE') {
      const { error } = await supabase.from('volvix_tenants').delete().eq('id', id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }
  }

  // /api/features
  if (pathname === '/api/features') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_features').select('*');
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.feature, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_features').upsert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, data);
    }
  }

  // /api/tickets
  if (pathname === '/api/tickets') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_tickets').select('*').order('created_at', { ascending: false });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.ticket, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_tickets').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/licencias
  if (pathname === '/api/licencias') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_licencias').select('*');
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.licencia, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_licencias').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/productos
  if (pathname === '/api/productos') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      let q = supabase.from('volvix_productos').select('*').order('nombre');
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.producto, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_productos').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  if (pathname.match(/^\/api\/productos\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    const body = await bodyJSON(req);
    const v = validate(schemas.producto.partial(), body);
    if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
    const { data, error } = await supabase.from('volvix_productos').update(v.data).eq('id', id).select().single();
    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, data);
  }

  // /api/ventas
  if (pathname === '/api/ventas') {
    if (method === 'GET') {
      const tenant_id = parsed.searchParams.get('tenant_id');
      const limit = Math.min(parseInt(parsed.searchParams.get('limit') || '100'), 500);
      let q = supabase.from('volvix_ventas').select('*').order('created_at', { ascending: false }).limit(limit);
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    if (method === 'POST') {
      const body = await bodyJSON(req);
      const v = validate(schemas.venta, body);
      if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
      const { data, error } = await supabase.from('volvix_ventas').insert(v.data).select().single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, data);
    }
  }

  // /api/ai/activate
  if (pathname === '/api/ai/activate' && method === 'POST') {
    const body = await bodyJSON(req);
    const v = validate(schemas.aiActivate, body);
    if (!v.ok) return json(res, 400, { error: 'Validación fallida', details: v.errors });
    const resultado = await aiActivateFeatures(v.data);
    return json(res, 200, resultado);
  }

  // /api/ai/suggest
  if (pathname === '/api/ai/suggest' && method === 'GET') {
    const tipo = parsed.searchParams.get('tipo') || 'retail';
    return json(res, 200, getFeaturesSuggestions(tipo));
  }

  // /api/stats
  if (pathname === '/api/stats' && method === 'GET') {
    const tenant_id = parsed.searchParams.get('tenant_id');
    return json(res, 200, await getStats(tenant_id));
  }

  // ── R14 REPORTS BI (admin/owner only) ──
  if (pathname.startsWith('/api/reports/') && method === 'GET') {
    const auth = await requireRole(req, ['admin', 'owner']);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    return handleReports(res, pathname, parsed, auth.session);
  }

  if (pathname === '/api/reports/refresh' && method === 'POST') {
    const auth = await requireRole(req, ['admin', 'owner']);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const { error } = await supabase.rpc('refresh_all_reports');
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true, refreshed_at: new Date().toISOString() });
  }

  json(res, 404, { error: 'Endpoint not found' });
}

// ─── AUTH HELPER (admin/owner only) ────────────────────────────────────────────
async function requireRole(req, allowedRoles) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Missing Bearer token' };

  if (ADMIN_API_KEY && token === ADMIN_API_KEY) {
    return { ok: true, session: { role: 'admin', tenant_id: null, sa: true } };
  }

  try {
    const ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const c = createClient(SUPABASE_URL, ANON_KEY);
    const { data: u, error } = await c.auth.getUser(token);
    if (error || !u?.user) return { ok: false, status: 401, error: 'Invalid token' };

    const { data: vu } = await supabase
      .from('volvix_usuarios')
      .select('rol, tenant_id')
      .eq('user_id', u.user.id)
      .maybeSingle();

    const role = vu?.rol || 'owner';
    if (!allowedRoles.includes(role)) {
      return { ok: false, status: 403, error: `Forbidden: requires ${allowedRoles.join('|')}` };
    }
    return { ok: true, session: { role, tenant_id: vu?.tenant_id, user_id: u.user.id } };
  } catch (e) {
    return { ok: false, status: 401, error: 'Auth failed' };
  }
}

// ─── REPORTS HANDLER ───────────────────────────────────────────────────────────
async function handleReports(res, pathname, parsed, session) {
  const sp = parsed.searchParams;
  const tenant_id = sp.get('tenant_id') || session.tenant_id;
  if (!tenant_id) return json(res, 400, { error: 'tenant_id requerido' });

  const from = sp.get('from') || new Date(Date.now() - 30 * 86400_000).toISOString();
  const to   = sp.get('to')   || new Date().toISOString();
  const top  = Math.min(parseInt(sp.get('top') || '10'), 100);

  try {
    if (pathname === '/api/reports/sales/daily') {
      const { data, error } = await supabase
        .from('mv_sales_daily').select('*')
        .eq('tenant_id', tenant_id)
        .gte('dia', from.slice(0, 10)).lte('dia', to.slice(0, 10))
        .order('dia');
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { from, to, tenant_id, rows: data });
    }

    if (pathname === '/api/reports/sales/by-product') {
      const { data, error } = await supabase
        .from('mv_top_products')
        .select('producto_id, nombre, unidades, ingreso, costo')
        .eq('tenant_id', tenant_id)
        .gte('dia', from.slice(0, 10)).lte('dia', to.slice(0, 10));
      if (error) return json(res, 500, { error: error.message });
      const agg = {};
      for (const r of data || []) {
        const k = r.producto_id || r.nombre;
        if (!agg[k]) agg[k] = { producto_id: r.producto_id, nombre: r.nombre, unidades: 0, ingreso: 0, costo: 0 };
        agg[k].unidades += Number(r.unidades || 0);
        agg[k].ingreso  += Number(r.ingreso  || 0);
        agg[k].costo    += Number(r.costo    || 0);
      }
      const rows = Object.values(agg).sort((a, b) => b.ingreso - a.ingreso).slice(0, top);
      return json(res, 200, { from, to, tenant_id, top, rows });
    }

    if (pathname === '/api/reports/sales/by-cashier') {
      const { data, error } = await supabase.rpc('report_sales_by_cashier', {
        p_tenant_id: tenant_id, p_from: from, p_to: to,
      });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { from, to, tenant_id, rows: data });
    }

    if (pathname === '/api/reports/inventory/value') {
      const { data, error } = await supabase
        .from('mv_inventory_value').select('*')
        .eq('tenant_id', tenant_id)
        .order('valor_costo', { ascending: false });
      if (error) return json(res, 500, { error: error.message });
      const total = (data || []).reduce((s, r) => s + Number(r.valor_costo || 0), 0);
      return json(res, 200, { tenant_id, total_valor_costo: total, rows: data });
    }

    if (pathname === '/api/reports/customers/cohort') {
      const { data, error } = await supabase.rpc('report_customers_cohort', {
        p_tenant_id: tenant_id,
      });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { tenant_id, rows: data });
    }

    if (pathname === '/api/reports/profit') {
      const { data, error } = await supabase.rpc('report_profit', {
        p_tenant_id: tenant_id, p_from: from, p_to: to,
      });
      if (error) return json(res, 500, { error: error.message });
      const totals = (data || []).reduce(
        (a, r) => ({
          ingreso:  a.ingreso  + Number(r.ingreso  || 0),
          costo:    a.costo    + Number(r.costo    || 0),
          utilidad: a.utilidad + Number(r.utilidad || 0),
        }), { ingreso: 0, costo: 0, utilidad: 0 }
      );
      totals.margen_pct = totals.ingreso > 0
        ? +(totals.utilidad / totals.ingreso * 100).toFixed(2) : 0;
      return json(res, 200, { from, to, tenant_id, totals, rows: data });
    }

    if (pathname === '/api/reports/abc-analysis') {
      const { data, error } = await supabase.rpc('report_abc_analysis', {
        p_tenant_id: tenant_id, p_from: from, p_to: to,
      });
      if (error) return json(res, 500, { error: error.message });
      const counts = { A: 0, B: 0, C: 0 };
      for (const r of data || []) counts[r.clase] = (counts[r.clase] || 0) + 1;
      return json(res, 200, { from, to, tenant_id, counts, rows: data });
    }

    return json(res, 404, { error: 'Report not found' });
  } catch (err) {
    captureError(err, { context: 'reports', pathname });
    return json(res, 500, { error: 'Report failed' });
  }
}

// ─── AI ENGINE ─────────────────────────────────────────────────────────────────
const FEATURE_MAP = {
  retail:    ['pos', 'inventario', 'proveedores', 'descuentos', 'codigo_barras', 'facturacion'],
  salud:     ['citas', 'expediente', 'recetas', 'historial', 'recordatorios', 'telemedicina'],
  belleza:   ['citas', 'servicios', 'fidelidad', 'galeria', 'whatsapp', 'pagos_online'],
  alimentos: ['menu', 'pedidos', 'delivery', 'mesas', 'cocina_display', 'propinas'],
  rentas:    ['contratos', 'pagos', 'mantenimiento', 'calendario', 'inquilinos', 'reportes'],
  servicios: ['ordenes', 'tecnicos', 'garantias', 'diagnostico', 'refacciones', 'cobros'],
  gym:       ['membresias', 'asistencia', 'clases', 'locker', 'pagos', 'rutinas'],
  educacion: ['alumnos', 'calificaciones', 'pagos', 'horarios', 'comunicados', 'tareas'],
};

async function aiActivateFeatures({ tenant_id, tipo_negocio, datos_uso }) {
  const tipo = (tipo_negocio || 'retail').toLowerCase();
  const features = FEATURE_MAP[tipo] || FEATURE_MAP.retail;
  const activaciones = features.map(f => ({
    tenant_id, feature: f, activo: true, activado_por: 'ai_engine', datos_uso: datos_uso || {},
  }));
  const { data, error } = await supabase.from('volvix_features').upsert(activaciones).select();
  if (error) return { error: error.message };
  await supabase.from('volvix_tenants').update({
    tipo_negocio: tipo, features_activos: features, ai_ultimo_analisis: new Date().toISOString(),
  }).eq('id', tenant_id);
  return { ok: true, features_activados: features, total: features.length };
}

function getFeaturesSuggestions(tipo) {
  const features = FEATURE_MAP[tipo.toLowerCase()] || FEATURE_MAP.retail;
  const todos = Object.values(FEATURE_MAP).flat();
  return {
    tipo,
    recomendados: features,
    opcionales: [...new Set(todos.filter(f => !features.includes(f)))].slice(0, 6),
  };
}

async function getStats(tenant_id) {
  const runQ = async (table) => {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    if (tenant_id) q = q.eq('tenant_id', tenant_id);
    const { count } = await q;
    return count || 0;
  };
  const [tenants, ventas, productos, tickets] = await Promise.all([
    tenant_id ? Promise.resolve(1) : runQ('volvix_tenants'),
    runQ('volvix_ventas'),
    runQ('volvix_productos'),
    runQ('volvix_tickets'),
  ]);
  return { tenants, ventas, productos, tickets, ts: Date.now() };
}

// ─── START ─────────────────────────────────────────────────────────────────────
function tryListen(port) {
  server.listen(port, () => {
    console.log(`✓ Volvix POS corriendo en http://localhost:${port}`);
    try { require('open')(`http://localhost:${port}`).catch(() => {}); } catch (_) {}
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Puerto ${port} ocupado, probando ${port + 1}...`);
      server.removeAllListeners('error');
      tryListen(port + 1);
    } else { captureError(err, { context: 'server_start' }); }
  });
}

tryListen(PORT);
