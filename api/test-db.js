const { Pool } = require('pg');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query('SELECT NOW() as time');
    await pool.end();
    res.end(JSON.stringify({ ok: true, time: result.rows[0].time }));
  } catch (err) {
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
};
