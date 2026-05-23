# Solución: GoDaddy Forward — Cambiar a Masked Forwarding

## El Problema
Cuando entras a `https://negocio.international/`, GoDaddy hace un **Simple Forward** (redirect HTTP 301/302) a `volvix-pos-production.up.railway.app`. El navegador SIEMPRE mostrará `railway.app` en la barra de direcciones.

Esto ocurre ANTES de que JavaScript se ejecute. No hay forma de ocultarlo solo con código.

## La Solución: Masked Forwarding en GoDaddy

### Opción A: Web Forwarding con Cloaking (RECOMENDADO)

1. Ve a **godaddy.com** y entra en tu cuenta
2. Selecciona **Domains** → busca y haz clic en **negocio.international**
3. Ve a **Forwarding** (o **Domain Forwarding**)
4. Busca la entrada para negocio.international
5. Haz clic en **Edit** o el icono de settings
6. Cambia:
   - **De:** "Simple Forwarding"
   - **A:** "Masked Forwarding" (o "Web Forwarding with Cloaking")
7. En el campo de destino, pon: `https://volvix-pos-production.up.railway.app`
8. Guarda los cambios

Con Masked Forwarding:
- La URL en la barra seguirá siendo `negocio.international`
- El contenido vendrá de Railway
- Es un proxy transparente

### Opción B: Nameservers de Railway (ALTERNATIVA)

Si quieres usar directamente los nameservers de Railway:

1. En GoDaddy, ve a **Domains → negocio.international → DNS**
2. Reemplaza los nameservers con los de Railway (si están disponibles)
3. O añade un registro **CNAME** o **A** que apunte a Railway

### Opción C: Reverse Proxy con Cloudflare (AVANZADO)

1. Ve a **cloudflare.com** y crea una cuenta
2. Añade negocio.international como sitio
3. Apunta los nameservers de negocio.international (en GoDaddy) a los de Cloudflare
4. En Cloudflare, crea un CNAME que apunte a volvix-pos-production.up.railway.app
5. Cloudflare actúa como proxy transparente

## Por qué no funciona el código solo

El `hide-railway.js` y el reverse proxy en `railway-server.js` NO pueden detener un redirect HTTP 301/302 que ocurre a nivel de DNS/forwarding. Estos se ejecutan ANTES de que el navegador cargue JavaScript.

```
1. Usuario entra a negocio.international
2. GoDaddy responde con HTTP 301 → volvix-pos-production.up.railway.app (ANTES DE JS)
3. Navegador sigue el redirect (JS aún no ejecutó)
4. Ahora estamos en railway.app, la URL ya cambió
```

## Próximos pasos

1. **Cambia GoDaddy a Masked Forwarding** (opción recomendada)
2. Espera 5-15 minutos a que se propague
3. Navega a negocio.international y verifica que la URL se mantenga
4. Los cambios de código (`hide-railway.js`, `railway-server.js`) quedarán como fallback para casos especiales

---

Si necesitas ayuda con GoDaddy o Cloudflare, pide.
