B-MKT-5 captcha en register-simple: no se ejecuto load test contra produccion (DoS contra sistema en vivo es prohibido).

Evidencia por inspeccion de codigo:
- captcha mention en handler: False
- rateLimit mention en handler: True

Conclusion: solo rate-limit por IP, NO hay captcha. B-MKT-5 CONFIRMADO por codigo.
