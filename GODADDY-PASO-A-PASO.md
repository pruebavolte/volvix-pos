# GoDaddy - Paso a Paso EXACTO

## ABRE ESTO EN OTRA PESTAÑA Y SIGUE CADA PASO

### Paso 1: Entra a GoDaddy
- Abre: https://godaddy.com
- Haz login si no estás adentro
- (Si no tienes cuenta, crea una)

### Paso 2: Ve a Mis Productos
- Arriba a la izquierda, haz clic en **☰ (menú)**
- O busca **"Mis Productos"**
- Verás una lista de dominios

### Paso 3: Selecciona negocio.international
- Busca en la lista: **negocio.international**
- Haz clic sobre el dominio (o el botón junto a él)

### Paso 4: Ve a DNS
- Verás un panel de control del dominio
- Busca la sección **DNS** o **Administrar DNS**
- Haz clic en **"Administrar"** o **"DNS"**

### Paso 5: Busca el Registro A
Deberías ver una tabla con registros. Busca:
```
Nombre: @
Tipo: A
Valor: [algún número]
```

O puede ser CNAME:
```
Nombre: @
Tipo: CNAME
Valor: [algo.something]
```

### Paso 6: Edita el Registro

**SI ES TIPO A:**
1. Haz clic en **Edit** (lápiz)
2. Cambia el Valor a: **66.33.22.215**
3. Haz clic en **Guardar** o **Save**

**SI ES TIPO CNAME:**
1. Haz clic en **Edit**
2. Cambia el Valor a: **volvix-pos-production.up.railway.app**
3. Guarda

### Paso 7: Confirma el Cambio
- Deberías ver un mensaje de "guardado" o "saved"
- El registro debe mostrar el nuevo valor

### Paso 8: Espera Propagación
- **Espera 5-15 minutos**
- Los cambios de DNS toman tiempo en propagarse
- Puedes ir a otra cosa mientras esperas

### Paso 9: Verifica en Chrome
- Abre Chrome
- Entra a: https://negocio.international/
- La URL debe mantenerse como **negocio.international**
- (NO debe cambiar a volvix-pos-production.up.railway.app)

### Si la URL Sigue Siendo railway.app:
1. Limpia caché: `Ctrl+Shift+Delete`
2. Abre una ventana **Incógnito** (Ctrl+Shift+N)
3. Entra a negocio.international desde la ventana incógnito
4. Si funciona en incógnito = es solo caché
5. Espera más tiempo (hasta 30 min) para propagación

---

## VERIFICAR DESDE TERMINAL (Opcional)

Si tienes terminal/cmd:
```bash
nslookup negocio.international
# Debe mostrar: 66.33.22.215
```

O con ping:
```bash
ping negocio.international
# Debe mostrar IP 66.33.22.215
```

---

## LISTO! ✅
Una vez que DNS apunte a Railway:
- ✅ URL permanece como negocio.international
- ✅ Sin ver railway.app nunca
- ✅ Botones, login, todo funciona
- ✅ Landing page visible desde negocio.international
