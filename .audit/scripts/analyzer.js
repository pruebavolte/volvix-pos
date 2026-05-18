// Analyzer: procesa raw-results.jsonl, hace CHECK 3 (semántico) y agrupa fails para fix
// El CHECK 4 (visual) lo hace Claude Code mirando los screenshots después

const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'raw-results.jsonl');
const ANALYZED = path.join(__dirname, '..', 'analyzed-results.jsonl');
const SUMMARY = path.join(__dirname, '..', 'analysis-summary.json');

const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

// Marca → categoría conceptual (usado para validar coherencia semántica heurística)
const BRAND_CATEGORY = {
  comandero:'alimentos', taqueria:'alimentos', restaurante:'alimentos', pizzeria:'alimentos', fonda:'alimentos',
  espuma:'alimentos', merengue:'alimentos', horno:'alimentos', nieve:'alimentos', limonero:'alimentos',
  marea:'alimentos', escama:'alimentos', corte:'alimentos', brasa:'alimentos', consome:'alimentos',
  trattoria:'alimentos', tasca:'alimentos', kappa:'alimentos', bibim:'alimentos', wokito:'alimentos',
  comedor:'alimentos', asado:'alimentos', hornito:'alimentos', grilla:'alimentos', despensa:'alimentos',
  velada:'alimentos', tortilla:'alimentos', caramelo:'alimentos',
  navaja:'belleza', brillo:'belleza',
  pulso:'salud', receta:'salud', armazon:'salud', dioptria:'salud', pupila:'salud',
  pata:'mascotas',
  pareo:'retail', mochila:'retail', asa:'retail', quilate:'retail', tictac:'retail',
  tacon:'retail', oxford:'retail', rebote:'retail', espuela:'retail', sudor:'retail', seda:'retail',
  corbata:'retail', accesorio:'retail', mueble:'retail', almohada:'retail', alacena:'retail',
  colgador:'retail', escritorio:'retail', linea_b:'retail', 'linea-b':'retail', trompito:'retail',
  movil:'retail', funda:'retail', torre:'retail', hilito:'retail',
  tendito:'retail', discreto:'retail',
  forja:'deporte', repe:'deporte',
  tarima:'entretenimiento', helio:'entretenimiento',
  refacciona:'auto', pulido:'auto', latonero:'auto', escape:'auto',
  chispa:'talleres', tueria:'talleres', watt:'talleres', viruta:'talleres',
  burbuja:'servicios', trapeador:'servicios', pulgon:'servicios', tapizado:'servicios',
  petalo:'retail', ramillete:'retail',
  bloque:'educacion', gateo:'educacion',
  folio:'profesionales',
};

function semanticCheck(result) {
  if (result.error || !result.data) return {pass:false, reason:'navegacion fallo', score:0};
  const {slug, finalUrl, query, category_expected, marca_premium_esperada_si_existiera, data} = result;
  const qN = norm(query);
  const slugN = norm(slug);
  const brandCategoryActual = BRAND_CATEGORY[slugN] || BRAND_CATEGORY[slugN.replace('-','_')] || 'desconocida';

  // 1. Coincidencia exact con marca esperada
  if (marca_premium_esperada_si_existiera && slugN === norm(marca_premium_esperada_si_existiera)) {
    return {pass:true, reason:'match exacto con marca esperada', score:100, brand_category:brandCategoryActual};
  }

  // 2. Coincidencia de categoría
  if (category_expected && brandCategoryActual === category_expected) {
    return {pass:true, reason:'misma categoría que esperada', score:80, brand_category:brandCategoryActual};
  }

  // 3. Match de palabras del query en h1/eyebrow/deck/features/thefts
  const haystack = norm([
    data.h1, data.eyebrow, data.deck, data.brandName,
    ...(data.firstParagraphs || []),
    ...(data.features || []),
    ...(data.thefts || []),
  ].join(' '));

  const qWords = qN.split(/\s+/).filter(w=>w.length>3);
  if (qWords.length === 0) {
    // Query muy corta — pasa si no es plano
    return {pass: !result.error && result.check2, reason:'query corto, check basico', score:50, brand_category:brandCategoryActual};
  }
  const matches = qWords.filter(w => haystack.includes(w));
  const matchRatio = matches.length / qWords.length;

  if (matchRatio >= 0.5) {
    return {pass:true, reason:`${matches.length}/${qWords.length} keywords match en contenido`, score: Math.round(50+matchRatio*40), brand_category:brandCategoryActual};
  }

  // 4. Si categoría destino es genérica (tendito, folio) y query no especifica, aceptable
  if ((slugN === 'tendito' || slugN === 'folio') && qN.length < 15) {
    return {pass:true, reason:'fallback genérico aceptable para query corta', score:60, brand_category:brandCategoryActual};
  }

  // FAIL semántico
  return {
    pass: false,
    reason: `categoría destino (${brandCategoryActual}) != esperada (${category_expected || '?'})`,
    score: Math.round(matchRatio*50),
    brand_category: brandCategoryActual,
    actual_haystack_preview: haystack.slice(0,200)
  };
}

// Load all raw results
const lines = fs.readFileSync(RAW, 'utf8').split('\n').filter(Boolean);
const results = lines.map(l => { try { return JSON.parse(l); } catch(e){ return null; } }).filter(Boolean);
console.log(`Loaded ${results.length} raw results`);

// Analyze each
const analyzed = [];
const stats = { total:0, pass_all:0, fail_check1:0, fail_check2:0, fail_check3:0, error:0, has_screenshot:0 };
const fails_by_dest = {};
const fails_by_category = {};
const samples_per_brand = {};

for (const r of results) {
  stats.total++;
  if (r.error) { stats.error++; continue; }

  const sem = semanticCheck(r);
  const allPass = r.check1 && r.check2 && sem.pass;

  const a = {
    rank: r.rank, query: r.query, slug: r.slug, finalUrl: r.finalUrl,
    check1: r.check1, check2: r.check2, check3: sem.pass,
    semantic: sem,
    screenshotPath: r.screenshotPath,
    elapsedMs: r.elapsedMs,
    error: r.error,
    pass: allPass,
    category_expected: r.category_expected,
    marca_premium_esperada: r.marca_premium_esperada_si_existiera
  };
  analyzed.push(a);

  if (!r.check1) stats.fail_check1++;
  if (!r.check2) stats.fail_check2++;
  if (!sem.pass) stats.fail_check3++;
  if (allPass) stats.pass_all++;
  if (r.screenshotPath) stats.has_screenshot++;

  // Sample for visual check
  if (!samples_per_brand[r.slug]) samples_per_brand[r.slug] = [];
  if (samples_per_brand[r.slug].length < 3 && r.screenshotPath) {
    samples_per_brand[r.slug].push({query: r.query, screenshotPath: r.screenshotPath});
  }

  // Group fails for fix
  if (!sem.pass) {
    if (!fails_by_dest[r.slug]) fails_by_dest[r.slug] = [];
    fails_by_dest[r.slug].push({q: r.query, exp_cat: r.category_expected, exp_brand: r.marca_premium_esperada_si_existiera, reason: sem.reason});
    if (!fails_by_category[r.category_expected]) fails_by_category[r.category_expected] = 0;
    fails_by_category[r.category_expected]++;
  }
}

fs.writeFileSync(ANALYZED, analyzed.map(a=>JSON.stringify(a)).join('\n')+'\n');

const summary = {
  timestamp: new Date().toISOString(),
  stats,
  pct_pass: Math.round((stats.pass_all / stats.total) * 1000) / 10,
  pct_check1: Math.round((1 - stats.fail_check1/stats.total) * 1000) / 10,
  pct_check2: Math.round((1 - stats.fail_check2/stats.total) * 1000) / 10,
  pct_check3: Math.round((1 - stats.fail_check3/stats.total) * 1000) / 10,
  fails_by_category,
  fails_by_dest_count: Object.fromEntries(Object.entries(fails_by_dest).map(([k,v])=>[k,v.length])),
  top_failed_dests: Object.entries(fails_by_dest).sort((a,b)=>b[1].length-a[1].length).slice(0,15).map(([dest,fails])=>({dest, count:fails.length, samples: fails.slice(0,3)})),
  samples_per_brand_for_visual_check: Object.fromEntries(
    Object.entries(samples_per_brand).slice(0,30)
  ),
};
fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
