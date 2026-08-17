(() => {
// =========================================================
// SmartPark — Minimal canvas charts (zero dependencies)
// =========================================================

function css(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function hiDPI(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawDonut(canvas, segments) {
  // segments: [{ label, value, color }]
  const { ctx, w, h } = hiDPI(canvas);
  ctx.clearRect(0, 0, w, h);

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 14;
  const thickness = radius * 0.38;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = css('--border-strong');
    ctx.lineWidth = thickness;
    ctx.stroke();
    ctx.fillStyle = css('--text-dim');
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data yet', cx, cy);
    return;
  }

  let start = -Math.PI / 2;
  segments.forEach((seg) => {
    if (seg.value <= 0) return;
    const angle = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'butt';
    ctx.stroke();
    start += angle;
  });

  ctx.fillStyle = css('--text');
  ctx.font = '600 22px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(total), cx, cy - 8);
  ctx.fillStyle = css('--text-dim');
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText('total sessions', cx, cy + 14);
}

function drawGauge(canvas, percent) {
  const { ctx, w, h } = hiDPI(canvas);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 + 20;
  const radius = Math.min(w, h * 1.6) / 2 - 20;
  const thickness = 20;
  const startAngle = Math.PI;
  const endAngle = Math.PI * 2;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = css('--border-strong');
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.stroke();

  const pct = Math.max(0, Math.min(100, percent));
  const sweep = (pct / 100) * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
  const grad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  grad.addColorStop(0, css('--teal'));
  grad.addColorStop(1, css('--accent'));
  ctx.strokeStyle = grad;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = css('--text');
  ctx.font = '700 30px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(pct + '%', cx, cy - 14);
  ctx.fillStyle = css('--text-dim');
  ctx.font = '11.5px Inter, sans-serif';
  ctx.fillText('current occupancy', cx, cy + 8);
}

function drawBars(canvas, points) {
  // points: [{ label, value }]
  const { ctx, w, h } = hiDPI(canvas);
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 16, right: 16, bottom: 30, left: 16 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const barGap = 10;
  const barW = points.length ? Math.min(46, (chartW - barGap * (points.length - 1)) / points.length) : 0;
  const totalBarsW = points.length * barW + barGap * (points.length - 1);
  const startX = padding.left + (chartW - totalBarsW) / 2;

  ctx.strokeStyle = css('--border');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartH);
  ctx.lineTo(w - padding.right, padding.top + chartH);
  ctx.stroke();

  if (!points.length) {
    ctx.fillStyle = css('--text-dim');
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No revenue recorded yet', w / 2, h / 2);
    return;
  }

  points.forEach((p, i) => {
    const barH = maxVal ? (p.value / maxVal) * (chartH - 10) : 0;
    const x = startX + i * (barW + barGap);
    const y = padding.top + chartH - barH;

    const grad = ctx.createLinearGradient(0, y, 0, padding.top + chartH);
    grad.addColorStop(0, css('--accent'));
    grad.addColorStop(1, css('--teal'));
    ctx.fillStyle = grad;
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(x, y + Math.min(r, barH));
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + barW, y, x + barW, y + r, r);
    ctx.lineTo(x + barW, padding.top + chartH);
    ctx.lineTo(x, padding.top + chartH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = css('--text-dim');
    ctx.font = '10.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.label, x + barW / 2, h - 10);
  });
}

window.SP = window.SP || {};
window.SP.charts = { drawDonut, drawGauge, drawBars };

})();
