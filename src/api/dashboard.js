/**
 * VOLVIX POS · Admin Dashboard API
 *
 * Proporciona endpoints para:
 * - Resumen de ventas (diario, semanal, mensual)
 * - Gráficos por producto, categoría, método de pago
 * - Gestión de usuarios (búsqueda, actividad, roles)
 * - Inventario (stock, alertas de bajo nivel)
 * - Historial de transacciones
 * - Reportes de desempeño
 * - Estados de integraciones (WhatsApp, Twilio, etc)
 */

const https = require('https');

// ============================================================================
// CONFIG
// ============================================================================
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = SUPABASE_URL + '/rest/v1' + path;
    const u = new URL(fullUrl);

    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: method,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) {
            reject(new Error(`Supabase ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(new Error('Parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// HELPERS
// ============================================================================
function formatCurrency(val) {
  return '$' + (parseFloat(val) || 0).toFixed(2);
}

function getDateRange(period) {
  const now = new Date();
  let start, end = now.toISOString().split('T')[0];

  if (period === 'today') {
    start = end;
  } else if (period === 'week') {
    const week = new Date(now);
    week.setDate(week.getDate() - 7);
    start = week.toISOString().split('T')[0];
  } else if (period === 'month') {
    const month = new Date(now);
    month.setMonth(month.getMonth() - 1);
    start = month.toISOString().split('T')[0];
  } else {
    start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
  }

  return { start, end };
}

function sendJSON(res, data, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /api/dashboard/sales-summary?period=today|week|month|year
 * Resumen de ventas en el período
 */
async function getSalesSummary(req, res, params) {
  try {
    const period = (new URL(req.url, 'http://localhost').searchParams.get('period')) || 'month';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    const range = getDateRange(period);

    // Obtener ventas del período
    const sales = await supabaseRequest('GET',
      `/volvix_pos_sales?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${range.start}&created_at=lt.${range.end}&select=*`
    );

    const totalSales = Array.isArray(sales) ? sales.length : 0;
    const totalAmount = Array.isArray(sales)
      ? sales.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
      : 0;

    const avgTransaction = totalSales > 0 ? totalAmount / totalSales : 0;

    sendJSON(res, {
      period,
      totalSales,
      totalAmount: formatCurrency(totalAmount),
      avgTransaction: formatCurrency(avgTransaction),
      rawAmount: totalAmount,
      sales: sales || []
    });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/sales-by-product?period=month
 * Ventas agrupadas por producto
 */
async function getSalesByProduct(req, res, params) {
  try {
    const period = (new URL(req.url, 'http://localhost').searchParams.get('period')) || 'month';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    const range = getDateRange(period);

    // Obtener ítems de venta
    const items = await supabaseRequest('GET',
      `/volvix_pos_sale_items?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${range.start}&created_at=lt.${range.end}&select=product_id,product_name,quantity,amount`
    );

    // Agrupar por producto
    const byProduct = {};
    if (Array.isArray(items)) {
      items.forEach(item => {
        const key = item.product_id || item.product_name || 'unknown';
        if (!byProduct[key]) {
          byProduct[key] = { name: item.product_name || key, quantity: 0, amount: 0 };
        }
        byProduct[key].quantity += parseInt(item.quantity) || 0;
        byProduct[key].amount += parseFloat(item.amount) || 0;
      });
    }

    const data = Object.entries(byProduct)
      .map(([id, info]) => ({ id, ...info, amountFormatted: formatCurrency(info.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    sendJSON(res, { period, data });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/sales-by-category?period=month
 * Ventas agrupadas por categoría
 */
async function getSalesByCategory(req, res, params) {
  try {
    const period = (new URL(req.url, 'http://localhost').searchParams.get('period')) || 'month';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    const range = getDateRange(period);

    const items = await supabaseRequest('GET',
      `/volvix_pos_sale_items?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${range.start}&created_at=lt.${range.end}&select=category,quantity,amount`
    );

    const byCategory = {};
    if (Array.isArray(items)) {
      items.forEach(item => {
        const cat = item.category || 'Sin categoría';
        if (!byCategory[cat]) {
          byCategory[cat] = { quantity: 0, amount: 0 };
        }
        byCategory[cat].quantity += parseInt(item.quantity) || 0;
        byCategory[cat].amount += parseFloat(item.amount) || 0;
      });
    }

    const data = Object.entries(byCategory)
      .map(([category, info]) => ({ category, ...info, amountFormatted: formatCurrency(info.amount) }))
      .sort((a, b) => b.amount - a.amount);

    sendJSON(res, { period, data });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/sales-by-day?period=month
 * Ventas diarias (para gráfico)
 */
async function getSalesByDay(req, res, params) {
  try {
    const period = (new URL(req.url, 'http://localhost').searchParams.get('period')) || 'month';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    const range = getDateRange(period);

    const sales = await supabaseRequest('GET',
      `/volvix_pos_sales?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${range.start}&created_at=lt.${range.end}&select=created_at,amount`
    );

    const byDay = {};
    if (Array.isArray(sales)) {
      sales.forEach(sale => {
        const day = (sale.created_at || '').split('T')[0];
        if (!byDay[day]) byDay[day] = 0;
        byDay[day] += parseFloat(sale.amount) || 0;
      });
    }

    const data = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount, amountFormatted: formatCurrency(amount) }));

    sendJSON(res, { period, data });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/transactions?limit=50&offset=0&filter=all|pending|completed|refunded
 * Historial de transacciones
 */
async function getTransactions(req, res, params) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    const filter = url.searchParams.get('filter') || 'all';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    let query = `/volvix_pos_sales?tenant_id=eq.${encodeURIComponent(tenantId)}&order=created_at.desc&limit=${limit}&offset=${offset}&select=*`;

    if (filter === 'refunded') {
      query += '&status=eq.refunded';
    } else if (filter === 'pending') {
      query += '&status=eq.pending';
    } else if (filter === 'completed') {
      query += '&status=eq.completed';
    }

    const sales = await supabaseRequest('GET', query);

    sendJSON(res, {
      items: sales || [],
      limit,
      offset,
      total: (sales && sales.length) || 0
    });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/payment-methods?period=month
 * Desglose por método de pago
 */
async function getPaymentMethods(req, res, params) {
  try {
    const period = (new URL(req.url, 'http://localhost').searchParams.get('period')) || 'month';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    const range = getDateRange(period);

    const sales = await supabaseRequest('GET',
      `/volvix_pos_sales?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${range.start}&created_at=lt.${range.end}&select=payment_method,amount`
    );

    const byMethod = {};
    if (Array.isArray(sales)) {
      sales.forEach(sale => {
        const method = sale.payment_method || 'Desconocido';
        if (!byMethod[method]) byMethod[method] = 0;
        byMethod[method] += parseFloat(sale.amount) || 0;
      });
    }

    const data = Object.entries(byMethod)
      .map(([method, amount]) => ({ method, amount, amountFormatted: formatCurrency(amount) }))
      .sort((a, b) => b.amount - a.amount);

    sendJSON(res, { period, data });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/users?limit=50&offset=0&role=all&status=all
 * Listado de usuarios
 */
async function getUsers(req, res, params) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    const role = url.searchParams.get('role') || 'all';
    const status = url.searchParams.get('status') || 'all';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    let query = `/pos_users?tenant_id=eq.${encodeURIComponent(tenantId)}&order=created_at.desc&limit=${limit}&offset=${offset}&select=*`;

    if (role !== 'all') {
      query += `&role=eq.${encodeURIComponent(role)}`;
    }
    if (status !== 'all') {
      query += `&status=eq.${encodeURIComponent(status)}`;
    }

    const users = await supabaseRequest('GET', query);

    sendJSON(res, {
      items: users || [],
      limit,
      offset,
      total: (users && users.length) || 0
    });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/inventory?low-stock-only=false
 * Inventario y niveles de stock
 */
async function getInventory(req, res, params) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const lowStockOnly = url.searchParams.get('low-stock-only') === 'true';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    let query = `/volvix_pos_products?tenant_id=eq.${encodeURIComponent(tenantId)}&order=name.asc&select=*`;

    const products = await supabaseRequest('GET', query);

    let filtered = products || [];
    if (lowStockOnly) {
      filtered = filtered.filter(p => (parseInt(p.stock) || 0) < 5);
    }

    sendJSON(res, {
      items: filtered,
      total: filtered.length,
      lowStockCount: (products || []).filter(p => (parseInt(p.stock) || 0) < 5).length
    });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/top-products?limit=10&period=month
 * Top productos por ventas
 */
async function getTopProducts(req, res, params) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit')) || 10;
    const period = url.searchParams.get('period') || 'month';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    const range = getDateRange(period);

    const items = await supabaseRequest('GET',
      `/volvix_pos_sale_items?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${range.start}&created_at=lt.${range.end}&select=product_id,product_name,quantity,amount`
    );

    const byProduct = {};
    if (Array.isArray(items)) {
      items.forEach(item => {
        const key = item.product_id || item.product_name || 'unknown';
        if (!byProduct[key]) {
          byProduct[key] = { name: item.product_name || key, quantity: 0, amount: 0 };
        }
        byProduct[key].quantity += parseInt(item.quantity) || 0;
        byProduct[key].amount += parseFloat(item.amount) || 0;
      });
    }

    const data = Object.entries(byProduct)
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);

    sendJSON(res, { period, data, total: data.length });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/kpis?period=month
 * KPIs: crecimiento, promedio ticket, transacciones/día
 */
async function getKPIs(req, res, params) {
  try {
    const period = (new URL(req.url, 'http://localhost').searchParams.get('period')) || 'month';
    const tenantId = req.user && req.user.tenant_id;

    if (!tenantId) {
      return sendJSON(res, { error: 'tenant_required' }, 401);
    }

    const range = getDateRange(period);
    const prevRange = getDateRange(period === 'today' ? 'today' : 'month');

    // Ventas actuales
    const sales = await supabaseRequest('GET',
      `/volvix_pos_sales?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${range.start}&created_at=lt.${range.end}&select=amount`
    );

    const currentTotal = Array.isArray(sales)
      ? sales.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
      : 0;

    const avgTicket = Array.isArray(sales) && sales.length > 0
      ? currentTotal / sales.length
      : 0;

    const transPerDay = Array.isArray(sales) ? sales.length : 0;

    // Comparación con período anterior (simple)
    const prevSales = await supabaseRequest('GET',
      `/volvix_pos_sales?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${prevRange.start}&created_at=lt.${prevRange.end}&select=amount`
    );

    const prevTotal = Array.isArray(prevSales)
      ? prevSales.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
      : 0;

    const growthPercent = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal * 100) : 0;

    sendJSON(res, {
      period,
      salesGrowthPercent: growthPercent.toFixed(2),
      totalSales: formatCurrency(currentTotal),
      avgTicketSize: formatCurrency(avgTicket),
      transactionsPerDay: transPerDay,
      rawTotalSales: currentTotal,
      rawAvgTicket: avgTicket
    });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

/**
 * GET /api/dashboard/integration-status
 * Estado de integraciones (WhatsApp, Twilio, PayPal, etc)
 */
async function getIntegrationStatus(req, res, params) {
  try {
    const waConfigured = !!process.env.WHATSAPP_TOKEN;
    const twilioConfigured = !!process.env.TWILIO_ACCOUNT_SID;
    const paypalConfigured = !!process.env.PAYPAL_CLIENT_ID;
    const emailConfigured = !!process.env.RESEND_API_KEY;

    sendJSON(res, {
      whatsapp: {
        configured: waConfigured,
        status: waConfigured ? 'active' : 'not_configured'
      },
      twilio: {
        configured: twilioConfigured,
        status: twilioConfigured ? 'active' : 'not_configured'
      },
      paypal: {
        configured: paypalConfigured,
        status: paypalConfigured ? 'active' : 'not_configured'
      },
      email: {
        configured: emailConfigured,
        status: emailConfigured ? 'active' : 'not_configured'
      }
    });
  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

// ============================================================================
// EXPORT HANDLERS
// ============================================================================
module.exports = {
  getSalesSummary,
  getSalesByProduct,
  getSalesByCategory,
  getSalesByDay,
  getTransactions,
  getPaymentMethods,
  getUsers,
  getInventory,
  getTopProducts,
  getKPIs,
  getIntegrationStatus,
  supabaseRequest,
  sendJSON
};
