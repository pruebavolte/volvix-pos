---
slug: contrasena-olvidada
title_es: Recuperar contrasena olvidada
title_en: Recover forgotten password
category: cuenta
tags: [password, recuperacion, login]
updated: 2026-04-28
---

# Recuperar contrasena olvidada

Si no recuerdas tu contrasena, sigue estos pasos para recuperar acceso.

## Para owners

1. En la pagina de login (`https://volvix.app/login`), click **Olvide mi contrasena**.
2. Captura tu correo registrado.
3. Recibiras email con enlace (revisa spam si no llega en 2 min).
4. Click el enlace (vigente 60 minutos).
5. Captura nueva contrasena (8+ caracteres, 1 numero, 1 mayuscula).
6. Confirma. Iniciaras sesion automaticamente.

## Para cajeros

Los cajeros no tienen correo registrado obligatorio. Se les recupera asi:

1. Pide al **owner** que entre a **Equipo > [tu cajero]**.
2. Click **Resetear PIN**.
3. Captura PIN nuevo (4 digitos).
4. Comparte el PIN al cajero.

Si el cajero **si tiene correo registrado**, puede usar el flujo "Olvide mi contrasena" desde su pantalla de login.

## No me llega el correo de recuperacion

Verifica:
1. **Bandeja de spam / promociones**.
2. El correo correcto (a veces tienes 2 cuentas).
3. Que tu dominio no bloquee `noreply@volvix.app` (whitelistear).
4. Que la cuenta no este suspendida (te llega aviso si es asi).

Si nada de esto funciona, contacta soporte con:
- Correo registrado
- Ultima fecha que recuerdas accediste
- RFC o nombre de tu negocio (para validar identidad)

## Cambiar contrasena (sin haberla olvidado)

1. **Mi cuenta > Seguridad > Cambiar contrasena**.
2. Captura actual + nueva.
3. Guarda.

## Activar 2FA (recomendado)

1. **Mi cuenta > Seguridad > Autenticacion en dos pasos**.
2. Escanea QR con Google Authenticator o Authy.
3. Captura el codigo de 6 digitos para activar.
4. **Guarda los codigos de respaldo** (si pierdes el celular).

> 2FA es **obligatorio** en Plan Enterprise para owners.

## Sospecha de acceso no autorizado

Si crees que alguien entro a tu cuenta:
1. Cambia contrasena inmediatamente.
2. Revisa **Mi cuenta > Sesiones activas** y cierra todas excepto la tuya.
3. Activa 2FA.
4. Reporta al chat de soporte para auditoria.
