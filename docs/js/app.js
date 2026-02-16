/**
 * WOB Main App Controller
 * Direct WebSocket connection to TouchDesigner.
 */
(() => {
  let broadcasting = false;
  let sampleRate = 30;
  let broadcastInterval = null;
  let wakeLock = null;
  let hudVisible = true;
  let touchPadActive = false;

  const $ = (id) => document.getElementById(id);
  const els = {};

  // Sensor definitions for UI
  const sensorDefs = [
    { key: 'motion', name: 'Motion (Accel + Gyro)', icon: '&#x1F4F1;' },
    { key: 'orientation', name: 'Orientation', icon: '&#x1F9ED;' },
    { key: 'geolocation', name: 'Geolocation (GPS)', icon: '&#x1F4CD;' },
  ];

  function cacheDom() {
    els.modal = $('connection-modal');
    els.mainUI = $('main-ui');
    els.tdAddress = $('td-address');
    els.btnConnect = $('btn-connect');
    els.connectionStatus = $('connection-status');
    els.connectionLabel = $('connection-label');
    els.packetRate = $('packet-rate');
    els.btnSettings = $('btn-settings');
    els.settingsPanel = $('settings-panel');
    els.sampleRate = $('sample-rate');
    els.sampleRateValue = $('sample-rate-value');
    els.wakeLockCheck = $('wake-lock');
    els.hapticCheck = $('haptic-feedback');
    els.btnDisconnect = $('btn-disconnect');
    els.sensorList = $('sensor-list');
    els.btnEnableSensors = $('btn-enable-sensors');
    els.btnToggleHud = $('btn-toggle-hud');
    els.btnFullscreenTouch = $('btn-fullscreen-touch');
    els.vizContainer = $('viz-container');
    els.vizCanvas = $('viz-canvas');
    els.btnBroadcast = $('btn-broadcast');
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
        if (s.sampleRate) {
          els.sampleRate.value = s.sampleRate;
          sampleRate = s.sampleRate;
          els.sampleRateValue.textContent = s.sampleRate;
        }
        // Restore sensor selection
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
      sampleRate: sampleRate,
      sensorSelection: SensorModule.getSelected(),
    }));
  }

  function init() {
    cacheDom();
    loadSettings();
    bindEvents();
    renderSensorList();
    SensorModule.setDebugCallback((msg) => updateDebug(msg));
  }

  function bindEvents() {
    els.btnConnect.addEventListener('click', handleConnect);

    els.btnSettings.addEventListener('click', () => {
      els.settingsPanel.classList.toggle('hidden');
    });

    els.sampleRate.addEventListener('input', (e) => {
      sampleRate = parseInt(e.target.value);
      els.sampleRateValue.textContent = sampleRate;
      if (broadcasting) {
        stopBroadcast();
        startBroadcast();
      }
      saveSettings();
    });

    els.wakeLockCheck.addEventListener('change', (e) => {
      if (e.target.checked) requestWakeLock();
      else releaseWakeLock();
    });

    els.btnDisconnect.addEventListener('click', handleDisconnect);
    els.btnEnableSensors.addEventListener('click', handleEnableSensors);
    els.btnToggleHud.addEventListener('click', toggleHud);
    els.btnFullscreenTouch.addEventListener('click', enterTouchPad);
    els.btnExitTouch.addEventListener('click', exitTouchPad);
    els.btnBroadcast.addEventListener('click', toggleBroadcast);

    setInterval(updatePacketRate, 1000);
  }

  /**
   * Render sensor list with toggle functionality
   */
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

      // Add click handler for available sensors
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

    WSClient.connect(addr, {
      onStatusChange: updateConnectionStatus,
    });

    els.modal.classList.remove('active');
    els.mainUI.classList.remove('hidden');

    Visualization.init(els.vizCanvas);
    resizeTouchCanvas();
    window.addEventListener('resize', resizeTouchCanvas);

    if (els.wakeLockCheck.checked) {
      requestWakeLock();
    }
  }

  function handleDisconnect() {
    stopBroadcast();
    SensorModule.stopListening();
    WSClient.disconnect();
    releaseWakeLock();
    els.mainUI.classList.add('hidden');
    els.modal.classList.add('active');
  }

  async function handleEnableSensors() {
    haptic();

    // Toggle: if sensors are already enabled, deactivate them
    if (SensorModule.isEnabled()) {
      SensorModule.stopListening();
      els.btnEnableSensors.textContent = 'Enable Sensors';
      els.btnEnableSensors.classList.remove('btn-active');
      updateDebug('Sensors deactivated');
      renderSensorList();
      return;
    }

    // Activate sensors - always request permissions (iOS popup every time)
    updateDebug('Requesting permissions...');

    if (SensorModule.needsPermissionRequest()) {
      const perms = await SensorModule.requestPermissions();
      updateDebug('Permissions: ' + JSON.stringify(perms));
    } else {
      updateDebug('No permission request needed (non-iOS)');
    }

    SensorModule.startListening();

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
      // Use getAllData for visualization (shows everything regardless of selection)
      const data = SensorModule.getAllData();
      Visualization.update(data);
      vizLoopId = requestAnimationFrame(loop);
    }
    loop();
  }

  function toggleBroadcast() {
    if (broadcasting) stopBroadcast();
    else startBroadcast();
  }

  function startBroadcast() {
    if (!WSClient.isConnected()) {
      alert('TouchDesigner에 연결되어 있지 않습니다.');
      return;
    }
    if (!SensorModule.isEnabled()) {
      alert('먼저 센서를 활성화하세요.');
      return;
    }

    haptic();
    broadcasting = true;
    els.btnBroadcast.textContent = 'Stop Broadcast';
    els.btnBroadcast.classList.add('broadcasting');

    const interval = Math.round(1000 / sampleRate);
    broadcastInterval = setInterval(() => {
      // getData returns only selected sensors (null for deselected)
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
  }

  function enterTouchPad() {
    touchPadActive = true;
    els.touchPad.classList.remove('hidden');
    resizeTouchCanvas();

    TouchModule.init(els.touchCanvas, (snapshot) => {
      Visualization.drawTouches(els.touchCanvas, snapshot.touches);
      if (broadcasting && WSClient.isConnected()) {
        WSClient.sendTouchData(snapshot);
      }
    });
    haptic();
  }

  function exitTouchPad() {
    touchPadActive = false;
    els.touchPad.classList.add('hidden');
    TouchModule.destroy();
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

  function toggleHud() {
    hudVisible = !hudVisible;
    Visualization.setVisible(hudVisible);
    els.btnToggleHud.textContent = hudVisible ? 'Hide HUD' : 'Show HUD';
    els.sensorList.parentElement.style.display = hudVisible ? '' : 'none';
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
    };
    label.textContent = labels[status] || status;
  }

  function updatePacketRate() {
    if (els.packetRate) {
      els.packetRate.textContent = WSClient.getPacketsPerSec() + ' pkt/s';
    }
  }

  function updateDebug(msg) {
    console.log('[WOB]', msg);
    if (els.debugInfo) {
      els.debugInfo.textContent = msg;
    }
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
    if (document.visibilityState === 'visible' && els.wakeLockCheck && els.wakeLockCheck.checked) {
      requestWakeLock();
    }
  });

  function haptic(duration = 30) {
    if (els.hapticCheck && els.hapticCheck.checked && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
