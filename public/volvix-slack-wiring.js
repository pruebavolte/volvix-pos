/**
 * volvix-slack-wiring.js
 * Slack integration layer for Volvix POS.
 * Exposes window.SlackAPI with webhooks, slash commands, bot messages, channels.
 *
 * Features:
 *  - Incoming webhooks (post messages to Slack)
 *  - Outgoing webhooks (receive events)
 *  - Slash command registry & dispatcher
 *  - Bot message sending (chat.postMessage)
 *  - Channel management (list, create, join, archive)
 *  - User lookup
 *  - Event subscription bus
 *  - Retry with exponential backoff
 *  - Rate-limit handling (Slack 1 msg/sec/channel)
 *  - LocalStorage credential persistence
 */
(function (global) {
  'use strict';

  // ---------- Config ----------
  const SLACK_API_BASE = 'https://slack.com/api';
  const STORAGE_KEY = 'volvix.slack.config';
  const RATE_LIMIT_MS = 1100;
  const MAX_RETRIES = 4;

  // ---------- State ----------
  const state = {
    botToken: null,
    appToken: null,
    signingSecret: null,
    defaultChannel: '#general',
    webhookUrl: null,
    workspace: null,
    connected: false,
    lastSendAt: 0,
    pendingQueue: [],
    flushing: false,
  };

  const slashCommands = new Map();
  const eventListeners = new Map();
  const channelCache = new Map();
  const userCache = new Map();

  // ---------- Persistence ----------
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      Object.assign(state, cfg);
    } catch (e) {
      console.warn('[SlackAPI] loadConfig failed', e);
    }
  }

  function saveConfig() {
    const cfg = {
      botToken: state.botToken,
      appToken: state.appToken,
      signingSecret: state.signingSecret,
      defaultChannel: state.defaultChannel,
      webhookUrl: state.webhookUrl,
      workspace: state.workspace,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (e) {
      console.warn('[SlackAPI] saveConfig failed', e);
    }
  }

  // ---------- Event bus ----------
  function on(event, handler) {
    if (!eventListeners.has(event)) eventListeners.set(event, new Set());
    eventListeners.get(event).add(handler);
    return () => eventListeners.get(event).delete(handler);
  }

  function emit(event, payload) {
    const set = eventListeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[SlackAPI] listener error', e); }
    });
  }

  // ---------- HTTP core with retry ----------
  async function slackFetch(method, body, attempt = 0) {
    if (!state.botToken) throw new Error('SlackAPI: botToken not configured');
    const url = `${SLACK_API_BASE}/${method}`;
    const opts = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body || {}),
    };
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10);
        await sleep(retryAfter * 1000);
        if (attempt < MAX_RETRIES) return slackFetch(method, body, attempt + 1);
      }
      const json = await res.json();
      if (!json.ok) {
        emit('error', { method, error: json.error, body });
        if (attempt < MAX_RETRIES && isTransient(json.error)) {
          await sleep(backoff(attempt));
          return slackFetch(method, body, attempt + 1);
        }
        throw new Error(`Slack API error: ${json.error}`);
      }
      return json;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(backoff(attempt));
        return slackFetch(method, body, attempt + 1);
      }
      throw err;
    }
  }

  function isTransient(err) {
    return ['ratelimited', 'service_unavailable', 'fatal_error', 'request_timeout'].includes(err);
  }

  function backoff(attempt) {
    return Math.min(30000, 500 * Math.pow(2, attempt));
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- Rate-limited send queue ----------
  async function flushQueue() {
    if (state.flushing) return;
    state.flushing = true;
    while (state.pendingQueue.length) {
      const job = state.pendingQueue.shift();
      const wait = Math.max(0, RATE_LIMIT_MS - (Date.now() - state.lastSendAt));
      if (wait > 0) await sleep(wait);
      try {
        const res = await slackFetch(job.method, job.body);
        state.lastSendAt = Date.now();
        job.resolve(res);
      } catch (e) {
        job.reject(e);
      }
    }
    state.flushing = false;
  }

  function enqueue(method, body) {
    return new Promise((resolve, reject) => {
      state.pendingQueue.push({ method, body, resolve, reject });
      flushQueue();
    });
  }

  // ---------- Webhooks ----------
  async function postWebhook(payload, url) {
    const target = url || state.webhookUrl;
    if (!target) throw new Error('SlackAPI: webhook URL not configured');
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (text !== 'ok') throw new Error(`Webhook failure: ${text}`);
    emit('webhook:sent', { payload, url: target });
    return true;
  }

  // ---------- Bot messages ----------
  async function postMessage(channel, text, opts = {}) {
    const body = Object.assign({
      channel: channel || state.defaultChannel,
      text: String(text ?? ''),
    }, opts);
    const res = await enqueue('chat.postMessage', body);
    emit('message:sent', res);
    return res;
  }

  async function postBlocks(channel, blocks, fallbackText = '') {
    return postMessage(channel, fallbackText, { blocks });
  }

  async function updateMessage(channel, ts, text, opts = {}) {
    return enqueue('chat.update', Object.assign({ channel, ts, text }, opts));
  }

  async function deleteMessage(channel, ts) {
    return enqueue('chat.delete', { channel, ts });
  }

  async function addReaction(channel, ts, name) {
    return enqueue('reactions.add', { channel, timestamp: ts, name });
  }

  async function uploadFile({ channels, content, filename, title, filetype }) {
    return slackFetch('files.upload', {
      channels: Array.isArray(channels) ? channels.join(',') : channels,
      content, filename, title, filetype,
    });
  }

  // ---------- Channels ----------
  async function listChannels(types = 'public_channel,private_channel') {
    const res = await slackFetch('conversations.list', { types, limit: 1000 });
    res.channels.forEach((c) => channelCache.set(c.id, c));
    return res.channels;
  }

  async function createChannel(name, isPrivate = false) {
    const res = await slackFetch('conversations.create', { name, is_private: isPrivate });
    channelCache.set(res.channel.id, res.channel);
    emit('channel:created', res.channel);
    return res.channel;
  }

  async function joinChannel(channelId) {
    return slackFetch('conversations.join', { channel: channelId });
  }

  async function archiveChannel(channelId) {
    const res = await slackFetch('conversations.archive', { channel: channelId });
    channelCache.delete(channelId);
    emit('channel:archived', { channelId });
    return res;
  }

  async function inviteToChannel(channelId, userIds) {
    return slackFetch('conversations.invite', {
      channel: channelId,
      users: Array.isArray(userIds) ? userIds.join(',') : userIds,
    });
  }

  // ---------- Users ----------
  async function listUsers() {
    const res = await slackFetch('users.list', {});
    res.members.forEach((u) => userCache.set(u.id, u));
    return res.members;
  }

  async function lookupUserByEmail(email) {
    const res = await slackFetch('users.lookupByEmail', { email });
    if (res.user) userCache.set(res.user.id, res.user);
    return res.user;
  }

  // ---------- Slash commands ----------
  function registerSlashCommand(name, handler, meta = {}) {
    const key = name.startsWith('/') ? name : `/${name}`;
    slashCommands.set(key, { handler, meta });
    emit('slash:registered', { name: key, meta });
    return () => slashCommands.delete(key);
  }

  async function dispatchSlashCommand(payload) {
    const cmd = slashCommands.get(payload.command);
    if (!cmd) {
      return { response_type: 'ephemeral', text: `Unknown command: ${payload.command}` };
    }
    try {
      const result = await cmd.handler(payload);
      emit('slash:executed', { command: payload.command, payload, result });
      return result || { response_type: 'ephemeral', text: 'OK' };
    } catch (e) {
      emit('slash:error', { command: payload.command, error: e.message });
      return { response_type: 'ephemeral', text: `Error: ${e.message}` };
    }
  }

  function listSlashCommands() {
    return Array.from(slashCommands.entries()).map(([k, v]) => ({ name: k, meta: v.meta }));
  }

  // ---------- Connection / auth test ----------
  async function connect(opts = {}) {
    if (opts.botToken) state.botToken = opts.botToken;
    if (opts.webhookUrl) state.webhookUrl = opts.webhookUrl;
    if (opts.signingSecret) state.signingSecret = opts.signingSecret;
    if (opts.defaultChannel) state.defaultChannel = opts.defaultChannel;
    const res = await slackFetch('auth.test', {});
    state.connected = true;
    state.workspace = { team: res.team, teamId: res.team_id, user: res.user, userId: res.user_id };
    saveConfig();
    emit('connected', state.workspace);
    return state.workspace;
  }

  function disconnect() {
    state.connected = false;
    state.botToken = null;
    state.webhookUrl = null;
    state.workspace = null;
    saveConfig();
    emit('disconnected', {});
  }

  function status() {
    return {
      connected: state.connected,
      workspace: state.workspace,
      defaultChannel: state.defaultChannel,
      queueLength: state.pendingQueue.length,
      slashCommands: slashCommands.size,
      cachedChannels: channelCache.size,
      cachedUsers: userCache.size,
    };
  }

  // ---------- POS-specific helpers ----------
  async function notifySale(sale) {
    const text = `:moneybag: New sale #${sale.id} — $${sale.total} (${sale.items} items)`;
    return postMessage(state.defaultChannel, text);
  }

  async function notifyLowStock(item) {
    const text = `:warning: Low stock: *${item.name}* (${item.qty} left)`;
    return postMessage(state.defaultChannel, text);
  }

  async function notifyShiftClose(report) {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `Shift closed — ${report.cashier}` } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Total:* $${report.total}` },
        { type: 'mrkdwn', text: `*Tx count:* ${report.txCount}` },
        { type: 'mrkdwn', text: `*Cash:* $${report.cash}` },
        { type: 'mrkdwn', text: `*Card:* $${report.card}` },
      ]},
    ];
    return postBlocks(state.defaultChannel, blocks, 'Shift closed');
  }

  // ---------- Init ----------
  loadConfig();

  const SlackAPI = {
    // connection
    connect, disconnect, status, configure: (o) => { Object.assign(state, o); saveConfig(); },
    // events
    on, emit,
    // webhooks
    postWebhook,
    // messages
    postMessage, postBlocks, updateMessage, deleteMessage, addReaction, uploadFile,
    // channels
    listChannels, createChannel, joinChannel, archiveChannel, inviteToChannel,
    // users
    listUsers, lookupUserByEmail,
    // slash commands
    registerSlashCommand, dispatchSlashCommand, listSlashCommands,
    // POS notifications
    notifySale, notifyLowStock, notifyShiftClose,
    // introspection
    _state: state, _channelCache: channelCache, _userCache: userCache,
  };

  global.SlackAPI = SlackAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = SlackAPI;

  console.log('[SlackAPI] volvix-slack-wiring loaded. Status:', status());
})(typeof window !== 'undefined' ? window : globalThis);
