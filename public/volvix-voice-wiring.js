/**
 * volvix-voice-wiring.js
 * Volvix POS — Comandos de Voz con Web Speech API
 * Agent-19 / Ronda 7 Fibonacci
 *
 * Funcionalidades:
 *  - Botón micrófono flotante con animación de onda
 *  - SpeechRecognition para escuchar comandos
 *  - SpeechSynthesis para responder al usuario
 *  - Wake word opcional ("Volvix")
 *  - Idioma configurable (es-MX por default)
 *  - Comandos: cobrar, buscar, total, cuántas ventas, abrir, cerrar sesión, ayuda
 */

(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURACIÓN
  // ═══════════════════════════════════════════════════════════════
  const VolvixVoiceConfig = {
    lang: 'es-MX',
    wakeWord: 'volvix',
    requireWakeWord: false,
    continuous: true,
    interimResults: true,
    voiceRate: 1.0,
    voicePitch: 1.0,
    voiceVolume: 1.0,
    debug: true,
    micPosition: { bottom: '24px', right: '24px' },
    autoRestart: true,
    confidenceThreshold: 0.55
  };

  // ═══════════════════════════════════════════════════════════════
  // ESTADO INTERNO
  // ═══════════════════════════════════════════════════════════════
  const state = {
    recognition: null,
    synth: window.speechSynthesis || null,
    listening: false,
    awakened: false,
    micButton: null,
    waveContainer: null,
    transcriptDisplay: null,
    lastCommand: '',
    commandHistory: [],
    commandHandlers: new Map(),
    voicesLoaded: false,
    selectedVoice: null
  };

  // ═══════════════════════════════════════════════════════════════
  // LOG
  // ═══════════════════════════════════════════════════════════════
  function log(...args) {
    if (VolvixVoiceConfig.debug) {
      console.log('[VolvixVoice]', ...args);
    }
  }
  function warn(...args) {
    console.warn('[VolvixVoice]', ...args);
  }
  function err(...args) {
    console.error('[VolvixVoice]', ...args);
  }

  // ═══════════════════════════════════════════════════════════════
  // SOPORTE DEL NAVEGADOR
  // ═══════════════════════════════════════════════════════════════
  function isSupported() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return !!SR && !!window.speechSynthesis;
  }

  // ═══════════════════════════════════════════════════════════════
  // ESTILOS (inyectados al iniciar)
  // ═══════════════════════════════════════════════════════════════
  const STYLES = `
    .volvix-mic-btn {
      position: fixed;
      bottom: ${VolvixVoiceConfig.micPosition.bottom};
      right: ${VolvixVoiceConfig.micPosition.right};
      width: 64px; height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      color: white;
      font-size: 28px;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(99,102,241,0.45);
      z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s, background .2s;
    }
    .volvix-mic-btn:hover { transform: scale(1.08); }
    .volvix-mic-btn.listening {
      background: linear-gradient(135deg, #ef4444, #f97316);
      animation: volvix-pulse 1.4s ease-in-out infinite;
    }
    @keyframes volvix-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
      50%     { box-shadow: 0 0 0 18px rgba(239,68,68,0); }
    }
    .volvix-wave {
      position: fixed;
      bottom: 100px; right: 24px;
      display: flex; gap: 4px;
      height: 36px; align-items: center;
      padding: 8px 12px;
      background: rgba(15,23,42,0.85);
      border-radius: 18px;
      z-index: 9999;
      opacity: 0; pointer-events: none;
      transition: opacity .25s;
    }
    .volvix-wave.active { opacity: 1; }
    .volvix-wave span {
      display: inline-block;
      width: 4px; height: 8px;
      background: #a5b4fc;
      border-radius: 2px;
      animation: volvix-wave-bar 1s ease-in-out infinite;
    }
    .volvix-wave span:nth-child(1) { animation-delay: 0.0s; }
    .volvix-wave span:nth-child(2) { animation-delay: 0.1s; }
    .volvix-wave span:nth-child(3) { animation-delay: 0.2s; }
    .volvix-wave span:nth-child(4) { animation-delay: 0.3s; }
    .volvix-wave span:nth-child(5) { animation-delay: 0.4s; }
    @keyframes volvix-wave-bar {
      0%,100% { height: 6px; }
      50%     { height: 26px; }
    }
    .volvix-transcript {
      position: fixed;
      bottom: 150px; right: 24px;
      max-width: 360px;
      padding: 10px 14px;
      background: rgba(15,23,42,0.92);
      color: #e0e7ff;
      border-radius: 12px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity .25s, transform .25s;
      pointer-events: none;
    }
    .volvix-transcript.show {
      opacity: 1; transform: translateY(0);
    }
  `;

  function injectStyles() {
    if (document.getElementById('volvix-voice-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'volvix-voice-styles';
    tag.textContent = STYLES;
    document.head.appendChild(tag);
  }

  // ═══════════════════════════════════════════════════════════════
  // UI: Botón + onda + transcripción
  // ═══════════════════════════════════════════════════════════════
  function buildUI() {
    // 2026-05-07 cleanup: FAB deshabilitado, gateado por feature flag.
    // Para re-habilitar: window.VOLVIX_VOICE_FAB = true antes de cargar.
    if (window.VOLVIX_VOICE_FAB !== true) return;
    // Botón micrófono
    const btn = document.createElement('button');
    btn.className = 'volvix-mic-btn';
    btn.title = 'Click para activar comandos de voz';
    btn.innerHTML = '🎙️';
    btn.addEventListener('click', toggleListening);
    document.body.appendChild(btn);
    state.micButton = btn;

    // Animación de onda
    const wave = document.createElement('div');
    wave.className = 'volvix-wave';
    for (let i = 0; i < 5; i++) wave.appendChild(document.createElement('span'));
    document.body.appendChild(wave);
    state.waveContainer = wave;

    // Transcripción
    const trans = document.createElement('div');
    trans.className = 'volvix-transcript';
    document.body.appendChild(trans);
    state.transcriptDisplay = trans;
  }

  function showTranscript(text, ms = 3000) {
    if (!state.transcriptDisplay) return;
    state.transcriptDisplay.textContent = text;
    state.transcriptDisplay.classList.add('show');
    clearTimeout(state.transcriptDisplay._t);
    state.transcriptDisplay._t = setTimeout(
      () => state.transcriptDisplay.classList.remove('show'),
      ms
    );
  }

  function setListeningUI(on) {
    if (!state.micButton) return;
    state.micButton.classList.toggle('listening', on);
    state.waveContainer.classList.toggle('active', on);
  }

  // ═══════════════════════════════════════════════════════════════
  // SPEECH SYNTHESIS (TTS)
  // ═══════════════════════════════════════════════════════════════
  function loadVoices() {
    if (!state.synth) return;
    const voices = state.synth.getVoices();
    if (!voices.length) return;
    state.selectedVoice =
      voices.find(v => v.lang === VolvixVoiceConfig.lang) ||
      voices.find(v => v.lang.startsWith(VolvixVoiceConfig.lang.split('-')[0])) ||
      voices[0];
    state.voicesLoaded = true;
    log('Voz seleccionada:', state.selectedVoice && state.selectedVoice.name);
  }

  function speak(text, opts = {}) {
    if (!state.synth) {
      warn('SpeechSynthesis no disponible');
      return;
    }
    try {
      state.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = opts.lang || VolvixVoiceConfig.lang;
      u.rate = opts.rate || VolvixVoiceConfig.voiceRate;
      u.pitch = opts.pitch || VolvixVoiceConfig.voicePitch;
      u.volume = opts.volume != null ? opts.volume : VolvixVoiceConfig.voiceVolume;
      if (state.selectedVoice) u.voice = state.selectedVoice;
      state.synth.speak(u);
      log('TTS:', text);
    } catch (e) {
      err('Error en speak:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION
  // ═══════════════════════════════════════════════════════════════
  function buildRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = VolvixVoiceConfig.lang;
    r.continuous = VolvixVoiceConfig.continuous;
    r.interimResults = VolvixVoiceConfig.interimResults;
    r.maxAlternatives = 1;

    r.onstart = () => {
      state.listening = true;
      setListeningUI(true);
      log('Reconocimiento iniciado');
    };
    r.onend = () => {
      state.listening = false;
      setListeningUI(false);
      log('Reconocimiento terminado');
      if (VolvixVoiceConfig.autoRestart && state._userWantsListening) {
        setTimeout(() => {
          try { r.start(); } catch (_) {}
        }, 400);
      }
    };
    r.onerror = (ev) => {
      err('Error reconocimiento:', ev.error);
      if (ev.error === 'not-allowed') {
        speak('No tengo permiso para usar el micrófono.');
        state._userWantsListening = false;
      }
    };
    r.onresult = handleResult;
    return r;
  }

  function handleResult(event) {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (interim) showTranscript('… ' + interim, 1500);
    if (final) {
      const conf = event.results[event.results.length - 1][0].confidence || 1;
      const clean = final.trim().toLowerCase();
      log('Final:', clean, 'conf:', conf);
      showTranscript('🗣️ ' + clean);
      if (conf < VolvixVoiceConfig.confidenceThreshold) {
        log('Confianza baja, ignorado');
        return;
      }
      state.lastCommand = clean;
      state.commandHistory.push({ text: clean, ts: Date.now() });
      processCommand(clean);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCESADOR DE COMANDOS
  // ═══════════════════════════════════════════════════════════════
  function processCommand(text) {
    let payload = text;

    if (VolvixVoiceConfig.requireWakeWord) {
      const wake = VolvixVoiceConfig.wakeWord.toLowerCase();
      if (!state.awakened) {
        if (text.includes(wake)) {
          state.awakened = true;
          speak('Te escucho.');
          setTimeout(() => (state.awakened = false), 8000);
          payload = text.replace(wake, '').trim();
          if (!payload) return;
        } else {
          return;
        }
      } else {
        payload = text.replace(wake, '').trim();
      }
    }

    // Buscar handler
    for (const [pattern, handler] of state.commandHandlers) {
      const m = payload.match(pattern);
      if (m) {
        try {
          handler(m, payload);
        } catch (e) {
          err('Handler error:', e);
          speak('Hubo un error ejecutando el comando.');
        }
        return;
      }
    }
    speak('No entendí el comando. Di "ayuda" para ver opciones.');
  }

  function registerCommand(pattern, handler) {
    state.commandHandlers.set(pattern, handler);
  }

  // ═══════════════════════════════════════════════════════════════
  // COMANDOS PREDEFINIDOS
  // ═══════════════════════════════════════════════════════════════
  function registerDefaultCommands() {
    // Cobrar / cerrar venta
    registerCommand(/^(cobrar|cerrar venta|finalizar venta)\b/, () => {
      speak('Cerrando venta.');
      dispatch('volvix:checkout');
      tryClick('[data-action="checkout"], #btn-cobrar, .btn-checkout');
    });

    // Buscar producto
    registerCommand(/^buscar\s+(.+)/, (m) => {
      const q = m[1].trim();
      speak(`Buscando ${q}.`);
      dispatch('volvix:search', { query: q });
      const input = document.querySelector('#search, input[name="search"], [data-role="search"]');
      if (input) {
        input.value = q;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Total
    registerCommand(/^(total|cuánto es|cuanto es)\b/, () => {
      const el = document.querySelector('[data-role="total"], #total, .pos-total');
      const t = el ? el.textContent.trim() : 'no disponible';
      speak(`El total es ${t}.`);
    });

    // Cuántas ventas
    registerCommand(/^(cu[aá]ntas ventas|ventas del d[ií]a|ventas de hoy)\b/, () => {
      const el = document.querySelector('[data-role="sales-count"], #ventas-hoy');
      const n = el ? el.textContent.trim() : '0';
      speak(`Hoy llevas ${n} ventas.`);
      dispatch('volvix:sales-query');
    });

    // Abrir módulo
    registerCommand(/^abrir\s+(.+)/, (m) => {
      const mod = m[1].trim();
      speak(`Abriendo ${mod}.`);
      dispatch('volvix:open-module', { module: mod });
      const link = document.querySelector(
        `[data-module="${mod}"], a[href*="${mod}"], [data-route="${mod}"]`
      );
      if (link) link.click();
    });

    // Cerrar sesión
    registerCommand(/^(cerrar sesi[oó]n|salir|logout)\b/, () => {
      speak('Cerrando sesión.');
      dispatch('volvix:logout');
      tryClick('[data-action="logout"], #btn-logout, .btn-logout');
    });

    // Ayuda
    registerCommand(/^(ayuda|help|qu[eé] puedo decir)\b/, () => {
      const help = [
        'Comandos disponibles:',
        'cobrar, buscar producto, total,',
        'cuántas ventas, abrir módulo,',
        'cerrar sesión, ayuda.'
      ].join(' ');
      speak(help);
      showTranscript(help, 6000);
    });

    // Saludo
    registerCommand(/^(hola|hey|buenas)\b/, () => {
      speak('Hola, ¿en qué te ayudo?');
    });

    // Detener
    registerCommand(/^(detente|para|alto|silencio)\b/, () => {
      state.synth && state.synth.cancel();
      stopListening();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════
  function dispatch(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function tryClick(selector) {
    const el = document.querySelector(selector);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTROL PÚBLICO
  // ═══════════════════════════════════════════════════════════════
  function startListening() {
    if (!state.recognition) {
      warn('Reconocimiento no inicializado');
      return;
    }
    state._userWantsListening = true;
    try {
      state.recognition.start();
      speak('Escuchando.');
    } catch (e) {
      log('start() lanzó:', e.message);
    }
  }

  function stopListening() {
    state._userWantsListening = false;
    if (state.recognition && state.listening) {
      try { state.recognition.stop(); } catch (_) {}
    }
    setListeningUI(false);
  }

  function toggleListening() {
    if (state.listening) stopListening();
    else startListening();
  }

  function setLanguage(lang) {
    VolvixVoiceConfig.lang = lang;
    if (state.recognition) state.recognition.lang = lang;
    loadVoices();
    log('Idioma cambiado a', lang);
  }

  function setWakeWord(word, required = true) {
    VolvixVoiceConfig.wakeWord = String(word).toLowerCase();
    VolvixVoiceConfig.requireWakeWord = !!required;
  }

  // ═══════════════════════════════════════════════════════════════
  // INICIALIZACIÓN
  // ═══════════════════════════════════════════════════════════════
  function init(userConfig = {}) {
    Object.assign(VolvixVoiceConfig, userConfig);

    if (!isSupported()) {
      warn('Web Speech API no soportada en este navegador.');
      return false;
    }

    injectStyles();
    buildUI();

    state.recognition = buildRecognition();
    registerDefaultCommands();

    // Cargar voces (puede ser asíncrono)
    if (state.synth) {
      loadVoices();
      state.synth.onvoiceschanged = loadVoices;
    }

    log('VolvixVoice inicializado.');
    return true;
  }

  // Auto-init si DOM está listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  // ═══════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════════
  global.VolvixVoice = {
    init,
    start: startListening,
    stop: stopListening,
    toggle: toggleListening,
    speak,
    setLanguage,
    setWakeWord,
    registerCommand,
    config: VolvixVoiceConfig,
    state,
    history: () => state.commandHistory.slice(),
    isSupported
  };

})(window);
