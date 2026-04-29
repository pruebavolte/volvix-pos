<<<<<<< HEAD
/**
 * AUTH-GATE · Validación de sesión para páginas protegidas
 * Debe incluirse en el <head> ANTES de cualquier otro script
 * <script src="/auth-gate.js"></script>
 */

(function() {
  'use strict';

  // Páginas que NO requieren autenticación
  const PUBLIC_PAGES = [
    '/index.html',
    '/login.html',
    '/landing_dynamic.html',
    '/marketplace.html',
    '/salvadorex_web_v25.html',
  ];

  const pathname = window.location.pathname;

  // Verificar si la página actual es pública
  const isPublic = PUBLIC_PAGES.some(p => pathname === p || pathname.endsWith(p));
  if (isPublic) return;

  // Validar sesión vía JWT helper (preferido) con fallback a chequeo legacy
  let isValid = false;
  let hadAnySession = false;

  if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.isLoggedIn === 'function') {
    hadAnySession = !!window.Volvix.auth.getToken();
    isValid = window.Volvix.auth.isLoggedIn();
  } else {
    // R28 fix: validar también JWT volvix_token (key que usa login.html)
    // junto con el legacy volvixSession. Cualquiera de las dos válida cuenta.
    try {
      const jwt = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
      if (jwt) {
        hadAnySession = true;
        const parts = jwt.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp && payload.exp * 1000 > Date.now()) {
            isValid = true;
          }
        }
      }
    } catch (e) {
      console.warn('[auth-gate] JWT parse fail:', e);
    }
    if (!isValid) {
      // Fallback legacy adicional
      let session = null;
      try {
        const stored = localStorage.getItem('volvixSession');
        if (stored) session = JSON.parse(stored);
      } catch (e) {
        console.warn('[auth-gate] Error parsing session:', e);
      }
      if (session) hadAnySession = true;
      if (session && session.user_id && session.expires_at > Date.now()) isValid = true;
    }
  }

  if (!isValid) {
    // Sesión no válida - redirigir a login
    const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
    const expired = hadAnySession ? 1 : 0;
    window.location.replace(`/login.html?expired=${expired}&redirect=${redirectUrl}`);
  }
})();
=======
/* ============================================================
   VOLVIX · Auth Gate
   ============================================================
   Se inyecta en TODOS los HTMLs protegidos como PRIMER script.
   Antes de que el navegador pinte nada, verifica sesión y rol.
   Si algo falla → redirige a login.html instantáneamente.

   Uso (primer elemento del <head>, antes de todo lo demás):
     <script src="/auth-gate.js" data-roles="owner,cajero"></script>

   Atributo data-roles (opcional):
     - Roles permitidos separados por coma
     - Si se omite, solo verifica que haya sesión válida (cualquier rol)
     - Roles válidos: superadmin | owner | cajero | soporte

   Qué verifica:
     1. Que exista sesión en localStorage (volvix:session)
     2. Que la sesión no haya expirado (expires_at)
     3. Que el rol del usuario esté en data-roles
     4. (Opcional) Que el token de Supabase siga vigente

   Qué expone (si la verificación pasa):
     window.VOLVIX_USER = { user_id, email, role, tenant_id,
                            tenant_name, access_token, expires_at }

   Redirecciones:
     Sin sesión        → /login.html?redirect=<url_actual>
     Sesión expirada   → /login.html?expired=1&redirect=<url_actual>
     Rol no permitido  → /login.html?forbidden=1
     Error de parseo   → /login.html?error=1
============================================================ */
(function () {
  'use strict';

  // =========================================================
  // LEER CONFIGURACIÓN DEL SCRIPT TAG
  // =========================================================
  // Busca el <script src="/auth-gate.js"> en el DOM para leer
  // su atributo data-roles. Funciona aunque el script sea diferido.
  function getScriptConfig() {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      const src = s.getAttribute('src') || '';
      if (src.includes('auth-gate')) {
        const roles = s.getAttribute('data-roles') || '';
        return {
          allowedRoles: roles
            ? roles.split(',').map(r => r.trim().toLowerCase()).filter(Boolean)
            : null,
          // null = cualquier rol autenticado
        };
      }
    }
    return { allowedRoles: null };
  }

  // =========================================================
  // HELPERS
  // =========================================================
  function redirect(path) {
    // Usar replace para que el botón "atrás" no vuelva a la página
    // protegida sin sesión
    location.replace(path);
  }

  function buildLoginUrl(reason) {
    const params = new URLSearchParams();
    if (reason) params.set(reason, '1');
    const current = location.pathname + location.search;
    if (current && current !== '/login.html') {
      params.set('redirect', current);
    }
    return '/login.html?' + params.toString();
  }

  function clearSession() {
    try { localStorage.removeItem('volvix:session'); } catch {}
  }

  // =========================================================
  // VERIFICACIÓN PRINCIPAL (síncrona)
  // Se ejecuta ANTES de que el navegador pinte cualquier cosa.
  // =========================================================
  function verify() {
    // ── 1. Leer sesión ──
    let session = null;
    try {
      const raw = localStorage.getItem('volvix:session');
      if (!raw) {
        redirect(buildLoginUrl(null));
        return;
      }
      session = JSON.parse(raw);
    } catch {
      clearSession();
      redirect(buildLoginUrl('error'));
      return;
    }

    // ── 2. Verificar que tenga los campos mínimos ──
    if (!session || typeof session !== 'object' || !session.user_id || !session.role) {
      clearSession();
      redirect(buildLoginUrl('error'));
      return;
    }

    // ── 3. Verificar expiración ──
    if (session.expires_at && session.expires_at < Date.now()) {
      clearSession();
      redirect(buildLoginUrl('expired'));
      return;
    }

    // ── 4. Verificar rol ──
    const { allowedRoles } = getScriptConfig();
    const userRole = (session.role || '').toLowerCase();
    const validRoles = ['superadmin', 'owner', 'cajero', 'soporte'];

    if (!validRoles.includes(userRole)) {
      // Rol desconocido / corrompido
      clearSession();
      redirect(buildLoginUrl('error'));
      return;
    }

    if (allowedRoles && allowedRoles.length > 0) {
      // superadmin siempre puede entrar a cualquier página
      if (userRole !== 'superadmin' && !allowedRoles.includes(userRole)) {
        redirect(buildLoginUrl('forbidden'));
        return;
      }
    }

    // ── 5. Sesión válida → publicar en window ──
    window.VOLVIX_USER = {
      user_id:     session.user_id,
      email:       session.email || '',
      role:        session.role,
      tenant_id:   session.tenant_id || null,
      tenant_name: session.tenant_name || '',
      access_token: session.access_token || '',
      expires_at:  session.expires_at || null,
      plan:        session.plan || 'basico',
    };

    // Exponer también por la ruta estándar de volvix
    // (por si volvix-api.js aún no cargó)
    window.VOLVIX_DEFAULT_TENANT = session.tenant_id || null;
  }

  // =========================================================
  // REFRESCO SILENCIOSO DE SESIÓN (en background)
  // Cuando quedan menos de 10 minutos para que expire,
  // intenta renovar el token de Supabase sin molestar al usuario.
  // =========================================================
  function scheduleRefresh() {
    const session = window.VOLVIX_USER;
    if (!session || !session.expires_at || !session.access_token) return;

    const msLeft = session.expires_at - Date.now();
    const refreshAt = Math.max(0, msLeft - 10 * 60 * 1000); // 10 min antes

    setTimeout(async () => {
      await silentRefresh();
    }, refreshAt);
  }

  async function silentRefresh() {
    // Solo si Supabase está disponible
    if (!window.supabase && !window.SUPABASE_URL) return;

    try {
      let client = window._supabaseClient;
      if (!client && window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        window._supabaseClient = client;
      }
      if (!client) return;

      const { data, error } = await client.auth.refreshSession();
      if (error || !data?.session) {
        // No se pudo renovar → cerrar sesión limpiamente
        clearSession();
        redirect(buildLoginUrl('expired'));
        return;
      }

      // Guardar sesión renovada manteniendo los campos de Volvix
      const current = window.VOLVIX_USER || {};
      const updated = {
        ...current,
        access_token: data.session.access_token,
        expires_at: data.session.expires_at
          ? new Date(data.session.expires_at).getTime()
          : (Date.now() + 3600 * 1000),
      };
      try {
        const stored = JSON.parse(localStorage.getItem('volvix:session') || '{}');
        localStorage.setItem('volvix:session', JSON.stringify({ ...stored, ...updated }));
      } catch {}

      window.VOLVIX_USER = updated;

      // Programar el siguiente refresco
      scheduleRefresh();
    } catch (e) {
      console.warn('[auth-gate] silentRefresh falló:', e.message);
    }
  }

  // =========================================================
  // HOOK PARA VOLVIX-API (manejo de 401)
  // Si la API devuelve 401, redirigir a login
  // =========================================================
  window.VOLVIX_ON_AUTH_FAIL = function () {
    clearSession();
    redirect(buildLoginUrl('expired'));
  };

  // =========================================================
  // LOGOUT GLOBAL
  // Llamar desde cualquier HTML: window.volvixLogout()
  // =========================================================
  window.volvixLogout = async function (opts) {
    const options = opts || {};

    // Verificar pendientes
    const pending = window.volvix?.sync?.pendingCount?.() || 0;
    if (pending > 0 && !options.force) {
      const ok = confirm(
        `Tienes ${pending} venta(s) sin sincronizar con el servidor.\n\n` +
        `Si cierras sesión ahora, se sincronizarán la próxima vez que entres.\n\n` +
        `¿Cerrar sesión de todos modos?`
      );
      if (!ok) return;
    }

    // Cerrar sesión en Supabase si está disponible
    try {
      const client = window._supabaseClient;
      if (client) await client.auth.signOut();
    } catch {}

    // Limpiar sesión local
    clearSession();
    window.VOLVIX_USER = null;

    // Redirigir
    const loginUrl = '/login.html' + (options.reason ? '?reason=' + options.reason : '');
    redirect(loginUrl);
  };

  // =========================================================
  // EJECUTAR VERIFICACIÓN
  // =========================================================
  verify();
  scheduleRefresh();

  // =========================================================
  // LOG DE CONFIRMACIÓN (visible solo si debug activo)
  // =========================================================
  if (window.VOLVIX_FLAGS?.debugMode) {
    console.log(
      '%c AUTH-GATE %c OK — usuario: %s · rol: %s · tenant: %s',
      'background:#22C55E;color:#000;font-weight:700;padding:2px 6px;border-radius:4px',
      'color:#666',
      window.VOLVIX_USER?.email || '?',
      window.VOLVIX_USER?.role || '?',
      window.VOLVIX_USER?.tenant_name || window.VOLVIX_USER?.tenant_id || 'sin tenant'
    );
  }
})();
>>>>>>> origin/master
