/**
 * Volvix · Global Rate Limiting Middleware
 *
 * Sliding-window in-memory limiter (per-process). Optionally backed by Redis
 * if REDIS_URL is configured (lazy-loaded; falls back to memory if redis
 * client is unavailable so the module never throws on require).
 *
 * Usage from api/index.js (BEFORE the /api/ dispatcher):
 *
 *   const { rateLimitMiddleware } = require('./rate-limit');
 *   const apiLimiter = rateLimitMiddleware({
 *     windowMs: 60_000,
 *     max: 60,
 *     keyPrefix: 'api',
 *     skipPaths: ['/api/health', '/api/static-assets'],
 *   });
 *   // inside handler, before route dispatch:
 *   if (await apiLimiter(req, res)) return; // returned 429 already
 *
 * Headers set on every response that passes the limiter:
 *   X-RateLimit-Limit
 *   X-RateLimit-Remaining
 *   X-RateLimit-Reset      (epoch seconds)
 *
 * On 429:
 *   Retry-After            (seconds)
 *   Content-Type: application/json
 */

'use strict';

/* -------------------------------------------------------------------- *
 * IP extraction (mirrors api/index.js#clientIp).                       *
 * -------------------------------------------------------------------- */
function clientIp(req) {
  const xff = (req.headers && req.headers['x-forwarded-for']) || '';
  return String(xff).split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress)
    || 'unknown';
}

/* -------------------------------------------------------------------- *
 * Optional Redis backend. Lazy require so missing dep is never fatal.  *
 * -------------------------------------------------------------------- */
let _redisClient = null;
let _redisTried = false;
function getRedis() {
  if (_redisTried) return _redisClient;
  _redisTried = true;
  const url = (process.env.REDIS_URL || '').trim();
  if (!url) return null;
  try {
    // Try ioredis first, then node-redis. Both unsupported → return null.
    let mod;
    try { mod = require('ioredis'); } catch (_) { mod = null; }
    if (mod) {
      _redisClient = new mod(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
      _redisClient.on('error', () => {}); // swallow; fall back to memory
      return _redisClient;
    }
    try { mod = require('redis'); } catch (_) { mod = null; }
    if (mod && typeof mod.createClient === 'function') {
      _redisClient = mod.createClient({ url });
      _redisClient.on('error', () => {});
      _redisClient.connect().catch(() => {});
      return _redisClient;
    }
  } catch (_) { /* ignore */ }
  return null;
}

/* -------------------------------------------------------------------- *
 * In-memory sliding-window store.                                      *
 *   bucket: { hits: number[], resetAt: number }                        *
 * -------------------------------------------------------------------- */
const _memBuckets = new Map();
let _lastSweep = Date.now();

function memHit(key, max, windowMs) {
  const now = Date.now();
  // Periodic sweep to avoid unbounded growth
  if (now - _lastSweep > windowMs) {
    for (const [k, v] of _memBuckets) {
      if (v.resetAt <= now) _memBuckets.delete(k);
    }
    _lastSweep = now;
  }
  let b = _memBuckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { hits: [], resetAt: now + windowMs };
    _memBuckets.set(key, b);
  }
  // Drop hits older than the window
  const cutoff = now - windowMs;
  while (b.hits.length && b.hits[0] < cutoff) b.hits.shift();

  b.hits.push(now);
  const count = b.hits.length;
  const remaining = Math.max(0, max - count);
  const oldestHit = b.hits[0] || now;
  const resetMs = (oldestHit + windowMs) - now;
  return {
    count,
    remaining,
    resetMs: Math.max(0, resetMs),
    limited: count > max,
  };
}

async function redisHit(redis, key, max, windowMs) {
  // Sliding window via sorted set ZADD/ZREMRANGEBYSCORE/ZCARD/PEXPIRE.
  const now = Date.now();
  const cutoff = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (typeof redis.multi === 'function') {
      // ioredis or node-redis v4 (both support multi/exec; api differs slightly)
      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, cutoff);
      multi.zadd(key, now, member);
      multi.zcard(key);
      multi.pexpire(key, windowMs + 1000);
      const replies = await multi.exec();
      // ioredis -> [[err,res],...]; node-redis v4 -> [res,...]
      let countRaw;
      if (Array.isArray(replies) && replies.length >= 3) {
        const r = replies[2];
        countRaw = Array.isArray(r) ? r[1] : r;
      }
      const count = parseInt(countRaw, 10) || 0;
      return {
        count,
        remaining: Math.max(0, max - count),
        resetMs: windowMs,
        limited: count > max,
      };
    }
  } catch (_) { /* fall through to memory */ }
  return memHit(key, max, windowMs);
}

/* -------------------------------------------------------------------- *
 * Public factory.                                                      *
 * opts: { windowMs, max, keyPrefix, keyGenerator, skipPaths,           *
 *         scope: 'api'|'all', message }                                *
 * -------------------------------------------------------------------- */
function rateLimitMiddleware(opts) {
  const cfg = Object.assign({
    windowMs:  60 * 1000,
    max:       60,
    keyPrefix: 'rl',
    scope:     'api',                                       // 'api' = only /api/*
    skipPaths: ['/api/health', '/api/static-assets'],
    keyGenerator: null,                                     // (req) => string
    message: 'Too many requests, please try again later.',
  }, opts || {});

  const skipSet = new Set((cfg.skipPaths || []).map(s => String(s)));

  return async function rateLimitHandler(req, res) {
    const pathname = (req.url || '').split('?')[0];

    // Scope guard
    if (cfg.scope === 'api' && !pathname.startsWith('/api/')) return false;

    // Whitelist
    if (skipSet.has(pathname)) return false;
    for (const p of skipSet) {
      if (typeof p === 'string' && p.endsWith('*') && pathname.startsWith(p.slice(0, -1))) return false;
    }

    const ip = clientIp(req);
    const userKey = (req.user && (req.user.id || req.user.tenant_id)) || '';
    const key = cfg.keyGenerator
      ? String(cfg.keyGenerator(req))
      : `${cfg.keyPrefix}:${userKey || ip}`;

    const redis = getRedis();
    let result;
    try {
      result = redis
        ? await redisHit(redis, key, cfg.max, cfg.windowMs)
        : memHit(key, cfg.max, cfg.windowMs);
    } catch (_) {
      result = memHit(key, cfg.max, cfg.windowMs);
    }

    const resetEpoch = Math.ceil((Date.now() + result.resetMs) / 1000);
    try {
      res.setHeader('X-RateLimit-Limit', String(cfg.max));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(resetEpoch));
    } catch (_) { /* headers may already be sent */ }

    if (!result.limited) return false;

    const retryAfter = Math.max(1, Math.ceil(result.resetMs / 1000));
    try {
      res.statusCode = 429;
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        error: 'rate_limited',
        message: cfg.message,
        retry_after: retryAfter,
        limit: cfg.max,
        window_seconds: Math.ceil(cfg.windowMs / 1000),
      }));
    } catch (_) { /* swallow */ }
    return true; // signals "request handled, stop processing"
  };
}

/* -------------------------------------------------------------------- *
 * Convenience: per-route limiter factory.                              *
 * Usage: const limiter = perRouteLimiter({ max: 10, windowMs: 60_000 });
 *        await limiter(req, res);                                      *
 * -------------------------------------------------------------------- */
function perRouteLimiter(opts) {
  const m = rateLimitMiddleware(Object.assign({ scope: 'all', skipPaths: [] }, opts || {}));
  return m;
}

module.exports = {
  rateLimitMiddleware,
  perRouteLimiter,
  clientIp,
  _internal: { memHit, getRedis },
};
