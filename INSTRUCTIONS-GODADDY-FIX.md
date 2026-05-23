# ⚠️ INSTRUCCIONES CRÍTICAS: GoDaddy Masked Forwarding

## PROBLEMA
- Entras a `https://negocio.international/`
- GoDaddy te redirige automáticamente a `https://volvix-pos-production.up.railway.app`
- La URL en la barra del navegador cambia a `railway.app`

## CAUSA
GoDaddy está configurado con **Simple Forwarding** en lugar de **Masked Forwarding**. Simple Forwarding hace un HTTP 301 REDIRECT que el navegador respeta y cambia la URL.

## SOLUCIÓN (Opción A - RECOMENDADA)

### Cambiar a Masked Forwarding en GoDaddy

1. **Entra a GoDaddy.com**
2. Ve a **Mis Productos** → **Dominios**
3. Busca y haz clic en **negocio.international**
4. En el panel de control, busca **Forwarding** o **Domain Forwarding**
5. Deberías ver una entrada como:
   ```
   negocio.international → volvix-pos-production.up.railway.app
   ```
6. Haz clic en **Edit** (Editar) o el icono de engranaje
7. Busca la opción:
   - **Simple Forwarding** (actual)
   - Cambia a: **Masked Forwarding** o **Web Forwarding with Cloaking**
8. Asegúrate de que el URL destino sea:
   ```
   https://volvix-pos-production.up.railway.app
   ```
9. **Guarda los cambios**
10. Espera 5-15 minutos a que se propague

### Verificar que funcionó

Después de cambiar a Masked Forwarding:
1. Abre una ventana privada/incógnito en Chrome
2. Entra a `https://negocio.international/`
3. **La URL en la barra debe mantenerse como `negocio.international`**
4. NO debe cambiar a `railway.app`
5. El contenido debe cargar normalmente

---

## SOLUCIÓN (Opción B - ALTERNATIVA)

### Apuntar el dominio directamente a Railway

Si GoDaddy no tiene Masked Forwarding disponible:

1. En GoDaddy, ve a **Dominios** → **negocio.international** → **DNS**
2. Busca los **Nameservers** actuales
3. Opcionalmente, usa los nameservers de Railway (si los proporcionan)
4. O crea un registro **CNAME**:
   - **Nombre**: @ (o negocio.international)
   - **Valor**: volvix-pos-production.up.railway.app
5. En Railway, agreg un **custom domain**: negocio.international
6. Espera propagación de DNS (puede tardar 24 horas)

---

## SOLUCIÓN (Opción C - USAR CLOUDFLARE)

Si quieres un control más fino:

1. Crea una cuenta en **Cloudflare.com**
2. Agrega el sitio: **negocio.international**
3. En GoDaddy, cambia los **Nameservers** a los de Cloudflare
4. En Cloudflare, crea un **CNAME** record:
   - **Nombre**: negocio.international
   - **Destino**: volvix-pos-production.up.railway.app
5. Cloudflare actúa como proxy transparente (URL se mantiene como negocio.international)

---

## ¿Por qué el código no puede resolver esto?

- JavaScript ejecuta **DESPUÉS** de que el navegador ya cambió la URL
- El redirect HTTP 301 ocurre a nivel de DNS/forwarding, **ANTES** de que el servidor responda
- No hay forma técnica de detenerlo desde el servidor si GoDaddy hace Simple Forwarding

```
Timeline:
1. Usuario → negocio.international
2. GoDaddy: HTTP 301 → volvix-pos-production.up.railway.app (ANTES DE TODO)
3. Navegador: URL cambia a railway.app (ANTES DE JAVASCRIPT)
4. Navegador hace request a railway.app
5. JavaScript intenta intervenir... pero ya es muy tarde
```

---

## VERIFICACIÓN FINAL

Una vez que hagas el cambio en GoDaddy:

```bash
# Verificar que negocio.international resuelve correctamente
ping negocio.international

# O en Chrome:
# 1. Abre DevTools (F12)
# 2. Ve a Application → Manifest o Network
# 3. Verifica que TODOS los requests dicen:
#    https://negocio.international/...
#    (NO volvix-pos-production.up.railway.app)
```

---

## SI AÚN NO FUNCIONA

Si después de 30 minutos la URL sigue siendo railway.app:

1. **Limpia el caché** de GoDaddy:
   - A veces GoDaddy cachea el forward antiguo
   - Intenta desactivar el forward, guarda, espera 5 min, vuelve a activar

2. **Limpiar caché del navegador**:
   - Abre DevTools (F12)
   - Settings → Network Conditions → Disable cache
   - Recarga la página

3. **Usa incógnito/private mode**:
   - Abre una ventana privada en Chrome
   - Entra a negocio.international
   - Las ventanas privadas no usan caché

4. **Contacta a Soporte de GoDaddy**:
   - Dile: "Necesito cambiar el Domain Forwarding de Simple a Masked"
   - Ellos lo pueden hacer directamente

---

## RESUMEN

```
ANTES (Simple Forward):
negocio.international → [HTTP 301] → volvix-pos-production.up.railway.app
URL en barra: railway.app ❌

DESPUÉS (Masked Forward):
negocio.international → [Proxy transparente] → volvix-pos-production.up.railway.app
URL en barra: negocio.international ✅
```

---

**Haz el cambio, espera 15 minutos, recarga, ¡y listo!**
