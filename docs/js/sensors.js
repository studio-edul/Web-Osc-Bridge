/**
 * WOB Sensor Module
 * Detects available sensors, handles permissions, collects and normalizes data.
 */
const SensorModule = (() => {
  // Sensor availability
  const availability = {
    motion: false,
    orientation: false,
    geolocation: false,
    microphone: false,
    ambientLight: false,
    proximity: false,
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
  let onDataCallback = null;

  // Normalization constants
  const ACCEL_MAX = 9.81; // 1g
  const GYRO_MAX = 360;

  /**
   * Detect available sensors via feature detection
   */
  function detect() {
    // Motion (accelerometer + gyroscope)
    availability.motion = typeof DeviceMotionEvent !== 'undefined';

    // Orientation
    availability.orientation = typeof DeviceOrientationEvent !== 'undefined';

    // Geolocation
    availability.geolocation = 'geolocation' in navigator;

    // Microphone
    availability.microphone = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    // Ambient Light
    availability.ambientLight = typeof AmbientLightSensor !== 'undefined';

    // Proximity
    availability.proximity = typeof ProximitySensor !== 'undefined';

    return { ...availability };
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

    // iOS motion permission
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

    // iOS orientation permission
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

    // Geolocation permission
    if (availability.geolocation) {
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
   * Start collecting sensor data
   */
  function startListening(callback) {
    onDataCallback = callback;
    sensorsEnabled = true;

    // DeviceMotion (accelerometer + gyroscope)
    if (availability.motion) {
      motionListener = (e) => {
        const a = e.accelerationIncludingGravity || {};
        raw.accel.x = a.x || 0;
        raw.accel.y = a.y || 0;
        raw.accel.z = a.z || 0;

        // Normalize to -1..1
        data.accel.x = clamp(raw.accel.x / ACCEL_MAX, -1, 1);
        data.accel.y = clamp(raw.accel.y / ACCEL_MAX, -1, 1);
        data.accel.z = clamp(raw.accel.z / ACCEL_MAX, -1, 1);

        // Gyroscope (rotation rate)
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

        // Normalize: alpha 0-360 -> 0-1, beta -180~180 -> 0-1, gamma -90~90 -> 0-1
        data.orient.alpha = (raw.orient.alpha % 360) / 360;
        data.orient.beta = (raw.orient.beta + 180) / 360;
        data.orient.gamma = (raw.orient.gamma + 90) / 180;
      };
      window.addEventListener('deviceorientation', orientListener);
    }

    // Geolocation
    if (availability.geolocation) {
      geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          data.geo.lat = pos.coords.latitude;
          data.geo.lon = pos.coords.longitude;
        },
        (err) => console.warn('Geo error:', err.message),
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    }
  }

  /**
   * Stop collecting
   */
  function stopListening() {
    sensorsEnabled = false;
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
   * Get current data snapshot
   */
  function getData() {
    return {
      accel: { ...data.accel },
      gyro: { ...data.gyro },
      orient: { ...data.orient },
      geo: { ...data.geo },
    };
  }

  function getRawData() {
    return {
      accel: { ...raw.accel },
      gyro: { ...raw.gyro },
      orient: { ...raw.orient },
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
    getData,
    getRawData,
    getAvailability: () => ({ ...availability }),
    isEnabled: () => sensorsEnabled,
  };
})();
