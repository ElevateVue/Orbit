const { initDb, getUserFromToken, getToken, json } = require('../_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  try {
    await initDb();
    const user = await getUserFromToken(getToken(req));
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    json(res, 200, {
      id: user.id, email: user.email, firstName: user.first_name,
      lastName: user.last_name, role: user.role,
      createdAt: user.created_at, lastLoginAt: user.last_login_at
    });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
