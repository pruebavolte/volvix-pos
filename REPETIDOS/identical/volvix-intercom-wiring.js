/**
 * volvix-intercom-wiring.js
 * Intercom integration: chat widget, user identify, events, conversations.
 * Exposes window.IntercomAPI with a stable surface used across Volvix.
 *
 * Usage:
 *   IntercomAPI.init({ appId: 'xxxx' });
 *   IntercomAPI.identify({ userId, email, name, createdAt, plan });
 *   IntercomAPI.track('checkout_completed', { total: 199 });
 *   IntercomAPI.show(); IntercomAPI.hide(); IntercomAPI.toggle();
 *   IntercomAPI.startConversation('Hola, necesito ayuda');
 *   IntercomAPI.shutdown();
 */
(function (global) {
  'use strict';

  var STATE = {
    appId: null,
    booted: false,
    user: null,
    queue: [],
    listeners: {
      ready: [],
      open: [],
      close: [],
      unread: [],
      message: [],
      conversation: []
    },
    unreadCount: 0,
    lastConversationId: null,
    debug: false
  };

  function log() {
    if (!STATE.debug) return;
    try { console.log.apply(console, ['[IntercomAPI]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function emit(evt, payload) {
    var arr = STATE.listeners[evt] || [];
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](payload); } catch (e) { log('listener error', evt, e); }
    }
  }

  function on(evt, cb) {
    if (!STATE.listeners[evt]) STATE.listeners[evt] = [];
    STATE.listeners[evt].push(cb);
    return function off() {
      STATE.listeners[evt] = STATE.listeners[evt].filter(function (f) { return f !== cb; });
    };
  }

  function loadScript(appId) {
    return new Promise(function (resolve, reject) {
      if (global.Intercom && global.Intercom.booted) return resolve();
      var w = global; var ic = w.Intercom;
      if (typeof ic === 'function') {
        ic('reattach_activator');
        ic('update', w.intercomSettings || {});
        return resolve();
      }
      var d = global.document;
      var i = function () { i.c(arguments); };
      i.q = []; i.c = function (args) { i.q.push(args); };
      w.Intercom = i;
      var s = d.createElement('script');
      s.type = 'text/javascript';
      s.async = true;
      s.src = 'https://widget.intercom.io/widget/' + appId;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Intercom script failed to load')); };
      var x = d.getElementsByTagName('script')[0];
      if (x && x.parentNode) x.parentNode.insertBefore(s, x); else d.head.appendChild(s);
    });
  }

  function flushQueue() {
    while (STATE.queue.length) {
      var item = STATE.queue.shift();
      try { global.Intercom.apply(null, item); } catch (e) { log('queue flush err', e); }
    }
  }

  function call() {
    var args = [].slice.call(arguments);
    if (!STATE.booted || typeof global.Intercom !== 'function') {
      STATE.queue.push(args);
      return;
    }
    try { global.Intercom.apply(null, args); } catch (e) { log('call err', args[0], e); }
  }

  function bindNativeEvents() {
    if (typeof global.Intercom !== 'function') return;
    global.Intercom('onShow', function () { emit('open'); log('open'); });
    global.Intercom('onHide', function () { emit('close'); log('close'); });
    global.Intercom('onUnreadCountChange', function (n) {
      STATE.unreadCount = n || 0;
      emit('unread', STATE.unreadCount);
    });
    if (typeof global.Intercom === 'function') {
      try {
        global.Intercom('onConversationsLoaded', function () { emit('conversation', { type: 'loaded' }); });
      } catch (e) {}
    }
  }

  var IntercomAPI = {
    /** Initialize and boot the widget. */
    init: function (opts) {
      opts = opts || {};
      if (!opts.appId) throw new Error('IntercomAPI.init: appId is required');
      if (STATE.booted && STATE.appId === opts.appId) return Promise.resolve();
      STATE.appId = opts.appId;
      STATE.debug = !!opts.debug;
      var settings = Object.assign({ app_id: opts.appId }, opts.settings || {});
      global.intercomSettings = settings;
      return loadScript(opts.appId).then(function () {
        global.Intercom('boot', settings);
        STATE.booted = true;
        bindNativeEvents();
        flushQueue();
        emit('ready', { appId: opts.appId });
        log('booted', opts.appId);
      });
    },

    /** Identify the current user. */
    identify: function (user) {
      if (!user) return;
      STATE.user = user;
      var payload = {
        user_id: user.userId || user.user_id,
        email: user.email,
        name: user.name,
        created_at: user.createdAt || user.created_at,
        user_hash: user.userHash || user.user_hash
      };
      if (user.plan) payload.plan = user.plan;
      if (user.company) payload.company = user.company;
      if (user.customAttributes) Object.assign(payload, user.customAttributes);
      call('update', payload);
      log('identify', payload.user_id || payload.email);
    },

    /** Update arbitrary user attributes. */
    update: function (attrs) {
      call('update', attrs || {});
    },

    /** Track a custom event. */
    track: function (eventName, metadata) {
      if (!eventName) return;
      call('trackEvent', eventName, metadata || {});
      log('track', eventName, metadata);
    },

    /** Show the messenger. */
    show: function () { call('show'); },

    /** Hide the messenger. */
    hide: function () { call('hide'); },

    /** Toggle visibility. */
    toggle: function () {
      // Intercom has no native toggle; simulate using last-known state.
      if (STATE._open) call('hide'); else call('show');
      STATE._open = !STATE._open;
    },

    /** Open the new-message composer with optional prefilled text. */
    startConversation: function (message) {
      if (message) call('showNewMessage', String(message));
      else call('showNewMessage');
      emit('conversation', { type: 'new', message: message || null });
    },

    /** Show a specific conversation by id. */
    showConversation: function (conversationId) {
      if (!conversationId) return;
      STATE.lastConversationId = conversationId;
      call('showConversation', conversationId);
      emit('conversation', { type: 'show', id: conversationId });
    },

    /** Show inbox / messages list. */
    showMessages: function () { call('showMessages'); },

    /** Show help center home. */
    showHelp: function () { call('showSpace', 'home'); },

    /** Show news space. */
    showNews: function () { call('showSpace', 'news'); },

    /** Show tasks space. */
    showTasks: function () { call('showSpace', 'tasks'); },

    /** Trigger an article by id. */
    showArticle: function (articleId) {
      if (!articleId) return;
      call('showArticle', articleId);
    },

    /** Subscribe to events: ready, open, close, unread, message, conversation. */
    on: on,

    /** One-shot subscription. */
    once: function (evt, cb) {
      var off = on(evt, function (p) { off(); cb(p); });
      return off;
    },

    /** Current unread count. */
    getUnreadCount: function () { return STATE.unreadCount; },

    /** Whether the widget is booted. */
    isReady: function () { return STATE.booted; },

    /** Currently identified user (last value passed to identify). */
    getUser: function () { return STATE.user; },

    /** Hard reset: shuts down the Intercom session and clears local state. */
    shutdown: function () {
      try { call('shutdown'); } catch (e) {}
      STATE.booted = false;
      STATE.user = null;
      STATE.queue = [];
      STATE.unreadCount = 0;
      STATE.lastConversationId = null;
      emit('close');
      log('shutdown');
    },

    /** Re-boot after shutdown (e.g., on logout/login). */
    reboot: function (user) {
      this.shutdown();
      return this.init({ appId: STATE.appId, debug: STATE.debug })
        .then(function () { if (user) IntercomAPI.identify(user); });
    },

    /** Convenience: tag a page view with metadata. */
    page: function (name, props) {
      this.track('page_viewed', Object.assign({ page: name || (global.location && global.location.pathname) }, props || {}));
    },

    /** Enable/disable verbose logging. */
    setDebug: function (v) { STATE.debug = !!v; },

    /** Internal: expose state for diagnostics. */
    _state: function () { return STATE; }
  };

  // Auto-init from <script data-intercom-app-id="xxxx"> if present.
  try {
    var d = global.document;
    if (d && d.currentScript && d.currentScript.dataset && d.currentScript.dataset.intercomAppId) {
      IntercomAPI.init({
        appId: d.currentScript.dataset.intercomAppId,
        debug: d.currentScript.dataset.intercomDebug === 'true'
      });
    }
  } catch (e) { /* noop */ }

  global.IntercomAPI = IntercomAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = IntercomAPI;
})(typeof window !== 'undefined' ? window : globalThis);
