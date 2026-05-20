const { pool, initDb, getUserFromToken, getToken, json, parseBody } = require('../_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  try {
    await initDb();
    const user = await getUserFromToken(getToken(req));
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'super_admin') return json(res, 403, { error: 'Only super admins can manage members.' });

    const dashboardId = req.query.dashboardId || new URL(req.url, 'http://x').searchParams.get('dashboardId');
    if (!dashboardId) return json(res, 400, { error: 'dashboardId is required.' });

    // Confirm dashboard ownership
    const { rows: dashRows } = await pool.query(
      'SELECT id FROM dashboards WHERE id=$1 AND created_by=$2', [dashboardId, user.id]
    );
    if (!dashRows[0]) return json(res, 404, { error: 'Dashboard not found.' });

    // GET — list members
    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, da.access_level, da.created_at
         FROM dashboard_access da
         JOIN users u ON u.id = da.user_id
         WHERE da.dashboard_id = $1
         ORDER BY da.created_at ASC`,
        [dashboardId]
      );

      // Also get pending invites
      const { rows: invites } = await pool.query(
        `SELECT id, email, access_level, created_at FROM invites
         WHERE dashboard_id=$1 AND accepted_at IS NULL ORDER BY created_at ASC`,
        [dashboardId]
      );

      return json(res, 200, {
        members: rows.map(r => ({
          id: r.id, email: r.email,
          firstName: r.first_name, lastName: r.last_name,
          role: r.role, accessLevel: r.access_level,
          joinedAt: r.created_at
        })),
        pendingInvites: invites.map(i => ({
          id: i.id, email: i.email,
          accessLevel: i.access_level, sentAt: i.created_at
        }))
      });
    }

    // DELETE — remove member or cancel invite
    if (req.method === 'DELETE') {
      const body = await parseBody(req);
      const { userId, inviteId } = body;

      if (userId) {
        await pool.query(
          'DELETE FROM dashboard_access WHERE dashboard_id=$1 AND user_id=$2',
          [dashboardId, userId]
        );
        return json(res, 200, { ok: true });
      }

      if (inviteId) {
        await pool.query(
          'DELETE FROM invites WHERE id=$1 AND dashboard_id=$2',
          [inviteId, dashboardId]
        );
        return json(res, 200, { ok: true });
      }

      return json(res, 400, { error: 'userId or inviteId required.' });
    }

    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Members error:', err.message);
    json(res, 500, { error: err.message });
  }
};
