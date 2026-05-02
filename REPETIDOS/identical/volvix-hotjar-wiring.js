/**
 * volvix-hotjar-wiring.js
 * Hotjar integration for Volvix POS
 * Provides: heatmaps, recordings, surveys, feedback widgets
 * Exposes: window.HotjarAPI
 */
(function (global) {
  'use strict';

  const CONFIG = {
    siteId: global.__VOLVIX_HOTJAR_SITE_ID__ || 0,
    hjsv: 6,
    scriptUrl: 'https://static.hotjar.com/c/hotjar-',
    endpoint: 'https://in.hotjar.com',
    debug: false,
    autoTrackRoutes: true,
    autoTrackForms: true,
    autoTrackErrors: true,
    sampleRate: 1.0,
    suppressPII: true,
  };

  const STATE = {
    loaded: false,
    loading: false,
    queue: [],
    userId: null,
    sessionAttrs: {},
    heatmapTags: [],
    recordingActive: false,
    surveysShown: new Set(),
    triggers: new Map(),
    listeners: { ready: [], event: [], survey: [], feedback: [] },
    startedAt: null,
  };

  function log() {
    if (CONFIG.debug) console.log('[HotjarAPI]', ...arguments);
  }

  function warn() {
    console.warn('[HotjarAPI]', ...arguments);
  }

  function emit(channel, payload) {
    (STATE.listeners[channel] || []).forEach(function (cb) {
      try { cb(payload); } catch (e) { warn('listener error', e); }
    });
  }

  function pushQueue(args) {
    if (!global.hj) {
      global.hj = function () {
        (global.hj.q = global.hj.q || []).push(arguments);
      };
      global._hjSettings = { hjid: CONFIG.siteId, hjsv: CONFIG.hjsv };
    }
    global.hj.apply(null, args);
  }

  function loadScript() {
    if (STATE.loaded || STATE.loading) return Promise.resolve(STATE.loaded);
    if (!CONFIG.siteId) {
      warn('siteId missing — set window.__VOLVIX_HOTJAR_SITE_ID__ before init');
      return Promise.reject(new Error('no siteId'));
    }
    STATE.loading = true;
    return new Promise(function (resolve, reject) {
      const head = document.getElementsByTagName('head')[0] || document.documentElement;
      const s = document.createElement('script');
      s.async = 1;
      s.src = CONFIG.scriptUrl + CONFIG.siteId + '.js?sv=' + CONFIG.hjsv;
      s.onload = function () {
        STATE.loaded = true;
        STATE.loading = false;
        STATE.startedAt = Date.now();
        log('script loaded', CONFIG.siteId);
        flushQueue();
        emit('ready', { siteId: CONFIG.siteId });
        resolve(true);
      };
      s.onerror = function (e) {
        STATE.loading = false;
        warn('script failed to load', e);
        reject(e);
      };
      head.appendChild(s);
    });
  }

  function flushQueue() {
    while (STATE.queue.length) {
      const item = STATE.queue.shift();
      try { pushQueue(item); } catch (e) { warn('flush error', e); }
    }
  }

  function call() {
    const args = Array.prototype.slice.call(arguments);
    if (!STATE.loaded) {
      STATE.queue.push(args);
      pushQueue(args); // hj() stub also queues internally
      return;
    }
    pushQueue(args);
  }

  function shouldSample() {
    return Math.random() < CONFIG.sampleRate;
  }

  function scrub(value) {
    if (!CONFIG.suppressPII) return value;
    if (typeof value !== 'string') return value;
    return value
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/\b\d{13,19}\b/g, '[card]')
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[ssn]');
  }

  // ── Public API ───────────────────────────────────────────────────────
  const HotjarAPI = {
    configure: function (opts) {
      Object.assign(CONFIG, opts || {});
      log('configured', CONFIG);
      return this;
    },

    init: function (siteId) {
      if (siteId) CONFIG.siteId = siteId;
      if (!shouldSample()) {
        log('user not sampled, skipping');
        return Promise.resolve(false);
      }
      return loadScript().then(function () {
        if (CONFIG.autoTrackRoutes) HotjarAPI._wireRoutes();
        if (CONFIG.autoTrackForms) HotjarAPI._wireForms();
        if (CONFIG.autoTrackErrors) HotjarAPI._wireErrors();
        return true;
      });
    },

    identify: function (userId, attrs) {
      STATE.userId = userId;
      STATE.sessionAttrs = Object.assign({}, STATE.sessionAttrs, attrs || {});
      const safe = {};
      Object.keys(STATE.sessionAttrs).forEach(function (k) {
        safe[k] = scrub(STATE.sessionAttrs[k]);
      });
      call('identify', userId, safe);
      log('identify', userId, safe);
      return this;
    },

    event: function (name, props) {
      if (!name) return this;
      call('event', name);
      emit('event', { name: name, props: props || {} });
      log('event', name, props);
      return this;
    },

    // Heatmap tagging
    tagRecording: function (tags) {
      const arr = Array.isArray(tags) ? tags : [tags];
      STATE.heatmapTags = STATE.heatmapTags.concat(arr);
      call('tagRecording', arr);
      log('tagRecording', arr);
      return this;
    },

    // Recordings
    startRecording: function () {
      STATE.recordingActive = true;
      call('stateChange', location.pathname + '?_rec=1');
      log('recording started');
      return this;
    },

    stopRecording: function () {
      STATE.recordingActive = false;
      log('recording stopped (will end with session)');
      return this;
    },

    // Virtual page views (SPA)
    trackPageView: function (path) {
      const p = path || (location.pathname + location.search);
      call('stateChange', p);
      log('pageview', p);
      return this;
    },

    // Surveys
    triggerSurvey: function (triggerName) {
      if (STATE.surveysShown.has(triggerName)) {
        log('survey already shown', triggerName);
        return this;
      }
      STATE.surveysShown.add(triggerName);
      call('trigger', triggerName);
      emit('survey', { trigger: triggerName });
      log('survey trigger', triggerName);
      return this;
    },

    registerTrigger: function (name, predicateFn) {
      STATE.triggers.set(name, predicateFn);
      log('trigger registered', name);
      return this;
    },

    evaluateTriggers: function (context) {
      STATE.triggers.forEach(function (fn, name) {
        try {
          if (fn(context)) HotjarAPI.triggerSurvey(name);
        } catch (e) { warn('trigger eval error', name, e); }
      });
      return this;
    },

    // Feedback widget
    showFeedback: function (widgetName) {
      call('trigger', widgetName || 'feedback_widget');
      emit('feedback', { widget: widgetName });
      log('feedback shown', widgetName);
      return this;
    },

    // Listeners
    on: function (channel, cb) {
      if (!STATE.listeners[channel]) STATE.listeners[channel] = [];
      STATE.listeners[channel].push(cb);
      return this;
    },

    off: function (channel, cb) {
      const arr = STATE.listeners[channel] || [];
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
      return this;
    },

    // Diagnostics
    status: function () {
      return {
        loaded: STATE.loaded,
        loading: STATE.loading,
        siteId: CONFIG.siteId,
        userId: STATE.userId,
        recordingActive: STATE.recordingActive,
        tags: STATE.heatmapTags.slice(),
        surveysShown: Array.from(STATE.surveysShown),
        queueSize: STATE.queue.length,
        startedAt: STATE.startedAt,
        uptimeMs: STATE.startedAt ? Date.now() - STATE.startedAt : 0,
      };
    },

    setDebug: function (flag) {
      CONFIG.debug = !!flag;
      return this;
    },

    // ── Internal wiring ────────────────────────────────────────────────
    _wireRoutes: function () {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function () {
        const r = origPush.apply(this, arguments);
        HotjarAPI.trackPageView();
        return r;
      };
      history.replaceState = function () {
        const r = origReplace.apply(this, arguments);
        HotjarAPI.trackPageView();
        return r;
      };
      window.addEventListener('popstate', function () {
        HotjarAPI.trackPageView();
      });
      log('route tracking wired');
    },

    _wireForms: function () {
      document.addEventListener('submit', function (ev) {
        const form = ev.target;
        if (!form || form.tagName !== 'FORM') return;
        const id = form.id || form.name || 'unnamed_form';
        HotjarAPI.event('form_submit_' + id);
        HotjarAPI.tagRecording(['form:' + id]);
      }, true);
      log('form tracking wired');
    },

    _wireErrors: function () {
      window.addEventListener('error', function (e) {
        HotjarAPI.event('js_error');
        HotjarAPI.tagRecording(['error:' + (e.message || 'unknown').slice(0, 40)]);
      });
      window.addEventListener('unhandledrejection', function () {
        HotjarAPI.event('promise_rejection');
        HotjarAPI.tagRecording(['error:promise']);
      });
      log('error tracking wired');
    },
  };

  global.HotjarAPI = HotjarAPI;

  // Auto-init if site id is present
  if (global.__VOLVIX_HOTJAR_SITE_ID__ && !global.__VOLVIX_HOTJAR_MANUAL__) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { HotjarAPI.init(); });
    } else {
      HotjarAPI.init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
