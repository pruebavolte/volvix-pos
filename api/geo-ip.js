'use strict';

/**
 * geo-ip.js — IP geolocation helpers for audit log enrichment.
 *
 * Public:
 *   getClientIp(req) -> string|null
 *   lookupIp(ip)     -> Promise<{country,region,city,timezone,isp,lat,lon}|null>
 *   enrichAuditRow(req, row) -> Promise<row>   (mutates+returns row, best-effort, never throws)
 *
 * Backend: ip-api.com free endpoint (HTTP, 45 rpm) with in-memory 24h cache.
 *
 * Designed to be non-blocking: every call is wrapped in try/catch and a 1500ms
 * timeout. If the lookup fails, audit rows are still inserted without geo data.
 */

const http = require('http');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const LOOKUP_TIMEOUT_MS = 1500;
const cache = new Map(); // ip -> { ts, data }

// ---------- IP extraction ----------

function isPrivateIp(ip) {
  if (!ip) return true;
  const v = String(ip).trim();
  if (v === '127.0.0.1' || v === '::1' || v === 'localhost') return true;
  if (v.startsWith('10.')) return true;
  if (v.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // IPv6 ULA
  if (v.startsWith('fe80')) return true; // IPv6 link-local
  return false;
}

function getClientIp(req) {
  if (!req || !req.headers) return null;
  const h = req.headers;
  const candidates = [
    h['cf-connecting-ip'],
    h['true-client-ip'],
    h['x-real-ip'],
    h['x-forwarded-for'],
    h['x-client-ip'],
    h['fastly-client-ip'],
  ];
  for (const c of candidates) {
    if (!c) continue;
    // X-Forwarded-For may be a list "client, proxy1, proxy2"
    const first = String(c).split(',')[0].trim();
    if (first) return first.replace(/^::ffff:/, '');
  }
  // Fallback: socket
  const socket = req.socket || req.connection;
  if (socket && socket.remoteAddress) {
    return String(socket.remoteAddress).replace(/^::ffff:/, '');
  }
  return null;
}

// ---------- Lookup ----------

function fetchIpApi(ip) {
  return new Promise((resolve) => {
    const path = `/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,timezone,isp,lat,lon,query`;
    const req = http.request({
      hostname: 'ip-api.com',
      port: 80,
      path,
      method: 'GET',
      timeout: LOOKUP_TIMEOUT_MS,
      headers: { 'User-Agent': 'volvix-pos-geo/1.0' },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; if (data.length > 64 * 1024) { req.destroy(); resolve(null); } });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (!j || j.status !== 'success') return resolve(null);
          resolve({
            country: j.country || null,
            country_code: j.countryCode || null,
            region: j.regionName || null,
            city: j.city || null,
            timezone: j.timezone || null,
            isp: j.isp || null,
            lat: typeof j.lat === 'number' ? j.lat : null,
            lon: typeof j.lon === 'number' ? j.lon : null,
          });
        } catch (_) { resolve(null); }
      });
    });
    req.on('timeout', () => { try { req.destroy(); } catch (_) {} resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function lookupIp(ip) {
  try {
    if (!ip || isPrivateIp(ip)) return null;
    const cached = cache.get(ip);
    const now = Date.now();
    if (cached && (now - cached.ts) < CACHE_TTL_MS) return cached.data;

    // Cap cache size at 5000 entries (LRU-ish: drop oldest 1000 when full)
    if (cache.size >= 5000) {
      const keys = Array.from(cache.keys()).slice(0, 1000);
      for (const k of keys) cache.delete(k);
    }

    const data = await fetchIpApi(ip);
    cache.set(ip, { ts: now, data });
    return data;
  } catch (_) {
    return null;
  }
}

// ---------- Audit enrichment ----------

async function enrichAuditRow(req, row) {
  if (!row || typeof row !== 'object') return row;
  try {
    const ip = getClientIp(req);
    if (!ip) return row;
    row.ip = row.ip || ip;
    const ua = req.headers && req.headers['user-agent'];
    if (ua && !row.user_agent) row.user_agent = String(ua).slice(0, 300);

    const geo = await lookupIp(ip);
    if (geo) {
      row.geo = Object.assign({}, row.geo || {}, geo);
      // Also flatten common fields for direct query/index use
      if (!row.country) row.country = geo.country_code || geo.country;
      if (!row.city) row.city = geo.city;
      if (!row.timezone) row.timezone = geo.timezone;
    }
  } catch (_) { /* never break audit */ }
  return row;
}

module.exports = {
  getClientIp,
  lookupIp,
  enrichAuditRow,
  isPrivateIp,
  _cache: cache, // for tests
};
