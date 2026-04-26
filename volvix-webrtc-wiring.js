/* ============================================================================
 * Volvix POS — WebRTC Wiring (Agent-25, Ronda 7 Fibonacci)
 * ----------------------------------------------------------------------------
 * Control remoto peer-to-peer simulado:
 *   - RTCPeerConnection setup
 *   - Códigos de conexión 6 dígitos
 *   - Signaling via localStorage (mismo navegador / pestañas distintas)
 *   - Screen share (getDisplayMedia)
 *   - Audio call (getUserMedia)
 *   - Chat de texto via DataChannel
 *   - Video preview, start/stop controls
 *   - Sin servidor externo
 * ==========================================================================*/
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Constantes y configuración
  // ---------------------------------------------------------------------------
  const SIGNAL_PREFIX   = 'volvix:webrtc:signal:';
  const ROOM_PREFIX     = 'volvix:webrtc:room:';
  const CODE_TTL_MS     = 10 * 60 * 1000;       // 10 min
  const SIGNAL_POLL_MS  = 350;
  const CODE_LENGTH     = 6;

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  // ---------------------------------------------------------------------------
  // 2. Utilidades
  // ---------------------------------------------------------------------------
  function generateCode() {
    let c = '';
    for (let i = 0; i < CODE_LENGTH; i++) c += Math.floor(Math.random() * 10);
    return c;
  }

  function isValidCode(code) {
    return typeof code === 'string'
        && code.length === CODE_LENGTH
        && /^\d+$/.test(code);
  }

  function now() { return Date.now(); }

  function log(...args) {
    if (global.VOLVIX_DEBUG) console.log('[WebRTC]', ...args);
  }

  function emit(target, name, detail) {
    try { target.dispatchEvent(new CustomEvent(name, { detail })); }
    catch (e) { log('emit fail', name, e); }
  }

  // ---------------------------------------------------------------------------
  // 3. Signaling Server simulado vía localStorage
  // ---------------------------------------------------------------------------
  class LocalSignaling {
    constructor(code, role) {
      this.code   = code;
      this.role   = role; // 'host' | 'guest'
      this.peer   = role === 'host' ? 'guest' : 'host';
      this.inbox  = `${SIGNAL_PREFIX}${code}:${role}`;
      this.outbox = `${SIGNAL_PREFIX}${code}:${this.peer}`;
      this.handlers = [];
      this._poll = null;
      this._lastSeen = 0;
      this._onStorage = this._onStorage.bind(this);
    }

    start() {
      window.addEventListener('storage', this._onStorage);
      this._poll = setInterval(() => this._drain(), SIGNAL_POLL_MS);
      this._drain();
    }

    stop() {
      window.removeEventListener('storage', this._onStorage);
      if (this._poll) clearInterval(this._poll);
      this._poll = null;
      try { localStorage.removeItem(this.inbox); } catch (e) {}
    }

    send(msg) {
      const queue = this._readQueue(this.outbox);
      queue.push({ ts: now(), msg });
      try { localStorage.setItem(this.outbox, JSON.stringify(queue)); }
      catch (e) { log('signal send error', e); }
    }

    onMessage(fn) { this.handlers.push(fn); }

    _onStorage(ev) {
      if (ev.key === this.inbox) this._drain();
    }

    _readQueue(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      } catch (e) { return []; }
    }

    _drain() {
      const queue = this._readQueue(this.inbox);
      if (!queue.length) return;
      const fresh = queue.filter(item => item.ts > this._lastSeen);
      if (!fresh.length) return;
      this._lastSeen = fresh[fresh.length - 1].ts;
      try { localStorage.removeItem(this.inbox); } catch (e) {}
      fresh.forEach(item => {
        this.handlers.forEach(h => {
          try { h(item.msg); } catch (e) { log('handler err', e); }
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Registro de salas (códigos válidos)
  // ---------------------------------------------------------------------------
  const RoomRegistry = {
    register(code) {
      const key = `${ROOM_PREFIX}${code}`;
      const data = { code, createdAt: now(), expiresAt: now() + CODE_TTL_MS };
      localStorage.setItem(key, JSON.stringify(data));
      return data;
    },
    lookup(code) {
      const key = `${ROOM_PREFIX}${code}`;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.expiresAt < now()) {
          localStorage.removeItem(key);
          return null;
        }
        return data;
      } catch (e) { return null; }
    },
    release(code) {
      try { localStorage.removeItem(`${ROOM_PREFIX}${code}`); } catch (e) {}
    },
    sweep() {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(ROOM_PREFIX)) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            if (d && d.expiresAt < now()) localStorage.removeItem(k);
          } catch (e) {}
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 5. Núcleo de la conexión peer
  // ---------------------------------------------------------------------------
  class VolvixPeer extends EventTarget {
    constructor(opts = {}) {
      super();
      this.code        = null;
      this.role        = null;       // 'host' | 'guest'
      this.pc          = null;
      this.signal      = null;
      this.dataChannel = null;
      this.localStream = null;
      this.remoteStream= null;
      this.screenStream= null;
      this.audioStream = null;
      this.connected   = false;
      this.opts        = Object.assign({ video: true, audio: true }, opts);
      this._pendingICE = [];
    }

    // ---------- Lifecycle ----------
    async host() {
      this.role = 'host';
      this.code = generateCode();
      RoomRegistry.register(this.code);
      this._buildPeerConnection();
      this._buildSignaling();
      this.dataChannel = this.pc.createDataChannel('volvix-chat', {
        ordered: true
      });
      this._wireDataChannel(this.dataChannel);

      this.pc.onnegotiationneeded = async () => {
        try {
          const offer = await this.pc.createOffer();
          await this.pc.setLocalDescription(offer);
          this.signal.send({ type: 'offer', sdp: offer });
        } catch (e) { this._fail('offer error', e); }
      };

      emit(this, 'code', { code: this.code });
      return this.code;
    }

    async join(code) {
      if (!isValidCode(code))
        throw new Error('Código inválido (deben ser 6 dígitos)');
      const room = RoomRegistry.lookup(code);
      if (!room) throw new Error('Código no encontrado o expirado');

      this.role = 'guest';
      this.code = code;
      this._buildPeerConnection();
      this._buildSignaling();
      this.signal.send({ type: 'hello' });
      emit(this, 'joining', { code });
    }

    disconnect() {
      try { if (this.dataChannel) this.dataChannel.close(); } catch (e) {}
      try { if (this.pc) this.pc.close(); } catch (e) {}
      this._stopStream(this.localStream);
      this._stopStream(this.screenStream);
      this._stopStream(this.audioStream);
      if (this.signal) this.signal.stop();
      if (this.role === 'host' && this.code) RoomRegistry.release(this.code);
      this.connected = false;
      emit(this, 'disconnected', {});
    }

    // ---------- PeerConnection setup ----------
    _buildPeerConnection() {
      this.pc = new RTCPeerConnection(ICE_SERVERS);

      this.pc.onicecandidate = (ev) => {
        if (ev.candidate && this.signal)
          this.signal.send({ type: 'ice', candidate: ev.candidate });
      };

      this.pc.ontrack = (ev) => {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
          emit(this, 'remotestream', { stream: this.remoteStream });
        }
        this.remoteStream.addTrack(ev.track);
        emit(this, 'track', { track: ev.track, kind: ev.track.kind });
      };

      this.pc.ondatachannel = (ev) => {
        this.dataChannel = ev.channel;
        this._wireDataChannel(this.dataChannel);
      };

      this.pc.onconnectionstatechange = () => {
        const st = this.pc.connectionState;
        emit(this, 'state', { state: st });
        if (st === 'connected') {
          this.connected = true;
          emit(this, 'connected', {});
        } else if (['failed', 'closed', 'disconnected'].includes(st)) {
          this.connected = false;
        }
      };
    }

    _buildSignaling() {
      this.signal = new LocalSignaling(this.code, this.role);
      this.signal.onMessage((msg) => this._onSignal(msg));
      this.signal.start();
    }

    async _onSignal(msg) {
      try {
        switch (msg.type) {
          case 'hello':
            // host knows guest is ready; offer is generated by negotiationneeded
            // when a track or datachannel is added. Force one if nothing yet.
            if (this.role === 'host' && this.pc.signalingState === 'stable') {
              const offer = await this.pc.createOffer();
              await this.pc.setLocalDescription(offer);
              this.signal.send({ type: 'offer', sdp: offer });
            }
            break;

          case 'offer':
            await this.pc.setRemoteDescription(msg.sdp);
            await this._flushICE();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.signal.send({ type: 'answer', sdp: answer });
            break;

          case 'answer':
            await this.pc.setRemoteDescription(msg.sdp);
            await this._flushICE();
            break;

          case 'ice':
            if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
              await this.pc.addIceCandidate(msg.candidate);
            } else {
              this._pendingICE.push(msg.candidate);
            }
            break;

          case 'bye':
            this.disconnect();
            break;
        }
      } catch (e) { this._fail('signal handler', e); }
    }

    async _flushICE() {
      while (this._pendingICE.length) {
        const c = this._pendingICE.shift();
        try { await this.pc.addIceCandidate(c); } catch (e) { log('ice flush', e); }
      }
    }

    // ---------- Data channel (chat) ----------
    _wireDataChannel(ch) {
      ch.onopen    = () => emit(this, 'chatopen', {});
      ch.onclose   = () => emit(this, 'chatclose', {});
      ch.onerror   = (e) => emit(this, 'chaterror', { error: e });
      ch.onmessage = (ev) => {
        let payload = ev.data;
        try { payload = JSON.parse(ev.data); } catch (e) {}
        emit(this, 'message', { data: payload });
      };
    }

    sendMessage(text) {
      if (!this.dataChannel || this.dataChannel.readyState !== 'open')
        throw new Error('Canal de chat no está abierto');
      const payload = JSON.stringify({
        kind: 'chat', text: String(text), ts: now()
      });
      this.dataChannel.send(payload);
      return payload;
    }

    // ---------- Media: Screen share ----------
    async startScreenShare() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia)
        throw new Error('getDisplayMedia no soportado');
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, displaySurface: 'monitor' },
        audio: false
      });
      this.screenStream.getTracks().forEach(t => {
        this.pc.addTrack(t, this.screenStream);
        t.onended = () => this.stopScreenShare();
      });
      emit(this, 'screenstart', { stream: this.screenStream });
      return this.screenStream;
    }

    stopScreenShare() {
      if (!this.screenStream) return;
      this._stopStream(this.screenStream);
      const senders = this.pc.getSenders();
      senders.forEach(s => {
        if (s.track && s.track.kind === 'video' && s.track.label.match(/screen|display/i)) {
          try { this.pc.removeTrack(s); } catch (e) {}
        }
      });
      this.screenStream = null;
      emit(this, 'screenstop', {});
    }

    // ---------- Media: Audio call ----------
    async startAudioCall() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        throw new Error('getUserMedia no soportado');
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
      this.audioStream.getTracks().forEach(t => {
        this.pc.addTrack(t, this.audioStream);
      });
      emit(this, 'audiostart', { stream: this.audioStream });
      return this.audioStream;
    }

    stopAudioCall() {
      if (!this.audioStream) return;
      this._stopStream(this.audioStream);
      const senders = this.pc.getSenders();
      senders.forEach(s => {
        if (s.track && s.track.kind === 'audio') {
          try { this.pc.removeTrack(s); } catch (e) {}
        }
      });
      this.audioStream = null;
      emit(this, 'audiostop', {});
    }

    // ---------- Media: Webcam preview ----------
    async startVideoPreview() {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      this.localStream.getTracks().forEach(t => {
        this.pc.addTrack(t, this.localStream);
      });
      emit(this, 'videostart', { stream: this.localStream });
      return this.localStream;
    }

    stopVideoPreview() {
      if (!this.localStream) return;
      this._stopStream(this.localStream);
      this.localStream = null;
      emit(this, 'videostop', {});
    }

    // ---------- Helpers ----------
    _stopStream(s) {
      if (!s) return;
      try { s.getTracks().forEach(t => t.stop()); } catch (e) {}
    }

    _fail(where, err) {
      console.error('[WebRTC]', where, err);
      emit(this, 'error', { where, error: err && err.message || String(err) });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. UI Wiring helper (opcional, conecta a elementos por ID)
  // ---------------------------------------------------------------------------
  function wireUI(opts = {}) {
    const ids = Object.assign({
      btnHost:          'rtc-btn-host',
      btnJoin:          'rtc-btn-join',
      inputCode:        'rtc-input-code',
      labelCode:        'rtc-label-code',
      labelStatus:      'rtc-label-status',
      btnScreen:        'rtc-btn-screen',
      btnAudio:         'rtc-btn-audio',
      btnVideo:         'rtc-btn-video',
      btnDisconnect:    'rtc-btn-disconnect',
      btnSendChat:      'rtc-btn-send',
      inputChat:        'rtc-input-chat',
      logChat:          'rtc-log-chat',
      videoLocal:       'rtc-video-local',
      videoRemote:      'rtc-video-remote',
    }, opts.ids || {});

    const $ = (id) => document.getElementById(id);
    const peer = new VolvixPeer();

    const setStatus = (txt) => { const el = $(ids.labelStatus); if (el) el.textContent = txt; };
    const appendChat = (who, text) => {
      const el = $(ids.logChat); if (!el) return;
      const div = document.createElement('div');
      div.className = `chat-line chat-${who}`;
      div.textContent = `[${who}] ${text}`;
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
    };

    // Eventos de peer
    peer.addEventListener('code',         (e) => {
      const el = $(ids.labelCode); if (el) el.textContent = e.detail.code;
      setStatus('Esperando invitado...');
    });
    peer.addEventListener('joining',      () => setStatus('Conectando...'));
    peer.addEventListener('connected',    () => setStatus('Conectado'));
    peer.addEventListener('disconnected', () => setStatus('Desconectado'));
    peer.addEventListener('state',        (e) => log('state', e.detail.state));
    peer.addEventListener('error',        (e) => setStatus('Error: ' + e.detail.where));
    peer.addEventListener('chatopen',     () => appendChat('sys', 'Chat abierto'));
    peer.addEventListener('message',      (e) => {
      const d = e.detail.data;
      if (d && d.kind === 'chat') appendChat('peer', d.text);
    });
    peer.addEventListener('remotestream', (e) => {
      const v = $(ids.videoRemote);
      if (v) { v.srcObject = e.detail.stream; v.play().catch(() => {}); }
    });
    peer.addEventListener('videostart',   (e) => {
      const v = $(ids.videoLocal);
      if (v) { v.srcObject = e.detail.stream; v.muted = true; v.play().catch(() => {}); }
    });
    peer.addEventListener('screenstart',  (e) => {
      const v = $(ids.videoLocal);
      if (v) { v.srcObject = e.detail.stream; v.muted = true; v.play().catch(() => {}); }
    });

    // Botones
    const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    bind(ids.btnHost, async () => {
      try { await peer.host(); } catch (e) { setStatus('Error: ' + e.message); }
    });

    bind(ids.btnJoin, async () => {
      const code = ($(ids.inputCode) || {}).value || '';
      try { await peer.join(code.trim()); }
      catch (e) { setStatus('Error: ' + e.message); }
    });

    bind(ids.btnScreen, async () => {
      try {
        if (peer.screenStream) peer.stopScreenShare();
        else await peer.startScreenShare();
      } catch (e) { setStatus('Error: ' + e.message); }
    });

    bind(ids.btnAudio, async () => {
      try {
        if (peer.audioStream) peer.stopAudioCall();
        else await peer.startAudioCall();
      } catch (e) { setStatus('Error: ' + e.message); }
    });

    bind(ids.btnVideo, async () => {
      try {
        if (peer.localStream) peer.stopVideoPreview();
        else await peer.startVideoPreview();
      } catch (e) { setStatus('Error: ' + e.message); }
    });

    bind(ids.btnDisconnect, () => peer.disconnect());

    bind(ids.btnSendChat, () => {
      const inp = $(ids.inputChat);
      if (!inp || !inp.value.trim()) return;
      try {
        peer.sendMessage(inp.value);
        appendChat('me', inp.value);
        inp.value = '';
      } catch (e) { setStatus('Error: ' + e.message); }
    });

    const inp = $(ids.inputChat);
    if (inp) inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); $(ids.btnSendChat) && $(ids.btnSendChat).click(); }
    });

    return peer;
  }

  // ---------------------------------------------------------------------------
  // 7. Limpieza periódica de salas expiradas
  // ---------------------------------------------------------------------------
  try { RoomRegistry.sweep(); } catch (e) {}
  setInterval(() => { try { RoomRegistry.sweep(); } catch (e) {} }, 60 * 1000);

  // ---------------------------------------------------------------------------
  // 8. Export
  // ---------------------------------------------------------------------------
  global.VolvixWebRTC = {
    VolvixPeer,
    LocalSignaling,
    RoomRegistry,
    wireUI,
    generateCode,
    isValidCode,
    version: '1.0.0-agent25-r7'
  };

})(typeof window !== 'undefined' ? window : globalThis);
