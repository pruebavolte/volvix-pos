/**
 * volvix-security-scan.js
 * Client-side security scanner for Volvix POS.
 * Detects XSS, CSRF, mixed content, missing/weak headers, vulnerable deps.
 * Generates SOC2 / ISO 27001 aligned reports.
 *
 * Exposes: window.SecurityScan
 *
 *   SecurityScan.run()                -> Promise<Report>
 *   SecurityScan.runSync()            -> Report (no network checks)
 *   SecurityScan.report()             -> last Report
 *   SecurityScan.toSOC2()             -> SOC2 mapped report
 *   SecurityScan.toISO27001()         -> ISO 27001 mapped report
 *   SecurityScan.toJSON()             -> JSON string
 *   SecurityScan.toHTML()             -> HTML string
 *   SecurityScan.download(format)     -> triggers file download
 *   SecurityScan.on(event, cb)        -> subscribe
 *
 * No external dependencies. Pure browser code.
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // Severity model
  // ─────────────────────────────────────────────────────────────────────────
  var SEV = {
    CRITICAL: { level: 5, label: 'CRITICAL', score: 10 },
    HIGH:     { level: 4, label: 'HIGH',     score: 7  },
    MEDIUM:   { level: 3, label: 'MEDIUM',   score: 4  },
    LOW:      { level: 2, label: 'LOW',      score: 2  },
    INFO:     { level: 1, label: 'INFO',     score: 0  }
  };

  // SOC2 Trust Services Criteria mapping
  var SOC2_MAP = {
    XSS:            ['CC6.1', 'CC6.6', 'CC7.1'],
    CSRF:           ['CC6.1', 'CC6.6'],
    MIXED_CONTENT:  ['CC6.7'],
    HEADERS:        ['CC6.6', 'CC6.7'],
    DEPS:           ['CC7.1', 'CC8.1'],
    STORAGE:        ['CC6.1', 'CC6.7'],
    COOKIES:        ['CC6.1', 'CC6.7'],
    TLS:            ['CC6.7']
  };

  // ISO/IEC 27001:2022 Annex A control mapping
  var ISO_MAP = {
    XSS:            ['A.8.25', 'A.8.28'],
    CSRF:           ['A.8.25', 'A.5.15'],
    MIXED_CONTENT:  ['A.8.24', 'A.8.20'],
    HEADERS:        ['A.8.23', 'A.8.20'],
    DEPS:           ['A.8.8',  'A.8.29'],
    STORAGE:        ['A.8.10', 'A.8.12'],
    COOKIES:        ['A.5.15', 'A.8.5'],
    TLS:            ['A.8.24']
  };

  // Known vulnerable library fingerprints (CVE summaries; client-side heuristic)
  var KNOWN_VULN_LIBS = [
    { name: 'jquery',        bad: /^[12]\.|^3\.[0-3]\./, cve: 'CVE-2020-11023', note: 'XSS in HTML manipulation' },
    { name: 'lodash',        bad: /^[1-3]\.|^4\.(0|1[0-6])\./, cve: 'CVE-2019-10744', note: 'Prototype pollution' },
    { name: 'angular',       bad: /^1\.[0-7]\./, cve: 'CVE-2020-7676', note: 'XSS in AngularJS' },
    { name: 'bootstrap',     bad: /^[1-3]\.|^4\.[0-2]\./, cve: 'CVE-2019-8331', note: 'XSS in tooltip/popover' },
    { name: 'moment',        bad: /^2\.(0|[1-9]|1[0-8])\./, cve: 'CVE-2022-24785', note: 'Path traversal' },
    { name: 'axios',         bad: /^0\.(0|1[0-9]|2[0-1])\./, cve: 'CVE-2021-3749', note: 'ReDoS' },
    { name: 'vue',           bad: /^[12]\.[0-5]\./, cve: 'CVE-2024-6783', note: 'XSS in SSR' },
    { name: 'react',         bad: /^0\.|^1[0-5]\./, cve: 'GHSA-x6mh', note: 'Outdated React' }
  ];

  var REQUIRED_HEADERS = [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy'
  ];

  var listeners = {};
  var lastReport = null;

  function emit(ev, payload) {
    (listeners[ev] || []).forEach(function (cb) {
      try { cb(payload); } catch (e) { /* swallow */ }
    });
  }

  function on(ev, cb) {
    if (!listeners[ev]) listeners[ev] = [];
    listeners[ev].push(cb);
  }

  function uid() {
    return 'F-' + Math.random().toString(36).slice(2, 9).toUpperCase();
  }

  function finding(category, severity, title, evidence, remediation) {
    return {
      id: uid(),
      category: category,
      severity: severity.label,
      severityLevel: severity.level,
      score: severity.score,
      title: title,
      evidence: evidence || '',
      remediation: remediation || '',
      soc2: SOC2_MAP[category] || [],
      iso27001: ISO_MAP[category] || [],
      timestamp: new Date().toISOString()
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. XSS surface scanner
  // ─────────────────────────────────────────────────────────────────────────
  function scanXSS() {
    var out = [];

    // Inline event handlers
    var inlineHandlers = document.querySelectorAll(
      '[onclick],[onerror],[onload],[onmouseover],[onfocus],[onblur],[onsubmit],[onchange]'
    );
    if (inlineHandlers.length > 0) {
      out.push(finding('XSS', SEV.HIGH,
        'Inline event handlers detected (' + inlineHandlers.length + ')',
        'Elements with on* attributes bypass CSP nonces and are XSS vectors.',
        'Move handlers to external JS via addEventListener; enforce CSP without unsafe-inline.'));
    }

    // javascript: URLs
    var jsLinks = Array.prototype.filter.call(
      document.querySelectorAll('a[href], iframe[src], form[action]'),
      function (el) {
        var v = el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('action') || '';
        return /^\s*javascript:/i.test(v);
      }
    );
    if (jsLinks.length > 0) {
      out.push(finding('XSS', SEV.CRITICAL,
        'javascript: URL scheme found (' + jsLinks.length + ')',
        'Active javascript: URLs allow code execution from URL parameters.',
        'Replace with click handlers and sanitize all dynamic URLs.'));
    }

    // document.write / innerHTML usage in inline scripts
    var inlineScripts = document.querySelectorAll('script:not([src])');
    var dangerous = 0;
    inlineScripts.forEach(function (s) {
      var t = s.textContent || '';
      if (/document\.write\s*\(/.test(t) || /\.innerHTML\s*=/.test(t) || /eval\s*\(/.test(t)) {
        dangerous++;
      }
    });
    if (dangerous > 0) {
      out.push(finding('XSS', SEV.HIGH,
        'Dangerous DOM sinks in inline scripts (' + dangerous + ')',
        'Use of document.write, innerHTML or eval without sanitization.',
        'Use textContent, DOMPurify, or Trusted Types API.'));
    }

    // Trusted Types policy
    if (!('trustedTypes' in window)) {
      out.push(finding('XSS', SEV.LOW,
        'Trusted Types API not enforced',
        'Browser supports it but no policy is loaded.',
        'Enable via CSP: require-trusted-types-for "script".'));
    }

    // Reflected query params in DOM
    try {
      var qs = location.search.slice(1);
      if (qs) {
        var params = qs.split('&').map(function (p) { return decodeURIComponent(p.split('=')[1] || ''); });
        var html = document.body ? document.body.innerHTML : '';
        params.forEach(function (p) {
          if (p && p.length > 3 && html.indexOf(p) !== -1) {
            out.push(finding('XSS', SEV.MEDIUM,
              'Possible reflected query parameter in DOM',
              'Value "' + p.slice(0, 40) + '" appears in document body.',
              'HTML-escape all user input before rendering.'));
          }
        });
      }
    } catch (e) {}

    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. CSRF scanner
  // ─────────────────────────────────────────────────────────────────────────
  function scanCSRF() {
    var out = [];
    var forms = document.querySelectorAll('form');
    var unprotected = 0;
    forms.forEach(function (f) {
      var method = (f.getAttribute('method') || 'GET').toUpperCase();
      if (method === 'GET') return;
      var hasToken = !!f.querySelector(
        'input[name*="csrf" i],input[name*="token" i],input[name="_token"],input[name="authenticity_token"]'
      );
      if (!hasToken) unprotected++;
    });
    if (unprotected > 0) {
      out.push(finding('CSRF', SEV.HIGH,
        'Forms without anti-CSRF token (' + unprotected + '/' + forms.length + ')',
        'POST forms lack csrf/token hidden inputs.',
        'Issue per-session CSRF token; verify on server; use SameSite=Lax cookies.'));
    }

    // SameSite cookie check
    try {
      var cookies = document.cookie.split(';').map(function (c) { return c.trim().split('=')[0]; }).filter(Boolean);
      if (cookies.length > 0) {
        // We cannot read SameSite attribute from JS; flag as informational.
        out.push(finding('COOKIES', SEV.INFO,
          'Cookies present (' + cookies.length + ') — verify SameSite attribute server-side',
          'Names: ' + cookies.slice(0, 6).join(', '),
          'Set Secure; HttpOnly; SameSite=Lax (or Strict for auth).'));
      }
    } catch (e) {}

    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Mixed content scanner
  // ─────────────────────────────────────────────────────────────────────────
  function scanMixedContent() {
    var out = [];
    if (location.protocol !== 'https:') {
      out.push(finding('TLS', SEV.HIGH,
        'Page not served over HTTPS',
        'Protocol is ' + location.protocol,
        'Force HTTPS via HSTS and 301 redirects.'));
      return out;
    }
    var selectors = ['img[src^="http:"]', 'script[src^="http:"]', 'link[href^="http:"]',
                     'iframe[src^="http:"]', 'video[src^="http:"]', 'audio[src^="http:"]',
                     'source[src^="http:"]', 'form[action^="http:"]'];
    var insecure = document.querySelectorAll(selectors.join(','));
    if (insecure.length > 0) {
      var samples = Array.prototype.slice.call(insecure, 0, 3).map(function (n) {
        return (n.src || n.href || n.action || '').slice(0, 80);
      });
      out.push(finding('MIXED_CONTENT', SEV.HIGH,
        'Mixed content references (' + insecure.length + ')',
        samples.join(' | '),
        'Replace http:// with https:// or protocol-relative URLs; add upgrade-insecure-requests CSP directive.'));
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Security headers scanner (requires fetch to self)
  // ─────────────────────────────────────────────────────────────────────────
  function scanHeaders() {
    return new Promise(function (resolve) {
      var out = [];
      try {
        fetch(location.href, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' })
          .then(function (r) {
            REQUIRED_HEADERS.forEach(function (h) {
              var v = r.headers.get(h);
              if (!v) {
                out.push(finding('HEADERS', SEV.MEDIUM,
                  'Missing security header: ' + h, '',
                  'Add ' + h + ' on server response.'));
              } else if (h === 'Content-Security-Policy' && /unsafe-inline|unsafe-eval/.test(v)) {
                out.push(finding('HEADERS', SEV.HIGH,
                  'Weak CSP — contains unsafe-inline / unsafe-eval',
                  v.slice(0, 120),
                  'Replace with nonces/hashes; remove unsafe-* tokens.'));
              } else if (h === 'Strict-Transport-Security' && !/max-age=\s*(?:[3-9]\d{6,}|\d{8,})/.test(v)) {
                out.push(finding('HEADERS', SEV.LOW,
                  'HSTS max-age below recommended 1 year', v,
                  'Set max-age=31536000; includeSubDomains; preload.'));
              }
            });
            // Server fingerprint disclosure
            ['Server', 'X-Powered-By', 'X-AspNet-Version'].forEach(function (h) {
              var v = r.headers.get(h);
              if (v) {
                out.push(finding('HEADERS', SEV.LOW,
                  'Server fingerprint disclosed via ' + h, v,
                  'Strip ' + h + ' header at proxy/server.'));
              }
            });
            resolve(out);
          })
          .catch(function () { resolve(out); });
      } catch (e) { resolve(out); }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Vulnerable dependency scanner
  // ─────────────────────────────────────────────────────────────────────────
  function detectLib(name) {
    switch (name) {
      case 'jquery':    return global.jQuery && global.jQuery.fn ? global.jQuery.fn.jquery : null;
      case 'lodash':    return global._ && global._.VERSION ? global._.VERSION : null;
      case 'angular':   return global.angular && global.angular.version ? global.angular.version.full : null;
      case 'bootstrap': return global.bootstrap && global.bootstrap.Tooltip ? (global.bootstrap.Tooltip.VERSION || '?') : null;
      case 'moment':    return global.moment && global.moment.version ? global.moment.version : null;
      case 'axios':     return global.axios && global.axios.VERSION ? global.axios.VERSION : null;
      case 'vue':       return global.Vue && global.Vue.version ? global.Vue.version : null;
      case 'react':     return global.React && global.React.version ? global.React.version : null;
      default: return null;
    }
  }

  function scanDeps() {
    var out = [];
    KNOWN_VULN_LIBS.forEach(function (lib) {
      var v = detectLib(lib.name);
      if (v && lib.bad.test(v)) {
        out.push(finding('DEPS', SEV.HIGH,
          'Vulnerable library: ' + lib.name + '@' + v,
          lib.cve + ' — ' + lib.note,
          'Upgrade to latest patched version; subscribe to advisories.'));
      } else if (v) {
        out.push(finding('DEPS', SEV.INFO,
          'Library detected: ' + lib.name + '@' + v, '',
          'Keep dependency on a maintained release line.'));
      }
    });

    // Detect untrusted CDN scripts
    var scripts = document.querySelectorAll('script[src]');
    var noSri = 0;
    scripts.forEach(function (s) {
      var src = s.src || '';
      if (/^https?:\/\//.test(src) && new URL(src).origin !== location.origin && !s.integrity) noSri++;
    });
    if (noSri > 0) {
      out.push(finding('DEPS', SEV.MEDIUM,
        'External scripts without Subresource Integrity (' + noSri + ')',
        'Cross-origin <script> tags missing integrity= attribute.',
        'Add integrity="sha384-..." and crossorigin="anonymous" to all external scripts.'));
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Storage / token leakage scanner
  // ─────────────────────────────────────────────────────────────────────────
  var SECRET_PATTERNS = [
    { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/, name: 'JWT' },
    { re: /sk_(live|test)_[A-Za-z0-9]{20,}/, name: 'Stripe key' },
    { re: /AIza[0-9A-Za-z\-_]{35}/, name: 'Google API key' },
    { re: /AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
    { re: /ghp_[A-Za-z0-9]{30,}/, name: 'GitHub token' }
  ];

  function scanStorage() {
    var out = [];
    function probe(store, label) {
      try {
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          var v = store.getItem(k) || '';
          SECRET_PATTERNS.forEach(function (p) {
            if (p.re.test(v)) {
              out.push(finding('STORAGE', SEV.CRITICAL,
                'Possible secret (' + p.name + ') in ' + label,
                'Key: "' + k + '"',
                'Never store secrets in ' + label + '; use HttpOnly cookies + short-lived tokens.'));
            }
          });
          if (/password|secret|api[_-]?key/i.test(k)) {
            out.push(finding('STORAGE', SEV.HIGH,
              'Sensitive key name in ' + label, 'Key: "' + k + '"',
              'Move to server-side session storage.'));
          }
        }
      } catch (e) {}
    }
    probe(localStorage, 'localStorage');
    probe(sessionStorage, 'sessionStorage');
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Aggregation + scoring
  // ─────────────────────────────────────────────────────────────────────────
  function aggregate(findings) {
    var counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    var totalScore = 0;
    findings.forEach(function (f) {
      counts[f.severity]++;
      totalScore += f.score;
    });
    // Health: 100 minus normalized penalty (cap at 0)
    var penalty = Math.min(100, totalScore * 1.2);
    var health = Math.max(0, Math.round(100 - penalty));
    var grade = health >= 90 ? 'A' : health >= 75 ? 'B' : health >= 60 ? 'C' : health >= 40 ? 'D' : 'F';
    return { counts: counts, score: totalScore, health: health, grade: grade };
  }

  function buildReport(findings, meta) {
    var agg = aggregate(findings);
    return {
      meta: {
        url: location.href,
        origin: location.origin,
        userAgent: navigator.userAgent,
        scannedAt: new Date().toISOString(),
        scanner: 'volvix-security-scan/1.0',
        durationMs: meta.duration
      },
      summary: agg,
      findings: findings.sort(function (a, b) { return b.severityLevel - a.severityLevel; }),
      compliance: {
        soc2: extractCompliance(findings, 'soc2'),
        iso27001: extractCompliance(findings, 'iso27001')
      }
    };
  }

  function extractCompliance(findings, key) {
    var map = {};
    findings.forEach(function (f) {
      (f[key] || []).forEach(function (ctrl) {
        if (!map[ctrl]) map[ctrl] = { control: ctrl, status: 'FAIL', findings: [] };
        map[ctrl].findings.push(f.id);
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public runners
  // ─────────────────────────────────────────────────────────────────────────
  function runSync() {
    var t0 = Date.now();
    emit('start', { mode: 'sync' });
    var findings = [].concat(scanXSS(), scanCSRF(), scanMixedContent(), scanDeps(), scanStorage());
    lastReport = buildReport(findings, { duration: Date.now() - t0 });
    emit('done', lastReport);
    return lastReport;
  }

  function run() {
    var t0 = Date.now();
    emit('start', { mode: 'async' });
    var sync = [].concat(scanXSS(), scanCSRF(), scanMixedContent(), scanDeps(), scanStorage());
    return scanHeaders().then(function (hdr) {
      var all = sync.concat(hdr);
      lastReport = buildReport(all, { duration: Date.now() - t0 });
      emit('done', lastReport);
      return lastReport;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Exporters
  // ─────────────────────────────────────────────────────────────────────────
  function toSOC2(r) {
    r = r || lastReport; if (!r) return null;
    return {
      framework: 'SOC 2 Type II — Trust Services Criteria',
      generatedAt: new Date().toISOString(),
      target: r.meta.url,
      health: r.summary.health,
      grade: r.summary.grade,
      controls: r.compliance.soc2,
      findings: r.findings.map(function (f) {
        return { id: f.id, controls: f.soc2, severity: f.severity, title: f.title, remediation: f.remediation };
      })
    };
  }

  function toISO27001(r) {
    r = r || lastReport; if (!r) return null;
    return {
      framework: 'ISO/IEC 27001:2022 Annex A',
      generatedAt: new Date().toISOString(),
      target: r.meta.url,
      health: r.summary.health,
      grade: r.summary.grade,
      controls: r.compliance.iso27001,
      findings: r.findings.map(function (f) {
        return { id: f.id, controls: f.iso27001, severity: f.severity, title: f.title, remediation: f.remediation };
      })
    };
  }

  function toJSON(r) { return JSON.stringify(r || lastReport, null, 2); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toHTML(r) {
    r = r || lastReport; if (!r) return '';
    var color = { CRITICAL: '#b00020', HIGH: '#d84315', MEDIUM: '#ef6c00', LOW: '#1976d2', INFO: '#546e7a' };
    var rows = r.findings.map(function (f) {
      return '<tr><td style="color:' + color[f.severity] + ';font-weight:700">' + f.severity + '</td>' +
             '<td>' + escapeHtml(f.category) + '</td>' +
             '<td>' + escapeHtml(f.title) + '</td>' +
             '<td><code>' + escapeHtml(f.evidence) + '</code></td>' +
             '<td>' + escapeHtml(f.remediation) + '</td>' +
             '<td>' + f.soc2.join(', ') + '</td>' +
             '<td>' + f.iso27001.join(', ') + '</td></tr>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><title>Volvix Security Report</title>' +
      '<style>body{font-family:system-ui,sans-serif;margin:24px;color:#222}' +
      'h1{margin:0 0 8px}.grade{font-size:48px;font-weight:800}' +
      'table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}' +
      'th,td{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}' +
      'th{background:#f4f4f4}code{background:#f7f7f7;padding:1px 4px;border-radius:3px}</style></head><body>' +
      '<h1>Volvix Security Scan Report</h1>' +
      '<p>' + escapeHtml(r.meta.url) + ' — ' + r.meta.scannedAt + '</p>' +
      '<div class="grade">' + r.summary.grade + ' <span style="font-size:18px;color:#666">(' + r.summary.health + '/100)</span></div>' +
      '<p>CRITICAL ' + r.summary.counts.CRITICAL + ' · HIGH ' + r.summary.counts.HIGH +
      ' · MEDIUM ' + r.summary.counts.MEDIUM + ' · LOW ' + r.summary.counts.LOW +
      ' · INFO ' + r.summary.counts.INFO + '</p>' +
      '<table><thead><tr><th>Sev</th><th>Cat</th><th>Title</th><th>Evidence</th><th>Remediation</th><th>SOC2</th><th>ISO27001</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></body></html>';
  }

  function download(format) {
    format = (format || 'json').toLowerCase();
    var blob, name;
    if (format === 'html') {
      blob = new Blob([toHTML()], { type: 'text/html' }); name = 'volvix-security-report.html';
    } else if (format === 'soc2') {
      blob = new Blob([JSON.stringify(toSOC2(), null, 2)], { type: 'application/json' }); name = 'volvix-soc2.json';
    } else if (format === 'iso27001' || format === 'iso') {
      blob = new Blob([JSON.stringify(toISO27001(), null, 2)], { type: 'application/json' }); name = 'volvix-iso27001.json';
    } else {
      blob = new Blob([toJSON()], { type: 'application/json' }); name = 'volvix-security-report.json';
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  global.SecurityScan = {
    version: '1.0.0',
    SEV: SEV,
    run: run,
    runSync: runSync,
    report: function () { return lastReport; },
    toSOC2: toSOC2,
    toISO27001: toISO27001,
    toJSON: toJSON,
    toHTML: toHTML,
    download: download,
    on: on
  };

})(window);
