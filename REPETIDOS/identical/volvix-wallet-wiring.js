/* ============================================================================
 * volvix-wallet-wiring.js
 * Volvix POS - Sistema de Wallet / Saldo Digital de Cliente
 * ----------------------------------------------------------------------------
 * Tarjeta digital de cliente, recargas, pagar con saldo, transferencias
 * entre clientes, historial de movimientos.
 *
 * API expuesta: window.WalletAPI
 * Persistencia: localStorage (clave "volvix_wallet_v1")
 * ==========================================================================*/
(function (global) {
  "use strict";

  // ---------- Configuracion ----------
  const STORAGE_KEY = "volvix_wallet_v1";
  const TX_KEY = "volvix_wallet_tx_v1";
  const CARD_PREFIX = "VVX";
  const MIN_RECARGA = 10;
  const MAX_RECARGA = 50000;
  const MAX_TRANSFER = 20000;
  const CURRENCY = "MXN";

  // ---------- Estado en memoria ----------
  let _wallets = {};   // { clienteId: { cardNumber, balance, status, createdAt, holder } }
  let _txLog = [];     // [{ id, type, from, to, amount, ts, note, balanceAfter }]
  let _listeners = [];

  // ---------- Utilidades ----------
  function _uuid() {
    return "tx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function _now() {
    return new Date().toISOString();
  }

  function _fmt(n) {
    return Number(n).toFixed(2);
  }

  function _genCard() {
    let n = "";
    for (let i = 0; i < 12; i++) n += Math.floor(Math.random() * 10);
    return CARD_PREFIX + "-" + n.match(/.{1,4}/g).join("-");
  }

  function _emit(evt, payload) {
    _listeners.forEach(function (l) {
      try { l(evt, payload); } catch (e) { console.warn("[Wallet] listener err", e); }
    });
  }

  function _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_wallets));
      localStorage.setItem(TX_KEY, JSON.stringify(_txLog));
    } catch (e) {
      console.error("[Wallet] persist failed", e);
    }
  }

  function _load() {
    try {
      const w = localStorage.getItem(STORAGE_KEY);
      const t = localStorage.getItem(TX_KEY);
      _wallets = w ? JSON.parse(w) : {};
      _txLog = t ? JSON.parse(t) : [];
    } catch (e) {
      console.error("[Wallet] load failed", e);
      _wallets = {};
      _txLog = [];
    }
  }

  function _requireWallet(clienteId) {
    const w = _wallets[clienteId];
    if (!w) throw new Error("Wallet no existe para cliente " + clienteId);
    if (w.status !== "active") throw new Error("Wallet bloqueada/inactiva");
    return w;
  }

  function _logTx(tx) {
    _txLog.unshift(tx);
    if (_txLog.length > 5000) _txLog.length = 5000;
  }

  // ---------- API: Gestion de tarjeta ----------
  function createWallet(clienteId, holderName, opts) {
    if (!clienteId) throw new Error("clienteId requerido");
    if (_wallets[clienteId]) {
      throw new Error("Cliente ya tiene wallet: " + _wallets[clienteId].cardNumber);
    }
    opts = opts || {};
    const wallet = {
      clienteId: clienteId,
      holder: holderName || "SIN NOMBRE",
      cardNumber: opts.cardNumber || _genCard(),
      balance: 0,
      status: "active",
      createdAt: _now(),
      pin: opts.pin || null,
      currency: CURRENCY
    };
    _wallets[clienteId] = wallet;
    _logTx({
      id: _uuid(), type: "CREATE", from: null, to: clienteId,
      amount: 0, ts: _now(), note: "Tarjeta creada", balanceAfter: 0
    });
    _persist();
    _emit("wallet:created", wallet);
    return Object.assign({}, wallet);
  }

  function getWallet(clienteId) {
    const w = _wallets[clienteId];
    return w ? Object.assign({}, w) : null;
  }

  function getWalletByCard(cardNumber) {
    const id = Object.keys(_wallets).find(function (k) {
      return _wallets[k].cardNumber === cardNumber;
    });
    return id ? Object.assign({}, _wallets[id]) : null;
  }

  function listWallets(filter) {
    return Object.values(_wallets).filter(function (w) {
      if (!filter) return true;
      if (filter.status && w.status !== filter.status) return false;
      if (filter.minBalance != null && w.balance < filter.minBalance) return false;
      return true;
    }).map(function (w) { return Object.assign({}, w); });
  }

  function blockWallet(clienteId, reason) {
    const w = _wallets[clienteId];
    if (!w) throw new Error("Wallet no existe");
    w.status = "blocked";
    w.blockedReason = reason || "manual";
    w.blockedAt = _now();
    _logTx({
      id: _uuid(), type: "BLOCK", from: null, to: clienteId,
      amount: 0, ts: _now(), note: "Bloqueado: " + (reason || ""), balanceAfter: w.balance
    });
    _persist();
    _emit("wallet:blocked", w);
    return Object.assign({}, w);
  }

  function unblockWallet(clienteId) {
    const w = _wallets[clienteId];
    if (!w) throw new Error("Wallet no existe");
    w.status = "active";
    delete w.blockedReason;
    delete w.blockedAt;
    _logTx({
      id: _uuid(), type: "UNBLOCK", from: null, to: clienteId,
      amount: 0, ts: _now(), note: "Desbloqueado", balanceAfter: w.balance
    });
    _persist();
    _emit("wallet:unblocked", w);
    return Object.assign({}, w);
  }

  // ---------- API: Saldo ----------
  function getBalance(clienteId) {
    const w = _wallets[clienteId];
    if (!w) return null;
    return w.balance;
  }

  // ---------- API: Recargas ----------
  function recargar(clienteId, monto, metodoPago, ref) {
    monto = Number(monto);
    if (!isFinite(monto) || monto <= 0) throw new Error("Monto invalido");
    if (monto < MIN_RECARGA) throw new Error("Monto minimo de recarga: " + MIN_RECARGA);
    if (monto > MAX_RECARGA) throw new Error("Monto excede maximo: " + MAX_RECARGA);

    const w = _requireWallet(clienteId);
    w.balance = +(w.balance + monto).toFixed(2);

    const tx = {
      id: _uuid(),
      type: "RECARGA",
      from: null,
      to: clienteId,
      amount: monto,
      ts: _now(),
      method: metodoPago || "efectivo",
      ref: ref || null,
      note: "Recarga " + (metodoPago || "efectivo"),
      balanceAfter: w.balance
    };
    _logTx(tx);
    _persist();
    _emit("wallet:recarga", { wallet: w, tx: tx });
    return { ok: true, balance: w.balance, tx: tx };
  }

  // ---------- API: Pagar con saldo ----------
  function pagarConSaldo(clienteId, monto, ticketId, detalle) {
    monto = Number(monto);
    if (!isFinite(monto) || monto <= 0) throw new Error("Monto invalido");

    const w = _requireWallet(clienteId);
    if (w.balance < monto) {
      throw new Error("Saldo insuficiente. Disponible: " + _fmt(w.balance) + " / Requerido: " + _fmt(monto));
    }
    w.balance = +(w.balance - monto).toFixed(2);

    const tx = {
      id: _uuid(),
      type: "PAGO",
      from: clienteId,
      to: null,
      amount: monto,
      ts: _now(),
      ticketId: ticketId || null,
      note: detalle || "Pago con saldo",
      balanceAfter: w.balance
    };
    _logTx(tx);
    _persist();
    _emit("wallet:pago", { wallet: w, tx: tx });
    return { ok: true, balance: w.balance, tx: tx };
  }

  function reembolsar(clienteId, monto, ticketId, motivo) {
    monto = Number(monto);
    if (!isFinite(monto) || monto <= 0) throw new Error("Monto invalido");
    const w = _requireWallet(clienteId);
    w.balance = +(w.balance + monto).toFixed(2);
    const tx = {
      id: _uuid(), type: "REEMBOLSO", from: null, to: clienteId,
      amount: monto, ts: _now(), ticketId: ticketId || null,
      note: motivo || "Reembolso", balanceAfter: w.balance
    };
    _logTx(tx);
    _persist();
    _emit("wallet:reembolso", { wallet: w, tx: tx });
    return { ok: true, balance: w.balance, tx: tx };
  }

  // ---------- API: Transferencias ----------
  function transferir(fromCliente, toCliente, monto, nota) {
    monto = Number(monto);
    if (!isFinite(monto) || monto <= 0) throw new Error("Monto invalido");
    if (monto > MAX_TRANSFER) throw new Error("Excede maximo de transferencia: " + MAX_TRANSFER);
    if (fromCliente === toCliente) throw new Error("Origen y destino son iguales");

    const wFrom = _requireWallet(fromCliente);
    const wTo = _requireWallet(toCliente);
    if (wFrom.balance < monto) {
      throw new Error("Saldo insuficiente en origen");
    }

    wFrom.balance = +(wFrom.balance - monto).toFixed(2);
    wTo.balance = +(wTo.balance + monto).toFixed(2);

    const txId = _uuid();
    const txOut = {
      id: txId + "_out", linkedTo: txId + "_in", type: "TRANSFER_OUT",
      from: fromCliente, to: toCliente, amount: monto, ts: _now(),
      note: nota || "Transferencia enviada", balanceAfter: wFrom.balance
    };
    const txIn = {
      id: txId + "_in", linkedTo: txId + "_out", type: "TRANSFER_IN",
      from: fromCliente, to: toCliente, amount: monto, ts: _now(),
      note: nota || "Transferencia recibida", balanceAfter: wTo.balance
    };
    _logTx(txOut);
    _logTx(txIn);
    _persist();
    _emit("wallet:transfer", { from: wFrom, to: wTo, out: txOut, in: txIn });
    return { ok: true, fromBalance: wFrom.balance, toBalance: wTo.balance, txOut: txOut, txIn: txIn };
  }

  function transferirPorTarjeta(fromCliente, toCardNumber, monto, nota) {
    const target = getWalletByCard(toCardNumber);
    if (!target) throw new Error("Tarjeta destino no encontrada: " + toCardNumber);
    return transferir(fromCliente, target.clienteId, monto, nota);
  }

  // ---------- API: Historial ----------
  function getHistorial(clienteId, opts) {
    opts = opts || {};
    const limit = opts.limit || 50;
    const since = opts.since ? new Date(opts.since).getTime() : 0;
    return _txLog.filter(function (t) {
      if (clienteId && t.from !== clienteId && t.to !== clienteId) return false;
      if (since && new Date(t.ts).getTime() < since) return false;
      if (opts.type && t.type !== opts.type) return false;
      return true;
    }).slice(0, limit);
  }

  function getResumen(clienteId) {
    const w = _wallets[clienteId];
    if (!w) return null;
    const txs = getHistorial(clienteId, { limit: 9999 });
    let totalRecargado = 0, totalGastado = 0, totalEnviado = 0, totalRecibido = 0;
    txs.forEach(function (t) {
      if (t.type === "RECARGA") totalRecargado += t.amount;
      else if (t.type === "PAGO") totalGastado += t.amount;
      else if (t.type === "TRANSFER_OUT") totalEnviado += t.amount;
      else if (t.type === "TRANSFER_IN") totalRecibido += t.amount;
    });
    return {
      clienteId: clienteId,
      cardNumber: w.cardNumber,
      balance: w.balance,
      status: w.status,
      totalRecargado: +totalRecargado.toFixed(2),
      totalGastado: +totalGastado.toFixed(2),
      totalEnviado: +totalEnviado.toFixed(2),
      totalRecibido: +totalRecibido.toFixed(2),
      txCount: txs.length
    };
  }

  // ---------- API: Eventos / utilidad ----------
  function on(handler) {
    if (typeof handler === "function") _listeners.push(handler);
    return function off() {
      _listeners = _listeners.filter(function (l) { return l !== handler; });
    };
  }

  function exportData() {
    return {
      wallets: JSON.parse(JSON.stringify(_wallets)),
      transactions: JSON.parse(JSON.stringify(_txLog)),
      exportedAt: _now()
    };
  }

  function importData(data, replace) {
    if (!data || !data.wallets) throw new Error("Data invalida");
    if (replace) {
      _wallets = data.wallets;
      _txLog = data.transactions || [];
    } else {
      Object.assign(_wallets, data.wallets);
      _txLog = (data.transactions || []).concat(_txLog);
    }
    _persist();
    _emit("wallet:imported", { count: Object.keys(_wallets).length });
  }

  function reset(confirmString) {
    if (confirmString !== "RESET-VOLVIX-WALLET") {
      throw new Error("Confirma con 'RESET-VOLVIX-WALLET'");
    }
    _wallets = {};
    _txLog = [];
    _persist();
    _emit("wallet:reset", {});
  }

  // ---------- Init ----------
  _load();

  // ---------- Expose ----------
  global.WalletAPI = {
    // Tarjeta
    createWallet: createWallet,
    getWallet: getWallet,
    getWalletByCard: getWalletByCard,
    listWallets: listWallets,
    blockWallet: blockWallet,
    unblockWallet: unblockWallet,
    // Saldo
    getBalance: getBalance,
    // Operaciones
    recargar: recargar,
    pagarConSaldo: pagarConSaldo,
    reembolsar: reembolsar,
    transferir: transferir,
    transferirPorTarjeta: transferirPorTarjeta,
    // Historial
    getHistorial: getHistorial,
    getResumen: getResumen,
    // Eventos / data
    on: on,
    exportData: exportData,
    importData: importData,
    reset: reset,
    // Constantes
    CONFIG: {
      MIN_RECARGA: MIN_RECARGA,
      MAX_RECARGA: MAX_RECARGA,
      MAX_TRANSFER: MAX_TRANSFER,
      CURRENCY: CURRENCY,
      VERSION: "1.0.0"
    }
  };

  console.log("[Volvix Wallet] WalletAPI listo. v1.0.0");
})(typeof window !== "undefined" ? window : globalThis);
