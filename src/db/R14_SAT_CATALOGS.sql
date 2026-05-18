-- ============================================================
-- VOLVIX · R14 · Catálogos SAT México (CFDI 4.0)
-- Tablas para claveProdServ, claveUnidad, formaPago, metodoPago,
-- usoCFDI, regimenFiscal y mapping productos -> claves SAT.
-- ============================================================

-- ───────── c_ClaveProdServ (subset, top 200) ─────────
CREATE TABLE IF NOT EXISTS sat_clave_prodserv (
  clave           VARCHAR(8) PRIMARY KEY,
  descripcion     TEXT NOT NULL,
  incluye_ieps    BOOLEAN DEFAULT FALSE,
  ieps_categoria  TEXT,
  iva_default     NUMERIC(4,4) DEFAULT 0.16,
  vigente_desde   DATE DEFAULT '2022-01-01',
  vigente_hasta   DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sat_prodserv_desc ON sat_clave_prodserv USING gin(to_tsvector('spanish', descripcion));

INSERT INTO sat_clave_prodserv(clave, descripcion, iva_default) VALUES
  ('01010101','No existe en el catálogo',0.16),
  ('50202306','Comida preparada',0.16),
  ('90101501','Servicio de restaurante',0.16),
  ('90101502','Servicio de cafetería',0.16),
  ('90101503','Servicio de bar',0.16),
  ('50192100','Pan',0.00),
  ('50161509','Café tostado',0.16),
  ('50202203','Pizzas',0.16),
  ('50202209','Hamburguesas',0.16),
  ('50202205','Tacos',0.16),
  ('50202207','Sushi',0.16),
  ('50171550','Refrescos',0.16),
  ('50202310','Agua embotellada',0.16),
  ('50202311','Cerveza',0.16),
  ('50202312','Vinos',0.16),
  ('50202313','Licores destilados',0.16),
  ('50171500','Productos lácteos',0.00),
  ('50112000','Carnes frescas',0.00),
  ('50112004','Pollo',0.00),
  ('50112005','Res',0.00),
  ('50121500','Pescados y mariscos',0.00),
  ('50131600','Frutas frescas',0.00),
  ('50131700','Verduras frescas',0.00),
  ('50161510','Azúcar',0.00),
  ('50161800','Aceites comestibles',0.00),
  ('50181900','Cereales',0.00),
  ('50192300','Galletas',0.16),
  ('50202100','Confitería y dulces',0.16),
  ('50202400','Botanas',0.16),
  ('53131500','Productos higiene personal',0.16),
  ('53131608','Shampoo',0.16),
  ('53131626','Pasta dental',0.16),
  ('53131628','Jabón',0.16),
  ('53131643','Papel higiénico',0.16),
  ('53131649','Toallas femeninas',0.16),
  ('53131653','Pañales',0.16),
  ('47131500','Productos limpieza',0.16),
  ('47131502','Cloro',0.16),
  ('53102500','Ropa hombre',0.16),
  ('53102600','Ropa mujer',0.16),
  ('53102700','Ropa niños',0.16),
  ('53111600','Calzado',0.16),
  ('43211503','Laptops',0.16),
  ('43211507','Tablets',0.16),
  ('43211508','Smartphones',0.16),
  ('43211706','Impresoras',0.16),
  ('52161500','Televisores',0.16),
  ('52161512','Audífonos',0.16),
  ('52141501','Refrigeradores',0.16),
  ('52141505','Lavadoras',0.16),
  ('56101700','Muebles sala',0.16),
  ('56101800','Muebles recámara',0.16),
  ('14111500','Papel',0.16),
  ('44121500','Útiles escolares',0.16),
  ('27112000','Herramientas manuales',0.16),
  ('51100000','Medicamentos',0.00),
  ('25172500','Neumáticos',0.16),
  ('25174000','Aceites lubricantes',0.16),
  ('15101506','Gasolina magna',0.16),
  ('15101507','Gasolina premium',0.16),
  ('15101508','Diésel',0.16),
  ('80101500','Servicios consultoría',0.16),
  ('80111600','Honorarios profesionales',0.16),
  ('80131500','Arrendamiento bienes raíces',0.16),
  ('81111500','Servicios software',0.16),
  ('90111500','Hospedaje',0.16),
  ('85101500','Servicios médicos',NULL),
  ('86101700','Servicios educativos',NULL),
  ('60141000','Juguetes',0.16),
  ('49161500','Artículos deportivos',0.16)
ON CONFLICT (clave) DO NOTHING;

-- IEPS por clave
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='cerveza'                     WHERE clave='50202311';
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='bebidas_alcoholicas_14a20'    WHERE clave='50202312';
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='bebidas_alcoholicas_mas20'    WHERE clave='50202313';
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='alimentos_alta_densidad'      WHERE clave IN ('50202400','50202100','50192300');
UPDATE sat_clave_prodserv SET incluye_ieps=TRUE, ieps_categoria='combustibles_fosiles'         WHERE clave IN ('15101506','15101507','15101508');

-- ───────── c_ClaveUnidad ─────────
CREATE TABLE IF NOT EXISTS sat_clave_unidad (
  clave        VARCHAR(3) PRIMARY KEY,
  nombre       TEXT NOT NULL,
  simbolo      TEXT,
  descripcion  TEXT,
  vigente_desde DATE DEFAULT '2017-01-01',
  vigente_hasta DATE
);
INSERT INTO sat_clave_unidad(clave,nombre,simbolo) VALUES
  ('PIE','Pieza','pieza'),('KGM','Kilogramo','kg'),('GRM','Gramo','g'),
  ('LTR','Litro','L'),('MLT','Mililitro','mL'),('MTR','Metro','m'),
  ('CMT','Centímetro','cm'),('MTK','Metro cuadrado','m²'),('MTQ','Metro cúbico','m³'),
  ('H87','Pieza','pza'),('EA','Cada uno','ea'),('ACT','Actividad','act'),
  ('BX','Caja','caja'),('PR','Par','par'),('SET','Juego','set'),
  ('XBX','Caja','caja'),('XPK','Paquete','pack'),('KT','Kit','kit'),
  ('HUR','Hora','h'),('DAY','Día','d'),('MON','Mes','mes'),
  ('E48','Servicio','svc'),('ZZ','Mutuamente definido',NULL)
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_FormaPago ─────────
CREATE TABLE IF NOT EXISTS sat_forma_pago (
  clave        VARCHAR(2) PRIMARY KEY,
  descripcion  TEXT NOT NULL,
  bancarizado  BOOLEAN DEFAULT FALSE,
  vigente_desde DATE DEFAULT '2017-01-01'
);
INSERT INTO sat_forma_pago(clave, descripcion, bancarizado) VALUES
  ('01','Efectivo',FALSE),('02','Cheque nominativo',TRUE),
  ('03','Transferencia electrónica de fondos',TRUE),
  ('04','Tarjeta de crédito',TRUE),('05','Monedero electrónico',TRUE),
  ('06','Dinero electrónico',TRUE),('08','Vales de despensa',FALSE),
  ('12','Dación en pago',FALSE),('13','Pago por subrogación',FALSE),
  ('14','Pago por consignación',FALSE),('15','Condonación',FALSE),
  ('17','Compensación',FALSE),('23','Novación',FALSE),
  ('24','Confusión',FALSE),('25','Remisión de deuda',FALSE),
  ('26','Prescripción o caducidad',FALSE),('27','A satisfacción del acreedor',FALSE),
  ('28','Tarjeta de débito',TRUE),('29','Tarjeta de servicios',TRUE),
  ('30','Aplicación de anticipos',FALSE),('31','Intermediario pagos',TRUE),
  ('99','Por definir',FALSE)
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_MetodoPago ─────────
CREATE TABLE IF NOT EXISTS sat_metodo_pago (
  clave        VARCHAR(3) PRIMARY KEY,
  descripcion  TEXT NOT NULL
);
INSERT INTO sat_metodo_pago(clave,descripcion) VALUES
  ('PUE','Pago en una sola exhibición'),
  ('PPD','Pago en parcialidades o diferido')
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_UsoCFDI (extendido CFDI 4.0) ─────────
CREATE TABLE IF NOT EXISTS sat_uso_cfdi (
  clave           VARCHAR(4) PRIMARY KEY,
  descripcion     TEXT NOT NULL,
  aplica_pf       BOOLEAN DEFAULT TRUE,
  aplica_pm       BOOLEAN DEFAULT TRUE,
  regimenes_pf    TEXT[],
  regimenes_pm    TEXT[],
  vigente_desde   DATE DEFAULT '2022-01-01'
);
INSERT INTO sat_uso_cfdi(clave,descripcion,aplica_pf,aplica_pm) VALUES
  ('G01','Adquisición de mercancías',TRUE,TRUE),
  ('G02','Devoluciones, descuentos o bonificaciones',TRUE,TRUE),
  ('G03','Gastos en general',TRUE,TRUE),
  ('I01','Construcciones',TRUE,TRUE),
  ('I02','Mobiliario y equipo de oficina por inversiones',TRUE,TRUE),
  ('I03','Equipo de transporte',TRUE,TRUE),
  ('I04','Equipo de cómputo y accesorios',TRUE,TRUE),
  ('I05','Dados, troqueles, moldes, matrices y herramental',TRUE,TRUE),
  ('I06','Comunicaciones telefónicas',TRUE,TRUE),
  ('I07','Comunicaciones satelitales',TRUE,TRUE),
  ('I08','Otra maquinaria y equipo',TRUE,TRUE),
  ('D01','Honorarios médicos, dentales y gastos hospitalarios',TRUE,FALSE),
  ('D02','Gastos médicos por incapacidad o discapacidad',TRUE,FALSE),
  ('D03','Gastos funerales',TRUE,FALSE),
  ('D04','Donativos',TRUE,FALSE),
  ('D05','Intereses reales por créditos hipotecarios (casa habitación)',TRUE,FALSE),
  ('D06','Aportaciones voluntarias al SAR',TRUE,FALSE),
  ('D07','Primas por seguros de gastos médicos',TRUE,FALSE),
  ('D08','Gastos de transportación escolar obligatoria',TRUE,FALSE),
  ('D09','Depósitos en cuentas para el ahorro, primas planes de pensiones',TRUE,FALSE),
  ('D10','Pagos por servicios educativos (colegiaturas)',TRUE,FALSE),
  ('CP01','Pagos',TRUE,TRUE),
  ('S01','Sin efectos fiscales',TRUE,TRUE)
ON CONFLICT (clave) DO NOTHING;

-- ───────── c_RegimenFiscal ─────────
CREATE TABLE IF NOT EXISTS sat_regimen_fiscal (
  clave        VARCHAR(3) PRIMARY KEY,
  descripcion  TEXT NOT NULL,
  aplica_pf    BOOLEAN DEFAULT FALSE,
  aplica_pm    BOOLEAN DEFAULT FALSE
);
INSERT INTO sat_regimen_fiscal(clave,descripcion,aplica_pf,aplica_pm) VALUES
  ('601','General de Ley Personas Morales',FALSE,TRUE),
  ('603','Personas Morales con Fines no Lucrativos',FALSE,TRUE),
  ('605','Sueldos y Salarios e Ingresos Asimilados a Salarios',TRUE,FALSE),
  ('606','Arrendamiento',TRUE,FALSE),
  ('607','Régimen de Enajenación o Adquisición de Bienes',TRUE,FALSE),
  ('608','Demás ingresos',TRUE,FALSE),
  ('610','Residentes en el Extranjero sin Establecimiento Permanente',TRUE,TRUE),
  ('611','Ingresos por Dividendos (socios y accionistas)',TRUE,FALSE),
  ('612','Personas Físicas con Actividades Empresariales y Profesionales',TRUE,FALSE),
  ('614','Ingresos por intereses',TRUE,FALSE),
  ('615','Régimen de los ingresos por obtención de premios',TRUE,FALSE),
  ('616','Sin obligaciones fiscales',TRUE,FALSE),
  ('620','Sociedades Cooperativas de Producción',FALSE,TRUE),
  ('621','Incorporación Fiscal',TRUE,FALSE),
  ('622','Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',FALSE,TRUE),
  ('623','Opcional para Grupos de Sociedades',FALSE,TRUE),
  ('624','Coordinados',FALSE,TRUE),
  ('625','Régimen Plataformas Tecnológicas',TRUE,FALSE),
  ('626','Régimen Simplificado de Confianza (RESICO)',TRUE,TRUE)
ON CONFLICT (clave) DO NOTHING;

-- ───────── product_sat_mapping ─────────
CREATE TABLE IF NOT EXISTS product_sat_mapping (
  id              BIGSERIAL PRIMARY KEY,
  product_id      UUID,
  product_code    TEXT,
  tenant_id       UUID,
  clave_prodserv  VARCHAR(8) NOT NULL REFERENCES sat_clave_prodserv(clave),
  clave_unidad    VARCHAR(3) NOT NULL REFERENCES sat_clave_unidad(clave),
  iva_tipo        VARCHAR(10) DEFAULT '16',  -- '16'|'8'|'0'|'exento'
  ieps_categoria  TEXT,
  objeto_imp      VARCHAR(2) DEFAULT '02',   -- 01 no objeto, 02 sí objeto, 03 sí objeto no obligado, 04 no obligado IEPS
  source          TEXT DEFAULT 'manual',     -- 'auto'|'manual'|'imported'
  confidence      NUMERIC(3,2) DEFAULT 1.0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id),
  UNIQUE(tenant_id, product_code)
);
CREATE INDEX IF NOT EXISTS idx_psm_product   ON product_sat_mapping(product_id);
CREATE INDEX IF NOT EXISTS idx_psm_tenant    ON product_sat_mapping(tenant_id);
CREATE INDEX IF NOT EXISTS idx_psm_prodserv  ON product_sat_mapping(clave_prodserv);

-- RLS
ALTER TABLE product_sat_mapping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS psm_tenant_isolation ON product_sat_mapping;
CREATE POLICY psm_tenant_isolation ON product_sat_mapping
  USING (tenant_id IS NULL OR tenant_id::text = current_setting('app.tenant_id', true));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_psm_updated() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS psm_updated_at ON product_sat_mapping;
CREATE TRIGGER psm_updated_at BEFORE UPDATE ON product_sat_mapping
  FOR EACH ROW EXECUTE FUNCTION trg_psm_updated();
