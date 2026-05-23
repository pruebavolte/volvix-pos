# HANDOFF: Fix Railway Domain — negocio.international sin railway.app

## Estado Actual
✅ Código actualizado  
❌ GoDaddy requiere cambio manual  
⏳ Esperando verificación en producción

## Lo que hice

### 1. Mejoré `hide-railway.js`
- Intercepta fetch() y XMLHttpRequest
- Reescriba URLs internas si viene de railway.app
- Más agresivo con cookie redirect (600s timeout)

### 2. Mejoré `railway-server.js`
- Lee header Host de requests
- Estructura lista para reescribir HTML responses
- Prepara para reverse proxy transparente

### 3. Commit & Push
```
git commit -m "Mejorar hide-railway.js y railway-server.js..."
git push origin main
```

## El Problema Real
**GoDaddy está haciendo Simple Forward (HTTP 301 redirect), no Masked Forward.**

```
negocio.international → HTTP 301 → volvix-pos-production.up.railway.app
                      (ANTES de cargar JS)
```

JavaScript NO puede detener un redirect HTTP que ocurre en el nivel de DNS/forwarding.

## Lo que el Usuario DEBE Hacer

### En GoDaddy:
1. **Dominios → negocio.international → Forwarding**
2. **Cambiar de "Simple Forwarding" a "Masked Forwarding"**
   - Esto es un proxy transparente
   - La URL se mantendrá como negocio.international
   - El contenido viene de Railway

O usar Nameservers/CNAME (ver `SOLUTION-GODADDY.md`)

## Verificación
Cuando el usuario haga el cambio en GoDaddy:
```
https://negocio.international/ → URL se mantiene (no redirige)
                                 Contenido carga correctamente
```

## Archivos Modificados
- `public/hide-railway.js` — mejorado
- `railway-server.js` — mejorado con host detection
- `SOLUTION-GODADDY.md` — instrucciones para usuario
- Este archivo

## Próximos Pasos del Usuario
1. Cambiar GoDaddy a Masked Forwarding
2. Esperar 5-15 min a que se propague
3. Verificar negocio.international en Chrome
4. Reportar si funciona

## Si Algo Falla
- Si aún muestra railway.app: problema en GoDaddy, no en código
- Si funciona: GoDaddy está bien configurado, el código ayuda con fallback
