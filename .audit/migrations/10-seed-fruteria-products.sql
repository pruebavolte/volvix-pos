-- Seed 22 productos demo para "Fruteria bartola" (tenant_id=TNT-P5E74)
-- 2026-05-18 V2: con ALTER TABLE para image_url + columnas reales (category, min_stock, no stock_minimo)

BEGIN;

-- Agregar image_url si no existe
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Limpiar duplicados eventuales del seed previo
DELETE FROM pos_products WHERE tenant_id='TNT-P5E74' AND name LIKE 'FR-%';

INSERT INTO pos_products (
  tenant_id, pos_user_id, name, price, cost, stock, min_stock, category, currency_code, image_url, barcode
) VALUES
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Tomate Saladette',          22.00,12.00, 50, 10,'frutas-verduras','MXN','https://loremflickr.com/600/600/tomato,fresh','7501000000101'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Manzana Roja',              35.00,22.00, 80, 15,'frutas-verduras','MXN','https://loremflickr.com/600/600/red,apple','7501000000102'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Plátano Tabasco',           18.00,10.00,120, 20,'frutas-verduras','MXN','https://loremflickr.com/600/600/banana,yellow','7501000000103'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Naranja Valencia',          15.00, 8.00,100, 20,'frutas-verduras','MXN','https://loremflickr.com/600/600/orange,citrus','7501000000104'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Limón sin Semilla',         28.00,16.00, 60, 12,'frutas-verduras','MXN','https://loremflickr.com/600/600/lime,lemon','7501000000105'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Aguacate Hass',             65.00,42.00, 40,  8,'frutas-verduras','MXN','https://loremflickr.com/600/600/avocado,green','7501000000106'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Papaya Maradol',            32.00,20.00, 25,  5,'frutas-verduras','MXN','https://loremflickr.com/600/600/papaya,tropical','7501000000107'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Sandía sin Semilla',         8.00, 4.00, 15,  3,'frutas-verduras','MXN','https://loremflickr.com/600/600/watermelon,red','7501000000108'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Mango Ataulfo',             45.00,28.00, 35,  7,'frutas-verduras','MXN','https://loremflickr.com/600/600/mango,yellow','7501000000109'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Piña Miel',                 25.00,14.00, 20,  4,'frutas-verduras','MXN','https://loremflickr.com/600/600/pineapple,tropical','7501000000110'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Fresa de Irapuato',         55.00,32.00, 30,  6,'frutas-verduras','MXN','https://loremflickr.com/600/600/strawberry,fresh','7501000000111'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Uva Roja Sin Semilla',      75.00,48.00, 25,  5,'frutas-verduras','MXN','https://loremflickr.com/600/600/grapes,purple','7501000000112'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Pera de Anjou',             42.00,26.00, 40,  8,'frutas-verduras','MXN','https://loremflickr.com/600/600/pear,green','7501000000113'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Papa Blanca',               18.00, 9.00,150, 30,'frutas-verduras','MXN','https://loremflickr.com/600/600/potato,vegetable','7501000000114'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Cebolla Blanca',            22.00,12.00,100, 20,'frutas-verduras','MXN','https://loremflickr.com/600/600/onion,white','7501000000115'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Zanahoria',                 16.00, 8.00, 80, 15,'frutas-verduras','MXN','https://loremflickr.com/600/600/carrot,orange','7501000000116'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Brócoli',                   35.00,22.00, 30,  6,'frutas-verduras','MXN','https://loremflickr.com/600/600/broccoli,green','7501000000117'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Lechuga Orejona',           20.00,11.00, 25,  5,'frutas-verduras','MXN','https://loremflickr.com/600/600/lettuce,salad','7501000000118'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Espinaca Manojo',           18.00,10.00, 20,  4,'frutas-verduras','MXN','https://loremflickr.com/600/600/spinach,leaf','7501000000119'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Cilantro Manojo',           10.00, 5.00, 50, 10,'frutas-verduras','MXN','https://loremflickr.com/600/600/cilantro,herb','7501000000120'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Chile Jalapeño',            32.00,18.00, 30,  6,'frutas-verduras','MXN','https://loremflickr.com/600/600/jalapeno,pepper','7501000000121'),
  ('TNT-P5E74','fd4c05db-cde2-45bb-a7b0-b1a3391921bd','Calabaza Italiana',         28.00,16.00, 35,  7,'frutas-verduras','MXN','https://loremflickr.com/600/600/zucchini,squash','7501000000122');

COMMIT;
