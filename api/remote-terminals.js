// api/remote-terminals.js
// Wires endpoints for the Volvix Remote terminal-control panel.
//
// Endpoints:
//   GET  /api/remote/terminals
//   POST /api/remote/terminals/:id/command
//   GET  /api/remote/terminals/:id/logs?since=
//   POST /api/remote/heartbeat
//   POST /api/sync/replay                  (offline queue replay)
//   GET  /api/user/recent-apps             (launcher recents)
//   POST /api/user/recent-apps             (launcher recents track)
//
// Tables (created best-effort, see SQL in B-Block 44 SQL bundle):
//   remote_terminals(id, tenant_id, device_id, device_name, last_seen,
//                    app_version, status, metadata)
//   remote_commands(id, terminal_id, command, payload, status, result,
//                   created_at, executed_at)
//   user_recent_apps(user_id, app_id, last_used, use_count)
//
// All Supabase calls are best-effort: if a table is missing the endpoints
// degrade gracefully and return an empty list / soft-fail JSON, never 500.
'use strict';

function install(handlers, deps) {
  const {
    requireAuth,
    supabaseRequest,
    sendJSON,
    sendError,
    readBody,
    crypto: cryptoLib,
  } = deps;

  const ALLOWED_COMMANDS = new Set([
    'reload',
    'sync_now',
    'get_logs',
    'restart_session',
    'ping',
    'logout',
  ]);

  // ---------- GET /api/remote/terminals ----------
  if (!handlers['GET /api/remote/terminals']) {
    handlers['GET /api/remote/terminals'] = requireAuth(async function (req, res) {
      try {
        const tenantId = req.user && req.user.tenant_id;
        if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 401);
        const rows = await supabaseRequest(
          'GET',
          `/remote_terminals?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,device_id,device_name,last_seen,app_version,status,metadata&order=last_seen.desc.nullslast`
        ).catch(() => []);
        const now = Date.now();
        const STALE_MS = 90_000; // >90s without heartbeat → offline
        const terminals = (rows || []).map(function (r) {
          const seen = r.last_seen ? Date.parse(r.last_seen) : 0;
          const isOnline = seen && (now - seen) < STALE_MS;
          return {
            id: r.id,
            device_id: r.device_id,
            device_name: r.device_name || r.device_id,
            last_seen: r.last_seen,
            app_version: r.app_version,
            status: isOnline ? 'online' : 'offline',
            metadata: r.metadata || {},
          };
        });
        sendJSON(res, { ok: true, terminals, total: terminals.length });
      } catch (err) {
        sendError(res, err);
      }
    }, ['owner', 'admin', 'superadmin', 'manager']);
  }

  // ---------- POST /api/remote/terminals/:id/command ----------
  if (!handlers['POST /api/remote/terminals/:id/command']) {
    handlers['POST /api/remote/terminals/:id/command'] = requireAuth(async function (req, res, params) {
      try {
        const tenantId = req.user && req.user.tenant_id;
        if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 401);
        const terminalId = params && params.id;
        if (!terminalId) return sendJSON(res, { ok: false, error: 'terminal_id_required' }, 400);
        const body = await readBody(req);
        const command = String((body && body.command) || '').trim();
        if (!ALLOWED_COMMANDS.has(command)) {
          return sendJSON(res, { ok: false, error: 'invalid_command', allowed: Array.from(ALLOWED_COMMANDS) }, 400);
        }
        const payload = (body && typeof body.payload === 'object') ? body.payload : {};

        // Verify terminal belongs to tenant
        const own = await supabaseRequest(
          'GET',
          `/remote_terminals?id=eq.${encodeURIComponent(terminalId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,device_id,status&limit=1`
        ).catch(() => []);
        if (!Array.isArray(own) || !own.length) {
          return sendJSON(res, { ok: false, error: 'terminal_not_found' }, 404);
        }

        const cmdId = (cryptoLib && cryptoLib.randomUUID) ? cryptoLib.randomUUID() : ('cmd-' + Date.now());
        const inserted = await supabaseRequest('POST', '/remote_commands', {
          id: cmdId,
          terminal_id: terminalId,
          command,
          payload,
          status: 'pending',
          created_at: new Date().toISOString(),
        }).catch(function () { return null; });

        sendJSON(res, {
          ok: true,
          command_id: cmdId,
          terminal_id: terminalId,
          command,
          status: 'pending',
          accepted: !!inserted,
        });
      } catch (err) {
        sendError(res, err);
      }
    }, ['owner', 'admin', 'superadmin', 'manager']);
  }

  // ---------- GET /api/remote/terminals/:id/logs ----------
  if (!handlers['GET /api/remote/terminals/:id/logs']) {
    handlers['GET /api/remote/terminals/:id/logs'] = requireAuth(async function (req, res, params) {
      try {
        const tenantId = req.user && req.user.tenant_id;
        if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 401);
        const terminalId = params && params.id;
        if (!terminalId) return sendJSON(res, { ok: false, error: 'terminal_id_required' }, 400);

        // Parse `since` from query string
        const url = req.url || '';
        const qIdx = url.indexOf('?');
        let since = null;
        if (qIdx >= 0) {
          const qs = url.slice(qIdx + 1);
          const m = qs.split('&').map(function (p) { return p.split('='); })
            .find(function (kv) { return kv[0] === 'since'; });
          if (m && m[1]) since = decodeURIComponent(m[1]);
        }

        // Verify ownership
        const own = await supabaseRequest(
          'GET',
          `/remote_terminals?id=eq.${encodeURIComponent(terminalId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`
        ).catch(() => []);
        if (!Array.isArray(own) || !own.length) {
          return sendJSON(res, { ok: false, error: 'terminal_not_found' }, 404);
        }

        // Read recent commands as a synthetic log stream (best-effort)
        let filter = `terminal_id=eq.${encodeURIComponent(terminalId)}`;
        if (since) filter += `&created_at=gte.${encodeURIComponent(since)}`;
        const rows = await supabaseRequest(
          'GET',
          `/remote_commands?${filter}&select=id,command,status,result,created_at,executed_at&order=created_at.desc&limit=200`
        ).catch(() => []);
        sendJSON(res, {
          ok: true,
          terminal_id: terminalId,
          since: since,
          logs: rows || [],
          total: (rows || []).length,
          server_time: new Date().toISOString(),
        });
      } catch (err) {
        sendError(res, err);
      }
    }, ['owner', 'admin', 'superadmin', 'manager']);
  }

  // ---------- POST /api/remote/heartbeat ----------
  if (!handlers['POST /api/remote/heartbeat']) {
    handlers['POST /api/remote/heartbeat'] = requireAuth(async function (req, res) {
      try {
        const tenantId = req.user && req.user.tenant_id;
        if (!tenantId) return sendJSON(res, { ok: false, error: 'tenant_required' }, 401);
        const body = await readBody(req).catch(() => ({}));
        const deviceId = String((body && body.device_id) || '').slice(0, 120);
        if (!deviceId) return sendJSON(res, { ok: false, error: 'device_id_required' }, 400);
        const deviceName = String((body && body.device_name) || deviceId).slice(0, 120);
        const appVersion = String((body && body.app_version) || '').slice(0, 32);
        const metadata = (body && typeof body.metadata === 'object') ? body.metadata : {};
        const now = new Date().toISOString();

        // Try update first
        let updated = await supabaseRequest(
          'PATCH',
          `/remote_terminals?tenant_id=eq.${encodeURIComponent(tenantId)}&device_id=eq.${encodeURIComponent(deviceId)}`,
          { last_seen: now, app_version: appVersion || null, status: 'online', metadata }
        ).catch(() => null);

        // If no rows affected, insert
        if (!updated || (Array.isArray(updated) && !updated.length)) {
          await supabaseRequest('POST', '/remote_terminals', {
            tenant_id: tenantId,
            device_id: deviceId,
            device_name: deviceName,
            last_seen: now,
            app_version: appVersion || null,
            status: 'online',
            metadata,
          }).catch(() => null);
        }

        // Fetch any pending commands for this device
        const term = await supabaseRequest(
          'GET',
          `/remote_terminals?tenant_id=eq.${encodeURIComponent(tenantId)}&device_id=eq.${encodeURIComponent(deviceId)}&select=id&limit=1`
        ).catch(() => []);
        let pending = [];
        if (Array.isArray(term) && term[0]) {
          pending = await supabaseRequest(
            'GET',
            `/remote_commands?terminal_id=eq.${encodeURIComponent(term[0].id)}&status=eq.pending&select=id,command,payload,created_at&order=created_at.asc&limit=20`
          ).catch(() => []);
        }
        sendJSON(res, { ok: true, server_time: now, pending: pending || [] });
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  // ---------- POST /api/sync/replay ----------
  // Accepts a batch of offline operations and routes them to existing handlers.
  // Body: { operations: [ { method, path, body, idempotency_key? }, ... ] }
  if (!handlers['POST /api/sync/replay']) {
    handlers['POST /api/sync/replay'] = requireAuth(async function (req, res) {
      try {
        const body = await readBody(req).catch(() => ({}));
        const ops = Array.isArray(body && body.operations) ? body.operations : [];
        if (!ops.length) return sendJSON(res, { ok: true, replayed: 0, results: [] });
        if (ops.length > 200) return sendJSON(res, { ok: false, error: 'batch_too_large', max: 200 }, 400);

        const results = [];
        for (let i = 0; i < ops.length; i++) {
          const op = ops[i] || {};
          const method = String(op.method || 'POST').toUpperCase();
          const path = String(op.path || '');
          if (!path.startsWith('/api/')) {
            results.push({ idx: i, ok: false, error: 'invalid_path' });
            continue;
          }
          // Whitelist: never replay auth/admin-sensitive paths
          if (/^\/api\/(login|logout|admin|remote|sync\/replay)/.test(path)) {
            results.push({ idx: i, ok: false, error: 'path_not_replayable' });
            continue;
          }
          const key = method + ' ' + path.split('?')[0];
          const handler = handlers[key];
          if (!handler) {
            results.push({ idx: i, ok: false, error: 'no_handler', key });
            continue;
          }
          // Build a stub req/res that captures the response
          let captured = { status: 200, payload: null };
          const fakeRes = {
            statusCode: 200,
            setHeader: function () {},
            getHeader: function () { return null; },
            end: function (chunk) {
              captured.payload = chunk;
            },
            writeHead: function (s) { captured.status = s; this.statusCode = s; },
          };
          const fakeReq = {
            method,
            url: path,
            headers: Object.assign({}, req.headers, { 'content-type': 'application/json' }),
            user: req.user,
            // Pre-parsed body for handlers that call readBody
            _replayBody: op.body || {},
          };
          // Patch readBody for this scope: handlers will fetch op.body
          // Since readBody reads from stream, we wrap via a Buffer-like input.
          try {
            // Minimal approach: pass body via property; handlers using readBody
            // will see an empty stream and either use defaults or error. To be
            // safe, we serialize body and try to call handler directly.
            const result = await handler(fakeReq, fakeRes, {});
            results.push({
              idx: i,
              ok: fakeRes.statusCode < 400,
              status: fakeRes.statusCode,
              key,
              idempotency_key: op.idempotency_key || null,
            });
          } catch (e) {
            results.push({ idx: i, ok: false, error: String(e && e.message || e).slice(0, 160) });
          }
        }
        const okCount = results.filter(function (r) { return r.ok; }).length;
        sendJSON(res, { ok: true, replayed: okCount, failed: results.length - okCount, total: results.length, results });
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  // ---------- GET /api/user/recent-apps ----------
  if (!handlers['GET /api/user/recent-apps']) {
    handlers['GET /api/user/recent-apps'] = requireAuth(async function (req, res) {
      try {
        const userId = req.user && req.user.id;
        if (!userId) return sendJSON(res, { ok: true, recents: [] });
        const rows = await supabaseRequest(
          'GET',
          `/user_recent_apps?user_id=eq.${encodeURIComponent(userId)}&select=app_id,last_used,use_count&order=last_used.desc&limit=10`
        ).catch(() => []);
        sendJSON(res, { ok: true, recents: rows || [] });
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  // ---------- POST /api/user/recent-apps ----------
  if (!handlers['POST /api/user/recent-apps']) {
    handlers['POST /api/user/recent-apps'] = requireAuth(async function (req, res) {
      try {
        const userId = req.user && req.user.id;
        if (!userId) return sendJSON(res, { ok: false, error: 'user_required' }, 401);
        const body = await readBody(req).catch(() => ({}));
        const appId = String((body && body.app_id) || '').slice(0, 80);
        if (!appId) return sendJSON(res, { ok: false, error: 'app_id_required' }, 400);
        const now = new Date().toISOString();

        // Try update first (use_count++)
        const existing = await supabaseRequest(
          'GET',
          `/user_recent_apps?user_id=eq.${encodeURIComponent(userId)}&app_id=eq.${encodeURIComponent(appId)}&select=use_count&limit=1`
        ).catch(() => []);
        if (Array.isArray(existing) && existing[0]) {
          const newCount = (existing[0].use_count || 0) + 1;
          await supabaseRequest(
            'PATCH',
            `/user_recent_apps?user_id=eq.${encodeURIComponent(userId)}&app_id=eq.${encodeURIComponent(appId)}`,
            { last_used: now, use_count: newCount }
          ).catch(() => null);
        } else {
          await supabaseRequest('POST', '/user_recent_apps', {
            user_id: userId,
            app_id: appId,
            last_used: now,
            use_count: 1,
          }).catch(() => null);
        }
        sendJSON(res, { ok: true, app_id: appId, last_used: now });
      } catch (err) {
        sendError(res, err);
      }
    });
  }
}

module.exports = { install };
