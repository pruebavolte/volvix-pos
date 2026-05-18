/**
 * volvix-ui-phone.js
 * UI Phone Input internacional con country flags, formato automatico y validacion.
 * Expone: window.PhoneInput
 *
 * Uso:
 *   const ph = PhoneInput.create(containerEl, { defaultCountry: 'MX', onChange: (v)=>{} });
 *   ph.getValue();        // { country, dial, national, e164, valid }
 *   ph.setCountry('US');
 *   ph.setValue('+5215512345678');
 *   ph.destroy();
 */
(function (global) {
  'use strict';

  // ───────────────────────── Country dataset ─────────────────────────
  // [iso2, name, dial, format mask (# = digit), example length]
  const COUNTRIES = [
    ['MX', 'Mexico',         '52',  '## #### ####',     10],
    ['US', 'United States',  '1',   '(###) ###-####',   10],
    ['CA', 'Canada',         '1',   '(###) ###-####',   10],
    ['AR', 'Argentina',      '54',  '## ####-####',     10],
    ['BR', 'Brazil',         '55',  '(##) #####-####',  11],
    ['CL', 'Chile',          '56',  '# ####-####',      9],
    ['CO', 'Colombia',       '57',  '### ###-####',     10],
    ['PE', 'Peru',           '51',  '### ### ###',      9],
    ['VE', 'Venezuela',      '58',  '###-#######',      10],
    ['EC', 'Ecuador',        '593', '## ###-####',      9],
    ['UY', 'Uruguay',        '598', '#### ####',        8],
    ['PY', 'Paraguay',       '595', '### ######',       9],
    ['BO', 'Bolivia',        '591', '########',         8],
    ['CR', 'Costa Rica',     '506', '####-####',        8],
    ['PA', 'Panama',         '507', '####-####',        8],
    ['GT', 'Guatemala',      '502', '####-####',        8],
    ['HN', 'Honduras',       '504', '####-####',        8],
    ['SV', 'El Salvador',    '503', '####-####',        8],
    ['NI', 'Nicaragua',      '505', '####-####',        8],
    ['DO', 'Dominican Rep.', '1',   '(###) ###-####',   10],
    ['PR', 'Puerto Rico',    '1',   '(###) ###-####',   10],
    ['CU', 'Cuba',           '53',  '########',         8],
    ['ES', 'Spain',          '34',  '### ### ###',      9],
    ['FR', 'France',         '33',  '# ## ## ## ##',    9],
    ['DE', 'Germany',        '49',  '### #######',      11],
    ['IT', 'Italy',          '39',  '### ### ####',     10],
    ['PT', 'Portugal',       '351', '### ### ###',      9],
    ['GB', 'United Kingdom', '44',  '#### ######',      10],
    ['IE', 'Ireland',        '353', '## ### ####',      9],
    ['NL', 'Netherlands',    '31',  '## ### ####',      9],
    ['BE', 'Belgium',        '32',  '### ## ## ##',     9],
    ['CH', 'Switzerland',    '41',  '## ### ## ##',     9],
    ['AT', 'Austria',        '43',  '### #######',      10],
    ['SE', 'Sweden',         '46',  '## ### ## ##',     9],
    ['NO', 'Norway',         '47',  '### ## ###',       8],
    ['DK', 'Denmark',        '45',  '## ## ## ##',      8],
    ['FI', 'Finland',        '358', '## ### ####',      9],
    ['PL', 'Poland',         '48',  '### ### ###',      9],
    ['CZ', 'Czechia',        '420', '### ### ###',      9],
    ['GR', 'Greece',         '30',  '### ### ####',     10],
    ['RU', 'Russia',         '7',   '(###) ###-##-##',  10],
    ['UA', 'Ukraine',        '380', '## ### ## ##',     9],
    ['TR', 'Turkey',         '90',  '### ### ## ##',    10],
    ['IL', 'Israel',         '972', '## ###-####',      9],
    ['SA', 'Saudi Arabia',   '966', '## ### ####',      9],
    ['AE', 'UAE',            '971', '## ### ####',      9],
    ['EG', 'Egypt',          '20',  '## ### ####',      10],
    ['ZA', 'South Africa',   '27',  '## ### ####',      9],
    ['NG', 'Nigeria',        '234', '### ### ####',     10],
    ['KE', 'Kenya',          '254', '### ######',       9],
    ['MA', 'Morocco',        '212', '##-####-####',     9],
    ['IN', 'India',          '91',  '#####-#####',      10],
    ['PK', 'Pakistan',       '92',  '### #######',      10],
    ['BD', 'Bangladesh',     '880', '####-######',      10],
    ['CN', 'China',          '86',  '### #### ####',    11],
    ['JP', 'Japan',          '81',  '##-####-####',     10],
    ['KR', 'South Korea',    '82',  '##-####-####',     10],
    ['TW', 'Taiwan',         '886', '### ### ###',      9],
    ['HK', 'Hong Kong',      '852', '#### ####',        8],
    ['SG', 'Singapore',      '65',  '#### ####',        8],
    ['MY', 'Malaysia',       '60',  '##-### ####',      9],
    ['TH', 'Thailand',       '66',  '##-###-####',      9],
    ['VN', 'Vietnam',        '84',  '### ### ###',      9],
    ['ID', 'Indonesia',      '62',  '###-###-####',     11],
    ['PH', 'Philippines',    '63',  '### ### ####',     10],
    ['AU', 'Australia',      '61',  '### ### ###',      9],
    ['NZ', 'New Zealand',    '64',  '##-###-####',      9]
  ].map(c => ({
    iso: c[0], name: c[1], dial: c[2], mask: c[3], len: c[4],
    flag: isoToFlag(c[0])
  }));

  function isoToFlag(iso) {
    if (!iso || iso.length !== 2) return '';
    const A = 0x1F1E6, base = 'A'.charCodeAt(0);
    return String.fromCodePoint(A + iso.charCodeAt(0) - base) +
           String.fromCodePoint(A + iso.charCodeAt(1) - base);
  }

  function findByIso(iso) {
    iso = (iso || '').toUpperCase();
    return COUNTRIES.find(c => c.iso === iso) || null;
  }
  function findByDial(num) {
    // Greedy match: longest dial code prefix wins.
    const digits = (num || '').replace(/\D/g, '');
    let best = null;
    for (const c of COUNTRIES) {
      if (digits.startsWith(c.dial)) {
        if (!best || c.dial.length > best.dial.length) best = c;
      }
    }
    return best;
  }

  function applyMask(digits, mask) {
    let out = '', i = 0;
    for (const ch of mask) {
      if (i >= digits.length) break;
      if (ch === '#') { out += digits[i++]; } else { out += ch; }
    }
    return out;
  }

  // ───────────────────────── Styles (one-shot inject) ─────────────────────────
  const STYLE_ID = 'volvix-phone-input-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      .vx-phone{display:flex;align-items:stretch;border:1px solid #d0d4dc;border-radius:8px;
        background:#fff;font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        position:relative;min-height:40px;box-sizing:border-box}
      .vx-phone.vx-focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.18)}
      .vx-phone.vx-invalid{border-color:#ef4444}
      .vx-phone.vx-invalid.vx-focus{box-shadow:0 0 0 3px rgba(239,68,68,.18)}
      .vx-phone.vx-valid .vx-check{display:inline}
      .vx-phone__btn{display:flex;align-items:center;gap:6px;padding:0 10px;
        background:#f7f8fa;border:0;border-right:1px solid #e3e6ec;border-radius:8px 0 0 8px;
        cursor:pointer;font-size:14px;color:#1f2937;user-select:none}
      .vx-phone__btn:hover{background:#eef0f4}
      .vx-phone__flag{font-size:18px;line-height:1}
      .vx-phone__dial{color:#6b7280;font-variant-numeric:tabular-nums}
      .vx-phone__caret{font-size:10px;color:#9ca3af}
      .vx-phone__input{flex:1;border:0;outline:0;padding:0 12px;background:transparent;
        font:inherit;color:#111827;border-radius:0 8px 8px 0;min-width:0}
      .vx-phone__input::placeholder{color:#9ca3af}
      .vx-check{display:none;align-self:center;padding-right:10px;color:#10b981;font-weight:700}
      .vx-phone__menu{position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:280px;
        overflow:auto;background:#fff;border:1px solid #d0d4dc;border-radius:8px;
        box-shadow:0 10px 25px rgba(0,0,0,.12);z-index:9999;display:none}
      .vx-phone__menu.vx-open{display:block}
      .vx-phone__search{position:sticky;top:0;background:#fff;padding:8px;border-bottom:1px solid #eef0f4}
      .vx-phone__search input{width:100%;padding:6px 8px;border:1px solid #d0d4dc;
        border-radius:6px;font:inherit;outline:0;box-sizing:border-box}
      .vx-phone__search input:focus{border-color:#3b82f6}
      .vx-phone__opt{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer}
      .vx-phone__opt:hover,.vx-phone__opt.vx-active{background:#eef4ff}
      .vx-phone__opt .vx-name{flex:1;color:#1f2937}
      .vx-phone__opt .vx-dial{color:#6b7280;font-variant-numeric:tabular-nums}
      .vx-phone__empty{padding:12px;color:#9ca3af;text-align:center}
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ───────────────────────── Component ─────────────────────────
  function create(container, options) {
    if (!container) throw new Error('PhoneInput: container required');
    injectStyles();
    const opts = Object.assign({
      defaultCountry: 'MX',
      placeholder: 'Numero de telefono',
      name: 'phone',
      onChange: null
    }, options || {});

    let country = findByIso(opts.defaultCountry) || COUNTRIES[0];
    let nationalDigits = '';

    // DOM
    const root = document.createElement('div');
    root.className = 'vx-phone';
    root.innerHTML = `
      <button type="button" class="vx-phone__btn" tabindex="-1">
        <span class="vx-phone__flag"></span>
        <span class="vx-phone__dial"></span>
        <span class="vx-phone__caret">&#9662;</span>
      </button>
      <input class="vx-phone__input" type="tel" autocomplete="tel"
             inputmode="numeric" name="${escapeAttr(opts.name)}"
             placeholder="${escapeAttr(opts.placeholder)}">
      <span class="vx-check" aria-hidden="true">&#10003;</span>
      <div class="vx-phone__menu" role="listbox">
        <div class="vx-phone__search"><input type="text" placeholder="Buscar pais..."></div>
        <div class="vx-phone__list"></div>
      </div>
    `;
    container.appendChild(root);

    const btn       = root.querySelector('.vx-phone__btn');
    const flagEl    = root.querySelector('.vx-phone__flag');
    const dialEl    = root.querySelector('.vx-phone__dial');
    const input     = root.querySelector('.vx-phone__input');
    const menu      = root.querySelector('.vx-phone__menu');
    const search    = menu.querySelector('input');
    const listEl    = menu.querySelector('.vx-phone__list');

    function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

    function renderCountryButton() {
      flagEl.textContent = country.flag;
      dialEl.textContent = '+' + country.dial;
    }

    function renderList(filter) {
      const f = (filter || '').trim().toLowerCase();
      const items = COUNTRIES.filter(c =>
        !f || c.name.toLowerCase().includes(f) ||
        c.iso.toLowerCase().includes(f) ||
        c.dial.includes(f.replace(/^\+/, ''))
      );
      if (!items.length) {
        listEl.innerHTML = '<div class="vx-phone__empty">Sin resultados</div>';
        return;
      }
      listEl.innerHTML = items.map(c => `
        <div class="vx-phone__opt${c.iso === country.iso ? ' vx-active' : ''}"
             role="option" data-iso="${c.iso}">
          <span class="vx-phone__flag">${c.flag}</span>
          <span class="vx-name">${c.name}</span>
          <span class="vx-dial">+${c.dial}</span>
        </div>`).join('');
    }

    function openMenu() {
      renderList('');
      menu.classList.add('vx-open');
      search.value = '';
      setTimeout(() => search.focus(), 0);
    }
    function closeMenu() { menu.classList.remove('vx-open'); }

    function isValid() {
      return nationalDigits.length === country.len;
    }

    function updateValidityClass() {
      root.classList.toggle('vx-valid', isValid());
      root.classList.toggle('vx-invalid', nationalDigits.length > 0 && !isValid());
    }

    function format() {
      input.value = applyMask(nationalDigits, country.mask);
      updateValidityClass();
    }

    function emitChange() {
      if (typeof opts.onChange === 'function') {
        opts.onChange(getValue());
      }
    }

    function getValue() {
      return {
        country: country.iso,
        dial: country.dial,
        national: nationalDigits,
        e164: nationalDigits ? '+' + country.dial + nationalDigits : '',
        valid: isValid()
      };
    }

    function setCountry(iso) {
      const c = findByIso(iso);
      if (!c) return;
      country = c;
      renderCountryButton();
      // Trim digits if exceed new length
      if (nationalDigits.length > country.len) {
        nationalDigits = nationalDigits.slice(0, country.len);
      }
      format();
      emitChange();
    }

    function setValue(raw) {
      const s = String(raw || '');
      if (s.startsWith('+')) {
        const c = findByDial(s.slice(1));
        if (c) {
          country = c;
          renderCountryButton();
          nationalDigits = s.slice(1).replace(/\D/g, '').slice(c.dial.length, c.dial.length + c.len);
        } else {
          nationalDigits = s.replace(/\D/g, '').slice(0, country.len);
        }
      } else {
        nationalDigits = s.replace(/\D/g, '').slice(0, country.len);
      }
      format();
      emitChange();
    }

    // ─── Wire events ───
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.contains('vx-open') ? closeMenu() : openMenu();
    });
    search.addEventListener('input', () => renderList(search.value));
    listEl.addEventListener('click', (e) => {
      const opt = e.target.closest('.vx-phone__opt');
      if (!opt) return;
      setCountry(opt.dataset.iso);
      closeMenu();
      input.focus();
    });
    input.addEventListener('focus', () => root.classList.add('vx-focus'));
    input.addEventListener('blur',  () => root.classList.remove('vx-focus'));
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, country.len);
      nationalDigits = digits;
      // Preserve caret roughly at end after re-format
      format();
      emitChange();
    });
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || global.clipboardData).getData('text');
      if (text && text.trim().startsWith('+')) {
        e.preventDefault();
        setValue(text.trim());
      }
    });
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('vx-open')) closeMenu();
    });

    // Initial render
    renderCountryButton();
    format();

    return {
      el: root,
      getValue,
      setValue,
      setCountry,
      isValid: () => isValid(),
      focus: () => input.focus(),
      destroy: () => { root.remove(); }
    };
  }

  global.PhoneInput = {
    create,
    countries: COUNTRIES,
    findByIso,
    findByDial,
    version: '1.0.0'
  };
})(window);
