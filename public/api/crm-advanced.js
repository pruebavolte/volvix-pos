// api/crm-advanced.js — Rutas CRM Avanzado (B2B Pipeline)
// Montaje sugerido en api/index.js:
//   const crmAdvanced = require('./crm-advanced');
//   crmAdvanced.register(app, { db, auth });

function register(app, { db, auth }) {
  const requireAuth = auth || ((req, res, next) => next());

  // ── LEADS ─────────────────────────────────────────────
  app.get('/api/crm/leads', requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenant_id || req.query.tenant_id || 1;
      const { stage_id, status, owner_user_id } = req.query;
      const where = ['tenant_id=$1'];
      const args = [tenantId];
      if (stage_id) { args.push(stage_id); where.push(`stage_id=$${args.length}`); }
      if (status) { args.push(status); where.push(`status=$${args.length}`); }
      if (owner_user_id) { args.push(owner_user_id); where.push(`owner_user_id=$${args.length}`); }
      const r = await db.query(
        `SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT 500`, args
      );
      res.json({ ok: true, leads: r.rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/crm/leads', requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenant_id || req.body.tenant_id || 1;
      const { name, email, phone, company, source, value_estimated, stage_id, owner_user_id, notes } = req.body;
      if (!name) return res.status(400).json({ ok: false, error: 'name required' });
      const r = await db.query(
        `INSERT INTO leads(tenant_id,name,email,phone,company,source,value_estimated,stage_id,owner_user_id,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [tenantId, name, email, phone, company, source, value_estimated || 0, stage_id, owner_user_id, notes]
      );
      res.json({ ok: true, lead: r.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.patch('/api/crm/leads/:id', requireAuth, async (req, res) => {
    try {
      const fields = ['name','email','phone','company','source','value_estimated','stage_id','owner_user_id','status','notes'];
      const sets = []; const args = [];
      for (const f of fields) if (req.body[f] !== undefined) { args.push(req.body[f]); sets.push(`${f}=$${args.length}`); }
      if (!sets.length) return res.status(400).json({ ok: false, error: 'no fields' });
      args.push(req.params.id);
      const r = await db.query(`UPDATE leads SET ${sets.join(',')} WHERE id=$${args.length} RETURNING *`, args);
      res.json({ ok: true, lead: r.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.delete('/api/crm/leads/:id', requireAuth, async (req, res) => {
    try {
      await db.query('DELETE FROM leads WHERE id=$1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── MOVE STAGE + LOG ──────────────────────────────────
  app.post('/api/crm/leads/:id/move-stage', requireAuth, async (req, res) => {
    try {
      const { to_stage_id } = req.body;
      const userId = req.user?.id || null;
      const cur = await db.query('SELECT stage_id, status FROM leads WHERE id=$1', [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ ok: false, error: 'not found' });
      const fromStage = cur.rows[0].stage_id;
      const stageInfo = await db.query('SELECT name FROM pipeline_stages WHERE id=$1', [to_stage_id]);
      const sname = stageInfo.rows[0]?.name || '';
      let newStatus = 'open';
      if (sname === 'Closed Won') newStatus = 'won';
      else if (sname === 'Closed Lost') newStatus = 'lost';
      await db.query('UPDATE leads SET stage_id=$1, status=$2 WHERE id=$3', [to_stage_id, newStatus, req.params.id]);
      await db.query(
        'INSERT INTO crm_stage_log(lead_id,from_stage_id,to_stage_id,user_id) VALUES($1,$2,$3,$4)',
        [req.params.id, fromStage, to_stage_id, userId]
      );
      res.json({ ok: true, from: fromStage, to: to_stage_id, status: newStatus });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── ACTIVITIES ────────────────────────────────────────
  app.get('/api/crm/activities', requireAuth, async (req, res) => {
    try {
      const { lead_id } = req.query;
      const r = lead_id
        ? await db.query('SELECT * FROM crm_activities WHERE lead_id=$1 ORDER BY ts DESC LIMIT 200', [lead_id])
        : await db.query('SELECT * FROM crm_activities ORDER BY ts DESC LIMIT 200');
      res.json({ ok: true, activities: r.rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/crm/activities', requireAuth, async (req, res) => {
    try {
      const { lead_id, type, summary, scheduled_at, completed_at } = req.body;
      const userId = req.user?.id || null;
      if (!lead_id || !type || !summary) return res.status(400).json({ ok: false, error: 'lead_id, type, summary required' });
      const r = await db.query(
        `INSERT INTO crm_activities(lead_id,type,summary,scheduled_at,completed_at,user_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [lead_id, type, summary, scheduled_at, completed_at, userId]
      );
      res.json({ ok: true, activity: r.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── PIPELINE VIEW (kanban) ────────────────────────────
  app.get('/api/crm/pipeline-view', requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenant_id || req.query.tenant_id || 1;
      const stages = await db.query(
        'SELECT * FROM pipeline_stages WHERE tenant_id=$1 ORDER BY "order" ASC', [tenantId]
      );
      const leads = await db.query(
        `SELECT id,name,company,value_estimated,stage_id,owner_user_id,status
         FROM leads WHERE tenant_id=$1 AND status='open' ORDER BY ts DESC`, [tenantId]
      );
      const byStage = {};
      for (const s of stages.rows) byStage[s.id] = { stage: s, leads: [] };
      for (const l of leads.rows) if (byStage[l.stage_id]) byStage[l.stage_id].leads.push(l);
      res.json({ ok: true, columns: Object.values(byStage) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── FORECAST (ponderado por probability) ──────────────
  app.get('/api/crm/forecast', requireAuth, async (req, res) => {
    try {
      const tenantId = req.user?.tenant_id || req.query.tenant_id || 1;
      const r = await db.query(
        `SELECT s.id stage_id, s.name stage, s.probability,
                COUNT(l.id)::int AS leads_count,
                COALESCE(SUM(l.value_estimated),0)::numeric AS total_value,
                COALESCE(SUM(l.value_estimated * s.probability/100.0),0)::numeric AS weighted
         FROM pipeline_stages s
         LEFT JOIN leads l ON l.stage_id=s.id AND l.status='open' AND l.tenant_id=s.tenant_id
         WHERE s.tenant_id=$1
         GROUP BY s.id, s.name, s.probability, s."order"
         ORDER BY s."order" ASC`, [tenantId]
      );
      const forecast_total = r.rows.reduce((a, b) => a + Number(b.weighted || 0), 0);
      res.json({ ok: true, by_stage: r.rows, forecast_total });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

module.exports = { register };
