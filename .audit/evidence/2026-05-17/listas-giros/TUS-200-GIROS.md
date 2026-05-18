# 👤 TUS 200 GIROS — Para que el usuario genere

> **Tu tarea**: usa el TEMPLATE-MARCA.json + ROUTER-MAPPINGS-EJEMPLO.json para crear 1 JSON por giro
> **Entrega**: ZIP llamado `volvix-marcas-USER-batch-N.zip` con JSONs + 1 ROUTER-MAPPINGS.json consolidado
> **Yo integro mecánicamente** cuando me entregues cada ZIP

---

## 📂 SECTOR 1 — SALUD Y BIENESTAR (50)

LiveDemo predominante: `booking` (citas médicas) + `expiry` (farmacias)

```
61. clínica general
62. clínica privada
63. consultorio médico
64. consultorio pediátrico
65. ginecología
66. dermatología
67. cardiología
68. ortopedia
69. medicina familiar
70. medicina interna
71. medicina deportiva
72. medicina estética
73. laboratorio clínico
74. ultrasonidos
75. rayos X
76. tomografía
77. resonancia magnética
78. mastografía
79. consulta psicológica
80. psiquiatría
81. neuropsicología
82. nutrióloga
83. fisioterapia
84. quiropráctica
85. acupuntura
86. homeopatía
87. medicina alternativa
88. terapia ocupacional
89. terapia de lenguaje
90. clínica de fertilidad
91. clínica antiestrés
92. spa terapéutico
93. clínica de adicciones
94. centro de rehabilitación
95. clínica dental infantil
96. ortodoncista
97. endodoncista
98. cirugía oral
99. blanqueamiento dental
100. óptica oftalmológica
101. clínica oftalmológica
102. podología
103. clínica para diabéticos
104. herbolaria natural
105. farmacia veterinaria
106. clínica veterinaria 24h
107. hospital veterinario
108. cirugía veterinaria
109. estética canina
110. peluquería de mascotas
```

---

## 💄 SECTOR 2 — BELLEZA Y ESTÉTICA (45)

LiveDemo predominante: `booking` (citas con estilista)

```
111. salón de uñas
112. estudio de pestañas
113. cejas microblading
114. maquillaje profesional
115. peinados de novia
116. depilación láser
117. depilación con cera
118. masajes terapéuticos
119. masaje relajante
120. masaje deportivo
121. spa de día
122. spa de novia
123. sauna y vapor
124. hidroterapia
125. limpieza facial
126. tratamientos faciales
127. peeling químico
128. mesoterapia
129. radiofrecuencia
130. cavitación corporal
131. presoterapia
132. moldeado corporal
133. lipoláser
134. pestañas pelo a pelo
135. extensiones de cabello
136. coloración profesional
137. balayage
138. mechas
139. tratamiento capilar
140. queratina
141. peluquería infantil
142. peluquería canina
143. tatuador profesional
144. estudio de tatuajes
145. piercing studio
146. micropigmentación
147. perfumería
148. cosmetiquera
149. tienda de maquillaje
150. productos coreanos
151. productos naturales belleza
152. barbería premium
153. shaving bar
154. salón unisex
155. dermo cosmética
```

---

## 💼 SECTOR 3 — SERVICIOS PROFESIONALES (35)

LiveDemo predominante: `booking` (cita con asesor) + variantes B2B

```
296. despacho contable
297. contador independiente
298. firma legal
299. abogados penalistas
300. abogados civiles
301. abogados laborales
302. abogados familiares
303. abogados corporativos
304. notaría pública
305. corredor público
306. asesoría fiscal
307. trámites SAT
308. agencia aduanal
309. agencia inmobiliaria
310. broker hipotecario
311. asesor financiero
312. seguros y fianzas
313. agente de seguros
314. corredor de bolsa
315. casa de cambio
316. envíos de dinero
317. cobranza extrajudicial
318. consultoría empresarial
319. coach de negocios
320. coach de vida
321. agencia de marketing
322. agencia de publicidad
323. diseño gráfico
324. diseño web
325. desarrollo software
326. desarrollo apps
327. agencia digital
328. SEO especializado
329. social media manager
330. fotografía profesional
```

---

## 💪 SECTOR 4 — DEPORTE Y RECREACIÓN (35)

LiveDemo predominante: `booking` (clases/horarios) + `stock` (tienda deportiva)

```
331. gimnasio crossfit
332. gimnasio mujeres
333. gimnasio funcional
334. estudio de pilates
335. estudio de yoga
336. studio de spinning
337. academia de boxeo
338. MMA y artes marciales
339. taekwondo
340. karate
341. judo
342. academia de tenis
343. academia de fútbol
344. academia de béisbol
345. cancha de pádel
346. cancha de fútbol rápido
347. centro deportivo
348. natación adultos
349. natación infantil
350. clases de buceo
351. academia de surf
352. academia de skate
353. ciclismo
354. bicicleta indoor
355. crossfit competitivo
356. equilibrio físico
357. rehabilitación deportiva
358. masaje deportivo
359. nutrición deportiva
360. tienda deportiva
361. ropa deportiva
362. tenis deportivos
363. equipo de gimnasio
364. accesorios fitness
365. suplementos deportivos
```

---

## 🎉 SECTOR 5 — ENTRETENIMIENTO Y EVENTOS (35)

LiveDemo predominante: `booking` (reserva fecha) + `kds` (catering)

```
366. salón de eventos
367. jardín de eventos
368. terraza para fiestas
369. wedding planner
370. coordinador de bodas
371. catering corporativo
372. catering bodas
373. banquetes mexicanos
374. food truck para eventos
375. mesa de dulces
376. mesa de quesos
377. barra libre
378. dj profesional
379. animación infantil
380. show de magos
381. show de payasos
382. show de robots
383. boxes infantiles
384. salón de fiestas infantil
385. inflables y brincolines
386. casino mesa de juegos
387. karaoke
388. boliche
389. billar
390. bar de billar
391. salón de baile
392. cantina con música
393. peña tradicional
394. fiesta privada
395. organización de XV años
396. fotografía de eventos
397. video de eventos
398. drone para eventos
399. iluminación profesional
400. sonido profesional
```

---

## 📦 Total: 50 + 45 + 35 + 35 + 35 = **200 giros**

---

## 📋 Reglas obligatorias por marca

1. **Nombre concreto** (NO "Pro", "Max", "Plus", "Studio"). Ejemplos buenos: Karat, Armario, Biberón, Pétalo, Espuma
2. **Slug** kebab-case sin acentos: `pareo`, `comandero`, `petalo`
3. **Vibe** debe ser uno de los 15 válidos del TEMPLATE
4. **Paleta** con los 8 colores (bg, surface, paper, ink, ink2, muted, line, accent, accent2)
5. **Fuentes** disponibles en Google Fonts
6. **liveDemo.type** debe ser uno de los 5: `stock | kds | booking | expiry | fiado`
7. **Imágenes Unsplash** — usa `https://source.unsplash.com/random/1200x900/?{keyword1},{keyword2}` para evitar dead links
8. **Features 6, stats 4, thefts 3** (exactos)
9. **Quote** con negocio mexicano ficticio + ciudad real
10. **ROUTER-MAPPINGS.json** consolidado con todos los aliases del batch

---

## 📦 Cuando termines un batch

Empaca en ZIP llamado `volvix-marcas-USER-batch-N.zip` con estructura:

```
volvix-marcas-USER-batch-1.zip
├── 061-clinica-general.json
├── 062-clinica-privada.json
├── ...
└── ROUTER-MAPPINGS.json
```

Dropea el ZIP en `C:\Users\DELL\Downloads\` y dime: `@volvix-marcas-USER-batch-1.zip integralo`.

Yo lo proceso siguiendo el Step 1-8 del HANDOFF-NEXT-SESSION.md (línea 176).
