/**
 * WOB Sensor Module
 * Detects available sensors, handles permissions, collects and normalizes data.
 * Supports per-sensor enable/disable toggling.
 */
const SensorModule = (() => {
  // Sensor availability (browser support)
  const availability = {
    motion: false,
    orientation: false,
    geolocation: false,
  };

  // Which sensors are selected for broadcast
  const selected = {
    motion: true,
    orientation: true,
    geolocation: false,
  };

  // Current sensor data (normalized)
  const data = {
    accel: { x: 0, y: 0, z: 0 },
    gyro: { alpha: 0, beta: 0, gamma: 0 },
    orient: { alpha: 0, beta: 0, gamma: 0 },
    geo: { lat: 0, lon: 0 },
  };

  // Raw data (for display)
  const raw = {
    accel: { x: 0, y: 0, z: 0 },
    gyro: { alpha: 0, beta: 0, gamma: 0 },
    orient: { alpha: 0, beta: 0, gamma: 0 },
  };

  let sensorsEnabled = false;
  let motionListener = null;
  let orientListener = null;
  let geoWatchId = null;

  // Simulation mode (for PC testing)
  let simulationMode = false;
  let simInterval = null;
  let simTime = 0;

  // Normalization constants
  const ACCEL_MAX = 9.81;
  const GYRO_MAX = 360;

  /**
   * Detect available sensors via feature detection
   */
  function detect() {
    availability.motion = typeof DeviceMotionEvent !== 'undefined';
    availability.orientation = typeof DeviceOrientationEvent !== 'undefined';
    availability.geolocation = 'geolocation' in navigator;
    return { ...availability };
  }

  /**
   * Check if this is likely a mobile device
   */
  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * Check if iOS requires permission request
   */
  function needsPermissionRequest() {
    return (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    );
  }

  /**
   * Request sensor permissions (must be called from user gesture on iOS)
   */
  async function requestPermissions() {
    const results = { motion: false, orientation: false, geo: false };

    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        results.motion = perm === 'granted';
      } catch (e) {
        console.warn('Motion permission denied:', e);
      }
    } else {
      results.motion = availability.motion;
    }

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        results.orientation = perm === 'granted';
      } catch (e) {
        console.warn('Orientation permission denied:', e);
      }
    } else {
      results.orientation = availability.orientation;
    }

    if (availability.geolocation && selected.geolocation) {
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        results.geo = true;
      } catch (e) {
        console.warn('Geolocation permission denied:', e);
      }
    }

    return results;
  }

  /**
   * Toggle sensor selection
   */
  function toggleSensor(key) {
    if (key in selected) {
      selected[key] = !selected[key];

      // If sensors are already running, start/stop geolocation dynamically
      if (sensorsEnabled && key === 'geolocation') {
        if (selected.geolocation && geoWatchId === null) {
          startGeolocation();
        } else if (!selected.geolocation && geoWatchId !== null) {
          navigator.geolocation.clearWatch(geoWatchId);
          geoWatchId = null;
          data.geo.lat = 0;
          data.geo.lon = 0;
        }
      }
    }
    return { ...selected };
  }

  function setSensorSelected(key, value) {
    if (key in selected) {
      selected[key] = value;
    }
  }

  /**
   * Start collecting sensor data
   */
  function startListening() {
    sensorsEnabled = true;

    // If not on mobile, enable simulation mode
    if (!isMobileDevice()) {
      console.log('[Sensors] PC detected - enabling simulation mode');
      startSimulation();
      return;
    }

    // DeviceMotion (accelerometer + gyroscope)
    if (availability.motion) {
      motionListener = (e) => {
        const a = e.accelerationIncludingGravity || {};
        raw.accel.x = a.x || 0;
        raw.accel.y = a.y || 0;
        raw.accel.z = a.z || 0;

        data.accel.x = clamp(raw.accel.x / ACCEL_MAX, -1, 1);
        data.accel.y = clamp(raw.accel.y / ACCEL_MAX, -1, 1);
        data.accel.z = clamp(raw.accel.z / ACCEL_MAX, -1, 1);

        const r = e.rotationRate || {};
        raw.gyro.alpha = r.alpha || 0;
        raw.gyro.beta = r.beta || 0;
        raw.gyro.gamma = r.gamma || 0;

        data.gyro.alpha = clamp(raw.gyro.alpha / GYRO_MAX, -1, 1);
        data.gyro.beta = clamp(raw.gyro.beta / GYRO_MAX, -1, 1);
        data.gyro.gamma = clamp(raw.gyro.gamma / GYRO_MAX, -1, 1);
      };
      window.addEventListener('devicemotion', motionListener);
    }

    // DeviceOrientation
    if (availability.orientation) {
      orientListener = (e) => {
        raw.orient.alpha = e.alpha || 0;
        raw.orient.beta = e.beta || 0;
        raw.orient.gamma = e.gamma || 0;

        data.orient.alpha = (raw.orient.alpha % 360) / 360;
        data.orient.beta = (raw.orient.beta + 180) / 360;
        data.orient.gamma = (raw.orient.gamma + 90) / 180;
      };
      window.addEventListener('deviceorientation', orientListener);
    }

    // Geolocation
    if (availability.geolocation && selected.geolocation) {
      startGeolocation();
    }
  }

  function startGeolocation() {
    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        data.geo.lat = pos.coords.latitude;
        data.geo.lon = pos.coords.longitude;
      },
      (err) => console.warn('Geo error:', err.message),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
  }

  /**
   * Simulation mode for PC testing
   */
  function startSimulation() {
    simulationMode = true;
    simInterval = setInterval(() => {
      simTime += 0.03;

      // Simulate accelerometer (gentle wave motion)
      data.accel.x = Math.sin(simTime * 1.2) * 0.3;
      data.accel.y = Math.cos(simTime * 0.8) * 0.2;
      data.accel.z = Math.sin(simTime * 0.5) * 0.1 + 0.98;

      // Simulate gyroscope
      data.gyro.alpha = Math.sin(simTime * 2.0) * 0.15;
      data.gyro.beta = Math.cos(simTime * 1.5) * 0.1;
      data.gyro.gamma = Math.sin(simTime * 1.8) * 0.12;

      // Simulate orientation
      data.orient.alpha = (Math.sin(simTime * 0.3) + 1) / 2;
      data.orient.beta = (Math.cos(simTime * 0.4) + 1) / 2;
      data.orient.gamma = (Math.sin(simTime * 0.5) + 1) / 2;
    }, 30);
  }

  /**
   * Stop collecting
   */
  function stopListening() {
    sensorsEnabled = false;
    simulationMode = false;

    if (simInterval) {
      clearInterval(simInterval);
      simInterval = null;
    }
    if (motionListener) {
      window.removeEventListener('devicemotion', motionListener);
      motionListener = null;
    }
    if (orientListener) {
      window.removeEventListener('deviceorientation', orientListener);
      orientListener = null;
    }
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
  }

  /**
   * Get current data snapshot (only selected sensors)
   */
  function getData() {
    return {
      accel: selected.motion ? { ...data.accel } : null,
      gyro: selected.motion ? { ...data.gyro } : null,
      orient: selected.orientation ? { ...data.orient } : null,
      geo: selected.geolocation ? { ...data.geo } : null,
    };
  }

  /**
   * Get all data (for visualization, regardless of selection)
   */
  function getAllData() {
    return {
      accel: { ...data.accel },
      gyro: { ...data.gyro },
      orient: { ...data.orient },
      geo: { ...data.geo },
    };
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  return {
    detect,
    needsPermissionRequest,
    requestPermissions,
    startListening,
    stopListening,
    toggleSensor,
    setSensorSelected,
    getData,
    getAllData,
    getAvailability: () => ({ ...availability }),
    getSelected: () => ({ ...selected }),
    isEnabled: () => sensorsEnabled,
    isSimulating: () => simulationMode,
  };
})();
