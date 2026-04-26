/**
 * volvix-geofence-wiring.js
 * Geofencing module for Volvix POS.
 *
 * Detects when an employee enters/exits the configured store premises,
 * fires alerts, and optionally performs auto clock-in/clock-out.
 *
 * Public API: window.GeofenceAPI
 *
 * Storage keys:
 *   - volvix_geofence_config   { lat, lng, radiusMeters, autoClockIn, autoClockOut, alertOnExit }
 *   - volvix_geofence_state    { inside, lastTransitionTs, lastLat, lastLng, lastAccuracy }
 *   - volvix_geofence_log      [ { ts, type, lat, lng, accuracy, distance } ... ]
 */
(function (global) {
  'use strict';

  // ---------- Constants ----------
  var CFG_KEY     = 'volvix_geofence_config';
  var STATE_KEY   = 'volvix_geofence_state';
  var LOG_KEY     = 'volvix_geofence_log';
  var LOG_MAX     = 500;
  var EARTH_R_M   = 6371000; // meters
  var DEFAULT_CFG = {
    lat: null,
    lng: null,
    radiusMeters: 75,
    autoClockIn: true,
    autoClockOut: true,
    alertOnExit: true,
    pollIntervalMs: 15000,
    minAccuracyMeters: 100,
    hysteresisMeters: 15,
    debounceMs: 30000
  };

  // ---------- Internal state ----------
  var _watchId = null;
  var _pollTimer = null;
  var _listeners = { enter: [], exit: [], update: [], error: [] };
  var _running = false;
  var _lastFixTs = 0;

  // ---------- Storage helpers ----------
  function _read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function _write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
  }

  function getConfig() {
    var c = _read(CFG_KEY, null);
    if (!c) return Object.assign({}, DEFAULT_CFG);
    return Object.assign({}, DEFAULT_CFG, c);
  }
  function setConfig(patch) {
    var merged = Object.assign({}, getConfig(), patch || {});
    _write(CFG_KEY, merged);
    return merged;
  }

  function getState() {
    return _read(STATE_KEY, { inside: false, lastTransitionTs: 0, lastLat: null, lastLng: null, lastAccuracy: null });
  }
  function _setState(patch) {
    var merged = Object.assign({}, getState(), patch);
    _write(STATE_KEY, merged);
    return merged;
  }

  // ---------- Logging ----------
  function _log(entry) {
    var arr = _read(LOG_KEY, []);
    arr.push(Object.assign({ ts: Date.now() }, entry));
    if (arr.length > LOG_MAX) arr = arr.slice(arr.length - LOG_MAX);
    _write(LOG_KEY, arr);
  }
  function getLog(limit) {
    var arr = _read(LOG_KEY, []);
    if (typeof limit === 'number' && limit > 0) return arr.slice(-limit);
    return arr;
  }
  function clearLog() { _write(LOG_KEY, []); }

  // ---------- Math: haversine distance ----------
  function _toRad(d) { return d * Math.PI / 180; }
  function distanceMeters(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
    var dLat = _toRad(lat2 - lat1);
    var dLng = _toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_R_M * c;
  }

  // ---------- Event emitter ----------
  function on(evt, fn) {
    if (!_listeners[evt]) _listeners[evt] = [];
    _listeners[evt].push(fn);
    return function off() {
      _listeners[evt] = _listeners[evt].filter(function (f) { return f !== fn; });
    };
  }
  function _emit(evt, payload) {
    (_listeners[evt] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('[Geofence] listener error', e); }
    });
  }

  // ---------- Alerts ----------
  function _alert(title, body) {
    try {
      if ('Notification' in global && Notification.permission === 'granted') {
        new Notification(title, { body: body, icon: '/icon.png' });
        return;
      }
    } catch (e) { /* noop */ }
    if (global.VolvixToast && typeof global.VolvixToast.show === 'function') {
      global.VolvixToast.show(title + ': ' + body);
      return;
    }
    console.log('[Geofence] ' + title + ': ' + body);
  }
  function requestNotificationPermission() {
    if (!('Notification' in global)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    return Notification.requestPermission();
  }

  // ---------- Clock integration ----------
  function _autoClockIn(meta) {
    try {
      if (global.VolvixClock && typeof global.VolvixClock.clockIn === 'function') {
        global.VolvixClock.clockIn({ source: 'geofence', meta: meta });
      } else if (global.ClockAPI && typeof global.ClockAPI.in === 'function') {
        global.ClockAPI.in({ source: 'geofence', meta: meta });
      }
    } catch (e) { console.warn('[Geofence] auto clock-in failed', e); }
  }
  function _autoClockOut(meta) {
    try {
      if (global.VolvixClock && typeof global.VolvixClock.clockOut === 'function') {
        global.VolvixClock.clockOut({ source: 'geofence', meta: meta });
      } else if (global.ClockAPI && typeof global.ClockAPI.out === 'function') {
        global.ClockAPI.out({ source: 'geofence', meta: meta });
      }
    } catch (e) { console.warn('[Geofence] auto clock-out failed', e); }
  }

  // ---------- Core evaluation ----------
  function _evaluatePosition(pos) {
    var cfg = getConfig();
    var state = getState();
    if (cfg.lat == null || cfg.lng == null) {
      _emit('error', { code: 'NO_FENCE', message: 'No geofence configured' });
      return;
    }
    var coords = pos.coords || pos;
    var lat = coords.latitude;
    var lng = coords.longitude;
    var acc = coords.accuracy != null ? coords.accuracy : 9999;

    if (acc > cfg.minAccuracyMeters) {
      _log({ type: 'low_accuracy', lat: lat, lng: lng, accuracy: acc });
      return;
    }

    var dist = distanceMeters(lat, lng, cfg.lat, cfg.lng);
    var hyst = cfg.hysteresisMeters || 0;
    var insideNow;
    if (state.inside) {
      insideNow = dist <= (cfg.radiusMeters + hyst);
    } else {
      insideNow = dist <= Math.max(0, cfg.radiusMeters - hyst);
    }

    var now = Date.now();
    _lastFixTs = now;
    _setState({ lastLat: lat, lastLng: lng, lastAccuracy: acc });
    _emit('update', { lat: lat, lng: lng, accuracy: acc, distance: dist, inside: insideNow });

    if (insideNow !== state.inside) {
      if (now - state.lastTransitionTs < cfg.debounceMs) {
        _log({ type: 'debounced', lat: lat, lng: lng, accuracy: acc, distance: dist });
        return;
      }
      _setState({ inside: insideNow, lastTransitionTs: now });
      if (insideNow) {
        _log({ type: 'enter', lat: lat, lng: lng, accuracy: acc, distance: dist });
        _emit('enter', { lat: lat, lng: lng, accuracy: acc, distance: dist });
        _alert('Llegaste al local', 'Distancia: ' + Math.round(dist) + ' m');
        if (cfg.autoClockIn) _autoClockIn({ lat: lat, lng: lng, accuracy: acc, distance: dist });
      } else {
        _log({ type: 'exit', lat: lat, lng: lng, accuracy: acc, distance: dist });
        _emit('exit', { lat: lat, lng: lng, accuracy: acc, distance: dist });
        if (cfg.alertOnExit) _alert('Saliste del local', 'Distancia: ' + Math.round(dist) + ' m');
        if (cfg.autoClockOut) _autoClockOut({ lat: lat, lng: lng, accuracy: acc, distance: dist });
      }
    }
  }

  function _onError(err) {
    _emit('error', { code: err.code, message: err.message });
    _log({ type: 'error', code: err.code, message: err.message });
  }

  // ---------- Lifecycle ----------
  function start() {
    if (_running) return true;
    if (!('geolocation' in global.navigator)) {
      _emit('error', { code: 'NO_GEO', message: 'Geolocation API unavailable' });
      return false;
    }
    var cfg = getConfig();
    _running = true;
    try {
      _watchId = global.navigator.geolocation.watchPosition(
        _evaluatePosition,
        _onError,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
    } catch (e) {
      _emit('error', { code: 'WATCH_FAIL', message: String(e) });
    }
    _pollTimer = setInterval(function () {
      if (Date.now() - _lastFixTs > (cfg.pollIntervalMs * 2)) {
        try {
          global.navigator.geolocation.getCurrentPosition(
            _evaluatePosition, _onError,
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
          );
        } catch (e) { /* noop */ }
      }
    }, cfg.pollIntervalMs);
    return true;
  }

  function stop() {
    _running = false;
    if (_watchId != null) {
      try { global.navigator.geolocation.clearWatch(_watchId); } catch (e) {}
      _watchId = null;
    }
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function isRunning() { return _running; }

  // ---------- Helpers exposed ----------
  function setFenceFromCurrentPosition(radiusMeters) {
    return new Promise(function (resolve, reject) {
      if (!('geolocation' in global.navigator)) return reject(new Error('NO_GEO'));
      global.navigator.geolocation.getCurrentPosition(function (pos) {
        var cfg = setConfig({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radiusMeters: radiusMeters || getConfig().radiusMeters
        });
        resolve(cfg);
      }, function (err) {
        reject(err);
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    });
  }

  function getCurrentDistance() {
    var cfg = getConfig();
    var st = getState();
    if (st.lastLat == null) return null;
    return distanceMeters(st.lastLat, st.lastLng, cfg.lat, cfg.lng);
  }

  function reset() {
    stop();
    _write(STATE_KEY, { inside: false, lastTransitionTs: 0, lastLat: null, lastLng: null, lastAccuracy: null });
    clearLog();
  }

  // ---------- Auto-boot ----------
  function _boot() {
    var cfg = getConfig();
    if (cfg.lat != null && cfg.lng != null) {
      try { start(); } catch (e) { console.warn('[Geofence] autostart failed', e); }
    }
  }
  if (global.document && global.document.readyState === 'complete') {
    setTimeout(_boot, 0);
  } else if (global.addEventListener) {
    global.addEventListener('load', _boot);
  }

  // ---------- Public API ----------
  global.GeofenceAPI = {
    start: start,
    stop: stop,
    isRunning: isRunning,
    on: on,
    getConfig: getConfig,
    setConfig: setConfig,
    getState: getState,
    getLog: getLog,
    clearLog: clearLog,
    distanceMeters: distanceMeters,
    getCurrentDistance: getCurrentDistance,
    setFenceFromCurrentPosition: setFenceFromCurrentPosition,
    requestNotificationPermission: requestNotificationPermission,
    reset: reset,
    VERSION: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : this);
