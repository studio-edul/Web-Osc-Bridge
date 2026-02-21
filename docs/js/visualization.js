/**
 * WOB Visualization Module
 * Canvas-based sparklines grouped by sensor type.
 * Channels within the same group (e.g. accel x/y/z) overlap on one row.
 */
const Visualization = (() => {
  let canvas = null;
  let ctx = null;
  let visible = true;

  const HISTORY_LENGTH = 120; // ~2s at 60fps
  const history = {};

  /**
   * Sensor groups. Each group occupies one horizontal band.
   * Channels within a group are drawn overlapping, with different colors.
   * norm(v) maps raw value to [-1, 1] for plotting.
   */
  const groups = [
    {
      key: 'accel',
      label: 'Accel\nm/s²',
      channels: [
        { key: 'accel_x', label: 'X', color: '#ff5555', axis: 'x',     norm: v => v / 20 },
        { key: 'accel_y', label: 'Y', color: '#55ff55', axis: 'y',     norm: v => v / 20 },
        { key: 'accel_z', label: 'Z', color: '#5599ff', axis: 'z',     norm: v => v / 20 },
      ],
    },
    {
      key: 'gyro',
      label: 'Gyro\n°/s',
      channels: [
        { key: 'gyro_a', label: 'α', color: '#ff8844', axis: 'alpha',  norm: v => v / 360 },
        { key: 'gyro_b', label: 'β', color: '#44ffaa', axis: 'beta',   norm: v => v / 360 },
        { key: 'gyro_g', label: 'γ', color: '#cc55ff', axis: 'gamma',  norm: v => v / 360 },
      ],
    },
    {
      key: 'orient',
      label: 'Orient\n°',
      channels: [
        { key: 'orient_a', label: 'α', color: '#ffcc44', axis: 'alpha', norm: v => (v - 180) / 180 }, // 0-360 → -1..1
        { key: 'orient_b', label: 'β', color: '#44bbff', axis: 'beta',  norm: v => v / 180 },
        { key: 'orient_g', label: 'γ', color: '#ff55aa', axis: 'gamma', norm: v => v / 90 },
      ],
    },
  ];

  // Init history buffers
  groups.forEach(g => g.channels.forEach(ch => {
    history[ch.key] = new Float32Array(HISTORY_LENGTH);
  }));

  function init(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
  }

  function update(sensorData) {
    if (!ctx) return;

    const activeGroups = groups.filter(g => sensorData[g.key] != null);

    activeGroups.forEach(g => {
      g.channels.forEach(ch => {
        const buf = history[ch.key];
        buf.copyWithin(0, 1);
        buf[HISTORY_LENGTH - 1] = sensorData[g.key][ch.axis] || 0;
      });
    });

    if (visible) render(activeGroups);
  }

  function render(activeGroups) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);
    if (activeGroups.length === 0) return;

    const LABEL_W = 52;  // left label column
    const VALUE_W = 80;  // right value column
    const graphLeft = LABEL_W;
    const graphWidth = w - LABEL_W - VALUE_W;
    const rowH = Math.floor(h / activeGroups.length);

    activeGroups.forEach((g, gi) => {
      const rowTop = gi * rowH;
      const centerY = rowTop + rowH / 2;

      // Alternating row background
      ctx.fillStyle = gi % 2 === 0
        ? 'rgba(255,255,255,0.025)'
        : 'rgba(0,0,0,0)';
      ctx.fillRect(0, rowTop, w, rowH);

      // Group label (left, two lines)
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      const lines = g.label.split('\n');
      lines.forEach((line, li) => {
        const lineY = centerY - (lines.length - 1) * 6 + li * 12;
        ctx.fillStyle = '#777';
        ctx.fillText(line, LABEL_W / 2, lineY);
      });

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(graphLeft, centerY);
      ctx.lineTo(graphLeft + graphWidth, centerY);
      ctx.stroke();

      // Top / bottom boundary lines
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(graphLeft, rowTop + 1);
      ctx.lineTo(graphLeft + graphWidth, rowTop + 1);
      ctx.stroke();

      // Draw each channel overlapping
      g.channels.forEach(ch => {
        const buf = history[ch.key];
        const halfH = rowH / 2 - 3;

        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let j = 0; j < HISTORY_LENGTH; j++) {
          const x = graphLeft + (j / HISTORY_LENGTH) * graphWidth;
          const n = Math.max(-1, Math.min(1, ch.norm(buf[j])));
          const plotY = centerY - n * halfH;
          if (j === 0) ctx.moveTo(x, plotY);
          else ctx.lineTo(x, plotY);
        }
        ctx.stroke();
      });

      // Current values (right column, one line per channel)
      const nCh = g.channels.length;
      const spacing = rowH / (nCh + 1);
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      g.channels.forEach((ch, ci) => {
        const val = history[ch.key][HISTORY_LENGTH - 1];
        const lineY = rowTop + spacing * (ci + 1);
        ctx.fillStyle = ch.color;
        const sign = val >= 0 ? ' ' : '';
        ctx.fillText(`${ch.label}:${sign}${val.toFixed(1)}`, graphLeft + graphWidth + 4, lineY + 3);
      });
    });
  }

  /**
   * Draw touch points on a separate canvas
   */
  function drawTouches(touchCanvas, touches) {
    const tCtx = touchCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = touchCanvas.width / dpr;
    const h = touchCanvas.height / dpr;

    tCtx.clearRect(0, 0, w * dpr, h * dpr);
    tCtx.save();
    tCtx.scale(dpr, dpr);

    const colors = ['#ff4444', '#44ff44', '#4488ff', '#ffaa44', '#ff44aa',
                     '#44ffaa', '#aa44ff', '#ffff44', '#44ffff', '#ff8888'];

    touches.forEach((touch, idx) => {
      const px = touch.x * w;
      const py = touch.y * h;
      const color = colors[idx % colors.length];

      // Outer ring
      tCtx.strokeStyle = color;
      tCtx.lineWidth = 2;
      tCtx.beginPath();
      tCtx.arc(px, py, 30, 0, Math.PI * 2);
      tCtx.stroke();

      // Inner dot
      tCtx.fillStyle = color;
      tCtx.beginPath();
      tCtx.arc(px, py, 8, 0, Math.PI * 2);
      tCtx.fill();
    });

    tCtx.restore();
  }

  function setVisible(v) {
    visible = v;
    if (canvas) canvas.style.opacity = v ? '1' : '0';
  }

  function isVisible() { return visible; }

  function destroy() {
    window.removeEventListener('resize', resize);
  }

  return { init, update, drawTouches, setVisible, isVisible, resize, destroy };
})();
