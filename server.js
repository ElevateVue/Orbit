const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ENV_FILE = path.join(ROOT, 'api.env');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

if (fs.existsSync(ENV_FILE)) {
  loadEnvFile(ENV_FILE);
}

// Load environment variables from api.env
if (fs.existsSync('./api.env')) {
  require('dotenv').config({ path: './api.env' });
} else {
  require('dotenv').config(); // Fallback for production cloud injection
}


// Setup connection string (Hardcoded as a fallback if your api.env doesn't have it)
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_slh67YoSAzjt@ep-plain-heart-ao0ct5gr-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
// Initialize the database connection pool
const pool = new Pool({
  connectionString: connectionString
});

// Test the connection instantly on startup without hanging cloud builds
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err.stack);
  } else {
    console.log('✅ Connected to PostgreSQL successfully!');
    try {
      await initializeDatabase();
      console.log('✅ All PostgreSQL tables verified and active!');
    } catch (tableError) {
      console.error('❌ Error creating database tables:', tableError.message);
    }
  }

  // CRITICAL VERCEL FIX: If running inside a Vercel build environment, close the pool immediately so the build can exit!
  if (process.env.VERCEL_ENV && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log('📦 Vercel build step detected. Closing database pool to allow exit...');
    await pool.end();
  }
});



const db = {
  prepare(sql) {
    const text = toPostgresSql(sql);
    return {
      async get(...params) {
        const result = await pool.query(text, params);
        return result.rows[0];
      },
      async all(...params) {
        const result = await pool.query(text, params);
        return result.rows;
      },
      async run(...params) {
        return pool.query(text, params);
      },
    };
  },
  async exec(sql) {
    return pool.query(sql);
  },
};

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function initializeDatabase() {
  await db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    account_type TEXT NOT NULL,
    company_name TEXT,
    dashboard_access_mode TEXT NOT NULL DEFAULT 'viewing',
    invited_by_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    period_label TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    csv_name TEXT,
    metrics_json TEXT NOT NULL,
    daily_points_json TEXT NOT NULL,
    ai_feedback_text TEXT,
    ai_feedback_edited_text TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    period_label TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    logo_data_url TEXT,
    metrics_json TEXT NOT NULL,
    daily_points_json TEXT NOT NULL,
    key_takeaways_json TEXT NOT NULL,
    action_plan_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dataset_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by_ai INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  );
`);

  await ensureUserColumns();
  await seedAdmin();
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function seedAdmin() {
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get('ashwin@admin.com');
  const now = new Date().toISOString();

  if (!existing) {
    await db.prepare(`
      INSERT INTO users (id, first_name, last_name, email, password, role, account_type, company_name, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'admin-ashwin',
      'Ashwin',
      'Admin',
      'ashwin@admin.com',
      'Ashwin1222',
      'admin',
      'company',
      'Orbit',
      now,
      now,
    );
  } else {
    await db.prepare(`
      UPDATE users
      SET first_name = ?, last_name = ?, password = ?, role = ?, account_type = ?, company_name = ?
      WHERE email = ?
    `).run('Ashwin', 'Admin', 'Ashwin1222', 'admin', 'company', 'Orbit', 'ashwin@admin.com');
  }
}

async function ensureUserColumns() {
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_access_mode TEXT NOT NULL DEFAULT 'viewing'`);
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by_admin INTEGER NOT NULL DEFAULT 0`);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function json(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function publicUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    accountType: row.account_type,
    companyName: row.company_name || '',
    dashboardAccessMode: row.dashboard_access_mode || 'viewing',
    invitedByAdmin: Boolean(row.invited_by_admin),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

async function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  await db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, nowIso());
  return token;
}

async function getSessionUser(token) {
  if (!token) return null;
  return await db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token) || null;
}

async function trackActivity(user, type, message, metadata) {
  await db.prepare(`
    INSERT INTO activity (id, user_id, user_email, type, message, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `activity-${crypto.randomUUID()}`,
    user.id,
    user.email,
    type,
    message,
    metadata ? JSON.stringify(metadata) : null,
    nowIso(),
  );
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 20_000_000) {
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function requireUser(token, role) {
  const user = await getSessionUser(token);
  if (!user) {
    const error = new Error('Unauthorized.');
    error.statusCode = 401;
    throw error;
  }
  if (role && user.role !== role) {
    const error = new Error('Forbidden.');
    error.statusCode = 403;
    throw error;
  }
  return user;
}

function datasetRowToPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    platform: row.platform,
    periodLabel: row.period_label,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    csvName: row.csv_name,
    metrics: json(row.metrics_json, {}),
    dailyPoints: json(row.daily_points_json, []),
    aiFeedbackText: row.ai_feedback_text || '',
    aiFeedbackEditedText: row.ai_feedback_edited_text || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reportRowToPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    datasetId: row.dataset_id,
    title: row.title,
    platform: row.platform,
    periodLabel: row.period_label,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    logoDataUrl: row.logo_data_url || '',
    metrics: json(row.metrics_json, {}),
    dailyPoints: json(row.daily_points_json, []),
    keyTakeaways: json(row.key_takeaways_json, []),
    actionPlan: json(row.action_plan_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function suggestionRowToPayload(row) {
  return {
    id: row.id,
    userId: row.user_id,
    datasetId: row.dataset_id,
    type: row.type,
    content: row.content,
    createdByAI: Boolean(row.created_by_ai),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function latestDatasetForUser(userId) {
  const row = await db.prepare('SELECT * FROM datasets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(userId);
  return datasetRowToPayload(row);
}

async function latestDatasetRowForUser(userId) {
  return await db.prepare('SELECT * FROM datasets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(userId) || null;
}

async function reportsForUser(userId) {
  return (await db.prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY updated_at DESC').all(userId)).map(reportRowToPayload);
}

async function suggestionsForDataset(userId, datasetId) {
  const rows = await db.prepare(`
    SELECT * FROM suggestions
    WHERE user_id = ? AND (dataset_id = ? OR dataset_id IS NULL)
    ORDER BY updated_at DESC
  `).all(userId, datasetId || null);
  return rows.map(suggestionRowToPayload);
}

async function adminClientOverview(clientId) {
  const client = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(clientId, 'client');
  if (!client) return null;

  const datasets = (await db.prepare('SELECT * FROM datasets WHERE user_id = ? ORDER BY updated_at DESC').all(clientId)).map(datasetRowToPayload);
  const reports = await reportsForUser(clientId);
  const suggestions = await suggestionsForDataset(clientId, datasets[0]?.id || null);

  return {
    client: publicUser(client),
    datasets,
    reports,
    suggestions,
  };
}

async function upsertSuggestionForUser(userId, datasetId, type, content) {
  const normalizedType = String(type || 'Suggestion').trim() || 'Suggestion';
  const normalizedContent = String(content || '').trim();
  const timestamp = nowIso();
  const existing = await db.prepare(`
    SELECT * FROM suggestions
    WHERE user_id = ? AND type = ? AND (dataset_id = ? OR (dataset_id IS NULL AND ? IS NULL))
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(userId, normalizedType, datasetId || null, datasetId || null);

  if (existing) {
    await db.prepare(`
      UPDATE suggestions
      SET content = ?, dataset_id = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizedContent, datasetId || null, timestamp, existing.id);
    return suggestionRowToPayload(await db.prepare('SELECT * FROM suggestions WHERE id = ?').get(existing.id));
  }

  const id = `suggestion-${crypto.randomUUID()}`;
  await db.prepare(`
    INSERT INTO suggestions (id, user_id, dataset_id, type, content, created_by_ai, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, datasetId || null, normalizedType, normalizedContent, 0, timestamp, timestamp);
  return suggestionRowToPayload(await db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id));
}

async function upsertDatasetForUser(userId, datasetId, body) {
  const timestamp = nowIso();
  const platform = String(body.platform || 'Instagram').trim() || 'Instagram';
  const existingByPlatform = datasetId
    ? null
    : await db.prepare('SELECT id FROM datasets WHERE user_id = ? AND lower(platform) = lower(?) ORDER BY updated_at DESC LIMIT 1').get(userId, platform);
  const resolvedDatasetId = datasetId || existingByPlatform?.id || `dataset-${crypto.randomUUID()}`;
  const record = {
    title: String(body.title || 'Dashboard Overview').trim() || 'Dashboard Overview',
    platform,
    periodLabel: String(body.periodLabel || 'Uploaded dataset').trim() || 'Uploaded dataset',
    periodStart: body.periodStart || null,
    periodEnd: body.periodEnd || null,
    csvName: body.csvName || '',
    metricsJson: JSON.stringify(body.metrics || {}),
    dailyPointsJson: JSON.stringify(body.dailyPoints || []),
    notes: String(body.notes || '').trim(),
  };

  const existing = await db.prepare('SELECT id FROM datasets WHERE id = ? AND user_id = ?').get(resolvedDatasetId, userId);
  if (existing) {
    await db.prepare(`
      UPDATE datasets
      SET title = ?, platform = ?, period_label = ?, period_start = ?, period_end = ?, csv_name = ?,
          metrics_json = ?, daily_points_json = ?, notes = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      record.title,
      record.platform,
      record.periodLabel,
      record.periodStart,
      record.periodEnd,
      record.csvName,
      record.metricsJson,
      record.dailyPointsJson,
      record.notes,
      timestamp,
      resolvedDatasetId,
      userId,
    );
  } else {
    await db.prepare(`
      INSERT INTO datasets (
        id, user_id, title, platform, period_label, period_start, period_end, csv_name,
        metrics_json, daily_points_json, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resolvedDatasetId,
      userId,
      record.title,
      record.platform,
      record.periodLabel,
      record.periodStart,
      record.periodEnd,
      record.csvName,
      record.metricsJson,
      record.dailyPointsJson,
      record.notes,
      timestamp,
      timestamp,
    );
  }

  return datasetRowToPayload(await db.prepare('SELECT * FROM datasets WHERE id = ?').get(resolvedDatasetId));
}

async function callDeepSeek(systemPrompt, userPrompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  if (!apiKey) {
    throw new Error('Missing DEEPSEEK_API_KEY in api.env.');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || 'DeepSeek request failed.');
  }

  return data.choices?.[0]?.message?.content?.trim() || '';
}

function metricDefinitions(platform) {
  const definitions = {
    Instagram: [
      ['Reach', 'reach'],
      ['Interactions', 'interactions'],
      ['Clicks', 'clicks'],
      ['Reactions', 'reactions'],
      ['Views', 'views'],
      ['Follows', 'follows'],
    ],
    Facebook: [
      ['Follows', 'follows'],
      ['Visits', 'visits'],
      ['Clicks', 'clicks'],
      ['Interactions', 'interactions'],
      ['Views', 'views'],
      ['Viewers', 'viewers'],
    ],
    LinkedIn: [
      ['Impressions', 'impressions'],
      ['Unique', 'unique'],
      ['Clicks', 'clicks'],
      ['Reactions', 'reactions'],
      ['Comments', 'comments'],
      ['Reports', 'reports'],
      ['Engagement', 'engagement'],
    ],
  };
  return definitions[platform] || definitions.Instagram;
}

function metricsNarrative(metrics, platform = 'Instagram') {
  const formula = platform === 'Facebook'
    ? 'Avg engagement: clicks + interactions'
    : platform === 'LinkedIn'
      ? 'Avg engagement: clicks + reactions + comments + reports'
      : 'Avg engagement rate: reach / interactions x 100';
  return [
    ...metricDefinitions(platform).map(([label, key]) => `${label}: ${Number(metrics[key] || 0).toLocaleString()}`),
    `${formula}: ${Number(metrics.engagementRate || 0).toLocaleString()}`,
  ].join('\n');
}

function fallbackFeedback(dataset) {
  const metrics = dataset.metrics || {};
  const clicks = Number(metrics.clicks || 0);
  const engagementRate = Number(metrics.engagementRate || 0);
  const metricLines = metricDefinitions(dataset.platform).map(([label, key]) => `${label.toLowerCase()} at ${Number(metrics[key] || 0).toLocaleString()}`);
  const primary = metricLines.slice(0, 2).join(' and ');
  const secondary = metricLines.slice(2, 5).join(', ');

  return [
    `- The uploaded ${dataset.platform} dataset shows ${primary || 'the core metrics'} across the selected period.`,
    `- ${secondary || 'The supporting metrics'} should be reviewed alongside clicks, which reached ${clicks.toLocaleString()}.`,
    `- Average engagement is ${engagementRate.toLocaleString()}, giving a clear baseline for the next ${dataset.platform} reporting cycle.`,
    engagementRate >= 3
      ? `- ${dataset.platform} engagement is holding at a healthy level, so repeat the strongest topics, formats, and calls to action.`
      : `- ${dataset.platform} engagement is still light, so the next content cycle should push stronger hooks and clearer calls to action.`,
    clicks > 0
      ? '- The next review should focus on the days that produced the strongest click spikes and mirror their topic, format, and CTA style.'
      : '- The next review should focus on turning audience exposure into stronger click intent with more direct value-led messaging.',
  ].join('\n');
}

function fallbackSuggestion(type, dataset) {
  const metrics = dataset.metrics || {};
  if (type === 'Challenges') {
    const firstMetric = metricDefinitions(dataset.platform)[0];
    return `One current challenge is converting ${Number(metrics[firstMetric[1]] || 0).toLocaleString()} ${firstMetric[0].toLowerCase()} into stronger downstream action.`;
  }
  if (type === 'Ideal Solutions') {
    return 'Test stronger content hooks, clearer CTA language, and repeat the posting formats that generated the strongest spikes in the uploaded data.';
  }
  if (type === 'AI Suggestions') {
    return 'Shift creative review toward the highest-performing dates in the chart and build the next calendar around those topics, timings, and CTA patterns.';
  }
  return 'The strongest next suggestion is to replicate the content pattern from the best-performing days and tighten the audience journey from reach to click and follow.';
}

function fallbackReportLists(dataset) {
  const metrics = dataset.metrics || {};
  const engagementRate = Number(metrics.engagementRate || 0);
  const definitions = metricDefinitions(dataset.platform);
  const first = definitions[0];
  const second = definitions[1] || definitions[0];
  const clickText = Number(metrics.clicks || 0).toLocaleString();

  return {
    keyTakeaways: [
      `${first[0]} totaled ${Number(metrics[first[1]] || 0).toLocaleString()} while ${second[0].toLowerCase()} landed at ${Number(metrics[second[1]] || 0).toLocaleString()}.`,
      `Clicks reached ${clickText}, which highlights the current conversion path for ${dataset.platform}.`,
      `Average engagement rate came in at ${engagementRate.toFixed(2)}%, giving a clear baseline for the next reporting period.`,
      'Review which daily spikes came from stronger creative hooks and repeat those themes in the next cycle.',
    ],
    actionPlan: [
      'Repeat the content themes and posting windows behind the highest daily spikes in the chart.',
      `Strengthen captions and calls to action on posts with strong ${first[0].toLowerCase()} but weaker action.`,
      'Review landing-page alignment for posts that drove clicks so future content converts more consistently.',
      'Turn the strongest-performing posts into a repeatable format for the next reporting period.',
    ],
  };
}

async function generateAiFeedback(dataset) {
  const systemPrompt = 'You are a senior social media strategist. Return exactly 5 concise bullet points in plain text based only on the supplied metrics and trends.';
  const userPrompt = [
    `Platform: ${dataset.platform}`,
    `Period: ${dataset.periodLabel}`,
    metricsNarrative(dataset.metrics, dataset.platform),
    `Daily points sample: ${JSON.stringify((dataset.dailyPoints || []).slice(0, 12))}`,
    'Write exactly 5 bullet points in plain text. Mention what is working, what is weak, which metrics need review, and what to do next.',
  ].join('\n\n');

  try {
    return String(await callDeepSeek(systemPrompt, userPrompt))
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `- ${line.replace(/^[\-•\d.\s]+/, '')}`)
      .join('\n');
  } catch (error) {
    return fallbackFeedback(dataset);
  }
}

async function generateAiSuggestion(type, dataset) {
  const systemPrompt = 'You write one direct, practical social media note for a client dashboard.';
  const userPrompt = [
    `Type: ${type}`,
    `Platform: ${dataset.platform}`,
    `Period: ${dataset.periodLabel}`,
    metricsNarrative(dataset.metrics, dataset.platform),
    `Trend sample: ${JSON.stringify((dataset.dailyPoints || []).slice(0, 10))}`,
    'Return only the suggestion text with no bullets and no heading.',
  ].join('\n\n');

  try {
    return await callDeepSeek(systemPrompt, userPrompt);
  } catch (error) {
    return fallbackSuggestion(type, dataset);
  }
}

async function generateReportContent(dataset, platform, periodLabel) {
  const systemPrompt = 'You are a senior strategist creating a social media report. Return valid JSON with keys "keyTakeaways" and "actionPlan". Each value must be an array of exactly 4 concise strings.';
  const userPrompt = [
    `Platform: ${platform}`,
    `Period: ${periodLabel}`,
    metricsNarrative(dataset.metrics, platform),
    `Daily points: ${JSON.stringify(dataset.dailyPoints)}`,
    'The takeaways and action plan must be driven by the metrics.',
  ].join('\n\n');

  try {
    const raw = await callDeepSeek(systemPrompt, userPrompt);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.keyTakeaways) && Array.isArray(parsed.actionPlan)) {
      return {
        keyTakeaways: parsed.keyTakeaways.slice(0, 4),
        actionPlan: parsed.actionPlan.slice(0, 4),
      };
    }
  } catch (error) {
    // fallback below
  }

  return fallbackReportLists(dataset);
}

async function generateDefaultDashboardContent(userId, dataset) {
  const feedback = await generateAiFeedback(dataset);
  await db.prepare('UPDATE datasets SET ai_feedback_text = ?, ai_feedback_edited_text = ?, updated_at = ? WHERE id = ?')
    .run(feedback, feedback, nowIso(), dataset.id);

  const types = ['Suggestion', 'Challenges', 'Ideal Solutions', 'AI Suggestions'];
  for (const type of types) {
    const content = await generateAiSuggestion(type, dataset);
    await upsertSuggestionForUser(userId, dataset.id, type, content);
  }

  const existingReport = await db.prepare('SELECT * FROM reports WHERE user_id = ? AND dataset_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(userId, dataset.id);
  const generated = await generateReportContent(dataset, dataset.platform, dataset.periodLabel);

  if (existingReport) {
    await db.prepare(`
      UPDATE reports
      SET title = ?, platform = ?, period_label = ?, period_start = ?, period_end = ?,
          metrics_json = ?, daily_points_json = ?, key_takeaways_json = ?, action_plan_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      `${dataset.platform} Report - ${dataset.periodLabel}`,
      dataset.platform,
      dataset.periodLabel,
      dataset.periodStart,
      dataset.periodEnd,
      JSON.stringify(dataset.metrics || {}),
      JSON.stringify(dataset.dailyPoints || []),
      JSON.stringify(generated.keyTakeaways || []),
      JSON.stringify(generated.actionPlan || []),
      nowIso(),
      existingReport.id,
    );
    return;
  }

  const id = `report-${crypto.randomUUID()}`;
  const timestamp = nowIso();
  await db.prepare(`
    INSERT INTO reports (
      id, user_id, dataset_id, title, platform, period_label, period_start, period_end, logo_data_url,
      metrics_json, daily_points_json, key_takeaways_json, action_plan_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    dataset.id,
    `${dataset.platform} Report - ${dataset.periodLabel}`,
    dataset.platform,
    dataset.periodLabel,
    dataset.periodStart,
    dataset.periodEnd,
    '',
    JSON.stringify(dataset.metrics || {}),
    JSON.stringify(dataset.dailyPoints || []),
    JSON.stringify(generated.keyTakeaways || []),
    JSON.stringify(generated.actionPlan || []),
    timestamp,
    timestamp,
  );
}

async function generateAdminFeedback(datasetId) {
  const row = await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId);
  if (!row) return null;
  const dataset = datasetRowToPayload(row);
  const feedback = await generateAiFeedback(dataset);
  await db.prepare('UPDATE datasets SET ai_feedback_text = ?, ai_feedback_edited_text = ?, updated_at = ? WHERE id = ?')
    .run(feedback, feedback, nowIso(), datasetId);
  return datasetRowToPayload(await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId));
}

async function generateAdminSuggestion(datasetId, type) {
  const row = await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId);
  if (!row) return null;
  const dataset = datasetRowToPayload(row);
  const content = await generateAiSuggestion(type, dataset);
  return await upsertSuggestionForUser(dataset.userId, dataset.id, type, content);
}

async function handleApi(req, res, url) {
  // Lazy initialize database on first request
  await lazyInitialize();
  
  if (req.method === 'GET' && url.pathname === '/api/users') {
    try {
      const users = await db.prepare('SELECT * FROM users').all();
      
      // Map rows back to camelCase frontend format using your publicUser helper function
      const safeUsers = users.map(user => publicUser(user));
      
      return sendJson(res, 200, safeUsers);
    } catch (err) {
      console.error('❌ SQL Error:', err.message);
      return sendJson(res, 500, { error: 'Database query failed' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
    const body = await parseBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const accountType = 'individual';
    const companyName = '';

    if (!email || !password || !firstName || !lastName) {
      sendJson(res, 400, { error: 'Please complete all required fields.' });
      return;
    }
    try {
      // Check if the user already exists in PostgreSQL
      const existing = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (existing) {
        if (existing.role === 'client' && Boolean(existing.invited_by_admin)) {
          await db.prepare(`
            UPDATE users
            SET first_name = ?, last_name = ?, password = ?, invited_by_admin = 0, last_login_at = ?
            WHERE id = ?
          `).run(firstName, lastName, password, nowIso(), existing.id);

          const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
          const token = await createSession(existing.id);
          await trackActivity(user, 'account_activated', 'Activated an admin-created client account.', null);
          sendJson(res, 201, { token, user: publicUser(user) });
          return;
        }

        sendJson(res, 409, { error: 'An account with this email already exists.' });
        return;
      }

      const id = `user-${crypto.randomUUID()}`;
      const createdAt = nowIso();
      await db.prepare(`
        INSERT INTO users (id, first_name, last_name, email, password, role, account_type, company_name, created_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, firstName, lastName, email, password, 'client', accountType, companyName, createdAt, createdAt);

      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      const token = await createSession(id);
      await trackActivity(user, 'account_created', 'Created a new client account.', null);
      sendJson(res, 201, { token, user: publicUser(user) });
      return;
    } catch (err) {
      console.error('❌ Registration error:', err.message);
      return sendJson(res, 500, { error: 'Registration failed due to a database error.' });
    }
  }
   if (req.method === 'POST' && url.pathname === '/api/auth/signin') {
    try {
      const body = await parseBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const role = body.role === 'admin' ? 'admin' : 'client';
      const user = await db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password);

      if (!user || user.role !== role) {
        return sendJson(res, 401, { error: 'Invalid email, password, or portal selection.' });
      }

      await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
      const freshUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      const token = await createSession(user.id);
      await trackActivity(freshUser, 'signed_in', `Signed in to the ${freshUser.role} portal.`, null);
      
      return sendJson(res, 200, { token, user: publicUser(freshUser) });
    } catch (err) {
      console.error('❌ Signin error:', err.message);
      return sendJson(res, 500, { error: 'Server error during signin' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signout') {
    const body = await parseBody(req);
    await db.prepare('DELETE FROM sessions WHERE token = ?').run(String(body.token || ''));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    const user = await requireUser(url.searchParams.get('token'), 'client');
    const datasets = (await db.prepare('SELECT * FROM datasets WHERE user_id = ? ORDER BY updated_at DESC').all(user.id)).map(datasetRowToPayload);
    const reports = (await db.prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY updated_at DESC').all(user.id)).map(reportRowToPayload);
    const suggestions = await suggestionsForDataset(user.id, datasets[0]?.id || null);
    sendJson(res, 200, { datasets, reports, suggestions, user: publicUser(user) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/datasets') {
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const dataset = await upsertDatasetForUser(user.id, body.datasetId, body);
    await trackActivity(user, 'dataset_saved', `Uploaded CSV data for ${dataset.platform}.`, {
      datasetId: dataset.id,
      periodLabel: dataset.periodLabel,
      metrics: dataset.metrics,
    });
    sendJson(res, 200, { dataset });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/feedback') {
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ? AND user_id = ?').get(body.datasetId, user.id);
    if (!row) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }

    const dataset = datasetRowToPayload(row);
    const feedback = await generateAiFeedback(dataset);
    await db.prepare('UPDATE datasets SET ai_feedback_text = ?, updated_at = ? WHERE id = ?').run(feedback, nowIso(), dataset.id);
    await trackActivity(user, 'ai_feedback_generated', `Generated AI feedback for ${dataset.platform} dashboard.`, { datasetId: dataset.id });
    sendJson(res, 200, { feedback });
    return;
  }

  if (req.method === 'PUT' && /^\/api\/admin\/datasets\/[^/]+$/.test(url.pathname)) {
    const body = await parseBody(req);
    await requireUser(body.token, 'admin');
    const datasetId = decodeURIComponent(url.pathname.split('/').pop() || '');
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId);
    if (!row) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }

    const current = datasetRowToPayload(row);
    await db.prepare(`
      UPDATE datasets
      SET title = ?, platform = ?, period_label = ?, period_start = ?, period_end = ?, csv_name = ?,
          metrics_json = ?, daily_points_json = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(body.title || current.title || 'Dashboard Overview').trim() || 'Dashboard Overview',
      String(body.platform || current.platform || 'Instagram').trim() || 'Instagram',
      String(body.periodLabel || current.periodLabel || 'Uploaded dataset').trim() || 'Uploaded dataset',
      body.periodStart || current.periodStart || null,
      body.periodEnd || current.periodEnd || null,
      String(body.csvName ?? current.csvName ?? ''),
      JSON.stringify(body.metrics || current.metrics || {}),
      JSON.stringify(body.dailyPoints || current.dailyPoints || []),
      String(body.notes ?? current.notes ?? ''),
      nowIso(),
      datasetId,
    );

    sendJson(res, 200, { dataset: datasetRowToPayload(await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId)) });
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/admin\/datasets\/[^/]+$/.test(url.pathname)) {
    const body = await parseBody(req);
    const admin = await requireUser(body.token, 'admin');
    const datasetId = decodeURIComponent(url.pathname.split('/').pop() || '');
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId);
    if (!row) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }

    await db.prepare('DELETE FROM reports WHERE dataset_id = ?').run(datasetId);
    await db.prepare('DELETE FROM suggestions WHERE dataset_id = ?').run(datasetId);
    await db.prepare('DELETE FROM datasets WHERE id = ?').run(datasetId);
    await trackActivity(admin, 'admin_dataset_deleted', `Deleted ${row.platform} dashboard data.`, {
      datasetId,
      clientId: row.user_id,
      platform: row.platform,
    });
    sendJson(res, 200, { ok: true, datasetId, clientId: row.user_id });
    return;
  }

  if (req.method === 'POST' && /^\/api\/admin\/datasets\/[^/]+\/feedback\/generate$/.test(url.pathname)) {
    const body = await parseBody(req);
    await requireUser(body.token, 'admin');
    const parts = url.pathname.split('/');
    const datasetId = parts[4];
    const dataset = await generateAdminFeedback(datasetId);
    if (!dataset) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }
    sendJson(res, 200, { dataset });
    return;
  }

  if (req.method === 'POST' && /^\/api\/admin\/datasets\/[^/]+\/suggestions\/generate$/.test(url.pathname)) {
    const body = await parseBody(req);
    await requireUser(body.token, 'admin');
    const parts = url.pathname.split('/');
    const datasetId = parts[4];
    const suggestion = await generateAdminSuggestion(datasetId, body.type);
    if (!suggestion) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }
    sendJson(res, 200, { suggestion });
    return;
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/datasets/') && url.pathname.endsWith('/feedback')) {
    const parts = url.pathname.split('/');
    const datasetId = parts[3];
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const text = String(body.text || '').trim();

    await db.prepare('UPDATE datasets SET ai_feedback_edited_text = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(text, nowIso(), datasetId, user.id);
    await trackActivity(user, 'ai_feedback_edited', 'Edited AI feedback on the dashboard.', { datasetId });
    sendJson(res, 200, { ok: true, text });
    return;
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/datasets/') && !url.pathname.includes('/feedback')) {
    const datasetId = url.pathname.split('/')[3];
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const metrics = body.metrics;
    if (!metrics || typeof metrics !== 'object') {
      sendJson(res, 400, { error: 'Invalid metrics.' });
      return;
    }
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ? AND user_id = ?').get(datasetId, user.id);
    if (!row) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }
    const dailyPoints = JSON.parse(row.daily_points_json || '[]');
    if (dailyPoints.length) {
      dailyPoints[dailyPoints.length - 1] = { ...dailyPoints[dailyPoints.length - 1], ...metrics };
    }
    const metricsJson = JSON.stringify(metrics);
    const dailyPointsJson = JSON.stringify(dailyPoints);
    await db.prepare('UPDATE datasets SET metrics_json = ?, daily_points_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(metricsJson, dailyPointsJson, nowIso(), datasetId, user.id);
    await trackActivity(user, 'dataset_metrics_edited', 'Edited dataset metrics.', { datasetId });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/suggestions') {
    const user = await requireUser(url.searchParams.get('token'), 'client');
    const datasetId = url.searchParams.get('datasetId');
    sendJson(res, 200, { suggestions: await suggestionsForDataset(user.id, datasetId) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/suggestion-draft') {
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ? AND user_id = ?').get(body.datasetId, user.id);
    if (!row) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }

    const dataset = datasetRowToPayload(row);
    const content = await generateAiSuggestion(String(body.type || 'Suggestion'), dataset);
    sendJson(res, 200, { content });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/suggestions') {
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const type = String(body.type || 'Suggestion').trim() || 'Suggestion';
    const content = String(body.content || '').trim();
    if (!content) {
      sendJson(res, 400, { error: 'Suggestion text is required.' });
      return;
    }

    const id = `suggestion-${crypto.randomUUID()}`;
    const createdAt = nowIso();
    await db.prepare(`
      INSERT INTO suggestions (id, user_id, dataset_id, type, content, created_by_ai, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, body.datasetId || null, type, content, body.createdByAI ? 1 : 0, createdAt, createdAt);

    await trackActivity(user, 'suggestion_saved', `Saved a ${type} note on the dashboard.`, { datasetId: body.datasetId || null, type });
    sendJson(res, 201, {
      suggestion: suggestionRowToPayload(await db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id)),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/reports/generate') {
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ? AND user_id = ?').get(body.datasetId, user.id);
    if (!row) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }

    const dataset = datasetRowToPayload(row);
    const platform = String(body.platform || dataset.platform || 'Instagram').trim() || 'Instagram';
    const periodLabel = String(body.periodLabel || dataset.periodLabel).trim() || dataset.periodLabel;
    const title = `${platform} Report - ${periodLabel}`;
    const generated = await generateReportContent(dataset, platform, periodLabel);
    const id = `report-${crypto.randomUUID()}`;
    const timestamp = nowIso();

    await db.prepare(`
      INSERT INTO reports (
        id, user_id, dataset_id, title, platform, period_label, period_start, period_end, logo_data_url,
        metrics_json, daily_points_json, key_takeaways_json, action_plan_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      user.id,
      dataset.id,
      title,
      platform,
      periodLabel,
      body.periodStart || dataset.periodStart,
      body.periodEnd || dataset.periodEnd,
      body.logoDataUrl || '',
      JSON.stringify(dataset.metrics || {}),
      JSON.stringify(dataset.dailyPoints || []),
      JSON.stringify(generated.keyTakeaways || []),
      JSON.stringify(generated.actionPlan || []),
      timestamp,
      timestamp,
    );

    await trackActivity(user, 'report_generated', `Generated report "${title}".`, { reportId: id, datasetId: dataset.id });
    sendJson(res, 201, { report: reportRowToPayload(await db.prepare('SELECT * FROM reports WHERE id = ?').get(id)) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/reports') {
    const user = await requireUser(url.searchParams.get('token'), 'client');
    const reports = (await db.prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY updated_at DESC').all(user.id)).map(reportRowToPayload);
    sendJson(res, 200, { reports });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/reports/')) {
    const reportId = url.pathname.split('/')[3];
    const user = await requireUser(url.searchParams.get('token'), 'client');
    const row = await db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(reportId, user.id);
    if (!row) {
      sendJson(res, 404, { error: 'Report not found.' });
      return;
    }
    sendJson(res, 200, { report: reportRowToPayload(row) });
    return;
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/reports/')) {
    const reportId = url.pathname.split('/')[3];
    const body = await parseBody(req);
    const user = await requireUser(body.token, 'client');
    const row = await db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(reportId, user.id);
    if (!row) {
      sendJson(res, 404, { error: 'Report not found.' });
      return;
    }

    const keyTakeaways = Array.isArray(body.keyTakeaways) ? body.keyTakeaways : json(row.key_takeaways_json, []);
    const actionPlan = Array.isArray(body.actionPlan) ? body.actionPlan : json(row.action_plan_json, []);
    await db.prepare(`
      UPDATE reports
      SET key_takeaways_json = ?, action_plan_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(keyTakeaways), JSON.stringify(actionPlan), nowIso(), reportId, user.id);
    await trackActivity(user, 'report_edited', `Edited report "${row.title}".`, { reportId });
    sendJson(res, 200, { report: reportRowToPayload(await db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId)) });
    return;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/reports/')) {
    const reportId = url.pathname.split('/')[3];
    const user = await requireUser(url.searchParams.get('token'), 'client');
    const row = await db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(reportId, user.id);
    if (!row) {
      sendJson(res, 404, { error: 'Report not found.' });
      return;
    }
    await db.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(reportId, user.id);
    await trackActivity(user, 'report_deleted', `Deleted report "${row.title}".`, { reportId });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    await requireUser(url.searchParams.get('token'), 'admin');
    const clients = (await db.prepare(`
      SELECT
        users.*,
        COUNT(DISTINCT reports.id) AS report_count,
        COUNT(DISTINCT datasets.id) AS dataset_count,
        MAX(activity.created_at) AS latest_activity_at,
        (
          SELECT datasets.platform
          FROM datasets
          WHERE datasets.user_id = users.id
          ORDER BY datasets.updated_at DESC
          LIMIT 1
        ) AS latest_platform,
        (
          SELECT datasets.csv_name
          FROM datasets
          WHERE datasets.user_id = users.id
          ORDER BY datasets.updated_at DESC
          LIMIT 1
        ) AS latest_csv_name
      FROM users
      LEFT JOIN reports ON reports.user_id = users.id
      LEFT JOIN datasets ON datasets.user_id = users.id
      LEFT JOIN activity ON activity.user_id = users.id
      WHERE users.role = 'client'
      GROUP BY users.id
      ORDER BY users.created_at DESC
    `).all()).map((row) => ({
      ...publicUser(row),
      reportCount: Number(row.report_count || 0),
      datasetCount: Number(row.dataset_count || 0),
      latestActivityAt: row.latest_activity_at || null,
      latestPlatform: row.latest_platform || '',
      latestCsvName: row.latest_csv_name || '',
      dashboardAccessMode: row.dashboard_access_mode || 'viewing',
      invitedByAdmin: Boolean(row.invited_by_admin),
    }));

    const activity = (await db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 80').all()).map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      type: row.type,
      message: row.message,
      metadata: json(row.metadata_json, null),
      createdAt: row.created_at,
    }));

    const reports = (await db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 30').all()).map(reportRowToPayload);
    sendJson(res, 200, { clients, activity, reports });
    return;
  }

  if (req.method === 'GET' && /^\/api\/admin\/clients\/[^/]+$/.test(url.pathname)) {
    await requireUser(url.searchParams.get('token'), 'admin');
    const clientId = decodeURIComponent(url.pathname.split('/').pop() || '');
    const detail = await adminClientOverview(clientId);
    if (!detail) {
      sendJson(res, 404, { error: 'Client account not found.' });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/clients') {
    const body = await parseBody(req);
    await requireUser(body.token, 'admin');
    const email = normalizeEmail(body.email);
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();

    if (!email || !firstName || !lastName) {
      sendJson(res, 400, { error: 'First name, last name, and email are required.' });
      return;
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      sendJson(res, 409, { error: 'A user with this email already exists.' });
      return;
    }

    const id = `user-${crypto.randomUUID()}`;
    const createdAt = nowIso();
    await db.prepare(`
      INSERT INTO users (
        id, first_name, last_name, email, password, role, account_type, company_name,
        dashboard_access_mode, invited_by_admin, created_at, last_login_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      firstName,
      lastName,
      email,
      '',
      'client',
      'individual',
      '',
      'viewing',
      1,
      createdAt,
      null,
    );

    sendJson(res, 201, { client: publicUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
    return;
  }

  if (req.method === 'PUT' && /^\/api\/admin\/clients\/[^/]+\/access$/.test(url.pathname)) {
    const body = await parseBody(req);
    await requireUser(body.token, 'admin');
    const parts = url.pathname.split('/');
    const clientId = decodeURIComponent(parts[4] || '');
    const mode = body.dashboardAccessMode === 'admin_view' ? 'admin_view' : 'viewing';
    const row = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(clientId, 'client');
    if (!row) {
      sendJson(res, 404, { error: 'Client account not found.' });
      return;
    }

    await db.prepare('UPDATE users SET dashboard_access_mode = ? WHERE id = ?').run(mode, clientId);
    sendJson(res, 200, { client: publicUser(await db.prepare('SELECT * FROM users WHERE id = ?').get(clientId)) });
    return;
  }

  if (req.method === 'POST' && /^\/api\/admin\/clients\/[^/]+\/datasets$/.test(url.pathname)) {
    const body = await parseBody(req);
    const admin = await requireUser(body.token, 'admin');
    const parts = url.pathname.split('/');
    const clientId = decodeURIComponent(parts[4] || '');
    const client = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(clientId, 'client');
    if (!client) {
      sendJson(res, 404, { error: 'Client account not found.' });
      return;
    }

    const dataset = await upsertDatasetForUser(clientId, body.datasetId, body);
    await generateDefaultDashboardContent(clientId, dataset);
    const freshDataset = datasetRowToPayload(await db.prepare('SELECT * FROM datasets WHERE id = ?').get(dataset.id));
    await trackActivity(admin, 'admin_dataset_published', `Published dashboard data for ${client.email}.`, {
      clientId,
      datasetId: freshDataset.id,
      platform: freshDataset.platform,
    });
    sendJson(res, 200, { dataset: freshDataset });
    return;
  }

  if (req.method === 'PUT' && /^\/api\/admin\/clients\/[^/]+\/suggestions$/.test(url.pathname)) {
    const body = await parseBody(req);
    const admin = await requireUser(body.token, 'admin');
    const parts = url.pathname.split('/');
    const clientId = decodeURIComponent(parts[4] || '');
    const client = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(clientId, 'client');
    if (!client) {
      sendJson(res, 404, { error: 'Client account not found.' });
      return;
    }

    const content = String(body.content || '').trim();
    if (!content) {
      sendJson(res, 400, { error: 'Suggestion text is required.' });
      return;
    }

    const suggestion = await upsertSuggestionForUser(clientId, body.datasetId || null, body.type, content);
    await trackActivity(admin, 'admin_suggestion_saved', `Saved a ${suggestion.type} note for ${client.email}.`, {
      clientId,
      suggestionId: suggestion.id,
      datasetId: suggestion.datasetId,
    });
    sendJson(res, 200, { suggestion });
    return;
  }

  if (req.method === 'PUT' && /^\/api\/admin\/datasets\/[^/]+\/feedback$/.test(url.pathname)) {
    const body = await parseBody(req);
    await requireUser(body.token, 'admin');
    const parts = url.pathname.split('/');
    const datasetId = parts[4];
    const row = await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId);
    if (!row) {
      sendJson(res, 404, { error: 'Dataset not found.' });
      return;
    }

    await db.prepare('UPDATE datasets SET ai_feedback_edited_text = ?, updated_at = ? WHERE id = ?')
      .run(String(body.text || '').trim(), nowIso(), datasetId);
    sendJson(res, 200, { dataset: datasetRowToPayload(await db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId)) });
    return;
  }

  if (req.method === 'PUT' && /^\/api\/admin\/reports\/[^/]+$/.test(url.pathname)) {
    const body = await parseBody(req);
    await requireUser(body.token, 'admin');
    const reportId = decodeURIComponent(url.pathname.split('/').pop() || '');
    const row = await db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
    if (!row) {
      sendJson(res, 404, { error: 'Report not found.' });
      return;
    }

    const keyTakeaways = Array.isArray(body.keyTakeaways) ? body.keyTakeaways : json(row.key_takeaways_json, []);
    const actionPlan = Array.isArray(body.actionPlan) ? body.actionPlan : json(row.action_plan_json, []);
    await db.prepare(`
      UPDATE reports
      SET key_takeaways_json = ?, action_plan_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(keyTakeaways), JSON.stringify(actionPlan), nowIso(), reportId);
    sendJson(res, 200, { report: reportRowToPayload(await db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId)) });
    return;
  }

  sendJson(res, 404, { error: 'API route not found.' });
}

function serveFile(req, res, url) {
  const pathname = url.pathname === '/' ? '/signin.html' : url.pathname;
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveFile(req, res, url);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || 'Server error.' });
  }
});

if (require.main === module) {
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Open http://localhost:${PORT} if Orbit is already running, or stop the existing Node process before running npm start again.`);
      process.exit(1);
    }
    throw error;
  });
  server.listen(PORT, () => {
    console.log(`✅ Orbit app running at http://localhost:${PORT}`);
    console.log('Database will initialize on first request...');
  });
}

module.exports = { server, PORT, handleApi, initializeDatabase, lazyInitialize, pool };
