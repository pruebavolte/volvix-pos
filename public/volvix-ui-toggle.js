/**
 * Volvix UI - Toggle/Switch Component
 * Exposes: window.Toggle
 *
 * Features:
 *  - on/off states with smooth animation
 *  - sizes: sm, md, lg, xl
 *  - colors: primary, success, danger, warning, info, dark
 *  - disabled state
 *  - optional on/off icons (text or HTML)
 *  - optional labels (left/right)
 *  - controlled and uncontrolled modes
 *  - change events (onChange callback + DOM 'toggle:change')
 *  - keyboard accessible (Space/Enter)
 *  - programmatic API: setState, toggle, enable, disable, destroy
 */
(function (global) {
    'use strict';

    var STYLE_ID = 'volvix-toggle-styles';

    var SIZES = {
        sm: { w: 28, h: 16, knob: 12, font: 9 },
        md: { w: 40, h: 22, knob: 18, font: 11 },
        lg: { w: 52, h: 28, knob: 24, font: 13 },
        xl: { w: 64, h: 34, knob: 30, font: 15 }
    };

    var COLORS = {
        primary: '#2563eb',
        success: '#16a34a',
        danger:  '#dc2626',
        warning: '#d97706',
        info:    '#0891b2',
        dark:    '#1f2937'
    };

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var css = ''
            + '.vx-toggle{display:inline-flex;align-items:center;gap:8px;font-family:system-ui,sans-serif;cursor:pointer;user-select:none;vertical-align:middle}'
            + '.vx-toggle.vx-disabled{opacity:.55;cursor:not-allowed}'
            + '.vx-toggle-track{position:relative;background:#cbd5e1;border-radius:999px;transition:background .2s ease;flex-shrink:0;box-sizing:border-box}'
            + '.vx-toggle.vx-on .vx-toggle-track{background:var(--vx-toggle-color,#2563eb)}'
            + '.vx-toggle-knob{position:absolute;top:50%;left:2px;transform:translateY(-50%);background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s ease}'
            + '.vx-toggle-icon{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-weight:700;pointer-events:none;line-height:1;transition:opacity .15s ease}'
            + '.vx-toggle-icon-on{left:6px;opacity:0}'
            + '.vx-toggle-icon-off{right:6px;opacity:1;color:#64748b}'
            + '.vx-toggle.vx-on .vx-toggle-icon-on{opacity:1}'
            + '.vx-toggle.vx-on .vx-toggle-icon-off{opacity:0}'
            + '.vx-toggle:focus-visible{outline:2px solid #60a5fa;outline-offset:2px;border-radius:6px}'
            + '.vx-toggle-label{font-size:13px;color:#1f2937}';
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = css;
        document.head.appendChild(s);
    }

    function resolveTarget(t) {
        if (!t) return null;
        if (typeof t === 'string') return document.querySelector(t);
        if (t.nodeType === 1) return t;
        return null;
    }

    function Toggle(options) {
        if (!(this instanceof Toggle)) return new Toggle(options);
        injectStyles();

        options = options || {};
        this.options = {
            target:       options.target || null,
            checked:      !!options.checked,
            size:         SIZES[options.size] ? options.size : 'md',
            color:        options.color || 'primary',
            disabled:     !!options.disabled,
            iconOn:       options.iconOn || '',
            iconOff:      options.iconOff || '',
            labelLeft:    options.labelLeft || '',
            labelRight:   options.labelRight || '',
            name:         options.name || '',
            onChange:     typeof options.onChange === 'function' ? options.onChange : null
        };

        this.state = { checked: this.options.checked, disabled: this.options.disabled };
        this._build();

        var parent = resolveTarget(this.options.target);
        if (parent) parent.appendChild(this.el);
    }

    Toggle.prototype._build = function () {
        var o = this.options;
        var size = SIZES[o.size];
        var colorVal = COLORS[o.color] || o.color;

        var root = document.createElement('span');
        root.className = 'vx-toggle';
        root.setAttribute('role', 'switch');
        root.setAttribute('tabindex', o.disabled ? '-1' : '0');
        root.setAttribute('aria-checked', String(this.state.checked));
        root.style.setProperty('--vx-toggle-color', colorVal);
        if (this.state.checked) root.classList.add('vx-on');
        if (this.state.disabled) root.classList.add('vx-disabled');

        if (o.labelLeft) {
            var ll = document.createElement('span');
            ll.className = 'vx-toggle-label';
            ll.textContent = o.labelLeft;
            root.appendChild(ll);
        }

        var track = document.createElement('span');
        track.className = 'vx-toggle-track';
        track.style.width  = size.w + 'px';
        track.style.height = size.h + 'px';

        if (o.iconOn) {
            var ion = document.createElement('span');
            ion.className = 'vx-toggle-icon vx-toggle-icon-on';
            ion.style.fontSize = size.font + 'px';
            ion.innerHTML = o.iconOn;
            track.appendChild(ion);
        }
        if (o.iconOff) {
            var ioff = document.createElement('span');
            ioff.className = 'vx-toggle-icon vx-toggle-icon-off';
            ioff.style.fontSize = size.font + 'px';
            ioff.innerHTML = o.iconOff;
            track.appendChild(ioff);
        }

        var knob = document.createElement('span');
        knob.className = 'vx-toggle-knob';
        knob.style.width  = size.knob + 'px';
        knob.style.height = size.knob + 'px';
        track.appendChild(knob);
        this._knob = knob;
        this._track = track;
        this._size = size;
        this._positionKnob();

        root.appendChild(track);

        if (o.labelRight) {
            var lr = document.createElement('span');
            lr.className = 'vx-toggle-label';
            lr.textContent = o.labelRight;
            root.appendChild(lr);
        }

        if (o.name) {
            var hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = o.name;
            hidden.value = this.state.checked ? '1' : '0';
            root.appendChild(hidden);
            this._hidden = hidden;
        }

        var self = this;
        this._onClick = function () { if (!self.state.disabled) self.toggle(); };
        this._onKey = function (e) {
            if (self.state.disabled) return;
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); self.toggle(); }
        };
        root.addEventListener('click', this._onClick);
        root.addEventListener('keydown', this._onKey);

        this.el = root;
    };

    Toggle.prototype._positionKnob = function () {
        var s = this._size;
        var offOn = (s.w - s.knob - 2) + 'px';
        this._knob.style.left = this.state.checked ? offOn : '2px';
    };

    Toggle.prototype.setState = function (checked, silent) {
        checked = !!checked;
        if (checked === this.state.checked) return this;
        this.state.checked = checked;
        this.el.classList.toggle('vx-on', checked);
        this.el.setAttribute('aria-checked', String(checked));
        this._positionKnob();
        if (this._hidden) this._hidden.value = checked ? '1' : '0';
        if (!silent) {
            if (this.options.onChange) {
                try { this.options.onChange(checked, this); } catch (e) {}
            }
            this.el.dispatchEvent(new CustomEvent('toggle:change', {
                detail: { checked: checked, instance: this },
                bubbles: true
            }));
        }
        return this;
    };

    Toggle.prototype.toggle  = function () { return this.setState(!this.state.checked); };
    Toggle.prototype.isOn    = function () { return this.state.checked; };
    Toggle.prototype.enable  = function () {
        this.state.disabled = false;
        this.el.classList.remove('vx-disabled');
        this.el.setAttribute('tabindex', '0');
        return this;
    };
    Toggle.prototype.disable = function () {
        this.state.disabled = true;
        this.el.classList.add('vx-disabled');
        this.el.setAttribute('tabindex', '-1');
        return this;
    };
    Toggle.prototype.destroy = function () {
        this.el.removeEventListener('click', this._onClick);
        this.el.removeEventListener('keydown', this._onKey);
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
        this.el = null;
    };

    Toggle.create = function (opts) { return new Toggle(opts); };
    Toggle.SIZES  = SIZES;
    Toggle.COLORS = COLORS;

    global.Toggle = Toggle;
})(typeof window !== 'undefined' ? window : this);
