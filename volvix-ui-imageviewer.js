/**
 * volvix-ui-imageviewer.js
 * Image Viewer / Lightbox UI component
 * Features: zoom, pan, rotate, gallery navigation, fullscreen, keyboard shortcuts
 * Exposes: window.ImageViewer
 */
(function (global) {
    'use strict';

    const STYLE_ID = 'volvix-imageviewer-styles';
    const CSS = `
    .vx-iv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;flex-direction:column;opacity:0;transition:opacity .2s ease;font-family:system-ui,sans-serif;color:#fff}
    .vx-iv-overlay.vx-open{opacity:1}
    .vx-iv-toolbar{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:rgba(0,0,0,.5);backdrop-filter:blur(8px)}
    .vx-iv-title{font-size:14px;opacity:.9;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .vx-iv-actions{display:flex;gap:6px}
    .vx-iv-btn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;width:36px;height:36px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:16px;transition:background .15s}
    .vx-iv-btn:hover{background:rgba(255,255,255,.22)}
    .vx-iv-btn:disabled{opacity:.35;cursor:not-allowed}
    .vx-iv-stage{flex:1;position:relative;overflow:hidden;cursor:grab;user-select:none}
    .vx-iv-stage.vx-grab{cursor:grabbing}
    .vx-iv-img{position:absolute;top:50%;left:50%;transform-origin:center center;max-width:none;max-height:none;will-change:transform;transition:transform .15s ease;-webkit-user-drag:none;pointer-events:none}
    .vx-iv-img.vx-no-anim{transition:none}
    .vx-iv-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);border:none;color:#fff;width:48px;height:64px;font-size:28px;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center}
    .vx-iv-nav:hover{background:rgba(0,0,0,.8)}
    .vx-iv-prev{left:16px}.vx-iv-next{right:16px}
    .vx-iv-counter{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);padding:6px 14px;border-radius:20px;font-size:13px}
    .vx-iv-thumbs{display:flex;gap:6px;padding:8px;overflow-x:auto;background:rgba(0,0,0,.5);max-height:90px}
    .vx-iv-thumb{flex:0 0 auto;width:70px;height:70px;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid transparent;opacity:.55;transition:all .15s}
    .vx-iv-thumb img{width:100%;height:100%;object-fit:cover}
    .vx-iv-thumb.vx-active{opacity:1;border-color:#4ade80}
    .vx-iv-thumb:hover{opacity:1}
    .vx-iv-spinner{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border:4px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:vx-iv-spin 1s linear infinite}
    @keyframes vx-iv-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}
    .vx-iv-hidden{display:none!important}
    `;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    class ImageViewerInstance {
        constructor(options = {}) {
            this.images = [];
            this.index = 0;
            this.scale = 1;
            this.rotation = 0;
            this.tx = 0;
            this.ty = 0;
            this.minScale = 0.1;
            this.maxScale = 10;
            this.dragging = false;
            this.lastX = 0;
            this.lastY = 0;
            this.options = Object.assign({ showThumbs: true, showCounter: true, closeOnBackdrop: true }, options);
            this._build();
            this._bind();
        }

        _build() {
            injectStyles();
            const o = document.createElement('div');
            o.className = 'vx-iv-overlay vx-iv-hidden';
            o.innerHTML = `
                <div class="vx-iv-toolbar">
                    <div class="vx-iv-title"></div>
                    <div class="vx-iv-actions">
                        <button class="vx-iv-btn" data-act="zoomout" title="Zoom out (-)">-</button>
                        <button class="vx-iv-btn" data-act="zoomin" title="Zoom in (+)">+</button>
                        <button class="vx-iv-btn" data-act="reset" title="Reset (0)">&#8634;</button>
                        <button class="vx-iv-btn" data-act="rotleft" title="Rotate left (L)">&#8630;</button>
                        <button class="vx-iv-btn" data-act="rotright" title="Rotate right (R)">&#8631;</button>
                        <button class="vx-iv-btn" data-act="full" title="Fullscreen (F)">&#9974;</button>
                        <button class="vx-iv-btn" data-act="download" title="Download (D)">&#11015;</button>
                        <button class="vx-iv-btn" data-act="close" title="Close (Esc)">&times;</button>
                    </div>
                </div>
                <div class="vx-iv-stage">
                    <button class="vx-iv-nav vx-iv-prev" data-act="prev">&#8249;</button>
                    <img class="vx-iv-img" alt="">
                    <div class="vx-iv-spinner vx-iv-hidden"></div>
                    <button class="vx-iv-nav vx-iv-next" data-act="next">&#8250;</button>
                    <div class="vx-iv-counter"></div>
                </div>
                <div class="vx-iv-thumbs"></div>
            `;
            document.body.appendChild(o);
            this.el = o;
            this.titleEl = o.querySelector('.vx-iv-title');
            this.stage = o.querySelector('.vx-iv-stage');
            this.img = o.querySelector('.vx-iv-img');
            this.spinner = o.querySelector('.vx-iv-spinner');
            this.counter = o.querySelector('.vx-iv-counter');
            this.thumbsEl = o.querySelector('.vx-iv-thumbs');
            this.prevBtn = o.querySelector('.vx-iv-prev');
            this.nextBtn = o.querySelector('.vx-iv-next');
        }

        _bind() {
            this.el.addEventListener('click', e => {
                const btn = e.target.closest('[data-act]');
                if (btn) return this._action(btn.dataset.act);
                if (this.options.closeOnBackdrop && e.target === this.el) this.close();
            });
            this.stage.addEventListener('wheel', e => {
                e.preventDefault();
                const delta = -Math.sign(e.deltaY) * 0.15;
                this._zoomAt(this.scale * (1 + delta), e.clientX, e.clientY);
            }, { passive: false });
            this.stage.addEventListener('mousedown', e => {
                if (e.target.closest('.vx-iv-nav')) return;
                this.dragging = true;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.stage.classList.add('vx-grab');
                this.img.classList.add('vx-no-anim');
            });
            window.addEventListener('mousemove', e => {
                if (!this.dragging) return;
                this.tx += e.clientX - this.lastX;
                this.ty += e.clientY - this.lastY;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this._apply();
            });
            window.addEventListener('mouseup', () => {
                this.dragging = false;
                this.stage.classList.remove('vx-grab');
                this.img.classList.remove('vx-no-anim');
            });
            this.stage.addEventListener('dblclick', e => {
                if (this.scale > 1.01) this.reset();
                else this._zoomAt(2, e.clientX, e.clientY);
            });
            this._touchInit();
            this._keyHandler = e => {
                if (this.el.classList.contains('vx-iv-hidden')) return;
                switch (e.key) {
                    case 'Escape': this.close(); break;
                    case 'ArrowLeft': this.prev(); break;
                    case 'ArrowRight': this.next(); break;
                    case '+': case '=': this.zoomIn(); break;
                    case '-': this.zoomOut(); break;
                    case '0': this.reset(); break;
                    case 'r': case 'R': this.rotate(90); break;
                    case 'l': case 'L': this.rotate(-90); break;
                    case 'f': case 'F': this.toggleFullscreen(); break;
                    case 'd': case 'D': this.download(); break;
                }
            };
            window.addEventListener('keydown', this._keyHandler);
        }

        _touchInit() {
            let pinchStart = 0, startScale = 1, lastTouchX = 0, lastTouchY = 0;
            this.stage.addEventListener('touchstart', e => {
                if (e.touches.length === 2) {
                    pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                    startScale = this.scale;
                } else if (e.touches.length === 1) {
                    lastTouchX = e.touches[0].clientX;
                    lastTouchY = e.touches[0].clientY;
                }
            }, { passive: true });
            this.stage.addEventListener('touchmove', e => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                    this.setScale(startScale * (d / pinchStart));
                } else if (e.touches.length === 1) {
                    this.tx += e.touches[0].clientX - lastTouchX;
                    this.ty += e.touches[0].clientY - lastTouchY;
                    lastTouchX = e.touches[0].clientX;
                    lastTouchY = e.touches[0].clientY;
                    this._apply();
                }
            }, { passive: false });
        }

        _action(act) {
            const map = {
                zoomin: () => this.zoomIn(), zoomout: () => this.zoomOut(),
                reset: () => this.reset(), rotleft: () => this.rotate(-90), rotright: () => this.rotate(90),
                full: () => this.toggleFullscreen(), download: () => this.download(),
                close: () => this.close(), prev: () => this.prev(), next: () => this.next()
            };
            (map[act] || (() => {}))();
        }

        open(images, startIndex = 0) {
            this.images = (Array.isArray(images) ? images : [images]).map(it => typeof it === 'string' ? { src: it, title: '' } : it);
            this.index = Math.max(0, Math.min(startIndex, this.images.length - 1));
            this.el.classList.remove('vx-iv-hidden');
            requestAnimationFrame(() => this.el.classList.add('vx-open'));
            this._renderThumbs();
            this._load();
        }

        close() {
            this.el.classList.remove('vx-open');
            setTimeout(() => this.el.classList.add('vx-iv-hidden'), 200);
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        }

        prev() { if (this.images.length > 1) { this.index = (this.index - 1 + this.images.length) % this.images.length; this._load(); } }
        next() { if (this.images.length > 1) { this.index = (this.index + 1) % this.images.length; this._load(); } }

        _load() {
            const it = this.images[this.index];
            if (!it) return;
            this.spinner.classList.remove('vx-iv-hidden');
            this.titleEl.textContent = it.title || it.alt || '';
            this.counter.textContent = `${this.index + 1} / ${this.images.length}`;
            if (!this.options.showCounter || this.images.length <= 1) this.counter.classList.add('vx-iv-hidden');
            else this.counter.classList.remove('vx-iv-hidden');
            this.prevBtn.classList.toggle('vx-iv-hidden', this.images.length <= 1);
            this.nextBtn.classList.toggle('vx-iv-hidden', this.images.length <= 1);
            this.reset(false);
            const tmp = new Image();
            tmp.onload = () => {
                this.img.src = tmp.src;
                this.img.alt = it.title || '';
                this.spinner.classList.add('vx-iv-hidden');
                this._fit();
            };
            tmp.onerror = () => { this.spinner.classList.add('vx-iv-hidden'); };
            tmp.src = it.src;
            this._updateThumbs();
        }

        _fit() {
            const sw = this.stage.clientWidth, sh = this.stage.clientHeight;
            const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
            const r = Math.min(sw / iw, sh / ih, 1);
            this.scale = r;
            this.tx = 0; this.ty = 0;
            this.img.style.width = iw + 'px';
            this.img.style.height = ih + 'px';
            this.img.style.marginLeft = (-iw / 2) + 'px';
            this.img.style.marginTop = (-ih / 2) + 'px';
            this._apply();
        }

        _renderThumbs() {
            if (!this.options.showThumbs || this.images.length <= 1) {
                this.thumbsEl.classList.add('vx-iv-hidden');
                return;
            }
            this.thumbsEl.classList.remove('vx-iv-hidden');
            this.thumbsEl.innerHTML = '';
            this.images.forEach((it, i) => {
                const t = document.createElement('div');
                t.className = 'vx-iv-thumb' + (i === this.index ? ' vx-active' : '');
                t.innerHTML = `<img src="${it.thumb || it.src}" alt="">`;
                t.addEventListener('click', () => { this.index = i; this._load(); });
                this.thumbsEl.appendChild(t);
            });
        }

        _updateThumbs() {
            this.thumbsEl.querySelectorAll('.vx-iv-thumb').forEach((t, i) =>
                t.classList.toggle('vx-active', i === this.index));
        }

        _apply() {
            this.img.style.transform = `translate(${this.tx}px,${this.ty}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
        }

        _zoomAt(newScale, cx, cy) {
            newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
            const rect = this.stage.getBoundingClientRect();
            const ox = cx - rect.left - rect.width / 2;
            const oy = cy - rect.top - rect.height / 2;
            const factor = newScale / this.scale;
            this.tx = ox - (ox - this.tx) * factor;
            this.ty = oy - (oy - this.ty) * factor;
            this.scale = newScale;
            this._apply();
        }

        setScale(s) { this.scale = Math.max(this.minScale, Math.min(this.maxScale, s)); this._apply(); }
        zoomIn() { this.setScale(this.scale * 1.25); }
        zoomOut() { this.setScale(this.scale / 1.25); }
        rotate(deg) { this.rotation = (this.rotation + deg) % 360; this._apply(); }

        reset(refit = true) {
            this.scale = 1; this.rotation = 0; this.tx = 0; this.ty = 0;
            if (refit && this.img.naturalWidth) this._fit(); else this._apply();
        }

        toggleFullscreen() {
            if (!document.fullscreenElement) this.el.requestFullscreen?.().catch(() => {});
            else document.exitFullscreen?.().catch(() => {});
        }

        download() {
            const it = this.images[this.index];
            if (!it) return;
            const a = document.createElement('a');
            a.href = it.src;
            a.download = it.filename || it.src.split('/').pop().split('?')[0] || 'image';
            document.body.appendChild(a); a.click(); a.remove();
        }

        destroy() {
            window.removeEventListener('keydown', this._keyHandler);
            this.el.remove();
        }
    }

    let singleton = null;
    const ImageViewer = {
        open(images, startIndex = 0, options) {
            if (!singleton) singleton = new ImageViewerInstance(options);
            singleton.open(images, startIndex);
            return singleton;
        },
        close() { singleton?.close(); },
        create(options) { return new ImageViewerInstance(options); },
        attach(selector, options = {}) {
            const els = typeof selector === 'string' ? document.querySelectorAll(selector) : selector;
            const list = Array.from(els);
            const items = list.map(el => ({ src: el.dataset.full || el.src || el.href, title: el.alt || el.title || '' }));
            list.forEach((el, i) => {
                el.style.cursor = 'zoom-in';
                el.addEventListener('click', e => { e.preventDefault(); this.open(items, i, options); });
            });
            return items;
        },
        version: '1.0.0'
    };

    global.ImageViewer = ImageViewer;
})(typeof window !== 'undefined' ? window : this);
