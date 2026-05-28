// api/[...path].js — Social Media API (Facebook, Instagram, LinkedIn)
// Replaces the broken server.js delegate. Uses the 12th Vercel function slot.
//
// All routes use ?action= query param on /api/social:
//   GET  ?action=auth&platform=facebook|linkedin&dashboardId=   → OAuth URL
//   GET  ?action=callback&code=&state=                          → OAuth callback
//   GET  ?action=accounts&dashboardId=                          → List connected accounts
//   DELETE ?action=accounts&id=                                 → Disconnect account
//   GET  ?action=posts&dashboardId=[&status=]                   → List posts
//   POST ?action=posts                                          → Create post
//   PUT  ?action=posts&id=                                      → Update post
//   DELETE ?action=posts&id=                                    → Delete post
//   POST ?action=publish&id=                                    → Publish now
//   POST ?action=approve&id=                                    → Approve post
//   POST ?action=reject&id=                                     → Reject post

const { pool, initDb, getUserFromToken, getToken, json, parseBody, nowIso } = require('./_db');

const FB_ID     = () => process.env.FACEBOOK_APP_ID;
const FB_SECRET = () => process.env.FACEBOOK_APP_SECRET;
const LI_ID     = () => process.env.LINKEDIN_CLIENT_ID;
const LI_SECRET = () => process.env.LINKEDIN_CLIENT_SECRET;
const APP_URL   = () => (process.env.APP_URL || '').replace(/\/$/, '');
const CB_URI    = () => `${APP_URL()}/api/social?action=callback`;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function tryParse(s, fb) { try { return JSON.parse(s); } catch { return fb; } }

// ── Router ─────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  await initDb();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Only handle /api/social paths
  if (!url.pathname.startsWith('/api/social')) {
    return json(res, 404, { error: 'Not found' });
  }

  const action = url.searchParams.get('action');

  // OAuth routes — no auth required (browser redirect)
  if (action === 'auth'     && req.method === 'GET') return handleAuthStart(req, res, url);
  if (action === 'callback' && req.method === 'GET') return handleCallback(req, res, url);

  // Everything else requires a valid session
  const user = await getUserFromToken(getToken(req));
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  if (action === 'accounts') {
    if (req.method === 'GET')    return listAccounts(req, res, url, user);
    if (req.method === 'DELETE') return disconnectAccount(req, res, url, user);
  }
  if (action === 'posts') {
    if (req.method === 'GET')    return listPosts(req, res, url, user);
    if (req.method === 'POST')   return createPost(req, res, url, user);
    if (req.method === 'PUT')    return updatePost(req, res, url, user);
    if (req.method === 'DELETE') return deletePost(req, res, url, user);
  }
  if (action === 'publish' && req.method === 'POST') return publishPost(req, res, url, user);
  if (action === 'approve' && req.method === 'POST') return approvePost(req, res, url, user);
  if (action === 'reject'  && req.method === 'POST') return rejectPost(req, res, url, user);

  return json(res, 404, { error: 'Unknown social action' });
};

// ── OAuth Start ────────────────────────────────────────────────────────────────
async function handleAuthStart(req, res, url) {
  const user = await getUserFromToken(getToken(req));
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  const platform    = url.searchParams.get('platform');
  const dashboardId = url.searchParams.get('dashboardId');
  if (!platform || !dashboardId) return json(res, 400, { error: 'Missing platform or dashboardId' });

  const state = Buffer.from(JSON.stringify({ dashboardId, userId: user.id, platform, ts: Date.now() })).toString('base64url');
  const cbUri = CB_URI();

  let oauthUrl;

  if (platform === 'facebook') {
    if (!FB_ID()) return json(res, 200, { error: 'Facebook app not configured — add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to Vercel environment variables.' });
    const scope = encodeURIComponent([
      'pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
      'pages_manage_metadata', 'instagram_basic', 'instagram_content_publish',
      'instagram_manage_insights', 'business_management'
    ].join(','));
    oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_ID()}&redirect_uri=${encodeURIComponent(cbUri)}&state=${state}&scope=${scope}&response_type=code`;

  } else if (platform === 'linkedin') {
    if (!LI_ID()) return json(res, 200, { error: 'LinkedIn app not configured — add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to Vercel environment variables.' });
    const scope = encodeURIComponent('r_liteprofile r_emailaddress w_member_social r_organization_social w_organization_social');
    oauthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LI_ID()}&redirect_uri=${encodeURIComponent(cbUri)}&state=${state}&scope=${scope}`;

  } else {
    return json(res, 400, { error: `Platform "${platform}" is not supported yet.` });
  }

  return json(res, 200, { url: oauthUrl });
}

// ── OAuth Callback ─────────────────────────────────────────────────────────────
async function handleCallback(req, res, url) {
  const appUrl = APP_URL();
  const code   = url.searchParams.get('code');
  const state  = url.searchParams.get('state');
  const error  = url.searchParams.get('error');

  const fail = (msg) => {
    res.writeHead(302, { Location: `${appUrl}/admin.html?social_error=${encodeURIComponent(msg)}` });
    res.end();
  };

  if (error || !code || !state) return fail(error || 'OAuth was cancelled');

  let payload;
  try { payload = JSON.parse(Buffer.from(state, 'base64url').toString()); }
  catch { return fail('Invalid OAuth state — please try connecting again'); }

  const { dashboardId, userId, platform } = payload;

  try {
    if (platform === 'facebook')     await connectFacebook(code, dashboardId, userId);
    else if (platform === 'linkedin') await connectLinkedIn(code, dashboardId, userId);
    else return fail(`Unknown platform: ${platform}`);

    res.writeHead(302, { Location: `${appUrl}/admin.html?social_connected=1&platform=${platform}&dashboardId=${dashboardId}` });
    res.end();
  } catch (err) {
    console.error('[social callback]', platform, err.message);
    return fail(err.message || 'Connection failed');
  }
}

// ── Facebook + Instagram Connection ───────────────────────────────────────────
async function connectFacebook(code, dashboardId, userId) {
  const cbUri = CB_URI();

  // 1. Code → short-lived user token
  const t1 = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${FB_ID()}&redirect_uri=${encodeURIComponent(cbUri)}&client_secret=${FB_SECRET()}&code=${code}`
  ).then(r => r.json());
  if (t1.error) throw new Error(t1.error.message);

  // 2. Short-lived → long-lived user token (60 days)
  const t2 = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_ID()}&client_secret=${FB_SECRET()}&fb_exchange_token=${t1.access_token}`
  ).then(r => r.json());
  if (t2.error) throw new Error(t2.error.message);

  // 3. Get all Facebook Pages the user manages (each gets its own never-expiring page token)
  const pages = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture.type(square){url}&limit=50&access_token=${t2.access_token}`
  ).then(r => r.json());
  if (pages.error) throw new Error(pages.error.message);
  if (!pages.data?.length) throw new Error('No Facebook Pages found. Create a Facebook Page on your account first.');

  for (const page of pages.data) {
    // Upsert Facebook Page
    await pool.query(
      `INSERT INTO social_accounts
         (id,dashboard_id,platform,account_type,external_id,account_name,avatar_url,access_token,connected_by,connected_at,is_active,meta_json)
       VALUES ($1,$2,'facebook','page',$3,$4,$5,$6,$7,$8,true,'{}')
       ON CONFLICT (dashboard_id,platform,external_id)
       DO UPDATE SET account_name=EXCLUDED.account_name,avatar_url=EXCLUDED.avatar_url,
                     access_token=EXCLUDED.access_token,is_active=true`,
      [uid(), dashboardId, page.id, page.name, page.picture?.data?.url || null, page.access_token, userId, nowIso()]
    );

    // Check for connected Instagram Business Account
    try {
      const ig = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account{id,name,username,profile_picture_url,followers_count}&access_token=${page.access_token}`
      ).then(r => r.json());

      const igAcc = ig.instagram_business_account;
      if (igAcc) {
        await pool.query(
          `INSERT INTO social_accounts
             (id,dashboard_id,platform,account_type,external_id,account_name,account_handle,avatar_url,access_token,connected_by,connected_at,is_active,meta_json)
           VALUES ($1,$2,'instagram','business',$3,$4,$5,$6,$7,$8,$9,true,$10)
           ON CONFLICT (dashboard_id,platform,external_id)
           DO UPDATE SET account_name=EXCLUDED.account_name,account_handle=EXCLUDED.account_handle,
                         avatar_url=EXCLUDED.avatar_url,access_token=EXCLUDED.access_token,
                         is_active=true,meta_json=EXCLUDED.meta_json`,
          [uid(), dashboardId, igAcc.id, igAcc.name || igAcc.username, igAcc.username || null,
           igAcc.profile_picture_url || null, page.access_token, userId, nowIso(),
           JSON.stringify({ facebookPageId: page.id, facebookPageName: page.name, followers: igAcc.followers_count || 0 })]
        );
      }
    } catch (_) { /* Instagram not linked to this page — skip silently */ }
  }
}

// ── LinkedIn Connection ────────────────────────────────────────────────────────
async function connectLinkedIn(code, dashboardId, userId) {
  const cbUri = CB_URI();

  // 1. Exchange code → access token
  const tokenData = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      redirect_uri: cbUri,
      client_id: LI_ID(), client_secret: LI_SECRET()
    }).toString()
  }).then(r => r.json());
  if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

  const token     = tokenData.access_token;
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 5184000) * 1000).toISOString();

  // 2. Get LinkedIn personal profile
  const profile = await fetch(
    'https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~digitalmediaAsset:playableStreams))',
    { headers: { 'Authorization': `Bearer ${token}` } }
  ).then(r => r.json());
  if (profile.serviceErrorCode) throw new Error(profile.message || 'Could not fetch LinkedIn profile');

  const name   = `${profile.localizedFirstName} ${profile.localizedLastName}`;
  const avatar = profile.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier || null;

  await pool.query(
    `INSERT INTO social_accounts
       (id,dashboard_id,platform,account_type,external_id,account_name,avatar_url,access_token,token_expires_at,connected_by,connected_at,is_active,meta_json)
     VALUES ($1,$2,'linkedin','profile',$3,$4,$5,$6,$7,$8,$9,true,'{}')
     ON CONFLICT (dashboard_id,platform,external_id)
     DO UPDATE SET account_name=EXCLUDED.account_name,avatar_url=EXCLUDED.avatar_url,
                   access_token=EXCLUDED.access_token,token_expires_at=EXCLUDED.token_expires_at,is_active=true`,
    [uid(), dashboardId, profile.id, name, avatar, token, expiresAt, userId, nowIso()]
  );

  // 3. Get Organization pages the user administers (optional)
  try {
    const orgs = await fetch(
      'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&projection=(elements*(organization~(id,localizedName,logoV2(cropped~:playableStreams))))',
      { headers: { 'Authorization': `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' } }
    ).then(r => r.json());

    for (const el of (orgs.elements || [])) {
      const org = el['organization~'];
      if (!org) continue;
      const urn    = `urn:li:organization:${org.id}`;
      const orgAvt = org.logoV2?.['cropped~']?.elements?.[0]?.identifiers?.[0]?.identifier || null;
      await pool.query(
        `INSERT INTO social_accounts
           (id,dashboard_id,platform,account_type,external_id,account_name,avatar_url,access_token,token_expires_at,connected_by,connected_at,is_active,meta_json)
         VALUES ($1,$2,'linkedin','organization',$3,$4,$5,$6,$7,$8,$9,true,$10)
         ON CONFLICT (dashboard_id,platform,external_id)
         DO UPDATE SET account_name=EXCLUDED.account_name,avatar_url=EXCLUDED.avatar_url,
                       access_token=EXCLUDED.access_token,token_expires_at=EXCLUDED.token_expires_at,is_active=true`,
        [uid(), dashboardId, urn, org.localizedName, orgAvt, token, expiresAt, userId, nowIso(),
         JSON.stringify({ orgId: org.id, urn })]
      );
    }
  } catch (_) { /* Organization pages are optional */ }
}

// ── List Accounts ──────────────────────────────────────────────────────────────
async function listAccounts(req, res, url, user) {
  const dashboardId = url.searchParams.get('dashboardId');
  if (!dashboardId) return json(res, 400, { error: 'Missing dashboardId' });

  const { rows } = await pool.query(
    `SELECT id, platform, account_type, external_id, account_name, account_handle,
            avatar_url, is_active, token_expires_at, connected_at, meta_json
     FROM social_accounts WHERE dashboard_id=$1 AND is_active=true
     ORDER BY platform, account_name`,
    [dashboardId]
  );
  return json(res, 200, rows.map(r => ({
    ...r,
    meta: tryParse(r.meta_json, {}),
    tokenExpired: r.token_expires_at ? new Date(r.token_expires_at) < new Date() : false
  })));
}

// ── Disconnect Account ─────────────────────────────────────────────────────────
async function disconnectAccount(req, res, url, user) {
  const id = url.searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing id' });
  await pool.query(`UPDATE social_accounts SET is_active=false WHERE id=$1`, [id]);
  return json(res, 200, { ok: true });
}

// ── List Posts ─────────────────────────────────────────────────────────────────
async function listPosts(req, res, url, user) {
  const dashboardId = url.searchParams.get('dashboardId');
  const status      = url.searchParams.get('status');
  if (!dashboardId) return json(res, 400, { error: 'Missing dashboardId' });

  const params = [dashboardId];
  const clause = (status && status !== 'all') ? (params.push(status), ` AND p.status=$${params.length}`) : '';

  const { rows } = await pool.query(
    `SELECT p.*, u.first_name, u.last_name
     FROM posts p JOIN users u ON u.id=p.created_by
     WHERE p.dashboard_id=$1${clause}
     ORDER BY p.created_at DESC LIMIT 100`,
    params
  );
  return json(res, 200, rows.map(r => ({
    ...r,
    mediaUrls:        tryParse(r.media_urls, []),
    platformAccounts: tryParse(r.platform_accounts, []),
    overrides:        tryParse(r.platform_overrides, {}),
    externalIds:      tryParse(r.external_post_ids, {}),
    authorName:       `${r.first_name} ${r.last_name}`
  })));
}

// ── Create Post ────────────────────────────────────────────────────────────────
async function createPost(req, res, url, user) {
  const body = await parseBody(req);
  const { dashboardId, title, postBody, mediaUrls = [], platformAccounts = [], overrides = {}, scheduledAt, status = 'draft' } = body;

  if (!dashboardId)       return json(res, 400, { error: 'Missing dashboardId' });
  if (!postBody?.trim())  return json(res, 400, { error: 'Post content is required' });
  if (!platformAccounts.length) return json(res, 400, { error: 'Select at least one account' });

  const safeStatus = ['draft', 'pending'].includes(status) ? status : 'draft';
  const id = uid();

  await pool.query(
    `INSERT INTO posts
       (id,dashboard_id,created_by,title,body,media_urls,platform_accounts,platform_overrides,status,scheduled_at,external_post_ids,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}', $11,$12)`,
    [id, dashboardId, user.id, title || null, postBody.trim(),
     JSON.stringify(mediaUrls), JSON.stringify(platformAccounts), JSON.stringify(overrides),
     safeStatus, scheduledAt || null, nowIso(), nowIso()]
  );

  const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [id]);
  return json(res, 201, rows[0]);
}

// ── Update Post ────────────────────────────────────────────────────────────────
async function updatePost(req, res, url, user) {
  const id = url.searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing post id' });

  const body = await parseBody(req);
  const sets = [], params = [];
  let i = 1;
  const add = (col, val) => { sets.push(`${col}=$${i++}`); params.push(val); };

  if (body.title !== undefined)            add('title', body.title);
  if (body.postBody !== undefined)         add('body', body.postBody);
  if (body.mediaUrls !== undefined)        add('media_urls', JSON.stringify(body.mediaUrls));
  if (body.platformAccounts !== undefined) add('platform_accounts', JSON.stringify(body.platformAccounts));
  if (body.overrides !== undefined)        add('platform_overrides', JSON.stringify(body.overrides));
  if (body.scheduledAt !== undefined)      add('scheduled_at', body.scheduledAt);
  if (body.status !== undefined && ['draft','pending','scheduled'].includes(body.status)) add('status', body.status);

  if (!sets.length) return json(res, 400, { error: 'Nothing to update' });
  add('updated_at', nowIso());
  params.push(id);

  await pool.query(`UPDATE posts SET ${sets.join(',')} WHERE id=$${i}`, params);
  const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [id]);
  return json(res, 200, rows[0] || {});
}

// ── Delete Post ────────────────────────────────────────────────────────────────
async function deletePost(req, res, url, user) {
  const id = url.searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing post id' });
  await pool.query(`DELETE FROM posts WHERE id=$1 AND status != 'published'`, [id]);
  return json(res, 200, { ok: true });
}

// ── Approve Post ───────────────────────────────────────────────────────────────
async function approvePost(req, res, url, user) {
  const id = url.searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing post id' });
  await pool.query(
    `UPDATE posts SET status='approved', approved_by=$1, approved_at=$2, updated_at=$3 WHERE id=$4`,
    [user.id, nowIso(), nowIso(), id]
  );
  await pool.query(
    `INSERT INTO post_approvals (id,post_id,approver_id,action,acted_at) VALUES ($1,$2,$3,'approved',$4)`,
    [uid(), id, user.id, nowIso()]
  );
  return json(res, 200, { ok: true });
}

// ── Reject Post ────────────────────────────────────────────────────────────────
async function rejectPost(req, res, url, user) {
  const id   = url.searchParams.get('id');
  const body = await parseBody(req);
  if (!id) return json(res, 400, { error: 'Missing post id' });
  await pool.query(
    `UPDATE posts SET status='rejected', rejection_note=$1, updated_at=$2 WHERE id=$3`,
    [body.note || null, nowIso(), id]
  );
  await pool.query(
    `INSERT INTO post_approvals (id,post_id,approver_id,action,note,acted_at) VALUES ($1,$2,$3,'rejected',$4,$5)`,
    [uid(), id, user.id, body.note || null, nowIso()]
  );
  return json(res, 200, { ok: true });
}

// ── Publish Post Now ───────────────────────────────────────────────────────────
async function publishPost(req, res, url, user) {
  const id = url.searchParams.get('id');
  if (!id) return json(res, 400, { error: 'Missing post id' });

  const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [id]);
  if (!rows.length) return json(res, 404, { error: 'Post not found' });
  const post = rows[0];

  if (post.status === 'published') return json(res, 400, { error: 'Post is already published' });

  const accountIds = tryParse(post.platform_accounts, []);
  const overrides  = tryParse(post.platform_overrides, {});
  const mediaUrls  = tryParse(post.media_urls, []);

  const { rows: accounts } = await pool.query(
    `SELECT * FROM social_accounts WHERE id = ANY($1)`,
    [accountIds]
  );

  const published = {}, errors = [];

  for (const acc of accounts) {
    const caption = overrides[acc.id]?.body || overrides[acc.platform]?.body || post.body;
    try {
      let postId;
      if      (acc.platform === 'facebook')  postId = await doPostFacebook(acc, caption, mediaUrls);
      else if (acc.platform === 'instagram') postId = await doPostInstagram(acc, caption, mediaUrls);
      else if (acc.platform === 'linkedin')  postId = await doPostLinkedIn(acc, caption);
      if (postId) published[acc.id] = postId;
    } catch (err) {
      errors.push({ accountId: acc.id, name: acc.account_name, error: err.message });
    }
  }

  const newStatus = Object.keys(published).length ? 'published' : 'failed';
  await pool.query(
    `UPDATE posts SET status=$1, published_at=$2, external_post_ids=$3, updated_at=$4 WHERE id=$5`,
    [newStatus, nowIso(), JSON.stringify(published), nowIso(), id]
  );

  return json(res, errors.length && newStatus === 'failed' ? 500 : 200, {
    ok: newStatus === 'published', published, errors
  });
}

// ── Platform Helpers ───────────────────────────────────────────────────────────
async function doPostFacebook(acc, message, mediaUrls) {
  const pageId = acc.external_id;
  const token  = acc.access_token;
  const url    = mediaUrls.length
    ? `https://graph.facebook.com/v19.0/${pageId}/photos`
    : `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const body   = mediaUrls.length
    ? { url: mediaUrls[0], caption: message, access_token: token }
    : { message, access_token: token };

  const data = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.json());
  if (data.error) throw new Error(`Facebook: ${data.error.message}`);
  return data.id;
}

async function doPostInstagram(acc, caption, mediaUrls) {
  if (!mediaUrls.length) throw new Error('Instagram requires at least one image URL');
  const igId  = acc.external_id;
  const token = acc.access_token;

  // Step 1: create media container
  const c = await fetch(`https://graph.facebook.com/v19.0/${igId}/media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: mediaUrls[0], caption, access_token: token })
  }).then(r => r.json());
  if (c.error) throw new Error(`Instagram: ${c.error.message}`);

  // Step 2: publish container
  const p = await fetch(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: c.id, access_token: token })
  }).then(r => r.json());
  if (p.error) throw new Error(`Instagram: ${p.error.message}`);
  return p.id;
}

async function doPostLinkedIn(acc, text) {
  const token  = acc.access_token;
  const author = acc.account_type === 'organization'
    ? acc.external_id                           // already "urn:li:organization:xxx"
    : `urn:li:person:${acc.external_id}`;

  const data = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    })
  }).then(r => r.json());

  if (data.serviceErrorCode || (data.status && data.status >= 400)) {
    throw new Error(`LinkedIn: ${data.message || JSON.stringify(data)}`);
  }
  return data.id;
}
