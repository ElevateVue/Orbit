const { pool, initDb, getUserFromToken, getToken, json, parseBody, nowIso } = require('../_db');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  try {
    await initDb();
    const user = await getUserFromToken(getToken(req));
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    // GET — list dashboards
    if (req.method === 'GET') {
      let rows;
      if (user.role === 'super_admin') {
        const result = await pool.query('SELECT * FROM dashboards WHERE created_by=$1 ORDER BY created_at DESC', [user.id]);
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT d.*, da.access_level FROM dashboards d
           JOIN dashboard_access da ON da.dashboard_id = d.id
           WHERE da.user_id = $1 ORDER BY d.created_at DESC`, [user.id]
        );
        rows = result.rows;
      }
      return json(res, 200, rows.map(d => ({
        id: d.id, name: d.name, logoData: d.logo_data,
        createdAt: d.created_at, updatedAt: d.updated_at,
        accessLevel: d.access_level || 'super_admin'
      })));
    }

    // POST — create dashboard (super_admin only)
    if (req.method === 'POST') {
      if (user.role !== 'super_admin') return json(res, 403, { error: 'Only super admins can create dashboards.' });
      const body = await parseBody(req);
      if (!body.name) return json(res, 400, { error: 'Dashboard name is required.' });
      const id = crypto.randomBytes(16).toString('hex');
      const now = nowIso();
      await pool.query(
        'INSERT INTO dashboards (id, name, logo_data, created_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, body.name.trim(), body.logoData || null, user.id, now, now]
      );
      return json(res, 201, { id, name: body.name.trim(), logoData: body.logoData || null, createdAt: now });
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Dashboards error:', err.message);
    json(res, 500, { error: err.message });
  }
};
