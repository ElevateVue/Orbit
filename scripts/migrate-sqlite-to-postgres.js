const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { initializeDatabase, pool } = require('../server');

const ROOT = path.join(__dirname, '..');
const SQLITE_FILE = process.env.SQLITE_FILE || path.join(ROOT, 'data', 'orbit.db');

const TABLES = [
  {
    name: 'users',
    key: 'email',
    columns: [
      'id',
      'first_name',
      'last_name',
      'email',
      'password',
      'role',
      'account_type',
      'company_name',
      'dashboard_access_mode',
      'invited_by_admin',
      'created_at',
      'last_login_at',
    ],
  },
  {
    name: 'sessions',
    key: 'token',
    columns: ['token', 'user_id', 'created_at'],
  },
  {
    name: 'datasets',
    key: 'id',
    columns: [
      'id',
      'user_id',
      'title',
      'platform',
      'period_label',
      'period_start',
      'period_end',
      'csv_name',
      'metrics_json',
      'daily_points_json',
      'ai_feedback_text',
      'ai_feedback_edited_text',
      'notes',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'reports',
    key: 'id',
    columns: [
      'id',
      'user_id',
      'dataset_id',
      'title',
      'platform',
      'period_label',
      'period_start',
      'period_end',
      'logo_data_url',
      'metrics_json',
      'daily_points_json',
      'key_takeaways_json',
      'action_plan_json',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'suggestions',
    key: 'id',
    columns: [
      'id',
      'user_id',
      'dataset_id',
      'type',
      'content',
      'created_by_ai',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'activity',
    key: 'id',
    columns: ['id', 'user_id', 'user_email', 'type', 'message', 'metadata_json', 'created_at'],
  },
];

function normalizeRow(row, table) {
  if (table.name === 'users') {
    return {
      dashboard_access_mode: 'viewing',
      invited_by_admin: 0,
      ...row,
    };
  }
  return row;
}

function upsertSql(table) {
  const columnNames = table.columns.join(', ');
  const values = table.columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = table.columns
    .filter((column) => column !== table.key)
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');
  return `
    INSERT INTO ${table.name} (${columnNames})
    VALUES (${values})
    ON CONFLICT (${table.key}) DO UPDATE SET ${updates}
  `;
}

async function migrateTable(sqlite, table) {
  const rows = sqlite.prepare(`SELECT * FROM ${table.name}`).all();
  const sql = upsertSql(table);

  for (const sourceRow of rows) {
    const row = normalizeRow(sourceRow, table);
    const values = table.columns.map((column) => row[column] ?? null);
    await pool.query(sql, values);
  }

  return rows.length;
}

async function main() {
  if (!fs.existsSync(SQLITE_FILE)) {
    throw new Error(`SQLite database not found: ${SQLITE_FILE}`);
  }

  await initializeDatabase();

  const sqlite = new DatabaseSync(SQLITE_FILE, { readOnly: true });
  try {
    for (const table of TABLES) {
      const count = await migrateTable(sqlite, table);
      console.log(`Migrated ${count} ${table.name} row${count === 1 ? '' : 's'}.`);
    }
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.message || error);
  await pool.end().catch(() => {});
  process.exit(1);
});
