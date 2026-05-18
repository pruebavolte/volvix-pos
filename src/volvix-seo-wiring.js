/* volvix-seo-wiring.js
 * SEO tools: meta tags, schema.org JSON-LD, sitemap.xml, robots.txt, OG/Twitter cards
 * Exposes: window.SEOAPI
 */
(function (global) {
  'use strict';

  const STORE_KEY = 'volvix_seo_state_v1';

  const defaults = {
    siteUrl: location.origin,
    siteName: 'Volvix',
    defaultLang: 'es',
    defaultLocale: 'es_ES',
    twitterHandle: '@volvix',
    defaultImage: '/assets/og-default.png',
    pages: {}, // path -> { title, description, keywords, image, type, schema }
    robots: { allowAll: true, disallow: ['/admin', '/api/private'], sitemap: '/sitemap.xml' }
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaults));
      return Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) {
      return JSON.parse(JSON.stringify(defaults));
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  let state = loadState();

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function setMeta(attr, key, value) {
    if (value == null) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', value);
  }

  function setLink(rel, href, extra) {
    let el = document.head.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
    if (extra) Object.keys(extra).forEach(k => el.setAttribute(k, extra[k]));
  }

  function applyMeta(opts) {
    opts = opts || {};
    const path = opts.path || location.pathname;
    const page = state.pages[path] || {};
    const title = opts.title || page.title || state.siteName;
    const desc = opts.description || page.description || '';
    const kw = opts.keywords || page.keywords || [];
    const image = opts.image || page.image || state.defaultImage;
    const type = opts.type || page.type || 'website';
    const lang = opts.lang || state.defaultLang;
    const locale = opts.locale || state.defaultLocale;
    const url = state.siteUrl.replace(/\/$/, '') + path;

    document.title = title;
    if (document.documentElement && lang) document.documentElement.lang = lang;

    setMeta('name', 'description', desc);
    setMeta('name', 'keywords', Array.isArray(kw) ? kw.join(', ') : kw);
    setMeta('name', 'robots', opts.robots || 'index,follow');
    setMeta('name', 'author', opts.author || state.siteName);
    setLink('canonical', url);

    // Open Graph
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:site_name', state.siteName);
    setMeta('property', 'og:locale', locale);
    setMeta('property', 'og:image', image);

    // Twitter
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:site', state.twitterHandle);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', image);

    return { title, description: desc, url, image };
  }

  function injectSchema(schemaObj, id) {
    if (!schemaObj) return null;
    const elId = id || 'volvix-jsonld-' + Math.random().toString(36).slice(2, 8);
    let el = document.getElementById(elId);
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = elId;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schemaObj);
    return elId;
  }

  function buildOrgSchema(opts) {
    opts = opts || {};
    return {
      '@context': 'https://schema.org',
      '@type': opts.type || 'Organization',
      name: opts.name || state.siteName,
      url: opts.url || state.siteUrl,
      logo: opts.logo || (state.siteUrl + '/assets/logo.png'),
      sameAs: opts.sameAs || []
    };
  }

  function buildArticleSchema(a) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: a.title,
      description: a.description,
      image: a.image || state.defaultImage,
      datePublished: a.datePublished || new Date().toISOString(),
      dateModified: a.dateModified || new Date().toISOString(),
      author: { '@type': 'Person', name: a.author || state.siteName },
      publisher: buildOrgSchema()
    };
  }

  function buildBreadcrumb(items) {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: (items || []).map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        item: it.url
      }))
    };
  }

  function buildProductSchema(p) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: p.description,
      image: p.image,
      sku: p.sku,
      brand: { '@type': 'Brand', name: p.brand || state.siteName },
      offers: {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: p.currency || 'USD',
        availability: p.availability || 'https://schema.org/InStock'
      }
    };
  }

  function generateSitemap(urls) {
    const list = (urls && urls.length) ? urls : Object.keys(state.pages).map(p => ({
      loc: state.siteUrl.replace(/\/$/, '') + p,
      lastmod: new Date().toISOString().slice(0, 10),
      changefreq: 'weekly',
      priority: '0.8'
    }));
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    list.forEach(u => {
      xml += '  <url>\n';
      xml += `    <loc>${escapeXml(u.loc)}</loc>\n`;
      if (u.lastmod) xml += `    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n`;
      if (u.changefreq) xml += `    <changefreq>${escapeXml(u.changefreq)}</changefreq>\n`;
      if (u.priority) xml += `    <priority>${escapeXml(u.priority)}</priority>\n`;
      xml += '  </url>\n';
    });
    xml += '</urlset>\n';
    return xml;
  }

  function generateRobots(opts) {
    const r = Object.assign({}, state.robots, opts || {});
    let txt = 'User-agent: *\n';
    if (r.allowAll) txt += 'Allow: /\n';
    (r.disallow || []).forEach(p => { txt += `Disallow: ${p}\n`; });
    if (r.sitemap) txt += `\nSitemap: ${state.siteUrl.replace(/\/$/, '')}${r.sitemap}\n`;
    return txt;
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function registerPage(path, meta) {
    state.pages[path] = Object.assign({}, state.pages[path] || {}, meta || {});
    saveState(state);
  }

  function audit() {
    const issues = [];
    const t = document.title;
    if (!t || t.length < 10) issues.push('Title corto (<10 chars)');
    if (t && t.length > 60) issues.push('Title largo (>60 chars)');
    const d = document.head.querySelector('meta[name="description"]');
    if (!d || !d.content) issues.push('Falta description');
    else if (d.content.length > 160) issues.push('Description >160 chars');
    if (!document.head.querySelector('link[rel="canonical"]')) issues.push('Falta canonical');
    if (!document.head.querySelector('meta[property="og:title"]')) issues.push('Falta OG');
    if (!document.head.querySelector('script[type="application/ld+json"]')) issues.push('Falta JSON-LD');
    if (!document.documentElement.lang) issues.push('Falta lang en <html>');
    return { ok: issues.length === 0, issues, score: Math.max(0, 100 - issues.length * 12) };
  }

  function configure(cfg) {
    state = Object.assign(state, cfg || {});
    saveState(state);
    return state;
  }

  const SEOAPI = {
    version: '1.0.0',
    configure,
    getState: () => JSON.parse(JSON.stringify(state)),
    applyMeta,
    registerPage,
    injectSchema,
    schema: {
      organization: buildOrgSchema,
      article: buildArticleSchema,
      breadcrumb: buildBreadcrumb,
      product: buildProductSchema
    },
    generateSitemap,
    generateRobots,
    downloadSitemap: (urls) => downloadText('sitemap.xml', generateSitemap(urls), 'application/xml'),
    downloadRobots: (opts) => downloadText('robots.txt', generateRobots(opts), 'text/plain'),
    audit,
    reset: () => { try { localStorage.removeItem(STORE_KEY); } catch (e) {} state = loadState(); }
  };

  global.SEOAPI = SEOAPI;
  try { document.dispatchEvent(new CustomEvent('seoapi:ready', { detail: { version: SEOAPI.version } })); } catch (e) {}
})(window);
