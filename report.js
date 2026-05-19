const reportSession = requireSession('client');

if (reportSession) {
  const state = {
    reports: [],
    selectedReport: null,
    chart: null,
    canEdit: reportSession.user?.dashboardAccessMode === 'admin_view',
  };
  const preferredReportId = new URLSearchParams(window.location.search).get('reportId');

  const chart = new OrbitChart(
    document.getElementById('reportChart'),
    document.getElementById('reportChartTooltip'),
  );
  state.chart = chart;

  const reportCards = document.getElementById('reportCards');
  const reportDetail = document.getElementById('reportDetail');
  const reportDetailTitle = document.getElementById('reportDetailTitle');
  const reportDetailMeta = document.getElementById('reportDetailMeta');
  const reportPlatformBadge = document.getElementById('reportPlatformBadge');
  const reportChartPeriod = document.getElementById('reportChartPeriod');
  const reportChartLegend = document.getElementById('reportChartLegend');
  const reportLogoImage = document.getElementById('reportLogoImage');
  const reportLogoFallback = document.getElementById('reportLogoFallback');

  const reportMetricGrid = document.getElementById('reportMetricGrid');
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
  const metricAccentClasses = ['accent-cyan', 'accent-violet', 'accent-blue', 'accent-pink', 'accent-green', 'accent-yellow', 'accent-orange'];

  function getMetricConfigs(platform) {
    return platformMetricConfigs[platform] || platformMetricConfigs.Instagram;
  }

  function setMetrics(metrics, platform) {
    reportMetricGrid.innerHTML = getMetricConfigs(platform).map((metric, index) => `
      <article class="metric-card ${metricAccentClasses[index % metricAccentClasses.length]}">
        <span>${metric.label}</span>
        <strong>${metric.key === 'engagementRate' && platform === 'Instagram' ? `${Number(metrics[metric.key] || 0).toFixed(2)}%` : shortNumber(metrics[metric.key] || 0)}</strong>
      </article>
    `).join('');
  }

  function renderLegend(platform) {
    reportChartLegend.innerHTML = '';
    getMetricConfigs(platform).forEach((metric) => {
      const chip = document.createElement('div');
      chip.className = 'legend-chip active';
      chip.innerHTML = `<span class="legend-dot" style="background:${metric.color}"></span>${metric.label}`;
      reportChartLegend.appendChild(chip);
    });
  }

  function renderEditableList(containerId, values) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const entries = values.length ? values : [''];
    entries.forEach((value, index) => {
      const row = document.createElement('label');
      row.className = 'ordered-note-row';
      row.innerHTML = `
        <span class="ordered-index">${index + 1}</span>
        <div class="ordered-card">
          <textarea class="ordered-input">${value}</textarea>
          ${state.canEdit ? '<button class="delete-point-btn" type="button" aria-label="Delete point">🗑️</button>' : ''}
        </div>
      `;
      container.appendChild(row);
    });
    if (state.canEdit) {
      attachDeleteHandlers(containerId);
    }
  }

  function appendEditableListRow(containerId, value = '') {
    const container = document.getElementById(containerId);
    const nextIndex = container.querySelectorAll('.ordered-note-row').length + 1;
    const row = document.createElement('label');
    row.className = 'ordered-note-row';
    row.innerHTML = `
      <span class="ordered-index">${nextIndex}</span>
      <div class="ordered-card">
        <textarea class="ordered-input">${value}</textarea>
        ${state.canEdit ? '<button class="delete-point-btn" type="button" aria-label="Delete point">🗑️</button>' : ''}
      </div>
    `;
    container.appendChild(row);
    if (state.canEdit) {
      attachDeleteHandlers(containerId);
    }
  }

  function reindexEditableList(containerId) {
    document.querySelectorAll(`#${containerId} .ordered-note-row`).forEach((row, index) => {
      const badge = row.querySelector('.ordered-index');
      if (badge) badge.textContent = index + 1;
    });
  }

  function attachDeleteHandlers(containerId) {
    document.querySelectorAll(`#${containerId} .delete-point-btn`).forEach((button) => {
      button.onclick = () => {
        button.closest('.ordered-note-row')?.remove();
        reindexEditableList(containerId);
      };
    });
  }

  function readEditableList(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} .ordered-input`))
      .map((input) => input.value.trim())
      .filter(Boolean);
  }

  function renderReportCards() {
    reportCards.innerHTML = '';
    if (!state.reports.length) {
      reportCards.innerHTML = '<div class="saved-item empty">No reports generated yet. Create one from the dashboard.</div>';
      return;
    }

    state.reports.forEach((report) => {
      const card = document.createElement('article');
      card.className = `report-list-card${state.selectedReport?.id === report.id ? ' active' : ''}`;
      card.innerHTML = `
        <div>
          <h3>${report.title}</h3>
          <p>${report.periodLabel}</p>
        </div>
        <button class="primary-btn small" type="button">View Report</button>
      `;
      card.querySelector('button').addEventListener('click', () => selectReport(report.id));
      reportCards.appendChild(card);
    });
  }

  function renderSelectedReport() {
    if (!state.selectedReport) {
      reportDetail.classList.add('hidden');
      return;
    }

    reportDetail.classList.remove('hidden');
    const report = state.selectedReport;
    reportDetailTitle.textContent = report.title;
    reportDetailMeta.textContent = `${report.periodLabel} - Generated by Orbit`;
    reportPlatformBadge.textContent = report.platform;
    reportChartPeriod.textContent = report.periodLabel;
    setMetrics(report.metrics || {}, report.platform);
    renderLegend(report.platform);
    renderEditableList('takeawayList', report.keyTakeaways || []);
    renderEditableList('actionPlanList', report.actionPlan || []);

    if (report.logoDataUrl) {
      reportLogoImage.src = report.logoDataUrl;
      reportLogoImage.classList.remove('hidden');
      reportLogoFallback.classList.add('hidden');
    } else {
      reportLogoImage.classList.add('hidden');
      reportLogoFallback.classList.remove('hidden');
    }

    document.getElementById('deleteReportBtn').style.display = state.canEdit ? 'block' : 'none';

    const labels = (report.dailyPoints || []).map((point) => point.label);
    const datasets = getMetricConfigs(report.platform).map((metric) => ({
      key: metric.key,
      color: metric.color,
      values: (report.dailyPoints || []).map((point) => point[metric.key] || 0),
    }));
    chart.setData(labels, datasets);
    requestAnimationFrame(() => chart.resize());
    renderReportCards();
  }

  async function selectReport(reportId) {
    const data = await requestJson(`/api/reports/${reportId}?token=${encodeURIComponent(reportSession.token)}`);
    state.selectedReport = data.report;
    localStorage.setItem('orbitSelectedReportId', reportId);
    renderSelectedReport();
  }

  async function loadReports() {
    const data = await requestJson(`/api/reports?token=${encodeURIComponent(reportSession.token)}`);
    state.reports = data.reports || [];
    renderReportCards();

    const preferredId = preferredReportId || localStorage.getItem('orbitSelectedReportId');
    const first = state.reports.find((report) => report.id === preferredId) || state.reports[0];
    if (first) {
      await selectReport(first.id);
    }
  }

  async function saveReportEdits() {
    if (!state.selectedReport) return;
    const updated = await requestJson(`/api/reports/${state.selectedReport.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        token: reportSession.token,
        keyTakeaways: readEditableList('takeawayList'),
        actionPlan: readEditableList('actionPlanList'),
      }),
    });
    state.selectedReport = updated.report;
    state.reports = state.reports.map((report) => report.id === updated.report.id ? updated.report : report);
    renderSelectedReport();
  }

  async function saveToDashboard() {
    if (!state.selectedReport) return;
    const takeaways = readEditableList('takeawayList');
    const actionPlan = readEditableList('actionPlanList');
    const feedbackText = `Key Takeaways:\n${takeaways.map(t => `• ${t}`).join('\n')}\n\nAction Plan:\n${actionPlan.map(a => `• ${a}`).join('\n')}`;
    await requestJson(`/api/datasets/${state.selectedReport.datasetId}/feedback`, {
      method: 'PUT',
      body: JSON.stringify({
        token: reportSession.token,
        text: feedbackText,
      }),
    });
    alert('Saved to dashboard.');
  }

  document.getElementById('saveTakeawaysBtn')?.addEventListener('click', saveReportEdits);
  document.getElementById('saveActionPlanBtn')?.addEventListener('click', saveReportEdits);
  document.getElementById('saveToDashboardBtn')?.addEventListener('click', saveToDashboard);
  document.getElementById('addTakeawayBtn')?.addEventListener('click', () => appendEditableListRow('takeawayList'));
  document.getElementById('addActionPlanBtn')?.addEventListener('click', () => appendEditableListRow('actionPlanList'));
  document.getElementById('backToReportsBtn')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('deleteReportBtn')?.addEventListener('click', async () => {
    if (!state.selectedReport) return;
    await requestJson(`/api/reports/${state.selectedReport.id}?token=${encodeURIComponent(reportSession.token)}`, {
      method: 'DELETE',
    });
    state.reports = state.reports.filter((report) => report.id !== state.selectedReport.id);
    state.selectedReport = null;
    localStorage.removeItem('orbitSelectedReportId');
    renderReportCards();
    renderSelectedReport();
  });

  document.getElementById('reportSignoutBtn')?.addEventListener('click', async () => {
    await signout();
    window.location.href = '/signin.html';
  });

  window.addEventListener('resize', () => chart.resize());
  chart.resize();
  loadReports();
}
