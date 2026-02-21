/**
 * WOB Main App Controller
 * Direct WebSocket connection to TouchDesigner.
 * Settings (sample rate, wake lock, haptic) are pushed from TD via config message.
 */
(() => {
  let broadcasting = false;
  let sampleRate = 30;
  let broadcastInterval = null;
  let wakeLock = null;
  let touchPadActive = false;
  let hapticEnabled = true;
  let devMode = true; // true = full UI, false = minimal/auto mode
  let vizInitialized = false;

  const $ = (id) => document.getElementById(id);
  const els = {};

  // Sensor definitions for UI
  const sensorDefs = [
    { key: 'motion', name: 'Motion (Accel + Gyro)', icon: '&#x1F4F1;' },
    { key: 'orientation', name: 'Orientation', icon: '&#x1F9ED;' },
    { key: 'geolocation', name: 'Geolocation (GPS)', icon: '&#x1F4CD;' },
    { key: 'touch', name: 'Touch Point', icon: '&#x1F4BB;' },
  ];

  function cacheDom() {
    els.modal = $('connection-modal');
    els.mainUI = $('main-ui');
    els.tdAddress = $('td-address');
    els.btnConnect = $('btn-connect');
    els.connectionStatus = $('connection-status');
    els.connectionLabel = $('connection-label');
    els.connectionError = $('connection-error');
    els.packetRate = $('packet-rate');
    els.sensorPanel = $('sensor-panel');
    els.btnFullscreenTouch = $('btn-fullscreen-touch');
    els.sensorList = $('sensor-list');
    els.btnEnableSensors = $('btn-enable-sensors');
    els.vizContainer = $('viz-container');
    els.vizCanvas = $('viz-canvas');
    els.broadcastStatus = $('broadcast-status');
    els.btnBroadcast = $('btn-broadcast');
    els.btnTrigger = $('btn-trigger');
    els.touchPad = $('touch-pad');
    els.touchCanvas = $('touch-canvas');
    els.btnExitTouch = $('btn-exit-touch');
    els.debugInfo = $('debug-info');
  }

  function loadSettings() {
    const saved = localStorage.getItem('wob-settings');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.tdAddress) els.tdAddress.value = s.tdAddress;
        if (s.sensorSelection) {
          for (const [key, val] of Object.entries(s.sensorSelection)) {
            SensorModule.setSensorSelected(key, val);
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  function saveSettings() {
    localStorage.setItem('wob-settings', JSON.stringify({
      tdAddress: els.tdAddress.value,
      sensorSelection: SensorModule.getSelected(),
    }));
  }

  /**
   * Apply config pushed from TD via {type:'config'} message.
   * wob_config keys: sample_rate, wake_lock, haptic, sensors, dev_mode
   */
  function applyConfig(cfg) {
    if (cfg.sample_rate != null) {
      const rate = parseInt(cfg.sample_rate);
      if (rate > 0 && rate !== sampleRate) {
        sampleRate = rate;
        addLog(`Config: sample_rate=${rate}Hz`, 'info');
        if (broadcasting) { stopBroadcast(); startBroadcast(); }
      }
    }
    if (cfg.wake_lock != null) {
      if (parseInt(cfg.wake_lock)) requestWakeLock();
      else releaseWakeLock();
    }
    if (cfg.haptic != null) {
      hapticEnabled = !!parseInt(cfg.haptic);
    }
    let sensorChanged = false;
    ['motion', 'orientation', 'geolocation', 'touch'].forEach(key => {
      const v = cfg[`sensor_${key}`];
      if (v != null) { SensorModule.setSensorSelected(key, !!parseInt(v)); sensorChanged = true; }
    });
    if (sensorChanged) renderSensorList();
    if (cfg.dev_mode != null) {
      localStorage.setItem('wob-dev-mode', String(cfg.dev_mode));
      applyDevMode(!!parseInt(cfg.dev_mode));
    }
  }

  // ── Dev Mode ─────────────────────────────────────────────────────────────

  function applyDevMode(on) {
    devMode = on;
    if (on) {
      // Full UI: show sensor panel, transition out of non-dev touch pad
      if (els.sensorPanel) els.sensorPanel.style.display = '';
      _removeDevOverlay();
      if (touchPadActive) {
        touchPadActive = false;
        els.touchPad.classList.add('hidden');
        els.btnExitTouch.classList.remove('hidden');
        TouchModule.destroy();
      }
      els.mainUI.classList.remove('hidden');
      _initViz();
    } else {
      // Minimal mode: hide main UI entirely, go straight to touch pad
      if (els.sensorPanel) els.sensorPanel.style.display = 'none';
      els.mainUI.classList.add('hidden');
      if (!touchPadActive) _showTouchPadDirectly();
    }
  }

  function _removeDevOverlay() {
    const el = document.getElementById('devmode-overlay');
    if (el) el.remove();
  }

  function _initViz() {
    if (vizInitialized) return;
    vizInitialized = true;
    Visualization.init(els.vizCanvas);
    startVizTouch();
  }

  /**
   * Show touch pad directly without main UI (dev_mode=0).
   * Handles iOS sensor permission via first-touch gesture.
   */
  function _showTouchPadDirectly() {
    touchPadActive = true;
    els.touchPad.classList.remove('hidden');
    els.btnExitTouch.classList.add('hidden'); // no exit in minimal mode
    resizeTouchCanvas();

    const startSensorsAndBroadcast = () => {
      if (!SensorModule.isEnabled()) SensorModule.startListening();
      if (WSClient.isConnected() && !broadcasting) startBroadcast();
    };

    if (SensorModule.needsPermissionRequest()) {
      // iOS: DeviceMotionEvent.requestPermission() MUST be called from a user gesture.
      // Wait for first touch on the canvas, then request, then start sensors.
      els.touchCanvas.addEventListener('pointerdown', async function onFirstTouch() {
        await SensorModule.requestPermissions();
        startSensorsAndBroadcast();
      }, { once: true });
    } else {
      startSensorsAndBroadcast();
    }

    TouchModule.init(els.touchCanvas, (snapshot) => {
      Visualization.drawTouches(els.touchCanvas, snapshot.touches, false);
      handleTouchData(snapshot);
    });
  }

  function init() {
    cacheDom();
    // Apply cached dev mode instantly to prevent flash of wrong UI
    const _cached = localStorage.getItem('wob-dev-mode');
    if (_cached !== null) {
      devMode = !!parseInt(_cached);
      if (!devMode && els.sensorPanel) els.sensorPanel.style.display = 'none';
    }
    loadSettings();
    bindEvents();
    renderSensorList();
    SensorModule.setDebugCallback((msg) => updateDebug(msg));

    // Periodically ensure broadcast is running when conditions are met
    setInterval(() => {
      if (WSClient.isConnected() && SensorModule.isEnabled() && !broadcasting) {
        addLog('Auto-starting broadcast (retry)', 'info');
        startBroadcast();
      }
    }, 2000);

    const td = new URLSearchParams(window.location.search).get('td');
    if (td) {
      addLog('Auto-connect: ' + td, 'info');
      els.tdAddress.value = td;
      history.replaceState(null, '', window.location.pathname);
      handleConnect();
      // In dev_mode=1 non-iOS: auto-enable sensors. In dev_mode=0: _showTouchPadDirectly handles it.
      if (devMode && !SensorModule.needsPermissionRequest()) {
        handleEnableSensors();
      }
    } else {
      addLog('No ?td= param - enter address manually', 'warn');
    }
  }

  function bindEvents() {
    els.btnConnect.addEventListener('click', handleConnect);
    els.btnEnableSensors.addEventListener('click', handleEnableSensors);
    els.btnFullscreenTouch.addEventListener('click', enterTouchPad);
    els.btnExitTouch.addEventListener('click', exitTouchPad);
    els.btnBroadcast.addEventListener('click', toggleBroadcast);
    els.btnTrigger.addEventListener('pointerdown', () => els.btnTrigger.classList.add('triggered'));
    els.btnTrigger.addEventListener('pointerup', sendTrigger);
    els.btnTrigger.addEventListener('pointercancel', () => els.btnTrigger.classList.remove('triggered'));

    setInterval(updatePacketRate, 1000);
  }

  function renderSensorList() {
    const avail = SensorModule.detect();
    const selected = SensorModule.getSelected();

    els.sensorList.innerHTML = '';
    sensorDefs.forEach((s) => {
      const li = document.createElement('li');
      const isAvailable = avail[s.key];
      const isSelected = selected[s.key];

      if (!isAvailable) {
        li.className = 'unavailable';
      } else if (isSelected) {
        li.className = 'available selected';
      } else {
        li.className = 'available deselected';
      }

      li.innerHTML = `<span class="sensor-icon">${s.icon}</span> ${s.name}`;

      if (isAvailable) {
        li.addEventListener('click', () => {
          SensorModule.toggleSensor(s.key);
          haptic(15);
          renderSensorList();
          saveSettings();
        });
      }

      els.sensorList.appendChild(li);
    });
  }

  function handleConnect() {
    const addr = els.tdAddress.value.trim();
    if (!addr) {
      alert('TouchDesigner 주소를 입력하세요.');
      return;
    }

    saveSettings();
    haptic();

    addLog('Connecting to: ' + addr, 'info');
    WSClient.connect(addr, {
      onStatusChange: (status) => {
        updateConnectionStatus(status);
        addLog('WS status: ' + status, status === 'connected' ? 'info' : status === 'error' ? 'error' : 'warn');
        if (status === 'connected') {
          WSClient.send({ type: 'hello' });
          addLog('Hello sent to TD', 'info');
          if (SensorModule.isEnabled() && !broadcasting) {
            addLog('Auto-starting broadcast', 'info');
            startBroadcast();
          } else if (!SensorModule.isEnabled() && devMode) {
            addLog('Sensors not enabled - tap Enable Sensors', 'warn');
          }
        }
      },
      onErrorDetail: (msg) => {
        updateConnectionError(msg);
        if (msg) addLog(msg, 'error');
      },
      onConfig: (cfg) => applyConfig(cfg),
    });

    els.modal.classList.remove('active');
    resizeTouchCanvas();
    window.addEventListener('resize', resizeTouchCanvas);

    if (devMode) {
      // Full UI: show main interface + initialize visualization
      els.mainUI.classList.remove('hidden');
      _initViz();
    } else {
      // Minimal mode: skip main UI, go straight to touch pad
      _showTouchPadDirectly();
    }

    requestWakeLock(); // default on; TD can override via config
  }

  function handleDisconnect() {
    stopBroadcast();
    stopVizTouch();
    SensorModule.stopListening();
    WSClient.disconnect();
    releaseWakeLock();
    touchPadActive = false;
    vizInitialized = false;
    els.touchPad.classList.add('hidden');
    els.btnExitTouch.classList.remove('hidden');
    els.mainUI.classList.add('hidden');
    els.modal.classList.add('active');
  }

  async function handleEnableSensors() {
    haptic();

    if (SensorModule.isEnabled()) {
      SensorModule.stopListening();
      els.btnEnableSensors.textContent = 'Enable Sensors';
      els.btnEnableSensors.classList.remove('btn-active');
      updateDebug('Sensors deactivated');
      renderSensorList();
      return;
    }

    if (SensorModule.needsPermissionRequest()) {
      if (!window.isSecureContext) {
        updateDebug('iOS 센서 권한은 HTTPS 필요.');
        return;
      }
      updateDebug('Requesting permissions...');
      const perms = await SensorModule.requestPermissions();
      updateDebug('Permissions: ' + JSON.stringify(perms));
    } else {
      updateDebug('No permission request needed (non-iOS)');
    }

    SensorModule.startListening();

    if (WSClient.isConnected() && !broadcasting) {
      startBroadcast();
    }

    if (SensorModule.isSimulating()) {
      els.btnEnableSensors.textContent = 'Deactivate (Simulating)';
    } else {
      els.btnEnableSensors.textContent = 'Deactivate Sensors';
    }
    els.btnEnableSensors.classList.add('btn-active');

    startVizLoop();
    renderSensorList();
  }

  let vizLoopId = null;
  function startVizLoop() {
    if (vizLoopId) return;
    function loop() {
      const data = SensorModule.getData();
      Visualization.update(data);
      vizLoopId = requestAnimationFrame(loop);
    }
    loop();
  }

  function toggleBroadcast() {
    if (broadcasting) stopBroadcast();
    else startBroadcast();
  }

  function showBroadcastStatus(msg, isError) {
    if (!els.broadcastStatus) return;
    els.broadcastStatus.textContent = msg;
    els.broadcastStatus.className = 'broadcast-status' + (isError ? ' error' : '');
  }

  function startBroadcast() {
    if (!WSClient.isConnected()) {
      const msg = '1. TouchDesigner에 연결하세요 (Connect to TD)';
      showBroadcastStatus(msg, true);
      return;
    }
    if (!SensorModule.isEnabled()) {
      const msg = '2. 먼저 [Enable Sensors] 버튼을 눌러 센서를 활성화하세요';
      showBroadcastStatus(msg, true);
      return;
    }

    showBroadcastStatus('', false);
    haptic();
    broadcasting = true;
    els.btnBroadcast.textContent = 'Stop Broadcast';
    els.btnBroadcast.classList.add('broadcasting');
    if (els.packetRate) els.packetRate.classList.add('broadcasting');
    updateDebug('Broadcasting... ' + sampleRate + ' Hz');

    const interval = Math.round(1000 / sampleRate);
    broadcastInterval = setInterval(() => {
      WSClient.sendSensorData(SensorModule.getData());
    }, interval);
  }

  function stopBroadcast() {
    broadcasting = false;
    if (broadcastInterval) {
      clearInterval(broadcastInterval);
      broadcastInterval = null;
    }
    els.btnBroadcast.textContent = 'Start Broadcast';
    els.btnBroadcast.classList.remove('broadcasting');
    if (els.packetRate) els.packetRate.classList.remove('broadcasting');
    showBroadcastStatus('', false);
    updateDebug('Broadcast 중지됨');
  }

  function sendTrigger() {
    els.btnTrigger.classList.remove('triggered');
    if (!WSClient.isConnected()) return;
    WSClient.send({ type: 'trigger' });
    haptic(50);
  }

  function handleTouchData(snapshot) {
    if (broadcasting && WSClient.isConnected() && SensorModule.getSelected().touch) {
      WSClient.sendTouchData(snapshot);
    }
  }

  function startVizTouch() {
    if (!els.vizContainer) return;
    TouchModule.init(els.vizContainer, (snapshot) => {
      handleTouchData(snapshot);
    });
  }

  function stopVizTouch() {
    TouchModule.destroy();
  }

  function enterTouchPad() {
    touchPadActive = true;
    stopVizTouch();
    els.touchPad.classList.remove('hidden');
    els.btnExitTouch.classList.remove('hidden'); // always visible in dev_mode=1
    resizeTouchCanvas();

    TouchModule.init(els.touchCanvas, (snapshot) => {
      Visualization.drawTouches(els.touchCanvas, snapshot.touches, devMode);
      handleTouchData(snapshot);
    });
    haptic();
  }

  function exitTouchPad() {
    touchPadActive = false;
    els.touchPad.classList.add('hidden');
    TouchModule.destroy();
    startVizTouch();
    haptic();
  }

  function resizeTouchCanvas() {
    if (!els.touchCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    els.touchCanvas.width = window.innerWidth * dpr;
    els.touchCanvas.height = window.innerHeight * dpr;
    els.touchCanvas.style.width = window.innerWidth + 'px';
    els.touchCanvas.style.height = window.innerHeight + 'px';
  }

  function updateConnectionStatus(status) {
    const dot = els.connectionStatus;
    const label = els.connectionLabel;
    dot.className = 'status-dot ' + status;
    const labels = {
      connected: 'Connected to TD',
      disconnected: 'Disconnected',
      connecting: 'Connecting...',
      reconnecting: 'Reconnecting...',
      error: 'Connection Error',
      rejected: 'Server Full',
    };
    label.textContent = labels[status] || status;
    if (status === 'rejected') {
      _showRejectedOverlay();
    }
    if (status !== 'error' && status !== 'rejected' && els.connectionError) {
      els.connectionError.textContent = '';
      els.connectionError.classList.add('hidden');
    }
  }

  function _showRejectedOverlay() {
    let overlay = document.getElementById('rejected-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'rejected-overlay';
      overlay.innerHTML = `
        <div class="rejected-box">
          <div class="rejected-icon">&#x1F6AB;</div>
          <h2>연결이 가득 찼어요</h2>
          <p>현재 최대 접속 인원이 모두 사용 중입니다.<br>잠시 후 다시 시도해 주세요.</p>
          <button id="btn-retry" class="btn btn-primary" style="margin-top:20px">다시 시도</button>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#btn-retry').addEventListener('click', () => {
        overlay.remove();
        handleConnect();
      });
    }
  }

  function updateConnectionError(msg) {
    if (!els.connectionError) return;
    if (msg) {
      els.connectionError.textContent = msg;
      els.connectionError.classList.remove('hidden');
    } else {
      els.connectionError.textContent = '';
      els.connectionError.classList.add('hidden');
    }
  }

  function updatePacketRate() {
    if (els.packetRate) {
      els.packetRate.textContent = WSClient.getPacketsPerSec() + ' pkt/s';
    }
  }

  const LOG_MAX = 30;
  const logLines = [];

  function addLog(msg, level) {
    const time = new Date().toTimeString().slice(0, 8);
    const line = { time, msg, level: level || 'info' };
    logLines.push(line);
    if (logLines.length > LOG_MAX) logLines.shift();
    _renderLog();
    console.log('[WOB]', msg);
  }

  function _renderLog() {
    const el = els.debugInfo;
    if (!el) return;
    el.innerHTML = logLines.slice().reverse().map(l => {
      const color = l.level === 'error' ? '#ff6677' : l.level === 'warn' ? '#ffaa33' : '#6a9f6a';
      return `<span style="color:${color}">[${l.time}] ${_esc(l.msg)}</span>`;
    }).join('\n');
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  }

  function updateDebug(msg) {
    addLog(msg, 'info');
  }

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => console.log('Wake Lock released'));
      } catch (e) {
        console.warn('Wake Lock failed:', e);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock === null) {
      requestWakeLock();
    }
  });

  function haptic(duration = 30) {
    if (hapticEnabled && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
