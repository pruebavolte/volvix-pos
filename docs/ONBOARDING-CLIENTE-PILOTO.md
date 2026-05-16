# Onboarding de cliente piloto — Paso a paso

> Esta guía es lo que el owner (GrupoVolvix) ejecuta para dar de alta cada cliente piloto nuevo. Es lo bastante detallado para que cualquier persona con acceso al panel super-admin pueda seguirlo sin contexto previo.

## Antes de empezar

Necesitas:
- Acceso al panel super-admin (`https://systeminternational.app/paneldecontrol.html`)
- Email + WhatsApp del cliente piloto
- Saber el giro de su negocio
- 30 min agendados con el cliente para la videollamada

## Paso 1 — Crear el tenant en el panel super-admin

1. Login al panel con tu cuenta super-admin (`grupovolvix@gmail.com`)
2. Ve al tab **Tenants** (en panel)
3. Click **Crear nuevo tenant**
4. Llena:
   - **Nombre del negocio**: el que te dio el cliente
   - **Email del dueño**: el del cliente
   - **Giro**: selecciona del dropdown el más cercano (cafetería, abarrotes, taquería, salón, ferretería, etc.)
   - **Plan**: selecciona "Pro" (90 días gratis del plan Pro es el estándar del piloto)
   - **¿Es piloto?**: marca el checkbox `is_pilot`
   - **Sucursales iniciales**: 1 (después se agregan más si necesita)
5. Click **Crear**
6. El sistema genera:
   - `tenant_id` (formato `TNT-XXXXX`)
   - `volvix_token` inicial para el dueño (NO lo compartas en chat público — solo por WhatsApp directo)
   - URL personalizada para que el dueño entre

**Si el panel no tiene aún el tab Pilotos** (planeado en R38): crea el tenant en pos_tenants vía SQL directo:
```sql
INSERT INTO pos_tenants (tenant_id, name, owner_email, giro, plan, is_pilot, pilot_started_at)
VALUES ('TNT-PILOT-X', 'Nombre Negocio', 'cliente@email.com', 'cafeteria', 'pro', true, now());
```

## Paso 2 — Asignar el giro correcto

1. En el tenant recién creado, ve al tab **Configuración → Giro**
2. Verifica que el giro coincida con lo que vende el cliente
3. Si el catálogo pre-cargado tiene productos que no aplican: déjalos por ahora, el cliente puede ocultarlos después
4. Si faltan productos que el cliente vende muy seguido: anótalos en tu lista de follow-up para agregarlos manualmente en el catálogo del cliente durante la videollamada

## Paso 3 — Activar módulos del plan Pro

Por default, el plan Pro tiene activos:
- ✅ POS principal
- ✅ Inventario
- ✅ Clientes
- ✅ Reportes básicos
- ✅ Corte de caja
- ✅ Multi-sucursal (capacidad)
- ✅ Permisos diferenciados de cajeros

Módulos opcionales (decidir caso por caso):
- ⚪ Comandas a impresora térmica (activar solo si tiene cocina/taquería)
- ⚪ Báscula con producto por peso (activar solo si vende a granel)
- ⚪ Promociones automáticas (activar si quiere ofertas 2x1, descuentos por cantidad)
- ⚪ Programa de puntos / monedero electrónico (activar si quiere fidelización)

Para activar/desactivar: tab **Módulos del tenant** → toggle. Cambios aplican en <5 segundos al POS del cliente (polling `/api/app/config`).

## Paso 4 — Configurar IVA si tiene tasa especial

Default: IVA 16% post-descuento (estándar nacional).

Casos especiales:
- **Zona Frontera Norte**: 8% IVA → tab Configuración → IVA → seleccionar "Frontera 8%"
- **Productos exentos (alimentos básicos)**: configurar producto por producto con `tax_rate=0`
- **IEPS opcional (alcohol, tabaco, bebidas azucaradas)**: activar IEPS por producto

Si el cliente no sabe: déjalo en 16% nacional y que lo ajuste con su contador después.

## Paso 5 — Dar credenciales al cliente

1. Genera contraseña inicial fuerte (sugerencia: usa `1Password` o `pwgen`)
2. Manda al cliente por WhatsApp (NO email — más seguro contra phishing):
   ```
   Tus credenciales para SalvadoreX POS:

   URL panel dueño:  https://systeminternational.app/volvix_owner_panel_v7.html
   URL POS cajero:   https://systeminternational.app/salvadorex-pos.html

   Email:      cliente@email.com  (el que me diste)
   Password:   [pegar password generada]

   Por favor cambia la contraseña en tu primer login (panel → seguridad → cambiar password).

   Cualquier duda: este WhatsApp.
   ```
3. El cliente entra y cambia la contraseña

## Paso 6 — Verificar acceso del cliente al POS

Durante la videollamada de setup:
1. Pídele al cliente que abra `/salvadorex-pos.html` en su navegador
2. Que haga login con sus credenciales
3. Que cree 1 venta de prueba con 1–2 productos del catálogo pre-cargado
4. Que genere ticket
5. Que vea el corte de caja
6. Que vuelva al panel y vea su venta registrada

Si algo falla en este paso: NO pases al siguiente. Debug junto con el cliente. Los problemas más comunes:
- **POS no carga catálogo**: tenant sin provisionar — re-asignar giro en el panel
- **Login falla**: password mal escrita → reset
- **Ticket no imprime**: configuración impresora — pasar a paso 7

## Paso 7 — Subir logo y branding (opcional, si tiene)

Pide al cliente:
- Logo en PNG transparente 256x256px o más
- Color primario de su marca (hex)

Tu trabajo en el panel:
1. Tab **Branding del tenant**
2. Sube el logo
3. Configura color primario (afecta encabezado del POS y el ticket)
4. Configura nombre comercial y dirección que aparecen en el ticket
5. Si quiere RFC para tickets: agregar (no es CFDI, solo para que el ticket lo muestre como referencia)

## Paso 8 — Configurar folio inicial si quiere continuar numeración

Si el cliente venía de otro POS y quiere continuar numeración:
1. Pregúntale: "¿En qué folio quedó tu sistema anterior?"
2. En el panel: tab **Folios** → **Folio inicial POS**
3. Setealo al siguiente (si quedó en 1234, pones 1235)
4. El próximo ticket que cobre el cajero arranca con ese número

Si es cliente nuevo sin historial: déjalo en 1 (default).

## Paso 9 — Activar 2FA en el panel admin del cliente (opcional)

Recomendado pero opcional para el piloto. Aplica solo al rol "owner" (no al cajero).

1. El cliente entra a su panel dueño → tab Seguridad
2. Click **Activar 2FA**
3. Escanea el QR con Google Authenticator / Authy / 1Password
4. Ingresa el primer código TOTP para confirmar
5. **Guarda los 10 códigos de recuperación** que aparecen — esto es crítico, si pierde el teléfono solo recupera con estos códigos

## Paso 10 — Checklist de verificación post-onboarding

Antes de decirle al cliente "tu sistema está listo, úsalo", verificar:

- [ ] Cliente puede entrar al POS sin error 401/403
- [ ] Cliente puede crear venta de prueba que aparece en sus reportes
- [ ] Stock se decrementa correctamente al vender
- [ ] Ticket se imprime/visualiza con su branding (si lo subió)
- [ ] Corte de caja muestra los movimientos correctamente
- [ ] Cliente puede ver dashboard en panel dueño con KPIs reales
- [ ] Cliente puede cambiar password (probó ya)
- [ ] Cliente tiene tu WhatsApp para soporte y sabe que respondes en <4hrs
- [ ] Cliente firmó (vía respuesta "acepto") el acuerdo de piloto del `06-acuerdo-piloto.md`
- [ ] Has agendado el primer follow-up de feedback (en 2 semanas)

Si los 10 están ✅: cliente listo. Manda mensaje WhatsApp de confirmación con un mini-recap de lo configurado.

Si algo falta: completa antes de cerrar la videollamada.

## Post-onboarding — Los siguientes 90 días

**Semana 1**: ping de check-in al cliente vía WhatsApp ("¿Cómo va? ¿Algún detalle?")

**Semana 2**: videollamada formal de feedback (30 min)

**Semana 4, 6, 8, 10, 12**: misma cadencia (cada 2 semanas)

**Día 75 (15 días antes del fin)**: pregunta directa "¿Te interesa continuar? ¿Plan Básico, Pro, o Enterprise?"

**Día 90**: cierre del piloto. Si continúa, pasa a plan pagado con 50% descuento 6 meses. Si no, exportar sus datos y cerrar tenant.
