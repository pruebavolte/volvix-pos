/**
 * volvix-notion-wiring.js
 * Integración Notion API para Volvix POS.
 * Expone window.NotionAPI con: databases, pages, sync inventario, reportes.
 *
 * Configuración esperada en localStorage:
 *   - NOTION_TOKEN          : Bearer token (secret_...)
 *   - NOTION_DB_INVENTARIO  : database_id de inventario
 *   - NOTION_DB_VENTAS      : database_id de ventas
 *   - NOTION_DB_REPORTES    : database_id de reportes
 *
 * NOTA: Notion API tiene CORS estricto. En producción se debe usar un proxy.
 *       Por defecto este wiring usa NOTION_PROXY_URL (si está seteado) o
 *       directamente https://api.notion.com (solo funciona desde server o
 *       extensión con permisos).
 */
(function (global) {
  'use strict';

  const NOTION_VERSION = '2022-06-28';
  const DEFAULT_BASE = 'https://api.notion.com/v1';

  // ───────────────────────── Config helpers ─────────────────────────
  function cfg(key, fallback = '') {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }
  function setCfg(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }
  function getBase() {
    return cfg('NOTION_PROXY_URL', DEFAULT_BASE).replace(/\/+$/, '');
  }
  function getToken() {
    const t = cfg('NOTION_TOKEN');
    if (!t) throw new Error('[NotionAPI] Falta NOTION_TOKEN en localStorage');
    return t;
  }
  function headers(extra = {}) {
    return Object.assign({
      'Authorization': `Bearer ${getToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    }, extra);
  }

  // ───────────────────────── HTTP core ─────────────────────────
  async function request(method, path, body) {
    const url = `${getBase()}${path}`;
    const opts = { method, headers: headers() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const txt = await res.text();
    let data;
    try { data = txt ? JSON.parse(txt) : {}; } catch (_) { data = { raw: txt }; }
    if (!res.ok) {
      const err = new Error(`[NotionAPI ${res.status}] ${data.message || res.statusText}`);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }
  const GET    = (p)    => request('GET', p);
  const POST   = (p, b) => request('POST', p, b);
  const PATCH  = (p, b) => request('PATCH', p, b);
  const DELETE = (p)    => request('DELETE', p);

  // ───────────────────────── Databases ─────────────────────────
  const databases = {
    retrieve: (id) => GET(`/databases/${id}`),
    query: (id, filter, sorts, page_size = 100, start_cursor) => {
      const body = { page_size };
      if (filter)       body.filter = filter;
      if (sorts)        body.sorts = sorts;
      if (start_cursor) body.start_cursor = start_cursor;
      return POST(`/databases/${id}/query`, body);
    },
    queryAll: async (id, filter, sorts) => {
      const out = []; let cursor;
      do {
        const r = await databases.query(id, filter, sorts, 100, cursor);
        out.push(...(r.results || []));
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return out;
    },
    create: (parent_page_id, title, properties) => POST('/databases', {
      parent: { type: 'page_id', page_id: parent_page_id },
      title: [{ type: 'text', text: { content: title } }],
      properties,
    }),
    update: (id, patch) => PATCH(`/databases/${id}`, patch),
  };

  // ───────────────────────── Pages ─────────────────────────
  const pages = {
    retrieve: (id) => GET(`/pages/${id}`),
    create: (database_id, properties, children) => {
      const body = { parent: { database_id }, properties };
      if (children) body.children = children;
      return POST('/pages', body);
    },
    update: (id, properties) => PATCH(`/pages/${id}`, { properties }),
    archive: (id) => PATCH(`/pages/${id}`, { archived: true }),
    unarchive: (id) => PATCH(`/pages/${id}`, { archived: false }),
  };

  // ───────────────────────── Blocks ─────────────────────────
  const blocks = {
    children: (id) => GET(`/blocks/${id}/children?page_size=100`),
    append: (id, children) => PATCH(`/blocks/${id}/children`, { children }),
    delete: (id) => DELETE(`/blocks/${id}`),
  };

  // ───────────────────────── Property helpers ─────────────────────────
  const prop = {
    title:    (v) => ({ title: [{ text: { content: String(v ?? '') } }] }),
    rich:     (v) => ({ rich_text: [{ text: { content: String(v ?? '') } }] }),
    number:   (v) => ({ number: v == null ? null : Number(v) }),
    select:   (v) => ({ select: v ? { name: String(v) } : null }),
    multi:    (arr) => ({ multi_select: (arr || []).map(n => ({ name: String(n) })) }),
    checkbox: (v) => ({ checkbox: !!v }),
    date:     (iso) => ({ date: iso ? { start: iso } : null }),
    url:      (v) => ({ url: v || null }),
    email:    (v) => ({ email: v || null }),
    phone:    (v) => ({ phone_number: v || null }),
    relation: (ids) => ({ relation: (ids || []).map(id => ({ id })) }),
  };

  function readProp(page, name) {
    const p = page?.properties?.[name];
    if (!p) return null;
    switch (p.type) {
      case 'title':       return (p.title[0]?.plain_text) || '';
      case 'rich_text':   return (p.rich_text[0]?.plain_text) || '';
      case 'number':      return p.number;
      case 'select':      return p.select?.name || null;
      case 'multi_select':return (p.multi_select || []).map(x => x.name);
      case 'checkbox':    return p.checkbox;
      case 'date':        return p.date?.start || null;
      case 'url':         return p.url;
      case 'email':       return p.email;
      case 'phone_number':return p.phone_number;
      case 'formula':     return p.formula?.[p.formula.type];
      case 'rollup':      return p.rollup;
      case 'relation':    return (p.relation || []).map(r => r.id);
      default:            return p[p.type] ?? null;
    }
  }

  // ───────────────────────── Sync Inventario ─────────────────────────
  /**
   * Sincroniza inventario local (array de productos) contra la DB de Notion.
   * Producto esperado: { sku, nombre, precio, stock, categoria }
   * La DB en Notion debe tener properties:
   *   SKU (title), Nombre (rich_text), Precio (number),
   *   Stock (number), Categoria (select), ActualizadoEn (date)
   */
  async function syncInventario(productosLocales, opts = {}) {
    const dbId = opts.databaseId || cfg('NOTION_DB_INVENTARIO');
    if (!dbId) throw new Error('[NotionAPI] Falta NOTION_DB_INVENTARIO');
    const remote = await databases.queryAll(dbId);
    const remoteBySku = new Map();
    for (const pg of remote) {
      const sku = readProp(pg, 'SKU');
      if (sku) remoteBySku.set(sku, pg);
    }
    const now = new Date().toISOString();
    const stats = { creados: 0, actualizados: 0, sinCambios: 0, errores: [] };
    for (const p of productosLocales) {
      try {
        const properties = {
          SKU:           prop.title(p.sku),
          Nombre:        prop.rich(p.nombre),
          Precio:        prop.number(p.precio),
          Stock:         prop.number(p.stock),
          Categoria:     prop.select(p.categoria),
          ActualizadoEn: prop.date(now),
        };
        const found = remoteBySku.get(p.sku);
        if (!found) {
          await pages.create(dbId, properties);
          stats.creados++;
        } else {
          const cambios =
            readProp(found, 'Precio') !== p.precio ||
            readProp(found, 'Stock')  !== p.stock  ||
            readProp(found, 'Nombre') !== p.nombre ||
            readProp(found, 'Categoria') !== p.categoria;
          if (cambios) {
            await pages.update(found.id, properties);
            stats.actualizados++;
          } else {
            stats.sinCambios++;
          }
        }
      } catch (e) {
        stats.errores.push({ sku: p.sku, error: e.message });
      }
    }
    return stats;
  }

  async function fetchInventario(opts = {}) {
    const dbId = opts.databaseId || cfg('NOTION_DB_INVENTARIO');
    const rows = await databases.queryAll(dbId);
    return rows.map(pg => ({
      id: pg.id,
      sku: readProp(pg, 'SKU'),
      nombre: readProp(pg, 'Nombre'),
      precio: readProp(pg, 'Precio'),
      stock: readProp(pg, 'Stock'),
      categoria: readProp(pg, 'Categoria'),
      actualizadoEn: readProp(pg, 'ActualizadoEn'),
    }));
  }

  // ───────────────────────── Ventas / Reportes ─────────────────────────
  async function registrarVenta(venta, opts = {}) {
    const dbId = opts.databaseId || cfg('NOTION_DB_VENTAS');
    if (!dbId) throw new Error('[NotionAPI] Falta NOTION_DB_VENTAS');
    return pages.create(dbId, {
      Folio:    prop.title(venta.folio || `V-${Date.now()}`),
      Fecha:    prop.date(venta.fecha || new Date().toISOString()),
      Total:    prop.number(venta.total),
      Metodo:   prop.select(venta.metodo || 'Efectivo'),
      Cliente:  prop.rich(venta.cliente || ''),
      Items:    prop.number((venta.items || []).length),
      Notas:    prop.rich(venta.notas || ''),
    });
  }

  async function generarReporteDiario(fechaISO, opts = {}) {
    const dbVentas = opts.dbVentas || cfg('NOTION_DB_VENTAS');
    const dbRep    = opts.dbReportes || cfg('NOTION_DB_REPORTES');
    if (!dbVentas || !dbRep) throw new Error('[NotionAPI] Falta DB de ventas o reportes');
    const day = (fechaISO || new Date().toISOString()).slice(0, 10);
    const filter = {
      property: 'Fecha',
      date: { equals: day },
    };
    const ventas = await databases.queryAll(dbVentas, filter);
    let total = 0, items = 0;
    const porMetodo = {};
    for (const v of ventas) {
      const t = readProp(v, 'Total') || 0;
      const m = readProp(v, 'Metodo') || 'Otro';
      total += t; items += (readProp(v, 'Items') || 0);
      porMetodo[m] = (porMetodo[m] || 0) + t;
    }
    const resumen = Object.entries(porMetodo)
      .map(([k, v]) => `${k}: $${v.toFixed(2)}`).join(' | ');
    return pages.create(dbRep, {
      Fecha:        prop.title(day),
      TotalVentas:  prop.number(total),
      NumVentas:    prop.number(ventas.length),
      NumItems:     prop.number(items),
      Resumen:      prop.rich(resumen || 'Sin ventas'),
      GeneradoEn:   prop.date(new Date().toISOString()),
    });
  }

  // ───────────────────────── Search & Users ─────────────────────────
  const search = (query, opts = {}) => POST('/search', Object.assign({ query }, opts));
  const users = {
    list: () => GET('/users'),
    me: () => GET('/users/me'),
    retrieve: (id) => GET(`/users/${id}`),
  };

  async function ping() {
    try { const me = await users.me(); return { ok: true, bot: me?.name || me?.id }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  // ───────────────────────── Export ─────────────────────────
  global.NotionAPI = {
    version: '1.0.0',
    config: { get: cfg, set: setCfg },
    request, GET, POST, PATCH, DELETE,
    databases, pages, blocks, search, users,
    prop, readProp,
    syncInventario, fetchInventario,
    registrarVenta, generarReporteDiario,
    ping,
  };

  if (typeof console !== 'undefined') {
    console.log('[NotionAPI] wiring cargado v1.0.0 — window.NotionAPI listo');
  }
})(typeof window !== 'undefined' ? window : globalThis);
