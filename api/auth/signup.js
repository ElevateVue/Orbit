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
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();

    if (!email || !password || !firstName || !lastName) {
      return json(res, 400, { error: 'All fields are required.' });
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing[0]) return json(res, 409, { error: 'An account with this email already exists.' });

    const id = crypto.randomBytes(16).toString('hex');
    const now = nowIso();
    await pool.query(
      'INSERT INTO users (id, email, password, first_name, last_name, role, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, email, password, firstName, lastName, 'client', now]
    );

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, user_id, created_at) VALUES ($1,$2,$3)', [token, id, now]);

    json(res, 201, {
      token,
      user: { id, email, firstName, lastName, role: 'client' }
    });
  } catch (err) {
    console.error('Signup error:', err.message);
    json(res, 500, { error: 'Signup failed: ' + err.message });
  }
};
