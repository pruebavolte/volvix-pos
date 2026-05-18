-- Migration 11: Multi-imagen, multi-video, descripción larga, ficha técnica en pos_products
-- 2026-05-18

BEGIN;

-- 1. Columnas nuevas
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,        -- [{"url":"...","alt":"..."}]
  ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb,        -- [{"url":"...","title":"..."}]
  ADD COLUMN IF NOT EXISTS description_long TEXT,                   -- markdown/HTML
  ADD COLUMN IF NOT EXISTS tech_info JSONB DEFAULT '{}'::jsonb;     -- {"origen":"...","conservacion":"..."}

-- 2. Migrar image_url existente → images[0] si vacío
UPDATE pos_products
SET images = jsonb_build_array(jsonb_build_object('url', image_url, 'alt', name))
WHERE image_url IS NOT NULL
  AND image_url != ''
  AND (images IS NULL OR images = '[]'::jsonb);

-- 3. Enriquecer 22 productos frutería de TNT-P5E74 con images[3-4] + tech_info
-- Helper: cada producto tiene 3 fotos relacionadas + info técnica.

WITH actualizar AS (
  SELECT id, name FROM pos_products
  WHERE tenant_id = 'TNT-P5E74' AND name IN (
    'Tomate Saladette','Manzana Roja','Plátano Tabasco','Naranja Valencia',
    'Limón sin Semilla','Aguacate Hass','Papaya Maradol','Sandía sin Semilla',
    'Mango Ataulfo','Piña Miel','Fresa de Irapuato','Uva Roja Sin Semilla',
    'Pera de Anjou','Papa Blanca','Cebolla Blanca','Zanahoria','Brócoli',
    'Lechuga Orejona','Espinaca Manojo','Cilantro Manojo','Chile Jalapeño','Calabaza Italiana'
  )
)
UPDATE pos_products p
SET
  images = (
    CASE p.name
      WHEN 'Tomate Saladette' THEN '[{"url":"https://loremflickr.com/800/800/tomato,fresh","alt":"Tomate fresco"},{"url":"https://loremflickr.com/800/800/tomato,red","alt":"Tomate rojo"},{"url":"https://loremflickr.com/800/800/tomato,salad","alt":"Tomate en ensalada"}]'::jsonb
      WHEN 'Manzana Roja' THEN '[{"url":"https://loremflickr.com/800/800/red,apple","alt":"Manzana roja"},{"url":"https://loremflickr.com/800/800/apple,fruit","alt":"Manzana"},{"url":"https://loremflickr.com/800/800/apple,tree","alt":"Manzana en árbol"}]'::jsonb
      WHEN 'Plátano Tabasco' THEN '[{"url":"https://loremflickr.com/800/800/banana,yellow","alt":"Plátano"},{"url":"https://loremflickr.com/800/800/banana,bunch","alt":"Racimo plátanos"},{"url":"https://loremflickr.com/800/800/banana,tropical","alt":"Plátano tropical"}]'::jsonb
      WHEN 'Naranja Valencia' THEN '[{"url":"https://loremflickr.com/800/800/orange,citrus","alt":"Naranja"},{"url":"https://loremflickr.com/800/800/orange,juice","alt":"Jugo de naranja"},{"url":"https://loremflickr.com/800/800/orange,fruit","alt":"Naranja fresca"}]'::jsonb
      WHEN 'Limón sin Semilla' THEN '[{"url":"https://loremflickr.com/800/800/lime,lemon","alt":"Limón"},{"url":"https://loremflickr.com/800/800/lime,green","alt":"Limón verde"},{"url":"https://loremflickr.com/800/800/lemon,slice","alt":"Limón rebanado"}]'::jsonb
      WHEN 'Aguacate Hass' THEN '[{"url":"https://loremflickr.com/800/800/avocado,green","alt":"Aguacate"},{"url":"https://loremflickr.com/800/800/avocado,cut","alt":"Aguacate cortado"},{"url":"https://loremflickr.com/800/800/avocado,guacamole","alt":"Guacamole"}]'::jsonb
      WHEN 'Papaya Maradol' THEN '[{"url":"https://loremflickr.com/800/800/papaya,tropical","alt":"Papaya"},{"url":"https://loremflickr.com/800/800/papaya,orange","alt":"Papaya naranja"},{"url":"https://loremflickr.com/800/800/papaya,slice","alt":"Papaya rebanada"}]'::jsonb
      WHEN 'Sandía sin Semilla' THEN '[{"url":"https://loremflickr.com/800/800/watermelon,red","alt":"Sandía"},{"url":"https://loremflickr.com/800/800/watermelon,slice","alt":"Sandía rebanada"},{"url":"https://loremflickr.com/800/800/watermelon,green","alt":"Sandía completa"}]'::jsonb
      WHEN 'Mango Ataulfo' THEN '[{"url":"https://loremflickr.com/800/800/mango,yellow","alt":"Mango"},{"url":"https://loremflickr.com/800/800/mango,tropical","alt":"Mango tropical"},{"url":"https://loremflickr.com/800/800/mango,fruit","alt":"Mango fresco"}]'::jsonb
      WHEN 'Piña Miel' THEN '[{"url":"https://loremflickr.com/800/800/pineapple,tropical","alt":"Piña"},{"url":"https://loremflickr.com/800/800/pineapple,yellow","alt":"Piña miel"},{"url":"https://loremflickr.com/800/800/pineapple,cut","alt":"Piña rebanada"}]'::jsonb
      WHEN 'Fresa de Irapuato' THEN '[{"url":"https://loremflickr.com/800/800/strawberry,fresh","alt":"Fresa"},{"url":"https://loremflickr.com/800/800/strawberry,red","alt":"Fresa roja"},{"url":"https://loremflickr.com/800/800/strawberry,basket","alt":"Canasto fresas"}]'::jsonb
      WHEN 'Uva Roja Sin Semilla' THEN '[{"url":"https://loremflickr.com/800/800/grapes,purple","alt":"Uvas"},{"url":"https://loremflickr.com/800/800/grapes,red","alt":"Uvas rojas"},{"url":"https://loremflickr.com/800/800/grapes,bunch","alt":"Racimo uvas"}]'::jsonb
      WHEN 'Pera de Anjou' THEN '[{"url":"https://loremflickr.com/800/800/pear,green","alt":"Pera"},{"url":"https://loremflickr.com/800/800/pear,fruit","alt":"Pera fresca"},{"url":"https://loremflickr.com/800/800/pear,ripe","alt":"Pera madura"}]'::jsonb
      WHEN 'Papa Blanca' THEN '[{"url":"https://loremflickr.com/800/800/potato,vegetable","alt":"Papa"},{"url":"https://loremflickr.com/800/800/potato,raw","alt":"Papa cruda"},{"url":"https://loremflickr.com/800/800/potato,brown","alt":"Papa blanca"}]'::jsonb
      WHEN 'Cebolla Blanca' THEN '[{"url":"https://loremflickr.com/800/800/onion,white","alt":"Cebolla"},{"url":"https://loremflickr.com/800/800/onion,vegetable","alt":"Cebollas"},{"url":"https://loremflickr.com/800/800/onion,sliced","alt":"Cebolla rebanada"}]'::jsonb
      WHEN 'Zanahoria' THEN '[{"url":"https://loremflickr.com/800/800/carrot,orange","alt":"Zanahoria"},{"url":"https://loremflickr.com/800/800/carrot,vegetable","alt":"Zanahorias"},{"url":"https://loremflickr.com/800/800/carrot,bunch","alt":"Manojo zanahorias"}]'::jsonb
      WHEN 'Brócoli' THEN '[{"url":"https://loremflickr.com/800/800/broccoli,green","alt":"Brócoli"},{"url":"https://loremflickr.com/800/800/broccoli,vegetable","alt":"Brócoli verde"},{"url":"https://loremflickr.com/800/800/broccoli,fresh","alt":"Brócoli fresco"}]'::jsonb
      WHEN 'Lechuga Orejona' THEN '[{"url":"https://loremflickr.com/800/800/lettuce,salad","alt":"Lechuga"},{"url":"https://loremflickr.com/800/800/lettuce,green","alt":"Lechuga verde"},{"url":"https://loremflickr.com/800/800/lettuce,leaves","alt":"Hojas de lechuga"}]'::jsonb
      WHEN 'Espinaca Manojo' THEN '[{"url":"https://loremflickr.com/800/800/spinach,leaf","alt":"Espinaca"},{"url":"https://loremflickr.com/800/800/spinach,green","alt":"Espinaca verde"},{"url":"https://loremflickr.com/800/800/spinach,fresh","alt":"Espinaca fresca"}]'::jsonb
      WHEN 'Cilantro Manojo' THEN '[{"url":"https://loremflickr.com/800/800/cilantro,herb","alt":"Cilantro"},{"url":"https://loremflickr.com/800/800/cilantro,green","alt":"Cilantro verde"},{"url":"https://loremflickr.com/800/800/herbs,coriander","alt":"Hierba cilantro"}]'::jsonb
      WHEN 'Chile Jalapeño' THEN '[{"url":"https://loremflickr.com/800/800/jalapeno,pepper","alt":"Chile jalapeño"},{"url":"https://loremflickr.com/800/800/pepper,green","alt":"Chile verde"},{"url":"https://loremflickr.com/800/800/jalapeno,spicy","alt":"Jalapeño picante"}]'::jsonb
      WHEN 'Calabaza Italiana' THEN '[{"url":"https://loremflickr.com/800/800/zucchini,squash","alt":"Calabaza italiana"},{"url":"https://loremflickr.com/800/800/zucchini,vegetable","alt":"Calabaza"},{"url":"https://loremflickr.com/800/800/zucchini,green","alt":"Calabaza verde"}]'::jsonb
      ELSE p.images
    END
  ),
  description_long = CASE p.name
    WHEN 'Tomate Saladette' THEN 'Tomate fresco tipo saladette, ideal para ensaladas, salsas y guisos. Rojo intenso, firme y jugoso. Cosechado en la Bajío mexicano. Conservación óptima a temperatura ambiente.'
    WHEN 'Manzana Roja' THEN 'Manzana roja tipo Red Delicious. Dulce, crujiente, perfecta para comer al natural o en postres. Origen Chihuahua. Refrigerada dura 3-4 semanas.'
    WHEN 'Plátano Tabasco' THEN 'Plátano dominico originario de Tabasco. Maduración lenta, sabor dulce intenso. Rico en potasio. Ideal para licuados, postres y consumo directo.'
    WHEN 'Aguacate Hass' THEN 'Aguacate Hass mexicano de Michoacán. Pulpa cremosa, sabor inigualable. Perfecto para guacamole, ensaladas y tostadas. Maduración 3-5 días en temperatura ambiente.'
    WHEN 'Papaya Maradol' THEN 'Papaya Maradol mexicana de Tabasco/Veracruz. Pulpa naranja intensa, dulce, rica en vitamina A y enzimas digestivas. Mejor consumida fresca.'
    WHEN 'Fresa de Irapuato' THEN 'Fresa de Irapuato, Guanajuato. Rojo intenso, aroma dulce. Ideal para postres, ensaladas y consumo directo. Refrigerada dura 5-7 días.'
    WHEN 'Mango Ataulfo' THEN 'Mango Ataulfo, variedad mexicana premium. Pulpa amarilla, sin fibra, dulzura excepcional. Cosechado en Chiapas y Oaxaca. Temporada marzo-agosto.'
    ELSE 'Producto fresco de la temporada. Almacenamiento óptimo en lugar fresco y ventilado.'
  END,
  tech_info = CASE p.name
    WHEN 'Tomate Saladette' THEN '{"origen":"Bajío MX","conservacion":"Ambiente, 5-7 días","temporada":"todo el año","peso_promedio":"180g","calorias_100g":18,"vitamina_C":"14mg/100g"}'::jsonb
    WHEN 'Aguacate Hass' THEN '{"origen":"Michoacán MX","conservacion":"3-5 días maduración","temporada":"todo el año","peso_promedio":"220g","calorias_100g":160,"grasa_saludable":"15g/100g"}'::jsonb
    WHEN 'Mango Ataulfo' THEN '{"origen":"Chiapas/Oaxaca MX","conservacion":"5-7 días refrigerado","temporada":"marzo-agosto","peso_promedio":"280g","calorias_100g":60,"vitamina_A":"alta"}'::jsonb
    WHEN 'Fresa de Irapuato' THEN '{"origen":"Irapuato GTO","conservacion":"5-7 días refrigerado","temporada":"diciembre-mayo","peso_promedio":"500g/canasta","vitamina_C":"58mg/100g"}'::jsonb
    WHEN 'Papaya Maradol' THEN '{"origen":"Tabasco/Veracruz MX","conservacion":"4-6 días refrigerado","temporada":"todo el año","peso_promedio":"1.5kg","vitamina_A":"muy alta","enzima":"papaína"}'::jsonb
    ELSE jsonb_build_object('origen','MX','conservacion','3-7 días','temporada','todo el año')
  END
FROM actualizar a
WHERE p.id = a.id;

COMMIT;

-- Verificar
-- SELECT name, jsonb_array_length(images) AS num_imgs, description_long IS NOT NULL AS tiene_desc, tech_info FROM pos_products WHERE tenant_id='TNT-P5E74' AND name LIKE '%Tomate%';
