const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let ready = false;

async function initDb() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo_data TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dashboard_access (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      access_level TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(dashboard_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      email TEXT NOT NULL,
      access_level TEXT NOT NULL,
      temp_password TEXT,
      token TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      accepted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      period_label TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      daily_points_json TEXT NOT NULL DEFAULT '[]',
      ai_feedback_text TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // ── Migrate old users table columns (drop legacy NOT NULL constraints) ──
  await pool.query('ALTER TABLE users ALTER COLUMN account_type DROP NOT NULL').catch(() => {});
  await pool.query('ALTER TABLE users ALTER COLUMN company_name DROP NOT NULL').catch(() => {});
  await pool.query('ALTER TABLE users ALTER COLUMN dashboard_access_mode DROP NOT NULL').catch(() => {});

  // ── Migrate old datasets table — add any missing columns ──
  const datasetCols = [
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS dashboard_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS period_label TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS period_start TEXT`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS period_end TEXT`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS metrics_json TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS daily_points_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS ai_feedback_text TEXT`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS notes TEXT`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE datasets ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT ''`,
  ];
  for (const sql of datasetCols) {
    await pool.query(sql).catch(() => {});
  }

  ready = true;
}

async function getUserFromToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    'SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = $1',
    [token]
  );
  return rows[0] || null;
}

function getToken(req) {
  const auth = req.headers && req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.body && req.body.token) return req.body.token;
  return null;
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function nowIso() { return new Date().toISOString(); }

module.exports = { pool, initDb, getUserFromToken, getToken, json, parseBody, nowIso };
