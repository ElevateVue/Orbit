const { pool, initDb, getUserFromToken, getToken, json, parseBody, nowIso } = require('../_db');
const crypto = require('crypto');

async function sendInviteEmail({ to, dashboardName, inviteUrl, tempPassword, isAdmin }) {
  const subject = isAdmin
    ? `You've been added as an Admin to ${dashboardName} on Orbit`
    : `You've been invited to view ${dashboardName} on Orbit`;

  const adminBlock = isAdmin ? `
    <p>Your temporary password is: <strong style="font-size:16px;">${tempPassword}</strong></p>
    <p>You'll be asked to create a new password when you accept the invite.</p>
  ` : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:sans-serif;background:#f4f4f4;margin:0;padding:0;">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <div style="background:#0f172a;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Orbit</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="margin-top:0;color:#0f172a;">${subject}</h2>
          <p>You've been invited to access the <strong>${dashboardName}</strong> dashboard on Orbit.</p>
          ${adminBlock}
          <a href="${inviteUrl}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
            Accept Invite
          </a>
          <p style="color:#64748b;font-size:13px;">This link expires in 7 days. If you didn't expect this email, you can ignore it.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Orbit <noreply@orbit.elevate-vue.com>',
      to: [to],
      subject,
      html
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resend failed: ${err}`);
  }
  return resp.json();
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    await initDb();
    const user = await getUserFromToken(getToken(req));
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'super_admin') return json(res, 403, { error: 'Only super admins can send invites.' });

    const body = await parseBody(req);
    const { dashboardId, email, accessLevel } = body;

    if (!dashboardId || !email || !accessLevel) {
      return json(res, 400, { error: 'dashboardId, email, and accessLevel are required.' });
    }
    if (!['admin', 'client'].includes(accessLevel)) {
      return json(res, 400, { error: 'accessLevel must be "admin" or "client".' });
    }

    // Confirm dashboard belongs to this super_admin
    const { rows: dashRows } = await pool.query(
      'SELECT * FROM dashboards WHERE id=$1 AND created_by=$2', [dashboardId, user.id]
    );
    if (!dashRows[0]) return json(res, 404, { error: 'Dashboard not found.' });
    const dashboard = dashRows[0];

    // Check for existing unused invite
    await pool.query(
      'DELETE FROM invites WHERE dashboard_id=$1 AND email=$2 AND accepted_at IS NULL',
      [dashboardId, email.toLowerCase().trim()]
    );

    const now = nowIso();
    const inviteId = crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    const tempPassword = accessLevel === 'admin'
      ? crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
      : null;

    await pool.query(
      `INSERT INTO invites (id, dashboard_id, email, access_level, temp_password, token, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [inviteId, dashboardId, email.toLowerCase().trim(), accessLevel, tempPassword, token, user.id, now]
    );

    const baseUrl = process.env.APP_URL || 'https://orbit.elevate-vue.com';
    const inviteUrl = `${baseUrl}/accept-invite.html?token=${token}`;

    await sendInviteEmail({
      to: email.toLowerCase().trim(),
      dashboardName: dashboard.name,
      inviteUrl,
      tempPassword,
      isAdmin: accessLevel === 'admin'
    });

    return json(res, 200, { ok: true, message: `Invite sent to ${email}` });
  } catch (err) {
    console.error('Invite error:', err.message);
    json(res, 500, { error: err.message });
  }
};
