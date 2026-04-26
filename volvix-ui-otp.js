/**
 * volvix-ui-otp.js
 * OTP Input Component for Volvix UI
 *
 * Features:
 *  - 4 or 6 digit code input
 *  - Auto-focus next box on input
 *  - Backspace moves to previous box
 *  - Paste support (distributes digits across boxes)
 *  - Optional masked display (password style)
 *  - Numeric-only or alphanumeric mode
 *  - Arrow key navigation
 *  - Disabled / error / success states
 *  - onComplete callback when all boxes filled
 *  - onChange callback on every change
 *  - Theme-able via CSS variables
 *  - Programmatic API: getValue, setValue, clear, focus, setError
 *
 * Usage:
 *   const otp = window.OTPInput.create({
 *     container: document.getElementById('otp-root'),
 *     length: 6,
 *     masked: false,
 *     numeric: true,
 *     onComplete: (code) => console.log('OTP:', code),
 *     onChange:   (code) => console.log('partial:', code)
 *   });
 *   otp.focus();
 *   otp.setError('Código incorrecto');
 *   otp.clear();
 */
(function (global) {
    'use strict';

    // ---------- Inject base styles once ----------
    const STYLE_ID = 'volvix-otp-styles';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const css = `
        .volvix-otp-wrap {
            --otp-size: 52px;
            --otp-gap: 10px;
            --otp-radius: 10px;
            --otp-bd: #cfd6e0;
            --otp-bd-focus: #2563eb;
            --otp-bd-error: #dc2626;
            --otp-bd-ok: #16a34a;
            --otp-bg: #ffffff;
            --otp-bg-disabled: #f3f4f6;
            --otp-fg: #111827;
            --otp-font: 600 22px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            display: inline-flex;
            flex-direction: column;
            gap: 6px;
        }
        .volvix-otp-row {
            display: inline-flex;
            gap: var(--otp-gap);
        }
        .volvix-otp-cell {
            width: var(--otp-size);
            height: var(--otp-size);
            text-align: center;
            border: 1.5px solid var(--otp-bd);
            border-radius: var(--otp-radius);
            background: var(--otp-bg);
            color: var(--otp-fg);
            font: var(--otp-font);
            outline: none;
            transition: border-color .15s, box-shadow .15s, transform .05s;
            caret-color: var(--otp-bd-focus);
        }
        .volvix-otp-cell:focus {
            border-color: var(--otp-bd-focus);
            box-shadow: 0 0 0 3px rgba(37,99,235,.15);
        }
        .volvix-otp-cell:disabled {
            background: var(--otp-bg-disabled);
            color: #9ca3af;
            cursor: not-allowed;
        }
        .volvix-otp-wrap[data-state="error"] .volvix-otp-cell {
            border-color: var(--otp-bd-error);
            animation: volvix-otp-shake .35s;
        }
        .volvix-otp-wrap[data-state="success"] .volvix-otp-cell {
            border-color: var(--otp-bd-ok);
        }
        .volvix-otp-msg {
            font: 500 12px/1.3 system-ui, sans-serif;
            min-height: 14px;
            color: #6b7280;
        }
        .volvix-otp-wrap[data-state="error"] .volvix-otp-msg { color: var(--otp-bd-error); }
        .volvix-otp-wrap[data-state="success"] .volvix-otp-msg { color: var(--otp-bd-ok); }
        @keyframes volvix-otp-shake {
            0%,100%{transform:translateX(0)}
            25%{transform:translateX(-4px)}
            75%{transform:translateX(4px)}
        }
        `;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ---------- Helpers ----------
    function sanitize(str, numericOnly) {
        if (str == null) return '';
        str = String(str);
        return numericOnly ? str.replace(/\D+/g, '') : str.replace(/\s+/g, '');
    }

    // ---------- Factory ----------
    function create(opts) {
        injectStyles();
        const cfg = Object.assign({
            container: null,
            length: 6,
            masked: false,
            numeric: true,
            autoFocus: true,
            disabled: false,
            placeholder: '',
            onChange: null,
            onComplete: null,
            label: ''
        }, opts || {});

        if (!cfg.container) throw new Error('OTPInput: container is required');
        if (cfg.length !== 4 && cfg.length !== 6) {
            console.warn('OTPInput: recommended length is 4 or 6, got', cfg.length);
        }

        // Build DOM
        const wrap = document.createElement('div');
        wrap.className = 'volvix-otp-wrap';
        wrap.setAttribute('data-state', 'idle');

        const row = document.createElement('div');
        row.className = 'volvix-otp-row';
        wrap.appendChild(row);

        const msg = document.createElement('div');
        msg.className = 'volvix-otp-msg';
        msg.textContent = cfg.label || '';
        wrap.appendChild(msg);

        const cells = [];
        for (let i = 0; i < cfg.length; i++) {
            const inp = document.createElement('input');
            inp.className = 'volvix-otp-cell';
            inp.type = cfg.masked ? 'password' : 'text';
            inp.inputMode = cfg.numeric ? 'numeric' : 'text';
            inp.autocomplete = i === 0 ? 'one-time-code' : 'off';
            inp.maxLength = 1;
            inp.disabled = !!cfg.disabled;
            inp.setAttribute('aria-label', `Digit ${i + 1} of ${cfg.length}`);
            inp.dataset.idx = String(i);
            if (cfg.placeholder) inp.placeholder = cfg.placeholder.charAt(0) || '';
            row.appendChild(inp);
            cells.push(inp);
        }

        cfg.container.appendChild(wrap);

        // ---------- Logic ----------
        function getValue() {
            return cells.map(c => c.value || '').join('');
        }

        function fireChange() {
            const v = getValue();
            if (typeof cfg.onChange === 'function') {
                try { cfg.onChange(v); } catch (e) { console.error(e); }
            }
            if (v.length === cfg.length && !v.includes('') && typeof cfg.onComplete === 'function') {
                try { cfg.onComplete(v); } catch (e) { console.error(e); }
            }
        }

        function focusIdx(i) {
            if (i < 0 || i >= cells.length) return;
            cells[i].focus();
            cells[i].select();
        }

        function setValue(str) {
            const clean = sanitize(str, cfg.numeric).slice(0, cfg.length);
            for (let i = 0; i < cfg.length; i++) {
                cells[i].value = clean[i] || '';
            }
            fireChange();
        }

        function clear() {
            cells.forEach(c => c.value = '');
            wrap.setAttribute('data-state', 'idle');
            msg.textContent = cfg.label || '';
            focusIdx(0);
            fireChange();
        }

        function setError(message) {
            wrap.setAttribute('data-state', 'error');
            msg.textContent = message || 'Error';
        }

        function setSuccess(message) {
            wrap.setAttribute('data-state', 'success');
            msg.textContent = message || '';
        }

        function setDisabled(flag) {
            cells.forEach(c => c.disabled = !!flag);
        }

        // ---------- Events ----------
        cells.forEach((inp, idx) => {
            inp.addEventListener('input', (ev) => {
                let v = inp.value;
                if (cfg.numeric) v = v.replace(/\D+/g, '');
                if (v.length > 1) v = v.slice(-1);
                inp.value = v;
                if (wrap.getAttribute('data-state') === 'error') {
                    wrap.setAttribute('data-state', 'idle');
                    msg.textContent = cfg.label || '';
                }
                if (v && idx < cells.length - 1) focusIdx(idx + 1);
                fireChange();
            });

            inp.addEventListener('keydown', (ev) => {
                const key = ev.key;
                if (key === 'Backspace') {
                    if (!inp.value && idx > 0) {
                        ev.preventDefault();
                        cells[idx - 1].value = '';
                        focusIdx(idx - 1);
                        fireChange();
                    }
                } else if (key === 'ArrowLeft') {
                    ev.preventDefault();
                    focusIdx(idx - 1);
                } else if (key === 'ArrowRight') {
                    ev.preventDefault();
                    focusIdx(idx + 1);
                } else if (key === 'Home') {
                    ev.preventDefault();
                    focusIdx(0);
                } else if (key === 'End') {
                    ev.preventDefault();
                    focusIdx(cells.length - 1);
                } else if (key === 'Enter') {
                    const v = getValue();
                    if (v.length === cfg.length && typeof cfg.onComplete === 'function') {
                        cfg.onComplete(v);
                    }
                }
            });

            inp.addEventListener('paste', (ev) => {
                ev.preventDefault();
                const data = (ev.clipboardData || global.clipboardData).getData('text');
                const clean = sanitize(data, cfg.numeric);
                if (!clean) return;
                let i = idx;
                for (let k = 0; k < clean.length && i < cells.length; k++, i++) {
                    cells[i].value = clean[k];
                }
                focusIdx(Math.min(idx + clean.length, cells.length - 1));
                fireChange();
            });

            inp.addEventListener('focus', () => inp.select());
        });

        if (cfg.autoFocus && !cfg.disabled) {
            setTimeout(() => focusIdx(0), 0);
        }

        return {
            element: wrap,
            getValue,
            setValue,
            clear,
            focus: () => focusIdx(0),
            setError,
            setSuccess,
            setDisabled,
            destroy: () => { wrap.remove(); }
        };
    }

    global.OTPInput = { create, version: '1.0.0' };
})(window);
