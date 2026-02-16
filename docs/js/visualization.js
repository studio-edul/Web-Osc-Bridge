/**
 * WOB Visualization Module
 * Canvas-based sparkline graphs and real-time data display.
 */
const Visualization = (() => {
  let canvas = null;
  let ctx = null;
  let visible = true;
  let animFrameId = null;

  // History buffers for sparklines
  const HISTORY_LENGTH = 120; // ~2 seconds at 60fps
  const history = {};

  // Channel definitions: label, color, data path
  const channels = [
    { key: 'accel_x', label: 'Accel X', color: '#ff4444', group: 'accel', axis: 'x' },
    { key: 'accel_y', label: 'Accel Y', color: '#44ff44', group: 'accel', axis: 'y' },
    { key: 'accel_z', label: 'Accel Z', color: '#4488ff', group: 'accel', axis: 'z' },
    { key: 'gyro_a', label: 'Gyro A', color: '#ff8844', group: 'gyro', axis: 'alpha' },
    { key: 'gyro_b', label: 'Gyro B', color: '#44ffaa', group: 'gyro', axis: 'beta' },
    { key: 'gyro_g', label: 'Gyro G', color: '#aa44ff', group: 'gyro', axis: 'gamma' },
    { key: 'orient_a', label: 'Orient A', color: '#ffaa44', group: 'orient', axis: 'alpha' },
    { key: 'orient_b', label: 'Orient B', color: '#44aaff', group: 'orient', axis: 'beta' },
    { key: 'orient_g', label: 'Orient G', color: '#ff44aa', group: 'orient', axis: 'gamma' },
  ];

  // Initialize history buffers
  channels.forEach((ch) => {
    history[ch.key] = new Float32Array(HISTORY_LENGTH);
  });

  /**
   * Initialize with canvas element
   */
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

  /**
   * Push new data and render
   */
  function update(sensorData) {
    if (!ctx) return;

    // Push data into history
    channels.forEach((ch) => {
      const buf = history[ch.key];
      // Shift left
      buf.copyWithin(0, 1);
      // Get value from sensor data
      const val = sensorData[ch.group] ? (sensorData[ch.group][ch.axis] || 0) : 0;
      buf[HISTORY_LENGTH - 1] = val;
    });

    if (visible) {
      render(sensorData);
    }
  }

  function render(sensorData) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    const rowHeight = Math.floor(h / channels.length);
    const graphWidth = w - 140; // Leave space for label + value
    const graphLeft = 90;

    channels.forEach((ch, i) => {
      const y = i * rowHeight;
      const centerY = y + rowHeight / 2;
      const buf = history[ch.key];
      const currentVal = buf[HISTORY_LENGTH - 1];

      // Label
      ctx.fillStyle = ch.color;
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(ch.label, graphLeft - 8, centerY + 4);

      // Current value
      ctx.textAlign = 'left';
      ctx.fillText(currentVal.toFixed(3), graphLeft + graphWidth + 6, centerY + 4);

      // Sparkline background
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(graphLeft, y + 2, graphWidth, rowHeight - 4);

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(graphLeft, centerY);
      ctx.lineTo(graphLeft + graphWidth, centerY);
      ctx.stroke();

      // Sparkline
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j < HISTORY_LENGTH; j++) {
        const x = graphLeft + (j / HISTORY_LENGTH) * graphWidth;
        // Map -1..1 to rowHeight
        const val = buf[j];
        const plotY = centerY - val * (rowHeight / 2 - 4);

        if (j === 0) ctx.moveTo(x, plotY);
        else ctx.lineTo(x, plotY);
      }
      ctx.stroke();
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

    // Grid
    tCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    tCtx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const gx = (i / 10) * w;
      const gy = (i / 10) * h;
      tCtx.beginPath();
      tCtx.moveTo(gx, 0); tCtx.lineTo(gx, h);
      tCtx.moveTo(0, gy); tCtx.lineTo(w, gy);
      tCtx.stroke();
    }

    // Touch points
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

      // Crosshair
      tCtx.strokeStyle = `${color}66`;
      tCtx.lineWidth = 1;
      tCtx.beginPath();
      tCtx.moveTo(px, 0); tCtx.lineTo(px, h);
      tCtx.moveTo(0, py); tCtx.lineTo(w, py);
      tCtx.stroke();

      // Label
      tCtx.fillStyle = color;
      tCtx.font = '12px monospace';
      tCtx.textAlign = 'left';
      tCtx.fillText(`#${touch.id} (${touch.x.toFixed(2)}, ${touch.y.toFixed(2)})`, px + 36, py - 4);
    });

    tCtx.restore();
  }

  function setVisible(v) {
    visible = v;
    if (canvas) {
      canvas.style.opacity = v ? '1' : '0';
    }
  }

  function isVisible() {
    return visible;
  }

  function destroy() {
    window.removeEventListener('resize', resize);
    if (animFrameId) cancelAnimationFrame(animFrameId);
  }

  return {
    init,
    update,
    drawTouches,
    setVisible,
    isVisible,
    resize,
    destroy,
  };
})();
