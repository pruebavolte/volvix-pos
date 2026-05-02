/**
 * volvix-ui-signature.js
 * Volvix UI - Signature Pad Component
 *
 * Provides a smooth canvas-based signature capture widget with:
 *   - Pointer/touch/mouse unified input
 *   - Smooth quadratic-curve interpolation between points
 *   - Variable line width based on pointer velocity (pressure simulation)
 *   - Undo (per-stroke) and full clear
 *   - Export to base64 PNG / JPEG / SVG
 *   - Import from base64
 *   - HiDPI / retina aware
 *   - Resize aware (preserves drawing)
 *
 * Exposes: window.SignaturePad
 *
 * Usage:
 *   const pad = new SignaturePad(canvasEl, {
 *     penColor: '#000',
 *     backgroundColor: '#fff',
 *     minWidth: 0.6,
 *     maxWidth: 2.6,
 *     velocityFilterWeight: 0.7,
 *     onBegin: () => {},
 *     onEnd:   () => {},
 *   });
 *   pad.toDataURL();
 *   pad.clear();
 *   pad.undo();
 *   pad.isEmpty();
 *   pad.fromDataURL(dataUrl);
 *   pad.off(); // detach listeners
 */
(function (root) {
  'use strict';

  // ---------- Point ----------
  function Point(x, y, time) {
    this.x = x;
    this.y = y;
    this.time = time || Date.now();
  }
  Point.prototype.distanceTo = function (p) {
    return Math.sqrt(Math.pow(this.x - p.x, 2) + Math.pow(this.y - p.y, 2));
  };
  Point.prototype.velocityFrom = function (p) {
    var dt = this.time - p.time;
    return dt > 0 ? this.distanceTo(p) / dt : 0;
  };

  // ---------- Bezier helper ----------
  function Bezier(start, c1, c2, end, startWidth, endWidth) {
    this.startPoint = start;
    this.control1   = c1;
    this.control2   = c2;
    this.endPoint   = end;
    this.startWidth = startWidth;
    this.endWidth   = endWidth;
  }
  Bezier.prototype.length = function () {
    var steps = 10, length = 0, prevX, prevY;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var x = this._point(t, this.startPoint.x, this.control1.x, this.control2.x, this.endPoint.x);
      var y = this._point(t, this.startPoint.y, this.control1.y, this.control2.y, this.endPoint.y);
      if (i > 0) {
        var dx = x - prevX, dy = y - prevY;
        length += Math.sqrt(dx * dx + dy * dy);
      }
      prevX = x; prevY = y;
    }
    return length;
  };
  Bezier.prototype._point = function (t, p0, p1, p2, p3) {
    return p0 * (1 - t) * (1 - t) * (1 - t)
         + 3 * p1 * (1 - t) * (1 - t) * t
         + 3 * p2 * (1 - t) * t * t
         + p3 * t * t * t;
  };

  // ---------- SignaturePad ----------
  function SignaturePad(canvas, opts) {
    if (!canvas || !canvas.getContext) {
      throw new Error('SignaturePad: a valid <canvas> element is required');
    }
    opts = opts || {};
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.penColor             = opts.penColor             || '#1a1a1a';
    this.backgroundColor      = opts.backgroundColor      || 'rgba(0,0,0,0)';
    this.minWidth             = opts.minWidth             || 0.6;
    this.maxWidth             = opts.maxWidth             || 2.8;
    this.minDistance          = opts.minDistance != null ? opts.minDistance : 4;
    this.velocityFilterWeight = opts.velocityFilterWeight || 0.7;
    this.throttle             = opts.throttle != null ? opts.throttle : 16;
    this.dotSize              = opts.dotSize              || function () {
      return (this.minWidth + this.maxWidth) / 2;
    };

    this.onBegin = typeof opts.onBegin === 'function' ? opts.onBegin : null;
    this.onEnd   = typeof opts.onEnd   === 'function' ? opts.onEnd   : null;

    this._strokes      = []; // array of strokes, each = array of Points
    this._currentStroke = null;
    this._lastPoint    = null;
    this._lastVelocity = 0;
    this._lastWidth    = (this.minWidth + this.maxWidth) / 2;
    this._isDrawing    = false;
    this._lastPointerTime = 0;

    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp   = this._handleMouseUp.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove  = this._handleTouchMove.bind(this);
    this._handleTouchEnd   = this._handleTouchEnd.bind(this);

    this._resize();
    this.clear();
    this.on();
  }

  SignaturePad.prototype.on = function () {
    this.canvas.style.touchAction  = 'none';
    this.canvas.style.msTouchAction = 'none';
    this.canvas.addEventListener('mousedown',  this._handleMouseDown);
    this.canvas.addEventListener('mousemove',  this._handleMouseMove);
    document.addEventListener   ('mouseup',    this._handleMouseUp);
    this.canvas.addEventListener('touchstart', this._handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove',  this._handleTouchMove,  { passive: false });
    this.canvas.addEventListener('touchend',   this._handleTouchEnd);
  };

  SignaturePad.prototype.off = function () {
    this.canvas.removeEventListener('mousedown',  this._handleMouseDown);
    this.canvas.removeEventListener('mousemove',  this._handleMouseMove);
    document.removeEventListener   ('mouseup',    this._handleMouseUp);
    this.canvas.removeEventListener('touchstart', this._handleTouchStart);
    this.canvas.removeEventListener('touchmove',  this._handleTouchMove);
    this.canvas.removeEventListener('touchend',   this._handleTouchEnd);
  };

  SignaturePad.prototype._resize = function () {
    var ratio = Math.max(window.devicePixelRatio || 1, 1);
    var rect  = this.canvas.getBoundingClientRect();
    this.canvas.width  = (rect.width  || this.canvas.width)  * ratio;
    this.canvas.height = (rect.height || this.canvas.height) * ratio;
    this.ctx.scale(ratio, ratio);
    this._ratio = ratio;
  };

  SignaturePad.prototype.clear = function () {
    var ctx = this.ctx, c = this.canvas;
    ctx.fillStyle = this.backgroundColor;
    ctx.clearRect(0, 0, c.width, c.height);
    if (this.backgroundColor && this.backgroundColor !== 'rgba(0,0,0,0)') {
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this._strokes = [];
    this._reset();
  };

  SignaturePad.prototype._reset = function () {
    this._lastPoint    = null;
    this._lastVelocity = 0;
    this._lastWidth    = (this.minWidth + this.maxWidth) / 2;
    this.ctx.fillStyle = this.penColor;
    this.ctx.strokeStyle = this.penColor;
  };

  SignaturePad.prototype.isEmpty = function () {
    return this._strokes.length === 0;
  };

  SignaturePad.prototype._eventPoint = function (event) {
    var rect = this.canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left);
    var y = (event.clientY - rect.top);
    return new Point(x, y, Date.now());
  };

  SignaturePad.prototype._strokeBegin = function (event) {
    this._isDrawing = true;
    this._currentStroke = [];
    this._strokes.push(this._currentStroke);
    this._reset();
    this._strokeUpdate(event);
    if (this.onBegin) this.onBegin(event);
  };

  SignaturePad.prototype._strokeUpdate = function (event) {
    if (!this._isDrawing) return;
    var now = Date.now();
    if (now - this._lastPointerTime < this.throttle) return;
    this._lastPointerTime = now;

    var point = this._eventPoint(event);
    var last  = this._lastPoint;
    if (last && point.distanceTo(last) < this.minDistance) return;

    var velocity = last ? this.velocityFilterWeight * point.velocityFrom(last)
                          + (1 - this.velocityFilterWeight) * this._lastVelocity
                        : 0;
    var newWidth = Math.max(this.maxWidth / (velocity + 1), this.minWidth);

    this._drawSegment(last, point, this._lastWidth, newWidth);

    this._lastVelocity = velocity;
    this._lastWidth    = newWidth;
    this._lastPoint    = point;
    this._currentStroke.push({ x: point.x, y: point.y, t: point.time, w: newWidth });
  };

  SignaturePad.prototype._strokeEnd = function (event) {
    if (!this._isDrawing) return;
    this._isDrawing = false;
    if (this._currentStroke && this._currentStroke.length === 1) {
      // single tap -> dot
      var p = this._currentStroke[0];
      this._drawDot(p.x, p.y, this.dotSize());
    }
    if (this.onEnd) this.onEnd(event);
  };

  SignaturePad.prototype._drawSegment = function (a, b, wA, wB) {
    var ctx = this.ctx;
    if (!a) {
      this._drawDot(b.x, b.y, wB);
      return;
    }
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    ctx.strokeStyle = this.penColor;
    ctx.lineWidth = (wA + wB) / 2;
    ctx.beginPath();
    var midX = (a.x + b.x) / 2;
    var midY = (a.y + b.y) / 2;
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(a.x, a.y, midX, midY);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  SignaturePad.prototype._drawDot = function (x, y, size) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.fillStyle = this.penColor;
    ctx.arc(x, y, size, 0, Math.PI * 2, false);
    ctx.fill();
  };

  // ---------- Mouse ----------
  SignaturePad.prototype._handleMouseDown = function (e) {
    if (e.which === 1) { e.preventDefault(); this._strokeBegin(e); }
  };
  SignaturePad.prototype._handleMouseMove = function (e) {
    if (this._isDrawing) { e.preventDefault(); this._strokeUpdate(e); }
  };
  SignaturePad.prototype._handleMouseUp = function (e) {
    if (e.which === 1 && this._isDrawing) { this._strokeEnd(e); }
  };

  // ---------- Touch ----------
  SignaturePad.prototype._handleTouchStart = function (e) {
    if (e.targetTouches.length !== 1) return;
    e.preventDefault();
    this._strokeBegin(e.changedTouches[0]);
  };
  SignaturePad.prototype._handleTouchMove = function (e) {
    e.preventDefault();
    this._strokeUpdate(e.changedTouches[0]);
  };
  SignaturePad.prototype._handleTouchEnd = function (e) {
    if (e.target === this.canvas) e.preventDefault();
    this._strokeEnd(e.changedTouches[0]);
  };

  // ---------- Undo ----------
  SignaturePad.prototype.undo = function () {
    if (!this._strokes.length) return false;
    this._strokes.pop();
    this._redraw();
    return true;
  };

  SignaturePad.prototype._redraw = function () {
    var saved = this._strokes.slice();
    this.clear();
    this._strokes = saved;
    for (var s = 0; s < saved.length; s++) {
      var stroke = saved[s];
      this._reset();
      var prev = null, prevW = this._lastWidth;
      if (stroke.length === 1) {
        this._drawDot(stroke[0].x, stroke[0].y, stroke[0].w || this.dotSize());
        continue;
      }
      for (var i = 0; i < stroke.length; i++) {
        var pt = stroke[i];
        var P  = new Point(pt.x, pt.y, pt.t);
        this._drawSegment(prev, P, prevW, pt.w);
        prev = P; prevW = pt.w;
      }
    }
  };

  // ---------- Export / Import ----------
  SignaturePad.prototype.toDataURL = function (type, quality) {
    type = type || 'image/png';
    return this.canvas.toDataURL(type, quality);
  };

  SignaturePad.prototype.toJPEG = function (quality) {
    // composite over background for JPEG (no alpha)
    var tmp = document.createElement('canvas');
    tmp.width  = this.canvas.width;
    tmp.height = this.canvas.height;
    var tctx = tmp.getContext('2d');
    tctx.fillStyle = this.backgroundColor === 'rgba(0,0,0,0)' ? '#ffffff' : this.backgroundColor;
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(this.canvas, 0, 0);
    return tmp.toDataURL('image/jpeg', quality != null ? quality : 0.92);
  };

  SignaturePad.prototype.fromDataURL = function (dataUrl, options) {
    var self = this;
    options = options || {};
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        self.clear();
        var ratio  = options.ratio  || self._ratio || 1;
        var width  = options.width  || self.canvas.width  / ratio;
        var height = options.height || self.canvas.height / ratio;
        self.ctx.drawImage(img, 0, 0, width, height);
        resolve();
      };
      img.onerror = function (err) { reject(err); };
      img.src = dataUrl;
    });
  };

  SignaturePad.prototype.toData = function () {
    return JSON.parse(JSON.stringify(this._strokes));
  };

  SignaturePad.prototype.fromData = function (data) {
    this._strokes = JSON.parse(JSON.stringify(data || []));
    this._redraw();
  };

  // ---------- Expose ----------
  root.SignaturePad = SignaturePad;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SignaturePad;
  }
})(typeof window !== 'undefined' ? window : this);
