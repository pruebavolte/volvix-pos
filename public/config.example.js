/* ============================================================
   VOLVIX · Config (template público)
   ============================================================
   ESTE archivo (config.example.js) SI va al repo en GitHub.
   Sirve como plantilla — NO contiene credenciales reales.

   PARA QUE EL POS FUNCIONE:
   1. Copia este archivo como `config.js` en la misma carpeta:
      cp public/config.example.js public/config.js
   2. Edita `public/config.js` y pon tus credenciales reales
   3. Asegurate que `.gitignore` incluya `public/config.js`
      (NUNCA debe subirse al repo)

   El POS busca window.SUPABASE_URL y window.SUPABASE_ANON_KEY
   al cargar. Si no estan definidas, opera en modo offline puro
   (todo en localStorage, sin sync con servidor).
   ============================================================ */

(function () {
  'use strict';

  // ========================================================
  // SUPABASE (credenciales de tu proyecto)
  // ========================================================
  window.SUPABASE_URL      = 'https://TU-PROYECTO.supabase.co';
  window.SUPABASE_ANON_KEY = 'TU_ANON_KEY_AQUI';

  // ========================================================
  // BACKEND API
  // ========================================================
  // URL del server.js (donde corre la API REST + WebSocket).
  // Dejalo vacio para autodeteccion (mismo origen que la pagina).
  // Solo cambialo si tu API esta en otro dominio.
  //
  // Ejemplos:
  //   ''                              → autodetect (recomendado)
  //   'http://localhost:3000'         → dev local en otro puerto
  //   'https://api.volvix.com'        → API en subdominio aparte
  window.VOLVIX_API_URL = '';

  // ========================================================
  // TENANT POR DEFECTO (solo para desarrollo / demos)
  // ========================================================
  // En produccion el tenant_id viene de la sesion del usuario
  // logueado. Esto es solo fallback para abrir el POS sin login
  // durante desarrollo.
  // En produccion DEBE ser null.
  window.VOLVIX_DEFAULT_TENANT = null;

  // ========================================================
  // BRANDING
  // ========================================================
  // Para marca blanca: el revendedor cambia esto y queda como
  // su propio sistema. No toca el resto del codigo.
  window.VOLVIX_BRAND = {
    name:        'Volvix',
    productName: 'Volvix POS',
    version:     '7.0.0',
    company:     'GrupoVolvix S.A. de C.V.',
    year:         2026,
    accentColor: '#FBBF24',
    logoEmoji:   '🧠',
  };

  // ========================================================
  // FEATURE FLAGS
  // ========================================================
  window.VOLVIX_FLAGS = {
    realtimeSync:  true,
    offlineQueue:  true,
    aiEngine:      true,
    aiSupport:     true,
    remoteControl: true,
    debugMode:     false,
    serviceWorker: true,
  };

  // ========================================================
  // REGION
  // ========================================================
  window.VOLVIX_REGION = {
    timezone: 'America/Monterrey',
    locale:   'es-MX',
    currency: 'MXN',
    taxRate:  0.16,
  };

})();
