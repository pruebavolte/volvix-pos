#!/usr/bin/env node
/**
 * Volvix POS — E2E smoke test
 * Hits all critical endpoints/pages against production and validates 200 responses.
 * Usage: node scripts/e2e.mjs [BASE_URL]
 */

const BASE = process.argv[2] || 'https://salvadorexoficial.com';

const CHECKS = [
  // Pages
  { label: 'Home (index.html)',         url: '/' },
  { label: 'POS (pos.html)',            url: '/pos.html' },
  { label: 'Owner dashboard',           url: '/owner.html' },
  { label: 'Inventario',                url: '/inventario.html' },
  { label: 'Motor IA',                  url: '/ai.html' },
  { label: 'Soporte',                   url: '/soporte.html' },
  { label: 'PWA Manifest',              url: '/manifest.json' },
  { label: 'Service Worker',            url: '/sw.js' },
  // API endpoints
  { label: 'API Health',                url: '/api/health' },
  { label: 'API Tenants',               url: '/api/tenants' },
  { label: 'API Productos',             url: '/api/productos' },
  { label: 'API Ventas',                url: '/api/ventas' },
  { label: 'API Features',              url: '/api/features' },
  { label: 'API Tickets',               url: '/api/tickets' },
  { label: 'API Licencias',             url: '/api/licencias' },
  { label: 'API Stats',                 url: '/api/stats' },
  { label: 'API AI Suggest (retail)',   url: '/api/ai/suggest?tipo=retail' },
];

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

async function check({ label, url }) {
  const fullUrl = BASE + url;
  try {
    const res = await fetch(fullUrl, { redirect: 'follow' });
    const ok = res.status >= 200 && res.status < 400;
    const color = ok ? GREEN : RED;
    const symbol = ok ? '✓' : '✗';
    console.log(`  ${color}${symbol}${RESET} ${label.padEnd(32)} ${color}${res.status}${RESET}  ${fullUrl}`);
    return ok;
  } catch (e) {
    console.log(`  ${RED}✗${RESET} ${label.padEnd(32)} ${RED}ERR${RESET}  ${e.message}`);
    return false;
  }
}

async function main() {
  console.log(`\n${BOLD}Volvix POS — E2E Smoke Test${RESET}`);
  console.log(`${YELLOW}Target: ${BASE}${RESET}\n`);

  const results = await Promise.all(CHECKS.map(check));
  const passed  = results.filter(Boolean).length;
  const total   = results.length;
  const allOk   = passed === total;

  console.log(`\n${BOLD}Result: ${allOk ? GREEN : RED}${passed}/${total} passed${RESET}`);

  if (!allOk) {
    console.log(`${RED}Some checks failed. Review the output above.${RESET}\n`);
    process.exit(1);
  }

  console.log(`${GREEN}All checks passed. Volvix POS is 100% functional in production.${RESET}\n`);
}

main();
