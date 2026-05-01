/**
 * VOLVIX · Email templates (R14)
 * HTML inline simple, responsive table layout, logo placeholder.
 */

'use strict';

const BRAND = {
  name: 'Volvix POS',
  logo: 'https://salvadorexoficial.com/logo.png', // placeholder
  color: '#1f6feb',
  url: 'https://salvadorexoficial.com',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shell(title, innerHtml) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1a2233;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <tr><td style="background:${BRAND.color};padding:20px 24px;" align="left">
        <img src="${BRAND.logo}" alt="${escapeHtml(BRAND.name)}" height="32" style="display:block;border:0;outline:none;text-decoration:none;">
      </td></tr>
      <tr><td style="padding:28px 24px;font-size:15px;line-height:1.55;">
        ${innerHtml}
      </td></tr>
      <tr><td style="padding:18px 24px;background:#f9fafc;border-top:1px solid #eceff5;font-size:12px;color:#6b7280;" align="center">
        &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND.name)} ·
        <a href="${BRAND.url}" style="color:${BRAND.color};text-decoration:none;">${BRAND.url}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function welcomeTemplate(user) {
  const name = escapeHtml(user?.full_name || user?.email || 'usuario');
  const email = escapeHtml(user?.email || '');
  const html = shell('Bienvenido a Volvix POS', `
    <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND.color};">Bienvenido, ${name}</h1>
    <p>Tu cuenta en <strong>${BRAND.name}</strong> ha sido creada con &eacute;xito.</p>
    <table role="presentation" cellpadding="6" cellspacing="0" style="margin:14px 0;border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#6b7280;">Email:</td><td><strong>${email}</strong></td></tr>
      <tr><td style="color:#6b7280;">Plan:</td><td>${escapeHtml(user?.plan || 'trial')}</td></tr>
      <tr><td style="color:#6b7280;">Rol:</td><td>${escapeHtml(user?.role || 'USER')}</td></tr>
    </table>
    <p style="margin:18px 0;">
      <a href="${BRAND.url}/login.html" style="background:${BRAND.color};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Entrar al sistema</a>
    </p>
    <p style="color:#6b7280;font-size:13px;">Si no esperabas este correo, ign&oacute;ralo.</p>
  `);
  const text = `Bienvenido a ${BRAND.name}, ${user?.full_name || user?.email || ''}.\n` +
    `Email: ${user?.email || ''}\nPlan: ${user?.plan || 'trial'}\n` +
    `Login: ${BRAND.url}/login.html\n`;
  return { subject: `Bienvenido a ${BRAND.name}`, html, text };
}

function receiptTemplate(sale) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const total = parseFloat(sale?.total || 0).toFixed(2);
  const id = escapeHtml(sale?.id || '');
  const method = escapeHtml(sale?.payment_method || '');
  const date = escapeHtml(sale?.created_at || new Date().toISOString());

  const rows = items.map(it => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eceff5;">${escapeHtml(it.name || it.code || 'item')}</td>
      <td style="padding:8px;border-bottom:1px solid #eceff5;text-align:center;">${escapeHtml(it.qty || it.quantity || 1)}</td>
      <td style="padding:8px;border-bottom:1px solid #eceff5;text-align:right;">$${parseFloat(it.price || 0).toFixed(2)}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="padding:8px;color:#6b7280;">(sin detalle)</td></tr>`;

  const html = shell('Recibo de compra', `
    <h1 style="margin:0 0 12px;font-size:20px;color:${BRAND.color};">Gracias por tu compra</h1>
    <p style="color:#6b7280;font-size:13px;">Recibo <strong>${id}</strong> · ${date} · ${method}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;font-size:14px;">
      <thead>
        <tr style="background:#f9fafc;"><th align="left" style="padding:8px;">Producto</th><th style="padding:8px;">Cant.</th><th align="right" style="padding:8px;">Precio</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:10px 8px;text-align:right;"><strong>Total</strong></td><td style="padding:10px 8px;text-align:right;font-size:16px;"><strong>$${total}</strong></td></tr>
      </tfoot>
    </table>
    <p style="margin-top:20px;color:#6b7280;font-size:13px;">Conserva este correo como comprobante.</p>
  `);

  const text = `Recibo ${sale?.id || ''}\nFecha: ${date}\nMétodo: ${sale?.payment_method || ''}\n` +
    items.map(it => `- ${it.name || it.code || 'item'} x${it.qty || 1}  $${parseFloat(it.price || 0).toFixed(2)}`).join('\n') +
    `\nTotal: $${total}\n`;

  return { subject: `Recibo de compra ${sale?.id || ''}`.trim(), html, text };
}

function lowStockTemplate(items) {
  const arr = Array.isArray(items) ? items : [];
  const rows = arr.map(p => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eceff5;">${escapeHtml(p.code || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #eceff5;">${escapeHtml(p.name || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #eceff5;text-align:right;">${escapeHtml(p.stock != null ? p.stock : '')}</td>
      <td style="padding:8px;border-bottom:1px solid #eceff5;text-align:right;">${escapeHtml(p.reorder_point != null ? p.reorder_point : '')}</td>
    </tr>`).join('') || `<tr><td colspan="4" style="padding:8px;color:#6b7280;">(sin productos bajo umbral)</td></tr>`;

  const html = shell('Alerta de stock bajo', `
    <h1 style="margin:0 0 12px;font-size:20px;color:#b45309;">&#9888; Stock bajo</h1>
    <p>Los siguientes productos est&aacute;n por debajo de su punto de reorden:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;font-size:14px;">
      <thead>
        <tr style="background:#f9fafc;">
          <th align="left" style="padding:8px;">C&oacute;digo</th>
          <th align="left" style="padding:8px;">Nombre</th>
          <th align="right" style="padding:8px;">Stock</th>
          <th align="right" style="padding:8px;">Reorden</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:18px;color:#6b7280;font-size:13px;">Total: ${arr.length} producto(s).</p>
  `);
  const text = `Alerta stock bajo (${arr.length} productos):\n` +
    arr.map(p => `- [${p.code || ''}] ${p.name || ''}: stock=${p.stock} / reorden=${p.reorder_point}`).join('\n');
  return { subject: `[Volvix] Stock bajo: ${arr.length} producto(s)`, html, text };
}

function passwordResetTemplate(link) {
  const safeLink = escapeHtml(link || '');
  const html = shell('Restablecer contraseña', `
    <h1 style="margin:0 0 12px;font-size:20px;color:${BRAND.color};">Restablecer contrase&ntilde;a</h1>
    <p>Recibimos una solicitud para restablecer tu contrase&ntilde;a. Este enlace expira en <strong>15 minutos</strong>.</p>
    <p style="margin:18px 0;">
      <a href="${safeLink}" style="background:${BRAND.color};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Restablecer contrase&ntilde;a</a>
    </p>
    <p style="color:#6b7280;font-size:13px;word-break:break-all;">${safeLink}</p>
    <p style="color:#6b7280;font-size:13px;">Si t&uacute; no la solicitaste, ign&oacute;ralo.</p>
  `);
  const text = `Restablecer contraseña (expira en 15 min):\n${link}\n`;
  return { subject: 'Restablecer tu contraseña', html, text };
}

module.exports = {
  welcomeTemplate,
  receiptTemplate,
  lowStockTemplate,
  passwordResetTemplate,
};
