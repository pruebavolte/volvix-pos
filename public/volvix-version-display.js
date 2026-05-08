/**
 * volvix-version-display.js
 *
 * Carga /version.json y reemplaza:
 *   - Cualquier elemento con id="footer-version" o data-volvix-version
 *     -> textContent = "Ver. <version>"
 *   - Cualquier elemento con id="footer-date" o data-volvix-date
 *     -> textContent = formato real de la fecha (locale es-MX)
 *
 * Uso: agregar <script src="/volvix-version-display.js" defer></script>
 * y en el HTML poner spans con esos IDs/atributos.
 *
 * Tambien expone window.VolvixVersion = { version, commit, date, branch }.
 */
(function () {
  'use strict';
  const _MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const dia = d.getDate();
      const mes = _MESES[d.getMonth()];
      const anio = d.getFullYear();
      const h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 || 12;
      return `${dia} ${mes} ${anio} · ${h12}:${m} ${ampm}`;
    } catch (_) { return iso; }
  }

  function applyVersion(data) {
    if (!data || !data.version) return;
    window.VolvixVersion = {
      version: data.version,
      commit: data.commit || '',
      date: data.date || data.built_at || '',
      branch: data.branch || 'main',
      patch: data.patch || 0,
    };

    // Versiones: elementos con id="footer-version" o atributo data-volvix-version
    const verEls = [
      ...document.querySelectorAll('#footer-version'),
      ...document.querySelectorAll('[data-volvix-version]'),
    ];
    verEls.forEach(el => { el.textContent = 'Ver. ' + data.version; });

    // Fechas: elementos con id="footer-date" o atributo data-volvix-date
    const dateStr = fmtDate(data.date || data.built_at);
    const dateEls = [
      ...document.querySelectorAll('#footer-date'),
      ...document.querySelectorAll('[data-volvix-date]'),
    ];
    dateEls.forEach(el => { el.textContent = dateStr; });

    // Tambien dispara un evento para que otros modulos puedan reaccionar.
    try {
      window.dispatchEvent(new CustomEvent('volvix:version-loaded', { detail: data }));
    } catch (_) {}
  }

  function load() {
    // Cache-bust para asegurar version fresca cada deploy
    fetch('/version.json?_=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(applyVersion)
      .catch(err => console.warn('[VolvixVersion] no se pudo cargar /version.json', err));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
