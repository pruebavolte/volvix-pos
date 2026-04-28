# Helpdesk Setup - Volvix POS

Esta guia describe como configurar el centro de soporte (chat live + KB + bug reports) que se inyecta via `volvix-helpdesk-wiring.js` en todos los paneles owner/cashier.

## Arquitectura

```
[ Usuario en panel owner/cashier ]
            |
            v
[ Boton "?" esquina inferior derecha ]
            |
            +-- Buscar KB --> GET /api/kb/search?q=... --> pos_kb_articles (Supabase)
            +-- Hablar con soporte --> Crisp (preferido) -> Plain (fallback) -> SendEmail
            +-- Reportar bug --> POST /api/feedback --> pos_user_feedback + Storage
```

Auto-routing implementado en `openSupport()`:
1. Si `crispWebsiteId` configurado -> Crisp.
2. Si no, si `plainAppId` configurado -> Plain.
3. Si no, fallback a formulario interno + email.

## 1) Crisp (recomendado, free tier 2 agentes / 1000 conversaciones mes)

### Crear cuenta

1. Ve a `https://crisp.chat/en/`.
2. Sign up con tu correo de soporte (ej. `soporte@volvix.app`).
3. Crea **Workspace** llamado "Volvix POS".
4. En **Website Settings > Setup Instructions** copia tu **Website ID** (formato UUID).

### Configurar en Volvix

Opcion A - via tag en `<body>`:
```html
<body data-helpdesk-auto data-helpdesk-crisp="TU_WEBSITE_ID_AQUI" data-helpdesk-role="owner">
```

Opcion B - via init manual:
```html
<script src="./volvix-helpdesk-wiring.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', function () {
    window.VolvixHelpdesk.init({
      lang: 'es',
      crispWebsiteId: 'TU_WEBSITE_ID_AQUI',
      userRole: 'owner',
      preloadCrisp: true
    });
  });
</script>
```

### Customizar Crisp

- **Apariencia**: en Crisp dashboard, **Settings > Chatbox > Appearance** cambia color a #7c3aed.
- **Horario**: **Operating hours** define cuando aparece "online" vs "offline".
- **Auto-responder fuera de hora**: "Gracias, te contestamos en menos de 24 horas (4 si Plan Pro)".
- **Triggers**: dispara mensaje si usuario lleva 30s en pagina de cobro: "Tienes problemas con un cobro? Estoy aqui para ayudarte".

### Routing por plan

Configura segmentos en Crisp basados en `userRole` y `plan` (los pasas con `$crisp.push(['set', 'session:data', [...]])`):

```js
window.$crisp = window.$crisp || [];
$crisp.push(['set', 'session:data', [
  ['plan', userPlan],
  ['role', userRole],
  ['business', businessName]
]]);
```

Asi un agente ve directo si es Pro / Enterprise.

## 2) Plain (alternativa B2B-focused)

Mejor para tickets formales en lugar de chat live. Free tier 100 tickets/mes.

### Setup

1. Sign up en `https://plain.com`.
2. Crea **Workspace** y obten `appId`.
3. Configura:
```js
window.VolvixHelpdesk.init({
  lang: 'es',
  plainAppId: 'TU_APP_ID',
  userRole: 'owner'
});
```

Plain tiene SDK propio que el wiring carga si esta `window.Plain` disponible.

## 3) Help Scout (alternativa C, segunda opcion mas usada)

Solo si Crisp/Plain no encajan:
1. Sign up en `https://www.helpscout.com`.
2. Activar **Beacon** widget.
3. Copia codigo Beacon y agregalo manualmente despues del script de helpdesk.

## 4) Fallback (sin chat live - solo email)

Si no quieres tercer proveedor:
- El formulario interno envia POST a `/api/feedback`.
- Backend llama `/api/messaging/send` (modulo R12-O-3-A).
- Llega correo a `soporte@volvix.app`.
- Responder via correo desde tu inbox.

## Variables de entorno recomendadas

```bash
# .env (servidor)
HELPDESK_PROVIDER=crisp        # crisp | plain | helpscout | email
CRISP_WEBSITE_ID=xxx-xxx
PLAIN_APP_ID=xxx
SUPPORT_EMAIL=soporte@volvix.app
SUPPORT_SLA_HOURS_FREE=48
SUPPORT_SLA_HOURS_PRO=24
SUPPORT_SLA_HOURS_ENTERPRISE=1
```

Frontend lee estas variables via endpoint `/api/config/public` (solo las que son safe-to-expose).

## Knowledge Base

Los 10 articulos en `kb/*.md` se indexan en `pos_kb_articles` via build script:

```bash
npm run kb:index
```

Este script (futuro round) parsea cada MD, extrae frontmatter, y hace UPSERT a la tabla. Endpoint `GET /api/kb/search?q=cobrar` corre similarity search con `pg_trgm`.

## Bug reports

POST a `/api/feedback` guarda:
- `type`: bug / idea / question
- `message`: texto del usuario
- `page_url`: ruta donde reporto
- `screenshot_b64`: opcional, se sube a Supabase Storage bucket `feedback-screenshots`

Notificacion al admin via `/api/messaging/send` con template `feedback-received`.

## Verificacion

Despues de integrar:
1. Abre cualquier panel owner.
2. Boton `?` debe aparecer abajo a la derecha con animacion pulse.
3. Click -> panel se abre.
4. Buscar "cobrar" -> debe traer resultados.
5. Click "Hablar con soporte" -> abre Crisp (o fallback).
6. Click "Reportar bug" -> formulario, llenar, submit -> toast "Gracias".

Checklist final:
- [ ] No aparece en landings publicas.
- [ ] Aparece en owner/cashier panels.
- [ ] i18n ES/EN funciona.
- [ ] Si cae backend, fallback offline funciona.
- [ ] Screenshots no exceden 5MB.
- [ ] Sin errores en consola.
