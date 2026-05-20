// ── Orbit Admin JS ──────────────────────────────────────────────────────────

const API = '';
let currentUser = null;
let dashboards = [];
let currentDash = null;
let newDashLogoData = null;
let settingsLogoData = null;

// ── Auth ─────────────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('orbit_token');
}

async function authFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers });
  return res;
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  if (!token) return redirect('/signin.html');

  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) return redirect('/signin.html');
    currentUser = await res.json();
  } catch {
    return redirect('/signin.html');
  }

  // Role check
  if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
    return redirect('/dashboard.html');
  }

  // UI setup
  document.getElementById('userNameDisplay').textContent = `${currentUser.firstName} ${currentUser.lastName}`;
  document.getElementById('roleLabel').textContent = currentUser.role === 'super_admin' ? 'Super Admin' : 'Admin';

  if (currentUser.role === 'super_admin') {
    document.getElementById('newDashBtn').style.display = 'flex';
    document.getElementById('emptyNewDashBtn').style.display = 'inline-block';
  }

  document.getElementById('signoutBtn').addEventListener('click', signOut);
  document.getElementById('newDashBtn').addEventListener('click', () => openModal('newDashModal'));
  document.getElementById('emptyNewDashBtn').addEventListener('click', () => openModal('newDashModal'));

  await loadDashboards();
});

function redirect(url) { window.location.href = url; }

async function signOut() {
  const token = getToken();
  await fetch('/api/auth/signout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  localStorage.removeItem('orbit_token');
  localStorage.removeItem('orbit_user');
  redirect('/signin.html');
}

// ── Dashboards ────────────────────────────────────────────────────────────────
async function loadDashboards() {
  const res = await authFetch('/api/dashboards');
  if (!res.ok) return;
  dashboards = await res.json();
  renderSidebar();

  // Auto-select first dashboard
  if (dashboards.length > 0) {
    selectDashboard(dashboards[0].id);
  }
}

function renderSidebar() {
  const list = document.getElementById('sidebarDashList');
  list.innerHTML = '';
  dashboards.forEach(d => {
    const li = document.createElement('li');
    li.dataset.id = d.id;
    li.className = 'dash-item' + (currentDash?.id === d.id ? ' active' : '');
    li.innerHTML = `
      <div class="dash-logo">${d.logoData
        ? `<img src="${d.logoData}" alt="${esc(d.name)}" />`
        : esc(d.name.charAt(0))}</div>
      <span class="dash-name">${esc(d.name)}</span>
    `;
    li.addEventListener('click', () => selectDashboard(d.id));
    list.appendChild(li);
  });
}

async function selectDashboard(id) {
  currentDash = dashboards.find(d => d.id === id);
  if (!currentDash) return;

  // Update sidebar active state
  document.querySelectorAll('.dash-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('dashContent').style.display = 'block';

  // Header
  const logo = document.getElementById('dashLogoDisplay');
  logo.innerHTML = currentDash.logoData
    ? `<img src="${currentDash.logoData}" alt="${esc(currentDash.name)}" />`
    : esc(currentDash.name.charAt(0));

  document.getElementById('dashNameDisplay').textContent = currentDash.name;
  document.getElementById('dashRoleBadge').textContent = currentDash.accessLevel || 'super_admin';

  // Show/hide role-specific controls
  const isSuperAdmin = currentUser.role === 'super_admin';
  document.getElementById('settingsTabBtn').style.display = isSuperAdmin ? '' : 'none';
  document.getElementById('inviteBtn').style.display = isSuperAdmin ? '' : 'none';
  document.getElementById('addDatasetBtn').style.display = (isSuperAdmin || currentDash.accessLevel === 'admin') ? '' : 'none';
  document.getElementById('deleteDashBtn').style.display = isSuperAdmin ? '' : 'none';

  // Populate settings
  document.getElementById('settingsName').value = currentDash.name;
  const settingsLogoEl = document.getElementById('logoUploadArea');
  settingsLogoEl.innerHTML = currentDash.logoData
    ? `<img src="${currentDash.logoData}" alt="logo" />`
    : '<span>Click to upload</span>';
  settingsLogoData = currentDash.logoData || null;

  // Reset to datasets tab
  switchTab('datasets');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'tab-' + name);
  });
  if (name === 'datasets') loadDatasets();
  if (name === 'members') loadMembers();
  if (name === 'client-view') loadClientView();
}

// ── Datasets ──────────────────────────────────────────────────────────────────
let allDatasets = [];
let pendingDeleteDatasetId = null;
let clientViewChart = null;
let clientViewDatasetId = null;

async function loadDatasets() {
  if (!currentDash) return;
  const res = await authFetch(`/api/datasets?dashboardId=${currentDash.id}`);
  if (!res.ok) return;
  allDatasets = await res.json();
  renderDatasetGrid();
}

function renderDatasetGrid() {
  const grid = document.getElementById('datasetGrid');
  const empty = document.getElementById('datasetEmpty');
  const canEdit = currentUser.role === 'super_admin' || currentDash.accessLevel === 'admin';

  if (!allDatasets.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = allDatasets.map(d => {
    const hasData = d.dailyPoints && d.dailyPoints.length > 0;
    return `
    <div class="dataset-card">
      <div class="platform-tag">${esc(d.platform)}</div>
      <h3>${esc(d.title)}</h3>
      <div class="meta">${esc(d.periodLabel)}</div>
      ${hasData ? `<div class="meta" style="color:#22c55e;margin-top:4px;">✓ ${d.dailyPoints.length} data rows</div>` : `<div class="meta" style="color:#475569;margin-top:4px;">No data yet</div>`}
      ${canEdit ? `
      <div class="dataset-card-actions">
        <button class="btn-xs btn-xs-primary" onclick="openCsvUpload('${d.id}','${esc(d.title)}')">Upload CSV</button>
        <button class="btn-xs btn-xs-danger" onclick="askDeleteDataset('${d.id}')">Delete</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function openAddDataset() {
  document.getElementById('dsTitle').value = '';
  document.getElementById('dsPlatform').value = 'Instagram';
  document.getElementById('dsPeriodLabel').value = '';
  document.getElementById('dsPeriodStart').value = '';
  document.getElementById('dsPeriodEnd').value = '';
  document.getElementById('dsNotes').value = '';
  document.getElementById('newDatasetErr').style.display = 'none';
  openModal('newDatasetModal');
}

async function createDataset() {
  const title = document.getElementById('dsTitle').value.trim();
  const platform = document.getElementById('dsPlatform').value;
  const periodLabel = document.getElementById('dsPeriodLabel').value.trim();
  const periodStart = document.getElementById('dsPeriodStart').value || null;
  const periodEnd = document.getElementById('dsPeriodEnd').value || null;
  const notes = document.getElementById('dsNotes').value.trim() || null;
  const errEl = document.getElementById('newDatasetErr');
  errEl.style.display = 'none';

  if (!title) { errEl.textContent = 'Report title is required.'; errEl.style.display = 'block'; return; }
  if (!periodLabel) { errEl.textContent = 'Period label is required (e.g. "Q1 2025").'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('createDatasetBtn');
  btn.disabled = true; btn.textContent = 'Creating…';

  const res = await authFetch(`/api/datasets?dashboardId=${currentDash.id}`, {
    method: 'POST',
    body: JSON.stringify({ title, platform, periodLabel, periodStart, periodEnd, notes })
  });
  const data = await res.json();
  btn.disabled = false; btn.textContent = 'Create Dataset';

  if (!res.ok) {
    errEl.textContent = data.error || 'Failed to create dataset.';
    errEl.style.display = 'block';
    return;
  }

  closeModal('newDatasetModal');
  await loadDatasets();
}

function askDeleteDataset(id) {
  pendingDeleteDatasetId = id;
  openModal('deleteDatasetModal');
}

async function confirmDeleteDataset() {
  if (!pendingDeleteDatasetId) return;
  await authFetch(`/api/datasets/${pendingDeleteDatasetId}`, { method: 'DELETE' });
  closeModal('deleteDatasetModal');
  pendingDeleteDatasetId = null;
  await loadDatasets();
}

// ── CSV Upload ────────────────────────────────────────────────────────────────
let csvDatasetId = null;
let csvParsed = null; // { headers, rows }

function openCsvUpload(datasetId, title) {
  csvDatasetId = datasetId;
  csvParsed = null;
  document.getElementById('csvModalSubtitle').textContent = `Import data into: ${title}`;
  document.getElementById('csvErr').style.display = 'none';
  document.getElementById('csvOk').style.display = 'none';
  csvReset();
  openModal('csvModal');
}

function csvReset() {
  document.getElementById('csvStep1').style.display = 'block';
  document.getElementById('csvStep2').style.display = 'none';
  document.getElementById('csvImportBtn').style.display = 'none';
  document.getElementById('csvBackBtn').style.display = 'none';
  document.getElementById('csvFileInput').value = '';
  document.getElementById('csvErr').style.display = 'none';
  document.getElementById('csvOk').style.display = 'none';
  csvParsed = null;
}

function handleCsvDrop(event) {
  event.preventDefault();
  document.getElementById('csvDropzone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) processCSVFile(file);
}

function handleCsvFile(event) {
  const file = event.target.files[0];
  if (file) processCSVFile(file);
}

function processCSVFile(file) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    const errEl = document.getElementById('csvErr');
    errEl.textContent = 'Please upload a CSV file.';
    errEl.style.display = 'block';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      csvParsed = parseCSV(e.target.result);
      if (!csvParsed.headers.length || !csvParsed.rows.length) throw new Error('No data found in file.');
      showCsvStep2(file.name, csvParsed);
    } catch (err) {
      const errEl = document.getElementById('csvErr');
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  // Handle both \r\n and \n line endings, remove BOM
  text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };

  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = parseLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v.trim()));

  return { headers, rows };
}

function showCsvStep2(filename, parsed) {
  document.getElementById('csvStep1').style.display = 'none';
  document.getElementById('csvStep2').style.display = 'block';
  document.getElementById('csvImportBtn').style.display = 'inline-block';
  document.getElementById('csvBackBtn').style.display = 'inline-block';
  document.getElementById('csvFileInfo').textContent = `${filename} — ${parsed.rows.length} rows, ${parsed.headers.length} columns`;

  // Build column mapping UI
  const dateOptions = parsed.headers.map((h, i) =>
    `<option value="${i}" ${/date|day|week|month|period/i.test(h) ? 'selected' : ''}>${esc(h)}</option>`
  ).join('');

  const metricOptions = ['(skip)', ...parsed.headers].map((h, i) =>
    `<option value="${i - 1}">${esc(h)}</option>`
  ).join('');

  const commonMetrics = ['impressions', 'reach', 'views', 'clicks', 'interactions', 'reactions', 'comments', 'follows', 'engagement'];

  let mapHtml = `<div style="grid-column:1/-1;font-size:11px;color:#475569;margin-bottom:4px;">Date column (required):</div>
    <div style="grid-column:1/-1;"><select id="csvDateCol" style="width:100%;padding:7px 10px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:12px;">${dateOptions}</select></div>
    <div style="grid-column:1/-1;font-size:11px;color:#475569;margin:10px 0 4px;">Metric columns — map to known metrics (optional, auto-detected):</div>`;

  parsed.headers.forEach((h, i) => {
    const guess = commonMetrics.find(m => h.toLowerCase().includes(m)) || '';
    mapHtml += `<div>
      <label style="font-size:11px;color:#64748b;">${esc(h)}</label>
      <select class="csv-metric-map" data-col="${i}" style="width:100%;padding:6px 8px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:11px;margin-top:3px;">
        <option value="">(auto)</option>
        ${commonMetrics.map(m => `<option value="${m}" ${guess===m?'selected':''}>${m}</option>`).join('')}
        <option value="skip">skip</option>
      </select>
    </div>`;
  });

  document.getElementById('csvColMap').innerHTML = mapHtml;

  // Preview table
  const preview = parsed.rows.slice(0, 5);
  const thead = `<tr>${parsed.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const tbody = preview.map(r => `<tr>${parsed.headers.map(h => `<td>${esc(r[h] || '')}</td>`).join('')}</tr>`).join('');
  document.getElementById('csvPreviewTable').innerHTML = `<thead>${thead}</thead><tbody>${tbody}</tbody>`;
}

async function importCsv() {
  if (!csvParsed || !csvDatasetId) return;

  const dateColIdx = parseInt(document.getElementById('csvDateCol').value);
  const dateKey = csvParsed.headers[dateColIdx];

  // Build metric key mappings
  const metricMaps = {};
  document.querySelectorAll('.csv-metric-map').forEach(sel => {
    const colIdx = parseInt(sel.dataset.col);
    const colName = csvParsed.headers[colIdx];
    const mapTo = sel.value;
    if (mapTo && mapTo !== 'skip' && colIdx !== dateColIdx) {
      metricMaps[colName] = mapTo || colName.toLowerCase().replace(/\s+/g, '_');
    } else if (!mapTo && colIdx !== dateColIdx) {
      // Auto: use column name as metric key
      metricMaps[colName] = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }
  });

  // Build daily_points
  const dailyPoints = csvParsed.rows.map(row => {
    const point = { date: row[dateKey] || '' };
    Object.keys(metricMaps).forEach(col => {
      const val = parseFloat(String(row[col] || '').replace(/[^0-9.-]/g, ''));
      point[metricMaps[col]] = isNaN(val) ? 0 : val;
    });
    return point;
  }).filter(p => p.date);

  // Aggregate totals for metrics_json
  const metricKeys = [...new Set(Object.values(metricMaps))];
  const metrics = {};
  metricKeys.forEach(k => {
    metrics[k] = dailyPoints.reduce((sum, p) => sum + (p[k] || 0), 0);
  });

  const btn = document.getElementById('csvImportBtn');
  btn.disabled = true; btn.textContent = 'Importing…';

  const res = await authFetch(`/api/datasets/${csvDatasetId}`, {
    method: 'PUT',
    body: JSON.stringify({ dailyPoints, metrics })
  });

  btn.disabled = false; btn.textContent = 'Import Data';

  if (!res.ok) {
    const d = await res.json();
    document.getElementById('csvErr').textContent = d.error || 'Import failed.';
    document.getElementById('csvErr').style.display = 'block';
    return;
  }

  const okEl = document.getElementById('csvOk');
  okEl.textContent = `✓ Imported ${dailyPoints.length} rows of data successfully!`;
  okEl.style.display = 'block';

  await loadDatasets();
  setTimeout(() => { closeModal('csvModal'); csvReset(); }, 1800);
}

// ── Client View Tab ───────────────────────────────────────────────────────────
async function loadClientView() {
  if (!currentDash) return;
  const res = await authFetch(`/api/datasets?dashboardId=${currentDash.id}`);
  if (!res.ok) return;
  const datasets = await res.json();
  const container = document.getElementById('clientViewInner');

  if (!datasets.length) {
    container.innerHTML = '<div class="preview-empty">No datasets yet — add a dataset to see the client view.</div>';
    return;
  }

  // Set default selected dataset
  if (!clientViewDatasetId || !datasets.find(d => d.id === clientViewDatasetId)) {
    clientViewDatasetId = datasets[0].id;
  }

  // Platform selector pills
  const pillsHtml = datasets.map(d =>
    `<button class="platform-pill ${d.id === clientViewDatasetId ? 'active' : ''}"
      onclick="selectClientDataset('${d.id}')">${esc(d.platform)} — ${esc(d.periodLabel)}</button>`
  ).join('');

  const ds = datasets.find(d => d.id === clientViewDatasetId) || datasets[0];
  const metrics = ds.metrics || {};
  const dailyPoints = ds.dailyPoints || [];
  const metricKeys = Object.keys(metrics).filter(k => metrics[k] > 0);

  // Metric cards
  const metricCardsHtml = metricKeys.length
    ? metricKeys.map(k => `
      <div class="metric-preview-card">
        <div class="m-label">${k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}</div>
        <div class="m-value">${shortNum(metrics[k])}</div>
      </div>`).join('')
    : `<div style="color:#475569;font-size:13px;padding:12px 0;">No metrics yet — upload a CSV to populate data.</div>`;

  // Feedback
  const feedbackHtml = ds.aiFeedbackText
    ? `<div style="color:#cbd5e1;font-size:13px;line-height:1.6;white-space:pre-wrap;">${esc(ds.aiFeedbackText)}</div>`
    : `<div style="color:#334155;font-size:13px;">No feedback written yet.</div>`;

  container.innerHTML = `
    <div class="platform-pill-row">${pillsHtml}</div>

    <div style="margin-bottom:6px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.06em;">
      ${esc(ds.title)} &nbsp;·&nbsp; ${esc(ds.periodLabel)}
    </div>

    <div class="metric-preview-grid">${metricCardsHtml}</div>

    ${dailyPoints.length ? `
    <div class="chart-preview-wrap">
      <div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">Performance Over Time</div>
      <div class="chart-canvas-wrap">
        <canvas id="clientViewCanvas"></canvas>
        <div id="clientViewTooltip" class="chart-tooltip"></div>
      </div>
    </div>` : `
    <div class="chart-preview-wrap" style="text-align:center;color:#334155;font-size:13px;padding:40px;">
      Upload a CSV to see the performance chart.
    </div>`}

    <div style="font-size:13px;color:#94a3b8;font-weight:500;margin-bottom:8px;">Feedback</div>
    <div class="feedback-preview">${feedbackHtml}</div>
  `;

  // Render chart after DOM has painted
  if (dailyPoints.length && metricKeys.length) {
    requestAnimationFrame(() => setTimeout(() => renderClientViewChart(dailyPoints, metricKeys), 80));
  }
}

function selectClientDataset(id) {
  clientViewDatasetId = id;
  loadClientView();
}

function renderClientViewChart(dailyPoints, metricKeys) {
  const canvas = document.getElementById('clientViewCanvas');
  if (!canvas) return;
  clientViewChart = null;

  const tooltip = document.getElementById('clientViewTooltip');
  const dpr = window.devicePixelRatio || 1;

  // Size canvas to its container's actual pixel dimensions
  const container = canvas.parentElement;
  const w = container ? container.clientWidth || container.offsetWidth : 800;
  const h = 220;
  canvas.width = Math.max(400, Math.round(w * dpr));
  canvas.height = Math.round(h * dpr);
  canvas.style.width = '100%';
  canvas.style.height = h + 'px';

  clientViewChart = new OrbitChart(canvas, tooltip);

  const labels = dailyPoints.map(p => p.date);
  const chartKeys = metricKeys.slice(0, 3);
  const chartDatasets = chartKeys.map(k => ({
    key: k,
    label: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '),
    data: dailyPoints.map(p => Number(p[k]) || 0)
  }));

  clientViewChart.setData(labels, chartDatasets);

  // Re-render once layout is stable (handles flex/grid reflow delay)
  requestAnimationFrame(() => {
    const w2 = container ? container.clientWidth || container.offsetWidth : 800;
    if (w2 !== w) {
      canvas.width = Math.max(400, Math.round(w2 * dpr));
      clientViewChart.render();
    }
  });
}

function shortNum(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ── Members ───────────────────────────────────────────────────────────────────
async function loadMembers() {
  if (!currentDash) return;
  const res = await authFetch(`/api/dashboards/members?dashboardId=${currentDash.id}`);
  if (!res.ok) return;
  const data = await res.json();
  const tbody = document.getElementById('membersTbody');
  const isSuperAdmin = currentUser.role === 'super_admin';

  const memberRows = (data.members || []).map(m => `
    <tr>
      <td>${esc(m.firstName || '')} ${esc(m.lastName || '')}</td>
      <td style="color:#94a3b8;">${esc(m.email)}</td>
      <td><span class="badge badge-${m.accessLevel}">${esc(m.accessLevel)}</span></td>
      <td><span class="badge" style="background:#14532d33;color:#86efac;">Active</span></td>
      <td>${isSuperAdmin ? `<button class="icon-btn" onclick="removeMember('${m.id}')" title="Remove">✕</button>` : ''}</td>
    </tr>
  `).join('');

  const inviteRows = (data.pendingInvites || []).map(i => `
    <tr>
      <td style="color:#64748b;">—</td>
      <td style="color:#94a3b8;">${esc(i.email)}</td>
      <td><span class="badge badge-${i.accessLevel}">${esc(i.accessLevel)}</span></td>
      <td><span class="badge badge-pending">Pending</span></td>
      <td>${isSuperAdmin ? `<button class="icon-btn" onclick="cancelInvite('${i.id}')" title="Cancel invite">✕</button>` : ''}</td>
    </tr>
  `).join('');

  tbody.innerHTML = memberRows + inviteRows || '<tr><td colspan="5" style="color:#475569;padding:20px;">No members yet.</td></tr>';
}

async function removeMember(userId) {
  if (!confirm('Remove this member?')) return;
  const res = await authFetch('/api/dashboards/members', {
    method: 'DELETE',
    body: JSON.stringify({ userId, dashboardId: currentDash.id })
  });
  if (res.ok) loadMembers();
}

async function cancelInvite(inviteId) {
  if (!confirm('Cancel this invite?')) return;
  const res = await authFetch('/api/dashboards/members', {
    method: 'DELETE',
    body: JSON.stringify({ inviteId, dashboardId: currentDash.id })
  });
  if (res.ok) loadMembers();
}

// ── Invite ────────────────────────────────────────────────────────────────────
function openInviteModal() {
  document.getElementById('inviteEmail').value = '';
  document.getElementById('inviteRole').value = 'client';
  document.getElementById('inviteErr').style.display = 'none';
  document.getElementById('inviteOk').style.display = 'none';
  openModal('inviteModal');
}

async function sendInvite() {
  const email = document.getElementById('inviteEmail').value.trim();
  const accessLevel = document.getElementById('inviteRole').value;
  const errEl = document.getElementById('inviteErr');
  const okEl = document.getElementById('inviteOk');
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  if (!email) { errEl.textContent = 'Email is required.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('sendInviteBtn');
  btn.disabled = true; btn.textContent = 'Sending…';

  const res = await authFetch('/api/dashboards/invite', {
    method: 'POST',
    body: JSON.stringify({ dashboardId: currentDash.id, email, accessLevel })
  });
  const data = await res.json();

  btn.disabled = false; btn.textContent = 'Send Invite';

  if (!res.ok) { errEl.textContent = data.error || 'Failed to send invite.'; errEl.style.display = 'block'; return; }

  okEl.textContent = `Invite sent to ${email}!`;
  okEl.style.display = 'block';
  document.getElementById('inviteEmail').value = '';
  setTimeout(() => { closeModal('inviteModal'); loadMembers(); }, 1500);
}

// ── New Dashboard ─────────────────────────────────────────────────────────────
function handleNewDashLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    newDashLogoData = e.target.result;
    const area = document.getElementById('newDashLogoArea');
    area.innerHTML = `<img src="${newDashLogoData}" style="width:100%;height:100%;object-fit:contain;" />`;
  };
  reader.readAsDataURL(file);
}

async function createDashboard() {
  const name = document.getElementById('newDashName').value.trim();
  const errEl = document.getElementById('newDashErr');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Dashboard name is required.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('createDashBtn');
  btn.disabled = true; btn.textContent = 'Creating…';

  const res = await authFetch('/api/dashboards', {
    method: 'POST',
    body: JSON.stringify({ name, logoData: newDashLogoData || null })
  });
  const data = await res.json();

  btn.disabled = false; btn.textContent = 'Create Dashboard';

  if (!res.ok) { errEl.textContent = data.error || 'Failed.'; errEl.style.display = 'block'; return; }

  newDashLogoData = null;
  document.getElementById('newDashName').value = '';
  document.getElementById('newDashLogoArea').innerHTML = '<span>Click to upload</span>';
  closeModal('newDashModal');
  await loadDashboards();
  selectDashboard(data.id);
}

// ── Settings ──────────────────────────────────────────────────────────────────
function handleLogoFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    settingsLogoData = e.target.result;
    const area = document.getElementById('logoUploadArea');
    area.innerHTML = `<img src="${settingsLogoData}" />`;
  };
  reader.readAsDataURL(file);
}

async function saveDashboardSettings() {
  const name = document.getElementById('settingsName').value.trim();
  const errEl = document.getElementById('settingsErr');
  const okEl = document.getElementById('settingsOk');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }

  const res = await authFetch(`/api/dashboards/${currentDash.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, logoData: settingsLogoData })
  });

  if (!res.ok) {
    const d = await res.json();
    errEl.textContent = d.error || 'Failed to save.'; errEl.style.display = 'block';
    return;
  }

  okEl.textContent = 'Changes saved!'; okEl.style.display = 'block';
  currentDash.name = name;
  currentDash.logoData = settingsLogoData;
  // Update local array too
  const idx = dashboards.findIndex(d => d.id === currentDash.id);
  if (idx !== -1) dashboards[idx] = { ...dashboards[idx], name, logoData: settingsLogoData };
  renderSidebar();
  document.getElementById('dashNameDisplay').textContent = name;
  const logo = document.getElementById('dashLogoDisplay');
  logo.innerHTML = settingsLogoData
    ? `<img src="${settingsLogoData}" alt="${esc(name)}" />`
    : esc(name.charAt(0));
  setTimeout(() => { okEl.style.display = 'none'; }, 2500);
}

function confirmDeleteDashboard() { openModal('deleteModal'); }

async function deleteDashboard() {
  const res = await authFetch(`/api/dashboards/${currentDash.id}`, { method: 'DELETE' });
  if (!res.ok) return;
  closeModal('deleteModal');
  dashboards = dashboards.filter(d => d.id !== currentDash.id);
  currentDash = null;
  renderSidebar();
  if (dashboards.length) {
    selectDashboard(dashboards[0].id);
  } else {
    document.getElementById('dashContent').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
  }
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.add('hidden');
  }
});

// ── Util ──────────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
