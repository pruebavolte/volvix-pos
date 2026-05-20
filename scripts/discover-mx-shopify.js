#!/usr/bin/env node
/**
 * discover-mx-shopify.js (V10.37)
 *
 * Prueba decenas de URLs MX por giro testing /products.json (Shopify).
 * Si funciona (200 + json válido con products[]), reporta como candidata.
 *
 * Estrategia: probar dominios .com.mx, .mx, .com (con productos MX)
 * que son tiendas pequeñas/medianas (usan Shopify mucho más que las
 * marcas grandes con Cloudflare).
 */
'use strict';

const https = require('https');

function fetch(url, timeoutMs = 5000) {
  return new Promise(r => {
    const t = setTimeout(() => { try { req.destroy(); } catch(_){} r({ status: 0, error: 'timeout' }); }, timeoutMs);
    const req = https.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        'Accept': 'application/json',
      }
    }, res => {
      let body = '';
      res.on('data', c => { body += c; if (body.length > 200000) req.destroy(); });
      res.on('end', () => { clearTimeout(t); r({ status: res.statusCode, body, headers: res.headers }); });
    });
    req.on('error', e => { clearTimeout(t); r({ status: 0, error: e.message.slice(0,60) }); });
    req.end();
  });
}

// Lista de candidatas por giro (sitios MX reales que probablemente usen Shopify)
const CANDIDATES = {
  // VETERINARIA / MASCOTAS
  veterinaria: [
    'https://maskotamx.com',
    'https://jardindelasmascotas.com',
    'https://petfoodstore.mx',
    'https://elvet.mx',
    'https://wuaui.mx',
    'https://pawnetic.mx',
    'https://www.zooplus.com.mx',
    'https://furniturepets.mx',
  ],
  // FERRETERIA
  ferreteria: [
    'https://www.urrea.com.mx',
    'https://www.tornillopan.com',
    'https://tornitec.com.mx',
    'https://ferreteros.mx',
    'https://www.steren.com.mx',  // electrónica/ferretería
    'https://www.toolmexico.com',
    'https://herramentasmexicanas.com',
  ],
  // PIZZERIA
  pizzeria: [
    'https://pizzasalcoba.com',
    'https://amorpastapizza.com.mx',
    'https://pizzasdesignyo.com',
    'https://pizzeriaartesanal.mx',
    'https://pizzeriapatron.com.mx',
  ],
  // BARBERIA
  barberia: [
    'https://barberbarn.mx',
    'https://thegroomingmx.com',
    'https://hombredebarba.com',
    'https://barbermxshop.com',
    'https://barbermexicano.com',
    'https://lacuevadelosbarberos.com',
    'https://barbersmexicocity.com',
  ],
  // JOYERIA
  joyeria: [
    'https://www.tane.com.mx',
    'https://www.tousmx.com',
    'https://joyeriabizzarro.com',
    'https://joyeriatortuga.com.mx',
    'https://joyas-mexicanas.com',
    'https://platamexicana.com.mx',
    'https://joyeriaspeyer.com',
    'https://anandadesigns.mx',
  ],
  // FLORERIA
  floreria: [
    'https://floreriasanfrancisco.com.mx',
    'https://florerialacasita.com',
    'https://www.flores.com.mx',
    'https://floreriaonline.mx',
    'https://floralinda.mx',
    'https://elflorista.mx',
    'https://floreriabarranco.com',
    'https://floresenmexico.com',
  ],
  // MUEBLERIA
  muebleria: [
    'https://dico.com.mx',
    'https://mueblesdico.com',
    'https://muebleria-mx.com',
    'https://www.muebleslazaro.mx',
    'https://mueblesreyes.com.mx',
    'https://www.linhart.com.mx',
    'https://lasilladellugar.com',
    'https://nordicstudio.mx',
  ],
  // ELECTRONICA
  electronica: [
    'https://www.cyberpuerta.mx',
    'https://www.steren.com.mx',
    'https://www.gigantelectronicas.mx',
    'https://www.zona.com.mx',
    'https://www.compuventas.com.mx',
    'https://www.officemax.com.mx',
  ],
  // FARMACIA
  farmacia: [
    'https://www.farmaciasimilares.com.mx',
    'https://www.farmaciasanpablo.com.mx',
    'https://www.farmaciasdescuento.com.mx',
    'https://www.farmaciasahorro.com.mx',
  ],
  // HELADERIA
  heladeria: [
    'https://heladossantaclara.com',
    'https://heladossorbetto.com',
    'https://heladosthrifty.com.mx',
    'https://heladosrocha.com.mx',
  ],
  // SUSHI
  sushi: [
    'https://sushiroll.com.mx',
    'https://sushiitto.com.mx',
    'https://sushiko.com.mx',
    'https://www.takazushi.com',
    'https://www.miyabisushi.com',
  ],
  // CARNICERIA
  carniceria: [
    'https://www.elgranero.mx',
    'https://carnesarcoiris.mx',
    'https://www.charolais.mx',
    'https://www.delprado.mx',
  ],
  // ROPA
  ropa: [
    'https://www.elpalaciodehierro.com',
    'https://www.liverpool.com.mx',
    'https://www.dafiti.com.mx',
    'https://www.suburbia.com.mx',
    'https://www.benditafrida.com',
    'https://www.lacostina.com',
    'https://blackrabbit.mx',
    'https://elpopular.mx',
  ],
  // ZAPATERIA
  zapateria: [
    'https://www.dportenis.mx',
    'https://shop.snipes.mx',
    'https://innovasport.com',
    'https://martindelcampo.mx',
    'https://www.flexi.com.mx',
  ],
  // PAPELERIA
  papeleria: [
    'https://www.lumen.com.mx',
    'https://www.officemax.com.mx',
    'https://www.viatel.com.mx',
    'https://www.mascanalla.com',
  ],
  // LAVANDERIA
  lavanderia: [
    'https://www.tideproducts.com.mx',
    'https://supplymx.com',
    'https://mexlimpieza.com',
  ],
  // RESTAURANTE
  restaurante: [
    'https://www.kfc.com.mx',
    'https://www.elportondesanfrancisco.com',
    'https://www.toks.com.mx',
    'https://www.vips.com.mx',
  ],
  // TAQUERIA
  taqueria: [
    'https://www.tacosfunni.com',
    'https://tacosbros.com.mx',
    'https://taqueriahijomadre.com',
  ],
  // CAFETERIA
  cafeteria: [
    'https://www.cieloybeso.com',
    'https://wendys.com.mx',
    'https://shop.starbucks.com.mx',
    'https://www.cafeellipo.com',
  ],
  // FRUTERIA
  fruteria: [
    'https://www.frutaslaplaya.com.mx',
    'https://www.fruteriaslogo.com',
    'https://fruteriaonline.com.mx',
  ],
  // TORTILLERIA
  tortilleria: [
    'https://www.tortillaria.mx',
    'https://tortilleriapinole.com',
  ],
  // POLLERIA
  polleria: [
    'https://www.pollostampiquena.com.mx',
    'https://www.polloscampero.com.mx',
    'https://www.pollolocochilango.com',
  ],
  // PANADERIA (ya tiene 10)
  // PASTELERIA (ya tiene 10)
  // GIMNASIO (ya tiene 10)
  // TALLER MECANICO
  taller_mecanico: [
    'https://www.alfasai.com',
    'https://www.suministrosautomotrices.com.mx',
    'https://www.ckdmx.com',
  ],
  // JUGOS NATURALES
  jugos_naturales: [
    'https://www.jusi.com.mx',
    'https://www.elsr.com.mx',
    'https://jugosjoy.mx',
  ],
  // HAMBURGUESAS (ya tiene 10)
  // ABARROTES (ya tiene 10)
};

(async () => {
  console.log('═══ DISCOVER MX Shopify URLs ═══\n');
  const results = {};
  let totalTested = 0, totalFound = 0;

  for (const [giro, urls] of Object.entries(CANDIDATES)) {
    results[giro] = [];
    process.stdout.write(`\n[${giro}] `);
    for (const baseUrl of urls) {
      totalTested++;
      const u = baseUrl.replace(/\/$/, '') + '/products.json?limit=20';
      const r = await fetch(u, 5000);
      let count = 0;
      let isShopify = false;
      if (r.status === 200 && r.body) {
        try {
          const j = JSON.parse(r.body);
          if (Array.isArray(j.products)) {
            count = j.products.length;
            isShopify = true;
          }
        } catch(_){}
      }
      const flag = isShopify && count > 0 ? '✅' : '❌';
      const host = baseUrl.replace(/^https?:\/\//,'').replace(/\/$/,'').slice(0,28);
      process.stdout.write(`\n  ${flag} ${host.padEnd(30)} status=${r.status} prods=${count}`);
      if (isShopify && count > 0) {
        results[giro].push({ url: baseUrl, count });
        totalFound++;
      }
    }
  }

  console.log('\n\n═══ RESUMEN ═══');
  console.log(`Total testeado: ${totalTested}, exitosos: ${totalFound} (${Math.round(100*totalFound/totalTested)}%)`);
  console.log('');
  console.log('Giros con NUEVAS URLs Shopify funcionales:');
  for (const [giro, list] of Object.entries(results)) {
    if (list.length === 0) continue;
    console.log(`  ${giro}:`);
    list.forEach(r => console.log(`    ✅ ${r.url} → ${r.count} productos`));
  }
  // guardar resultado para usar después
  require('fs').writeFileSync(
    require('path').join(__dirname, 'mx-shopify-discovered.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Guardado en scripts/mx-shopify-discovered.json');
})();
