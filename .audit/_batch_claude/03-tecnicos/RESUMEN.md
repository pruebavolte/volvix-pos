# RESUMEN — 50 Marcas Premium · Sector Servicios Técnicos

**Agente 3** · Volvix POS · 2026-05-17
Directorio: `.audit/_batch_claude/03-tecnicos/`
Total: **50 marcas JSON** + ROUTER-MAPPINGS + este resumen

---

## Tabla maestra

| #   | Giro                              | Slug             | Brand           | Vibe         | liveDemo |
| --- | --------------------------------- | ---------------- | --------------- | ------------ | -------- |
| 216 | taller mecánico general           | bujia            | Bujía           | industrial   | booking  |
| 217 | taller de hojalatería             | latonero         | Latonero        | darkPremium  | booking  |
| 218 | taller de transmisiones           | embrague         | Embrague        | industrial   | booking  |
| 219 | taller eléctrico automotriz       | alternador       | Alternador      | industrial   | booking  |
| 220 | taller diésel                     | diesel-shop      | Diésel Shop     | darkPremium  | booking  |
| 221 | taller motos                      | escape           | Escape          | industrial   | booking  |
| 222 | tienda de refacciones             | balata           | Balata          | industrial   | stock    |
| 223 | refaccionaria automotriz          | refaccion        | Refacción       | industrial   | stock    |
| 224 | servicios automotrices            | servicio-auto    | Servicio Auto   | industrial   | booking  |
| 225 | lavado de autos a vapor           | espuma-auto      | Espuma Auto     | fresh        | booking  |
| 226 | detailing automotriz              | pulido           | Pulido          | darkPremium  | booking  |
| 227 | polarizado                        | pelicula         | Película        | darkPremium  | booking  |
| 228 | mecánico a domicilio              | rueda            | Rueda           | industrial   | booking  |
| 229 | grúa y traslado                   | grua             | Grúa            | industrial   | booking  |
| 230 | cerrajería automotriz             | llave-auto       | Llave Auto      | industrial   | booking  |
| 231 | agencia de autos                  | concesionario    | Concesionario   | luxury       | stock    |
| 232 | compra venta autos                | tracto           | Tracto          | darkPremium  | stock    |
| 233 | renta de autos                    | renta-auto       | Renta Auto      | luxury       | stock    |
| 234 | renta de motos                    | renta-moto       | Renta Moto      | industrial   | stock    |
| 235 | renta de camionetas               | camioneta        | Camioneta       | industrial   | stock    |
| 236 | renta de remolques                | remolque         | Remolque        | industrial   | stock    |
| 237 | carpintería                       | viruta           | Viruta          | artisan      | booking  |
| 238 | ebanistería                       | barniz           | Barniz          | warmLocal    | booking  |
| 239 | herrería                          | yunque           | Yunque          | industrial   | booking  |
| 240 | soldadura                         | chispa           | Chispa          | industrial   | booking  |
| 241 | plomería                          | tueria           | Tubería         | industrial   | booking  |
| 242 | electricista                      | watt             | Watt            | minimalist   | booking  |
| 243 | instalación de aire               | climatizado      | Climatizado     | minimalist   | booking  |
| 244 | servicio de A/C                   | frigorifico      | Frigorífico     | fresh        | booking  |
| 245 | servicio de calefacción           | caldera          | Caldera         | warmCozy     | booking  |
| 246 | impermeabilización                | techar           | Techar          | industrial   | booking  |
| 247 | albañilería                       | tabique          | Tabique         | warmLocal    | booking  |
| 248 | construcción residencial          | obra             | Obra            | editorial    | booking  |
| 249 | remodelaciones                    | renovar          | Renovar         | editorial    | booking  |
| 250 | interiorismo                      | ambiente         | Ambiente        | luxury       | booking  |
| 251 | arquitectura                      | plano            | Plano           | editorial    | booking  |
| 252 | ingeniería civil                  | columna          | Columna         | industrial   | booking  |
| 253 | fumigación                        | repelente        | Repelente       | industrial   | booking  |
| 254 | control de plagas                 | trampa           | Trampa          | industrial   | booking  |
| 255 | limpieza residencial              | jabon            | Jabón           | fresh        | booking  |
| 256 | limpieza comercial                | trapeador        | Trapeador       | minimalist   | booking  |
| 257 | lavado de muebles                 | tapizado         | Tapizado        | fresh        | booking  |
| 258 | servicio de jardinería            | poda             | Poda            | fresh        | booking  |
| 259 | mantenimiento de albercas         | alberca          | Alberca         | fresh        | booking  |
| 260 | cerrajería 24h                    | candado          | Candado         | industrial   | booking  |
| 261 | servicio celulares                | repara-cel       | Repara Cel      | minimalist   | booking  |
| 262 | reparación de computadoras        | repara-pc        | Repara PC       | minimalist   | booking  |
| 263 | reparación de electrodomésticos   | reparelec        | Reparelec       | industrial   | booking  |
| 264 | servicio técnico TV               | repara-tv        | Repara TV       | industrial   | booking  |
| 265 | servicio técnico audio            | bocina           | Bocina          | darkPremium  | booking  |

---

## Distribución de vibes

| Vibe          | Count |
| ------------- | ----- |
| industrial    | 22    |
| darkPremium   | 6     |
| fresh         | 6     |
| minimalist    | 5     |
| editorial     | 3     |
| luxury        | 3     |
| warmLocal     | 2     |
| artisan       | 1     |
| warmCozy      | 1     |
| **Total**     | **50** |

## Distribución de liveDemo

| Type    | Count | Casos                                                                      |
| ------- | ----- | -------------------------------------------------------------------------- |
| booking | 42    | Talleres, plomeros, electricistas, construcción, fumigación, reparaciones, etc. |
| stock   | 8     | Refacciones, refaccionaria, agencias, compraventa, rentas (auto/moto/cam/rem) |

---

## Validación técnica

- Total archivos JSON: **50** (todos parseables sin error)
- ROUTER-MAPPINGS.json: incluido con aliases por slug
- Cada marca cumple estructura template:
  - 8 colores en palette
  - 4 Google Fonts en fonts
  - 1 hero + 9 showcase + 3 context (13 imágenes Unsplash)
  - 6 features con icons del set válido
  - 4 stats numéricos
  - 1 quote con `<span class="hl">` + dueño + ciudad mexicana
  - 3 thefts específicos del oficio (no genéricos)

## Notas

- Slugs en kebab-case, sin acentos, únicos.
- Conflictos resueltos: `pulido` no chocaba; `repara-cel`/`repara-pc`/`repara-tv` para diferenciar familia de reparaciones.
- Quotes con ciudades mexicanas variadas: CDMX (8), EDOMEX (8), Guadalajara, Mérida, Monterrey, Querétaro, Puebla, Cancún/Q.Roo, Mexicali/BC, Tijuana/BC, Veracruz, Acapulco, etc.
- Voz B2C mexicana de servicio técnico mantenida: "el trabajo bien hecho", "cero engaños", "el cliente regresa".
- Thefts específicos al oficio: refacciones extras no autorizadas, trabajo cobrado sin hacer, diagnóstico inflado, horas facturadas no trabajadas, material sobrante robado, piezas buenas reportadas dañadas.
