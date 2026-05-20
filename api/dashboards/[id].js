const { pool, initDb, getUserFromToken, getToken, json, parseBody, nowIso } = require('../_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  try {
    await initDb();
    const user = await getUserFromToken(getToken(req));
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const id = req.query.id || req.url.split('/').pop().split('?')[0];

    // Verify access
    let dashboard;
    if (user.role === 'super_admin') {
      const { rows } = await pool.query('SELECT * FROM dashboards WHERE id=$1 AND created_by=$2', [id, user.id]);
      dashboard = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT d.*, da.access_level FROM dashboards d
         JOIN dashboard_access da ON da.dashboard_id = d.id
         WHERE d.id=$1 AND da.user_id=$2`, [id, user.id]
      );
      dashboard = rows[0];
    }
    if (!dashboard) return json(res, 404, { error: 'Dashboard not found.' });

    // GET — fetch dashboard
    if (req.method === 'GET') {
      return json(res, 200, {
        id: dashboard.id,
        name: dashboard.name,
        logoData: dashboard.logo_data,
        createdAt: dashboard.created_at,
        updatedAt: dashboard.updated_at,
        accessLevel: dashboard.access_level || 'super_admin'
      });
    }

    // PUT — update dashboard (super_admin only)
    if (req.method === 'PUT') {
      if (user.role !== 'super_admin') return json(res, 403, { error: 'Only super admins can update dashboards.' });
      const body = await parseBody(req);
      const now = nowIso();
      await pool.query(
        'UPDATE dashboards SET name=$1, logo_data=$2, updated_at=$3 WHERE id=$4',
        [
          body.name ? body.name.trim() : dashboard.name,
          body.logoData !== undefined ? body.logoData : dashboard.logo_data,
          now, id
        ]
      );
      return json(res, 200, { ok: true });
    }

    // DELETE — delete dashboard (super_admin only)
    if (req.method === 'DELETE') {
      if (user.role !== 'super_admin') return json(res, 403, { error: 'Only super admins can delete dashboards.' });
      await pool.query('DELETE FROM dashboard_access WHERE dashboard_id=$1', [id]);
      await pool.query('DELETE FROM invites WHERE dashboard_id=$1', [id]);
      await pool.query('DELETE FROM datasets WHERE dashboard_id=$1', [id]);
      await pool.query('DELETE FROM dashboards WHERE id=$1', [id]);
      return json(res, 200, { ok: true });
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Dashboard [id] error:', err.message);
    json(res, 500, { error: err.message });
  }
};
