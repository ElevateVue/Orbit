const { pool, initDb, json, parseBody, nowIso } = require('../_db');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    await initDb();
    const body = await parseBody(req);
    const { token, firstName, lastName, password } = body;

    if (!token || !firstName || !lastName || !password) {
      return json(res, 400, { error: 'All fields are required.' });
    }

    // Find invite
    const { rows: invites } = await pool.query(
      'SELECT * FROM invites WHERE token = $1 AND accepted_at IS NULL', [token]
    );
    const invite = invites[0];
    if (!invite) return json(res, 404, { error: 'Invite not found or already used.' });

    const now = nowIso();

    // Check if user already exists
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE email = $1', [invite.email]);
    let userId;

    if (existing[0]) {
      userId = existing[0].id;
      await pool.query('UPDATE users SET first_name=$1, last_name=$2, password=$3, last_login_at=$4 WHERE id=$5',
        [firstName.trim(), lastName.trim(), password, now, userId]);
    } else {
      userId = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `INSERT INTO users (id, email, password, first_name, last_name, role, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, invite.email, password, firstName.trim(), lastName.trim(), invite.access_level === 'admin' ? 'admin' : 'client', now]
      );
    }

    // Grant dashboard access
    const accessId = crypto.randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO dashboard_access (id, dashboard_id, user_id, access_level, created_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dashboard_id, user_id) DO UPDATE SET access_level=$4`,
      [accessId, invite.dashboard_id, userId, invite.access_level, now]
    );

    // Mark invite as accepted
    await pool.query('UPDATE invites SET accepted_at=$1 WHERE id=$2', [now, invite.id]);

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, user_id, created_at) VALUES ($1,$2,$3)', [sessionToken, userId, now]);

    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
    const u = userRows[0];

    json(res, 200, {
      token: sessionToken,
      user: {
        id: u.id, email: u.email, firstName: u.first_name,
        lastName: u.last_name, role: u.role
      }
    });
  } catch (err) {
    console.error('Accept invite error:', err.message);
    json(res, 500, { error: 'Failed: ' + err.message });
  }
};
