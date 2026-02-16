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

  // Packet counting
  let sentCount = 0;
  let lastCountTime = Date.now();
  let packetsPerSec = 0;

  /**
   * Connect to TouchDesigner WebSocket DAT
   */
  function connect(url, callbacks = {}) {
    onStatusChange = callbacks.onStatusChange || null;

    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = 'ws://' + url;
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
      console.error('WebSocket creation failed:', e);
      _updateStatus('error');
      _scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      reconnectAttempts = 0;
      _updateStatus('connected');
      console.log('[WS] Connected to TD:', serverUrl);
    };

    ws.onmessage = (event) => {
      // TD can send messages back if needed
      console.log('[WS] From TD:', event.data);
    };

    ws.onclose = () => {
      connected = false;
      _updateStatus('disconnected');
      console.log('[WS] Disconnected from TD');
      _scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      _updateStatus('error');
    };
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
    return send({
      type: 'sensor',
      ax: sensorData.accel.x,
      ay: sensorData.accel.y,
      az: sensorData.accel.z,
      ga: sensorData.gyro.alpha,
      gb: sensorData.gyro.beta,
      gg: sensorData.gyro.gamma,
      oa: sensorData.orient.alpha,
      ob: sensorData.orient.beta,
      og: sensorData.orient.gamma,
      lat: sensorData.geo.lat,
      lon: sensorData.geo.lon,
    });
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
    touchData.touches.forEach((t) => {
      msg[`t${t.id}x`] = t.x;
      msg[`t${t.id}y`] = t.y;
      msg[`t${t.id}s`] = t.state;
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
