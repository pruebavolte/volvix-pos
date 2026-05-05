/**
 * STATUS MONITOR — Public status page backend
 *
 * Endpoints:
 *   GET   /api/status/incidents          (public) active + last 30d incidents
 *   GET   /api/status/uptime             (public) % uptime last 30d per service
 *   POST  /api/status/incidents          (admin) create incident
 *   PATCH /api/status/incidents/:id      (admin) update / resolve
 *   POST  /api/status/incidents/:id/resolve (admin) mark resolved
 *   POST  /api/status/ping/:service      (internal) record health ping
 *
 * Tables (auto-created via Supabase REST/SQL on first run if missing):
 *   system_incidents     (id uuid PK, service, severity, started_at, resolved_at,
 *                         title, message, created_by, created_at)
 *   system_health_pings  (id uuid PK, service, ok bool, latency_ms int,
 *                         error text, checked_at timestamptz)
 *
 * NOTE on signatures: this module uses the project conventions
 *   sendJSON(res, data, status=200)
 *   sendError(res, err, status=500, extras=null)
 */
'use strict';

const SERVICES = ['api', 'db', 'payments', 'ai', 'email'];

function register(deps) {
  const {
    handlers,
    supabaseRequest, readBody, requireAuth,
    sendJSON, sendError,
  } = deps;

  const isAdmin = (u) => {
    const r = String((u && u.role) || '').toLowerCase();
    return ['owner', 'superadmin', 'admin', 'manager'].includes(r);
  };

  // ───── GET /api/status/incidents ─────────────────────────────
  handlers['GET /api/status/incidents'] = async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      const days = Math.min(365, Math.max(1, parseInt(u.searchParams.get('days') || '30', 10)));
      const sinceISO = new Date(Date.now() - days * 86400000).toISOString();

      let active = [];
      let history = [];
      try {
        active = await supabaseRequest(
          'GET',
          `/system_incidents?resolved_at=is.null&select=*&order=started_at.desc`
        ) || [];
        history = await supabaseRequest(
          'GET',
          `/system_incidents?resolved_at=not.is.null&started_at=gte.${encodeURIComponent(sinceISO)}&select=*&order=started_at.desc&limit=200`
        ) || [];
      } catch (_) { /* table may not exist yet */ }

      sendJSON(res, {
        ok: true,
        active: Array.isArray(active) ? active : [],
        history: Array.isArray(history) ? history : [],
        services: SERVICES,
        window_days: days,
        generated_at: new Date().toISOString(),
      }, 200);
    } catch (e) {
      sendError(res, { code: 'incidents_failed', message: String(e && e.message || e) }, 500);
    }
  };

  // ───── GET /api/status/uptime ────────────────────────────────
  handlers['GET /api/status/uptime'] = async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      const days = Math.min(90, Math.max(1, parseInt(u.searchParams.get('days') || '30', 10)));
      const sinceISO = new Date(Date.now() - days * 86400000).toISOString();
      const nowISO = new Date().toISOString();

      const result = {};
      for (const svc of SERVICES) {
        let pings = [];
        try {
          pings = await supabaseRequest(
            'GET',
            `/system_health_pings?service=eq.${encodeURIComponent(svc)}&checked_at=gte.${encodeURIComponent(sinceISO)}&select=ok,latency_ms,checked_at&order=checked_at.desc&limit=10000`
          ) || [];
        } catch (_) { pings = []; }

        // incident-derived downtime fallback if no pings present
        let incidents = [];
        try {
          incidents = await supabaseRequest(
            'GET',
            `/system_incidents?service=eq.${encodeURIComponent(svc)}&started_at=gte.${encodeURIComponent(sinceISO)}&select=started_at,resolved_at`
          ) || [];
        } catch (_) { incidents = []; }

        const total = pings.length;
        const ok = pings.filter(p => p.ok).length;
        let uptimePct;
        if (total > 0) {
          uptimePct = +(100 * ok / total).toFixed(3);
        } else {
          // derive from incident time
          const windowMs = days * 86400000;
          let downMs = 0;
          for (const inc of incidents) {
            const s = inc.started_at ? Date.parse(inc.started_at) : null;
            const e = inc.resolved_at ? Date.parse(inc.resolved_at) : Date.now();
            if (s && e && e > s) downMs += Math.min(e - s, windowMs);
          }
          uptimePct = +(100 * Math.max(0, (windowMs - downMs) / windowMs)).toFixed(3);
        }

        const latencies = pings.filter(p => typeof p.latency_ms === 'number').map(p => p.latency_ms);
        const avgLatency = latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null;

        // current status: active incident wins; else from latest ping; else operational
        const hasActiveIncident = incidents.some(i => !i.resolved_at);
        let status = 'operational';
        if (hasActiveIncident) status = 'outage';
        else if (uptimePct !== null && uptimePct < 99.0) status = 'degraded';

        result[svc] = {
          status,
          uptime_pct: uptimePct,
          checks: total,
          ok,
          failed: total - ok,
          avg_latency_ms: avgLatency,
        };
      }

      sendJSON(res, {
        ok: true,
        days,
        services: result,
        generated_at: nowISO,
      }, 200);
    } catch (e) {
      sendError(res, { code: 'uptime_failed', message: String(e && e.message || e) }, 500);
    }
  };

  // ───── POST /api/status/incidents (admin) ────────────────────
  handlers['POST /api/status/incidents'] = requireAuth(async (req, res) => {
    try {
      if (!isAdmin(req.user)) {
        return sendError(res, { code: 'forbidden', message: 'Solo owner/superadmin/admin/manager' }, 403);
      }
      const b = await readBody(req);
      if (!b || !b.service || !b.title) {
        return sendError(res, { code: 'bad_request', message: 'service y title requeridos' }, 400);
      }
      const row = await supabaseRequest('POST', '/system_incidents', {
        service: String(b.service),
        severity: ['minor', 'major', 'critical'].includes(b.severity) ? b.severity : 'minor',
        started_at: b.started_at || new Date().toISOString(),
        resolved_at: null,
        title: String(b.title).slice(0, 200),
        message: b.message ? String(b.message).slice(0, 2000) : null,
        created_by: req.user && req.user.id || null,
      });
      sendJSON(res, { ok: true, incident: Array.isArray(row) ? row[0] : row }, 201);
    } catch (e) {
      sendError(res, { code: 'create_failed', message: String(e && e.message || e) }, 500);
    }
  });

  // ───── PATCH /api/status/incidents/:id (admin) ───────────────
  handlers['PATCH /api/status/incidents/:id'] = requireAuth(async (req, res, params) => {
    try {
      if (!isAdmin(req.user)) {
        return sendError(res, { code: 'forbidden', message: 'Solo admin' }, 403);
      }
      const b = await readBody(req);
      const patch = {};
      if (b.resolved === true || b.resolved_at) patch.resolved_at = b.resolved_at || new Date().toISOString();
      if (b.title) patch.title = String(b.title).slice(0, 200);
      if (b.message) patch.message = String(b.message).slice(0, 2000);
      if (b.severity && ['minor', 'major', 'critical'].includes(b.severity)) patch.severity = b.severity;
      if (!Object.keys(patch).length) {
        return sendError(res, { code: 'no_changes', message: 'Nada que actualizar' }, 400);
      }
      const r = await supabaseRequest(
        'PATCH',
        `/system_incidents?id=eq.${encodeURIComponent(params.id)}`,
        patch
      );
      sendJSON(res, { ok: true, incident: Array.isArray(r) ? r[0] : r }, 200);
    } catch (e) {
      sendError(res, { code: 'update_failed', message: String(e && e.message || e) }, 500);
    }
  });

  // ───── POST /api/status/incidents/:id/resolve (admin) ────────
  handlers['POST /api/status/incidents/:id/resolve'] = requireAuth(async (req, res, params) => {
    try {
      if (!isAdmin(req.user)) {
        return sendError(res, { code: 'forbidden', message: 'Solo admin' }, 403);
      }
      const r = await supabaseRequest(
        'PATCH',
        `/system_incidents?id=eq.${encodeURIComponent(params.id)}`,
        { resolved_at: new Date().toISOString() }
      );
      sendJSON(res, { ok: true, incident: Array.isArray(r) ? r[0] : r }, 200);
    } catch (e) {
      sendError(res, { code: 'resolve_failed', message: String(e && e.message || e) }, 500);
    }
  });

  // ───── POST /api/status/ping/:service (internal) ─────────────
  handlers['POST /api/status/ping/:service'] = async (req, res, params) => {
    try {
      const svc = String(params.service || '').toLowerCase();
      if (!SERVICES.includes(svc)) {
        return sendError(res, { code: 'unknown_service', message: 'Servicio desconocido', services: SERVICES }, 400);
      }
      const b = await readBody(req).catch(() => ({}));
      try {
        await supabaseRequest('POST', '/system_health_pings', {
          service: svc,
          ok: b.ok !== false,
          latency_ms: typeof b.latency_ms === 'number' ? b.latency_ms : null,
          error: b.error ? String(b.error).slice(0, 500) : null,
          checked_at: new Date().toISOString(),
        });
      } catch (_) { /* non-fatal */ }
      sendJSON(res, { ok: true, service: svc }, 200);
    } catch (e) {
      sendError(res, { code: 'ping_failed', message: String(e && e.message || e) }, 500);
    }
  };
}

/**
 * Migration SQL (run manually in Supabase if tables missing):
 *
 *   CREATE TABLE IF NOT EXISTS system_incidents (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     service text NOT NULL,
 *     severity text DEFAULT 'minor',
 *     started_at timestamptz DEFAULT now(),
 *     resolved_at timestamptz,
 *     title text NOT NULL,
 *     message text,
 *     created_by uuid,
 *     created_at timestamptz DEFAULT now()
 *   );
 *   CREATE INDEX IF NOT EXISTS system_incidents_started_at_idx ON system_incidents(started_at DESC);
 *   CREATE INDEX IF NOT EXISTS system_incidents_service_idx ON system_incidents(service);
 *
 *   CREATE TABLE IF NOT EXISTS system_health_pings (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     service text NOT NULL,
 *     ok boolean DEFAULT true,
 *     latency_ms int,
 *     error text,
 *     checked_at timestamptz DEFAULT now()
 *   );
 *   CREATE INDEX IF NOT EXISTS system_health_pings_service_at_idx
 *     ON system_health_pings(service, checked_at DESC);
 */
module.exports = { register, SERVICES };
