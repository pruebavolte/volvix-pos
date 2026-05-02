/* volvix-ui-carousel.js - Carousel/Slider con autoplay, swipe, paginación, efectos y lazy load */
(function (global) {
  'use strict';

  var DEFAULTS = {
    selector: '.carousel',
    slideSelector: '.carousel-slide',
    autoplay: false,
    interval: 4000,
    loop: true,
    effect: 'slide',         // 'slide' | 'fade'
    duration: 500,
    swipe: true,
    swipeThreshold: 50,
    pagination: true,
    arrows: true,
    lazy: true,
    pauseOnHover: true,
    keyboard: true,
    startIndex: 0,
    onChange: null,
    onInit: null
  };

  function extend(a, b) {
    var out = {};
    for (var k in a) if (a.hasOwnProperty(k)) out[k] = a[k];
    for (var j in b) if (b.hasOwnProperty(j)) out[j] = b[j];
    return out;
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function injectStyles() {
    if (document.getElementById('volvix-carousel-style')) return;
    var css = [
      '.vx-carousel{position:relative;overflow:hidden;width:100%;}',
      '.vx-carousel-track{display:flex;will-change:transform;transition:transform .5s ease;}',
      '.vx-carousel.fade .vx-carousel-track{display:block;position:relative;height:100%;}',
      '.vx-carousel-slide{flex:0 0 100%;min-width:100%;position:relative;}',
      '.vx-carousel.fade .vx-carousel-slide{position:absolute;top:0;left:0;width:100%;opacity:0;transition:opacity .5s ease;}',
      '.vx-carousel.fade .vx-carousel-slide.active{opacity:1;z-index:2;}',
      '.vx-carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.45);color:#fff;border:0;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:20px;z-index:5;display:flex;align-items:center;justify-content:center;}',
      '.vx-carousel-arrow:hover{background:rgba(0,0,0,.7);}',
      '.vx-carousel-arrow.prev{left:10px;}',
      '.vx-carousel-arrow.next{right:10px;}',
      '.vx-carousel-pagination{position:absolute;bottom:12px;left:0;right:0;display:flex;gap:8px;justify-content:center;z-index:5;}',
      '.vx-carousel-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.5);border:0;cursor:pointer;padding:0;transition:background .2s;}',
      '.vx-carousel-dot.active{background:#fff;}',
      '.vx-carousel-slide img[data-src]{opacity:0;transition:opacity .4s;}',
      '.vx-carousel-slide img.loaded{opacity:1;}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'volvix-carousel-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function Carousel(el, opts) {
    if (typeof el === 'string') el = $(el);
    if (!el) throw new Error('Carousel: elemento no encontrado');
    this.el = el;
    this.opts = extend(DEFAULTS, opts || {});
    this.index = this.opts.startIndex || 0;
    this.timer = null;
    this.isAnimating = false;
    this._init();
  }

  Carousel.prototype._init = function () {
    injectStyles();
    var el = this.el;
    el.classList.add('vx-carousel');
    if (this.opts.effect === 'fade') el.classList.add('fade');

    // Track
    var track = $('.vx-carousel-track', el);
    if (!track) {
      track = document.createElement('div');
      track.className = 'vx-carousel-track';
      var slides = $$(this.opts.slideSelector, el);
      if (!slides.length) slides = Array.prototype.slice.call(el.children);
      slides.forEach(function (s) {
        s.classList.add('vx-carousel-slide');
        track.appendChild(s);
      });
      el.appendChild(track);
    }
    this.track = track;
    this.slides = $$('.vx-carousel-slide', track);
    this.total = this.slides.length;

    track.style.transitionDuration = this.opts.duration + 'ms';

    if (this.opts.arrows) this._buildArrows();
    if (this.opts.pagination) this._buildPagination();
    if (this.opts.swipe) this._bindSwipe();
    if (this.opts.keyboard) this._bindKeyboard();
    if (this.opts.pauseOnHover && this.opts.autoplay) this._bindHover();
    if (this.opts.lazy) this._setupLazy();

    this.go(this.index, true);
    if (this.opts.autoplay) this.play();
    if (typeof this.opts.onInit === 'function') this.opts.onInit.call(this);
  };

  Carousel.prototype._buildArrows = function () {
    var self = this;
    var prev = document.createElement('button');
    prev.className = 'vx-carousel-arrow prev';
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Anterior');
    prev.innerHTML = '&#10094;';
    prev.addEventListener('click', function () { self.prev(); });

    var next = document.createElement('button');
    next.className = 'vx-carousel-arrow next';
    next.type = 'button';
    next.setAttribute('aria-label', 'Siguiente');
    next.innerHTML = '&#10095;';
    next.addEventListener('click', function () { self.next(); });

    this.el.appendChild(prev);
    this.el.appendChild(next);
    this.arrowPrev = prev;
    this.arrowNext = next;
  };

  Carousel.prototype._buildPagination = function () {
    var self = this;
    var pag = document.createElement('div');
    pag.className = 'vx-carousel-pagination';
    this.dots = [];
    for (var i = 0; i < this.total; i++) {
      (function (idx) {
        var d = document.createElement('button');
        d.className = 'vx-carousel-dot';
        d.type = 'button';
        d.setAttribute('aria-label', 'Ir a slide ' + (idx + 1));
        d.addEventListener('click', function () { self.go(idx); });
        pag.appendChild(d);
        self.dots.push(d);
      })(i);
    }
    this.el.appendChild(pag);
    this.pagination = pag;
  };

  Carousel.prototype._bindSwipe = function () {
    var self = this;
    var startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;

    function down(x, y) { startX = x; startY = y; dx = 0; dy = 0; dragging = true; self.pause(); }
    function move(x, y) {
      if (!dragging) return;
      dx = x - startX; dy = y - startY;
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > self.opts.swipeThreshold) {
        if (dx < 0) self.next(); else self.prev();
      }
      if (self.opts.autoplay) self.play();
    }

    this.el.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; down(t.clientX, t.clientY);
    }, { passive: true });
    this.el.addEventListener('touchmove', function (e) {
      var t = e.touches[0]; move(t.clientX, t.clientY);
    }, { passive: true });
    this.el.addEventListener('touchend', up);

    this.el.addEventListener('mousedown', function (e) { down(e.clientX, e.clientY); e.preventDefault(); });
    window.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
    window.addEventListener('mouseup', up);
  };

  Carousel.prototype._bindKeyboard = function () {
    var self = this;
    this.el.setAttribute('tabindex', '0');
    this.el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { self.prev(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { self.next(); e.preventDefault(); }
      else if (e.key === 'Home') { self.go(0); e.preventDefault(); }
      else if (e.key === 'End') { self.go(self.total - 1); e.preventDefault(); }
    });
  };

  Carousel.prototype._bindHover = function () {
    var self = this;
    this.el.addEventListener('mouseenter', function () { self.pause(); });
    this.el.addEventListener('mouseleave', function () { if (self.opts.autoplay) self.play(); });
  };

  Carousel.prototype._setupLazy = function () {
    var self = this;
    function loadImg(img) {
      if (!img || img.dataset.loaded) return;
      var src = img.getAttribute('data-src');
      if (!src) return;
      img.src = src;
      img.onload = function () { img.classList.add('loaded'); };
      img.dataset.loaded = '1';
      img.removeAttribute('data-src');
    }
    this._loadSlideImages = function (idx) {
      var slide = self.slides[idx];
      if (!slide) return;
      $$('img[data-src]', slide).forEach(loadImg);
      // precarga adyacentes
      var nextI = (idx + 1) % self.total;
      var prevI = (idx - 1 + self.total) % self.total;
      [nextI, prevI].forEach(function (i) {
        $$('img[data-src]', self.slides[i]).forEach(loadImg);
      });
    };
  };

  Carousel.prototype.go = function (i, instant) {
    if (this.isAnimating) return;
    var n = this.total;
    if (this.opts.loop) {
      i = ((i % n) + n) % n;
    } else {
      if (i < 0) i = 0;
      if (i >= n) i = n - 1;
    }
    this.index = i;

    if (this.opts.effect === 'fade') {
      this.slides.forEach(function (s, idx) {
        s.classList.toggle('active', idx === i);
      });
    } else {
      this.track.style.transitionDuration = (instant ? 0 : this.opts.duration) + 'ms';
      this.track.style.transform = 'translateX(' + (-i * 100) + '%)';
    }

    if (this.dots) {
      this.dots.forEach(function (d, idx) {
        d.classList.toggle('active', idx === i);
      });
    }

    if (this._loadSlideImages) this._loadSlideImages(i);

    this.isAnimating = !instant;
    var self = this;
    setTimeout(function () { self.isAnimating = false; }, instant ? 0 : this.opts.duration);

    if (typeof this.opts.onChange === 'function') this.opts.onChange.call(this, i);
  };

  Carousel.prototype.next = function () { this.go(this.index + 1); };
  Carousel.prototype.prev = function () { this.go(this.index - 1); };

  Carousel.prototype.play = function () {
    var self = this;
    this.pause();
    this.opts.autoplay = true;
    this.timer = setInterval(function () { self.next(); }, this.opts.interval);
  };

  Carousel.prototype.pause = function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  };

  Carousel.prototype.stop = function () {
    this.pause();
    this.opts.autoplay = false;
  };

  Carousel.prototype.destroy = function () {
    this.pause();
    if (this.arrowPrev) this.arrowPrev.remove();
    if (this.arrowNext) this.arrowNext.remove();
    if (this.pagination) this.pagination.remove();
    this.el.classList.remove('vx-carousel', 'fade');
  };

  Carousel.prototype.getIndex = function () { return this.index; };
  Carousel.prototype.getTotal = function () { return this.total; };

  // Auto-init: data-carousel
  function autoInit() {
    $$('[data-carousel]').forEach(function (el) {
      if (el.__vxCarousel) return;
      var opts = {};
      try { opts = JSON.parse(el.getAttribute('data-carousel') || '{}'); } catch (e) {}
      el.__vxCarousel = new Carousel(el, opts);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  global.Carousel = Carousel;
  global.VolvixCarousel = { Carousel: Carousel, autoInit: autoInit };
})(window);
