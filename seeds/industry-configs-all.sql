-- ============================================================
-- INDUSTRY-SPECIFIC CONFIGURATIONS
-- ============================================================
-- Stored in generic_blobs (key-value JSON store) so this works
-- regardless of whether tables exist for each feature.
-- ============================================================
BEGIN;

-- Each tenant's industry config in generic_blobs
INSERT INTO generic_blobs (user_id, key, value, updated_at)
VALUES
 -- Restaurant: 8 mesas en 3 áreas
 ('22222222-0004-aaaa-aaaa-000000000001','industry_config:tables', $$[
   {"id":"M1","area":"interior","capacity":4,"status":"available"},
   {"id":"M2","area":"interior","capacity":4,"status":"available"},
   {"id":"M3","area":"interior","capacity":6,"status":"available"},
   {"id":"M4","area":"interior","capacity":2,"status":"available"},
   {"id":"M5","area":"terraza","capacity":4,"status":"available"},
   {"id":"M6","area":"terraza","capacity":6,"status":"available"},
   {"id":"M7","area":"terraza","capacity":2,"status":"available"},
   {"id":"BAR1","area":"barra","capacity":1,"status":"available"}
 ]$$::jsonb, now()),
 ('22222222-0004-aaaa-aaaa-000000000001','industry_config:waiters', $$[
   {"id":"W1","name":"Norma Salinas","shift":"morning"},
   {"id":"W2","name":"Andrés Cabrera","shift":"morning"},
   {"id":"W3","name":"Lupita Méndez","shift":"evening"},
   {"id":"W4","name":"Roberto Pineda","shift":"evening"}
 ]$$::jsonb, now()),

 -- Café: 2 cajas, 3 baristas
 ('22222222-0005-aaaa-aaaa-000000000001','industry_config:registers', $$[
   {"id":"CAJA1","status":"active"},
   {"id":"CAJA2","status":"active"}
 ]$$::jsonb, now()),
 ('22222222-0005-aaaa-aaaa-000000000001','industry_config:baristas', $$[
   {"id":"B1","name":"Daniela Pérez","specialty":"latte_art"},
   {"id":"B2","name":"Eduardo Solís","specialty":"espresso"},
   {"id":"B3","name":"Mariana Toledo","specialty":"cold_brew"}
 ]$$::jsonb, now()),

 -- Barbería: 3 barberos + agenda
 ('22222222-0006-aaaa-aaaa-000000000001','industry_config:barbers', $$[
   {"id":"B1","name":"José Pepe Ruiz","schedule":"Lun-Sáb 10:00-20:00","specialty":"clásico"},
   {"id":"B2","name":"Iván El Chino Robles","schedule":"Lun-Sáb 11:00-21:00","specialty":"fade"},
   {"id":"B3","name":"Roberto Beto Aguilar","schedule":"Mar-Dom 12:00-21:00","specialty":"barba"}
 ]$$::jsonb, now()),
 ('22222222-0006-aaaa-aaaa-000000000001','industry_config:appointments', $$[
   {"day":"+1","time":"10:00","client":"Carlos Méndez","barber":"B1","service":"Corte clásico"},
   {"day":"+1","time":"11:00","client":"Hugo Rivera","barber":"B2","service":"Corte fade"},
   {"day":"+1","time":"12:30","client":"Luis Nájera","barber":"B3","service":"Corte + barba"},
   {"day":"+1","time":"15:00","client":"Pedro Salgado","barber":"B1","service":"Barba completa"},
   {"day":"+2","time":"10:30","client":"Andrés Cárdenas","barber":"B2","service":"Corte + barba premium"},
   {"day":"+2","time":"13:00","client":"Roberto Tovar","barber":"B3","service":"Corte fade"},
   {"day":"+3","time":"11:00","client":"Miguel Ortega","barber":"B1","service":"Corte clásico"},
   {"day":"+3","time":"16:00","client":"Sergio Bravo","barber":"B2","service":"Corte + barba"},
   {"day":"+4","time":"10:00","client":"Daniel Castro","barber":"B3","service":"Diseño ceja + corte"},
   {"day":"+4","time":"12:00","client":"Eduardo Lozano","barber":"B1","service":"Corte fade"},
   {"day":"+5","time":"11:30","client":"Javier Reyes","barber":"B2","service":"Tintura cabello"},
   {"day":"+5","time":"14:00","client":"Arturo Galindo","barber":"B3","service":"Corte + barba"},
   {"day":"+6","time":"10:00","client":"Manuel Cisneros","barber":"B1","service":"Corte clásico"},
   {"day":"+6","time":"12:00","client":"Fernando Pacheco","barber":"B2","service":"Corte fade"},
   {"day":"+6","time":"17:00","client":"Ricardo Ávila","barber":"B3","service":"Corte + barba premium"}
 ]$$::jsonb, now()),

 -- Gasolinera: 6 bombas + 4 despachadores
 ('22222222-0007-aaaa-aaaa-000000000001','industry_config:pumps', $$[
   {"id":"B1","fuel":"magna","status":"active"},
   {"id":"B2","fuel":"magna","status":"active"},
   {"id":"B3","fuel":"magna","status":"active"},
   {"id":"B4","fuel":"premium","status":"active"},
   {"id":"B5","fuel":"premium","status":"active"},
   {"id":"B6","fuel":"diesel","status":"active"}
 ]$$::jsonb, now()),
 ('22222222-0007-aaaa-aaaa-000000000001','industry_config:dispatchers', $$[
   {"id":"D1","name":"Juan Pérez","shift":"morning"},
   {"id":"D2","name":"María López","shift":"morning"},
   {"id":"D3","name":"Carlos Torres","shift":"evening"},
   {"id":"D4","name":"Pedro Sánchez","shift":"night"}
 ]$$::jsonb, now()),

 -- Ropa: 3 probadores + temporada
 ('22222222-0008-aaaa-aaaa-000000000001','industry_config:fitting_rooms', $$[
   {"id":"P1","status":"available"},
   {"id":"P2","status":"available"},
   {"id":"P3","status":"available"}
 ]$$::jsonb, now()),
 ('22222222-0008-aaaa-aaaa-000000000001','industry_config:season', $$
   {"current_season_pct":50,"liquidacion_pct":30,"new_arrivals_pct":20}
 $$::jsonb, now()),

 -- Electrónica: serial numbers + warranties (8 activas)
 ('22222222-0009-aaaa-aaaa-000000000001','industry_config:warranties', $$[
   {"serial":"AP14-001","product":"iPhone 14 128GB Negro","client":"Carlos Hernández","start":"2025-12-15","months":12,"status":"active"},
   {"serial":"AP14-002","product":"iPhone 14 128GB Blanco","client":"María Sánchez","start":"2026-01-20","months":12,"status":"active"},
   {"serial":"SM-A54-001","product":"Galaxy A54","client":"Pedro Ramos","start":"2026-02-10","months":12,"status":"active"},
   {"serial":"SM-S23-001","product":"Galaxy S23","client":"Laura Jiménez","start":"2026-01-05","months":12,"status":"active"},
   {"serial":"AP-MBA-001","product":"MacBook Air M2","client":"Empresa ABC SA","start":"2025-11-30","months":12,"status":"active"},
   {"serial":"SM-TV55-001","product":"TV Samsung 55","client":"Roberto Cano","start":"2025-10-15","months":24,"status":"active"},
   {"serial":"LG-TV50-001","product":"TV LG 50","client":"Verónica Ávila","start":"2026-03-01","months":24,"status":"active"},
   {"serial":"HP-LP15-001","product":"Laptop HP 15-fc","client":"Alejandro Morales","start":"2026-02-20","months":12,"status":"active"}
 ]$$::jsonb, now()),

 -- Fitness: 25 miembros + 8 clases + 3 instructores
 ('22222222-0010-aaaa-aaaa-000000000001','industry_config:active_members', $$[
   {"id":"M001","name":"Andrea Salinas","plan":"mensual","since":"2026-01-15","next_payment":"2026-05-15"},
   {"id":"M002","name":"Roberto Cano","plan":"trimestral","since":"2026-02-01","next_payment":"2026-05-01"},
   {"id":"M003","name":"María Vega","plan":"anual","since":"2025-08-15","next_payment":"2026-08-15"},
   {"id":"M004","name":"Carlos Téllez","plan":"mensual","since":"2026-04-01","next_payment":"2026-05-01"},
   {"id":"M005","name":"Patricia Núñez","plan":"semestral","since":"2026-01-10","next_payment":"2026-07-10"},
   {"id":"M006","name":"Juan Ramos","plan":"mensual","since":"2026-04-10","next_payment":"2026-05-10"},
   {"id":"M007","name":"Sofía Bravo","plan":"trimestral","since":"2026-03-01","next_payment":"2026-06-01"},
   {"id":"M008","name":"Hugo Cárdenas","plan":"mensual","since":"2026-04-15","next_payment":"2026-05-15"},
   {"id":"M009","name":"Lorena Pacheco","plan":"anual","since":"2025-11-01","next_payment":"2026-11-01"},
   {"id":"M010","name":"Eduardo Lozano","plan":"mensual","since":"2026-04-20","next_payment":"2026-05-20"},
   {"id":"M011","name":"Norma Salinas","plan":"mensual","since":"2026-04-05","next_payment":"2026-05-05"},
   {"id":"M012","name":"Daniel Castro","plan":"trimestral","since":"2026-02-15","next_payment":"2026-05-15"},
   {"id":"M013","name":"Verónica Aguilar","plan":"anual","since":"2025-07-01","next_payment":"2026-07-01"},
   {"id":"M014","name":"Sergio Reyes","plan":"mensual","since":"2026-04-01","next_payment":"2026-05-01"},
   {"id":"M015","name":"Karla Méndez","plan":"semestral","since":"2026-02-20","next_payment":"2026-08-20"},
   {"id":"M016","name":"Manuel Bravo","plan":"mensual","since":"2026-04-12","next_payment":"2026-05-12"},
   {"id":"M017","name":"Ricardo Ávila","plan":"trimestral","since":"2026-03-15","next_payment":"2026-06-15"},
   {"id":"M018","name":"Beatriz Torres","plan":"mensual","since":"2026-04-08","next_payment":"2026-05-08"},
   {"id":"M019","name":"Javier Reyes","plan":"anual","since":"2025-09-15","next_payment":"2026-09-15"},
   {"id":"M020","name":"Mónica Salgado","plan":"mensual","since":"2026-04-22","next_payment":"2026-05-22"},
   {"id":"M021","name":"Arturo Galindo","plan":"semestral","since":"2026-01-25","next_payment":"2026-07-25"},
   {"id":"M022","name":"Adriana Pérez","plan":"trimestral","since":"2026-02-25","next_payment":"2026-05-25"},
   {"id":"M023","name":"Fernando Cano","plan":"mensual","since":"2026-04-15","next_payment":"2026-05-15"},
   {"id":"M024","name":"Brenda Ortiz","plan":"anual","since":"2025-12-01","next_payment":"2026-12-01"},
   {"id":"M025","name":"Hugo Mendoza","plan":"mensual","since":"2026-04-18","next_payment":"2026-05-18"}
 ]$$::jsonb, now()),
 ('22222222-0010-aaaa-aaaa-000000000001','industry_config:classes', $$[
   {"id":"C1","name":"CrossFit AM","day":"Lun/Mié/Vie","time":"06:00","instructor":"I1","capacity":15},
   {"id":"C2","name":"Yoga Flow","day":"Mar/Jue","time":"07:00","instructor":"I2","capacity":20},
   {"id":"C3","name":"Spinning","day":"Lun/Mié/Vie","time":"18:00","instructor":"I3","capacity":18},
   {"id":"C4","name":"Pilates","day":"Mar/Jue","time":"08:00","instructor":"I2","capacity":12},
   {"id":"C5","name":"HIIT","day":"Sab","time":"09:00","instructor":"I1","capacity":20},
   {"id":"C6","name":"Zumba","day":"Lun/Mié","time":"19:00","instructor":"I2","capacity":25},
   {"id":"C7","name":"Boxeo","day":"Mar/Jue","time":"19:30","instructor":"I3","capacity":15},
   {"id":"C8","name":"Funcional","day":"Sab","time":"10:00","instructor":"I1","capacity":18}
 ]$$::jsonb, now()),
 ('22222222-0010-aaaa-aaaa-000000000001','industry_config:instructors', $$[
   {"id":"I1","name":"Coach Alex Rivera","specialties":["CrossFit","HIIT","Funcional"]},
   {"id":"I2","name":"Coach Diana Salinas","specialties":["Yoga","Pilates","Zumba"]},
   {"id":"I3","name":"Coach Memo López","specialties":["Spinning","Boxeo"]}
 ]$$::jsonb, now())
ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
