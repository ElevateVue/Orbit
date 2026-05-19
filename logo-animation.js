function drawOrbitLogo(canvas) {
  if (!canvas) return;

  const cssSize = Number(canvas.dataset.size || 220);
  const pixelSize = cssSize * 2;
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;

  const ctx = canvas.getContext('2d');
  const cx = pixelSize / 2;
  const cy = pixelSize / 2;
  const r = pixelSize * 0.4;
  const startAngle = (240 * Math.PI) / 180;
  const totalSweep = (240 * Math.PI) / 180;
  const duration = 1400;
  let startTime = null;

  function makeGradient(angle) {
    const ex = cx + r * Math.cos(startAngle - angle);
    const ey = cy + r * Math.sin(startAngle - angle);
    const grad = ctx.createLinearGradient(
      cx + r * Math.cos(startAngle),
      cy + r * Math.sin(startAngle),
      ex,
      ey,
    );
    grad.addColorStop(0, '#6b5ec7');
    grad.addColorStop(1, '#7be8f5');
    return grad;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function frame(ts) {
    if (!startTime) startTime = ts;
    const raw = Math.min((ts - startTime) / duration, 1);
    const progress = easeInOut(raw);
    const swept = totalSweep * progress;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e2a45';
    ctx.lineWidth = pixelSize * 0.012;
    ctx.stroke();

    if (swept > 0.01) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle - swept, startAngle, true);
      ctx.strokeStyle = makeGradient(swept);
      ctx.lineWidth = pixelSize * 0.032;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    const tx = cx + r * Math.cos(startAngle);
    const ty = cy + r * Math.sin(startAngle);
    ctx.beginPath();
    ctx.arc(tx, ty, pixelSize * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#5b4f9e';
    ctx.fill();

    const headAngle = startAngle - swept;
    const hx = cx + r * Math.cos(headAngle);
    const hy = cy + r * Math.sin(headAngle);
    const dotScale = raw < 0.05 ? raw / 0.05 : 1;
    ctx.beginPath();
    ctx.arc(hx, hy, pixelSize * 0.072 * dotScale, 0, Math.PI * 2);
    ctx.fillStyle = '#7be8f5';
    ctx.fill();

    if (raw < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

document.querySelectorAll('[data-orbit-logo]').forEach((canvas) => {
  drawOrbitLogo(canvas);
});
