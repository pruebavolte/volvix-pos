/* 2026-09-20 Loyverse APK — Boton 📷 "Escanear con la camara" + interruptor Configuracion > General.
 * Sin tocar el HTML grande: este archivo inserta (1) el interruptor en #cfg-general y (2) el boton en la barra
 * de la vista Loyverse (#lv-appbar) y en la fila clasica de codigo (.pos-code-bar).
 * Visible SOLO si window.VolvixPlatform.canScan() (camara disponible: android con el plugin de escaner) y el
 * interruptor "Usar la camara para escanear" esta ON (localStorage volvix_scan_camera; default ON).
 * Al leer un codigo llama a window.searchProduct(codigo) (el mismo flujo que ENTER en "Codigo del Producto").
 */
(function () {
  'use strict';
  var KEY = 'volvix_scan_camera';
  var P = function () { return window.VolvixPlatform; };

  function canScan() { try { return !!(P() && typeof P().canScan === 'function' && P().canScan()); } catch (_) { return false; } }
  function isOn() { try { return window.localStorage.getItem(KEY) !== '0'; } catch (_) { return true; } }
  function setOn(v) { try { window.localStorage.setItem(KEY, v ? '1' : '0'); } catch (_) {} }
  function toast(m, t) { try { if (typeof window.showToast === 'function') window.showToast(m, t); } catch (_) {} }

  function onScan() {
    var p = P();
    if (!p || typeof p.scanBarcode !== 'function') return;
    p.scanBarcode().then(function (r) {
      if (r && r.ok && r.code) {
        if (typeof window.searchProduct === 'function') { window.searchProduct(r.code); return; }
        var inp = document.getElementById('barcode-input');
        if (inp) { inp.value = r.code; inp.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true })); }
      } else if (r && !r.cancelled) {
        toast(r.unsupported ? 'Escaner no disponible en este dispositivo' : ('No se pudo escanear: ' + (r.error || 'error')), 'error');
      }
    }).catch(function () { toast('No se pudo escanear', 'error'); });
  }

  function mkBtn(id, cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = cls;
    b.setAttribute('data-vlx-keep', '1');
    b.setAttribute('aria-label', 'Escanear código con la cámara');
    b.title = 'Escanear con la cámara';
    b.textContent = '📷';
    b.addEventListener('click', onScan);
    return b;
  }

  // Inserta (una sola vez) los botones donde existan sus contenedores
  function mount() {
    var ab = document.getElementById('lv-appbar');
    var search = document.getElementById('lv-appbar-search');
    if (ab && search && !document.getElementById('vlx-scan-btn-lv')) ab.insertBefore(mkBtn('vlx-scan-btn-lv', 'lv-ab-btn'), search);
    var bar = document.querySelector('.pos-code-bar');
    if (bar && !document.getElementById('vlx-scan-btn-pos')) {
      var b = mkBtn('vlx-scan-btn-pos', 'btn');
      b.style.cssText = 'margin-left:8px;padding:8px 10px;background:transparent;border:1px solid #d1d5db;border-radius:6px;font-size:16px;cursor:pointer';
      bar.appendChild(b);
    }
    var cfg = document.getElementById('cfg-general');
    if (cfg && !document.getElementById('vlx-cfg-scan-row')) {
      var row = document.createElement('div');
      row.id = 'vlx-cfg-scan-row'; row.setAttribute('data-vlx-keep', '1');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid var(--border)';
      row.innerHTML = '<div><strong style="font-size:12.5px">Usar la cámara para escanear</strong>' +
        '<div style="font-size:11px;color:var(--text-3)">Muestra el botón 📷 para leer códigos de barras</div></div>' +
        '<div id="vlx-cfg-scan-toggle" data-vlx-keep="1" class="toggle" role="switch" tabindex="0" title="Usar la cámara para escanear"></div>';
      cfg.appendChild(row);
      var tg = row.querySelector('#vlx-cfg-scan-toggle');
      var flip = function () { setOn(!isOn()); apply(); };
      tg.addEventListener('click', flip);
      tg.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    }
  }

  // Muestra/oculta segun disponibilidad + interruptor
  function apply() {
    var avail = canScan(), on = isOn();
    ['vlx-scan-btn-lv', 'vlx-scan-btn-pos'].forEach(function (id) {
      var b = document.getElementById(id); if (b) b.style.display = (avail && on) ? '' : 'none';
    });
    var row = document.getElementById('vlx-cfg-scan-row'); if (row) row.style.display = avail ? 'flex' : 'none';
    var tg = document.getElementById('vlx-cfg-scan-toggle');
    if (tg) { tg.classList.toggle('on', on); tg.setAttribute('aria-checked', on ? 'true' : 'false'); }
  }

  function init() { mount(); apply(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  // El POS re-renderiza partes de la pantalla: reintenta unos segundos por si los contenedores llegan tarde
  var tries = 0, iv = setInterval(function () { mount(); apply(); if (++tries > 20) clearInterval(iv); }, 1000);

  window.VolvixScanButton = { canScan: canScan, isOn: isOn, setOn: function (v) { setOn(v); apply(); }, scan: onScan };
})();
