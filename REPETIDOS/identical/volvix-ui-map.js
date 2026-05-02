/**
 * volvix-ui-map.js
 * Mapa interactivo SVG de México con zonas (estados), choropleth, tooltips y eventos.
 * Expone: window.MapMX
 *
 * Uso:
 *   const map = MapMX.create('#map-container', {
 *     data: { 'MX-CMX': 120, 'MX-JAL': 80, ... },
 *     onStateClick: (code, value) => console.log(code, value),
 *     palette: ['#e8f4ff', '#0066cc'],
 *     tooltip: (code, name, value) => `${name}: ${value} ventas`
 *   });
 *   map.update({ 'MX-CMX': 200 });
 *   map.highlight('MX-JAL');
 *   map.reset();
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Catálogo de estados de México (32 entidades) con códigos ISO 3166-2:MX.
  // Las coordenadas son centroides aproximados en proyección equirectangular
  // simple (lon, lat) y luego mapeados a un viewBox 1000x600.
  // ---------------------------------------------------------------------------
  const MX_STATES = [
    { code: 'MX-AGU', name: 'Aguascalientes',     lon: -102.30, lat: 21.88 },
    { code: 'MX-BCN', name: 'Baja California',    lon: -115.50, lat: 30.50 },
    { code: 'MX-BCS', name: 'Baja California Sur',lon: -111.70, lat: 25.50 },
    { code: 'MX-CAM', name: 'Campeche',           lon: -90.30,  lat: 18.80 },
    { code: 'MX-CHP', name: 'Chiapas',            lon: -92.50,  lat: 16.50 },
    { code: 'MX-CHH', name: 'Chihuahua',          lon: -106.10, lat: 28.60 },
    { code: 'MX-COA', name: 'Coahuila',           lon: -102.00, lat: 27.30 },
    { code: 'MX-COL', name: 'Colima',             lon: -103.70, lat: 19.10 },
    { code: 'MX-CMX', name: 'Ciudad de México',   lon: -99.13,  lat: 19.43 },
    { code: 'MX-DUR', name: 'Durango',            lon: -104.65, lat: 24.55 },
    { code: 'MX-GUA', name: 'Guanajuato',         lon: -101.10, lat: 21.00 },
    { code: 'MX-GRO', name: 'Guerrero',           lon: -100.10, lat: 17.55 },
    { code: 'MX-HID', name: 'Hidalgo',            lon: -98.75,  lat: 20.50 },
    { code: 'MX-JAL', name: 'Jalisco',            lon: -103.65, lat: 20.65 },
    { code: 'MX-MEX', name: 'México',             lon: -99.60,  lat: 19.35 },
    { code: 'MX-MIC', name: 'Michoacán',          lon: -101.70, lat: 19.55 },
    { code: 'MX-MOR', name: 'Morelos',            lon: -99.05,  lat: 18.80 },
    { code: 'MX-NAY', name: 'Nayarit',            lon: -104.90, lat: 21.75 },
    { code: 'MX-NLE', name: 'Nuevo León',         lon: -99.85,  lat: 25.60 },
    { code: 'MX-OAX', name: 'Oaxaca',             lon: -96.75,  lat: 17.05 },
    { code: 'MX-PUE', name: 'Puebla',             lon: -97.90,  lat: 19.05 },
    { code: 'MX-QUE', name: 'Querétaro',          lon: -100.40, lat: 20.85 },
    { code: 'MX-ROO', name: 'Quintana Roo',       lon: -88.30,  lat: 19.60 },
    { code: 'MX-SLP', name: 'San Luis Potosí',    lon: -100.30, lat: 22.60 },
    { code: 'MX-SIN', name: 'Sinaloa',            lon: -107.40, lat: 25.00 },
    { code: 'MX-SON', name: 'Sonora',             lon: -110.00, lat: 29.30 },
    { code: 'MX-TAB', name: 'Tabasco',            lon: -92.60,  lat: 17.85 },
    { code: 'MX-TAM', name: 'Tamaulipas',         lon: -98.60,  lat: 24.30 },
    { code: 'MX-TLA', name: 'Tlaxcala',           lon: -98.20,  lat: 19.40 },
    { code: 'MX-VER', name: 'Veracruz',           lon: -96.40,  lat: 19.20 },
    { code: 'MX-YUC', name: 'Yucatán',            lon: -89.10,  lat: 20.70 },
    { code: 'MX-ZAC', name: 'Zacatecas',          lon: -102.90, lat: 23.20 }
  ];

  // Bounding box de México (aprox).
  const MX_BBOX = { minLon: -118.5, maxLon: -86.0, minLat: 14.5, maxLat: 32.8 };
  const VIEW_W = 1000;
  const VIEW_H = 600;
  const PAD = 20;

  function project(lon, lat) {
    const x = PAD + ((lon - MX_BBOX.minLon) / (MX_BBOX.maxLon - MX_BBOX.minLon)) * (VIEW_W - 2 * PAD);
    const y = PAD + ((MX_BBOX.maxLat - lat) / (MX_BBOX.maxLat - MX_BBOX.minLat)) * (VIEW_H - 2 * PAD);
    return [x, y];
  }

  // ---------------------------------------------------------------------------
  // Utilidades de color (interpolación lineal entre 2 hex).
  // ---------------------------------------------------------------------------
  function hexToRgb(h) {
    const c = h.replace('#', '');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  function rgbToHex(r, g, b) {
    const toH = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + toH(r) + toH(g) + toH(b);
  }
  function lerpColor(c1, c2, t) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }
  function colorFor(value, min, max, palette) {
    if (value == null || isNaN(value) || max === min) return '#e5e7eb';
    const t = (value - min) / (max - min);
    return lerpColor(palette[0], palette[1], Math.max(0, Math.min(1, t)));
  }

  // ---------------------------------------------------------------------------
  // Voronoi tipo "lazy": para cada estado dibujamos un círculo (zona clickable).
  // No es un polígono geográfico real; es una representación esquemática
  // suficiente para tooltips, choropleth y eventos.
  // ---------------------------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---------------------------------------------------------------------------
  // Tooltip flotante.
  // ---------------------------------------------------------------------------
  function makeTooltip() {
    const t = document.createElement('div');
    t.className = 'mapmx-tooltip';
    t.style.cssText = [
      'position:fixed', 'pointer-events:none', 'background:rgba(17,24,39,.95)',
      'color:#fff', 'padding:6px 10px', 'border-radius:6px',
      'font:12px/1.3 system-ui,sans-serif', 'box-shadow:0 4px 12px rgba(0,0,0,.25)',
      'transform:translate(-50%,-110%)', 'opacity:0', 'transition:opacity .12s',
      'z-index:99999', 'white-space:nowrap'
    ].join(';');
    document.body.appendChild(t);
    return t;
  }

  // ---------------------------------------------------------------------------
  // Constructor principal.
  // ---------------------------------------------------------------------------
  function create(target, opts) {
    opts = opts || {};
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) throw new Error('MapMX: contenedor no encontrado: ' + target);

    const palette = opts.palette || ['#dbeafe', '#1e40af'];
    const tooltipFn = opts.tooltip || ((c, n, v) => `${n}${v != null ? ' — ' + v : ''}`);
    const onClick = opts.onStateClick || function () {};
    const onHover = opts.onStateHover || function () {};
    let data = Object.assign({}, opts.data || {});
    let selected = null;

    container.innerHTML = '';
    container.style.position = container.style.position || 'relative';

    const svg = el('svg', {
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      width: '100%',
      height: '100%',
      role: 'img',
      'aria-label': 'Mapa interactivo de México'
    });
    svg.style.cssText = 'background:#f8fafc;border-radius:8px;display:block;max-width:100%;';

    // Capa de fondo (silueta país aprox. via rect redondeado decorativo).
    const bg = el('rect', {
      x: 10, y: 10, width: VIEW_W - 20, height: VIEW_H - 20,
      rx: 16, ry: 16, fill: '#ffffff', stroke: '#e2e8f0', 'stroke-width': 1
    });
    svg.appendChild(bg);

    // Título.
    const title = el('text', {
      x: VIEW_W / 2, y: 36, 'text-anchor': 'middle',
      'font-family': 'system-ui,sans-serif', 'font-size': 18, 'font-weight': 700, fill: '#0f172a'
    });
    title.textContent = opts.title || 'México';
    svg.appendChild(title);

    // Capa de zonas.
    const layer = el('g', { id: 'mapmx-zones' });
    svg.appendChild(layer);

    // Capa de etiquetas.
    const labels = el('g', { id: 'mapmx-labels', 'pointer-events': 'none' });
    svg.appendChild(labels);

    // Tooltip DOM.
    const tip = makeTooltip();

    // Calcular dominio.
    function domain() {
      const vals = Object.values(data).filter((v) => typeof v === 'number' && !isNaN(v));
      if (!vals.length) return [0, 0];
      return [Math.min.apply(null, vals), Math.max.apply(null, vals)];
    }

    const zoneByCode = {};

    function render() {
      layer.innerHTML = '';
      labels.innerHTML = '';
      const [mn, mx] = domain();

      MX_STATES.forEach((s) => {
        const [cx, cy] = project(s.lon, s.lat);
        const v = data[s.code];
        const fill = colorFor(v, mn, mx, palette);

        const r = 22 + (v != null && mx > mn ? ((v - mn) / (mx - mn)) * 10 : 0);

        const circle = el('circle', {
          cx, cy, r,
          fill,
          stroke: '#1e293b',
          'stroke-width': 1,
          'data-code': s.code,
          'data-name': s.name,
          tabindex: 0,
          role: 'button',
          'aria-label': `${s.name}${v != null ? ' valor ' + v : ''}`,
          style: 'cursor:pointer;transition:stroke-width .1s,filter .1s;'
        });

        circle.addEventListener('mouseenter', (ev) => {
          circle.setAttribute('stroke-width', 2.5);
          circle.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,.25))';
          tip.innerHTML = tooltipFn(s.code, s.name, v);
          tip.style.opacity = '1';
          tip.style.left = ev.clientX + 'px';
          tip.style.top = ev.clientY + 'px';
          onHover(s.code, v, s);
        });
        circle.addEventListener('mousemove', (ev) => {
          tip.style.left = ev.clientX + 'px';
          tip.style.top = ev.clientY + 'px';
        });
        circle.addEventListener('mouseleave', () => {
          if (selected !== s.code) {
            circle.setAttribute('stroke-width', 1);
            circle.style.filter = '';
          }
          tip.style.opacity = '0';
        });
        circle.addEventListener('click', () => {
          if (selected && zoneByCode[selected]) {
            zoneByCode[selected].setAttribute('stroke-width', 1);
            zoneByCode[selected].style.filter = '';
          }
          selected = s.code;
          circle.setAttribute('stroke-width', 3);
          circle.setAttribute('stroke', '#dc2626');
          onClick(s.code, v, s);
        });
        circle.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            circle.dispatchEvent(new MouseEvent('click'));
          }
        });

        layer.appendChild(circle);
        zoneByCode[s.code] = circle;

        // Etiqueta corta (siglas tras el guion).
        const lbl = el('text', {
          x: cx, y: cy + 4, 'text-anchor': 'middle',
          'font-family': 'system-ui,sans-serif', 'font-size': 10,
          'font-weight': 600, fill: '#0f172a'
        });
        lbl.textContent = s.code.split('-')[1];
        labels.appendChild(lbl);
      });

      drawLegend(mn, mx);
    }

    // Leyenda choropleth.
    let legendG = null;
    function drawLegend(mn, mx) {
      if (legendG) legendG.remove();
      legendG = el('g', { id: 'mapmx-legend', transform: `translate(${VIEW_W - 220}, ${VIEW_H - 60})` });

      const gradId = 'mapmx-grad-' + Math.random().toString(36).slice(2, 7);
      const defs = el('defs');
      const grad = el('linearGradient', { id: gradId, x1: 0, x2: 1, y1: 0, y2: 0 });
      grad.appendChild(el('stop', { offset: '0%', 'stop-color': palette[0] }));
      grad.appendChild(el('stop', { offset: '100%', 'stop-color': palette[1] }));
      defs.appendChild(grad);
      legendG.appendChild(defs);

      legendG.appendChild(el('rect', {
        x: 0, y: 0, width: 200, height: 12, rx: 4, ry: 4, fill: `url(#${gradId})`,
        stroke: '#cbd5e1', 'stroke-width': 1
      }));
      const tMin = el('text', {
        x: 0, y: 28, 'font-size': 10, 'font-family': 'system-ui,sans-serif', fill: '#475569'
      });
      tMin.textContent = String(mn);
      const tMax = el('text', {
        x: 200, y: 28, 'text-anchor': 'end',
        'font-size': 10, 'font-family': 'system-ui,sans-serif', fill: '#475569'
      });
      tMax.textContent = String(mx);
      legendG.appendChild(tMin);
      legendG.appendChild(tMax);
      svg.appendChild(legendG);
    }

    container.appendChild(svg);
    render();

    // ----- API pública -----
    return {
      svg,
      states: MX_STATES.slice(),
      update(newData) {
        data = Object.assign({}, newData || {});
        render();
      },
      patch(partial) {
        Object.assign(data, partial || {});
        render();
      },
      highlight(code) {
        const z = zoneByCode[code];
        if (!z) return false;
        if (selected && zoneByCode[selected]) {
          zoneByCode[selected].setAttribute('stroke-width', 1);
          zoneByCode[selected].setAttribute('stroke', '#1e293b');
        }
        selected = code;
        z.setAttribute('stroke-width', 3);
        z.setAttribute('stroke', '#dc2626');
        return true;
      },
      reset() {
        if (selected && zoneByCode[selected]) {
          zoneByCode[selected].setAttribute('stroke-width', 1);
          zoneByCode[selected].setAttribute('stroke', '#1e293b');
          zoneByCode[selected].style.filter = '';
        }
        selected = null;
      },
      getSelected() { return selected; },
      getValue(code) { return data[code]; },
      destroy() {
        try { tip.remove(); } catch (e) {}
        container.innerHTML = '';
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Export window.MapMX
  // ---------------------------------------------------------------------------
  global.MapMX = {
    create,
    states: MX_STATES.slice(),
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : this);
