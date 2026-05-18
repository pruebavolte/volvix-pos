/**
 * PATCH 3: Roles hardcoded en frontend
 * =====================================
 * Detecta strings de roles conocidos y comparaciones role === '...'
 * en cualquier archivo HTML/JS del proyecto.
 *
 * HALLAZGOS REALES en salvadorex-pos.html:
 *   Roles encontrados: owner, admin, superadmin, manager, cashier, cajero, delivery
 *   role_checks_count: 18 (comparaciones directas role === 'X' o role === 'Y')
 *   Líneas críticas: 2588, 7530-7532, 7829, 15001, 16293, 18576, 18660
 *
 * RIESGO: Cualquier renombre de rol en BD rompe silenciosamente el UI.
 *         Centralizar en un objeto ROLES_MAP importado desde config.
 *
 * HOW TO INTEGRATE: Añadir a scanFile() de generate-system-map.js
 * después del bloque de extracción de endpoints.
 */

// ---------------------------------------------------------------------------
// SNIPPET PARA INSERTAR EN scanFile()
// ---------------------------------------------------------------------------

const KNOWN_ROLES = [
  'platform_owner', 'business_owner', 'admin', 'cashier',
  'waiter', 'delivery', 'owner', 'super_admin', 'manager',
  'superadmin', 'cajero', // variantes reales encontradas en el HTML
];

/**
 * Detecta roles hardcoded y comparaciones de rol en el texto de un archivo.
 * @param {string} text - contenido completo del archivo
 * @returns {{ roles_mencionados: string[], role_checks_count: number, role_checks: string[] }}
 */
function detectHardcodedRoles(text) {
  // 1. Strings de roles conocidos (entre comillas simples o dobles)
  const roleRegex = new RegExp(
    `['"](?:${KNOWN_ROLES.join('|')})['"]`,
    'g'
  );
  const rolesFound = [];
  let rm;
  while ((rm = roleRegex.exec(text)) !== null) {
    const r = rm[0].replace(/['"]/g, '');
    if (!rolesFound.includes(r)) rolesFound.push(r);
  }

  // 2. Comparaciones directas: role === 'xxx', user.role === 'xxx', etc.
  const roleCheckRegex = /(?:role|userRole|currentRole|user\.role|tenant\.role|session\.role)\s*===?\s*['"]([a-z_]+)['"]/gi;
  const roleChecks = [];
  let rcm;
  while ((rcm = roleCheckRegex.exec(text)) !== null) {
    roleChecks.push(rcm[1]);
  }

  // 3. Array.includes() con roles: ['owner','admin'].includes(role)
  const includesCheckRegex = /\[([^\]]+)\]\.includes\(\s*(?:role|userRole|currentRole|user\.role|session\.role)/g;
  const includesChecks = [];
  let icm;
  while ((icm = includesCheckRegex.exec(text)) !== null) {
    includesChecks.push(icm[0].trim().slice(0, 80));
  }

  return {
    roles_mencionados: rolesFound,
    role_checks_count: roleChecks.length,
    role_checks_distinct: [...new Set(roleChecks)],
    includes_checks_count: includesChecks.length,
    includes_samples: includesChecks.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// INTEGRACIÓN EN scanFile() — agregar al objeto de retorno:
// ---------------------------------------------------------------------------
//
//   const roleData = detectHardcodedRoles(text);
//   return {
//     ...existingReturn,
//     roles_mencionados:     roleData.roles_mencionados,
//     role_checks_count:     roleData.role_checks_count,
//     role_checks_distinct:  roleData.role_checks_distinct,
//     includes_checks_count: roleData.includes_checks_count,
//     includes_samples:      roleData.includes_samples,
//   };
//
// ---------------------------------------------------------------------------

module.exports = { detectHardcodedRoles, KNOWN_ROLES };
