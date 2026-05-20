const { pool, initDb, parseBody, json } = require('../_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  try {
    await initDb();
    const body = await parseBody(req);
    if (body.token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [body.token]);
    }
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
