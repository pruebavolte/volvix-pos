-- Seed giros_terminologias (30 giros prioritarios)
-- Generado por build-seed-giros-terminologias.js
-- Idempotente: usa ON CONFLICT (giro_slug, tenant_id) DO UPDATE

BEGIN;

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('default', 'Genérico', '{"cliente":"cliente","clientes":"clientes","producto":"producto","productos":"productos","venta":"venta","ventas":"ventas","ticket":"ticket","empleado":"empleado","vendedor":"vendedor","comanda":"ticket","mesa":"mesa","pedido":"pedido"}'::jsonb, '["core","inventory","taxes","permissions"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('restaurante', 'Restaurante', '{"cliente":"comensal","clientes":"comensales","producto":"platillo","productos":"platillos","venta":"comanda","ventas":"comandas","empleado":"mesero","vendedor":"mesero","ticket":"comanda","mesa":"mesa"}'::jsonb, '["core","inventory","taxes","kitchen","recipes","modifiers","delivery","commissions"]'::jsonb, '["medical","automotive","rentals","hotel","gym","events","warranties","serials"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('cafeteria', 'Cafetería', '{"cliente":"cliente","producto":"bebida","productos":"bebidas","venta":"orden","empleado":"barista","ticket":"orden"}'::jsonb, '["core","inventory","taxes","kitchen","recipes","modifiers","loyalty"]'::jsonb, '["medical","automotive","rentals","hotel","gym","events","warranties","serials"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('taqueria', 'Taquería', '{"cliente":"cliente","producto":"platillo","venta":"orden","empleado":"taquero"}'::jsonb, '["core","inventory","taxes","kitchen","modifiers"]'::jsonb, '["medical","automotive","rentals","hotel","gym","events","warranties","serials","marketplace","ecommerce"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('navaja', 'Barbería', '{"cliente":"cliente","producto":"servicio","productos":"servicios","venta":"corte","ventas":"cortes","empleado":"barbero","vendedor":"barbero","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","appointments","commissions","services","loyalty"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('brillo', 'Estética', '{"cliente":"cliente","producto":"servicio","venta":"servicio","empleado":"estilista","ticket":"servicio"}'::jsonb, '["core","inventory","taxes","appointments","commissions","services","loyalty"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('receta', 'Farmacia', '{"cliente":"paciente","clientes":"pacientes","producto":"medicamento","productos":"medicamentos","venta":"despacho","empleado":"despachador","ticket":"receta"}'::jsonb, '["core","inventory","taxes","lots","medical","sat","permissions"]'::jsonb, '["kitchen","automotive","rentals","hotel","gym","events","appointments","kits","warranties"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('pulso', 'Clínica / Dental', '{"cliente":"paciente","clientes":"pacientes","producto":"servicio","productos":"servicios","venta":"consulta","empleado":"doctor","ticket":"expediente"}'::jsonb, '["core","appointments","medical","services","permissions","taxes"]'::jsonb, '["kitchen","automotive","rentals","hotel","gym","events","warranties","serials","kits","recipes","marketplace","ecommerce"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('pata', 'Veterinaria', '{"cliente":"tutor","clientes":"tutores","producto":"servicio","venta":"consulta","empleado":"doctor","ticket":"expediente"}'::jsonb, '["core","appointments","medical","services","inventory","taxes"]'::jsonb, '["kitchen","automotive","rentals","hotel","gym","events","warranties"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('tendito', 'Abarrotes', '{"cliente":"cliente","producto":"producto","venta":"venta","empleado":"cajero","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","loyalty"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","recipes","marketplace","appointments"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('folio', 'Hotel / Hospedaje', '{"cliente":"cliente","producto":"servicio","productos":"servicios","venta":"factura","ventas":"facturas","empleado":"ejecutivo","ticket":"orden de servicio"}'::jsonb, '["core","taxes","appointments","services","permissions","sat"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","inventory","kits","recipes","warranties","serials","lots"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('forja', 'Taller / Refaccionaria', '{"cliente":"miembro","clientes":"miembros","producto":"membresía","productos":"membresías","venta":"inscripción","empleado":"instructor","ticket":"acceso"}'::jsonb, '["core","gym","subscriptions","appointments","loyalty","taxes"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","events","warranties","serials","lots","kits","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('tarima', 'Vinatería / Bar', '{"cliente":"cliente","producto":"servicio","venta":"consumo","empleado":"mesero","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","events","modifiers","appointments"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","warranties","serials","lots","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('refacciona', 'Refaccionaria', '{"cliente":"cliente","producto":"refacción","productos":"refacciones","venta":"orden de servicio","ventas":"órdenes de servicio","empleado":"mecánico","ticket":"orden de servicio"}'::jsonb, '["core","inventory","automotive","appointments","services","taxes","serials","warranties"]'::jsonb, '["kitchen","medical","rentals","hotel","gym","events","lots","recipes","kits","marketplace","ecommerce"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('pareo', 'Boutique / Ropa', '{"cliente":"cliente","producto":"calzado","productos":"calzado","venta":"venta","empleado":"vendedor","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","variants","loyalty","marketplace","ecommerce"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","lots","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('bloque', 'Construcción', '{"cliente":"alumno","clientes":"alumnos","producto":"curso","productos":"cursos","venta":"inscripción","empleado":"instructor","ticket":"matrícula"}'::jsonb, '["core","education","appointments","subscriptions","taxes"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","kits","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('gateo', 'Guardería', '{"cliente":"tutor","clientes":"tutores","producto":"servicio","venta":"mensualidad","empleado":"educadora","ticket":"expediente"}'::jsonb, '["core","education","appointments","subscriptions","taxes","medical"]'::jsonb, '["kitchen","automotive","rentals","hotel","gym","events","warranties","serials","kits","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('burbuja', 'Lavandería', '{"cliente":"cliente","producto":"servicio","venta":"servicio","empleado":"operador","ticket":"orden"}'::jsonb, '["core","services","appointments","taxes"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","lots","recipes","kits","inventory"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('almohada', 'Mueblería / Persianas', '{"cliente":"cliente","producto":"producto","venta":"venta","empleado":"vendedor","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","warranties","marketplace","ecommerce","variants"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","serials","lots","recipes","appointments"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('quilate', 'Joyería', '{"cliente":"cliente","producto":"pieza","productos":"piezas","venta":"venta","empleado":"joyero","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","warranties","serials","permissions","appointments"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","recipes","kits"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('tictac', 'Relojería', '{"cliente":"cliente","producto":"reloj","productos":"relojes","venta":"venta","empleado":"asesor","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","warranties","serials","permissions"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('armazon', 'Óptica', '{"cliente":"cliente","producto":"armazón","productos":"armazones","venta":"venta","empleado":"optometrista","ticket":"expediente"}'::jsonb, '["core","inventory","taxes","appointments","medical","warranties"]'::jsonb, '["kitchen","automotive","rentals","hotel","gym","events","serials","lots","kits","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('mochila', 'Bebés / Maternidad', '{"cliente":"cliente","producto":"producto","venta":"venta","empleado":"vendedor","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","variants","marketplace","ecommerce"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","lots","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('asa', 'Bolsas / Mercería', '{"cliente":"cliente","producto":"bolso","productos":"bolsos","venta":"venta","empleado":"vendedor","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","variants","marketplace","ecommerce"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","lots","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('discreto', 'Sexshop', '{"cliente":"cliente","producto":"producto","venta":"venta","empleado":"asesor","ticket":"ticket"}'::jsonb, '["core","inventory","taxes","delivery","ecommerce","loyalty","permissions"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","lots","recipes","appointments"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('comedor', 'Comedor / Fonda', '{"cliente":"comensal","producto":"platillo","venta":"comanda","empleado":"cocinera","ticket":"comanda"}'::jsonb, '["core","kitchen","recipes","modifiers","taxes","inventory"]'::jsonb, '["medical","automotive","rentals","hotel","gym","events","warranties","serials","marketplace","ecommerce"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('consome', 'Caldos / Sopas', '{"cliente":"comensal","producto":"platillo","venta":"orden","empleado":"cocinero","ticket":"orden"}'::jsonb, '["core","kitchen","modifiers","taxes","inventory"]'::jsonb, '["medical","automotive","rentals","hotel","gym","events","warranties","serials"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('nieve', 'Nieves / Helados', '{"cliente":"cliente","producto":"helado","productos":"helados","venta":"orden","empleado":"heladero","ticket":"orden"}'::jsonb, '["core","inventory","taxes","modifiers","loyalty"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials","recipes"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

INSERT INTO giros_terminologias (giro_slug, giro_name, terminologias, modulos_activos, modulos_inactivos)
VALUES ('merengue', 'Postres / Repostería', '{"cliente":"cliente","producto":"pastel","productos":"pasteles","venta":"pedido","empleado":"repostero","ticket":"pedido"}'::jsonb, '["core","inventory","taxes","recipes","appointments","loyalty"]'::jsonb, '["kitchen","medical","automotive","rentals","hotel","gym","events","warranties","serials"]'::jsonb)
ON CONFLICT (giro_slug, tenant_id) DO UPDATE SET
  terminologias = EXCLUDED.terminologias,
  modulos_activos = EXCLUDED.modulos_activos,
  modulos_inactivos = EXCLUDED.modulos_inactivos,
  giro_name = EXCLUDED.giro_name,
  updated_at = now();

COMMIT;

-- Total giros seedeados: 29
-- Verificar: SELECT count(*) FROM giros_terminologias; -- Esperado: >= 29