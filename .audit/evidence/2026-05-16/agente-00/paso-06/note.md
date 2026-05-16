B-MKT-4 OTP cold-start: no verificado experimentalmente.
Causa: requiere crear registro real en produccion con email y telefono validos.
Documentacion: el codigo en api/index.js linea ~38799 confirma '_otpStore = {}' in-memory con comentario 'Lost on cold start'.
