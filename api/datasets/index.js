const { pool, initDb, getUserFromToken, getToken, json, parseBody, nowIso } = require('../_db');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  try {
    await initDb();
    const user = await getUserFromToken(getToken(req));
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const dashboardId = req.query.dashboardId || new URL(req.url, 'http://x').searchParams.get('dashboardId');
    if (!dashboardId) return json(res, 400, { error: 'dashboardId is required.' });

    // Verify access to this dashboard
    let hasAccess = false;
    if (user.role === 'super_admin') {
      const { rows } = await pool.query('SELECT id FROM dashboards WHERE id=$1 AND created_by=$2', [dashboardId, user.id]);
      hasAccess = !!rows[0];
    } else {
      const { rows } = await pool.query(
        'SELECT id FROM dashboard_access WHERE dashboard_id=$1 AND user_id=$2', [dashboardId, user.id]
      );
      hasAccess = !!rows[0];
    }
    if (!hasAccess) return json(res, 403, { error: 'No access to this dashboard.' });

    // GET — list datasets
    if (req.method === 'GET') {
      const { rows } = await pool.query(
        'SELECT * FROM datasets WHERE dashboard_id=$1 ORDER BY created_at DESC', [dashboardId]
      );
      return json(res, 200, rows.map(d => ({
        id: d.id,
        dashboardId: d.dashboard_id,
        title: d.title,
        platform: d.platform,
        periodLabel: d.period_label,
        periodStart: d.period_start,
        periodEnd: d.period_end,
        metrics: JSON.parse(d.metrics_json || '{}'),
        dailyPoints: JSON.parse(d.daily_points_json || '[]'),
        aiFeedbackText: d.ai_feedback_text,
        notes: d.notes,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      })));
    }

    // POST — create dataset (super_admin and admin only)
    if (req.method === 'POST') {
      if (user.role === 'client') {
        const { rows } = await pool.query(
          'SELECT access_level FROM dashboard_access WHERE dashboard_id=$1 AND user_id=$2', [dashboardId, user.id]
        );
        if (!rows[0] || rows[0].access_level === 'client') {
          return json(res, 403, { error: 'Clients cannot create datasets.' });
        }
      }

      const body = await parseBody(req);
      if (!body.title || !body.platform || !body.periodLabel) {
        return json(res, 400, { error: 'title, platform, and periodLabel are required.' });
      }

      const id = crypto.randomBytes(16).toString('hex');
      const now = nowIso();
      await pool.query(
        `INSERT INTO datasets (id, dashboard_id, title, platform, period_label, period_start, period_end,
         metrics_json, daily_points_json, ai_feedback_text, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id, dashboardId, body.title.trim(), body.platform.trim(), body.periodLabel.trim(),
          body.periodStart || null, body.periodEnd || null,
          JSON.stringify(body.metrics || {}),
          JSON.stringify(body.dailyPoints || []),
          body.aiFeedbackText || null,
          body.notes || null,
          now, now
        ]
      );

      return json(res, 201, { id, dashboardId, createdAt: now });
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Datasets error:', err.message);
    json(res, 500, { error: err.message });
  }
};
