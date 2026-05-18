/**
 * volvix-photo-wiring.js
 * ----------------------------------------------------------------------------
 * Volvix POS - Photo Capture & Gallery Module
 *
 * Captura de fotos vía getUserMedia, recorte, filtros CSS básicos
 * (grayscale / sepia / brightness / contrast / invert), almacenamiento en
 * localStorage asociado a productos / clientes / tickets, y galería con
 * miniaturas.
 *
 * API Pública: window.PhotoAPI
 *   - capture(opts)         -> Promise<dataUrl>   abre cámara y toma foto
 *   - crop(dataUrl, rect)   -> Promise<dataUrl>   recorta (x,y,w,h)
 *   - applyFilter(url, f)   -> Promise<dataUrl>   aplica filtro CSS
 *   - saveTo(target, url)   -> string             guarda en localStorage
 *   - list(target)          -> Array              lista fotos por target
 *   - remove(target, id)    -> bool               elimina foto
 *   - renderGallery(elId,t) -> void               render thumbnails en DOM
 *   - openCaptureUI(target) -> Promise<id>        UI completa modal
 * ----------------------------------------------------------------------------
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------ //
    // Constantes y configuración
    // ------------------------------------------------------------------ //
    var STORAGE_KEY = 'volvix_photos_v1';
    var DEFAULT_W = 640;
    var DEFAULT_H = 480;
    var THUMB_W = 96;
    var THUMB_H = 96;
    var JPEG_QUALITY = 0.85;

    var FILTERS = {
        none:       'none',
        grayscale:  'grayscale(100%)',
        sepia:      'sepia(100%)',
        bright:     'brightness(1.3)',
        dark:       'brightness(0.7)',
        contrast:   'contrast(1.4)',
        invert:     'invert(100%)',
        blur:       'blur(2px)',
        warm:       'sepia(40%) saturate(1.3) hue-rotate(-10deg)',
        cool:       'hue-rotate(180deg) saturate(1.2)'
    };

    // ------------------------------------------------------------------ //
    // Utilidades de almacenamiento
    // ------------------------------------------------------------------ //
    function _readStore() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.warn('[PhotoAPI] read store fail', e);
            return {};
        }
    }

    function _writeStore(obj) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
            return true;
        } catch (e) {
            console.error('[PhotoAPI] write store fail (quota?)', e);
            return false;
        }
    }

    function _genId() {
        return 'ph_' + Date.now().toString(36) + '_' +
               Math.random().toString(36).slice(2, 8);
    }

    function _normalizeTarget(target) {
        // target = "product:123" | "customer:5" | "ticket:abc"
        if (!target || typeof target !== 'string') return 'misc:default';
        if (target.indexOf(':') === -1) return 'misc:' + target;
        return target;
    }

    // ------------------------------------------------------------------ //
    // Captura desde cámara (getUserMedia)
    // ------------------------------------------------------------------ //
    function capture(opts) {
        opts = opts || {};
        var width = opts.width || DEFAULT_W;
        var height = opts.height || DEFAULT_H;
        var facingMode = opts.facingMode || 'environment';

        return new Promise(function (resolve, reject) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                reject(new Error('getUserMedia no soportado'));
                return;
            }
            var constraints = {
                video: { width: width, height: height, facingMode: facingMode },
                audio: false
            };

            navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
                var video = document.createElement('video');
                video.autoplay = true;
                video.playsInline = true;
                video.muted = true;
                video.srcObject = stream;

                video.onloadedmetadata = function () {
                    video.play();
                    // Esperar un frame para que el video tenga datos reales
                    setTimeout(function () {
                        try {
                            var canvas = document.createElement('canvas');
                            canvas.width = video.videoWidth || width;
                            canvas.height = video.videoHeight || height;
                            var ctx = canvas.getContext('2d');
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            var dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
                            // Cerrar stream
                            stream.getTracks().forEach(function (t) { t.stop(); });
                            resolve(dataUrl);
                        } catch (err) {
                            stream.getTracks().forEach(function (t) { t.stop(); });
                            reject(err);
                        }
                    }, 350);
                };
            }).catch(function (err) {
                reject(err);
            });
        });
    }

    // ------------------------------------------------------------------ //
    // Recorte de imagen
    // ------------------------------------------------------------------ //
    function crop(dataUrl, rect) {
        rect = rect || {};
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                var x = rect.x || 0;
                var y = rect.y || 0;
                var w = rect.w || img.width - x;
                var h = rect.h || img.height - y;
                if (w <= 0 || h <= 0) {
                    reject(new Error('rect invalido'));
                    return;
                }
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
            };
            img.onerror = function () { reject(new Error('imagen invalida')); };
            img.src = dataUrl;
        });
    }

    // ------------------------------------------------------------------ //
    // Aplicar filtro CSS via canvas
    // ------------------------------------------------------------------ //
    function applyFilter(dataUrl, filterName) {
        var cssFilter = FILTERS[filterName] || filterName || 'none';
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext('2d');
                if ('filter' in ctx) {
                    ctx.filter = cssFilter;
                    ctx.drawImage(img, 0, 0);
                } else {
                    // Fallback manual para grayscale/sepia/invert si filter no existe
                    ctx.drawImage(img, 0, 0);
                    if (filterName === 'grayscale' || filterName === 'sepia' ||
                        filterName === 'invert') {
                        try {
                            var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                            var d = imgData.data;
                            for (var i = 0; i < d.length; i += 4) {
                                var r = d[i], g = d[i + 1], b = d[i + 2];
                                if (filterName === 'grayscale') {
                                    var avg = (r + g + b) / 3;
                                    d[i] = d[i + 1] = d[i + 2] = avg;
                                } else if (filterName === 'sepia') {
                                    d[i]     = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
                                    d[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
                                    d[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
                                } else if (filterName === 'invert') {
                                    d[i] = 255 - r;
                                    d[i + 1] = 255 - g;
                                    d[i + 2] = 255 - b;
                                }
                            }
                            ctx.putImageData(imgData, 0, 0);
                        } catch (e) {
                            console.warn('[PhotoAPI] fallback filter fail', e);
                        }
                    }
                }
                resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
            };
            img.onerror = function () { reject(new Error('imagen invalida')); };
            img.src = dataUrl;
        });
    }

    // ------------------------------------------------------------------ //
    // Generar thumbnail
    // ------------------------------------------------------------------ //
    function _makeThumb(dataUrl) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = THUMB_W;
                canvas.height = THUMB_H;
                var ctx = canvas.getContext('2d');
                // cover fit
                var srcRatio = img.width / img.height;
                var dstRatio = THUMB_W / THUMB_H;
                var sx = 0, sy = 0, sw = img.width, sh = img.height;
                if (srcRatio > dstRatio) {
                    sw = img.height * dstRatio;
                    sx = (img.width - sw) / 2;
                } else {
                    sh = img.width / dstRatio;
                    sy = (img.height - sh) / 2;
                }
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = function () { resolve(dataUrl); };
            img.src = dataUrl;
        });
    }

    // ------------------------------------------------------------------ //
    // Guardar en localStorage
    // ------------------------------------------------------------------ //
    function saveTo(target, dataUrl, meta) {
        target = _normalizeTarget(target);
        var id = _genId();
        var store = _readStore();
        if (!store[target]) store[target] = [];

        // Generar thumb sincrónicamente vía promesa pero retornar id
        var record = {
            id: id,
            target: target,
            createdAt: new Date().toISOString(),
            data: dataUrl,
            thumb: null,
            meta: meta || {}
        };
        store[target].push(record);
        _writeStore(store);

        // Generar thumb async y actualizar
        _makeThumb(dataUrl).then(function (thumb) {
            var s = _readStore();
            if (s[target]) {
                for (var i = 0; i < s[target].length; i++) {
                    if (s[target][i].id === id) {
                        s[target][i].thumb = thumb;
                        break;
                    }
                }
                _writeStore(s);
            }
        });

        return id;
    }

    function list(target) {
        target = _normalizeTarget(target);
        var store = _readStore();
        return store[target] ? store[target].slice() : [];
    }

    function listAll() {
        return _readStore();
    }

    function remove(target, id) {
        target = _normalizeTarget(target);
        var store = _readStore();
        if (!store[target]) return false;
        var before = store[target].length;
        store[target] = store[target].filter(function (r) { return r.id !== id; });
        _writeStore(store);
        return store[target].length < before;
    }

    function clearTarget(target) {
        target = _normalizeTarget(target);
        var store = _readStore();
        delete store[target];
        _writeStore(store);
    }

    // ------------------------------------------------------------------ //
    // Renderizar galería de thumbnails
    // ------------------------------------------------------------------ //
    function renderGallery(elementId, target, options) {
        options = options || {};
        var el = typeof elementId === 'string'
            ? document.getElementById(elementId)
            : elementId;
        if (!el) {
            console.warn('[PhotoAPI] elemento galería no encontrado:', elementId);
            return;
        }
        var photos = list(target);
        el.innerHTML = '';
        el.style.display = 'flex';
        el.style.flexWrap = 'wrap';
        el.style.gap = '8px';

        if (photos.length === 0) {
            var empty = document.createElement('div');
            empty.textContent = 'Sin fotos';
            empty.style.color = '#888';
            empty.style.fontSize = '12px';
            empty.style.padding = '16px';
            el.appendChild(empty);
            return;
        }

        photos.forEach(function (p) {
            var wrap = document.createElement('div');
            wrap.style.position = 'relative';
            wrap.style.width = THUMB_W + 'px';
            wrap.style.height = THUMB_H + 'px';
            wrap.style.border = '1px solid #ccc';
            wrap.style.borderRadius = '4px';
            wrap.style.overflow = 'hidden';
            wrap.style.cursor = 'pointer';
            wrap.dataset.photoId = p.id;

            var img = document.createElement('img');
            img.src = p.thumb || p.data;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            wrap.appendChild(img);

            var btnDel = document.createElement('button');
            btnDel.textContent = 'x';
            btnDel.title = 'Eliminar foto';
            btnDel.style.position = 'absolute';
            btnDel.style.top = '2px';
            btnDel.style.right = '2px';
            btnDel.style.width = '20px';
            btnDel.style.height = '20px';
            btnDel.style.border = 'none';
            btnDel.style.borderRadius = '50%';
            btnDel.style.background = 'rgba(220,40,40,0.85)';
            btnDel.style.color = 'white';
            btnDel.style.cursor = 'pointer';
            btnDel.style.fontSize = '12px';
            btnDel.style.lineHeight = '1';
            btnDel.onclick = async function (ev) {
                ev.stopPropagation();
                if (await VolvixUI.destructiveConfirm({ title: 'Eliminar foto', message: '¿Eliminar esta foto?', confirmText: 'Eliminar', requireText: 'ELIMINAR' })) {
                    remove(target, p.id);
                    renderGallery(elementId, target, options);
                }
            };
            wrap.appendChild(btnDel);

            wrap.onclick = function () {
                if (typeof options.onClick === 'function') {
                    options.onClick(p);
                } else {
                    _previewPhoto(p);
                }
            };

            el.appendChild(wrap);
        });
    }

    function _previewPhoto(photo) {
        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'background:rgba(0,0,0,0.85);display:flex;align-items:center;' +
            'justify-content:center;z-index:99999;cursor:zoom-out;';
        modal.onclick = function () { document.body.removeChild(modal); };
        var img = document.createElement('img');
        img.src = photo.data;
        img.style.cssText = 'max-width:90%;max-height:90%;border-radius:6px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.5);';
        modal.appendChild(img);
        document.body.appendChild(modal);
    }

    // ------------------------------------------------------------------ //
    // UI completa modal de captura
    // ------------------------------------------------------------------ //
    function openCaptureUI(target) {
        return new Promise(function (resolve, reject) {
            var modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);' +
                'z-index:99998;display:flex;flex-direction:column;align-items:center;' +
                'justify-content:center;padding:20px;color:white;font-family:sans-serif;';

            var title = document.createElement('h3');
            title.textContent = 'Capturar foto - ' + target;
            title.style.margin = '0 0 12px 0';
            modal.appendChild(title);

            var preview = document.createElement('div');
            preview.style.cssText = 'max-width:90%;max-height:60vh;background:#222;' +
                'border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;';
            modal.appendChild(preview);

            var info = document.createElement('div');
            info.style.cssText = 'margin:8px 0;font-size:12px;color:#bbb;';
            info.textContent = 'Tomando foto...';
            modal.appendChild(info);

            var filterBar = document.createElement('div');
            filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;';
            modal.appendChild(filterBar);

            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;';
            modal.appendChild(btnRow);

            function mkBtn(label, color) {
                var b = document.createElement('button');
                b.textContent = label;
                b.style.cssText = 'padding:8px 16px;border:none;border-radius:4px;' +
                    'background:' + color + ';color:white;cursor:pointer;font-size:14px;';
                return b;
            }

            var btnSave = mkBtn('Guardar', '#2a8f3a');
            var btnRetry = mkBtn('Repetir', '#666');
            var btnCancel = mkBtn('Cancelar', '#a33');
            btnRow.appendChild(btnSave);
            btnRow.appendChild(btnRetry);
            btnRow.appendChild(btnCancel);

            document.body.appendChild(modal);

            var currentRaw = null;
            var currentDisplay = null;

            function showImg(url) {
                preview.innerHTML = '';
                var img = document.createElement('img');
                img.src = url;
                img.style.cssText = 'max-width:100%;max-height:60vh;display:block;';
                preview.appendChild(img);
                currentDisplay = url;
            }

            function buildFilterBar() {
                filterBar.innerHTML = '';
                Object.keys(FILTERS).forEach(function (fname) {
                    var b = mkBtn(fname, '#444');
                    b.style.padding = '4px 10px';
                    b.style.fontSize = '12px';
                    b.onclick = function () {
                        if (!currentRaw) return;
                        info.textContent = 'Aplicando filtro ' + fname + '...';
                        applyFilter(currentRaw, fname).then(function (url) {
                            showImg(url);
                            info.textContent = 'Filtro: ' + fname;
                        }).catch(function (e) {
                            info.textContent = 'Error filtro: ' + e.message;
                        });
                    };
                    filterBar.appendChild(b);
                });
            }

            function close() {
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            }

            btnRetry.onclick = function () {
                info.textContent = 'Tomando foto...';
                capture().then(function (url) {
                    currentRaw = url;
                    showImg(url);
                    info.textContent = 'Foto lista. Elige filtro o guarda.';
                }).catch(function (e) {
                    info.textContent = 'Error: ' + e.message;
                });
            };

            btnCancel.onclick = function () {
                close();
                reject(new Error('cancelado'));
            };

            btnSave.onclick = function () {
                if (!currentDisplay) {
                    info.textContent = 'No hay foto para guardar';
                    return;
                }
                var id = saveTo(target, currentDisplay);
                close();
                resolve(id);
            };

            // Iniciar captura
            capture().then(function (url) {
                currentRaw = url;
                showImg(url);
                buildFilterBar();
                info.textContent = 'Foto lista. Elige filtro o guarda.';
            }).catch(function (e) {
                info.textContent = 'Error cámara: ' + e.message;
            });
        });
    }

    // ------------------------------------------------------------------ //
    // Estadísticas / debug
    // ------------------------------------------------------------------ //
    function stats() {
        var store = _readStore();
        var totals = { targets: 0, photos: 0, bytes: 0 };
        Object.keys(store).forEach(function (t) {
            totals.targets++;
            store[t].forEach(function (p) {
                totals.photos++;
                totals.bytes += (p.data ? p.data.length : 0) +
                                (p.thumb ? p.thumb.length : 0);
            });
        });
        totals.kb = Math.round(totals.bytes / 1024);
        return totals;
    }

    // ------------------------------------------------------------------ //
    // Export
    // ------------------------------------------------------------------ //
    var PhotoAPI = {
        version: '1.0.0',
        FILTERS: FILTERS,
        capture: capture,
        crop: crop,
        applyFilter: applyFilter,
        saveTo: saveTo,
        list: list,
        listAll: listAll,
        remove: remove,
        clearTarget: clearTarget,
        renderGallery: renderGallery,
        openCaptureUI: openCaptureUI,
        stats: stats
    };

    global.PhotoAPI = PhotoAPI;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PhotoAPI;
    }

    console.log('[PhotoAPI] v' + PhotoAPI.version + ' lista. Filtros:',
                Object.keys(FILTERS).join(', '));

})(typeof window !== 'undefined' ? window : this);
