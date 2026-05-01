-- migrations/giros-synonyms.sql
-- Tabla de giros con sinónimos para autocomplete inteligente.
-- Permite que "tacos", "venta de comida", "hot dogs" sugieran giros relevantes.

CREATE TABLE IF NOT EXISTS giros_synonyms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  giro_slug text NOT NULL,
  name text NOT NULL,
  synonyms text[] DEFAULT '{}',
  what_they_sell text[] DEFAULT '{}',
  category text,
  popular_searches text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_giros_synonyms_slug ON giros_synonyms (giro_slug);
CREATE INDEX IF NOT EXISTS idx_giros_synonyms_search ON giros_synonyms USING GIN (synonyms);
CREATE INDEX IF NOT EXISTS idx_giros_synonyms_sells ON giros_synonyms USING GIN (what_they_sell);
CREATE INDEX IF NOT EXISTS idx_giros_synonyms_name_trgm ON giros_synonyms USING GIN (name gin_trgm_ops);

-- Habilitar trigram para ILIKE eficiente (si extension no instalada)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Seed inicial: 63 giros con sinónimos. Se puede expandir.
INSERT INTO giros_synonyms (giro_slug, name, synonyms, what_they_sell, category) VALUES
  ('restaurante', 'Restaurante', ARRAY['comida','food','restaurant','restaurantes','venta de comida','comer','cena','almuerzo','desayuno','cocina','menu','platillos'], ARRAY['comida','platillos','bebidas'], 'food'),
  ('taqueria', 'Taquería', ARRAY['taco','tacos','taquero','taqueros','taquería','pastor','suadero'], ARRAY['tacos','quesadillas','salsas'], 'food'),
  ('pizzeria', 'Pizzería', ARRAY['pizza','pizzas','pizzeria','italiana','italiano'], ARRAY['pizza','calzone','pasta'], 'food'),
  ('cafeteria', 'Cafetería', ARRAY['cafe','cafetería','expresso','espresso','cappuccino','mocha','latte','café'], ARRAY['café','postres','sandwiches'], 'food'),
  ('panaderia', 'Panadería', ARRAY['pan','panes','panadero','bolillos','conchas','pastel','bakery'], ARRAY['pan','bollos','bolillos','conchas'], 'food'),
  ('pasteleria', 'Pastelería', ARRAY['pasteles','cakes','reposteria','postres','repostería'], ARRAY['pasteles','tartas','postres'], 'food'),
  ('heladeria', 'Heladería', ARRAY['helados','paletas','nieves','ice cream','helado'], ARRAY['helados','paletas','nieves'], 'food'),
  ('tortilleria', 'Tortillería', ARRAY['tortillas','tortilleria','tortilladora'], ARRAY['tortillas','masa'], 'food'),
  ('barberia', 'Barbería', ARRAY['barbería','barber','corte cabello hombre','barba','rasurar'], ARRAY['cortes','rasurado','barba'], 'service'),
  ('estetica', 'Estética', ARRAY['salón','estilista','peluquería','corte de cabello','salon','peluqueria','beauty'], ARRAY['cortes','tintes','peinados'], 'service'),
  ('spa', 'Spa', ARRAY['masajes','relajación','sauna','jacuzzi'], ARRAY['masajes','tratamientos','faciales'], 'service'),
  ('nails', 'Salón de Uñas', ARRAY['uñas','manicure','pedicure','nail','acrilico'], ARRAY['manicure','pedicure','acrílicos'], 'service'),
  ('tatuajes', 'Estudio de Tatuajes', ARRAY['tattoo','tatuajes','piercing','tatuador'], ARRAY['tatuajes','piercings'], 'service'),
  ('farmacia', 'Farmacia', ARRAY['medicinas','medicamentos','pharmacy','drug store','farmacéutica'], ARRAY['medicamentos','vitaminas','primeros auxilios'], 'health'),
  ('clinica_dental', 'Clínica Dental', ARRAY['dentista','dental','muelas','dentadura','ortodoncia'], ARRAY['consultas','limpiezas','tratamientos'], 'health'),
  ('veterinaria', 'Veterinaria', ARRAY['veterinario','vet','mascotas','perros','gatos','animales'], ARRAY['consultas','vacunas','medicamentos'], 'health'),
  ('optica', 'Óptica', ARRAY['lentes','anteojos','optometría','optometra','vista'], ARRAY['lentes','armazones','exámenes'], 'health'),
  ('abarrotes', 'Abarrotes', ARRAY['tienda','tendajón','tendajon','misceláneo','abarrote','tiendita','minisuper','miscelanea'], ARRAY['refrescos','botanas','despensa'], 'retail'),
  ('minisuper', 'Minisúper', ARRAY['minisuper','minisúper','mini super','convenience','oxxo'], ARRAY['despensa','refrescos','snacks'], 'retail'),
  ('papeleria', 'Papelería', ARRAY['papel','cuadernos','utiles','escolares','copy','impresiones','papelería'], ARRAY['cuadernos','plumas','copias'], 'retail'),
  ('fruteria', 'Frutería', ARRAY['fruta','verduras','frutas','verdura','frutería'], ARRAY['frutas','verduras','jugos'], 'food'),
  ('carniceria', 'Carnicería', ARRAY['carne','res','cerdo','pollo','carnicería','carnicero'], ARRAY['carne','res','pollo','cerdo'], 'food'),
  ('polleria', 'Pollería', ARRAY['pollo','pollos','pollería','rosticeria','rostizado'], ARRAY['pollo crudo','pollo rostizado'], 'food'),
  ('taller_mecanico', 'Taller Mecánico', ARRAY['mecanico','mecánico','taller','autos','carros','reparación','vehiculos'], ARRAY['servicios','refacciones','aceites'], 'service'),
  ('lavado_autos', 'Lavado de Autos', ARRAY['lavado','autolavado','car wash','encerado','detallado'], ARRAY['lavados','encerados','aspirados'], 'service'),
  ('servicio_celulares', 'Servicio de Celulares', ARRAY['celulares','reparacion celulares','accesorios','telefonos','reparacion movil','iphone','android'], ARRAY['fundas','reparaciones','accesorios'], 'service'),
  ('colegio', 'Colegio', ARRAY['escuela','primaria','secundaria','prepa','preparatoria','kinder','colegio'], ARRAY['inscripciones','colegiaturas','uniformes'], 'education'),
  ('gimnasio', 'Gimnasio', ARRAY['gym','gimnasio','fitness','crossfit','pesas','ejercicio','workout'], ARRAY['membresías','clases','suplementos'], 'fitness'),
  ('escuela_idiomas', 'Escuela de Idiomas', ARRAY['ingles','inglés','frances','francés','idiomas','language'], ARRAY['cursos','materiales'], 'education'),
  ('renta_autos', 'Renta de Autos', ARRAY['rent a car','renta autos','renta vehiculos','car rental'], ARRAY['rentas','seguros'], 'service'),
  ('renta_salones', 'Renta de Salones', ARRAY['salon eventos','salón eventos','fiestas','bodas','renta salon'], ARRAY['salones','sillas','mesas'], 'service'),
  ('foto_estudio', 'Estudio Fotográfico', ARRAY['fotografia','fotografía','foto','photo','sesiones'], ARRAY['sesiones','impresiones','retoque'], 'service'),
  ('ferreteria', 'Ferretería', ARRAY['ferretería','herramientas','tornillos','clavos','pinturas','plomeria','plomería'], ARRAY['herramientas','tornillería','pinturas'], 'retail'),
  ('gasolinera', 'Gasolinera', ARRAY['gasolina','combustible','gas','diesel','pemex'], ARRAY['gasolina','diésel','aceites'], 'service'),
  ('funeraria', 'Funeraria', ARRAY['funerales','servicios funerarios','velación','panteón'], ARRAY['ataúdes','servicios'], 'service'),
  ('purificadora', 'Purificadora de Agua', ARRAY['agua','purificada','garrafones','agua potable'], ARRAY['agua','garrafones','hielo'], 'retail'),
  ('lavanderia', 'Lavandería', ARRAY['lavanderia','tintoreria','tintorería','lavado de ropa','planchado'], ARRAY['lavado','planchado','tintorería'], 'service'),
  ('floreria', 'Florería', ARRAY['flores','florería','arreglos florales','ramos','bouquet'], ARRAY['arreglos','ramos','flores'], 'retail'),
  ('joyeria', 'Joyería', ARRAY['joyas','oro','plata','anillos','joyería','collares'], ARRAY['joyas','reparaciones'], 'retail'),
  ('zapateria', 'Zapatería', ARRAY['zapatos','calzado','zapatería','tenis','sandalias'], ARRAY['zapatos','tenis','sandalias'], 'retail'),
  ('ropa', 'Tienda de Ropa', ARRAY['ropa','clothing','boutique','vestidos','pantalones','camisas'], ARRAY['ropa','accesorios'], 'retail'),
  ('libreria', 'Librería', ARRAY['libros','librería','book','revistas','editorial'], ARRAY['libros','revistas'], 'retail'),
  ('mueblería', 'Mueblería', ARRAY['muebles','mueblería','sillones','camas','mesas','recámaras'], ARRAY['muebles','colchones','camas'], 'retail'),
  ('hotel', 'Hotel', ARRAY['hospedaje','hotel','motel','posada','hostal'], ARRAY['habitaciones','servicios'], 'hospitality'),
  ('cantina', 'Cantina/Bar', ARRAY['bar','cantina','cervezas','cerveza','tragos','antros','cocteles'], ARRAY['cervezas','licores','botanas'], 'food'),
  ('disco', 'Antro/Discoteca', ARRAY['antro','disco','club','nightclub','baile','dj'], ARRAY['cover','bebidas','botellas'], 'food'),
  ('foodtruck', 'Food Truck', ARRAY['food truck','foodtruck','hamburguesas','hot dogs','hotdogs','dogos','comida rapida'], ARRAY['hamburguesas','hot dogs','snacks'], 'food'),
  ('sushi', 'Sushi', ARRAY['sushi','rolls','japonés','japonesa','nigiri','sashimi'], ARRAY['rolls','sashimi','sopas'], 'food'),
  ('parking', 'Estacionamiento', ARRAY['parking','estacionamiento','pension','pensión'], ARRAY['horas','mensualidades'], 'service'),
  ('hotel_mascotas', 'Hotel de Mascotas', ARRAY['guarderia mascotas','pet hotel','daycare perros','hotel perros'], ARRAY['estancias','baños'], 'service'),
  ('cremeria', 'Cremería', ARRAY['quesos','cremas','lácteos','lacteos','cremería'], ARRAY['quesos','crema','mantequilla'], 'food'),
  ('vinateria', 'Vinatería', ARRAY['vinos','licores','tequila','mezcal','whisky','vinatería'], ARRAY['vinos','licores'], 'retail'),
  ('cine', 'Cine', ARRAY['cine','pelicula','películas','cinema','funciones'], ARRAY['boletos','dulcería'], 'entertainment'),
  ('bowling', 'Boliche', ARRAY['boliche','bowling','bolos'], ARRAY['rentas','comida','bebidas'], 'entertainment'),
  ('karaoke', 'Karaoke', ARRAY['karaoke','canto','bar karaoke'], ARRAY['rentas','bebidas'], 'entertainment'),
  ('cafe_internet', 'Café Internet', ARRAY['cyber','internet','impresiones','cibercafe'], ARRAY['horas','impresiones','copias'], 'service'),
  ('renta_equipo', 'Renta de Equipo', ARRAY['renta','equipo','rental','herramientas renta'], ARRAY['rentas'], 'service'),
  ('paqueteria', 'Paquetería', ARRAY['envios','envíos','paqueteria','paquetería','dhl','fedex','estafeta'], ARRAY['envíos','paquetes'], 'service'),
  ('fotografia', 'Fotografía', ARRAY['fotos','fotógrafo','sesion','sesión','eventos foto'], ARRAY['sesiones','impresiones'], 'service'),
  ('mecanica_motos', 'Mecánica de Motos', ARRAY['motos','motocicletas','taller motos','mecanica motos'], ARRAY['servicios','refacciones'], 'service'),
  ('inmobiliaria', 'Inmobiliaria', ARRAY['inmobiliaria','bienes raices','casas','departamentos','rentas inmuebles'], ARRAY['rentas','ventas'], 'service'),
  ('notaria', 'Notaría', ARRAY['notaria','notarial','escrituras','poderes','notario'], ARRAY['servicios notariales'], 'service'),
  ('dulceria', 'Dulcería', ARRAY['dulces','candy','golosinas','chocolates','dulcería'], ARRAY['dulces','chocolates','botanas'], 'retail'),
  ('tabaqueria', 'Tabaquería', ARRAY['cigarros','tabaco','cigarrillos','vapeador','tabaquería'], ARRAY['cigarros','tabaco','accesorios'], 'retail'),
  ('otro', 'Otro', ARRAY['otro','other','varios'], ARRAY['varios'], 'other')
ON CONFLICT (giro_slug) DO NOTHING;
