/* volvix-voice-wiring.js — R17 Voice POS
 * Web Speech API: SpeechRecognition + SpeechSynthesis nativos del navegador.
 * Sin dependencias externas. Activación por botón flotante (esquina inf-izq).
 * Compatibilidad real: Chrome / Edge desktop con es-MX. Safari iOS limitado.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.Volvix && window.Volvix.voice && window.Volvix.voice.__loaded) return;

  const W = window;
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  const synth = W.speechSynthesis || null;
  const supported = !!SR && !!synth;

  // -------- estado --------
  const state = {
    rec: null,
    listening: false,
    lang: 'es-MX',
    apiBase: (W.VOLVIX_API_BASE || ''),
    onAction: null,
  };

  // -------- TTS --------
  function speak(text) {
    try {
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text || ''));
      u.lang = state.lang;
      u.rate = 1.0;
      synth.speak(u);
    } catch (_) {}
  }

  // -------- HTTP helper --------
  async function api(path, opts) {
    const tok = (W.localStorage && localStorage.getItem('volvix_token')) || '';
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const res = await fetch(state.apiBase + path, Object.assign({ method: 'GET', headers }, opts || {}));
    const j = await res.json().catch(() => ({}));
    return { status: res.status, body: j };
  }

  // -------- handler de acciones --------
  async function dispatch(action) {
    if (!action) { speak('No entendí el comando.'); return; }
    if (typeof state.onAction === 'function') {
      try { const handled = await state.onAction(action); if (handled === true) return; } catch (_) {}
    }
    switch (action.type) {
      case 'cart.add':
        if (W.Volvix && W.Volvix.cart && typeof W.Volvix.cart.addByQuery === 'function') {
          await W.Volvix.cart.addByQuery(action.query, action.qty || 1);
          speak('Agregado ' + (action.qty || 1) + ' ' + action.query);
        } else { speak('Carrito no disponible.'); }
        return;
      case 'sale.checkout':
        if (W.Volvix && W.Volvix.cart && typeof W.Volvix.cart.checkout === 'function') {
          await W.Volvix.cart.checkout(action.payment_method);
          speak('Cobrando con ' + action.payment_method);
        } else { speak('Cobro no disponible.'); }
        return;
      case 'catalog.filter':
        if (W.Volvix && W.Volvix.catalog && typeof W.Volvix.catalog.filter === 'function') {
          W.Volvix.catalog.filter(action.query);
          speak('Buscando ' + action.query);
        } else { speak('Búsqueda no disponible.'); }
        return;
      case 'cart.reset':
        if (W.Volvix && W.Volvix.cart && typeof W.Volvix.cart.reset === 'function') {
          W.Volvix.cart.reset(); speak('Listo, siguiente cliente.');
        }
        return;
      case 'sale.cancel':
        if (W.Volvix && W.Volvix.cart && typeof W.Volvix.cart.cancel === 'function') {
          W.Volvix.cart.cancel(); speak('Venta cancelada.');
        }
        return;
      case 'report.sales_today': {
        const r = await api('/api/sales/today');
        const total = (r.body && (r.body.total || 0)) || 0;
        const count = (r.body && (r.body.count || 0)) || 0;
        speak('Hoy llevas ' + count + ' ventas por ' + total + ' pesos.');
        return;
      }
      default:
        speak('Comando no reconocido.');
    }
  }

  async function process(transcript) {
    try {
      const r = await api('/api/voice/parse', { method: 'POST', body: JSON.stringify({ text: transcript }) });
      if (r.status === 200 && r.body && r.body.ok) await dispatch(r.body.action);
      else speak('No entendí, repite.');
    } catch (e) { speak('Error de red.'); }
  }

  // -------- recognition --------
  function start() {
    if (!supported) { speak('Voz no soportada en este navegador.'); return false; }
    if (state.listening) return true;
    const rec = new SR();
    rec.lang = state.lang; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onstart = () => { state.listening = true; setUI(true); };
    rec.onend   = () => { state.listening = false; setUI(false); };
    rec.onerror = (e) => { state.listening = false; setUI(false); };
    rec.onresult = (ev) => {
      const txt = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      if (txt) process(txt);
    };
    state.rec = rec;
    try { rec.start(); return true; } catch (_) { return false; }
  }
  function stop() { try { state.rec && state.rec.stop(); } catch (_) {} state.listening = false; setUI(false); }

  // -------- UI: botón flotante + waveform --------
  let btn, wave;
  function ensureUI() {
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'volvix-voice-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Activar comandos por voz');
    btn.innerHTML = '<span style="font-size:22px">🎤</span>';
    Object.assign(btn.style, {
      position:'fixed', left:'16px', bottom:'16px', zIndex:'99999',
      width:'56px', height:'56px', borderRadius:'50%', border:'none',
      background:'#0ea5e9', color:'#fff', boxShadow:'0 4px 14px rgba(0,0,0,.25)',
      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'
    });
    btn.addEventListener('click', () => { state.listening ? stop() : start(); });

    wave = document.createElement('div');
    wave.id = 'volvix-voice-wave';
    Object.assign(wave.style, {
      position:'fixed', left:'80px', bottom:'28px', zIndex:'99999',
      display:'none', gap:'3px', alignItems:'flex-end', height:'24px'
    });
    for (let i = 0; i < 5; i++) {
      const bar = document.createElement('span');
      Object.assign(bar.style, { width:'4px', height:'8px', background:'#0ea5e9', borderRadius:'2px', animation:`vlxWave 0.9s ${i*0.1}s infinite ease-in-out` });
      wave.appendChild(bar);
    }
    const style = document.createElement('style');
    style.textContent = '@keyframes vlxWave{0%,100%{height:6px}50%{height:22px}}';
    document.head.appendChild(style);
    document.body.appendChild(btn);
    document.body.appendChild(wave);
  }
  function setUI(on) {
    if (!btn) return;
    btn.style.background = on ? '#ef4444' : '#0ea5e9';
    if (wave) wave.style.display = on ? 'flex' : 'none';
  }

  function init() {
    if (!document || !document.body) { document.addEventListener('DOMContentLoaded', init); return; }
    ensureUI();
  }
  init();

  // -------- API pública --------
  W.Volvix = W.Volvix || {};
  W.Volvix.voice = {
    __loaded: true,
    supported,
    start, stop, speak,
    process,           // permite testear con texto sin micrófono
    setLang: (l) => { state.lang = l || 'es-MX'; },
    setApiBase: (b) => { state.apiBase = b || ''; },
    onAction: (fn) => { state.onAction = (typeof fn === 'function') ? fn : null; },
  };
})();
