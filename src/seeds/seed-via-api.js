#!/usr/bin/env node
// ============================================================
// Volvix POS — seed-via-api.js
// ============================================================
// Seeds 10 industry demo tenants via the production API endpoints.
// Useful when you don't have direct DB access.
//
// Usage:
//   API_BASE=https://your-app.vercel.app \
//   SUPERADMIN_EMAIL=admin@volvix.test \
//   SUPERADMIN_PASSWORD=*** \
//   node seeds/seed-via-api.js
// ============================================================

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || "admin@volvix.test";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD;

if (!SUPERADMIN_PASSWORD) {
  console.error("ERROR: set SUPERADMIN_PASSWORD env var");
  process.exit(1);
}

// B40 SECURITY FIX A2: Production guard
const isLocal = API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
if (!isLocal && !process.env.ALLOW_SEED_PROD) {
  console.error("ERROR: API_BASE points to non-localhost. Set ALLOW_SEED_PROD=1 to confirm.");
  console.error("This script creates demo accounts which should NOT exist in production.");
  process.exit(1);
}

// B40 SECURITY FIX A2: Generate random password per run (no hardcoded password)
const crypto = require('crypto');
const TENANT_PASSWORD = process.env.TENANT_PASSWORD || ('Demo' + crypto.randomBytes(8).toString('hex') + '!');
console.log("Demo tenant password (save this): " + TENANT_PASSWORD);

const TENANTS = [
  { vertical: "abarrotes",   name: "Abarrotes La Esquina",        email: "demo-abarrotes@volvix.test",   city: "CDMX" },
  { vertical: "panaderia",   name: "Panadería La Espiga Dorada",  email: "demo-panaderia@volvix.test",   city: "GDL" },
  { vertical: "farmacia",    name: "Farmacia San Rafael",         email: "demo-farmacia@volvix.test",    city: "MTY" },
  { vertical: "restaurant",  name: "Tacos El Buen Sabor",         email: "demo-restaurant@volvix.test",  city: "CDMX" },
  { vertical: "cafe",        name: "Café Central",                email: "demo-cafe@volvix.test",        city: "CDMX" },
  { vertical: "barberia",    name: "Barbería Don Pepe",           email: "demo-barberia@volvix.test",    city: "CDMX" },
  { vertical: "gasolinera",  name: "Gasolinera Express 24/7",     email: "demo-gasolinera@volvix.test",  city: "Querétaro" },
  { vertical: "ropa",        name: "Boutique Femenina Andrea",    email: "demo-ropa@volvix.test",        city: "CDMX" },
  { vertical: "electronica", name: "TecnoMundo",                  email: "demo-electronica@volvix.test", city: "Puebla" },
  { vertical: "fitness",     name: "FitZone Gym",                 email: "demo-fitness@volvix.test",     city: "GDL" },
];

const PRODUCT_CATALOGS = {
  abarrotes: [
    { name: "Coca-Cola 600ml", price: 18, cost: 12.5, stock: 120, category: "Bebidas" },
    { name: "Sabritas Original 45g", price: 16, cost: 10, stock: 150, category: "Botanas" },
    { name: "Maruchan Camarón", price: 16, cost: 9.5, stock: 180, category: "Despensa" },
    { name: "Bimbo Pan Blanco", price: 45, cost: 33, stock: 35, category: "Panadería" },
    { name: "Aceite Capullo 1L", price: 55, cost: 42, stock: 50, category: "Despensa" },
    { name: "Detergente Foca 1kg", price: 45, cost: 32, stock: 60, category: "Limpieza" },
    { name: "Huevos San Juan 18p", price: 75, cost: 58, stock: 30, category: "Despensa" },
    { name: "Tortillas Maseca 1kg", price: 25, cost: 18, stock: 90, category: "Despensa" },
    { name: "Crema La Lechera 250ml", price: 28, cost: 19, stock: 45, category: "Lácteos" },
    { name: "Cerveza Corona 355ml", price: 22, cost: 16, stock: 200, category: "Bebidas" },
  ],
  panaderia: [
    { name: "Bolillo", price: 3, cost: 1.2, stock: 300, category: "Pan Salado" },
    { name: "Concha de Chocolate", price: 12, cost: 5, stock: 180, category: "Pan Dulce" },
    { name: "Empanada de Piña", price: 8, cost: 3.5, stock: 150, category: "Pan Dulce" },
    { name: "Pastel Chocolate 8 personas", price: 380, cost: 180, stock: 8, category: "Pasteles" },
    { name: "Pastel Tres Leches", price: 420, cost: 200, stock: 6, category: "Pasteles" },
    { name: "Bizcocho 1kg", price: 65, cost: 28, stock: 20, category: "Pasteles" },
    { name: "Galletas Saladas", price: 35, cost: 14, stock: 60, category: "Galletas" },
    { name: "Pan Integral Rebanado", price: 55, cost: 25, stock: 30, category: "Pan Saludable" },
  ],
  farmacia: [
    { name: "Paracetamol 500mg 24t", price: 35, cost: 18, stock: 80, category: "Analgésicos" },
    { name: "Ibuprofeno 400mg 20t", price: 45, cost: 24, stock: 60, category: "Analgésicos" },
    { name: "Aspirina 100mg 30t", price: 28, cost: 15, stock: 90, category: "Analgésicos" },
    { name: "Loratadina 10mg 10t", price: 55, cost: 30, stock: 60, category: "Antialérgico" },
    { name: "Amoxicilina 500mg 12t", price: 85, cost: 48, stock: 30, category: "Antibiótico" },
    { name: "Vitamina C 1000mg", price: 120, cost: 65, stock: 80, category: "Vitaminas" },
    { name: "Termómetro Digital", price: 180, cost: 110, stock: 15, category: "Equipo" },
    { name: "Curitas Pack 50", price: 55, cost: 30, stock: 80, category: "Curaciones" },
  ],
  restaurant: [
    { name: "Taco al Pastor", price: 18, cost: 7, stock: 9999, category: "Tacos" },
    { name: "Quesadilla 3 Quesos", price: 75, cost: 32, stock: 9999, category: "Antojitos" },
    { name: "Sopes (orden 4)", price: 55, cost: 22, stock: 9999, category: "Antojitos" },
    { name: "Aguas Frescas Vaso", price: 25, cost: 5, stock: 9999, category: "Bebidas" },
    { name: "Refresco 600ml", price: 30, cost: 18, stock: 200, category: "Bebidas" },
    { name: "Cerveza Corona", price: 45, cost: 22, stock: 150, category: "Bebidas" },
    { name: "Postre Flan", price: 55, cost: 18, stock: 30, category: "Postres" },
  ],
  cafe: [
    { name: "Espresso", price: 35, cost: 8, stock: 9999, category: "Café" },
    { name: "Americano", price: 40, cost: 10, stock: 9999, category: "Café" },
    { name: "Cappuccino", price: 50, cost: 14, stock: 9999, category: "Café" },
    { name: "Latte Vainilla", price: 55, cost: 17, stock: 9999, category: "Café" },
    { name: "Frappé Caramelo", price: 65, cost: 22, stock: 9999, category: "Frappés" },
    { name: "Té Chai", price: 45, cost: 14, stock: 9999, category: "Té" },
    { name: "Croissant", price: 35, cost: 12, stock: 40, category: "Panadería" },
    { name: "Sandwich Panini", price: 75, cost: 32, stock: 25, category: "Comida" },
    { name: "Pastel Zanahoria", price: 60, cost: 22, stock: 30, category: "Postres" },
  ],
  barberia: [
    { name: "Corte Clásico", price: 120, cost: 0, stock: 9999, category: "Servicios" },
    { name: "Corte Fade", price: 150, cost: 0, stock: 9999, category: "Servicios" },
    { name: "Barba Completa", price: 80, cost: 0, stock: 9999, category: "Servicios" },
    { name: "Corte + Barba", price: 180, cost: 0, stock: 9999, category: "Servicios" },
    { name: "Tintura", price: 300, cost: 0, stock: 9999, category: "Servicios" },
    { name: "Pomada", price: 120, cost: 60, stock: 15, category: "Productos" },
    { name: "Aceite Barba", price: 180, cost: 80, stock: 25, category: "Productos" },
    { name: "Shampoo Hombre", price: 150, cost: 75, stock: 20, category: "Productos" },
  ],
  gasolinera: [
    { name: "Magna (Litro)", price: 23.5, cost: 21, stock: 50000, category: "Combustible" },
    { name: "Premium (Litro)", price: 25.8, cost: 22.8, stock: 30000, category: "Combustible" },
    { name: "Diésel (Litro)", price: 24.2, cost: 21.5, stock: 25000, category: "Combustible" },
    { name: "Aceite Mobil 1L", price: 180, cost: 110, stock: 60, category: "Lubricantes" },
    { name: "Coca-Cola 600ml", price: 22, cost: 14, stock: 200, category: "Bebidas" },
    { name: "Sabritas", price: 18, cost: 11, stock: 120, category: "Botanas" },
    { name: "Cigarros Marlboro", price: 90, cost: 72, stock: 60, category: "Cigarros" },
  ],
  ropa: [
    { name: "Vestido Casual M", price: 450, cost: 180, stock: 12, category: "Vestidos" },
    { name: "Vestido Casual L", price: 450, cost: 180, stock: 10, category: "Vestidos" },
    { name: "Vestido Casual S", price: 450, cost: 180, stock: 8, category: "Vestidos" },
    { name: "Blusa Elegante M", price: 380, cost: 150, stock: 15, category: "Blusas" },
    { name: "Pantalón Mezclilla 28", price: 550, cost: 220, stock: 12, category: "Pantalones" },
    { name: "Pantalón Mezclilla 30", price: 550, cost: 220, stock: 14, category: "Pantalones" },
    { name: "Zapatos Tacón #25", price: 890, cost: 380, stock: 6, category: "Calzado" },
    { name: "Bolsa Cuero", price: 1200, cost: 520, stock: 5, category: "Bolsas" },
  ],
  electronica: [
    { name: "iPhone 14 128GB", price: 18999, cost: 15500, stock: 5, category: "Smartphones" },
    { name: "Samsung A54", price: 8499, cost: 6800, stock: 10, category: "Smartphones" },
    { name: "AirPods", price: 3799, cost: 3000, stock: 8, category: "Audio" },
    { name: "TV Samsung 55\"", price: 14999, cost: 12000, stock: 3, category: "Televisores" },
    { name: "Cargador USB-C", price: 299, cost: 180, stock: 40, category: "Accesorios" },
    { name: "Mouse Inalámbrico", price: 450, cost: 250, stock: 30, category: "Periféricos" },
    { name: "Laptop HP 15\"", price: 16999, cost: 13800, stock: 4, category: "Laptops" },
  ],
  fitness: [
    { name: "Membresía Mensual", price: 800, cost: 0, stock: 9999, category: "Membresías" },
    { name: "Membresía Trimestral", price: 2200, cost: 0, stock: 9999, category: "Membresías" },
    { name: "Membresía Anual", price: 7500, cost: 0, stock: 9999, category: "Membresías" },
    { name: "Membresía Semanal", price: 250, cost: 0, stock: 9999, category: "Membresías" },
    { name: "Proteína Whey 2kg", price: 1400, cost: 950, stock: 12, category: "Suplementos" },
    { name: "Creatina 250g", price: 450, cost: 290, stock: 18, category: "Suplementos" },
    { name: "Shaker", price: 250, cost: 140, stock: 25, category: "Accesorios" },
    { name: "Camiseta Gym", price: 350, cost: 180, stock: 18, category: "Accesorios" },
  ],
};

const FIRST_NAMES = ["José","María","Juan","Carlos","Ana","Luis","Patricia","Jorge","Laura","Miguel","Sofía","Fernando","Beatriz","Ricardo","Verónica","Eduardo"];
const LAST_NAMES  = ["García","Hernández","Martínez","López","González","Rodríguez","Pérez","Sánchez","Ramírez","Torres","Flores","Rivera"];

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Always send a unique Idempotency-Key for POST/PATCH (some endpoints require it)
  if (method === "POST" || method === "PATCH") {
    headers["Idempotency-Key"] = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

async function login(email, password) {
  const r = await api("POST", "/api/login", { email, password });
  return r.token || r.access_token;
}

function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function seedTenant(superToken, t) {
  console.log(`\n[${t.vertical}] ${t.name}`);

  // 1. Create tenant via owner endpoint
  let tenantToken;
  try {
    const tenant = await api("POST", "/api/owner/tenants", {
      name: t.name,
      vertical: t.vertical,
      plan: "pro",
      currency: "MXN",
      timezone: "America/Mexico_City",
      owner_email: t.email,
      owner_password: TENANT_PASSWORD,
      owner_name: `Owner ${t.name}`,
    }, superToken);
    console.log(`  ✓ tenant created (id=${tenant.id || tenant.tenant_id || "unknown"})`);
  } catch (e) {
    console.log(`  ⚠ tenant may already exist: ${e.message.slice(0, 100)}`);
  }

  // 2. Login as owner — fall back to superToken if user account doesn't exist
  try {
    tenantToken = await login(t.email, TENANT_PASSWORD);
    console.log(`  ✓ logged in as ${t.email}`);
  } catch (e) {
    console.log(`  ⚠ owner login unavailable (${t.email}); using superToken (data will land in superadmin tenant TNT001)`);
    tenantToken = superToken;
  }

  // 3. Create products — IDEMPOTENT (FIX-G1):
  //    1) GET existing products to skip duplicates by name (case-insensitive)
  //    2) POST only the missing ones
  //    3) Treat HTTP 409/conflict as non-fatal (server-side guard)
  const products = PRODUCT_CATALOGS[t.vertical] || [];
  const productIds = []; // store {id, price, name} for sales
  let created = 0;
  let skipped = 0;

  // Pre-fetch existing for idempotency
  const existingByName = new Map(); // lower(name) → { id, price, name }
  try {
    const list = await api("GET", "/api/products", null, tenantToken);
    const arr = Array.isArray(list) ? list : (list.items || list.data || list.products || []);
    for (const it of arr) {
      if (it && it.name) {
        existingByName.set(String(it.name).trim().toLowerCase(), {
          id: it.id, price: Number(it.price) || 0, name: it.name
        });
      }
    }
  } catch { /* fallback: rely on server uniqueness */ }

  for (const p of products) {
    const k = p.name.trim().toLowerCase();
    if (existingByName.has(k)) {
      const ex = existingByName.get(k);
      if (ex.id) productIds.push({ id: ex.id, price: ex.price || p.price, name: ex.name });
      skipped++;
      continue;
    }
    try {
      const r = await api("POST", "/api/products", p, tenantToken);
      const pid = r.id || r.product?.id || r.data?.id;
      if (pid) productIds.push({ id: pid, price: p.price, name: p.name });
      created++;
    } catch (e) {
      // ON CONFLICT DO NOTHING semantics — 409/duplicate is not fatal
      if (/409|conflict|duplicate|unique/i.test(e.message)) {
        skipped++;
      }
      /* otherwise skip silently */
    }
  }
  console.log(`  ✓ ${created} products created, ${skipped} already existed (${productIds.length} usable IDs)`);

  // 4. Create 20 customers
  let custCreated = 0;
  for (let i = 0; i < 20; i++) {
    const fn = randPick(FIRST_NAMES);
    const ln = randPick(LAST_NAMES);
    try {
      await api("POST", "/api/customers", {
        name: `${fn} ${ln}`,
        phone: "+52" + (5500000000 + Math.floor(Math.random() * 99999999)),
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@email.demo`,
        address: `Calle ${i*7} #${100 + i}, ${t.city}`,
      }, tenantToken);
      custCreated++;
    } catch { /* skip */ }
  }
  console.log(`  ✓ ${custCreated} customers created`);

  // 5. Create 30 sales (using captured product IDs)
  let salesCreated = 0;
  if (productIds.length === 0) {
    console.log(`  ⊘ skipping sales (no product IDs captured)`);
  } else {
    for (let i = 0; i < 30; i++) {
      const p = productIds[Math.floor(Math.random() * productIds.length)];
      const qty = 1 + Math.floor(Math.random() * 3);
      const total = p.price * qty;
      try {
        await api("POST", "/api/sales", {
          total,
          payment_method: randPick(["efectivo","tarjeta","transferencia"]),
          items: [{ product_id: p.id, qty, price: p.price, name: p.name }],
        }, tenantToken);
        salesCreated++;
      } catch (e) {
        if (i === 0) console.log(`  └ first sale error: ${e.message.slice(0, 200)}`);
      }
    }
    console.log(`  ✓ ${salesCreated} sales created`);
  }

  // 6. Optional cuts
  try {
    await api("POST", "/api/cuts/open", { opening_amount: 500 }, tenantToken);
    await api("POST", "/api/cuts/close", { actual_amount: 500 + (salesCreated * 100) }, tenantToken);
    console.log(`  ✓ cash cut open/close demo`);
  } catch { /* ok if endpoint missing */ }
}

async function main() {
  console.log(`Seeding via API: ${API_BASE}`);
  const superToken = await login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
  console.log("✓ superadmin logged in");

  const start = Date.now();
  for (const t of TENANTS) {
    try { await seedTenant(superToken, t); }
    catch (e) { console.log(`  ✗ ${t.vertical}: ${e.message}`); }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`✓ Seed via API complete in ${elapsed}s`);
  console.log(`════════════════════════════════════════════════════════`);
}

main().catch(e => { console.error(e); process.exit(1); });
