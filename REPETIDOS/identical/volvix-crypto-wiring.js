/**
 * volvix-crypto-wiring.js
 * Crypto utilities for Volvix POS
 * AES-GCM, PBKDF2, RSA, JWT verify using Web Crypto API
 * Exposes window.CryptoAPI
 */
(function (global) {
  'use strict';

  const subtle = (global.crypto && global.crypto.subtle) || null;
  if (!subtle) {
    console.warn('[CryptoAPI] Web Crypto API not available in this environment');
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // ---------- Helpers ----------
  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64ToBuf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function bufToHex(buf) {
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function hexToBuf(hex) {
    if (hex.length % 2 !== 0) throw new Error('Hex string of odd length');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
  }

  function b64UrlToB64(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return s;
  }

  function b64ToB64Url(s) {
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomBytes(n) {
    const arr = new Uint8Array(n);
    global.crypto.getRandomValues(arr);
    return arr;
  }

  function randomId(n = 16) {
    return bufToHex(randomBytes(n));
  }

  // ---------- PBKDF2 ----------
  async function deriveKeyPBKDF2(password, salt, opts) {
    opts = opts || {};
    const iterations = opts.iterations || 100000;
    const hash = opts.hash || 'SHA-256';
    const keyLen = opts.keyLen || 256;
    const usage = opts.usage || ['encrypt', 'decrypt'];
    const algo = opts.derivedAlgo || { name: 'AES-GCM', length: keyLen };

    const baseKey = await subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey', 'deriveBits']
    );

    return subtle.deriveKey(
      { name: 'PBKDF2', salt: salt instanceof ArrayBuffer || ArrayBuffer.isView(salt) ? salt : enc.encode(salt), iterations, hash },
      baseKey,
      algo,
      true,
      usage
    );
  }

  async function hashPassword(password, opts) {
    opts = opts || {};
    const salt = opts.salt || randomBytes(16);
    const iterations = opts.iterations || 100000;
    const hash = opts.hash || 'SHA-256';

    const baseKey = await subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash },
      baseKey,
      256
    );
    return {
      hash: bufToB64(bits),
      salt: bufToB64(salt),
      iterations,
      algorithm: 'PBKDF2-' + hash,
    };
  }

  async function verifyPassword(password, stored) {
    const salt = b64ToBuf(stored.salt);
    const iterations = stored.iterations || 100000;
    const hashAlgo = (stored.algorithm || 'PBKDF2-SHA-256').replace('PBKDF2-', '');
    const baseKey = await subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: hashAlgo },
      baseKey,
      256
    );
    return bufToB64(bits) === stored.hash;
  }

  // ---------- AES-GCM ----------
  async function aesGenerateKey(length = 256) {
    return subtle.generateKey({ name: 'AES-GCM', length }, true, ['encrypt', 'decrypt']);
  }

  async function aesExportKey(key) {
    const raw = await subtle.exportKey('raw', key);
    return bufToB64(raw);
  }

  async function aesImportKey(b64) {
    return subtle.importKey('raw', b64ToBuf(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  async function aesEncrypt(plaintext, keyOrPassword, opts) {
    opts = opts || {};
    const iv = opts.iv || randomBytes(12);
    let key;
    if (typeof keyOrPassword === 'string') {
      const salt = opts.salt || randomBytes(16);
      key = await deriveKeyPBKDF2(keyOrPassword, salt);
      const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
      return {
        ciphertext: bufToB64(ct),
        iv: bufToB64(iv),
        salt: bufToB64(salt),
        algorithm: 'AES-GCM-256',
      };
    } else {
      key = keyOrPassword;
      const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
      const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
      return { ciphertext: bufToB64(ct), iv: bufToB64(iv), algorithm: 'AES-GCM-256' };
    }
  }

  async function aesDecrypt(payload, keyOrPassword) {
    const iv = b64ToBuf(payload.iv);
    const ct = b64ToBuf(payload.ciphertext);
    let key;
    if (typeof keyOrPassword === 'string') {
      const salt = b64ToBuf(payload.salt);
      key = await deriveKeyPBKDF2(keyOrPassword, salt);
    } else {
      key = keyOrPassword;
    }
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return dec.decode(pt);
  }

  // ---------- Hashing ----------
  async function sha256(data) {
    const buf = typeof data === 'string' ? enc.encode(data) : data;
    const h = await subtle.digest('SHA-256', buf);
    return bufToHex(h);
  }

  async function sha512(data) {
    const buf = typeof data === 'string' ? enc.encode(data) : data;
    const h = await subtle.digest('SHA-512', buf);
    return bufToHex(h);
  }

  async function hmacSign(message, secret, hash = 'SHA-256') {
    const key = await subtle.importKey(
      'raw',
      typeof secret === 'string' ? enc.encode(secret) : secret,
      { name: 'HMAC', hash },
      false,
      ['sign']
    );
    const sig = await subtle.sign('HMAC', key, typeof message === 'string' ? enc.encode(message) : message);
    return bufToB64(sig);
  }

  async function hmacVerify(message, signatureB64, secret, hash = 'SHA-256') {
    const key = await subtle.importKey(
      'raw',
      typeof secret === 'string' ? enc.encode(secret) : secret,
      { name: 'HMAC', hash },
      false,
      ['verify']
    );
    return subtle.verify(
      'HMAC',
      key,
      b64ToBuf(signatureB64),
      typeof message === 'string' ? enc.encode(message) : message
    );
  }

  // ---------- RSA ----------
  async function rsaGenerateKeyPair(opts) {
    opts = opts || {};
    const modulusLength = opts.modulusLength || 2048;
    const hash = opts.hash || 'SHA-256';
    const usage = opts.usage || 'encrypt'; // 'encrypt' or 'sign'

    const algo = usage === 'sign'
      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength, publicExponent: new Uint8Array([1, 0, 1]), hash }
      : { name: 'RSA-OAEP', modulusLength, publicExponent: new Uint8Array([1, 0, 1]), hash };

    const usages = usage === 'sign' ? ['sign', 'verify'] : ['encrypt', 'decrypt'];
    return subtle.generateKey(algo, true, usages);
  }

  async function rsaExportPublicKey(key) {
    const spki = await subtle.exportKey('spki', key);
    return bufToB64(spki);
  }

  async function rsaExportPrivateKey(key) {
    const pkcs8 = await subtle.exportKey('pkcs8', key);
    return bufToB64(pkcs8);
  }

  async function rsaImportPublicKey(b64, opts) {
    opts = opts || {};
    const algo = opts.algo || { name: 'RSA-OAEP', hash: 'SHA-256' };
    const usages = opts.usages || ['encrypt'];
    return subtle.importKey('spki', b64ToBuf(b64), algo, true, usages);
  }

  async function rsaImportPrivateKey(b64, opts) {
    opts = opts || {};
    const algo = opts.algo || { name: 'RSA-OAEP', hash: 'SHA-256' };
    const usages = opts.usages || ['decrypt'];
    return subtle.importKey('pkcs8', b64ToBuf(b64), algo, true, usages);
  }

  async function rsaEncrypt(plaintext, publicKey) {
    const ct = await subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext
    );
    return bufToB64(ct);
  }

  async function rsaDecrypt(ciphertextB64, privateKey) {
    const pt = await subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, b64ToBuf(ciphertextB64));
    return dec.decode(pt);
  }

  async function rsaSign(message, privateKey) {
    const sig = await subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      typeof message === 'string' ? enc.encode(message) : message
    );
    return bufToB64(sig);
  }

  async function rsaVerify(message, signatureB64, publicKey) {
    return subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      b64ToBuf(signatureB64),
      typeof message === 'string' ? enc.encode(message) : message
    );
  }

  // ---------- JWT ----------
  function jwtDecode(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');
    const header = JSON.parse(dec.decode(b64ToBuf(b64UrlToB64(parts[0]))));
    const payload = JSON.parse(dec.decode(b64ToBuf(b64UrlToB64(parts[1]))));
    return { header, payload, signature: parts[2], signingInput: parts[0] + '.' + parts[1] };
  }

  async function jwtSignHS256(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const h = b64ToB64Url(bufToB64(enc.encode(JSON.stringify(header))));
    const p = b64ToB64Url(bufToB64(enc.encode(JSON.stringify(payload))));
    const signingInput = h + '.' + p;
    const sig = await hmacSign(signingInput, secret, 'SHA-256');
    return signingInput + '.' + b64ToB64Url(sig);
  }

  async function jwtVerifyHS256(token, secret) {
    const { header, payload, signature, signingInput } = jwtDecode(token);
    if (header.alg !== 'HS256') return { valid: false, reason: 'alg mismatch', payload };
    const sigB64 = bufToB64(b64ToBuf(b64UrlToB64(signature)));
    const ok = await hmacVerify(signingInput, sigB64, secret, 'SHA-256');
    if (!ok) return { valid: false, reason: 'bad signature', payload };
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return { valid: false, reason: 'expired', payload };
    }
    if (payload.nbf && Date.now() / 1000 < payload.nbf) {
      return { valid: false, reason: 'not yet valid', payload };
    }
    return { valid: true, payload, header };
  }

  async function jwtVerifyRS256(token, publicKey) {
    const { header, payload, signature, signingInput } = jwtDecode(token);
    if (header.alg !== 'RS256') return { valid: false, reason: 'alg mismatch', payload };
    const key = typeof publicKey === 'string'
      ? await rsaImportPublicKey(publicKey, {
          algo: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          usages: ['verify'],
        })
      : publicKey;
    const sigBuf = b64ToBuf(b64UrlToB64(signature));
    const ok = await subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      sigBuf,
      enc.encode(signingInput)
    );
    if (!ok) return { valid: false, reason: 'bad signature', payload };
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return { valid: false, reason: 'expired', payload };
    }
    return { valid: true, payload, header };
  }

  // ---------- Convenience: encrypt JSON blob with password ----------
  async function encryptJSON(obj, password) {
    return aesEncrypt(JSON.stringify(obj), password);
  }

  async function decryptJSON(payload, password) {
    const txt = await aesDecrypt(payload, password);
    return JSON.parse(txt);
  }

  // ---------- Public API ----------
  const CryptoAPI = {
    // utils
    bufToB64, b64ToBuf, bufToHex, hexToBuf,
    randomBytes, randomId,
    // pbkdf2
    deriveKeyPBKDF2, hashPassword, verifyPassword,
    // aes
    aesGenerateKey, aesExportKey, aesImportKey, aesEncrypt, aesDecrypt,
    // hashing
    sha256, sha512, hmacSign, hmacVerify,
    // rsa
    rsaGenerateKeyPair, rsaExportPublicKey, rsaExportPrivateKey,
    rsaImportPublicKey, rsaImportPrivateKey,
    rsaEncrypt, rsaDecrypt, rsaSign, rsaVerify,
    // jwt
    jwtDecode, jwtSignHS256, jwtVerifyHS256, jwtVerifyRS256,
    // json
    encryptJSON, decryptJSON,
    // meta
    version: '1.0.0',
    available: !!subtle,
  };

  global.CryptoAPI = CryptoAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = CryptoAPI;
})(typeof window !== 'undefined' ? window : globalThis);
