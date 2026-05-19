class OrbitChart {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.ctx = canvas.getContext('2d');
    this.colors = {
      reach: '#74beff',
      interactions: '#65dfb2',
      clicks: '#ffb05b',
      reactions: '#f084c6',
      views: '#b79aff',
      follows: '#ffe06d',
      visits: '#65dfb2',
      viewers: '#ffe06d',
      impressions: '#74beff',
      unique: '#65dfb2',
      comments: '#b79aff',
      reports: '#ffe06d',
      engagement: '#6fc1ff',
      engagementRate: '#6fc1ff',
    };
    this.datasets = [];
    this.points = [];
    this.labels = [];
    this.handleMove = this.handleMove.bind(this);
    this.handleLeave = this.handleLeave.bind(this);
    canvas.addEventListener('mousemove', this.handleMove);
    canvas.addEventListener('mouseleave', this.handleLeave);
  }

  setData(labels, datasets) {
    this.labels = labels || [];
    this.datasets = datasets || [];
    this.render();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(300, Math.floor(rect.width * window.devicePixelRatio));
    this.canvas.height = Math.max(220, Math.floor(rect.height * window.devicePixelRatio));
    this.render();
  }

  getMetricLabel(key) {
    const labels = {
      reach: 'Reach',
      interactions: 'Interactions',
      clicks: 'Clicks',
      reactions: 'Reactions',
      views: 'Views',
      follows: 'Follows',
      visits: 'Visits',
      viewers: 'Viewers',
      impressions: 'Impressions',
      unique: 'Unique',
      comments: 'Comments',
      reports: 'RePosts',
      engagement: 'Engagement',
      engagementRate: 'Engagement Rate',
    };
    return labels[key] || key;
  }

  render() {
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 24 * dpr, right: 22 * dpr, bottom: 44 * dpr, left: 48 * dpr };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const dataSeries = this.datasets.filter((dataset) => dataset.visible !== false);
    const maxValue = Math.max(1, ...dataSeries.flatMap((dataset) => dataset.values.map((value) => Number(value || 0))));
    const gridCount = 4;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1 * dpr;
    ctx.font = `${12 * dpr}px "Consolas", monospace`;
    ctx.fillStyle = 'rgba(201, 209, 235, 0.55)';

    for (let i = 0; i <= gridCount; i += 1) {
      const y = padding.top + (chartHeight / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      const value = ((maxValue / gridCount) * (gridCount - i));
      ctx.fillText(`${Math.round(value).toLocaleString()}`, 8 * dpr, y + 4 * dpr);
    }

    const stepX = this.labels.length > 1 ? chartWidth / (this.labels.length - 1) : chartWidth;
    this.points = [];

    dataSeries.forEach((dataset) => {
      const color = dataset.color || this.colors[dataset.key] || '#74beff';
      const points = dataset.values.map((rawValue, index) => {
        const value = Number(rawValue || 0);
        const x = padding.left + stepX * index;
        const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
        return { x, y, value, label: this.labels[index], key: dataset.key, name: this.getMetricLabel(dataset.key), color };
      });

      this.points.push(...points);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 * dpr;
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          const prev = points[index - 1];
          const cpX = (prev.x + point.x) / 2;
          ctx.bezierCurveTo(cpX, prev.y, cpX, point.y, point.x, point.y);
        }
      });
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(201, 209, 235, 0.6)';
    const labelIndexes = [];
    const maxVisibleLabels = Math.max(2, Math.floor(chartWidth / (72 * dpr)));
    const labelStep = Math.max(1, Math.ceil(this.labels.length / maxVisibleLabels));
    for (let index = 0; index < this.labels.length; index += labelStep) {
      labelIndexes.push(index);
    }
    if (this.labels.length > 1 && labelIndexes[labelIndexes.length - 1] !== this.labels.length - 1) {
      labelIndexes.push(this.labels.length - 1);
    }
    labelIndexes.forEach((index) => {
      const x = padding.left + stepX * index;
      ctx.fillText(this.labels[index], x - 14 * dpr, height - 12 * dpr);
    });
  }

  handleMove(event) {
    if (!this.points.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const ratioX = this.canvas.width / rect.width;
    const ratioY = this.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * ratioX;
    const y = (event.clientY - rect.top) * ratioY;
    let nearest = null;
    let nearestDistance = Infinity;

    this.points.forEach((point) => {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    });

    if (!nearest || nearestDistance > 28 * (window.devicePixelRatio || 1)) {
      this.handleLeave();
      return;
    }

    this.tooltip.innerHTML = `
      <div class="chart-tooltip-label">${nearest.label.toUpperCase()}</div>
      <div class="chart-tooltip-row">
        <span class="chart-dot" style="background:${nearest.color}"></span>
        <span>${nearest.name}</span>
        <strong>${Number(nearest.value).toLocaleString()}</strong>
      </div>
    `;
    this.tooltip.style.opacity = '1';
    this.tooltip.style.left = `${event.clientX - rect.left + 16}px`;
    this.tooltip.style.top = `${event.clientY - rect.top - 16}px`;
  }

  handleLeave() {
    this.tooltip.style.opacity = '0';
  }
}

window.OrbitChart = OrbitChart;
