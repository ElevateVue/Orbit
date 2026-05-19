const dashboardSession = requireSession('client');

if (dashboardSession) {
  const state = {
    datasets: [],
    selectedPlatform: null,
    reports: [],
    chart: null,
    canEditDashboard: dashboardSession.user?.dashboardAccessMode === 'admin_view',
    legendPlatform: null,
  };

  const metricGrid = document.getElementById('dashboardMetricGrid');
  const dashboardStatus = document.getElementById('dashboardStatus');
  const periodLabel = document.getElementById('periodLabel');
  const chartPeriodLabel = document.getElementById('chartPeriodLabel');
  const chartLegend = document.getElementById('chartLegend');
  const aiFeedbackInput = document.getElementById('aiFeedbackInput');
  const dashboardReportList = document.getElementById('dashboardReportList');
  const clientFeedbackActions = document.getElementById('clientFeedbackActions');

  const platformMetricConfigs = {
    Instagram: [
      { key: 'reach', label: 'Reach', color: '#74beff' },
      { key: 'interactions', label: 'Interactions', color: '#65dfb2' },
      { key: 'clicks', label: 'Clicks', color: '#ffb05b' },
      { key: 'reactions', label: 'Reactions', color: '#f084c6' },
      { key: 'views', label: 'Views', color: '#b79aff' },
      { key: 'follows', label: 'Follows', color: '#ffe06d' },
      { key: 'engagementRate', label: 'Avg Engagement', color: '#6fc1ff' },
    ],
    Facebook: [
      { key: 'follows', label: 'Follows', color: '#74beff' },
      { key: 'visits', label: 'Visits', color: '#65dfb2' },
      { key: 'clicks', label: 'Clicks', color: '#ffb05b' },
      { key: 'interactions', label: 'Interactions', color: '#f084c6' },
      { key: 'views', label: 'Views', color: '#b79aff' },
      { key: 'viewers', label: 'Viewers', color: '#ffe06d' },
      { key: 'engagementRate', label: 'Avg Engagement', color: '#6fc1ff' },
    ],
    LinkedIn: [
      { key: 'impressions', label: 'Impressions', color: '#74beff' },
      { key: 'unique', label: 'Unique', color: '#65dfb2' },
      { key: 'clicks', label: 'Clicks', color: '#ffb05b' },
      { key: 'reactions', label: 'Reactions', color: '#f084c6' },
      { key: 'comments', label: 'Comments', color: '#b79aff' },
      { key: 'reports', label: 'RePosts', color: '#ffe06d' },
      { key: 'engagement', label: 'Engagement', color: '#6fc1ff' },
      { key: 'engagementRate', label: 'Avg Engagement', color: '#91e7ff' },
    ],
  };

  const metricAccentClasses = ['accent-cyan', 'accent-violet', 'accent-pink', 'accent-orange', 'accent-green', 'accent-yellow', 'accent-blue'];
  const platformOrder = ['Instagram', 'Facebook', 'LinkedIn'];

  function getMetricConfigs(platform) {
    return platformMetricConfigs[platform] || platformMetricConfigs.Instagram;
  }

  function defaultPlatform(datasets) {
    return datasetForPlatform(datasets, 'Instagram')?.platform
      || platformOrder.find((platform) => datasetForPlatform(datasets, platform))
      || 'Instagram';
  }

  function datasetForPlatform(datasets, platform) {
    return (datasets || []).find((dataset) => dataset.platform === platform) || null;
  }

  const BULLET = '\u2022';

  const chart = new OrbitChart(
    document.getElementById('metricChart'),
    document.getElementById('chartTooltip'),
  );
  state.chart = chart;

  function setStatus(message) {
    dashboardStatus.textContent = message || '';
  }

  function buildLegend(platform) {
    state.legendPlatform = platform || 'Instagram';
    chartLegend.innerHTML = '';
    const configs = getMetricConfigs(platform || 'Instagram');
    configs.forEach((metric) => {
      const button = document.createElement('button');
      button.className = 'legend-chip active';
      button.type = 'button';
      button.dataset.metricKey = metric.key;
      button.innerHTML = `<span class="legend-dot" style="background:${metric.color}"></span>${metric.label}`;
      button.addEventListener('click', () => {
        button.classList.toggle('active');
        renderChart();
      });
      chartLegend.appendChild(button);
    });
  }

  function selectedMetricKeys() {
    return Array.from(chartLegend.querySelectorAll('.legend-chip.active')).map((button) => button.dataset.metricKey);
  }

  function formatFeedbackAsPoints(feedback) {
    const normalized = String(feedback || '')
      .replace(/\r/g, '\n')
      .replace(/â€¢/g, BULLET)
      .trim();
    if (!normalized) return '';

    const lines = normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-•â€¢\d.\s]+/, '').trim())
      .filter(Boolean);

    if (lines.length >= 2) {
      return lines.map((line) => `${BULLET} ${line}`).join('\n');
    }

    return normalized
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .map((sentence) => `${BULLET} ${sentence.replace(/^[-•â€¢]\s*/, '')}`)
      .join('\n');
  }

  function metricValue(metrics, key, platform) {
    return key === 'engagementRate' && platform === 'Instagram'
      ? `${Number(metrics[key] || 0).toFixed(2)}%`
      : shortNumber(metrics[key] || 0);
  }

  function populateMetricCards(metrics, platform) {
    const configs = getMetricConfigs(platform || 'Instagram');
    metricGrid.innerHTML = configs.map((metric, index) => `
      <article class="metric-card ${metricAccentClasses[index % metricAccentClasses.length]}">
        <span>${metric.label}</span>
        ${state.canEditDashboard ? `<input class="metric-input" data-key="${metric.key}" value="${metricValue(metrics || {}, metric.key, platform)}" />` : `<strong>${metricValue(metrics || {}, metric.key, platform)}</strong>`}
      </article>
    `).join('');
  }

  function renderChart(dataset) {
    const currentDataset = dataset || datasetForPlatform(state.datasets, state.selectedPlatform);
    if (!currentDataset || !currentDataset.dailyPoints?.length) {
      chartPeriodLabel.textContent = 'No data available';
      state.chart.setData([], []);
      return;
    }

    const labels = currentDataset.dailyPoints.map((point) => point.label);
    const metricConfigs = getMetricConfigs(currentDataset.platform);
    const activeKeys = selectedMetricKeys();
    const datasets = metricConfigs
      .filter((config) => activeKeys.includes(config.key))
      .map((config) => ({
        key: config.key,
        color: config.color,
        values: currentDataset.dailyPoints.map((point) => point[config.key] || 0),
      }));

    chartPeriodLabel.textContent = currentDataset.periodLabel;
    state.chart.setData(labels, datasets);
  }

  function renderDashboardReports() {
    dashboardReportList.innerHTML = '';
    if (!state.reports.length) {
      dashboardReportList.innerHTML = '<li class="saved-item empty">No saved reports yet.</li>';
      return;
    }

    state.reports.forEach((report) => {
      const li = document.createElement('li');
      li.className = 'saved-item report-link-item';
      li.innerHTML = `
        <div>
          <strong>${report.title}</strong>
          <p>${report.periodLabel}</p>
        </div>
        <button class="primary-btn small" type="button">View Report</button>
      `;
      li.querySelector('button').addEventListener('click', () => {
        localStorage.setItem('orbitSelectedReportId', report.id);
        window.location.href = `/report.html?reportId=${encodeURIComponent(report.id)}`;
      });
      dashboardReportList.appendChild(li);
    });
  }

  function renderDataset() {
    aiFeedbackInput.readOnly = !state.canEditDashboard;
    clientFeedbackActions?.classList.toggle('hidden', !state.canEditDashboard);

    const platformSelector = document.getElementById('platformSelector');
    if (platformSelector) {
      platformSelector.innerHTML = platformOrder.map((platform) => {
        return `
        <button class="legend-chip${platform === state.selectedPlatform ? ' active' : ''}" type="button" data-platform="${platform}">
          ${platform}
        </button>
      `;
      }).join('');
      platformSelector.querySelectorAll('[data-platform]').forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedPlatform = button.dataset.platform;
          renderDataset();
        });
      });
    }

    const dataset = datasetForPlatform(state.datasets, state.selectedPlatform);
    if (!dataset) {
      periodLabel.textContent = 'Waiting for dashboard data';
      populateMetricCards({}, state.selectedPlatform || 'Instagram');
      const metricActions = document.getElementById('metricActions');
      if (metricActions) {
        metricActions.innerHTML = '';
      }
      aiFeedbackInput.value = '';
      renderDashboardReports();
      renderChart();
      return;
    }

    periodLabel.textContent = dataset.periodLabel || 'Platform dashboard';
    if (state.legendPlatform !== dataset.platform) {
      buildLegend(dataset.platform);
    }
    populateMetricCards(dataset.metrics || {}, dataset.platform);
    const metricActions = document.getElementById('metricActions');
    if (metricActions) {
      metricActions.innerHTML = state.canEditDashboard ? '<button class="primary-btn small" id="applyMetricChangesBtn" type="button">Apply Metric Changes</button>' : '';
      if (state.canEditDashboard) {
        document.getElementById('applyMetricChangesBtn')?.addEventListener('click', applyMetricChanges);
      }
    }
    aiFeedbackInput.value = formatFeedbackAsPoints(dataset.aiFeedbackEditedText || dataset.aiFeedbackText || '');
    renderDashboardReports();
    renderChart(dataset);
  }

  async function applyMetricChanges() {
    const dataset = datasetForPlatform(state.datasets, state.selectedPlatform);
    if (!state.canEditDashboard || !dataset?.id) return;
    const inputs = metricGrid.querySelectorAll('.metric-input');
    const metrics = {};
    inputs.forEach(input => {
      const key = input.dataset.key;
      const value = parseFloat(input.value) || 0;
      metrics[key] = value;
    });
    try {
      await requestJson(`/api/datasets/${dataset.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          token: dashboardSession.token,
          metrics,
        }),
      });
      dataset.metrics = metrics;
      if (dataset.dailyPoints && dataset.dailyPoints.length) {
        dataset.dailyPoints[dataset.dailyPoints.length - 1] = { ...dataset.dailyPoints[dataset.dailyPoints.length - 1], ...metrics };
      }
      populateMetricCards(metrics, dataset.platform);
      renderChart(dataset);
      setStatus('Metrics updated.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function loadDashboard() {
    const data = await requestJson(`/api/dashboard?token=${encodeURIComponent(dashboardSession.token)}`);
    state.datasets = data.datasets || [];
    state.selectedPlatform = datasetForPlatform(state.datasets, state.selectedPlatform)
      ? state.selectedPlatform
      : defaultPlatform(state.datasets);
    state.reports = data.reports || [];
    state.canEditDashboard = data.user?.dashboardAccessMode === 'admin_view';
    saveSession({ ...dashboardSession, user: data.user || dashboardSession.user });
    renderDataset();
    setStatus(state.datasets.length ? 'Dashboard loaded.' : 'No dashboard data available yet.');
  }

  document.getElementById('saveFeedbackBtn')?.addEventListener('click', async () => {
    const dataset = datasetForPlatform(state.datasets, state.selectedPlatform);
    if (!state.canEditDashboard || !dataset?.id) return;
    try {
      await requestJson(`/api/datasets/${dataset.id}/feedback`, {
        method: 'PUT',
        body: JSON.stringify({
          token: dashboardSession.token,
          text: aiFeedbackInput.value.trim(),
        }),
      });
      dataset.aiFeedbackEditedText = aiFeedbackInput.value.trim();
      setStatus('Feedback saved.');
    } catch (error) {
      setStatus(error.message);
    }
  });



  document.getElementById('signoutBtn')?.addEventListener('click', async () => {
    await signout();
    window.location.href = '/signin.html';
  });

  buildLegend();
  window.addEventListener('resize', () => chart.resize());
  chart.resize();
  loadDashboard().catch((error) => setStatus(error.message));
}
