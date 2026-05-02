/**
 * volvix-ui-charts-pro.js
 * UI Charts Pro: Heatmap, Funnel, Gauge, Radar, Treemap, Sankey (basico)
 * SVG nativo. Sin dependencias.
 *
 * API: window.ChartsPro
 *   ChartsPro.heatmap(target, data, opts)
 *   ChartsPro.funnel(target, data, opts)
 *   ChartsPro.gauge(target, value, opts)
 *   ChartsPro.radar(target, data, opts)
 *   ChartsPro.treemap(target, data, opts)
 *   ChartsPro.sankey(target, {nodes,links}, opts)
 */
(function (global) {
  'use strict';

  // ====================== UTILIDADES ======================
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function resolveTarget(target) {
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function createSVG(w, h) {
    return el('svg', {
      xmlns: SVG_NS,
      width: w,
      height: h,
      viewBox: `0 0 ${w} ${h}`,
      'font-family': 'Segoe UI, Roboto, Helvetica, Arial, sans-serif'
    });
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function colorScale(t, c0, c1) {
    const a = hexToRgb(c0), b = hexToRgb(c1);
    return rgbToHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  }

  function defaultPalette() {
    return ['#4f8bf5', '#6ed29a', '#f5a44f', '#e96b6b', '#a06bf5', '#f5d24f', '#4fcfd2', '#d24fa0'];
  }

  function tooltip() {
    let tip = document.getElementById('__chartspro_tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = '__chartspro_tip';
      tip.style.cssText =
        'position:fixed;pointer-events:none;background:rgba(20,20,28,.92);' +
        'color:#fff;padding:6px 9px;border-radius:6px;font:12px Segoe UI,sans-serif;' +
        'z-index:99999;display:none;box-shadow:0 4px 14px rgba(0,0,0,.3);max-width:240px;';
      document.body.appendChild(tip);
    }
    return {
      show(x, y, html) {
        tip.innerHTML = html;
        tip.style.left = (x + 12) + 'px';
        tip.style.top = (y + 12) + 'px';
        tip.style.display = 'block';
      },
      hide() { tip.style.display = 'none'; }
    };
  }

  function attachHover(node, html) {
    const tip = tooltip();
    node.addEventListener('mousemove', e => tip.show(e.clientX, e.clientY, html));
    node.addEventListener('mouseleave', () => tip.hide());
  }

  // ====================== HEATMAP ======================
  function heatmap(target, data, opts) {
    opts = opts || {};
    const host = resolveTarget(target);
    if (!host) return;
    clear(host);

    const rows = data.length;
    const cols = data[0].length;
    const cell = opts.cell || 28;
    const pad = opts.pad || 60;
    const w = cols * cell + pad * 2;
    const h = rows * cell + pad * 2;

    let min = Infinity, max = -Infinity;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const v = data[r][c];
        if (v < min) min = v;
        if (v > max) max = v;
      }

    const c0 = opts.colorLow || '#0d2b54';
    const c1 = opts.colorHigh || '#f5d24f';

    const svg = createSVG(w, h);

    if (opts.title) {
      const t = el('text', { x: w / 2, y: 24, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 600, fill: '#222' });
      t.textContent = opts.title;
      svg.appendChild(t);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = data[r][c];
        const t = max === min ? 0.5 : (v - min) / (max - min);
        const rect = el('rect', {
          x: pad + c * cell, y: pad + r * cell,
          width: cell - 2, height: cell - 2,
          fill: colorScale(t, c0, c1), rx: 3
        });
        attachHover(rect, `<b>(${(opts.rowLabels || [])[r] || r}, ${(opts.colLabels || [])[c] || c})</b><br>${v}`);
        svg.appendChild(rect);

        if (opts.showValues) {
          const tx = el('text', {
            x: pad + c * cell + (cell - 2) / 2,
            y: pad + r * cell + (cell - 2) / 2 + 4,
            'text-anchor': 'middle', 'font-size': 10,
            fill: t > 0.55 ? '#222' : '#fff'
          });
          tx.textContent = v;
          svg.appendChild(tx);
        }
      }
    }

    if (opts.rowLabels) opts.rowLabels.forEach((lbl, i) => {
      const t = el('text', { x: pad - 6, y: pad + i * cell + cell / 2 + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#444' });
      t.textContent = lbl; svg.appendChild(t);
    });
    if (opts.colLabels) opts.colLabels.forEach((lbl, i) => {
      const t = el('text', { x: pad + i * cell + cell / 2, y: pad - 8, 'text-anchor': 'middle', 'font-size': 11, fill: '#444' });
      t.textContent = lbl; svg.appendChild(t);
    });

    host.appendChild(svg);
    return svg;
  }

  // ====================== FUNNEL ======================
  function funnel(target, data, opts) {
    opts = opts || {};
    const host = resolveTarget(target);
    if (!host) return;
    clear(host);

    const w = opts.width || 520;
    const h = opts.height || Math.max(220, data.length * 60);
    const pad = 40;
    const max = Math.max.apply(null, data.map(d => d.value));
    const palette = opts.palette || defaultPalette();

    const svg = createSVG(w, h);
    if (opts.title) {
      const t = el('text', { x: w / 2, y: 22, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 600, fill: '#222' });
      t.textContent = opts.title; svg.appendChild(t);
    }

    const stepH = (h - pad * 2) / data.length;
    const cx = w / 2;
    let prevHalf = ((data[0].value / max) * (w - pad * 2)) / 2;

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const ratio = d.value / max;
      const half = (ratio * (w - pad * 2)) / 2;
      const y0 = pad + i * stepH;
      const y1 = y0 + stepH - 6;

      const nextHalf = i < data.length - 1
        ? ((data[i + 1].value / max) * (w - pad * 2)) / 2
        : half * 0.6;

      const path = `M ${cx - prevHalf} ${y0} L ${cx + prevHalf} ${y0} L ${cx + nextHalf} ${y1} L ${cx - nextHalf} ${y1} Z`;
      const seg = el('path', { d: path, fill: palette[i % palette.length], opacity: 0.92 });
      const pct = i === 0 ? 100 : ((d.value / data[0].value) * 100).toFixed(1);
      attachHover(seg, `<b>${d.label}</b><br>${d.value} (${pct}%)`);
      svg.appendChild(seg);

      const txt = el('text', {
        x: cx, y: (y0 + y1) / 2 + 4,
        'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: '#fff'
      });
      txt.textContent = `${d.label}: ${d.value}`;
      svg.appendChild(txt);

      prevHalf = nextHalf;
    }

    host.appendChild(svg);
    return svg;
  }

  // ====================== GAUGE ======================
  function gauge(target, value, opts) {
    opts = opts || {};
    const host = resolveTarget(target);
    if (!host) return;
    clear(host);

    const min = opts.min != null ? opts.min : 0;
    const max = opts.max != null ? opts.max : 100;
    const w = opts.width || 280;
    const h = opts.height || 180;
    const cx = w / 2, cy = h * 0.85, r = Math.min(w, h * 1.6) / 2 - 20;

    const svg = createSVG(w, h);

    function arc(start, end, color, thick) {
      const t = thick || 18;
      const a0 = Math.PI + start * Math.PI;
      const a1 = Math.PI + end * Math.PI;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const large = end - start > 0.5 ? 1 : 0;
      const path = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
      return el('path', { d: path, stroke: color, 'stroke-width': t, fill: 'none', 'stroke-linecap': 'round' });
    }

    svg.appendChild(arc(0, 1, '#e8e8ee', 18));

    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const zones = opts.zones || [
      { upTo: 0.5, color: '#6ed29a' },
      { upTo: 0.8, color: '#f5a44f' },
      { upTo: 1.0, color: '#e96b6b' }
    ];
    let last = 0;
    for (const z of zones) {
      if (t <= last) break;
      const end = Math.min(t, z.upTo);
      svg.appendChild(arc(last, end, z.color, 18));
      last = end;
      if (last >= t) break;
    }

    const ang = Math.PI + t * Math.PI;
    const nx = cx + (r - 20) * Math.cos(ang);
    const ny = cy + (r - 20) * Math.sin(ang);
    svg.appendChild(el('line', { x1: cx, y1: cy, x2: nx, y2: ny, stroke: '#222', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    svg.appendChild(el('circle', { cx, cy, r: 6, fill: '#222' }));

    const lbl = el('text', { x: cx, y: cy - 18, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700, fill: '#222' });
    lbl.textContent = (opts.format ? opts.format(value) : value);
    svg.appendChild(lbl);

    if (opts.title) {
      const tt = el('text', { x: cx, y: 22, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 600, fill: '#444' });
      tt.textContent = opts.title; svg.appendChild(tt);
    }

    host.appendChild(svg);
    return svg;
  }

  // ====================== RADAR ======================
  function radar(target, data, opts) {
    opts = opts || {};
    const host = resolveTarget(target);
    if (!host) return;
    clear(host);

    const axes = data.axes;
    const series = data.series;
    const w = opts.width || 380, h = opts.height || 380;
    const cx = w / 2, cy = h / 2 + 8, r = Math.min(w, h) / 2 - 40;
    const palette = opts.palette || defaultPalette();
    const max = opts.max || Math.max.apply(null,
      series.flatMap(s => s.values));

    const svg = createSVG(w, h);

    const rings = opts.rings || 4;
    for (let i = 1; i <= rings; i++) {
      const rr = (r * i) / rings;
      const pts = axes.map((_, k) => {
        const a = -Math.PI / 2 + (k / axes.length) * Math.PI * 2;
        return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      });
      svg.appendChild(el('polygon', {
        points: pts.map(p => p.join(',')).join(' '),
        fill: 'none', stroke: '#dcdce6', 'stroke-width': 1
      }));
    }

    axes.forEach((label, k) => {
      const a = -Math.PI / 2 + (k / axes.length) * Math.PI * 2;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      svg.appendChild(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#dcdce6' }));
      const tx = el('text', {
        x: cx + (r + 14) * Math.cos(a),
        y: cy + (r + 14) * Math.sin(a) + 4,
        'text-anchor': 'middle', 'font-size': 11, fill: '#444'
      });
      tx.textContent = label;
      svg.appendChild(tx);
    });

    series.forEach((s, idx) => {
      const color = s.color || palette[idx % palette.length];
      const pts = s.values.map((v, k) => {
        const a = -Math.PI / 2 + (k / axes.length) * Math.PI * 2;
        const rr = (Math.max(0, Math.min(v, max)) / max) * r;
        return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      });
      svg.appendChild(el('polygon', {
        points: pts.map(p => p.join(',')).join(' '),
        fill: color, 'fill-opacity': 0.25, stroke: color, 'stroke-width': 2
      }));
      pts.forEach((p, k) => {
        const dot = el('circle', { cx: p[0], cy: p[1], r: 3.5, fill: color });
        attachHover(dot, `<b>${s.name}</b><br>${axes[k]}: ${s.values[k]}`);
        svg.appendChild(dot);
      });
    });

    if (opts.legend !== false) {
      series.forEach((s, idx) => {
        const color = s.color || palette[idx % palette.length];
        const y = 14 + idx * 16;
        svg.appendChild(el('rect', { x: 10, y: y - 8, width: 10, height: 10, fill: color, rx: 2 }));
        const t = el('text', { x: 26, y: y + 1, 'font-size': 11, fill: '#333' });
        t.textContent = s.name; svg.appendChild(t);
      });
    }

    host.appendChild(svg);
    return svg;
  }

  // ====================== TREEMAP (squarified simple) ======================
  function treemap(target, data, opts) {
    opts = opts || {};
    const host = resolveTarget(target);
    if (!host) return;
    clear(host);

    const w = opts.width || 600;
    const h = opts.height || 380;
    const palette = opts.palette || defaultPalette();
    const svg = createSVG(w, h);

    const items = data.slice().sort((a, b) => b.value - a.value);
    const total = items.reduce((s, d) => s + d.value, 0);

    function layout(arr, x, y, ww, hh) {
      if (!arr.length) return;
      if (arr.length === 1) {
        draw(arr[0], x, y, ww, hh);
        return;
      }
      const sum = arr.reduce((s, d) => s + d.value, 0);
      const horizontal = ww >= hh;
      let acc = 0;
      const half = arr.slice(0, Math.ceil(arr.length / 2));
      const rest = arr.slice(Math.ceil(arr.length / 2));
      const halfSum = half.reduce((s, d) => s + d.value, 0);
      const ratio = halfSum / sum;
      if (horizontal) {
        const ww1 = ww * ratio;
        layoutPack(half, x, y, ww1, hh);
        layoutPack(rest, x + ww1, y, ww - ww1, hh);
      } else {
        const hh1 = hh * ratio;
        layoutPack(half, x, y, ww, hh1);
        layoutPack(rest, x, y + hh1, ww, hh - hh1);
      }
    }

    function layoutPack(arr, x, y, ww, hh) {
      if (!arr.length) return;
      if (arr.length === 1) { draw(arr[0], x, y, ww, hh); return; }
      const sum = arr.reduce((s, d) => s + d.value, 0);
      const horizontal = ww >= hh;
      let off = 0;
      arr.forEach(d => {
        const frac = d.value / sum;
        if (horizontal) {
          draw(d, x + off, y, ww * frac, hh);
          off += ww * frac;
        } else {
          draw(d, x, y + off, ww, hh * frac);
          off += hh * frac;
        }
      });
    }

    function draw(d, x, y, ww, hh) {
      const idx = items.indexOf(d);
      const color = d.color || palette[idx % palette.length];
      const rect = el('rect', {
        x: x + 1, y: y + 1, width: Math.max(0, ww - 2), height: Math.max(0, hh - 2),
        fill: color, opacity: 0.92, rx: 3
      });
      attachHover(rect, `<b>${d.label}</b><br>${d.value} (${((d.value / total) * 100).toFixed(1)}%)`);
      svg.appendChild(rect);
      if (ww > 50 && hh > 22) {
        const t = el('text', {
          x: x + 6, y: y + 16, 'font-size': 11, 'font-weight': 600, fill: '#fff'
        });
        t.textContent = d.label;
        svg.appendChild(t);
        if (hh > 38) {
          const v = el('text', { x: x + 6, y: y + 30, 'font-size': 10, fill: '#fff', opacity: 0.85 });
          v.textContent = d.value;
          svg.appendChild(v);
        }
      }
    }

    layout(items, 0, opts.title ? 28 : 0, w, h - (opts.title ? 28 : 0));
    if (opts.title) {
      const t = el('text', { x: w / 2, y: 20, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 600, fill: '#222' });
      t.textContent = opts.title; svg.appendChild(t);
    }
    host.appendChild(svg);
    return svg;
  }

  // ====================== SANKEY (basico, 2 columnas o niveles inferidos) ======================
  function sankey(target, graph, opts) {
    opts = opts || {};
    const host = resolveTarget(target);
    if (!host) return;
    clear(host);

    const w = opts.width || 640;
    const h = opts.height || 360;
    const palette = opts.palette || defaultPalette();
    const svg = createSVG(w, h);

    // Asignar nivel por BFS desde nodos sin entradas
    const nodes = graph.nodes.map((n, i) => ({ ...n, idx: i, level: -1, inSum: 0, outSum: 0 }));
    const links = graph.links.map(l => ({ ...l }));

    nodes.forEach(n => { n.inSum = 0; n.outSum = 0; });
    links.forEach(l => {
      nodes[l.source].outSum += l.value;
      nodes[l.target].inSum += l.value;
    });

    const roots = nodes.filter(n => n.inSum === 0);
    roots.forEach(r => r.level = 0);
    let changed = true, guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      links.forEach(l => {
        const s = nodes[l.source], t = nodes[l.target];
        if (s.level >= 0 && (t.level < 0 || t.level <= s.level)) {
          t.level = s.level + 1; changed = true;
        }
      });
    }
    const maxLevel = Math.max.apply(null, nodes.map(n => n.level));

    // Agrupar por nivel
    const byLevel = {};
    nodes.forEach(n => { (byLevel[n.level] = byLevel[n.level] || []).push(n); });

    const padX = 20, padY = 20;
    const colW = (w - padX * 2) / (maxLevel + 1);
    const nodeW = 16;

    // Calcular altura por nodo (max in/out)
    const totalFlow = Math.max.apply(null, Object.keys(byLevel).map(lv =>
      byLevel[lv].reduce((s, n) => s + Math.max(n.inSum, n.outSum, 1), 0)
    ));
    const scale = (h - padY * 2) / totalFlow;

    Object.keys(byLevel).forEach(lv => {
      const arr = byLevel[lv];
      let yoff = padY;
      const gap = 10;
      arr.forEach((n, i) => {
        n.height = Math.max(8, Math.max(n.inSum, n.outSum, 1) * scale - gap);
        n.x = padX + Number(lv) * colW;
        n.y = yoff;
        yoff += n.height + gap;
      });
    });

    // Dibujar links
    const usedSrc = {}, usedTgt = {};
    links.sort((a, b) => b.value - a.value).forEach(l => {
      const s = nodes[l.source], t = nodes[l.target];
      const sh = (l.value * scale);
      const th = sh;
      const sy = (s.y + (usedSrc[s.idx] || 0));
      const ty = (t.y + (usedTgt[t.idx] || 0));
      usedSrc[s.idx] = (usedSrc[s.idx] || 0) + sh;
      usedTgt[t.idx] = (usedTgt[t.idx] || 0) + th;

      const x0 = s.x + nodeW, x1 = t.x;
      const xm = (x0 + x1) / 2;
      const d = `M ${x0} ${sy} C ${xm} ${sy}, ${xm} ${ty}, ${x1} ${ty} L ${x1} ${ty + th} C ${xm} ${ty + th}, ${xm} ${sy + sh}, ${x0} ${sy + sh} Z`;
      const color = l.color || palette[s.idx % palette.length];
      const path = el('path', { d, fill: color, 'fill-opacity': 0.35 });
      attachHover(path, `<b>${s.name} -> ${t.name}</b><br>${l.value}`);
      svg.appendChild(path);
    });

    // Dibujar nodos
    nodes.forEach((n, i) => {
      const color = n.color || palette[i % palette.length];
      const rect = el('rect', { x: n.x, y: n.y, width: nodeW, height: n.height, fill: color, rx: 2 });
      attachHover(rect, `<b>${n.name}</b><br>in:${n.inSum} out:${n.outSum}`);
      svg.appendChild(rect);
      const isRight = n.level === maxLevel;
      const tx = el('text', {
        x: isRight ? n.x - 4 : n.x + nodeW + 4,
        y: n.y + n.height / 2 + 4,
        'text-anchor': isRight ? 'end' : 'start',
        'font-size': 11, fill: '#333'
      });
      tx.textContent = n.name;
      svg.appendChild(tx);
    });

    if (opts.title) {
      const t = el('text', { x: w / 2, y: 14, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 600, fill: '#222' });
      t.textContent = opts.title; svg.appendChild(t);
    }

    host.appendChild(svg);
    return svg;
  }

  // ====================== EXPORT ======================
  const ChartsPro = {
    version: '1.0.0',
    heatmap, funnel, gauge, radar, treemap, sankey,
    _utils: { colorScale, defaultPalette, tooltip }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ChartsPro;
  global.ChartsPro = ChartsPro;
})(typeof window !== 'undefined' ? window : this);
