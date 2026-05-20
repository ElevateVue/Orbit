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
}

// ── Datasets ──────────────────────────────────────────────────────────────────
async function loadDatasets() {
  if (!currentDash) return;
  const res = await authFetch(`/api/datasets?dashboardId=${currentDash.id}`);
  if (!res.ok) return;
  const datasets = await res.json();
  const grid = document.getElementById('datasetGrid');
  const empty = document.getElementById('datasetEmpty');

  if (!datasets.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = datasets.map(d => `
    <div class="dataset-card" onclick="viewDataset('${d.id}')">
      <div class="platform-tag">${esc(d.platform)}</div>
      <h3>${esc(d.title)}</h3>
      <div class="meta">${esc(d.periodLabel)}</div>
    </div>
  `).join('');
}

function viewDataset(id) {
  window.location.href = `/report.html?datasetId=${id}&dashboardId=${currentDash.id}`;
}

function openAddDataset() {
  // Reset form
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
  // Redirect to the report page to fill in metrics
  window.location.href = `/report.html?datasetId=${data.id}&dashboardId=${currentDash.id}`;
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
