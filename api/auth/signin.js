const { pool, initDb, json, parseBody, nowIso } = require('../_db');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    await initDb();
    const body = await parseBody(req);
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');

    if (!email || !password) return json(res, 400, { error: 'Email and password are required.' });

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]
    );
    const user = rows[0];
    if (!user) return json(res, 401, { error: 'Invalid email or password.' });

    const now = nowIso();
    await pool.query('UPDATE users SET last_login_at=$1 WHERE id=$2', [now, user.id]);

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, user_id, created_at) VALUES ($1,$2,$3)', [token, user.id, now]);

    json(res, 200, {
      token,
      user: {
        id: user.id, email: user.email,
        firstName: user.first_name, lastName: user.last_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Signin error:', err.message);
    json(res, 500, { error: 'Signin failed: ' + err.message });
  }
};
