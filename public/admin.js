const adminSession = requireSession('admin');

if (adminSession) {
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
      { key: 'reports', label: 'REPOST', color: '#ffe06d' },
      { key: 'engagement', label: 'Engagement', color: '#6fc1ff' },
      { key: 'engagementRate', label: 'Avg Engagement', color: '#91e7ff' },
    ],
  };

  const metricAccentClasses = ['accent-cyan', 'accent-violet', 'accent-orange', 'accent-pink', 'accent-green', 'accent-yellow', 'accent-blue'];
  const platformOrder = ['Instagram', 'Facebook', 'LinkedIn'];

  function getMetricConfigs(platform) {
    return platformMetricConfigs[platform] || platformMetricConfigs.Instagram;
  }

  function defaultPlatform(datasets) {
    return datasetForPlatform(datasets, 'Instagram')?.platform
      || platformOrder.find((platform) => datasetForPlatform(datasets, platform))
      || 'Instagram';
  }

  function selectedPlatformFor(datasets) {
    return platformOrder.includes(state.selectedPlatform)
      ? state.selectedPlatform
      : defaultPlatform(datasets);
  }

  function datasetForPlatform(datasets, platform) {
    return (datasets || []).find((dataset) => dataset.platform === platform) || null;
  }

  function engagementValue(metrics, platform) {
    const data = metrics || {};
    if (platform === 'Facebook') {
      return Number(data.clicks || 0) + Number(data.interactions || 0);
    }
    if (platform === 'LinkedIn') {
      return Number(data.clicks || 0) + Number(data.reactions || 0) + Number(data.comments || 0) + Number(data.reports || 0);
    }
    const interactions = Number(data.interactions || 0);
    return interactions > 0 ? Number(((Number(data.reach || 0) / interactions) * 100).toFixed(2)) : 0;
  }

  const state = {
    clients: [],
    selectedClient: null,
    selectedReportId: '',
    activeTab: 'dashboard',
    dashboardChart: null,
    reportChart: null,
  };

  const clientsList = document.getElementById('clientsList');
  const adminClientDetail = document.getElementById('adminClientDetail');
  const adminClientCount = document.getElementById('adminClientCount');
  const addUserModal = document.getElementById('addUserModal');

  document.getElementById('adminName').textContent = `${adminSession.user.firstName} ${adminSession.user.lastName}`;
  document.getElementById('adminMeta').textContent = 'Upload, edit, and publish client dashboards';

  function parseNumber(value) {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function readCsv(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read the selected CSV file.'));
      reader.readAsText(file);
    });
  }

  function splitCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values.map((value) => value.trim());
  }

  function toIsoDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
    const match = String(value).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (!match) return '';
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  }

  function displayDateLabel(isoDate, index) {
    if (!isoDate) return `Day ${index + 1}`;
    return `Day ${new Date(isoDate).getDate()}`;
  }

  function endOfMonth(isoDate) {
    const date = new Date(isoDate);
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function detectColumn(headers, patterns) {
    return headers.find((header) => patterns.some((pattern) => header.includes(pattern))) || null;
  }

  function parseCsvDataset(csvText, fileName, platform) {
    const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      throw new Error('The CSV must include a header row and at least one data row.');
    }

    const rawHeaders = splitCsvLine(lines[0]);
    const headers = rawHeaders.map((header) => header.toLowerCase());

    let indexes = {};
    let metricKeys = [];

    if (platform === 'Instagram') {
      indexes = {
        date: headers.findIndex((header) => ['date', 'day', 'posted date', 'post date'].includes(header) || header.includes('date')),
        reach: headers.indexOf(detectColumn(headers, ['reach', 'impression'])),
        interactions: headers.indexOf(detectColumn(headers, ['interaction', 'engagement'])),
        clicks: headers.indexOf(detectColumn(headers, ['click'])),
        reactions: headers.indexOf(detectColumn(headers, ['reaction', 'like'])),
        views: headers.indexOf(detectColumn(headers, ['view', 'video view'])),
        follows: headers.indexOf(detectColumn(headers, ['follow', 'follower'])),
      };
      metricKeys = ['reach', 'interactions', 'clicks', 'reactions', 'views', 'follows'];
    } else if (platform === 'Facebook') {
      indexes = {
        date: headers.findIndex((header) => ['date', 'day', 'posted date', 'post date'].includes(header) || header.includes('date')),
        follows: headers.indexOf(detectColumn(headers, ['follow', 'follower'])),
        visits: headers.indexOf(detectColumn(headers, ['visit'])),
        clicks: headers.indexOf(detectColumn(headers, ['click'])),
        interactions: headers.indexOf(detectColumn(headers, ['interaction', 'engagement'])),
        views: headers.indexOf(detectColumn(headers, ['view', 'video view'])),
        viewers: headers.indexOf(detectColumn(headers, ['viewer'])),
      };
      metricKeys = ['follows', 'visits', 'clicks', 'interactions', 'views', 'viewers'];
    } else if (platform === 'LinkedIn') {
      indexes = {
        date: headers.findIndex((header) => ['date', 'day', 'posted date', 'post date'].includes(header) || header.includes('date')),
        impressions: headers.indexOf(detectColumn(headers, ['impression'])),
        unique: headers.indexOf(detectColumn(headers, ['unique'])),
        clicks: headers.indexOf(detectColumn(headers, ['click'])),
        reactions: headers.indexOf(detectColumn(headers, ['reaction', 'like'])),
        comments: headers.indexOf(detectColumn(headers, ['comment'])),
        reports: headers.indexOf(detectColumn(headers, ['report'])),
        engagement: headers.indexOf(detectColumn(headers, ['engagement'])),
      };
      metricKeys = ['impressions', 'unique', 'clicks', 'reactions', 'comments', 'reports', 'engagement'];
    }

    // Check required columns
    const required = platform === 'Instagram' ? ['reach', 'interactions'] :
                     platform === 'Facebook' ? ['follows', 'visits'] :
                     ['impressions', 'unique'];
    if (required.some(key => indexes[key] < 0)) {
      throw new Error(`The CSV needs at least ${required.join(' and ')} columns for ${platform}.`);
    }

    const grouped = new Map();
    lines.slice(1).forEach((line, rowIndex) => {
      const cols = splitCsvLine(line);
      const isoDate = indexes.date >= 0 ? toIsoDate(cols[indexes.date]) : '';
      const key = isoDate || `row-${rowIndex + 1}`;
      const current = grouped.get(key) || {
        isoDate,
        ...Object.fromEntries(metricKeys.map(key => [key, 0])),
      };

      metricKeys.forEach(key => {
        current[key] += indexes[key] >= 0 ? parseNumber(cols[indexes[key]]) : 0;
      });
      grouped.set(key, current);
    });

    const sortedPoints = Array.from(grouped.values()).sort((a, b) => {
      if (!a.isoDate || !b.isoDate) return 0;
      return a.isoDate.localeCompare(b.isoDate);
    });

    let dailyPoints = sortedPoints.map((point, index) => ({
      label: displayDateLabel(point.isoDate, index),
      date: point.isoDate,
      ...Object.fromEntries(metricKeys.map(key => [key, point[key]])),
      engagementRate: engagementValue(point, platform),
    }));

    if (sortedPoints.length && sortedPoints[0].isoDate) {
      const firstDateParts = sortedPoints[0].isoDate.split('-');
      const year = firstDateParts[0];
      const month = firstDateParts[1];
      const keyed = new Map(sortedPoints.map((point) => [point.isoDate, point]));

      dailyPoints = Array.from({ length: 31 }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;
        const point = keyed.get(isoDate) || {
          isoDate,
          ...Object.fromEntries(metricKeys.map(key => [key, 0])),
        };

        return {
          label: `Day ${index + 1}`,
          date: point.isoDate,
          ...Object.fromEntries(metricKeys.map(key => [key, point[key]])),
          engagementRate: engagementValue(point, platform),
        };
      });
    } else if (dailyPoints.length < 31) {
      const existing = [...dailyPoints];
      dailyPoints = Array.from({ length: 31 }, (_, index) => existing[index] || {
        label: `Day ${index + 1}`,
        date: '',
        ...Object.fromEntries(metricKeys.map(key => [key, 0])),
        engagementRate: 0,
      });
    }

    const metrics = dailyPoints.reduce((acc, point) => {
      metricKeys.forEach(key => acc[key] += point[key]);
      return acc;
    }, Object.fromEntries(metricKeys.map(key => [key, 0])));

    metrics.engagementRate = engagementValue(metrics, platform);

    const firstDate = dailyPoints.find((point) => point.date)?.date || '';
    const lastDate = [...dailyPoints].reverse().find((point) => point.date)?.date || firstDate;

    return {
      title: 'Dashboard Overview',
      platform,
      csvName: fileName,
      periodStart: firstDate,
      periodEnd: lastDate,
      periodLabel: firstDate
        ? `${new Date(firstDate).toLocaleString('en-US', { month: 'long', year: 'numeric' })} - ${metricKeys.length + 1} metrics`
        : `Uploaded dataset - ${metricKeys.length + 1} metrics`,
      metrics,
      dailyPoints,
      notes: '',
      rawRowCount: lines.length - 1,
    };
  }

  function formatFeedbackText(value) {
    return String(value || '')
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  function selectedReport() {
    return state.selectedClient?.reports?.find((report) => report.id === state.selectedReportId) || state.selectedClient?.reports?.[0] || null;
  }

  function calculateEngagementRate(metrics, platform) {
    return engagementValue(metrics, platform);
  }

  function renderLegend(containerId, platform) {
    const legend = document.getElementById(containerId);
    if (!legend) return;
    legend.innerHTML = getMetricConfigs(platform).map((metric) => `
      <div class="legend-chip active">
        <span class="legend-dot" style="background:${metric.color}"></span>${metric.label}
      </div>
    `).join('');
  }

  function chartLabels(points) {
    return (points || []).map((point) => point.label);
  }

  function chartDatasets(points, platform) {
    return getMetricConfigs(platform).map((metric) => ({
      key: metric.key,
      color: metric.color,
      values: (points || []).map((point) => Number(point[metric.key] || 0)),
    }));
  }

  function renderClients() {
    clientsList.innerHTML = '';
    adminClientCount.textContent = `${state.clients.length} client account${state.clients.length === 1 ? '' : 's'}`;

    if (!state.clients.length) {
      clientsList.innerHTML = '<li class="saved-item empty">No client accounts yet.</li>';
      return;
    }

    state.clients.forEach((client) => {
      const activeClass = state.selectedClient?.client?.id === client.id ? ' is-selected' : '';
      const item = document.createElement('li');
      item.className = 'saved-item admin-client-item';
      item.innerHTML = `
        <button class="admin-client-button${activeClass}" type="button" data-client-id="${client.id}">
          <span class="admin-client-name">${client.firstName} ${client.lastName}</span>
          <span class="admin-client-meta">${client.datasetCount} uploads - ${client.reportCount} reports - ${client.dashboardAccessMode === 'admin_view' ? 'Admin View' : 'Viewing'}</span>
        </button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        loadClientDetail(client.id).catch((error) => {
          adminClientDetail.innerHTML = `<div class="admin-placeholder"><h2>Unable to load client</h2><p>${error.message}</p></div>`;
        });
      });
      clientsList.appendChild(item);
    });
  }

  function metricInputsMarkup(metrics, platform) {
    const configs = getMetricConfigs(platform);
    return `
      <div class="metric-grid metric-grid-report admin-metric-grid">
        ${configs.map((metric, index) => `
          <article class="metric-card ${metricAccentClasses[index % metricAccentClasses.length]} admin-edit-card">
            <span>${metric.label}</span>
            <input
              class="metric-edit-input"
              data-metric-key="${metric.key}"
              ${metric.key === 'engagementRate' ? 'readonly' : ''}
              value="${metric.key === 'engagementRate' ? Number(metrics[metric.key] || 0).toFixed(2) : Number(metrics[metric.key] || 0)}"
            />
            ${metric.key === 'engagementRate' ? '<small>Recalculated from this platform formula</small>' : ''}
          </article>
        `).join('')}
      </div>
    `;
  }

  function listToRows(values) {
    const entries = values.length ? values : [''];
    return entries.map((value, index) => `
      <label class="ordered-note-row">
        <span class="ordered-index">${index + 1}</span>
        <div class="ordered-card">
          <textarea class="ordered-input">${value}</textarea>
          <button class="delete-point-btn" type="button" aria-label="Delete point">🗑️</button>
        </div>
      </label>
    `).join('');
  }

  function appendOrderedNoteRow(containerId, value = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const nextIndex = container.querySelectorAll('.ordered-note-row').length + 1;
    const row = document.createElement('label');
    row.className = 'ordered-note-row';
    row.innerHTML = `
      <span class="ordered-index">${nextIndex}</span>
      <div class="ordered-card">
        <textarea class="ordered-input">${value}</textarea>
        <button class="delete-point-btn" type="button" aria-label="Delete point">🗑️</button>
      </div>
    `;
    container.appendChild(row);
    attachDeleteHandlers(containerId);
  }

  function reindexOrderedRows(containerId) {
    document.querySelectorAll(`#${containerId} .ordered-note-row`).forEach((row, index) => {
      const badge = row.querySelector('.ordered-index');
      if (badge) badge.textContent = index + 1;
    });
  }

  function attachDeleteHandlers(containerId) {
    document.querySelectorAll(`#${containerId} .delete-point-btn`).forEach((button) => {
      button.onclick = () => {
        button.closest('.ordered-note-row')?.remove();
        reindexOrderedRows(containerId);
      };
    });
  }

  function toDailyPointsText(points, platform) {
    const metricKeys = getMetricConfigs(platform).filter((metric) => metric.key !== 'engagementRate').map((metric) => metric.key);
    const lines = [['label', 'date', ...metricKeys].join(',')];
    (points || []).forEach((point) => {
      lines.push([
        point.label || '',
        point.date || '',
        ...metricKeys.map((key) => Number(point[key] || 0)),
      ].join(','));
    });
    return lines.join('\n');
  }

  function emptyDailyPointsText(platform) {
    const metricKeys = getMetricConfigs(platform).filter((metric) => metric.key !== 'engagementRate').map((metric) => metric.key);
    return [['label', 'date', ...metricKeys].join(','), ['Total', '', ...metricKeys.map(() => 0)].join(',')].join('\n');
  }

  function parseDailyPointsText(text, platform) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return [];
    }

    const metricKeys = getMetricConfigs(platform).filter((metric) => metric.key !== 'engagementRate').map((metric) => metric.key);
    return lines.slice(1).map((line, index) => {
      const parts = line.split(',').map((part) => part.trim());
      const point = {
        label: parts[0] || `Day ${index + 1}`,
        date: parts[1] || '',
      };
      metricKeys.forEach((key, keyIndex) => {
        point[key] = parseNumber(parts[keyIndex + 2]);
      });
      point.engagementRate = calculateEngagementRate(point, platform);
      return point;
    });
  }

  function buildMetricsFromInputs(platform) {
    const metrics = {};
    document.querySelectorAll('.metric-edit-input[data-metric-key]').forEach((input) => {
      metrics[input.dataset.metricKey] = parseNumber(input.value);
    });
    metrics.engagementRate = calculateEngagementRate(metrics, platform);
    const engagementInput = document.querySelector('.metric-edit-input[data-metric-key="engagementRate"]');
    if (engagementInput) {
      engagementInput.value = metrics.engagementRate.toFixed(2);
    }
    return metrics;
  }

  function buildMetricsFromPoints(points, platform) {
    const metricKeys = getMetricConfigs(platform).filter((metric) => metric.key !== 'engagementRate').map((metric) => metric.key);
    const metrics = points.reduce((acc, point) => {
      metricKeys.forEach((key) => {
        acc[key] += Number(point[key] || 0);
      });
      return acc;
    }, Object.fromEntries(metricKeys.map((key) => [key, 0])));

    metrics.engagementRate = calculateEngagementRate(metrics, platform);
    return metrics;
  }

  function pointFromMetrics(metrics, platform) {
    const metricKeys = getMetricConfigs(platform).filter((metric) => metric.key !== 'engagementRate').map((metric) => metric.key);
    const point = {
      label: 'Total',
      date: '',
    };
    metricKeys.forEach((key) => {
      point[key] = Number(metrics[key] || 0);
    });
    point.engagementRate = calculateEngagementRate(point, platform);
    return [point];
  }

  function pointsHaveMetricValues(points, platform) {
    const metricKeys = getMetricConfigs(platform).filter((metric) => metric.key !== 'engagementRate').map((metric) => metric.key);
    return (points || []).some((point) => metricKeys.some((key) => Number(point[key] || 0) !== 0));
  }

  function formatMetricValue(metrics, key, platform) {
    return key === 'engagementRate' && platform === 'Instagram'
      ? `${Number(metrics[key] || 0).toFixed(2)}%`
      : Number(metrics[key] || 0).toLocaleString();
  }

  function buildManualFeedback(metrics, platform) {
    const configs = getMetricConfigs(platform).filter((metric) => metric.key !== 'engagementRate');
    const first = configs[0];
    const second = configs[1] || configs[0];
    const clicks = Number(metrics.clicks || 0).toLocaleString();
    const engagement = formatMetricValue(metrics, 'engagementRate', platform);
    const topMetrics = configs
      .slice(0, 4)
      .map((metric) => `${metric.label.toLowerCase()} at ${Number(metrics[metric.key] || 0).toLocaleString()}`)
      .join(', ');

    return [
      `- The ${platform} dashboard currently shows ${first.label.toLowerCase()} at ${Number(metrics[first.key] || 0).toLocaleString()} and ${second.label.toLowerCase()} at ${Number(metrics[second.key] || 0).toLocaleString()}.`,
      `- The key supporting metrics are ${topMetrics || 'ready for review once values are added'}.`,
      `- Click activity is ${clicks}, so the next review should focus on what content is creating action from the audience.`,
      `- Average engagement is ${engagement}, which gives the client a baseline to compare against the next upload or reporting period.`,
      `- Next action: repeat the strongest content themes, improve calls to action, and review the dates or posts behind the highest metric movement.`,
    ].join('\n');
  }

  function updateMetricInputs(metrics) {
    document.querySelectorAll('.metric-edit-input[data-metric-key]').forEach((input) => {
      const key = input.dataset.metricKey;
      input.value = key === 'engagementRate'
        ? Number(metrics[key] || 0).toFixed(2)
        : Number(metrics[key] || 0);
    });
  }

  function renderDashboardTab(detail) {
    const datasets = detail.datasets || [];
    const selectedPlatform = selectedPlatformFor(datasets);
    const dataset = datasetForPlatform(datasets, selectedPlatform);

    const platformSelector = platformOrder.map((platform) => {
      return `
      <button class="legend-chip${platform === selectedPlatform ? ' active' : ''}" type="button" data-platform="${platform}">
        ${platform}
      </button>
    `;
    }).join('');

    return `
      <div class="admin-detail-stack">
        <div class="platform-selector-row">
          ${platformSelector}
        </div>

        <div class="inline-status" id="adminUploadStatus"></div>
        <div class="admin-drop-zone" id="adminCsvDropZone" role="button" tabindex="0">
          <strong>Drop CSV files here</strong>
          <span>Use 1 to 3 files: Instagram, Facebook, and LinkedIn.</span>
        </div>

        ${dataset ? metricInputsMarkup(dataset.metrics || {}, dataset.platform) : metricInputsMarkup({}, selectedPlatform)}

        <section class="chart-panel">
          <div class="chart-meta">
            <div class="chart-title-block">
              <div class="chart-period">${dataset ? dataset.periodLabel : `${selectedPlatform} Manual Dashboard`}</div>
            </div>
            <div class="legend-row" id="adminDashboardLegend"></div>
          </div>
          <div class="chart-frame">
            <canvas id="adminDashboardChart"></canvas>
            <div class="chart-tooltip" id="adminDashboardTooltip"></div>
          </div>
        </section>

        ${dataset ? `
        <article class="sub-panel admin-inner-panel">
          <div class="sub-panel-head">
            <div>
              <h2>Chart Data</h2>
              <p>Edit the daily values below to update the same dashboard data the client sees.</p>
            </div>
            <button class="ghost-btn small" id="adminApplyChartDataBtn" type="button">Apply to Metrics</button>
          </div>
          <textarea id="adminDailyPointsInput" class="dark-textarea admin-chartdata-input">${toDailyPointsText(dataset.dailyPoints || [], dataset.platform)}</textarea>
        </article>

        <article class="sub-panel admin-inner-panel">
          <div class="sub-panel-head">
            <div>
              <h2>Feedback</h2>
              <p>Edit the client feedback for this platform dashboard.</p>
            </div>
            <button class="ghost-btn small" id="adminGenerateFeedbackBtn" type="button">Generate</button>
          </div>
          <textarea id="adminFeedbackInput" class="dark-textarea admin-feedback-input">${formatFeedbackText(dataset.aiFeedbackEditedText || dataset.aiFeedbackText || '')}</textarea>

        </article>
        ` : `
        <article class="sub-panel admin-inner-panel">
          <div class="sub-panel-head">
            <div>
              <h2>Chart Data</h2>
              <p>Add optional daily values for the ${selectedPlatform} graph, or leave the total row as-is.</p>
            </div>
            <button class="ghost-btn small" id="adminApplyChartDataBtn" type="button">Apply to Metrics</button>
          </div>
          <textarea id="adminDailyPointsInput" class="dark-textarea admin-chartdata-input">${emptyDailyPointsText(selectedPlatform)}</textarea>
        </article>

        <article class="sub-panel admin-inner-panel">
          <div class="sub-panel-head">
            <div>
              <h2>Feedback</h2>
              <p>Edit the client feedback for this platform dashboard.</p>
            </div>
          </div>
          <textarea id="adminFeedbackInput" class="dark-textarea admin-feedback-input" placeholder="Write feedback and next actions for the client."></textarea>
        </article>
        `}

        <div class="admin-actions-row">
          <div class="inline-status" id="adminEditorStatus"></div>
          ${dataset ? '<button class="ghost-btn small danger-btn" id="adminDeleteDashboardBtn" type="button">Delete Dashboard Data</button>' : ''}
          <button class="primary-btn small" id="adminSaveDashboardBtn" type="button">Save Dashboard Data</button>
        </div>
      </div>
    `;
  }

  function renderReportTab(detail) {
    const reports = detail.reports || [];
    const report = selectedReport();

    if (!reports.length) {
      return `
        <div class="admin-placeholder">
          <h2>No saved reports yet</h2>
          <p>This client has not generated a report yet.</p>
        </div>
      `;
    }

    return `
      <div class="admin-detail-stack">
        <div class="report-selector-row">
          ${reports.map((item) => `
            <button class="legend-chip${item.id === report.id ? ' active' : ''}" type="button" data-report-id="${item.id}">
              ${item.platform}
            </button>
          `).join('')}
        </div>

        <div class="metric-grid metric-grid-report admin-metric-grid">
          ${getMetricConfigs(report.platform).map((metric, index) => `
            <article class="metric-card ${metricAccentClasses[index % metricAccentClasses.length]}">
              <span>${metric.label}</span>
              <strong>${metric.key === 'engagementRate' && report.platform === 'Instagram' ? `${Number(report.metrics?.[metric.key] || 0).toFixed(2)}%` : shortNumber(report.metrics?.[metric.key] || 0)}</strong>
            </article>
          `).join('')}
        </div>

        <section class="chart-panel">
          <div class="chart-meta">
            <div class="chart-title-block">
              <div class="chart-period">${report.periodLabel}</div>
            </div>
            <div class="legend-row" id="adminReportLegend"></div>
          </div>
          <div class="chart-frame">
            <canvas id="adminReportChart"></canvas>
            <div class="chart-tooltip" id="adminReportTooltip"></div>
          </div>
        </section>

        <article class="sub-panel admin-inner-panel">
          <div class="sub-panel-head">
            <div>
              <h2>Key Takeaways</h2>
              <p>Admin can edit the saved client report.</p>
            </div>
            <button class="ghost-btn small" id="adminAddTakeawayBtn" type="button">Add Point</button>
          </div>
          <div id="adminTakeawayList" class="ordered-note-list">${listToRows(report.keyTakeaways || [])}</div>
        </article>

        <article class="sub-panel admin-inner-panel">
          <div class="sub-panel-head">
            <div>
              <h2>Action Plan</h2>
              <p>Changes save back to the client report.</p>
            </div>
            <div class="mini-actions">
              <button class="ghost-btn small" id="adminAddActionPlanBtn" type="button">Add Point</button>
              <button class="ghost-btn small" id="adminSaveReportBtn" type="button">Save Report</button>
            </div>
          </div>
          <div id="adminActionPlanList" class="ordered-note-list">${listToRows(report.actionPlan || [])}</div>
        </article>
      </div>
    `;
  }

  function mountDashboardChart(detail) {
    const datasets = detail.datasets || [];
    const selectedPlatform = selectedPlatformFor(datasets);
    const dataset = datasetForPlatform(datasets, selectedPlatform);
    const canvas = document.getElementById('adminDashboardChart');
    const tooltip = document.getElementById('adminDashboardTooltip');
    if (!canvas || !tooltip) return;

    const platform = dataset?.platform || selectedPlatform;
    const metrics = dataset?.metrics || buildMetricsFromInputs(platform);
    const points = dataset?.dailyPoints?.length ? dataset.dailyPoints : pointFromMetrics(metrics, platform);
    state.dashboardChart = new OrbitChart(canvas, tooltip);
    state.dashboardChart.setData(chartLabels(points), chartDatasets(points, platform));
    requestAnimationFrame(() => state.dashboardChart.resize());
    renderLegend('adminDashboardLegend', platform);
  }

  function mountReportChart(report) {
    const canvas = document.getElementById('adminReportChart');
    const tooltip = document.getElementById('adminReportTooltip');
    if (!canvas || !tooltip || !report) return;

    state.reportChart = new OrbitChart(canvas, tooltip);
    state.reportChart.setData(chartLabels(report.dailyPoints || []), chartDatasets(report.dailyPoints || [], report.platform));
    requestAnimationFrame(() => state.reportChart.resize());
    renderLegend('adminReportLegend', report.platform);
  }

  function attachDashboardHandlers(detail) {
    const uploadStatus = document.getElementById('adminUploadStatus');
    const bulkUploadInput = document.getElementById('adminBulkCsvUploadInput');
    const bulkUploadButton = document.getElementById('adminUploadBulkCsvBtn');
    const dropZone = document.getElementById('adminCsvDropZone');

    bulkUploadButton?.addEventListener('click', () => bulkUploadInput?.click());
    dropZone?.addEventListener('click', () => bulkUploadInput?.click());
    dropZone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        bulkUploadInput?.click();
      }
    });

    async function uploadCsv(file, platform, reloadAfterUpload = true, csvText = null) {
      if (!file) return;
      uploadStatus.textContent = `Reading ${platform} CSV...`;
      try {
        const text = csvText ?? await readCsv(file);
        const parsed = parseCsvDataset(text, file.name, platform);
        const response = await requestJson(`/api/admin/clients/${encodeURIComponent(detail.client.id)}/datasets`, {
          method: 'POST',
          body: JSON.stringify({
            token: adminSession.token,
            platform,
            ...parsed,
          }),
        });
        uploadStatus.textContent = `${platform} CSV uploaded and shared to the client dashboard.`;
        if (reloadAfterUpload) {
          await loadClientDetail(detail.client.id, response.dataset.platform);
        }
        return response.dataset;
      } catch (error) {
        uploadStatus.textContent = error.message;
        if (!reloadAfterUpload) {
          throw error;
        }
      }
    }

    function inferPlatformFromFileName(fileName) {
      const normalized = String(fileName || '').toLowerCase();
      if (normalized.includes('instagram') || normalized.includes('insta') || normalized.includes('ig')) return 'Instagram';
      if (normalized.includes('facebook') || normalized.includes('fb')) return 'Facebook';
      if (normalized.includes('linkedin') || normalized.includes('linkedln')) return 'LinkedIn';
      return '';
    }

    function inferPlatformFromHeaders(csvText) {
      const headerLine = String(csvText || '').split(/\r?\n/).find(Boolean) || '';
      const headers = splitCsvLine(headerLine).map((header) => header.toLowerCase());
      const has = (patterns) => headers.some((header) => patterns.some((pattern) => header.includes(pattern)));
      if (has(['impression']) && has(['unique'])) return 'LinkedIn';
      if (has(['reach']) && has(['interaction', 'engagement'])) return 'Instagram';
      if (has(['visit']) && has(['follow', 'follower'])) return 'Facebook';
      return '';
    }

    async function processCsvFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;

      try {
        if (files.length > 3) {
          throw new Error('Choose only one CSV for Instagram, one for Facebook, and one for LinkedIn.');
        }
        const usedPlatforms = new Set();
        const uploadJobs = [];
        for (const file of files) {
          const text = await readCsv(file);
          const platform = inferPlatformFromFileName(file.name) || inferPlatformFromHeaders(text);
          if (!platform) {
            throw new Error(`Could not detect a platform from "${file.name}". Include Instagram, Facebook, or LinkedIn in the filename or CSV headers.`);
          }
          if (usedPlatforms.has(platform)) {
            throw new Error(`Two selected files look like ${platform}. Choose one CSV per platform.`);
          }
          usedPlatforms.add(platform);
          uploadJobs.push({ file, platform, text });
        }

        uploadStatus.textContent = `Uploading ${uploadJobs.length} platform CSV${uploadJobs.length === 1 ? '' : 's'}...`;
        let selectedAfterUpload = uploadJobs[0]?.platform || selectedPlatformFor(detail.datasets || []);
        for (const job of uploadJobs) {
          const uploadedDataset = await uploadCsv(job.file, job.platform, false, job.text);
          selectedAfterUpload = uploadedDataset?.platform || selectedAfterUpload;
        }
        uploadStatus.textContent = `${uploadJobs.map((job) => job.platform).join(', ')} CSV files uploaded and shared.`;
        await loadClientDetail(detail.client.id, selectedAfterUpload);
      } catch (error) {
        uploadStatus.textContent = error.message;
      }
    }

    bulkUploadInput?.addEventListener('change', async (event) => {
      try {
        await processCsvFiles(event.target.files);
      } finally {
        bulkUploadInput.value = '';
      }
    });

    dropZone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
      uploadStatus.textContent = 'Drop the CSV files to upload.';
    });

    dropZone?.addEventListener('dragleave', (event) => {
      if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove('is-dragging');
      }
    });

    dropZone?.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
      await processCsvFiles(event.dataTransfer?.files);
    });

    // Platform selector
    document.querySelectorAll('.platform-selector-row .legend-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const platform = chip.dataset.platform;
        state.selectedPlatform = platform;
        renderClientDetail();
      });
    });

    const datasets = detail.datasets || [];
    const selectedPlatform = selectedPlatformFor(datasets);
    const dataset = datasetForPlatform(datasets, selectedPlatform);
    const workingPlatform = dataset?.platform || selectedPlatform;

    const status = document.getElementById('adminEditorStatus');
    const chartDataInput = document.getElementById('adminDailyPointsInput');
    const applyChartDataBtn = document.getElementById('adminApplyChartDataBtn');
    const saveDashboardBtn = document.getElementById('adminSaveDashboardBtn');
    const deleteDashboardBtn = document.getElementById('adminDeleteDashboardBtn');
    const feedbackInput = document.getElementById('adminFeedbackInput');
    const generateFeedbackBtn = document.getElementById('adminGenerateFeedbackBtn');

    function syncManualPreview() {
      const metrics = buildMetricsFromInputs(workingPlatform);
      const points = pointFromMetrics(metrics, workingPlatform);
      if (chartDataInput) {
        chartDataInput.value = toDailyPointsText(points, workingPlatform);
      }
      state.dashboardChart?.setData(chartLabels(points), chartDatasets(points, workingPlatform));
      requestAnimationFrame(() => state.dashboardChart?.resize());
      if (feedbackInput && (!feedbackInput.value.trim() || feedbackInput.dataset.autoFeedback === 'true')) {
        feedbackInput.value = buildManualFeedback(metrics, workingPlatform);
        feedbackInput.dataset.autoFeedback = 'true';
      }
      status.textContent = 'Metric preview updated. Click Save Dashboard Data to publish it.';
    }

    generateFeedbackBtn?.addEventListener('click', async () => {
      if (!dataset?.id) return;
      try {
        status.textContent = 'Generating feedback with DeepSeek...';
        const response = await requestJson(`/api/admin/datasets/${dataset.id}/feedback/generate`, {
          method: 'POST',
          body: JSON.stringify({
            token: adminSession.token,
          }),
        });
        // Update the dataset in detail
        const index = detail.datasets.findIndex(d => d.id === dataset.id);
        if (index >= 0) {
          detail.datasets[index] = response.dataset;
        }
        feedbackInput.value = formatFeedbackText(response.dataset.aiFeedbackEditedText || response.dataset.aiFeedbackText || '');
        status.textContent = 'Feedback generated.';
      } catch (error) {
        status.textContent = error.message;
      }
    });

    applyChartDataBtn?.addEventListener('click', () => {
      const points = parseDailyPointsText(chartDataInput.value, workingPlatform);
      const metrics = buildMetricsFromPoints(points, workingPlatform);
      updateMetricInputs(metrics);
      if (dataset) {
        dataset.dailyPoints = points;
        dataset.metrics = metrics;
      }
      state.dashboardChart?.setData(chartLabels(points), chartDatasets(points, workingPlatform));
      requestAnimationFrame(() => state.dashboardChart?.resize());
      status.textContent = 'Chart data applied to the metric inputs.';
    });

    chartDataInput?.addEventListener('input', () => {
      const points = parseDailyPointsText(chartDataInput.value, workingPlatform);
      if (!points.length) return;
      const metrics = buildMetricsFromPoints(points, workingPlatform);
      updateMetricInputs(metrics);
      state.dashboardChart?.setData(chartLabels(points), chartDatasets(points, workingPlatform));
      requestAnimationFrame(() => state.dashboardChart?.resize());
      status.textContent = 'Chart preview updated from the daily values.';
    });

    document.querySelectorAll('.metric-edit-input').forEach((input) => {
      input.addEventListener('input', () => {
        syncManualPreview();
      });
    });

    saveDashboardBtn?.addEventListener('click', async () => {
      try {
        status.textContent = 'Saving dashboard data...';
        const parsedPoints = parseDailyPointsText(chartDataInput?.value || '', workingPlatform);
        const metrics = buildMetricsFromInputs(workingPlatform);
        const points = pointsHaveMetricValues(parsedPoints, workingPlatform) ? parsedPoints : pointFromMetrics(metrics, workingPlatform);
        const feedbackText = feedbackInput?.value.trim() || buildManualFeedback(metrics, workingPlatform);
        const payload = {
          token: adminSession.token,
          title: dataset?.title || 'Dashboard Overview',
          csvName: dataset?.csvName || '',
          platform: workingPlatform,
          periodLabel: dataset?.periodLabel || `${workingPlatform} Manual Dashboard`,
          periodStart: dataset?.periodStart || null,
          periodEnd: dataset?.periodEnd || null,
          notes: dataset?.notes || '',
          metrics,
          dailyPoints: points,
        };
        const response = dataset?.id
          ? await requestJson(`/api/admin/datasets/${dataset.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
          : await requestJson(`/api/admin/clients/${encodeURIComponent(detail.client.id)}/datasets`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });

        let savedDataset = response.dataset;
        if (savedDataset?.id && feedbackInput) {
          const feedbackResponse = await requestJson(`/api/admin/datasets/${savedDataset.id}/feedback`, {
            method: 'PUT',
            body: JSON.stringify({
              token: adminSession.token,
              text: feedbackText,
            }),
          });
          savedDataset = feedbackResponse.dataset;
        }

        const index = detail.datasets.findIndex(d => d.id === savedDataset.id);
        if (index >= 0) {
          detail.datasets[index] = savedDataset;
        } else {
          detail.datasets.push(savedDataset);
        }
        detail.reports = detail.reports.map((report) => report.datasetId === savedDataset.id
          ? { ...report, metrics: savedDataset.metrics, dailyPoints: savedDataset.dailyPoints }
          : report);
        state.selectedPlatform = savedDataset.platform;
        uploadStatus.textContent = 'Client dashboard updated.';
        status.textContent = 'Dashboard data saved.';
        renderClientDetail();
      } catch (error) {
        status.textContent = error.message;
      }
    });

    deleteDashboardBtn?.addEventListener('click', async () => {
      if (!dataset?.id) return;
      const confirmed = window.confirm(`Delete ${dataset.platform} dashboard data for this client? This also removes related reports and suggestions.`);
      if (!confirmed) return;

      try {
        status.textContent = 'Deleting dashboard data...';
        await requestJson(`/api/admin/datasets/${dataset.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ token: adminSession.token }),
        });
        detail.datasets = detail.datasets.filter((item) => item.id !== dataset.id);
        detail.reports = detail.reports.filter((report) => report.datasetId !== dataset.id);
        state.clients = state.clients.map((client) => client.id === detail.client.id
          ? {
            ...client,
            datasetCount: Math.max(0, Number(client.datasetCount || 0) - 1),
            reportCount: Math.max(0, Number(client.reportCount || 0) - 1),
          }
          : client);
        state.selectedPlatform = defaultPlatform(detail.datasets || []);
        uploadStatus.textContent = 'Dashboard data deleted.';
        renderClients();
        renderClientDetail();
      } catch (error) {
        status.textContent = error.message;
      }
    });

    feedbackInput?.addEventListener('input', () => {
      feedbackInput.dataset.autoFeedback = 'false';
      status.textContent = 'Feedback changes are ready to save with the dashboard data.';
    });

    feedbackInput?.addEventListener('blur', async () => {
      if (!dataset?.id) return;
      try {
        const response = await requestJson(`/api/admin/datasets/${dataset.id}/feedback`, {
          method: 'PUT',
          body: JSON.stringify({
            token: adminSession.token,
            text: feedbackInput.value.trim(),
          }),
        });
        const index = detail.datasets.findIndex(d => d.id === dataset.id);
        if (index >= 0) {
          detail.datasets[index] = response.dataset;
        }
        status.textContent = 'Feedback saved.';
      } catch (error) {
        status.textContent = error.message;
      }
    });
  }

  function attachReportHandlers(report) {
    const saveReportBtn = document.getElementById('adminSaveReportBtn');
    const addTakeawayBtn = document.getElementById('adminAddTakeawayBtn');
    const addActionPlanBtn = document.getElementById('adminAddActionPlanBtn');
    if (!saveReportBtn || !report) return;

    addTakeawayBtn?.addEventListener('click', () => appendOrderedNoteRow('adminTakeawayList'));
    addActionPlanBtn?.addEventListener('click', () => appendOrderedNoteRow('adminActionPlanList'));
    attachDeleteHandlers('adminTakeawayList');
    attachDeleteHandlers('adminActionPlanList');

    saveReportBtn.addEventListener('click', async () => {
      const takeaways = Array.from(document.querySelectorAll('#adminTakeawayList .ordered-input'))
        .map((input) => input.value.trim())
        .filter(Boolean);
      const actionPlan = Array.from(document.querySelectorAll('#adminActionPlanList .ordered-input'))
        .map((input) => input.value.trim())
        .filter(Boolean);

      const response = await requestJson(`/api/admin/reports/${report.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          token: adminSession.token,
          keyTakeaways: takeaways,
          actionPlan,
        }),
      });

      state.selectedClient.reports = state.selectedClient.reports.map((item) => item.id === response.report.id ? response.report : item);
      renderClientDetail();
    });
  }

  function renderClientDetail() {
    const detail = state.selectedClient;
    if (!detail) {
      adminClientDetail.innerHTML = `
        <div class="admin-placeholder">
          <h2>Select a client</h2>
          <p>Choose a name from the left to upload or edit the dashboard you want to share.</p>
        </div>
      `;
      return;
    }

    const report = selectedReport();
    adminClientDetail.innerHTML = `
      <div class="admin-detail-shell">
        <div class="sub-panel-head admin-detail-head">
          <div>
            <h2>${detail.client.firstName} ${detail.client.lastName}</h2>
            <p>${detail.client.email}</p>
          </div>
          <div class="chip-row admin-tab-row">
            <select id="clientAccessModeSelect" class="legend-chip" aria-label="Client access mode">
              <option value="viewing"${detail.client.dashboardAccessMode === 'viewing' ? ' selected' : ''}>Viewing</option>
              <option value="admin_view"${detail.client.dashboardAccessMode === 'admin_view' ? ' selected' : ''}>Admin View</option>
            </select>
            <input id="adminBulkCsvUploadInput" type="file" accept=".csv,text/csv" multiple hidden />
            <button class="primary-btn small" id="adminUploadBulkCsvBtn" type="button" title="Select the Instagram, Facebook, and LinkedIn CSV files together">Upload CSV</button>
            <button class="legend-chip${state.activeTab === 'dashboard' ? ' active' : ''}" type="button" data-admin-tab="dashboard">Dashboard</button>
            <button class="legend-chip${state.activeTab === 'reports' ? ' active' : ''}" type="button" data-admin-tab="reports">Reports</button>
          </div>
        </div>
        ${state.activeTab === 'dashboard' ? renderDashboardTab(detail) : renderReportTab(detail)}
      </div>
    `;

    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeTab = button.dataset.adminTab;
        renderClientDetail();
      });
    });

    document.getElementById('clientAccessModeSelect')?.addEventListener('change', async (event) => {
      const response = await requestJson(`/api/admin/clients/${encodeURIComponent(detail.client.id)}/access`, {
        method: 'PUT',
        body: JSON.stringify({
          token: adminSession.token,
          dashboardAccessMode: event.target.value,
        }),
      });
      state.selectedClient.client = response.client;
      state.clients = state.clients.map((client) => client.id === response.client.id ? { ...client, dashboardAccessMode: response.client.dashboardAccessMode } : client);
      renderClients();
    });

    if (state.activeTab === 'dashboard') {
      attachDashboardHandlers(detail);
      if (detail.datasets?.length) {
        mountDashboardChart(detail);
      }
    } else {
      document.querySelectorAll('[data-report-id]').forEach((button) => {
        button.addEventListener('click', () => {
          state.selectedReportId = button.dataset.reportId;
          renderClientDetail();
        });
      });
      attachReportHandlers(report);
      mountReportChart(report);
    }
  }

  async function loadClientDetail(clientId, preferredPlatform = '') {
    const previousClientId = state.selectedClient?.client?.id || '';
    const previousPlatform = state.selectedPlatform;
    const detail = await requestJson(`/api/admin/clients/${encodeURIComponent(clientId)}?token=${encodeURIComponent(adminSession.token)}`);
    state.selectedClient = detail;
    state.selectedReportId = detail.reports?.[0]?.id || '';
    if (platformOrder.includes(preferredPlatform)) {
      state.selectedPlatform = preferredPlatform;
    } else if (previousClientId === clientId && platformOrder.includes(previousPlatform)) {
      state.selectedPlatform = previousPlatform;
    } else {
      state.selectedPlatform = defaultPlatform(detail.datasets || []);
    }
    state.activeTab = 'dashboard';
    renderClients();
    renderClientDetail();
  }

  async function loadOverview() {
    const data = await requestJson(`/api/admin/overview?token=${encodeURIComponent(adminSession.token)}`);
    state.clients = data.clients || [];
    renderClients();

    if (state.clients.length) {
      await loadClientDetail(state.clients[0].id);
    }
  }

  document.getElementById('adminSignoutBtn')?.addEventListener('click', async () => {
    await signout();
    window.location.href = '/signin.html';
  });

  document.getElementById('openAddUserBtn')?.addEventListener('click', () => {
    addUserModal.classList.remove('hidden');
  });

  document.getElementById('closeAddUserBtn')?.addEventListener('click', () => {
    addUserModal.classList.add('hidden');
  });

  addUserModal?.addEventListener('click', (event) => {
    if (event.target === addUserModal) {
      addUserModal.classList.add('hidden');
    }
  });

  document.getElementById('submitAddUserBtn')?.addEventListener('click', async () => {
    const status = document.getElementById('addUserStatus');
    try {
      status.textContent = 'Creating user...';
      const response = await requestJson('/api/admin/clients', {
        method: 'POST',
        body: JSON.stringify({
          token: adminSession.token,
          firstName: document.getElementById('newClientFirstName').value.trim(),
          lastName: document.getElementById('newClientLastName').value.trim(),
          email: document.getElementById('newClientEmail').value.trim(),
        }),
      });

      state.clients.unshift({
        ...response.client,
        reportCount: 0,
        datasetCount: 0,
        latestActivityAt: null,
        latestPlatform: '',
        latestCsvName: '',
      });
      renderClients();
      status.textContent = 'Client user created. They can now finish signup with this email.';
      document.getElementById('newClientFirstName').value = '';
      document.getElementById('newClientLastName').value = '';
      document.getElementById('newClientEmail').value = '';
      addUserModal.classList.add('hidden');
    } catch (error) {
      status.textContent = error.message;
    }
  });

  loadOverview().catch((error) => {
    adminClientDetail.innerHTML = `<div class="admin-placeholder"><h2>Unable to load admin view</h2><p>${error.message}</p></div>`;
  });
}
