/**
 * volvix-telegram-wiring.js
 * Telegram Bot integration for Volvix POS
 * Exposes: window.TelegramAPI
 *
 * Provides:
 *   - Bot API messaging (sendMessage, sendPhoto, sendDocument)
 *   - Command handlers (/start, /pedido, /status, /help)
 *   - Webhook receiver / long-polling fallback
 *   - Update dispatch and middleware chain
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    botToken: '',
    apiBase: 'https://api.telegram.org',
    webhookUrl: '',
    webhookSecret: '',
    pollingInterval: 2000,
    pollingTimeout: 30,
    parseMode: 'HTML',
    debug: false,
    allowedUpdates: ['message', 'callback_query', 'edited_message'],
    adminChatIds: [],
  };

  let config = Object.assign({}, DEFAULT_CONFIG);
  let pollingActive = false;
  let pollingOffset = 0;
  let pollingTimer = null;

  const commandHandlers = new Map();
  const messageHandlers = [];
  const callbackHandlers = [];
  const middlewares = [];

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────
  function log(...args) {
    if (config.debug) console.log('[TelegramAPI]', ...args);
  }
  function err(...args) {
    console.error('[TelegramAPI]', ...args);
  }

  // ─────────────────────────────────────────────────────────────
  // Low-level Bot API request
  // ─────────────────────────────────────────────────────────────
  async function call(method, params = {}) {
    if (!config.botToken) {
      throw new Error('TelegramAPI: botToken not configured');
    }
    const url = `${config.apiBase}/bot${config.botToken}/${method}`;
    log('->', method, params);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!data.ok) {
      err('Bot API error:', method, data);
      throw new Error(`Telegram ${method} failed: ${data.description}`);
    }
    log('<-', method, 'ok');
    return data.result;
  }

  // ─────────────────────────────────────────────────────────────
  // High-level send helpers
  // ─────────────────────────────────────────────────────────────
  async function sendMessage(chatId, text, opts = {}) {
    return call('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: opts.parseMode || config.parseMode,
      disable_web_page_preview: opts.disablePreview ?? true,
      reply_to_message_id: opts.replyTo,
      reply_markup: opts.replyMarkup,
    });
  }

  async function sendPhoto(chatId, photo, caption, opts = {}) {
    return call('sendPhoto', {
      chat_id: chatId,
      photo: photo,
      caption: caption || '',
      parse_mode: opts.parseMode || config.parseMode,
      reply_markup: opts.replyMarkup,
    });
  }

  async function sendDocument(chatId, document, caption, opts = {}) {
    return call('sendDocument', {
      chat_id: chatId,
      document: document,
      caption: caption || '',
      parse_mode: opts.parseMode || config.parseMode,
      reply_markup: opts.replyMarkup,
    });
  }

  async function answerCallbackQuery(id, text, showAlert = false) {
    return call('answerCallbackQuery', {
      callback_query_id: id,
      text: text || '',
      show_alert: showAlert,
    });
  }

  async function editMessageText(chatId, messageId, text, opts = {}) {
    return call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: opts.parseMode || config.parseMode,
      reply_markup: opts.replyMarkup,
    });
  }

  async function deleteMessage(chatId, messageId) {
    return call('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  async function getMe() {
    return call('getMe', {});
  }

  // ─────────────────────────────────────────────────────────────
  // Webhook management
  // ─────────────────────────────────────────────────────────────
  async function setWebhook(url, secret) {
    const target = url || config.webhookUrl;
    if (!target) throw new Error('webhook url missing');
    return call('setWebhook', {
      url: target,
      secret_token: secret || config.webhookSecret || undefined,
      allowed_updates: config.allowedUpdates,
      drop_pending_updates: false,
    });
  }

  async function deleteWebhook(dropPending = false) {
    return call('deleteWebhook', { drop_pending_updates: dropPending });
  }

  async function getWebhookInfo() {
    return call('getWebhookInfo', {});
  }

  // ─────────────────────────────────────────────────────────────
  // Command registration
  // ─────────────────────────────────────────────────────────────
  function onCommand(name, handler) {
    const key = name.replace(/^\//, '').toLowerCase();
    commandHandlers.set(key, handler);
    log('command registered:', key);
  }

  function onMessage(handler) {
    messageHandlers.push(handler);
  }

  function onCallback(handler) {
    callbackHandlers.push(handler);
  }

  function use(middleware) {
    middlewares.push(middleware);
  }

  // ─────────────────────────────────────────────────────────────
  // Default commands: /start, /pedido, /help, /status
  // ─────────────────────────────────────────────────────────────
  function registerDefaultCommands() {
    onCommand('start', async (ctx) => {
      const name = ctx.from?.first_name || 'usuario';
      await sendMessage(
        ctx.chat.id,
        `<b>Bienvenido a Volvix POS, ${name}!</b>\n\n` +
          `Comandos disponibles:\n` +
          `/pedido — crear o consultar pedido\n` +
          `/status — estado del sistema\n` +
          `/help — ayuda`
      );
    });

    onCommand('help', async (ctx) => {
      await sendMessage(
        ctx.chat.id,
        `<b>Ayuda Volvix Bot</b>\n\n` +
          `/start — iniciar\n` +
          `/pedido [id] — consultar o crear pedido\n` +
          `/status — estado del sistema\n`
      );
    });

    onCommand('status', async (ctx) => {
      await sendMessage(
        ctx.chat.id,
        `<b>Estado:</b> operativo\nHora: ${new Date().toISOString()}`
      );
    });

    onCommand('pedido', async (ctx) => {
      const arg = (ctx.args || []).join(' ').trim();
      if (!arg) {
        await sendMessage(
          ctx.chat.id,
          'Uso: <code>/pedido NUEVO</code> o <code>/pedido &lt;id&gt;</code>',
          {
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: 'Nuevo pedido', callback_data: 'pedido:nuevo' },
                  { text: 'Mis pedidos', callback_data: 'pedido:mios' },
                ],
              ],
            },
          }
        );
        return;
      }
      if (arg.toLowerCase() === 'nuevo') {
        await sendMessage(
          ctx.chat.id,
          'Creando nuevo pedido... envia los productos uno por linea.'
        );
        return;
      }
      await sendMessage(ctx.chat.id, `Consultando pedido <b>${arg}</b>...`);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Update dispatch
  // ─────────────────────────────────────────────────────────────
  function buildContext(update) {
    const msg = update.message || update.edited_message;
    const cb = update.callback_query;
    const ctx = {
      update,
      message: msg,
      callback: cb,
      chat: msg?.chat || cb?.message?.chat,
      from: msg?.from || cb?.from,
      text: msg?.text || '',
      command: null,
      args: [],
      reply: (text, opts) => sendMessage((msg?.chat || cb?.message?.chat).id, text, opts),
      answer: (text, alert) => cb && answerCallbackQuery(cb.id, text, alert),
    };
    if (ctx.text && ctx.text.startsWith('/')) {
      const parts = ctx.text.split(/\s+/);
      const head = parts[0].slice(1).split('@')[0].toLowerCase();
      ctx.command = head;
      ctx.args = parts.slice(1);
    }
    return ctx;
  }

  async function runMiddlewares(ctx) {
    for (const mw of middlewares) {
      const cont = await mw(ctx);
      if (cont === false) return false;
    }
    return true;
  }

  async function dispatch(update) {
    try {
      const ctx = buildContext(update);
      const proceed = await runMiddlewares(ctx);
      if (!proceed) return;

      if (ctx.callback) {
        for (const h of callbackHandlers) {
          try { await h(ctx); } catch (e) { err('callback handler', e); }
        }
        return;
      }

      if (ctx.command && commandHandlers.has(ctx.command)) {
        await commandHandlers.get(ctx.command)(ctx);
        return;
      }

      for (const h of messageHandlers) {
        try { await h(ctx); } catch (e) { err('message handler', e); }
      }
    } catch (e) {
      err('dispatch fatal:', e);
    }
  }

  // Webhook entry: call this from your HTTP server
  async function handleWebhookUpdate(update, providedSecret) {
    if (config.webhookSecret && providedSecret !== config.webhookSecret) {
      throw new Error('invalid webhook secret');
    }
    await dispatch(update);
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Long-polling (browser fallback / dev mode)
  // ─────────────────────────────────────────────────────────────
  async function pollOnce() {
    try {
      const updates = await call('getUpdates', {
        offset: pollingOffset,
        timeout: config.pollingTimeout,
        allowed_updates: config.allowedUpdates,
      });
      for (const u of updates) {
        pollingOffset = u.update_id + 1;
        dispatch(u);
      }
    } catch (e) {
      err('poll error:', e.message);
    }
  }

  function startPolling() {
    if (pollingActive) return;
    pollingActive = true;
    log('polling started');
    const loop = async () => {
      if (!pollingActive) return;
      await pollOnce();
      pollingTimer = setTimeout(loop, config.pollingInterval);
    };
    loop();
  }

  function stopPolling() {
    pollingActive = false;
    if (pollingTimer) clearTimeout(pollingTimer);
    pollingTimer = null;
    log('polling stopped');
  }

  // ─────────────────────────────────────────────────────────────
  // Admin broadcast utility
  // ─────────────────────────────────────────────────────────────
  async function notifyAdmins(text, opts) {
    const results = [];
    for (const id of config.adminChatIds || []) {
      try {
        results.push(await sendMessage(id, text, opts));
      } catch (e) {
        err('notifyAdmins fail', id, e.message);
      }
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // Init / config
  // ─────────────────────────────────────────────────────────────
  function configure(opts) {
    config = Object.assign({}, config, opts || {});
    log('configured', { hasToken: !!config.botToken, debug: config.debug });
  }

  async function init(opts) {
    configure(opts);
    registerDefaultCommands();
    if (config.botToken) {
      try {
        const me = await getMe();
        log('bot identity:', me.username);
      } catch (e) {
        err('init getMe failed:', e.message);
      }
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────
  const TelegramAPI = {
    // lifecycle
    init,
    configure,
    // raw
    call,
    // messaging
    sendMessage,
    sendPhoto,
    sendDocument,
    editMessageText,
    deleteMessage,
    answerCallbackQuery,
    getMe,
    // webhook
    setWebhook,
    deleteWebhook,
    getWebhookInfo,
    handleWebhookUpdate,
    // polling
    startPolling,
    stopPolling,
    // handlers
    onCommand,
    onMessage,
    onCallback,
    use,
    // utils
    notifyAdmins,
    // introspection
    get config() { return Object.assign({}, config); },
    get commands() { return Array.from(commandHandlers.keys()); },
  };

  global.TelegramAPI = TelegramAPI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TelegramAPI;
  }
})(typeof window !== 'undefined' ? window : globalThis);
