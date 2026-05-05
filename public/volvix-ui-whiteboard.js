/**
 * volvix-ui-whiteboard.js
 * Whiteboard canvas con dibujo libre, borrador, formas (linea, rect, circulo),
 * colores, grosor, deshacer/rehacer, limpiar, guardar PNG.
 *
 * Uso:
 *   const wb = window.Whiteboard.create({ container: '#wb', width: 900, height: 600 });
 *   wb.setColor('#ff0000');
 *   wb.setTool('rect');
 *   wb.savePNG('mi-dibujo.png');
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    width: 800,
    height: 500,
    background: '#ffffff',
    color: '#111111',
    size: 3,
    tool: 'pen', // pen | eraser | line | rect | circle
    maxHistory: 50,
  };

  const PALETTE = [
    '#111111', '#ffffff', '#e53935', '#fb8c00', '#fdd835',
    '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#90a4ae'
  ];

  const TOOLS = ['pen', 'eraser', 'line', 'rect', 'circle'];

  function createElement(tag, props, children) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'style' && typeof props[k] === 'object') {
          Object.assign(el.style, props[k]);
        } else if (k.startsWith('on') && typeof props[k] === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (k === 'className') {
          el.className = props[k];
        } else {
          el.setAttribute(k, props[k]);
        }
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }

  function styleButton(btn, active) {
    Object.assign(btn.style, {
      padding: '6px 10px',
      margin: '2px',
      border: active ? '2px solid #1e88e5' : '1px solid #ccc',
      background: active ? '#e3f2fd' : '#fafafa',
      cursor: 'pointer',
      borderRadius: '4px',
      fontSize: '13px',
      fontFamily: 'sans-serif',
    });
  }

  function Whiteboard(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    const container = typeof cfg.container === 'string'
      ? document.querySelector(cfg.container)
      : cfg.container;

    if (!container) throw new Error('Whiteboard: container no encontrado');

    // ---------------- estado ----------------
    const state = {
      color: cfg.color,
      size: cfg.size,
      tool: cfg.tool,
      drawing: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      history: [],
      redoStack: [],
      snapshot: null, // snapshot para preview de formas
    };

    // ---------------- DOM ----------------
    const root = createElement('div', {
      className: 'volvix-wb',
      style: {
        display: 'inline-block',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '8px',
        background: '#f5f5f5',
        fontFamily: 'sans-serif',
        userSelect: 'none',
      }
    });

    const toolbar = createElement('div', {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: '6px',
        gap: '4px',
      }
    });

    const canvas = createElement('canvas', {
      width: cfg.width,
      height: cfg.height,
      style: {
        background: cfg.background,
        border: '1px solid #bbb',
        borderRadius: '4px',
        cursor: 'crosshair',
        display: 'block',
        touchAction: 'none',
      }
    });

    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = cfg.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ---------------- toolbar buttons ----------------
    const toolButtons = {};
    TOOLS.forEach(t => {
      const b = createElement('button', {
        type: 'button',
        title: t,
        onclick: () => api.setTool(t),
      }, t);
      styleButton(b, t === state.tool);
      toolButtons[t] = b;
      toolbar.appendChild(b);
    });

    toolbar.appendChild(createElement('span', { style: { width: '10px' } }));

    // colors
    const colorButtons = [];
    PALETTE.forEach(c => {
      const cb = createElement('button', {
        type: 'button',
        title: c,
        onclick: () => api.setColor(c),
        style: {
          width: '22px',
          height: '22px',
          margin: '2px',
          background: c,
          border: c === state.color ? '2px solid #000' : '1px solid #999',
          borderRadius: '50%',
          cursor: 'pointer',
          padding: 0,
        }
      });
      colorButtons.push({ btn: cb, color: c });
      toolbar.appendChild(cb);
    });

    const colorPicker = createElement('input', {
      type: 'color',
      value: state.color,
      style: { width: '32px', height: '28px', margin: '2px', cursor: 'pointer' },
      onchange: (e) => api.setColor(e.target.value),
    });
    toolbar.appendChild(colorPicker);

    toolbar.appendChild(createElement('span', { style: { width: '10px' } }));

    const sizeLabel = createElement('span', {
      style: { fontSize: '12px', margin: '0 4px' }
    }, 'Grosor: ' + state.size);
    const sizeInput = createElement('input', {
      type: 'range', min: '1', max: '40', value: String(state.size),
      style: { verticalAlign: 'middle' },
      oninput: (e) => {
        api.setSize(parseInt(e.target.value, 10));
      }
    });
    toolbar.appendChild(sizeLabel);
    toolbar.appendChild(sizeInput);

    toolbar.appendChild(createElement('span', { style: { width: '10px' } }));

    const undoBtn = createElement('button', {
      type: 'button', onclick: () => api.undo()
    }, 'Deshacer');
    styleButton(undoBtn, false);

    const redoBtn = createElement('button', {
      type: 'button', onclick: () => api.redo()
    }, 'Rehacer');
    styleButton(redoBtn, false);

    const clearBtn = createElement('button', {
      type: 'button', onclick: () => api.clear()
    }, 'Limpiar');
    styleButton(clearBtn, false);

    const saveBtn = createElement('button', {
      type: 'button', onclick: () => api.savePNG()
    }, 'Guardar PNG');
    styleButton(saveBtn, false);

    [undoBtn, redoBtn, clearBtn, saveBtn].forEach(b => toolbar.appendChild(b));

    root.appendChild(toolbar);
    root.appendChild(canvas);
    container.appendChild(root);

    // ---------------- helpers ----------------
    function pushHistory() {
      try {
        const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
        state.history.push(snap);
        if (state.history.length > cfg.maxHistory) state.history.shift();
        state.redoStack.length = 0;
      } catch (e) {
        // ignore (canvas tainted)
      }
    }

    function snapshotPreview() {
      try {
        state.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (e) {
        state.snapshot = null;
      }
    }

    function restorePreview() {
      if (state.snapshot) ctx.putImageData(state.snapshot, 0, 0);
    }

    function getPos(evt) {
      const rect = canvas.getBoundingClientRect();
      const t = evt.touches && evt.touches[0];
      const cx = t ? t.clientX : evt.clientX;
      const cy = t ? t.clientY : evt.clientY;
      return {
        x: (cx - rect.left) * (canvas.width / rect.width),
        y: (cy - rect.top) * (canvas.height / rect.height),
      };
    }

    function applyStroke() {
      ctx.lineWidth = state.size;
      if (state.tool === 'eraser') {
        ctx.strokeStyle = cfg.background;
        ctx.fillStyle = cfg.background;
      } else {
        ctx.strokeStyle = state.color;
        ctx.fillStyle = state.color;
      }
    }

    function refreshToolButtons() {
      TOOLS.forEach(t => styleButton(toolButtons[t], t === state.tool));
    }

    function refreshColorButtons() {
      colorButtons.forEach(({ btn, color }) => {
        btn.style.border = color === state.color ? '2px solid #000' : '1px solid #999';
      });
      colorPicker.value = state.color;
    }

    // ---------------- event handlers ----------------
    function onDown(evt) {
      evt.preventDefault();
      const p = getPos(evt);
      state.drawing = true;
      state.startX = p.x;
      state.startY = p.y;
      state.lastX = p.x;
      state.lastY = p.y;
      pushHistory();
      applyStroke();

      if (state.tool === 'pen' || state.tool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 0.01, p.y + 0.01);
        ctx.stroke();
      } else {
        snapshotPreview();
      }
    }

    function onMove(evt) {
      if (!state.drawing) return;
      evt.preventDefault();
      const p = getPos(evt);
      applyStroke();

      if (state.tool === 'pen' || state.tool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(state.lastX, state.lastY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        state.lastX = p.x;
        state.lastY = p.y;
        return;
      }

      // shape preview
      restorePreview();
      ctx.beginPath();
      if (state.tool === 'line') {
        ctx.moveTo(state.startX, state.startY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (state.tool === 'rect') {
        ctx.strokeRect(
          state.startX, state.startY,
          p.x - state.startX, p.y - state.startY
        );
      } else if (state.tool === 'circle') {
        const dx = p.x - state.startX;
        const dy = p.y - state.startY;
        const r = Math.sqrt(dx * dx + dy * dy);
        ctx.arc(state.startX, state.startY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function onUp(evt) {
      if (!state.drawing) return;
      state.drawing = false;
      state.snapshot = null;
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    // keyboard shortcuts
    function onKey(e) {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        api.undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        api.redo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        api.savePNG();
      }
    }
    window.addEventListener('keydown', onKey);

    // ---------------- API publica ----------------
    const api = {
      canvas,
      ctx,
      setColor(c) {
        state.color = c;
        refreshColorButtons();
      },
      setSize(n) {
        state.size = Math.max(1, Math.min(100, n | 0));
        sizeLabel.textContent = 'Grosor: ' + state.size;
        sizeInput.value = String(state.size);
      },
      setTool(t) {
        if (TOOLS.indexOf(t) === -1) return;
        state.tool = t;
        canvas.style.cursor = (t === 'eraser') ? 'cell' : 'crosshair';
        refreshToolButtons();
      },
      undo() {
        if (!state.history.length) return;
        try {
          const cur = ctx.getImageData(0, 0, canvas.width, canvas.height);
          state.redoStack.push(cur);
        } catch (e) { /* ignore */ }
        const prev = state.history.pop();
        ctx.putImageData(prev, 0, 0);
      },
      redo() {
        if (!state.redoStack.length) return;
        try {
          const cur = ctx.getImageData(0, 0, canvas.width, canvas.height);
          state.history.push(cur);
        } catch (e) { /* ignore */ }
        const nxt = state.redoStack.pop();
        ctx.putImageData(nxt, 0, 0);
      },
      clear() {
        pushHistory();
        ctx.fillStyle = cfg.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },
      savePNG(filename) {
        const name = filename || ('whiteboard-' + Date.now() + '.png');
        try {
          const url = canvas.toDataURL('image/png');
          const a = createElement('a', { href: url, download: name });
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return url;
        } catch (e) {
          console.error('savePNG fallo:', e);
          return null;
        }
      },
      toDataURL(type) {
        return canvas.toDataURL(type || 'image/png');
      },
      loadImage(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            pushHistory();
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve();
          };
          img.onerror = reject;
          img.src = src;
        });
      },
      destroy() {
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
        window.removeEventListener('keydown', onKey);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      getState() {
        return {
          color: state.color,
          size: state.size,
          tool: state.tool,
          historyDepth: state.history.length,
          redoDepth: state.redoStack.length,
        };
      }
    };

    return api;
  }

  global.Whiteboard = {
    create(opts) { return Whiteboard(opts); },
    PALETTE: PALETTE.slice(),
    TOOLS: TOOLS.slice(),
    version: '1.0.0',
  };

})(typeof window !== 'undefined' ? window : this);
