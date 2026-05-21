// ── Orbit Client Dashboard ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('orbit_token');
  if (!token) return (window.location.href = '/signin.html');

  // Verify session
  let currentUser;
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) return (window.location.href = '/signin.html');
    currentUser = await res.json();
  } catch {
    return (window.location.href = '/signin.html');
  }

  // Admins/super_admins go to admin panel
  if (currentUser.role === 'super_admin' || currentUser.role === 'admin') {
    window.location.href = '/admin.html';
    return;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    dashboards: [],
    selectedDashboardId: null,
    datasets: [],
    selectedDatasetId: null,
    chart: null,
  };

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const periodLabel      = document.getElementById('periodLabel');
  const dashboardStatus  = document.getElementById('dashboardStatus');
  const chartPeriodLabel = document.getElementById('chartPeriodLabel');
  const chartLegend      = document.getElementById('chartLegend');
  const metricGrid       = document.getElementById('dashboardMetricGrid');
  const platformSelector = document.getElementById('platformSelector');
  const reportList       = document.getElementById('dashboardReportList');

  // ── Chart ─────────────────────────────────────────────────────────────────
  const chart = new OrbitChart(
    document.getElementById('metricChart'),
    document.getElementById('chartTooltip')
  );
  state.chart = chart;
  window.addEventListener('resize', () => chart.resize());
  chart.resize();

  // Sign out
  document.getElementById('signoutBtn')?.addEventListener('click', async () => {
    await apiFetch('/api/auth/signout', { method: 'POST', body: JSON.stringify({ token }) });
    localStorage.removeItem('orbit_token');
    localStorage.removeItem('orbit_user');
    window.location.href = '/signin.html';
  });

  // ── Load dashboards ───────────────────────────────────────────────────────
  async function loadDashboards() {
    setStatus('Loading…');
    const res = await apiFetch('/api/dashboards');
    if (!res.ok) { setStatus('Failed to load dashboards.'); return; }
    state.dashboards = await res.json();

    if (!state.dashboards.length) {
      setStatus('No dashboards assigned to your account yet.');
      periodLabel.textContent = 'No dashboards yet';
      return;
    }

    // Pick the first (or previously selected) dashboard
    if (!state.selectedDashboardId || !state.dashboards.find(d => d.id === state.selectedDashboardId)) {
      state.selectedDashboardId = state.dashboards[0].id;
    }

    await loadDatasets();
  }

  // ── Load datasets for selected dashboard ─────────────────────────────────
  async function loadDatasets() {
    const res = await apiFetch(`/api/datasets?dashboardId=${state.selectedDashboardId}`);
    if (!res.ok) return;
    state.datasets = await res.json();

    if (!state.datasets.length) {
      setStatus('No data available yet.');
      periodLabel.textContent = 'No data yet';
      renderPlatformSelector();
      renderMetrics({});
      renderChart(null);
      renderReportList();
      return;
    }

    if (!state.selectedDatasetId || !state.datasets.find(d => d.id === state.selectedDatasetId)) {
      state.selectedDatasetId = state.datasets[0].id;
    }

    renderPlatformSelector();
    renderSelected();
    setStatus('');
  }

  // ── Platform/dataset selector tabs ───────────────────────────────────────
  function renderPlatformSelector() {
    platformSelector.innerHTML = state.datasets.map(ds =>
      `<button class="legend-chip${ds.id === state.selectedDatasetId ? ' active' : ''}"
        type="button" data-dsid="${ds.id}">
        ${esc(ds.platform)}
      </button>`
    ).join('');
    platformSelector.querySelectorAll('[data-dsid]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedDatasetId = btn.dataset.dsid;
        renderPlatformSelector();
        renderSelected();
      });
    });
  }

  function renderSelected() {
    const ds = state.datasets.find(d => d.id === state.selectedDatasetId);
    if (!ds) return;

    periodLabel.textContent = ds.periodLabel || ds.title;
    renderMetrics(ds);
    renderLegend(ds);
    renderChart(ds);
    renderReportList();
  }

  // Shared color palette — same order used for both cards, legend, and chart lines
  const CHART_COLORS = ['#74beff','#65dfb2','#ffb05b','#f084c6','#b79aff','#ffe06d','#6fc1ff','#ff7eb3'];
  const accentClasses = ['accent-cyan','accent-violet','accent-pink','accent-orange','accent-green','accent-yellow','accent-blue'];

  // Derive stable ordered key list from a dataset (dailyPoints first, fallback to metrics)
  function getMetricKeys(ds) {
    if (ds.dailyPoints?.length) {
      return Object.keys(ds.dailyPoints[0]).filter(k => k !== 'date' && k !== 'label');
    }
    return Object.keys(ds.metrics || {}).filter(k => ds.metrics[k] > 0);
  }

  // ── Metric cards ──────────────────────────────────────────────────────────
  function renderMetrics(ds) {
    const keys = getMetricKeys(ds);
    const metrics = ds.metrics || {};
    if (!keys.length) {
      metricGrid.innerHTML = `<p style="color:#475569;font-size:13px;padding:8px 0;">No metrics data yet.</p>`;
      return;
    }
    metricGrid.innerHTML = keys.map((k, i) => `
      <article class="metric-card ${accentClasses[i % accentClasses.length]}">
        <span>${friendlyLabel(k)}</span>
        <strong>${shortNum(metrics[k] || 0)}</strong>
      </article>`
    ).join('');
  }

  // ── Legend — built from same keys as metric cards ─────────────────────────
  function renderLegend(ds) {
    const keys = getMetricKeys(ds);
    chartLegend.innerHTML = keys.map((k, i) => `
      <button class="legend-chip active" type="button" data-key="${k}" data-color-idx="${i}">
        <span class="legend-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        ${friendlyLabel(k)}
      </button>`
    ).join('');

    chartLegend.querySelectorAll('.legend-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        renderChart(state.datasets.find(d => d.id === state.selectedDatasetId));
      });
    });
  }

  // ── Chart — uses same key order & colors as legend/cards ─────────────────
  function renderChart(ds) {
    if (!ds || !ds.dailyPoints?.length) {
      chartPeriodLabel.textContent = 'No data available';
      chart.setData([], []);
      return;
    }

    // Get active keys AND their original color index (preserved from legend)
    const activeChips = Array.from(chartLegend.querySelectorAll('.legend-chip.active'));
    const labels = ds.dailyPoints.map(p => p.date || p.label || '');

    const datasets = activeChips.map(btn => {
      const k = btn.dataset.key;
      const colorIdx = parseInt(btn.dataset.colorIdx) || 0;
      return {
        key: k,
        color: CHART_COLORS[colorIdx % CHART_COLORS.length],
        values: ds.dailyPoints.map(p => Number(p[k]) || 0)
      };
    });

    chartPeriodLabel.textContent = ds.periodLabel || ds.title;
    chart.setData(labels, datasets);
  }

  // ── Report list ───────────────────────────────────────────────────────────
  function renderReportList() {
    if (!reportList) return;
    reportList.innerHTML = state.datasets.map(ds => `
      <li class="saved-item report-link-item">
        <div>
          <strong>${esc(ds.title)}</strong>
          <p>${esc(ds.platform)} · ${esc(ds.periodLabel)}</p>
        </div>
      </li>`
    ).join('') || '<li class="saved-item empty">No reports yet.</li>';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function apiFetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(path, { ...opts, headers });
  }

  function setStatus(msg) {
    if (dashboardStatus) dashboardStatus.textContent = msg;
  }

  function friendlyLabel(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function shortNum(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  loadDashboards();
});
