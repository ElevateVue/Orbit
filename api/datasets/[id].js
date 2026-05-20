const { pool, initDb, getUserFromToken, getToken, json, parseBody, nowIso } = require('../_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  try {
    await initDb();
    const user = await getUserFromToken(getToken(req));
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const id = req.query.id || req.url.split('/').pop().split('?')[0];

    // Fetch dataset
    const { rows: dsRows } = await pool.query('SELECT * FROM datasets WHERE id=$1', [id]);
    const dataset = dsRows[0];
    if (!dataset) return json(res, 404, { error: 'Dataset not found.' });

    // Verify dashboard access
    let hasAccess = false;
    let accessLevel = null;
    if (user.role === 'super_admin') {
      const { rows } = await pool.query(
        'SELECT id FROM dashboards WHERE id=$1 AND created_by=$2', [dataset.dashboard_id, user.id]
      );
      hasAccess = !!rows[0];
      accessLevel = 'super_admin';
    } else {
      const { rows } = await pool.query(
        'SELECT access_level FROM dashboard_access WHERE dashboard_id=$1 AND user_id=$2',
        [dataset.dashboard_id, user.id]
      );
      hasAccess = !!rows[0];
      accessLevel = rows[0]?.access_level;
    }
    if (!hasAccess) return json(res, 403, { error: 'No access to this dataset.' });

    // GET
    if (req.method === 'GET') {
      return json(res, 200, {
        id: dataset.id,
        dashboardId: dataset.dashboard_id,
        title: dataset.title,
        platform: dataset.platform,
        periodLabel: dataset.period_label,
        periodStart: dataset.period_start,
        periodEnd: dataset.period_end,
        metrics: JSON.parse(dataset.metrics_json || '{}'),
        dailyPoints: JSON.parse(dataset.daily_points_json || '[]'),
        aiFeedbackText: dataset.ai_feedback_text,
        notes: dataset.notes,
        createdAt: dataset.created_at,
        updatedAt: dataset.updated_at
      });
    }

    // PUT — update (admin and super_admin only)
    if (req.method === 'PUT') {
      if (accessLevel === 'client') return json(res, 403, { error: 'Clients cannot edit datasets.' });

      const body = await parseBody(req);
      const now = nowIso();

      await pool.query(
        `UPDATE datasets SET
          title = COALESCE($1, title),
          platform = COALESCE($2, platform),
          period_label = COALESCE($3, period_label),
          period_start = COALESCE($4, period_start),
          period_end = COALESCE($5, period_end),
          metrics_json = COALESCE($6, metrics_json),
          daily_points_json = COALESCE($7, daily_points_json),
          ai_feedback_text = COALESCE($8, ai_feedback_text),
          notes = COALESCE($9, notes),
          updated_at = $10
        WHERE id = $11`,
        [
          body.title ? body.title.trim() : null,
          body.platform ? body.platform.trim() : null,
          body.periodLabel ? body.periodLabel.trim() : null,
          body.periodStart || null,
          body.periodEnd || null,
          body.metrics !== undefined ? JSON.stringify(body.metrics) : null,
          body.dailyPoints !== undefined ? JSON.stringify(body.dailyPoints) : null,
          body.aiFeedbackText !== undefined ? body.aiFeedbackText : null,
          body.notes !== undefined ? body.notes : null,
          now, id
        ]
      );
      return json(res, 200, { ok: true });
    }

    // DELETE (admin and super_admin only)
    if (req.method === 'DELETE') {
      if (accessLevel === 'client') return json(res, 403, { error: 'Clients cannot delete datasets.' });
      await pool.query('DELETE FROM datasets WHERE id=$1', [id]);
      return json(res, 200, { ok: true });
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Dataset [id] error:', err.message);
    json(res, 500, { error: err.message });
  }
};
