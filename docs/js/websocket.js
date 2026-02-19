/**
 * WOB WebSocket Client
 * Connects directly to TouchDesigner WebSocket DAT.
 * Sends flat JSON that TD can parse easily.
 */
const WSClient = (() => {
  let ws = null;
  let serverUrl = '';
  let connected = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_DELAY = 10000;

  let onStatusChange = null;
  let onErrorDetail = null;

  // Packet counting
  let sentCount = 0;
  let lastCountTime = Date.now();
  let packetsPerSec = 0;

  /**
   * Connect to TouchDesigner WebSocket DAT
   */
  function connect(url, callbacks = {}) {
    onStatusChange = callbacks.onStatusChange || null;
    onErrorDetail = callbacks.onErrorDetail || null;

    if (url.startsWith('ws://') && window.location.protocol === 'https:') {
      url = 'wss://' + url.slice(5); // HTTPS 페이지에서 ws:// → wss:// 강제 업그레이드
    } else if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + url;
    }
    serverUrl = url;
    _createConnection();
  }

  function _createConnection() {
    if (ws) {
      ws.close();
      ws = null;
    }

    _updateStatus('connecting');

    try {
      ws = new WebSocket(serverUrl);
    } catch (e) {
      const msg = 'WebSocket 생성 실패: ' + (e.message || e);
      console.error('[WS]', msg);
      _reportError(msg);
      _updateStatus('error');
      _scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      reconnectAttempts = 0;
      _updateStatus('connected');
      _reportError(null);
      console.log('[WS] Connected to TD:', serverUrl);
    };

    ws.onmessage = (event) => {
      console.log('[WS] From TD:', event.data);
    };

    ws.onclose = (event) => {
      connected = false;
      const code = event.code;
      const reason = event.reason || '';
      const msg = _getCloseMessage(code, reason, serverUrl);
      _reportError(msg);
      _updateStatus(code === 1000 ? 'disconnected' : 'error');
      console.log('[WS] Closed:', code, reason || '(no reason)');
      if (code !== 1000) _scheduleReconnect();
    };

    ws.onerror = () => {
      _updateStatus('error');
      if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        _reportError('연결 거부/타임아웃: ' + serverUrl + ' - 서버 없음, 방화벽, IP/포트 확인');
      }
    };
  }

  function _getCloseMessage(code, reason, url) {
    const hints = {
      1006: '연결 실패 (서버 응답 없음). 가능: 잘못된 IP/포트, 방화벽, TD Web Server 꺼짐',
      1002: '프로토콜 오류 (TD가 WebSocket을 지원하지 않을 수 있음)',
      1011: '서버 측 오류',
      1015: 'TLS 오류 (wss:// 관련)',
    };
    const hint = hints[code] || ('코드 ' + code);
    return reason ? reason + ' | ' + hint : hint + ' | URL: ' + url;
  }

  function _reportError(msg) {
    if (onErrorDetail) onErrorDetail(msg);
  }

  function _scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    _updateStatus('reconnecting');

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      _createConnection();
    }, delay);
  }

  function _updateStatus(status) {
    if (onStatusChange) onStatusChange(status);
  }

  /**
   * Send raw JSON string to TD
   */
  function send(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(data));
      sentCount++;
      _updatePacketRate();
      return true;
    } catch (e) {
      console.error('[WS] Send error:', e);
      return false;
    }
  }

  /**
   * Send sensor data as flat JSON for easy TD parsing
   * Format: { type, ax, ay, az, gα, gβ, gγ, oα, oβ, oγ, lat, lon }
   */
  function sendSensorData(sensorData) {
    const msg = { type: 'sensor' };

    // Only include selected sensors (non-null)
    if (sensorData.accel) {
      msg.ax = sensorData.accel.x;
      msg.ay = sensorData.accel.y;
      msg.az = sensorData.accel.z;
    }
    if (sensorData.gyro) {
      msg.ga = sensorData.gyro.alpha;
      msg.gb = sensorData.gyro.beta;
      msg.gg = sensorData.gyro.gamma;
    }
    if (sensorData.orient) {
      msg.oa = sensorData.orient.alpha;
      msg.ob = sensorData.orient.beta;
      msg.og = sensorData.orient.gamma;
    }
    if (sensorData.geo) {
      msg.lat = sensorData.geo.lat;
      msg.lon = sensorData.geo.lon;
    }

    return send(msg);
  }

  /**
   * Send touch data
   * Format: { type, count, t0x, t0y, t0s, t1x, t1y, t1s, ... }
   */
  function sendTouchData(touchData) {
    const msg = {
      type: 'touch',
      count: touchData.count,
    };
    touchData.touches.forEach((t, idx) => {
      msg[`t${idx}x`] = t.x;
      msg[`t${idx}y`] = t.y;
      msg[`t${idx}s`] = t.state;
    });
    return send(msg);
  }

  function _updatePacketRate() {
    const now = Date.now();
    const elapsed = now - lastCountTime;
    if (elapsed >= 1000) {
      packetsPerSec = Math.round(sentCount / (elapsed / 1000));
      sentCount = 0;
      lastCountTime = now;
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    connected = false;
    _updateStatus('disconnected');
  }

  return {
    connect,
    disconnect,
    send,
    sendSensorData,
    sendTouchData,
    isConnected: () => connected,
    getPacketsPerSec: () => packetsPerSec,
  };
})();
