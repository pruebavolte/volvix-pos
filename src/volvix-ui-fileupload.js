/**
 * volvix-ui-fileupload.js
 * UI File Upload component for Volvix
 * Features: drag-drop zone, multiple files, progress bar, preview, validation, remove.
 * Exposes: window.FileUpload
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    multiple: true,
    accept: '*/*',
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    maxFiles: 10,
    allowedExtensions: null, // e.g. ['png','jpg','pdf']
    autoUpload: false,
    uploadUrl: null,
    fieldName: 'file',
    headers: {},
    onAdd: null,
    onRemove: null,
    onProgress: null,
    onSuccess: null,
    onError: null,
    onValidationError: null,
    onAllComplete: null,
    labels: {
      dropHere: 'Arrastra archivos aquí o haz clic para seleccionar',
      browse: 'Seleccionar archivos',
      remove: 'Quitar',
      uploading: 'Subiendo...',
      done: 'Completado',
      error: 'Error',
      tooLarge: 'Archivo demasiado grande',
      tooMany: 'Demasiados archivos',
      badType: 'Tipo de archivo no permitido'
    }
  };

  const STYLES = `
  .vfu-root{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#222;width:100%;box-sizing:border-box}
  .vfu-zone{border:2px dashed #b6c2d2;border-radius:10px;padding:24px;text-align:center;background:#fafbfc;cursor:pointer;transition:all .15s ease;user-select:none}
  .vfu-zone:hover{border-color:#5b8def;background:#f3f7ff}
  .vfu-zone.vfu-drag{border-color:#2f6fed;background:#eaf1ff;transform:scale(1.01)}
  .vfu-zone.vfu-disabled{opacity:.55;cursor:not-allowed}
  .vfu-zone-text{font-size:14px;margin:0 0 8px}
  .vfu-zone-sub{font-size:12px;color:#6a7480;margin:0}
  .vfu-btn{display:inline-block;margin-top:10px;padding:6px 14px;background:#2f6fed;color:#fff;border:0;border-radius:6px;font-size:13px;cursor:pointer}
  .vfu-btn:hover{background:#234fc4}
  .vfu-input{display:none}
  .vfu-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
  .vfu-item{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid #e3e8ef;border-radius:8px}
  .vfu-thumb{width:40px;height:40px;flex:0 0 40px;border-radius:6px;background:#eef1f5;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:11px;color:#6a7480;text-transform:uppercase}
  .vfu-thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .vfu-meta{flex:1;min-width:0}
  .vfu-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vfu-sub{font-size:11px;color:#6a7480;display:flex;gap:8px;align-items:center}
  .vfu-bar{width:100%;height:5px;background:#eef1f5;border-radius:99px;margin-top:6px;overflow:hidden}
  .vfu-fill{height:100%;width:0%;background:#2f6fed;transition:width .2s ease}
  .vfu-fill.vfu-ok{background:#1ea96b}
  .vfu-fill.vfu-err{background:#d93b3b}
  .vfu-rm{background:transparent;border:0;color:#d93b3b;font-size:18px;cursor:pointer;padding:4px 8px;line-height:1}
  .vfu-rm:hover{color:#9b1f1f}
  .vfu-error{color:#d93b3b;font-size:11px;margin-top:2px}
  `;

  function injectStyles() {
    if (document.getElementById('vfu-styles')) return;
    const s = document.createElement('style');
    s.id = 'vfu-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function uid() {
    return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function ext(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  function isImage(file) {
    return file && file.type && file.type.indexOf('image/') === 0;
  }

  function FileUpload(target, options) {
    if (!(this instanceof FileUpload)) return new FileUpload(target, options);
    injectStyles();

    this.opts = Object.assign({}, DEFAULTS, options || {});
    this.opts.labels = Object.assign({}, DEFAULTS.labels, (options && options.labels) || {});
    this.container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.container) throw new Error('[FileUpload] target not found');

    this.files = []; // {id,file,status,progress,error,xhr}
    this._build();
  }

  FileUpload.prototype._build = function () {
    const c = this.container;
    c.classList.add('vfu-root');
    c.innerHTML = '';

    const zone = document.createElement('div');
    zone.className = 'vfu-zone';
    zone.innerHTML =
      '<p class="vfu-zone-text">' + this.opts.labels.dropHere + '</p>' +
      '<p class="vfu-zone-sub">Máx ' + fmtSize(this.opts.maxFileSize) +
      ' · hasta ' + this.opts.maxFiles + ' archivos</p>' +
      '<button type="button" class="vfu-btn">' + this.opts.labels.browse + '</button>';

    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'vfu-input';
    input.multiple = !!this.opts.multiple;
    if (this.opts.accept) input.accept = this.opts.accept;

    const list = document.createElement('ul');
    list.className = 'vfu-list';

    c.appendChild(zone);
    c.appendChild(input);
    c.appendChild(list);

    this.zone = zone;
    this.input = input;
    this.list = list;

    const self = this;

    zone.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('vfu-btn')) e.stopPropagation();
      input.click();
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('vfu-drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('vfu-drag');
      });
    });

    zone.addEventListener('drop', function (e) {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) self._addFiles(dt.files);
    });

    input.addEventListener('change', function () {
      if (input.files && input.files.length) self._addFiles(input.files);
      input.value = '';
    });
  };

  FileUpload.prototype._validate = function (file) {
    const o = this.opts;
    if (file.size > o.maxFileSize) return o.labels.tooLarge + ' (' + fmtSize(file.size) + ')';
    if (o.allowedExtensions && o.allowedExtensions.length) {
      if (o.allowedExtensions.indexOf(ext(file.name)) === -1) return o.labels.badType;
    }
    if (o.accept && o.accept !== '*/*') {
      const accepts = o.accept.split(',').map(function (x) { return x.trim().toLowerCase(); });
      const matches = accepts.some(function (a) {
        if (!a) return false;
        if (a.charAt(0) === '.') return '.' + ext(file.name) === a;
        if (a.indexOf('/*') > -1) return file.type.indexOf(a.replace('/*', '/')) === 0;
        return file.type === a;
      });
      if (!matches) return o.labels.badType;
    }
    return null;
  };

  FileUpload.prototype._addFiles = function (fileList) {
    const arr = Array.prototype.slice.call(fileList);
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      if (this.files.length >= this.opts.maxFiles) {
        if (typeof this.opts.onValidationError === 'function') {
          this.opts.onValidationError({ file: f, error: this.opts.labels.tooMany });
        }
        break;
      }
      const err = this._validate(f);
      if (err) {
        if (typeof this.opts.onValidationError === 'function') {
          this.opts.onValidationError({ file: f, error: err });
        }
        this._renderError(f, err);
        continue;
      }
      const entry = { id: uid(), file: f, status: 'queued', progress: 0, error: null, xhr: null };
      this.files.push(entry);
      this._renderItem(entry);
      if (typeof this.opts.onAdd === 'function') this.opts.onAdd(entry);
      if (this.opts.autoUpload && this.opts.uploadUrl) this._upload(entry);
    }
  };

  FileUpload.prototype._renderError = function (file, msg) {
    const li = document.createElement('li');
    li.className = 'vfu-item';
    li.innerHTML =
      '<div class="vfu-thumb">' + (ext(file.name) || '?') + '</div>' +
      '<div class="vfu-meta">' +
      '<div class="vfu-name">' + escapeHtml(file.name) + '</div>' +
      '<div class="vfu-sub">' + fmtSize(file.size) + '</div>' +
      '<div class="vfu-error">' + escapeHtml(msg) + '</div>' +
      '</div>' +
      '<button type="button" class="vfu-rm" aria-label="remove">×</button>';
    li.querySelector('.vfu-rm').addEventListener('click', function () { li.remove(); });
    this.list.appendChild(li);
  };

  FileUpload.prototype._renderItem = function (entry) {
    const self = this;
    const li = document.createElement('li');
    li.className = 'vfu-item';
    li.dataset.id = entry.id;

    const thumb = document.createElement('div');
    thumb.className = 'vfu-thumb';
    if (isImage(entry.file)) {
      const img = document.createElement('img');
      const reader = new FileReader();
      reader.onload = function (e) { img.src = e.target.result; };
      reader.readAsDataURL(entry.file);
      thumb.appendChild(img);
    } else {
      thumb.textContent = ext(entry.file.name) || 'FILE';
    }

    const meta = document.createElement('div');
    meta.className = 'vfu-meta';
    meta.innerHTML =
      '<div class="vfu-name">' + escapeHtml(entry.file.name) + '</div>' +
      '<div class="vfu-sub"><span class="vfu-size">' + fmtSize(entry.file.size) +
      '</span><span class="vfu-status">' + entry.status + '</span></div>' +
      '<div class="vfu-bar"><div class="vfu-fill"></div></div>';

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'vfu-rm';
    rm.setAttribute('aria-label', self.opts.labels.remove);
    rm.textContent = '×';
    rm.addEventListener('click', function () { self.remove(entry.id); });

    li.appendChild(thumb);
    li.appendChild(meta);
    li.appendChild(rm);
    this.list.appendChild(li);
    entry._li = li;
  };

  FileUpload.prototype._updateItem = function (entry) {
    const li = entry._li;
    if (!li) return;
    const fill = li.querySelector('.vfu-fill');
    const status = li.querySelector('.vfu-status');
    fill.style.width = entry.progress + '%';
    fill.classList.remove('vfu-ok', 'vfu-err');
    if (entry.status === 'done') {
      fill.classList.add('vfu-ok');
      status.textContent = this.opts.labels.done;
    } else if (entry.status === 'error') {
      fill.classList.add('vfu-err');
      status.textContent = this.opts.labels.error + (entry.error ? ': ' + entry.error : '');
    } else if (entry.status === 'uploading') {
      status.textContent = this.opts.labels.uploading + ' ' + entry.progress + '%';
    } else {
      status.textContent = entry.status;
    }
  };

  FileUpload.prototype._upload = function (entry) {
    const self = this;
    if (!this.opts.uploadUrl) return;
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append(this.opts.fieldName, entry.file, entry.file.name);

    xhr.open('POST', this.opts.uploadUrl, true);
    Object.keys(this.opts.headers || {}).forEach(function (k) {
      xhr.setRequestHeader(k, self.opts.headers[k]);
    });

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        entry.progress = Math.round((e.loaded / e.total) * 100);
        entry.status = 'uploading';
        self._updateItem(entry);
        if (typeof self.opts.onProgress === 'function') self.opts.onProgress(entry);
      }
    };
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        entry.status = 'done';
        entry.progress = 100;
        self._updateItem(entry);
        if (typeof self.opts.onSuccess === 'function') self.opts.onSuccess(entry, xhr.responseText);
      } else {
        entry.status = 'error';
        entry.error = 'HTTP ' + xhr.status;
        self._updateItem(entry);
        if (typeof self.opts.onError === 'function') self.opts.onError(entry, xhr);
      }
      self._maybeAllComplete();
    };
    xhr.onerror = function () {
      entry.status = 'error';
      entry.error = 'network';
      self._updateItem(entry);
      if (typeof self.opts.onError === 'function') self.opts.onError(entry, xhr);
      self._maybeAllComplete();
    };
    entry.xhr = xhr;
    entry.status = 'uploading';
    self._updateItem(entry);
    xhr.send(fd);
  };

  FileUpload.prototype._maybeAllComplete = function () {
    const pending = this.files.some(function (f) {
      return f.status === 'uploading' || f.status === 'queued';
    });
    if (!pending && typeof this.opts.onAllComplete === 'function') {
      this.opts.onAllComplete(this.files.slice());
    }
  };

  // Public API
  FileUpload.prototype.uploadAll = function () {
    if (!this.opts.uploadUrl) return;
    for (let i = 0; i < this.files.length; i++) {
      const e = this.files[i];
      if (e.status === 'queued') this._upload(e);
    }
  };

  FileUpload.prototype.remove = function (id) {
    const idx = this.files.findIndex(function (f) { return f.id === id; });
    if (idx === -1) return;
    const entry = this.files[idx];
    if (entry.xhr && entry.status === 'uploading') {
      try { entry.xhr.abort(); } catch (_) {}
    }
    if (entry._li && entry._li.parentNode) entry._li.parentNode.removeChild(entry._li);
    this.files.splice(idx, 1);
    if (typeof this.opts.onRemove === 'function') this.opts.onRemove(entry);
  };

  FileUpload.prototype.clear = function () {
    while (this.files.length) this.remove(this.files[0].id);
  };

  FileUpload.prototype.getFiles = function () {
    return this.files.map(function (e) {
      return { id: e.id, file: e.file, status: e.status, progress: e.progress, error: e.error };
    });
  };

  FileUpload.prototype.disable = function () {
    this.zone.classList.add('vfu-disabled');
    this.input.disabled = true;
  };

  FileUpload.prototype.enable = function () {
    this.zone.classList.remove('vfu-disabled');
    this.input.disabled = false;
  };

  FileUpload.prototype.destroy = function () {
    this.clear();
    if (this.container) this.container.innerHTML = '';
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.FileUpload = FileUpload;
})(typeof window !== 'undefined' ? window : this);
